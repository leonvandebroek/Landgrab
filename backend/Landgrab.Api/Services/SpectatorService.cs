using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

/// <summary>
/// Spectators watch a room without being a player in it: they are tracked per connection, apart from
/// <see cref="GameRoom.ConnectionMap"/>, so every player-facing lookup keeps treating them as "not in a room".
/// </summary>
public class SpectatorService(
    RoomService roomService,
    GameStateService gameStateService,
    IConfiguration configuration)
{
    public const int MaxSpectatorConnections = 20;
    public const int WatchCodeLength = 8;
    private const int MaxJoinAttemptsPerMinute = 10;
    private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    // Reverse index: spectator connectionId → roomCode.
    private readonly ConcurrentDictionary<string, string> _connectionRoomIndex = new();
    private readonly ConcurrentDictionary<string, (DateTime windowStart, int count)> _joinAttempts = new();
    private readonly byte[] _key = SHA256.HashData(Encoding.UTF8.GetBytes(
        "landgrab-watch-code|" + (configuration["Jwt:Secret"]
            ?? throw new InvalidOperationException("Jwt:Secret is not configured."))));

    /// <summary>The room a spectator connection is watching, or <see langword="null"/>.</summary>
    public GameRoom? GetRoomByConnection(string connectionId) =>
        _connectionRoomIndex.TryGetValue(connectionId, out var code) ? roomService.GetRoom(code) : null;

    public bool IsSpectatorConnection(string connectionId) => _connectionRoomIndex.ContainsKey(connectionId);

    /// <summary>
    /// The watch code for a room. Derived, not stored, so it survives a restart and never travels in the
    /// game state. Changing the room's spectator epoch changes the code.
    /// </summary>
    public string GetWatchCode(GameRoom room)
    {
        var createdAtSeconds = new DateTimeOffset(DateTime.SpecifyKind(room.CreatedAt, DateTimeKind.Utc)).ToUnixTimeSeconds();
        var material = $"{room.Code.ToUpperInvariant()}|{createdAtSeconds}|{room.State.SpectatorEpoch}";
        var hash = HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes(material));
        var chars = new char[WatchCodeLength];
        for (var i = 0; i < WatchCodeLength; i++)
            chars[i] = CodeAlphabet[hash[i] % CodeAlphabet.Length];
        return new string(chars);
    }

    /// <summary>Strips separators and case so "abcd-efgh" and "ABCDEFGH" are the same code.</summary>
    public static string NormalizeWatchCode(string? watchCode) =>
        new((watchCode ?? string.Empty).Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());

    public (GameState? state, IReadOnlyList<string> removedConnectionIds, string? error) SetEnabled(
        string roomCode, string userId, bool enabled)
    {
        var room = roomService.GetRoom(roomCode);
        if (room == null)
            return (null, [], "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, [], "Only the host can change spectator settings.");

            IReadOnlyList<string> removed = [];
            if (room.State.SpectatorsEnabled != enabled)
            {
                room.State.SpectatorsEnabled = enabled;
                if (!enabled)
                {
                    // Turning it off also retires the code, so an old link cannot come back to life.
                    room.State.SpectatorEpoch++;
                    removed = RemoveAllLocked(room);
                }
            }

            var snapshot = GameStateCommon.SnapshotState(room.State);
            gameStateService.QueuePersistence(room, snapshot);
            return (snapshot, removed, null);
        }
    }

    public (GameState? state, IReadOnlyList<string> removedConnectionIds, string? error) RegenerateWatchCode(
        string roomCode, string userId)
    {
        var room = roomService.GetRoom(roomCode);
        if (room == null)
            return (null, [], "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, [], "Only the host can change spectator settings.");
            if (!room.State.SpectatorsEnabled)
                return (null, [], "Spectators are not allowed in this room.");

            room.State.SpectatorEpoch++;
            var removed = RemoveAllLocked(room);
            var snapshot = GameStateCommon.SnapshotState(room.State);
            gameStateService.QueuePersistence(room, snapshot);
            return (snapshot, removed, null);
        }
    }

    public (GameRoom? room, string? error) Join(string? watchCode, string userId, string username, string connectionId)
    {
        if (!TryRegisterJoinAttempt(userId))
            return (null, "Too many attempts. Wait a minute and try again.");

        var normalized = NormalizeWatchCode(watchCode);
        if (normalized.Length != WatchCodeLength)
            return (null, "That watch code is not valid.");

        if (roomService.GetRoomByConnection(connectionId) != null)
            return (null, "Leave your current room before watching another one.");

        var candidateBytes = Encoding.UTF8.GetBytes(normalized);
        foreach (var room in roomService.GetRoomsSnapshot())
        {
            lock (room.SyncRoot)
            {
                if (!room.State.SpectatorsEnabled)
                    continue;

                var expected = Encoding.UTF8.GetBytes(GetWatchCode(room));
                if (!CryptographicOperations.FixedTimeEquals(expected, candidateBytes))
                    continue;

                if (room.State.Players.Any(player => player.Id == userId))
                    return (null, "Players in this game cannot watch it.");

                if (!room.SpectatorConnections.ContainsKey(connectionId)
                    && room.SpectatorConnections.Count >= MaxSpectatorConnections)
                    return (null, "This game already has the maximum number of spectators.");

                // One connection watches one room.
                if (_connectionRoomIndex.TryGetValue(connectionId, out var previousCode)
                    && !string.Equals(previousCode, room.Code, StringComparison.Ordinal))
                {
                    roomService.GetRoom(previousCode)?.SpectatorConnections.TryRemove(connectionId, out _);
                }

                room.SpectatorConnections[connectionId] = new SpectatorConnection(userId, username);
                _connectionRoomIndex[connectionId] = room.Code;
                return (room, null);
            }
        }

        return (null, "That watch code is not valid.");
    }

    /// <summary>Removes one spectator connection. Returns the room it was watching, if any.</summary>
    public GameRoom? Leave(string connectionId)
    {
        if (!_connectionRoomIndex.TryRemove(connectionId, out var code))
            return null;

        var room = roomService.GetRoom(code);
        room?.SpectatorConnections.TryRemove(connectionId, out _);
        return room;
    }

    /// <summary>Host removes one spectator (all of that account's connections).</summary>
    public (IReadOnlyList<string> removedConnectionIds, string? error) RemoveSpectator(
        string roomCode, string userId, string targetUserId)
    {
        var room = roomService.GetRoom(roomCode);
        if (room == null)
            return ([], "Room not found.");
        if (!GameStateCommon.IsHost(room, userId))
            return ([], "Only the host can remove spectators.");

        return (RemoveUser(room, targetUserId), null);
    }

    /// <summary>Drops every spectator connection of one account, for example when it becomes a player.</summary>
    public IReadOnlyList<string> RemoveUser(GameRoom room, string userId)
    {
        var removed = new List<string>();
        foreach (var (connectionId, spectator) in room.SpectatorConnections)
        {
            if (spectator.UserId != userId)
                continue;
            if (room.SpectatorConnections.TryRemove(connectionId, out _))
            {
                _connectionRoomIndex.TryRemove(connectionId, out _);
                removed.Add(connectionId);
            }
        }

        return removed;
    }

    /// <summary>Drops spectators that are also players. Run when a game starts, as a second line of defence.</summary>
    public IReadOnlyList<string> RemovePlayersFromSpectators(GameRoom room)
    {
        HashSet<string> playerIds;
        lock (room.SyncRoot)
            playerIds = room.State.Players.Select(player => player.Id).ToHashSet(StringComparer.Ordinal);

        var removed = new List<string>();
        foreach (var userId in room.SpectatorConnections.Values.Select(s => s.UserId).Distinct().ToList())
        {
            if (playerIds.Contains(userId))
                removed.AddRange(RemoveUser(room, userId));
        }

        return removed;
    }

    public (SpectatorInfoDto? info, string? error) GetInfo(string roomCode, string userId)
    {
        var room = roomService.GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");
        if (!GameStateCommon.IsHost(room, userId))
            return (null, "Only the host can see spectator settings.");

        return (BuildInfo(room), null);
    }

    /// <summary>Host-only view of spectating. Contains the watch code: never send it to anyone else.</summary>
    public SpectatorInfoDto BuildInfo(GameRoom room)
    {
        lock (room.SyncRoot)
        {
            var enabled = room.State.SpectatorsEnabled;
            return new SpectatorInfoDto
            {
                Enabled = enabled,
                WatchCode = enabled ? GetWatchCode(room) : null,
                Spectators = room.SpectatorConnections.Values
                    .GroupBy(spectator => spectator.UserId, StringComparer.Ordinal)
                    .Select(group => new SpectatorDto { UserId = group.Key, Name = group.First().Name })
                    .OrderBy(spectator => spectator.Name, StringComparer.OrdinalIgnoreCase)
                    .ToList()
            };
        }
    }

    private List<string> RemoveAllLocked(GameRoom room)
    {
        var removed = new List<string>();
        foreach (var connectionId in room.SpectatorConnections.Keys.ToList())
        {
            if (room.SpectatorConnections.TryRemove(connectionId, out _))
            {
                _connectionRoomIndex.TryRemove(connectionId, out _);
                removed.Add(connectionId);
            }
        }

        return removed;
    }

    private bool TryRegisterJoinAttempt(string userId)
    {
        var now = DateTime.UtcNow;
        var entry = _joinAttempts.AddOrUpdate(
            userId,
            _ => (now, 1),
            (_, current) => now - current.windowStart > TimeSpan.FromMinutes(1)
                ? (now, 1)
                : (current.windowStart, current.count + 1));

        if (_joinAttempts.Count > 5000)
        {
            foreach (var (key, value) in _joinAttempts)
            {
                if (now - value.windowStart > TimeSpan.FromMinutes(1))
                    _joinAttempts.TryRemove(key, out _);
            }
        }

        return entry.count <= MaxJoinAttemptsPerMinute;
    }
}
