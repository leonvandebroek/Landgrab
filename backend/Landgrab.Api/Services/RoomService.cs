using System.Collections.Concurrent;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class RoomService(RoomPersistenceService roomPersistenceService, ILogger<RoomService> logger) : IGameRoomProvider
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();

    private static int DefaultGridRadius => LobbyService.DefaultGridRadius;
    private static int DefaultTileSizeMeters => LobbyService.DefaultTileSizeMeters;
    private static int MaxFootprintMeters => LobbyService.MaxFootprintMeters;
    private static string[] Colors => LobbyService.Colors;
    private static Dictionary<string, HexCell> BuildGridForState(GameState state) => LobbyService.BuildGridForState(state);
    private static int GetAllowedTileSizeMeters(IEnumerable<(int q, int r)> coordinates, int requestedMeters, int maxFootprintMeters) =>
        LobbyService.GetAllowedTileSizeMeters(coordinates, requestedMeters, maxFootprintMeters);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private static void ReturnCarriedTroops(GameState state, PlayerDto player) => GameplayService.ReturnCarriedTroops(state, player);

    private void QueuePersistence(GameRoom room, GameState stateSnapshot)
    {
        var roomCode = room.Code;
        var hostUserId = room.HostUserId;
        var createdAt = room.CreatedAt;
        var persistedAt = DateTime.UtcNow;

        _ = Task.Run(async () =>
        {
            try
            {
                await roomPersistenceService.PersistRoomStateAsync(
                    roomCode,
                    hostUserId,
                    createdAt,
                    stateSnapshot,
                    persistedAt);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to persist room state for {RoomCode}", roomCode);
            }
        });
    }

    public GameRoom CreateRoom(string hostUserId, string hostUsername, string connectionId)
    {
        var code = GenerateCode();
        var room = new GameRoom
        {
            Code = code,
            HostUserId = Guid.Parse(hostUserId)
        };

        room.ConnectionMap.TryAdd(connectionId, hostUserId);
        room.State.RoomCode = code;
        room.State.GridRadius = DefaultGridRadius;
        room.State.GameAreaMode = GameAreaMode.Centered;
        room.State.Grid = BuildGridForState(room.State);
        room.State.TileSizeMeters = GetAllowedTileSizeMeters(room.State.Grid.Values.Select(cell => (cell.Q, cell.R)), DefaultTileSizeMeters,
            room.State.MaxFootprintMetersOverride ?? MaxFootprintMeters);
        room.State.Players.Add(new PlayerDto
        {
            Id = hostUserId,
            Name = hostUsername,
            Color = Colors[0],
            IsHost = true
        });

        _rooms[code] = room;
        QueuePersistence(room, SnapshotState(room.State));
        return room;
    }

    public (GameRoom? room, string? error) JoinRoom(string roomCode, string userId,
        string username, string connectionId)
    {
        if (!_rooms.TryGetValue(roomCode.ToUpperInvariant(), out var room))
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var existingPlayer = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (existingPlayer != null)
            {
                var staleConnections = room.ConnectionMap
                    .Where(kv => kv.Value == userId)
                    .Select(kv => kv.Key)
                    .ToList();

                foreach (var stale in staleConnections)
                    room.ConnectionMap.TryRemove(stale, out _);

                room.ConnectionMap.TryAdd(connectionId, userId);
                existingPlayer.IsConnected = true;
                QueuePersistence(room, SnapshotState(room.State));
                return (room, null);
            }

            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Game already in progress.");

            if (room.State.Players.Count >= 30)
                return (null, "Room is full (max 30 players).");

            var colorIndex = room.State.Players.Count % Colors.Length;
            room.State.Players.Add(new PlayerDto
            {
                Id = userId,
                Name = username,
                Color = Colors[colorIndex]
            });

            room.ConnectionMap.TryAdd(connectionId, userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "PlayerJoined",
                Message = $"{username} joined the room.",
                PlayerId = userId,
                PlayerName = username
            });
            QueuePersistence(room, SnapshotState(room.State));
            return (room, null);
        }
    }

    public GameRoom? GetRoom(string code) =>
        _rooms.TryGetValue(code.ToUpperInvariant(), out var room) ? room : null;

    public GameState? GetStateSnapshot(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return null;

        lock (room.SyncRoot)
            return SnapshotState(room.State);
    }

    public GameRoom? GetRoomByConnection(string connectionId) =>
        _rooms.Values.FirstOrDefault(room => room.ConnectionMap.ContainsKey(connectionId));

    public GameRoom? GetRoomByUserId(string userId, string? roomCode = null)
    {
        if (!string.IsNullOrWhiteSpace(roomCode))
        {
            var room = GetRoom(roomCode);
            if (room == null)
                return null;

            lock (room.SyncRoot)
            {
                return room.State.Phase != GamePhase.GameOver &&
                       room.State.Players.Any(player => player.Id == userId)
                    ? room
                    : null;
            }
        }

        foreach (var room in _rooms.Values)
        {
            lock (room.SyncRoot)
            {
                if (room.State.Phase != GamePhase.GameOver &&
                    room.State.Players.Any(player => player.Id == userId))
                    return room;
            }
        }

        return null;
    }

    public int RestoreRooms(IEnumerable<GameRoom> rooms)
    {
        ArgumentNullException.ThrowIfNull(rooms);

        var restoredCount = 0;
        foreach (var room in rooms)
        {
            if (string.IsNullOrWhiteSpace(room.Code))
            {
                logger.LogWarning("Skipping restored room with an empty room code.");
                continue;
            }

            var normalizedCode = room.Code.ToUpperInvariant();
            lock (room.SyncRoot)
            {
                room.Code = normalizedCode;
                room.State.RoomCode = normalizedCode;
                room.ConnectionMap.Clear();
                room.State.TileSizeMeters = GetAllowedTileSizeMeters(
                    room.State.Grid.Values.Select(cell => (cell.Q, cell.R)),
                    room.State.TileSizeMeters,
                    room.State.MaxFootprintMetersOverride ?? MaxFootprintMeters);

                foreach (var player in room.State.Players)
                    player.IsConnected = false;
            }

            if (_rooms.TryAdd(normalizedCode, room))
            {
                QueuePersistence(room, SnapshotState(room.State));
                restoredCount++;
                continue;
            }

            logger.LogWarning("Skipping restored room {RoomCode} because it already exists in memory.",
                normalizedCode);
        }

        return restoredCount;
    }

    public IReadOnlyList<RoomSummaryDto> GetRoomsForUser(string userId)
    {
        var result = new List<RoomSummaryDto>();
        foreach (var room in _rooms.Values)
        {
            lock (room.SyncRoot)
            {
                if (room.State.Phase == GamePhase.GameOver)
                    continue;

                var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
                if (player == null)
                    continue;

                var host = room.State.Players.FirstOrDefault(p => p.IsHost);
                result.Add(new RoomSummaryDto
                {
                    Code = room.Code,
                    Phase = room.State.Phase,
                    PlayerCount = room.State.Players.Count,
                    IsConnected = player.IsConnected,
                    HostName = host?.Name ?? "",
                    CreatedAt = room.CreatedAt
                });
            }
        }

        return result
            .OrderByDescending(room => room.IsConnected)
            .ThenByDescending(room => room.CreatedAt)
            .ToList();
    }

    public IReadOnlyList<string> GetPlayingRoomCodes()
    {
        var roomCodes = new List<string>();
        foreach (var room in _rooms.Values)
        {
            lock (room.SyncRoot)
            {
                if (room.State.Phase == GamePhase.Playing)
                    roomCodes.Add(room.Code);
            }
        }

        return roomCodes;
    }

    public void RemoveConnection(GameRoom room, string connectionId, bool returnedToLobby = false)
    {
        if (!room.ConnectionMap.TryRemove(connectionId, out var userId))
            return;

        lock (room.SyncRoot)
        {
            if (room.ConnectionMap.Values.Contains(userId))
                return;

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return;

            player.IsConnected = false;
            player.CurrentLat = null;
            player.CurrentLng = null;
            ReturnCarriedTroops(room.State, player);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = returnedToLobby ? "PlayerReturnedToLobby" : "PlayerLeft",
                Message = returnedToLobby
                    ? $"{player.Name} returned to the lobby."
                    : $"{player.Name} left the room.",
                PlayerId = player.Id,
                PlayerName = player.Name
            });
            QueuePersistence(room, SnapshotState(room.State));
        }
    }

    private static string GenerateCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 6)
            .Select(_ => chars[Random.Shared.Next(chars.Length)])
            .ToArray());
    }
}
