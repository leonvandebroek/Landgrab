using System.Collections.Concurrent;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class RoomService(RoomPersistenceService roomPersistenceService, ILogger<RoomService> logger) : IGameRoomProvider
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();

    private static int DefaultGridRadius => GameStateCommon.DefaultGridRadius;
    private static int DefaultTileSizeMeters => GameStateCommon.DefaultTileSizeMeters;
    private static int MaxFootprintMeters => GameStateCommon.MaxFootprintMeters;
    private static string[] Colors => GameStateCommon.Colors;
    private static string[] PlayerEmojis => GameStateCommon.PlayerEmojis;
    private static Dictionary<string, HexCell> BuildGridForState(GameState state) => GameStateCommon.BuildGridForState(state);
    private static int GetAllowedTileSizeMeters(IEnumerable<(int q, int r)> coordinates, int requestedMeters, int maxFootprintMeters) =>
        GameStateCommon.GetAllowedTileSizeMeters(coordinates, requestedMeters, maxFootprintMeters);
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
            Emoji = GetPlayerEmoji(0),
            IsHost = true
        });

        _rooms[code] = room;
        QueuePersistence(room, SnapshotState(room.State));
        return room;
    }

    public GameRoom CreateScenarioRoom(string hostUserId, InjectScenarioRequest req)
    {
        var code = GenerateCode();
        var room = new GameRoom
        {
            Code = code,
            HostUserId = Guid.TryParse(hostUserId, out var hostGuid) ? hostGuid : Guid.NewGuid()
        };

        room.State.RoomCode = code;
        room.State.MapLat = req.MapLat;
        room.State.MapLng = req.MapLng;
        room.State.GridRadius = req.GridRadius;
        room.State.HostBypassGps = req.HostBypassGps;
        room.State.Dynamics = req.Dynamics ?? new GameDynamics();
        room.State.Grid = BuildGridForState(room.State);
        room.State.TileSizeMeters = GetAllowedTileSizeMeters(
            room.State.Grid.Values.Select(c => (c.Q, c.R)),
            req.TileSizeMeters,
            room.State.MaxFootprintMetersOverride ?? MaxFootprintMeters);

        // Build alliances from the distinct names in the player list
        var allianceNames = req.Players.Select(p => p.AllianceName).Distinct().ToList();
        for (var i = 0; i < allianceNames.Count; i++)
        {
            room.State.Alliances.Add(new AllianceDto
            {
                Id = Guid.NewGuid().ToString(),
                Name = allianceNames[i],
                Color = GameStateCommon.AllianceColors[i % GameStateCommon.AllianceColors.Length]
            });
        }

        // Add players
        for (var i = 0; i < req.Players.Count; i++)
        {
            var spec = req.Players[i];
            var alliance = room.State.Alliances.FirstOrDefault(a => a.Name == spec.AllianceName);
            if (alliance != null && !alliance.MemberIds.Contains(spec.UserId))
                alliance.MemberIds.Add(spec.UserId);

            Enum.TryParse<PlayerRole>(spec.Role, out var role);

            int? currentHexQ = null;
            int? currentHexR = null;
            if (spec.Lat.HasValue && spec.Lng.HasValue)
            {
                var currentHex = HexService.LatLngToHexForRoom(
                    spec.Lat.Value,
                    spec.Lng.Value,
                    req.MapLat,
                    req.MapLng,
                    req.TileSizeMeters);
                currentHexQ = currentHex.q;
                currentHexR = currentHex.r;
            }

            room.State.Players.Add(new PlayerDto
            {
                Id = spec.UserId,
                Name = spec.Username,
                Color = Colors[i % Colors.Length],
                Emoji = GetPlayerEmoji(i),
                IsHost = spec.UserId == hostUserId,
                AllianceId = alliance?.Id,
                AllianceName = alliance?.Name,
                AllianceColor = alliance?.Color,
                CarriedTroops = spec.CarriedTroops,
                CurrentLat = spec.Lat,
                CurrentLng = spec.Lng,
                CurrentHexQ = currentHexQ,
                CurrentHexR = currentHexR,
                IsConnected = false,
                Role = role
            });
        }

        // Apply hex overrides (ownership, troop counts, forts, master tile)
        if (req.HexOverrides != null)
        {
            foreach (var ovr in req.HexOverrides)
            {
                var key = HexService.Key(ovr.Q, ovr.R);
                if (!room.State.Grid.TryGetValue(key, out var cell))
                    continue;

                if (ovr.IsMasterTile)
                {
                    cell.IsMasterTile = true;
                    room.State.MasterTileQ = ovr.Q;
                    room.State.MasterTileR = ovr.R;
                }

                if (ovr.OwnerPlayerId != null)
                {
                    var owner = room.State.Players.FirstOrDefault(p => p.Id == ovr.OwnerPlayerId);
                    if (owner != null)
                    {
                        var ownerAlliance = room.State.Alliances.FirstOrDefault(a => a.Id == owner.AllianceId);
                        cell.OwnerId = owner.Id;
                        cell.OwnerAllianceId = owner.AllianceId;
                        cell.OwnerName = owner.Name;
                        cell.OwnerColor = ownerAlliance?.Color ?? owner.Color;
                    }
                }

                cell.Troops = ovr.Troops;
                cell.IsFort = ovr.IsFort;
            }
        }

        GameplayService.RefreshTerritoryCount(room.State);

        room.State.Phase = GamePhase.Playing;
        room.State.GameStartedAt = DateTime.UtcNow;

        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "GameStarted",
            Message = "Playtest scenario injected.",
            PlayerId = hostUserId
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
                if (string.IsNullOrWhiteSpace(existingPlayer.Emoji))
                    existingPlayer.Emoji = GetPlayerEmoji(room.State.Players.IndexOf(existingPlayer));
                QueuePersistence(room, SnapshotState(room.State));
                return (room, null);
            }

            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Game already in progress.");

            if (room.State.Players.Count >= 30)
                return (null, "Room is full (max 30 players).");

            var colorIndex = room.State.Players.Count % Colors.Length;
            var playerIndex = room.State.Players.Count;
            room.State.Players.Add(new PlayerDto
            {
                Id = userId,
                Name = username,
                Color = Colors[colorIndex],
                Emoji = GetPlayerEmoji(playerIndex)
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
                {
                    player.IsConnected = false;
                    if (string.IsNullOrWhiteSpace(player.Emoji))
                        player.Emoji = GetPlayerEmoji(room.State.Players.IndexOf(player));
                }
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
            player.CurrentHexQ = null;
            player.CurrentHexR = null;
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

    private static string GetPlayerEmoji(int playerIndex)
    {
        if (playerIndex < PlayerEmojis.Length)
            return PlayerEmojis[playerIndex];

        var poolIndex = playerIndex % PlayerEmojis.Length;
        var cycle = (playerIndex / PlayerEmojis.Length) + 1;
        return $"{PlayerEmojis[poolIndex]}{cycle}";
    }
}
