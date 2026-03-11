using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using Landgrab.Api.Data;
using Landgrab.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Services;

public sealed class RoomPersistenceService(
    IServiceScopeFactory scopeFactory,
    ILogger<RoomPersistenceService> logger)
{
    private readonly ConcurrentDictionary<string, RoomWriteLock> roomWriteLocks = new(StringComparer.OrdinalIgnoreCase);
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    public Task PersistRoomAsync(GameRoom room, CancellationToken cancellationToken = default)
    {
        PersistedRoom persistedRoom;
        lock (room.SyncRoot)
        {
            persistedRoom = CreatePersistedRoom(room.Code, room.HostUserId, room.CreatedAt, room.State, DateTime.UtcNow);
        }

        return PersistSerializedAsync(persistedRoom, cancellationToken);
    }

    public async Task PersistRoomStateAsync(string roomCode, Guid hostUserId, DateTime createdAt,
        GameState state, DateTime queuedAt, CancellationToken cancellationToken = default)
    {
        try
        {
            await Task.Yield();
            var persistedRoom = CreatePersistedRoom(roomCode, hostUserId, createdAt, state, queuedAt);
            await PersistSerializedAsync(persistedRoom, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to queue persistence for room {RoomCode}.", roomCode);
        }
    }

    public async Task DeactivateRoomAsync(string roomCode, CancellationToken cancellationToken = default)
    {
        var normalizedCode = roomCode.ToUpperInvariant();
        var roomLock = await AcquireRoomLockAsync(normalizedCode, cancellationToken);

        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var persistedRoom = await db.PersistedRooms.FindAsync([normalizedCode], cancellationToken);
            if (persistedRoom == null)
                return;

            persistedRoom.IsActive = false;
            persistedRoom.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to deactivate persisted room {RoomCode}.", roomCode);
        }
        finally
        {
            RetireRoomLock(normalizedCode, roomLock);
            ReleaseRoomLock(normalizedCode, roomLock);
        }
    }

    public async Task<int> DeactivateStaleRoomsAsync(TimeSpan? maxAge = null, CancellationToken cancellationToken = default)
    {
        var cutoff = DateTime.UtcNow - (maxAge ?? TimeSpan.FromHours(24));

        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var staleRoomCodes = await db.PersistedRooms
                .Where(room => room.IsActive && room.UpdatedAt < cutoff)
                .Select(room => room.Code)
                .ToListAsync(cancellationToken);

            if (staleRoomCodes.Count == 0)
                return 0;

            foreach (var roomCode in staleRoomCodes)
            {
                await DeactivateRoomAsync(roomCode, cancellationToken);
            }

            return staleRoomCodes.Count;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to deactivate stale persisted rooms older than {Cutoff}.", cutoff);
            return 0;
        }
    }

    public async Task<IReadOnlyList<GameRoom>> RestoreActiveRoomsAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var persistedRooms = await db.PersistedRooms
                .AsNoTracking()
                .Where(room => room.IsActive)
                .OrderBy(room => room.CreatedAt)
                .ToListAsync(cancellationToken);

            var restoredRooms = new List<GameRoom>(persistedRooms.Count);
            foreach (var persistedRoom in persistedRooms)
            {
                try
                {
                    var state = JsonSerializer.Deserialize<GameState>(persistedRoom.StateJson, SerializerOptions);
                    if (state == null)
                    {
                        logger.LogWarning("Skipping persisted room {RoomCode} because state JSON deserialized to null.",
                            persistedRoom.Code);
                        continue;
                    }

                    state.RoomCode = persistedRoom.Code;
                    if (state.Grid.Count == 0)
                        state.Grid = HexService.BuildGrid(state.GridRadius);

                    foreach (var player in state.Players)
                    {
                        player.IsConnected = false;
                        player.CurrentLat = null;
                        player.CurrentLng = null;
                    }

                    restoredRooms.Add(new GameRoom
                    {
                        Code = persistedRoom.Code,
                        HostUserId = persistedRoom.HostUserId,
                        State = state,
                        CreatedAt = persistedRoom.CreatedAt
                    });
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Failed to restore persisted room {RoomCode}.", persistedRoom.Code);
                }
            }

            return restoredRooms;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to restore persisted rooms from the database.");
            return [];
        }
    }

    private async Task UpsertRoomAsync(PersistedRoom persistedRoom, CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var existing = await db.PersistedRooms.FindAsync([persistedRoom.Code], cancellationToken);

            if (existing == null)
            {
                db.PersistedRooms.Add(persistedRoom);
            }
            else
            {
                if (existing.UpdatedAt > persistedRoom.UpdatedAt)
                    return;

                existing.HostUserId = persistedRoom.HostUserId;
                existing.StateJson = persistedRoom.StateJson;
                existing.Phase = persistedRoom.Phase;
                existing.IsActive = persistedRoom.IsActive;
                existing.CreatedAt = persistedRoom.CreatedAt;
                existing.UpdatedAt = persistedRoom.UpdatedAt;
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Failed to persist room {RoomCode} in phase {Phase} (active={IsActive}).",
                persistedRoom.Code, persistedRoom.Phase, persistedRoom.IsActive);
        }
    }

    private async Task PersistSerializedAsync(PersistedRoom persistedRoom, CancellationToken cancellationToken)
    {
        var roomLock = await AcquireRoomLockAsync(persistedRoom.Code, cancellationToken);
        try
        {
            await UpsertRoomAsync(persistedRoom, cancellationToken);
        }
        finally
        {
            if (!persistedRoom.IsActive)
                RetireRoomLock(persistedRoom.Code, roomLock);

            ReleaseRoomLock(persistedRoom.Code, roomLock);
        }
    }

    private async Task<RoomWriteLock> AcquireRoomLockAsync(string roomCode, CancellationToken cancellationToken)
    {
        var normalizedCode = roomCode.ToUpperInvariant();

        while (true)
        {
            var roomLock = roomWriteLocks.GetOrAdd(normalizedCode, static _ => new RoomWriteLock());
            if (!roomLock.TryAcquireLease())
            {
                TryRemoveRetiredRoomLock(normalizedCode, roomLock);
                await Task.Yield();
                continue;
            }

            try
            {
                await roomLock.Semaphore.WaitAsync(cancellationToken);
                return roomLock;
            }
            catch
            {
                ReleaseRoomLease(normalizedCode, roomLock);
                throw;
            }
        }
    }

    private void ReleaseRoomLock(string roomCode, RoomWriteLock roomLock)
    {
        roomLock.Semaphore.Release();
        ReleaseRoomLease(roomCode, roomLock);
    }

    private void ReleaseRoomLease(string roomCode, RoomWriteLock roomLock)
    {
        roomLock.ReleaseLease();
        TryRemoveRetiredRoomLock(roomCode, roomLock);
    }

    private void RetireRoomLock(string roomCode, RoomWriteLock roomLock)
    {
        roomLock.Retire();
        TryRemoveRetiredRoomLock(roomCode, roomLock);
    }

    private void TryRemoveRetiredRoomLock(string roomCode, RoomWriteLock roomLock)
    {
        if (!roomLock.IsRetired || roomLock.LeaseCount != 0)
            return;

        if (!roomWriteLocks.TryRemove(new KeyValuePair<string, RoomWriteLock>(roomCode, roomLock)))
            return;

        roomLock.Semaphore.Dispose();
    }

    private static PersistedRoom CreatePersistedRoom(string roomCode, Guid hostUserId, DateTime createdAt, GameState state, DateTime updatedAt)
    {
        var normalizedCode = roomCode.ToUpperInvariant();
        return new PersistedRoom
        {
            Code = normalizedCode,
            HostUserId = hostUserId,
            StateJson = JsonSerializer.Serialize(state, SerializerOptions),
            Phase = state.Phase.ToString(),
            IsActive = state.Phase != GamePhase.GameOver,
            CreatedAt = createdAt,
            UpdatedAt = updatedAt
        };
    }

    private sealed class RoomWriteLock
    {
        public SemaphoreSlim Semaphore { get; } = new(1, 1);

        private int leaseCount;
        private int retired;

        public int LeaseCount => Volatile.Read(ref leaseCount);
        public bool IsRetired => Volatile.Read(ref retired) != 0;

        public bool TryAcquireLease()
        {
            while (true)
            {
                if (IsRetired)
                    return false;

                var currentLeaseCount = Volatile.Read(ref leaseCount);
                if (Interlocked.CompareExchange(ref leaseCount, currentLeaseCount + 1, currentLeaseCount) != currentLeaseCount)
                    continue;

                if (!IsRetired)
                    return true;

                ReleaseLease();
                return false;
            }
        }

        public void ReleaseLease()
        {
            Interlocked.Decrement(ref leaseCount);
        }

        public void Retire()
        {
            Interlocked.Exchange(ref retired, 1);
        }
    }
}
