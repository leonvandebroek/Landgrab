using System.Collections.Concurrent;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameService(RoomPersistenceService roomPersistenceService, ILogger<GameService> logger)
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();
    private const int DefaultGridRadius = 8;
    private const int DefaultTileSizeMeters = 25;
    private const int MaxFootprintMeters = 1_000;
    private const int MinimumDrawnHexCount = 7;

    private static readonly string[] Colors =
        ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e",
         "#e91e63", "#00bcd4", "#8bc34a", "#ff5722", "#673ab7", "#009688", "#ffc107", "#795548"];

    private static readonly string[] AllianceColors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"];
    private const int MaxEventLogEntries = 100;

    private static readonly Dictionary<string, List<CopresenceMode>> CopresencePresets = new()
    {
        ["Klassiek"] = [],
        ["Territorium"] = [CopresenceMode.Shepherd, CopresenceMode.Drain],
        ["Formatie"] = [CopresenceMode.FrontLine, CopresenceMode.Rally],
        ["Logistiek"] = [CopresenceMode.Shepherd, CopresenceMode.Relay, CopresenceMode.FrontLine],
        ["Infiltratie"] = [CopresenceMode.Stealth, CopresenceMode.CommandoRaid, CopresenceMode.Scout],
        ["Chaos"] = [CopresenceMode.JagerProoi, CopresenceMode.Duel, CopresenceMode.PresenceBonus],
        ["Tolweg"] = [CopresenceMode.Beacon, CopresenceMode.Toll, CopresenceMode.Drain],
    };

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
        room.State.TileSizeMeters = GetAllowedTileSizeMeters(room.State.Grid.Values.Select(cell => (cell.Q, cell.R)), DefaultTileSizeMeters);
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
                    room.State.TileSizeMeters);

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

    public (GameState? state, string? error) SetAlliance(string roomCode, string userId,
        string allianceName)
    {
        if (string.IsNullOrWhiteSpace(allianceName))
            return (null, "Alliance name is required.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Alliances can only be changed in the lobby.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            var previousAllianceId = player.AllianceId;
            var previousAllianceName = player.AllianceName;
            var normalizedName = allianceName.Trim();
            var alliance = room.State.Alliances.FirstOrDefault(a =>
                a.Name.Equals(normalizedName, StringComparison.OrdinalIgnoreCase));

            if (alliance == null)
            {
                if (room.State.Alliances.Count >= 8)
                    return (null, "Max 8 alliances per game.");

                alliance = new AllianceDto
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = normalizedName,
                    Color = AllianceColors[room.State.Alliances.Count % AllianceColors.Length]
                };
                room.State.Alliances.Add(alliance);
            }

            foreach (var existingAlliance in room.State.Alliances)
                existingAlliance.MemberIds.Remove(userId);

            alliance.MemberIds.Add(userId);
            player.AllianceId = alliance.Id;
            player.AllianceName = alliance.Name;
            player.AllianceColor = alliance.Color;
            player.Color = alliance.Color;

            foreach (var cell in room.State.Grid.Values.Where(cell => cell.OwnerId == userId))
            {
                cell.OwnerAllianceId = player.AllianceId;
                cell.OwnerColor = player.AllianceColor ?? player.Color;
                cell.OwnerName = player.Name;
            }

            RefreshTerritoryCount(room.State);
            if (!string.Equals(previousAllianceId, player.AllianceId, StringComparison.Ordinal))
            {
                var changeMessage = previousAllianceName == null
                    ? $"{player.Name} joined alliance {alliance.Name}."
                    : $"{player.Name} changed alliance from {previousAllianceName} to {alliance.Name}.";
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "AllianceChanged",
                    Message = changeMessage,
                    PlayerId = player.Id,
                    PlayerName = player.Name,
                    AllianceId = alliance.Id,
                    AllianceName = alliance.Name
                });
            }

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ConfigureAlliances(string roomCode, string userId, List<string> allianceNames)
    {
        if (allianceNames == null || allianceNames.Count == 0)
            return (null, "At least one alliance name is required.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can configure alliances.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Alliances can only be configured in the lobby.");

            room.State.Alliances.Clear();
            for (var i = 0; i < allianceNames.Count; i++)
            {
                var name = allianceNames[i].Trim();
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                room.State.Alliances.Add(new AllianceDto
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = name,
                    Color = AllianceColors[i % AllianceColors.Length]
                });
            }

            foreach (var player in room.State.Players)
            {
                player.AllianceId = null;
                player.AllianceName = null;
                player.AllianceColor = null;
            }

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AlliancesConfigured",
                Message = $"The host configured {room.State.Alliances.Count} alliances.",
                PlayerId = userId,
                PlayerName = host?.Name
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) DistributePlayersRandomly(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can distribute players.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Players can only be distributed in the lobby.");
            if (room.State.Alliances.Count == 0)
                return (null, "Configure at least one alliance before distributing players.");

            var shuffledPlayers = room.State.Players.OrderBy(_ => Random.Shared.Next()).ToList();
            for (var i = 0; i < shuffledPlayers.Count; i++)
            {
                var alliance = room.State.Alliances[i % room.State.Alliances.Count];
                var player = shuffledPlayers[i];
                player.AllianceId = alliance.Id;
                player.AllianceName = alliance.Name;
                player.AllianceColor = alliance.Color;
                player.Color = alliance.Color;
            }

            foreach (var alliance in room.State.Alliances)
            {
                alliance.MemberIds.Clear();
                alliance.MemberIds.AddRange(
                    room.State.Players.Where(p => p.AllianceId == alliance.Id).Select(p => p.Id));
            }

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "PlayersDistributed",
                Message = "The host randomly distributed all players across alliances.",
                PlayerId = userId,
                PlayerName = host?.Name
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) AssignAllianceStartingTile(string roomCode, string userId,
        int q, int r, string allianceId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can assign alliance starting tiles.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Starting tiles can only be assigned in the lobby.");
            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "Set the master tile before assigning starting tiles.");

            var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == allianceId);
            if (alliance == null)
                return (null, "Alliance not found.");

            var firstMember = room.State.Players.FirstOrDefault(p => p.AllianceId == allianceId);
            if (firstMember == null)
                return (null, "Alliance has no members.");

            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var cell))
                return (null, "Invalid hex.");
            if (cell.IsMasterTile)
                return (null, "The master tile cannot be assigned as a starting tile.");
            if (cell.OwnerId != null)
                return (null, "This hex is already assigned.");

            cell.OwnerId = firstMember.Id;
            cell.OwnerAllianceId = alliance.Id;
            cell.OwnerName = firstMember.Name;
            cell.OwnerColor = alliance.Color;
            cell.Troops = 3;
            RefreshTerritoryCount(room.State);

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AllianceStartingTileAssigned",
                Message = $"Alliance {alliance.Name} was assigned a starting tile at ({q}, {r}).",
                PlayerId = userId,
                PlayerName = host?.Name,
                AllianceId = alliance.Id,
                AllianceName = alliance.Name,
                Q = q,
                R = r
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetMapLocation(string roomCode, string userId,
        double lat, double lng)
    {
        var error = ValidateCoordinates(lat, lng);
        if (error != null)
            return (null, error);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can set the map location.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Map location can only be changed in the lobby.");

            room.State.MapLat = lat;
            room.State.MapLng = lng;
            EnsureGrid(room.State);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetTileSize(string roomCode, string userId, int meters)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change tile size.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Tile size can only be changed in the lobby.");

            var targetMeters = Math.Clamp(meters, 15, 1000);
            var maxAllowedMeters = GetAllowedTileSizeMeters(room.State.Grid.Values.Select(cell => (cell.Q, cell.R)), 1000);
            if (targetMeters > maxAllowedMeters)
                return (null, $"This game area can use at most {maxAllowedMeters} meters per tile to stay within 1 kilometer.");

            room.State.TileSizeMeters = targetMeters;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) UseCenteredGameArea(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateGameAreaUpdate(room, userId);
            if (validationError != null)
                return (null, validationError);

            return ApplyGameArea(room, GameAreaMode.Centered, null, HexService.Spiral(DefaultGridRadius),
                "The host switched the game area to the centered field.");
        }
    }

    public (GameState? state, string? error) SetPatternGameArea(string roomCode, string userId,
        string pattern)
    {
        if (!Enum.TryParse<GameAreaPattern>(pattern, true, out var parsedPattern))
            return (null, "Invalid game area pattern.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateGameAreaUpdate(room, userId);
            if (validationError != null)
                return (null, validationError);

            return ApplyGameArea(room, GameAreaMode.Pattern, parsedPattern,
                BuildPatternCoordinates(parsedPattern),
                $"The host applied the {parsedPattern} game area pattern.");
        }
    }

    public (GameState? state, string? error) SetCustomGameArea(string roomCode, string userId,
        IReadOnlyList<HexCoordinateDto> coordinates)
    {
        ArgumentNullException.ThrowIfNull(coordinates);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateGameAreaUpdate(room, userId);
            if (validationError != null)
                return (null, validationError);

            var selectedCoordinates = coordinates
                .Select(coord => (coord.Q, coord.R))
                .Distinct()
                .ToList();

            if (selectedCoordinates.Count < MinimumDrawnHexCount)
                return (null, $"Draw at least {MinimumDrawnHexCount} tiles for a custom game area.");
            if (!HexService.IsConnected(selectedCoordinates))
                return (null, "Custom game areas must be one connected shape.");

            return ApplyGameArea(room, GameAreaMode.Drawn, null, selectedCoordinates,
                "The host drew a custom game area.");
        }
    }

    public (GameState? state, string? error) SetClaimMode(string roomCode, string userId,
        string claimMode)
    {
        if (!Enum.TryParse<ClaimMode>(claimMode, true, out var parsedClaimMode))
            return (null, "Invalid claim mode.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change claim mode.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Claim mode can only be changed in the lobby.");

            room.State.ClaimMode = parsedClaimMode;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetAllowSelfClaim(string roomCode, string userId,
        bool allow)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change self-claim settings.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Self-claim settings can only be changed in the lobby.");

            room.State.AllowSelfClaim = allow;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetWinCondition(string roomCode, string userId,
        string winConditionType, int value)
    {
        if (!Enum.TryParse<WinConditionType>(winConditionType, true, out var parsedWinCondition))
            return (null, "Invalid win condition.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change the win condition.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Win condition can only be changed in the lobby.");

            switch (parsedWinCondition)
            {
                case WinConditionType.TerritoryPercent:
                    if (value < 1 || value > 100)
                        return (null, "Territory percent must be between 1 and 100.");
                    room.State.WinConditionValue = value;
                    room.State.GameDurationMinutes = null;
                    break;
                case WinConditionType.Elimination:
                    room.State.WinConditionValue = 1;
                    room.State.GameDurationMinutes = null;
                    break;
                case WinConditionType.TimedGame:
                    if (value < 1)
                        return (null, "Timed games must last at least 1 minute.");
                    room.State.WinConditionValue = value;
                    room.State.GameDurationMinutes = value;
                    break;
            }

            room.State.WinConditionType = parsedWinCondition;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetCopresenceModes(string roomCode, string userId,
        List<string> modes)
    {
        var parsed = new List<CopresenceMode>();
        foreach (var mode in modes)
        {
            if (!Enum.TryParse<CopresenceMode>(mode, true, out var parsedMode) || parsedMode == CopresenceMode.None)
                return (null, $"Invalid copresence mode: {mode}");
            parsed.Add(parsedMode);
        }

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change copresence modes.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Copresence modes can only be changed in the lobby.");

            room.State.Dynamics.ActiveCopresenceModes = parsed;
            room.State.Dynamics.CopresencePreset = "Aangepast";
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetCopresencePreset(string roomCode, string userId,
        string preset)
    {
        if (preset != "Aangepast" && !CopresencePresets.ContainsKey(preset))
            return (null, $"Unknown preset: {preset}");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change the copresence preset.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Copresence preset can only be changed in the lobby.");

            room.State.Dynamics.CopresencePreset = preset;
            if (preset != "Aangepast" && CopresencePresets.TryGetValue(preset, out var presetModes))
                room.State.Dynamics.ActiveCopresenceModes = [.. presetModes];

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetGameDynamics(string roomCode, string userId,
        GameDynamics dynamics)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change game dynamics.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Game dynamics can only be changed in the lobby.");

            room.State.Dynamics.TerrainEnabled = dynamics.TerrainEnabled;
            room.State.Dynamics.PlayerRolesEnabled = dynamics.PlayerRolesEnabled;
            room.State.Dynamics.FogOfWarEnabled = dynamics.FogOfWarEnabled;
            room.State.Dynamics.SupplyLinesEnabled = dynamics.SupplyLinesEnabled;
            room.State.Dynamics.HQEnabled = dynamics.HQEnabled;
            room.State.Dynamics.TimedEscalationEnabled = dynamics.TimedEscalationEnabled;
            room.State.Dynamics.UnderdogPactEnabled = dynamics.UnderdogPactEnabled;
            room.State.Dynamics.NeutralNPCEnabled = dynamics.NeutralNPCEnabled;
            room.State.Dynamics.RandomEventsEnabled = dynamics.RandomEventsEnabled;
            room.State.Dynamics.MissionSystemEnabled = dynamics.MissionSystemEnabled;

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetPlayerRole(string roomCode, string userId, string role)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Roles can only be set during lobby.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not enabled for this game.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            if (!Enum.TryParse<PlayerRole>(role, out var parsedRole))
                return (null, "Invalid role.");

            player.Role = parsedRole;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetAllianceHQ(string roomCode, string userId, int q, int r, string allianceId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can set HQ locations.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "HQ can only be set during lobby.");
            if (!room.State.Dynamics.HQEnabled)
                return (null, "HQ mechanic is not enabled for this game.");

            var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == allianceId);
            if (alliance == null)
                return (null, "Alliance not found.");

            var key = HexService.Key(q, r);
            if (!room.State.Grid.ContainsKey(key))
                return (null, "Invalid hex coordinates.");

            alliance.HQHexQ = q;
            alliance.HQHexR = r;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Beacons only work during gameplay.");
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Beacon))
                return (null, "Beacon mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.CurrentLat == null || player.CurrentLng == null)
                return (null, "Your location is required to activate a beacon.");

            player.IsBeacon = true;
            player.BeaconLat = player.CurrentLat;
            player.BeaconLng = player.CurrentLng;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "BeaconActivated",
                Message = $"{player.Name} activated a beacon.",
                PlayerId = userId,
                PlayerName = player.Name
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) DeactivateBeacon(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            player.IsBeacon = false;
            player.BeaconLat = null;
            player.BeaconLng = null;

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateStealth(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Stealth only works during gameplay.");
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Stealth))
                return (null, "Stealth mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.StealthCooldownUntil.HasValue && player.StealthCooldownUntil > DateTime.UtcNow)
                return (null, "Stealth is on cooldown.");
            if (player.StealthUntil.HasValue && player.StealthUntil > DateTime.UtcNow)
                return (null, "Already stealthed.");

            player.StealthUntil = DateTime.UtcNow.AddMinutes(3);
            player.StealthCooldownUntil = DateTime.UtcNow.AddMinutes(8); // 3 min active + 5 min cooldown

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "StealthActivated",
                Message = $"{player.Name} activated stealth.",
                PlayerId = userId,
                PlayerName = player.Name
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId, int targetQ, int targetR)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Commando raids only work during gameplay.");
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.CommandoRaid))
                return (null, "CommandoRaid mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.IsCommandoActive)
                return (null, "You already have an active commando raid.");
            if (player.CommandoCooldownUntil.HasValue && player.CommandoCooldownUntil > DateTime.UtcNow)
                return (null, "Commando raid is on cooldown.");

            // Validate target is within 3 hex distance of player
            if (player.CurrentLat.HasValue && player.CurrentLng.HasValue && room.State.HasMapLocation)
            {
                var playerHex = HexService.LatLngToHexForRoom(player.CurrentLat.Value, player.CurrentLng.Value,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var dist = HexService.HexDistance(playerHex.q - targetQ, playerHex.r - targetR);
                if (dist > 3)
                    return (null, "Target hex must be within 3 hex distance.");
            }

            var key = HexService.Key(targetQ, targetR);
            if (!room.State.Grid.ContainsKey(key))
                return (null, "Invalid target hex.");

            player.IsCommandoActive = true;
            player.CommandoTargetQ = targetQ;
            player.CommandoTargetR = targetR;
            player.CommandoDeadline = DateTime.UtcNow.AddMinutes(5);
            player.CommandoCooldownUntil = DateTime.UtcNow.AddMinutes(15);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "CommandoRaidStarted",
                Message = $"{player.Name} launched a commando raid towards ({targetQ}, {targetR})!",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = targetQ,
                R = targetR
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetMasterTile(string roomCode, string userId,
        double lat, double lng)
    {
        var error = ValidateCoordinates(lat, lng);
        if (error != null)
            return (null, error);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var placementError = ValidateMasterTilePlacement(room, userId);
            if (placementError != null)
                return (null, placementError);

            EnsureGrid(room.State);

            if (!room.State.HasMapLocation)
            {
                room.State.MapLat = lat;
                room.State.MapLng = lng;
            }

            if (room.State.MapLat is null || room.State.MapLng is null)
                return (null, "Set the map location before placing the master tile.");

            var (q, r) = HexService.LatLngToHexForRoom(lat, lng,
                room.State.MapLat.Value, room.State.MapLng.Value, room.State.TileSizeMeters);

            return SetMasterTileByHexCore(room, q, r);
        }
    }

    public (GameState? state, string? error) SetMasterTileByHex(string roomCode, string userId,
        int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var placementError = ValidateMasterTilePlacement(room, userId);
            if (placementError != null)
                return (null, placementError);

            EnsureGrid(room.State);
            return SetMasterTileByHexCore(room, q, r);
        }
    }

    public (GameState? state, string? error) AssignStartingTile(string roomCode, string userId,
        int q, int r, string targetPlayerId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can assign starting tiles.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Starting tiles can only be assigned in the lobby.");
            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "Set the master tile before assigning starting tiles.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == targetPlayerId);
            if (player == null)
                return (null, "Target player is not in the room.");

            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var cell))
                return (null, "Invalid hex.");
            if (cell.IsMasterTile)
                return (null, "The master tile cannot be assigned as a starting tile.");
            if (cell.OwnerId != null)
                return (null, "This hex is already assigned.");

            SetCellOwner(cell, player);
            cell.Troops = 3;
            RefreshTerritoryCount(room.State);
            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "StartingTileAssigned",
                Message = $"{player.Name} was assigned a starting tile at ({q}, {r}).",
                PlayerId = userId,
                PlayerName = host?.Name,
                TargetPlayerId = player.Id,
                TargetPlayerName = player.Name,
                Q = q,
                R = r
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    /// <summary>
    /// Auto-assigns master tile at (0,0) and evenly-spaced starting tiles for any
    /// players who don't already have one. Call before StartGame validation.
    /// Must be called while holding <c>room.SyncRoot</c>.
    /// </summary>
    private void AutoAssignTiles(GameRoom room)
    {
        EnsureGrid(room.State);

        // Auto-place master tile at the most central available hex if not yet set.
        if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
        {
            var centerCell = room.State.Grid.Values
                .Where(cell => cell.OwnerId == null && cell.TerrainType != TerrainType.Water)
                .OrderBy(cell => HexService.HexDistance(cell.Q, cell.R))
                .ThenBy(cell => cell.Q)
                .ThenBy(cell => cell.R)
                .FirstOrDefault();

            if (centerCell != null)
            {
                centerCell.IsMasterTile = true;
                centerCell.Troops = Math.Max(centerCell.Troops, 1);
                room.State.MasterTileQ = centerCell.Q;
                room.State.MasterTileR = centerCell.R;
                var host = room.State.Players.FirstOrDefault(p => p.IsHost);
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "MasterTileAssigned",
                    Message = $"The master tile was auto-assigned to hex ({centerCell.Q}, {centerCell.R}).",
                    PlayerId = host?.Id,
                    PlayerName = host?.Name,
                    Q = centerCell.Q,
                    R = centerCell.R
                });
            }
        }

        // When alliances exist, assign starting tiles per-alliance instead of per-player
        if (room.State.Alliances.Count > 0)
        {
            var alliancesNeedingTile = room.State.Alliances
                .Where(a => a.MemberIds.Count > 0 &&
                            HexService.AllianceTerritoryCount(room.State.Grid, a.Id) == 0)
                .ToList();

            if (alliancesNeedingTile.Count == 0)
                return;

            const int preferredRingRadius = 4;
            var positions = HexService.GetEvenlySpacedRing(
                alliancesNeedingTile.Count,
                preferredRingRadius,
                room.State.GridRadius);

            var available = positions
                .Where(pos =>
                {
                    var key = HexService.Key(pos.q, pos.r);
                    return room.State.Grid.TryGetValue(key, out var cell)
                           && cell.OwnerId == null
                           && !cell.IsMasterTile
                           && cell.TerrainType != TerrainType.Water;
                })
                .ToList();

            if (available.Count < alliancesNeedingTile.Count)
            {
                available = room.State.Grid.Values
                    .Where(cell => cell.OwnerId == null && !cell.IsMasterTile && cell.TerrainType != TerrainType.Water)
                    .OrderByDescending(cell => HexService.HexDistance(cell.Q, cell.R))
                    .ThenBy(cell => Math.Atan2(cell.R + cell.Q / 2d, cell.Q))
                    .Select(cell => (cell.Q, cell.R))
                    .ToList();
            }

            var host2 = room.State.Players.FirstOrDefault(p => p.IsHost);
            for (var i = 0; i < alliancesNeedingTile.Count && i < available.Count; i++)
            {
                var alliance = alliancesNeedingTile[i];
                var firstMember = room.State.Players.FirstOrDefault(p => p.AllianceId == alliance.Id);
                if (firstMember == null)
                    continue;

                var (q, r) = available[i];
                var cell = room.State.Grid[HexService.Key(q, r)];
                cell.OwnerId = firstMember.Id;
                cell.OwnerAllianceId = alliance.Id;
                cell.OwnerName = firstMember.Name;
                cell.OwnerColor = alliance.Color;
                cell.Troops = 3;
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "AllianceStartingTileAssigned",
                    Message = $"Alliance {alliance.Name} was auto-assigned a starting tile at ({q}, {r}).",
                    PlayerId = host2?.Id,
                    PlayerName = host2?.Name,
                    AllianceId = alliance.Id,
                    AllianceName = alliance.Name,
                    Q = q,
                    R = r
                });
            }

            RefreshTerritoryCount(room.State);
            return;
        }

        // Auto-assign starting tiles for players who don't have one (original logic)
        var playersNeedingTile = room.State.Players
            .Where(p => HexService.TerritoryCount(room.State.Grid, p.Id) == 0)
            .ToList();

        if (playersNeedingTile.Count == 0)
            return;

        const int preferredRingRadius2 = 4;
        var positions2 = HexService.GetEvenlySpacedRing(
            playersNeedingTile.Count,
            preferredRingRadius2,
            room.State.GridRadius);

        // Filter out positions that are taken or are the master tile
        var available2 = positions2
            .Where(pos =>
            {
                var key = HexService.Key(pos.q, pos.r);
                return room.State.Grid.TryGetValue(key, out var cell)
                       && cell.OwnerId == null
                       && !cell.IsMasterTile
                       && cell.TerrainType != TerrainType.Water;
            })
            .ToList();

        // If not enough positions on the preferred ring, try a wider ring
        if (available2.Count < playersNeedingTile.Count)
        {
            available2 = room.State.Grid.Values
                .Where(cell => cell.OwnerId == null && !cell.IsMasterTile && cell.TerrainType != TerrainType.Water)
                .OrderByDescending(cell => HexService.HexDistance(cell.Q, cell.R))
                .ThenBy(cell => Math.Atan2(cell.R + cell.Q / 2d, cell.Q))
                .Select(cell => (cell.Q, cell.R))
                .ToList();
        }

        var host3 = room.State.Players.FirstOrDefault(p => p.IsHost);
        for (var i = 0; i < playersNeedingTile.Count && i < available2.Count; i++)
        {
            var player = playersNeedingTile[i];
            var (q, r) = available2[i];
            var cell = room.State.Grid[HexService.Key(q, r)];
            SetCellOwner(cell, player);
            cell.Troops = 3;
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "StartingTileAssigned",
                Message = $"{player.Name} was auto-assigned a starting tile at ({q}, {r}).",
                PlayerId = host3?.Id,
                PlayerName = host3?.Name,
                TargetPlayerId = player.Id,
                TargetPlayerName = player.Name,
                Q = q,
                R = r
            });
        }

        RefreshTerritoryCount(room.State);
    }

    public (GameState? state, string? error) StartGame(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can start the game.");
            if (room.State.Players.Count < 2)
                return (null, "Need at least 2 players.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Game already started.");
            if (!room.State.HasMapLocation)
                return (null, "Map location must be set before starting the game.");
            if (room.State.Players.Any(player => string.IsNullOrWhiteSpace(player.AllianceId)))
                return (null, "Every player must join an alliance before the game can start.");
            if (room.State.Grid.Count < room.State.Players.Count + 1)
                return (null, "The game area must have enough tiles for the master tile and every player.");

            // Auto-assign master tile and starting tiles for any players who missed manual placement
            AutoAssignTiles(room);

            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "The master tile must be set before starting the game.");

            RefreshTerritoryCount(room.State);
            if (room.State.Players.Any(player => player.TerritoryCount == 0))
                return (null, "Every player needs at least one starting tile before the game can start.");

            room.State.Phase = GamePhase.Playing;
            room.State.GameStartedAt = DateTime.UtcNow;

            // Phase 10: Neutral NPC Hexes — assign Building terrain hexes as NPC-owned
            if (room.State.Dynamics.NeutralNPCEnabled)
            {
                foreach (var cell in room.State.Grid.Values)
                {
                    if (cell.TerrainType == TerrainType.Building && !cell.IsMasterTile && cell.OwnerId == null)
                    {
                        cell.OwnerId = "NPC";
                        cell.OwnerName = "NPC";
                        cell.OwnerColor = "#7f8c8d";
                        cell.Troops = 3;
                    }
                }
            }

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "GameStarted",
                Message = "The game has started.",
                PlayerId = userId,
                PlayerName = host?.Name
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) UpdatePlayerLocation(string roomCode, string userId,
        double lat, double lng)
    {
        var error = ValidateCoordinates(lat, lng);
        if (error != null)
            return (null, error);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Player locations are only tracked while the game is playing.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            var previousPhase = room.State.Phase;
            player.CurrentLat = lat;
            player.CurrentLng = lng;

            // ── Phase 3: Rally — update IsFortified for all hexes ──
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Rally))
            {
                foreach (var cell in room.State.Grid.Values.Where(c => c.OwnerId != null))
                {
                    var playersInCell = GetPlayersInHex(room.State, cell.Q, cell.R);
                    var alliedCount = playersInCell.Count(p =>
                        cell.OwnerAllianceId != null && p.AllianceId == cell.OwnerAllianceId);
                    cell.IsFortified = alliedCount >= 2;
                }
            }

            // ── Phase 3: Shepherd — update LastVisitedAt for hexes player is in ──
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Shepherd))
            {
                foreach (var cell in room.State.Grid.Values.Where(c => c.OwnerId != null))
                {
                    if (HexService.IsPlayerInHex(lat, lng, cell.Q, cell.R,
                        room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters))
                    {
                        var isTeamMember = cell.OwnerId == userId
                            || (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId);
                        if (isTeamMember)
                            cell.LastVisitedAt = DateTime.UtcNow;
                    }
                }
            }

            // ── Phase 3: Scout — first hex visit grants +2 troops to nearest owned tile ──
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Scout)
                && room.State.HasMapLocation)
            {
                var currentHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var hexKey = HexService.Key(currentHex.q, currentHex.r);
                if (player.VisitedHexes.Add(hexKey))
                {
                    // First visit — find nearest owned tile and add +2 troops
                    var nearestOwned = HexService.SpiralSearch(currentHex.q, currentHex.r, room.State.GridRadius)
                        .Select(pos => room.State.Grid.TryGetValue(HexService.Key(pos.q, pos.r), out var c) ? c : null)
                        .FirstOrDefault(c => c != null && (c.OwnerId == userId
                            || (player.AllianceId != null && c.OwnerAllianceId == player.AllianceId)));
                    if (nearestOwned != null)
                    {
                        nearestOwned.Troops += 2;
                        AppendEventLog(room.State, new GameEventLogEntry
                        {
                            Type = "ScoutBonus",
                            Message = $"{player.Name} scouted a new hex — +2 troops to ({nearestOwned.Q}, {nearestOwned.R}).",
                            PlayerId = userId,
                            PlayerName = player.Name,
                            Q = nearestOwned.Q,
                            R = nearestOwned.R
                        });
                    }
                }
            }

            // Phase 4: Saboteur — on enemy hex → −1 troop (processed each location update)
            if (room.State.Dynamics.PlayerRolesEnabled && player.Role == PlayerRole.Saboteur
                && room.State.HasMapLocation)
            {
                var saboteurHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var saboteurKey = HexService.Key(saboteurHex.q, saboteurHex.r);
                if (room.State.Grid.TryGetValue(saboteurKey, out var sabCell)
                    && sabCell.OwnerId != null && sabCell.OwnerId != userId
                    && (player.AllianceId == null || sabCell.OwnerAllianceId != player.AllianceId)
                    && sabCell.Troops > 0)
                {
                    sabCell.Troops--;
                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "SaboteurDrain",
                        Message = $"{player.Name} (Saboteur) weakened enemy hex ({saboteurHex.q}, {saboteurHex.r}).",
                        PlayerId = userId,
                        PlayerName = player.Name,
                        Q = saboteurHex.q,
                        R = saboteurHex.r
                    });
                }
            }

            // Phase 4: Engineer — staying in own hex builds fort over time
            if (room.State.Dynamics.PlayerRolesEnabled && player.Role == PlayerRole.Engineer
                && room.State.HasMapLocation)
            {
                var engHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var engKey = HexService.Key(engHex.q, engHex.r);
                if (room.State.Grid.TryGetValue(engKey, out var engCell)
                    && (engCell.OwnerId == userId
                        || (player.AllianceId != null && engCell.OwnerAllianceId == player.AllianceId)))
                {
                    if (engCell.EngineerBuiltAt == null)
                        engCell.EngineerBuiltAt = DateTime.UtcNow;

                    // Check if engineer has been building for ≥10 minutes
                    if (!engCell.IsFort && engCell.EngineerBuiltAt.HasValue
                        && (DateTime.UtcNow - engCell.EngineerBuiltAt.Value).TotalMinutes >= 10)
                    {
                        engCell.IsFort = true;
                        AppendEventLog(room.State, new GameEventLogEntry
                        {
                            Type = "FortBuilt",
                            Message = $"{player.Name} (Engineer) built a fort at ({engHex.q}, {engHex.r}).",
                            PlayerId = userId,
                            PlayerName = player.Name,
                            Q = engHex.q,
                            R = engHex.r
                        });
                    }
                }
            }

            // Phase 5: Toll — entering enemy-occupied hex where owner is present costs carried troops
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Toll)
                && room.State.HasMapLocation && player.CarriedTroops > 0)
            {
                var tollHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var tollKey = HexService.Key(tollHex.q, tollHex.r);
                if (room.State.Grid.TryGetValue(tollKey, out var tollCell)
                    && tollCell.OwnerId != null && tollCell.OwnerId != userId
                    && (player.AllianceId == null || tollCell.OwnerAllianceId != player.AllianceId))
                {
                    // Check if the owner is physically present
                    var ownerPresent = GetPlayersInHex(room.State, tollHex.q, tollHex.r)
                        .Any(p => p.Id == tollCell.OwnerId);
                    if (ownerPresent)
                    {
                        var tollAmount = 1;
                        player.CarriedTroops -= tollAmount;
                        tollCell.Troops += tollAmount;
                        if (player.CarriedTroops <= 0)
                            ResetCarriedTroops(player);

                        AppendEventLog(room.State, new GameEventLogEntry
                        {
                            Type = "TollPaid",
                            Message = $"{player.Name} paid a toll of {tollAmount} troop(s) at ({tollHex.q}, {tollHex.r}).",
                            PlayerId = userId,
                            PlayerName = player.Name,
                            Q = tollHex.q,
                            R = tollHex.r
                        });
                    }
                }
            }

            // Phase 5: Beacon auto-deactivate — if player moves >1 hex from beacon position
            if (player.IsBeacon && player.BeaconLat.HasValue && player.BeaconLng.HasValue
                && room.State.HasMapLocation)
            {
                var beaconHex = HexService.LatLngToHexForRoom(player.BeaconLat.Value, player.BeaconLng.Value,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var currentPlayerHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var dist = HexService.HexDistance(beaconHex.q - currentPlayerHex.q, beaconHex.r - currentPlayerHex.r);
                if (dist > 1)
                {
                    player.IsBeacon = false;
                    player.BeaconLat = null;
                    player.BeaconLng = null;
                }
            }

            // Phase 6: Stealth — breaks on hostile copresence
            if (player.StealthUntil.HasValue && player.StealthUntil > DateTime.UtcNow
                && room.State.HasMapLocation)
            {
                var stealthHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var playersInStealthHex = GetPlayersInHex(room.State, stealthHex.q, stealthHex.r);
                var hostileNearby = playersInStealthHex.Any(p => p.Id != userId
                    && (player.AllianceId == null || p.AllianceId != player.AllianceId));
                if (hostileNearby)
                {
                    player.StealthUntil = null;
                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "StealthBroken",
                        Message = $"{player.Name}'s stealth was broken by hostile copresence!",
                        PlayerId = userId,
                        PlayerName = player.Name,
                        Q = stealthHex.q,
                        R = stealthHex.r
                    });
                }
            }

            // Phase 6: CommandoRaid — check if player arrived at target
            if (player.IsCommandoActive && player.CommandoTargetQ.HasValue && player.CommandoTargetR.HasValue
                && room.State.HasMapLocation)
            {
                var commandoCurrentHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                if (commandoCurrentHex.q == player.CommandoTargetQ && commandoCurrentHex.r == player.CommandoTargetR)
                {
                    // Arrived at target — claim hex bypassing adjacency
                    var targetKey = HexService.Key(player.CommandoTargetQ.Value, player.CommandoTargetR.Value);
                    if (room.State.Grid.TryGetValue(targetKey, out var targetCell)
                        && targetCell.OwnerId == null && !targetCell.IsMasterTile)
                    {
                        SetCellOwner(targetCell, player);
                        targetCell.Troops = Math.Max(1, player.CarriedTroops);
                        ResetCarriedTroops(player);
                        RefreshTerritoryCount(room.State);

                        AppendEventLog(room.State, new GameEventLogEntry
                        {
                            Type = "CommandoRaidSuccess",
                            Message = $"{player.Name} completed a commando raid at ({player.CommandoTargetQ}, {player.CommandoTargetR})!",
                            PlayerId = userId,
                            PlayerName = player.Name,
                            Q = player.CommandoTargetQ.Value,
                            R = player.CommandoTargetR.Value
                        });
                    }

                    player.IsCommandoActive = false;
                    player.CommandoTargetQ = null;
                    player.CommandoTargetR = null;
                    player.CommandoDeadline = null;
                }
                else if (player.CommandoDeadline.HasValue && DateTime.UtcNow > player.CommandoDeadline.Value)
                {
                    // Deadline expired — raid failed
                    player.IsCommandoActive = false;
                    player.CommandoTargetQ = null;
                    player.CommandoTargetR = null;
                    player.CommandoDeadline = null;

                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "CommandoRaidFailed",
                        Message = $"{player.Name}'s commando raid expired.",
                        PlayerId = userId,
                        PlayerName = player.Name
                    });
                }
            }

            // Phase 6: JagerProoi — hostile enters prey's hex → penalty + rotate
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.JagerProoi)
                && room.State.HasMapLocation)
            {
                var preyPlayer = room.State.Players.FirstOrDefault(p => p.IsPrey);
                
                // Auto-assign prey if none assigned yet
                if (preyPlayer == null && room.State.Players.Count >= 2)
                {
                    preyPlayer = room.State.Players
                        .OrderBy(p => p.TerritoryCount)
                        .ThenBy(p => p.Id)
                        .First();
                    preyPlayer.IsPrey = true;
                }

                if (preyPlayer != null && preyPlayer.Id != userId
                    && preyPlayer.CurrentLat.HasValue && preyPlayer.CurrentLng.HasValue)
                {
                    var hunterHex = HexService.LatLngToHexForRoom(lat, lng,
                        room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                    var preyHex = HexService.LatLngToHexForRoom(preyPlayer.CurrentLat.Value, preyPlayer.CurrentLng.Value,
                        room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);

                    if (hunterHex.q == preyHex.q && hunterHex.r == preyHex.r
                        && (player.AllianceId == null || player.AllianceId != preyPlayer.AllianceId))
                    {
                        // Caught! Hunter gets +3 troops on nearest owned hex
                        var hunterNearestOwned = HexService.SpiralSearch(hunterHex.q, hunterHex.r, room.State.GridRadius)
                            .Select(pos => room.State.Grid.TryGetValue(HexService.Key(pos.q, pos.r), out var c) ? c : null)
                            .FirstOrDefault(c => c != null && (c.OwnerId == userId
                                || (player.AllianceId != null && c.OwnerAllianceId == player.AllianceId)));
                        if (hunterNearestOwned != null)
                            hunterNearestOwned.Troops += 3;

                        AppendEventLog(room.State, new GameEventLogEntry
                        {
                            Type = "PreyCaught",
                            Message = $"{player.Name} caught the prey ({preyPlayer.Name})! +3 bonus troops.",
                            PlayerId = userId,
                            PlayerName = player.Name,
                            TargetPlayerId = preyPlayer.Id,
                            TargetPlayerName = preyPlayer.Name,
                            Q = hunterHex.q,
                            R = hunterHex.r
                        });

                        // Rotate prey — next lowest territory player
                        preyPlayer.IsPrey = false;
                        var nextPrey = room.State.Players
                            .Where(p => !p.IsPrey && p.Id != preyPlayer.Id)
                            .OrderBy(p => p.TerritoryCount)
                            .ThenBy(p => p.Id)
                            .FirstOrDefault();
                        if (nextPrey != null)
                            nextPrey.IsPrey = true;
                    }
                }
            }

            ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistenceIfGameOver(room, snapshot, previousPhase);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) PickUpTroops(string roomCode, string userId,
        int q, int r, int count, double playerLat, double playerLng)
    {
        if (count < 1)
            return (null, "Pick-up count must be at least 1.");

        var error = ValidateCoordinates(playerLat, playerLng);
        if (error != null)
            return (null, error);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateRealtimeAction(room.State, userId, q, r, playerLat, playerLng,
                out var player, out var cell);
            if (validationError != null)
                return (null, validationError);
            if (cell.IsMasterTile)
                return (null, "The master tile cannot be used for troop pick-up.");
            // Phase 5: Ambush — hostile presence cancels pickup and triggers troop loss
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Ambush))
            {
                var playersInHex = GetPlayersInHex(room.State, q, r);
                var hostilePresent = playersInHex.FirstOrDefault(p => p.Id != userId
                    && (player.AllianceId == null || p.AllianceId != player.AllianceId));
                if (hostilePresent != null)
                {
                    // Ambush: lose 1 carried troop to the ambusher's tile
                    var troopsLost = Math.Min(1, player.CarriedTroops);
                    player.CarriedTroops -= troopsLost;
                    if (player.CarriedTroops == 0)
                        ResetCarriedTroops(player);

                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "Ambush",
                        Message = $"{hostilePresent.Name} ambushed {player.Name} at ({q}, {r})!",
                        PlayerId = hostilePresent.Id,
                        PlayerName = hostilePresent.Name,
                        TargetPlayerId = userId,
                        TargetPlayerName = player.Name,
                        Q = q,
                        R = r
                    });

                    var ambushSnapshot = SnapshotState(room.State);
                    QueuePersistence(room, ambushSnapshot);
                    return (null, "Ambush! A hostile player intercepted your pickup.");
                }
            }

            if (cell.OwnerId != userId)
                return (null, "You can only pick up troops from your own hexes.");
            if (cell.Troops < count)
                return (null, "That hex does not have enough troops.");
            if (player.CarriedTroops > 0 &&
                (player.CarriedTroopsSourceQ != q || player.CarriedTroopsSourceR != r))
                return (null, "Place your carried troops before picking up from a different hex.");

            cell.Troops -= count;
            player.CarriedTroops += count;
            player.CarriedTroopsSourceQ = q;
            player.CarriedTroopsSourceR = r;
            player.CurrentLat = playerLat;
            player.CurrentLng = playerLng;
            ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error, string? previousOwnerId, CombatResult? combatResult) PlaceTroops(
        string roomCode, string userId, int q, int r, double playerLat, double playerLng,
        int? troopCount = null, bool claimForSelf = false)
    {
        var error = ValidateCoordinates(playerLat, playerLng);
        if (error != null)
            return (null, error, null, null);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.", null, null);

        lock (room.SyncRoot)
        {
            var validationError = ValidateRealtimeAction(room.State, userId, q, r, playerLat, playerLng,
                out var player, out var cell);
            if (validationError != null)
                return (null, validationError, null, null);
            if (cell.IsMasterTile)
                return (null, "The master tile is invincible and cannot be conquered.", null, null);

            player.CurrentLat = playerLat;
            player.CurrentLng = playerLng;

            // Silently downgrade self-claim to alliance claim when disallowed
            if (claimForSelf && !room.State.AllowSelfClaim)
                claimForSelf = false;

            var sameAllianceHex = player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId;

            // ── Dynamics: Standoff + Water blocking (non-own/non-allied hexes only) ──
            if (cell.OwnerId != userId && !sameAllianceHex)
            {
                // Standoff: hostile physical copresence blocks tile actions
                if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Standoff))
                {
                    var playersInHex = GetPlayersInHex(room.State, q, r);
                    if (playersInHex.Any(p => p.Id != userId
                        && (player.AllianceId == null || p.AllianceId != player.AllianceId)))
                        return (null, "Standoff! A hostile player is blocking this tile.", null, null);
                }

                // Water terrain is impassable
                if (room.State.Dynamics.TerrainEnabled && cell.TerrainType == TerrainType.Water)
                    return (null, "Water terrain is impassable.", null, null);
            }

            if (cell.OwnerId == userId || sameAllianceHex)
            {
                // TODO: Phase 5 Relay — allow remote reinforce when ally is in adjacent hex
                if (player.CarriedTroops <= 0)
                    return (null, "You are not carrying any troops.", null, null);

                cell.Troops += player.CarriedTroops;
                ResetCarriedTroops(player);
                ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
                var reinforceSnapshot = SnapshotState(room.State);
                QueuePersistence(room, reinforceSnapshot);
                return (reinforceSnapshot, null, null, null);
            }

            if (cell.OwnerId == null)
            {
                var neutralClaimError = ClaimNeutralHex(room.State, player, cell, q, r, claimForSelf);
                if (neutralClaimError != null)
                    return (null, neutralClaimError, null, null);

                RefreshTerritoryCount(room.State);
                ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
                var neutralClaimSnapshot = SnapshotState(room.State);
                QueuePersistence(room, neutralClaimSnapshot);
                return (neutralClaimSnapshot, null, null, null);
            }

            if (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId)
                return (null, "You cannot attack an allied hex.", null, null);

            var deployedTroops = troopCount ?? player.CarriedTroops;
            if (troopCount.HasValue && (troopCount.Value < 1 || troopCount.Value > player.CarriedTroops))
                return (null, "Troop count must be between 1 and your carried troops.", null, null);
            // Calculate combat bonuses
            var attackerBonus = 0;
            var defenderBonus = 0;

            // PresenceBonus: attacker physically present gets +1 effective strength
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.PresenceBonus))
                attackerBonus += 1;

            // Terrain defence bonus
            if (room.State.Dynamics.TerrainEnabled)
            {
                defenderBonus += cell.TerrainType switch
                {
                    TerrainType.Building or TerrainType.Hills => 1,
                    TerrainType.Steep => 2,
                    _ => 0
                };
            }

            // Phase 3: Rally — fortified hex gets +1 defence
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Rally) && cell.IsFortified)
                defenderBonus += 1;

            // Phase 3: FrontLine — count adjacent hexes with allied player present → +1 attack per hex
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.FrontLine))
            {
                var frontLineBonus = HexService.Neighbors(q, r)
                    .Count(n =>
                    {
                        var playersInNeighbor = GetPlayersInHex(room.State, n.q, n.r);
                        return playersInNeighbor.Any(p => p.Id != userId
                            && player.AllianceId != null && p.AllianceId == player.AllianceId);
                    });
                attackerBonus += frontLineBonus;
            }

            // Phase 4: Commander — present in attacking hex gives +1 attack
            if (room.State.Dynamics.PlayerRolesEnabled)
            {
                var playersInAttackHex = GetPlayersInHex(room.State, q, r);
                if (playersInAttackHex.Any(p => p.Role == PlayerRole.Commander
                    && p.AllianceId == player.AllianceId))
                    attackerBonus += 1;
            }

            // Phase 4: Fort — permanent +1 defence bonus
            if (room.State.Dynamics.PlayerRolesEnabled && cell.IsFort)
                defenderBonus += 1;

            // Phase 8: Underdog Pact — attack bonus if target's alliance controls >60% hexes
            if (room.State.Dynamics.UnderdogPactEnabled && cell.OwnerAllianceId != null)
            {
                var totalOwned = room.State.Grid.Values.Count(c => c.OwnerId != null);
                if (totalOwned > 0)
                {
                    var targetAllianceCount = room.State.Grid.Values.Count(c => c.OwnerAllianceId == cell.OwnerAllianceId);
                    if ((double)targetAllianceCount / totalOwned > 0.6)
                        attackerBonus += 2;
                }
            }

            var effectiveAttack = deployedTroops + attackerBonus;
            var effectiveDefence = cell.Troops + defenderBonus;

            if (effectiveAttack <= effectiveDefence)
                return (null, "You need more effective strength to overcome the defenders.", null, null);

            var previousOwnerId = cell.OwnerId;
            var previousOwnerName = cell.OwnerName;
            var defendingTroops = cell.Troops;
            if (claimForSelf)
                SetCellOwnerForSelf(cell, player);
            else
                SetCellOwner(cell, player);
            cell.Troops = deployedTroops - defendingTroops;
            player.CarriedTroops -= deployedTroops;
            if (player.CarriedTroops == 0)
                ResetCarriedTroops(player);
            RefreshTerritoryCount(room.State);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "TileCaptured",
                Message = $"{player.Name} captured hex ({q}, {r}) from {previousOwnerName ?? "another player"}.",
                PlayerId = player.Id,
                PlayerName = player.Name,
                TargetPlayerId = previousOwnerId,
                TargetPlayerName = previousOwnerName,
                Q = q,
                R = r
            });

            // Phase 4: HQ capture check
            if (room.State.Dynamics.HQEnabled && previousOwnerId != null)
            {
                var capturedAlliance = room.State.Alliances.FirstOrDefault(a =>
                    a.HQHexQ == q && a.HQHexR == r);
                if (capturedAlliance != null)
                {
                    capturedAlliance.ClaimFrozenUntil = DateTime.UtcNow.AddMinutes(5);
                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "HQCaptured",
                        Message = $"{player.Name} captured {capturedAlliance.Name}'s HQ! Their claims are frozen for 5 minutes.",
                        PlayerId = userId,
                        PlayerName = player.Name,
                        AllianceId = capturedAlliance.Id,
                        AllianceName = capturedAlliance.Name,
                        Q = q,
                        R = r
                    });
                }
            }

            ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var attackSnapshot = SnapshotState(room.State);
            QueuePersistence(room, attackSnapshot);
            var combatResult = new CombatResult
            {
                AttackerWon = true,
                HexCaptured = true,
                AttackDice = [],
                DefendDice = [],
                AttackerLost = 0,
                DefenderLost = defendingTroops,
                Q = q,
                R = r,
                PreviousOwnerName = previousOwnerName,
                NewState = attackSnapshot,
                AttackerBonus = attackerBonus,
                DefenderBonus = defenderBonus,
                DefenderTerrainType = cell.TerrainType.ToString()
            };
            return (attackSnapshot, null, previousOwnerId, combatResult);
        }
    }

    public (GameState? state, string? error) ReClaimHex(string roomCode, string userId,
        int q, int r, ReClaimMode mode)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "This action is only available while the game is playing.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var cell))
                return (null, "Invalid hex.");

            if (cell.OwnerId != userId)
                return (null, "You can only reclaim your own hexes.");

            if (mode == ReClaimMode.Self && !room.State.AllowSelfClaim)
                return (null, "Self-claiming is not allowed in this game.");

            switch (mode)
            {
                case ReClaimMode.Alliance:
                    cell.OwnerAllianceId = player.AllianceId;
                    cell.OwnerColor = player.AllianceColor ?? player.Color;
                    break;
                case ReClaimMode.Self:
                    cell.OwnerAllianceId = null;
                    cell.OwnerColor = player.Color;
                    break;
                case ReClaimMode.Abandon:
                    cell.OwnerId = null;
                    cell.OwnerName = null;
                    cell.OwnerAllianceId = null;
                    cell.OwnerColor = null;
                    cell.Troops = 0;
                    break;
            }

            RefreshTerritoryCount(room.State);
            ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) AddReinforcementsToAllHexes(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Reinforcements only apply while the game is playing.");

            // Phase 8: Rush Hour auto-end after 5 minutes (simplified: check each regen tick)
            if (room.State.IsRushHour && room.State.GameStartedAt.HasValue)
            {
                // Rush hour lasts ~5 minutes; reset it on any regen tick after that
                // (RandomEventService sets it; we clear it after some ticks)
                room.State.IsRushHour = false; // Simple: lasts only one regen cycle (~30s)
            }

            var drainEnabled = room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Drain);
            var terrainEnabled = room.State.Dynamics.TerrainEnabled;

            // Phase 8: Timed Escalation — increase regen after time thresholds
            var escalationBonus = 0;
            if (room.State.Dynamics.TimedEscalationEnabled && room.State.GameStartedAt.HasValue)
            {
                var elapsed = DateTime.UtcNow - room.State.GameStartedAt.Value;
                escalationBonus = (int)(elapsed.TotalMinutes / 30); // +1 per 30 min
            }

            // Phase 7: Supply Lines — find connected hexes via BFS from starting tiles
            HashSet<string>? connectedHexes = null;
            if (room.State.Dynamics.SupplyLinesEnabled)
            {
                connectedHexes = new HashSet<string>();
                // BFS from master tile and all starting positions
                var seedHexes = new List<(int q, int r)>();
                if (room.State.MasterTileQ.HasValue && room.State.MasterTileR.HasValue)
                    seedHexes.Add((room.State.MasterTileQ.Value, room.State.MasterTileR.Value));

                // Group by alliance — each alliance's territory must connect to their starting tile
                var allianceSeeds = new Dictionary<string, List<(int q, int r)>>();
                foreach (var alliance in room.State.Alliances)
                {
                    // Find any hex owned by this alliance to use as seed
                    var firstOwned = room.State.Grid.Values
                        .FirstOrDefault(c => c.OwnerAllianceId == alliance.Id);
                    if (firstOwned != null)
                    {
                        if (!allianceSeeds.ContainsKey(alliance.Id))
                            allianceSeeds[alliance.Id] = [];
                        allianceSeeds[alliance.Id].Add((firstOwned.Q, firstOwned.R));
                    }
                }

                // BFS per alliance
                foreach (var (allianceId, seeds) in allianceSeeds)
                {
                    var visited = new HashSet<string>();
                    var queue = new Queue<(int q, int r)>();
                    foreach (var seed in seeds)
                    {
                        var seedKey = HexService.Key(seed.q, seed.r);
                        if (visited.Add(seedKey))
                            queue.Enqueue(seed);
                    }

                    while (queue.Count > 0)
                    {
                        var (cq, cr) = queue.Dequeue();
                        connectedHexes.Add(HexService.Key(cq, cr));

                        foreach (var (nq, nr) in HexService.Neighbors(cq, cr))
                        {
                            var nk = HexService.Key(nq, nr);
                            if (visited.Contains(nk)) continue;
                            if (!room.State.Grid.TryGetValue(nk, out var nc)) continue;
                            if (nc.OwnerAllianceId != allianceId) continue;
                            visited.Add(nk);
                            queue.Enqueue((nq, nr));
                        }
                    }
                }

                // Also add master tile
                if (room.State.MasterTileQ.HasValue && room.State.MasterTileR.HasValue)
                    connectedHexes.Add(HexService.Key(room.State.MasterTileQ.Value, room.State.MasterTileR.Value));
            }

            foreach (var cell in room.State.Grid.Values.Where(cell => cell.OwnerId != null || cell.IsMasterTile))
            {
                // Drain: skip regen if hostile player physically present
                if (drainEnabled && cell.OwnerId != null && !cell.IsMasterTile)
                {
                    var playersInHex = GetPlayersInHex(room.State, cell.Q, cell.R);
                    var hostilePresent = playersInHex.Any(p => p.Id != cell.OwnerId
                        && (cell.OwnerAllianceId == null || p.AllianceId != cell.OwnerAllianceId));
                    if (hostilePresent)
                        continue;
                }

                // Phase 3: Shepherd — owned tile unvisited >3 min decays instead of regenerating
                if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Shepherd)
                    && cell.OwnerId != null && !cell.IsMasterTile)
                {
                    var unvisitedThreshold = DateTime.UtcNow.AddMinutes(-3);
                    if (cell.LastVisitedAt.HasValue && cell.LastVisitedAt.Value < unvisitedThreshold)
                    {
                        if (cell.Troops > 0)
                            cell.Troops--;
                        continue; // skip normal regen
                    }
                    if (!cell.LastVisitedAt.HasValue)
                    {
                        // Never visited since Shepherd enabled — don't decay yet, just skip bonus regen
                        // Normal regen still applies
                    }
                }

                // Phase 7: Supply Lines — isolated hexes get no regen
                if (connectedHexes != null && cell.OwnerId != null && !cell.IsMasterTile)
                {
                    var cellKey = HexService.Key(cell.Q, cell.R);
                    if (!connectedHexes.Contains(cellKey))
                        continue; // skip regen for isolated hexes
                }

                cell.Troops++;

                // Phase 8: Timed Escalation bonus
                cell.Troops += escalationBonus;

                // Building terrain bonus: +1 extra regen
                if (terrainEnabled && cell.TerrainType == TerrainType.Building)
                    cell.Troops++;

                // Phase 4: Defender role — double regen when Defender is physically present
                if (room.State.Dynamics.PlayerRolesEnabled && cell.OwnerId != null && !cell.IsMasterTile)
                {
                    var playersInCell = GetPlayersInHex(room.State, cell.Q, cell.R);
                    if (playersInCell.Any(p => p.Role == PlayerRole.Defender
                        && (cell.OwnerAllianceId != null && p.AllianceId == cell.OwnerAllianceId)))
                        cell.Troops++; // extra regen (doubles the +1 from normal regen)
                }
            }

            // Phase 10: PresenceBattle — contest progress for hostile copresence
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.PresenceBattle))
            {
                foreach (var cell in room.State.Grid.Values.Where(c => c.OwnerId != null && !c.IsMasterTile))
                {
                    var playersInHex = GetPlayersInHex(room.State, cell.Q, cell.R);
                    var hostilePlayers = playersInHex
                        .Where(p => p.AllianceId != null
                            ? p.AllianceId != (room.State.Players.FirstOrDefault(o => o.Id == cell.OwnerId)?.AllianceId)
                            : p.Id != cell.OwnerId)
                        .ToList();
                    var friendlyPlayers = playersInHex
                        .Where(p => p.Id == cell.OwnerId || (p.AllianceId != null && p.AllianceId == (room.State.Players.FirstOrDefault(o => o.Id == cell.OwnerId)?.AllianceId)))
                        .ToList();

                    if (hostilePlayers.Count > 0)
                    {
                        // Set contesting player if not already set
                        cell.ContestingPlayerId ??= hostilePlayers[0].Id;

                        // Shift progress: +0.1 per hostile, -0.1 per friendly, per tick
                        var shift = (hostilePlayers.Count - friendlyPlayers.Count) * 0.1;
                        cell.ContestProgress = Math.Clamp((cell.ContestProgress ?? 0) + shift, 0, 1.0);

                        // Capture at 1.0
                        if (cell.ContestProgress >= 1.0)
                        {
                            var contestor = room.State.Players.FirstOrDefault(p => p.Id == cell.ContestingPlayerId);
                            if (contestor != null)
                            {
                                SetCellOwner(cell, contestor);
                                AppendEventLog(room.State, new GameEventLogEntry
                                {
                                    Type = "PresenceBattle",
                                    Message = $"{contestor.Name} captured ({cell.Q},{cell.R}) through presence!",
                                    PlayerId = contestor.Id,
                                    PlayerName = contestor.Name,
                                    Q = cell.Q,
                                    R = cell.R
                                });
                            }
                            cell.ContestProgress = null;
                            cell.ContestingPlayerId = null;
                        }
                    }
                    else
                    {
                        // No hostile players — decay contest progress
                        if (cell.ContestProgress.HasValue)
                        {
                            cell.ContestProgress = Math.Max(0, cell.ContestProgress.Value - 0.05);
                            if (cell.ContestProgress <= 0)
                            {
                                cell.ContestProgress = null;
                                cell.ContestingPlayerId = null;
                            }
                        }
                    }
                }
            }

            // Phase 10: Process hostage releases (before snapshot so changes are included)
            if (room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Hostage))
                ProcessHostageReleases(room);

            ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    private void QueuePersistence(GameRoom room, GameState stateSnapshot)
    {
        _ = roomPersistenceService.PersistRoomStateAsync(
            room.Code,
            room.HostUserId,
            room.CreatedAt,
            stateSnapshot,
            DateTime.UtcNow);
    }

    private void QueuePersistenceIfGameOver(GameRoom room, GameState stateSnapshot, GamePhase previousPhase)
    {
        if (previousPhase == GamePhase.GameOver || stateSnapshot.Phase != GamePhase.GameOver)
            return;

        QueuePersistence(room, stateSnapshot);
    }

    private static string? ValidateMasterTilePlacement(GameRoom room, string userId)
    {
        if (!IsHost(room, userId))
            return "Only the host can set the master tile.";
        if (room.State.Phase != GamePhase.Lobby)
            return "The master tile can only be changed in the lobby.";

        return null;
    }

    private static string? ValidateGameAreaUpdate(GameRoom room, string userId)
    {
        if (!IsHost(room, userId))
            return "Only the host can change the game area.";
        if (room.State.Phase != GamePhase.Lobby)
            return "The game area can only be changed in the lobby.";

        return null;
    }

    private (GameState? state, string? error) ApplyGameArea(GameRoom room, GameAreaMode mode,
        GameAreaPattern? pattern, IEnumerable<(int q, int r)> coordinates, string eventMessage)
    {
        var normalizedCoordinates = coordinates.Distinct().ToList();
        if (normalizedCoordinates.Count == 0)
            return (null, "The game area must contain at least one tile.");

        room.State.GameAreaMode = mode;
        room.State.GameAreaPattern = pattern;
        room.State.Grid = HexService.BuildGrid(normalizedCoordinates);
        room.State.GridRadius = Math.Max(1, HexService.InferRadius(normalizedCoordinates));
        room.State.TileSizeMeters = GetAllowedTileSizeMeters(normalizedCoordinates, room.State.TileSizeMeters);
        ResetBoardStateForAreaChange(room.State);

        var host = room.State.Players.FirstOrDefault(player => player.IsHost);
        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "GameAreaUpdated",
            Message = eventMessage,
            PlayerId = host?.Id,
            PlayerName = host?.Name
        });

        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }

    private (GameState? state, string? error) SetMasterTileByHexCore(GameRoom room, int q, int r)
    {
        if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var masterCell))
            return (null, "Master tile must be inside the room grid.");
        if (masterCell.OwnerId != null)
            return (null, "The master tile must be an unowned hex.");

        if (room.State.MasterTileQ is int previousQ && room.State.MasterTileR is int previousR &&
            room.State.Grid.TryGetValue(HexService.Key(previousQ, previousR), out var previousCell))
        {
            previousCell.IsMasterTile = false;
            if (previousCell.OwnerId == null)
                previousCell.Troops = 0;
        }

        masterCell.IsMasterTile = true;
        masterCell.Troops = Math.Max(masterCell.Troops, 1);
        room.State.MasterTileQ = q;
        room.State.MasterTileR = r;
        var host = room.State.Players.FirstOrDefault(player => player.IsHost);
        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "MasterTileAssigned",
            Message = $"The master tile was assigned to hex ({q}, {r}).",
            PlayerId = host?.Id,
            PlayerName = host?.Name,
            Q = q,
            R = r
        });
        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }

    private static void AppendEventLog(GameState state, GameEventLogEntry entry)
    {
        state.EventLog.Add(entry);
        if (state.EventLog.Count <= MaxEventLogEntries)
            return;

        state.EventLog.RemoveRange(0, state.EventLog.Count - MaxEventLogEntries);
    }

    public void AppendEventLogPublic(GameState state, GameEventLogEntry entry) => AppendEventLog(state, entry);
    public GameState SnapshotStatePublic(GameState state) => SnapshotState(state);

    private static string? ClaimNeutralHex(GameState state, PlayerDto player, HexCell cell, int q, int r,
        bool claimForSelf = false)
    {
        // Phase 4: HQ claim freeze check
        if (state.Dynamics.HQEnabled && player.AllianceId != null)
        {
            var playerAlliance = state.Alliances.FirstOrDefault(a => a.Id == player.AllianceId);
            if (playerAlliance?.ClaimFrozenUntil != null && playerAlliance.ClaimFrozenUntil > DateTime.UtcNow)
                return "Your alliance's claims are frozen — your HQ was captured!";
        }

        switch (state.ClaimMode)
        {
            case ClaimMode.PresenceOnly:
                {
                    var troopsPlaced = player.CarriedTroops > 0 ? player.CarriedTroops : 1;
                    if (claimForSelf)
                        SetCellOwnerForSelf(cell, player);
                    else
                        SetCellOwner(cell, player);
                    cell.Troops = troopsPlaced;
                    ResetCarriedTroops(player);
                    return null;
                }
            case ClaimMode.PresenceWithTroop:
                if (player.CarriedTroops < 1)
                    return "You must be carrying at least 1 troop to claim a neutral hex in this room.";

                if (claimForSelf)
                    SetCellOwnerForSelf(cell, player);
                else
                    SetCellOwner(cell, player);
                cell.Troops = 1;
                player.CarriedTroops -= 1;
                if (player.CarriedTroops == 0)
                    ResetCarriedTroops(player);
                return null;
            case ClaimMode.AdjacencyRequired:
            var isAdjacent = HexService.IsAdjacentToOwned(state.Grid, q, r, player.Id, player.AllianceId);
            // Phase 5: Beacon — teammate beacon within 2 hexes extends adjacency
            if (!isAdjacent && state.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Beacon))
            {
                isAdjacent = state.Players.Any(p => p.IsBeacon
                    && p.Id != player.Id
                    && p.AllianceId == player.AllianceId
                    && p.BeaconLat.HasValue && p.BeaconLng.HasValue
                    && state.MapLat.HasValue && state.MapLng.HasValue
                    && HexService.HexDistance(
                        HexService.LatLngToHexForRoom(p.BeaconLat.Value, p.BeaconLng.Value,
                            state.MapLat.Value, state.MapLng.Value, state.TileSizeMeters).q - q,
                        HexService.LatLngToHexForRoom(p.BeaconLat.Value, p.BeaconLng.Value,
                            state.MapLat.Value, state.MapLng.Value, state.TileSizeMeters).r - r) <= 2);
            }
            if (!isAdjacent)
                return "This room requires neutral claims to border your territory.";

                var adjacentTroopsPlaced = player.CarriedTroops > 0 ? player.CarriedTroops : 1;
                if (claimForSelf)
                    SetCellOwnerForSelf(cell, player);
                else
                    SetCellOwner(cell, player);
                cell.Troops = adjacentTroopsPlaced;
                ResetCarriedTroops(player);
                return null;
            default:
                return "Unsupported claim mode.";
        }
    }

    private static string? ValidateRealtimeAction(GameState state, string userId, int q, int r,
        double playerLat, double playerLng, out PlayerDto player, out HexCell cell)
    {
        player = null!;
        cell = null!;

        if (state.Phase != GamePhase.Playing)
            return "This action is only available while the game is playing.";
        if (!state.HasMapLocation || state.MapLat is null || state.MapLng is null)
            return "This room does not have a valid map location configured.";

        player = state.Players.FirstOrDefault(p => p.Id == userId)!;
        if (player == null)
            return "Player not in room.";
        if (!state.Grid.TryGetValue(HexService.Key(q, r), out var targetCell))
            return "Invalid hex.";
        cell = targetCell;

        // Phase 10: Hostage — detained players cannot take actions
        if (player.HeldByPlayerId != null)
            return "You are detained and cannot take actions.";

        if (!HexService.IsPlayerInHex(playerLat, playerLng, q, r,
                state.MapLat.Value, state.MapLng.Value, state.TileSizeMeters))
            return "You must be physically inside that hex to interact with it.";

        return null;
    }

    private static string? ValidateCoordinates(double lat, double lng)
    {
        if (!double.IsFinite(lat) || lat < -90 || lat > 90)
            return "Latitude must be a finite number between -90 and 90.";
        if (!double.IsFinite(lng) || lng < -180 || lng > 180)
            return "Longitude must be a finite number between -180 and 180.";
        return null;
    }

    private static Dictionary<string, HexCell> BuildGridForState(GameState state)
    {
        return state.GameAreaMode switch
        {
            GameAreaMode.Pattern when state.GameAreaPattern.HasValue =>
                HexService.BuildGrid(BuildPatternCoordinates(state.GameAreaPattern.Value)),
            GameAreaMode.Drawn when state.Grid.Count > 0 =>
                HexService.BuildGrid(state.Grid.Values.Select(cell => (cell.Q, cell.R))),
            _ => HexService.BuildGrid(HexService.Spiral(Math.Max(1, state.GridRadius)))
        };
    }

    private static int GetAllowedTileSizeMeters(IEnumerable<(int q, int r)> coordinates, int requestedMeters)
    {
        var maxAllowedMeters = Math.Max(15,
            HexService.GetMaxTileSizeForFootprint(coordinates, MaxFootprintMeters));
        return Math.Clamp(requestedMeters, 15, maxAllowedMeters);
    }

    private static IEnumerable<(int q, int r)> BuildPatternCoordinates(GameAreaPattern pattern)
    {
        return HexService.Spiral(DefaultGridRadius).Where(coord => pattern switch
        {
            GameAreaPattern.WideFront => FitsWideFront(coord.q, coord.r),
            GameAreaPattern.TallFront => FitsTallFront(coord.q, coord.r),
            GameAreaPattern.Crossroads => FitsCrossroads(coord.q, coord.r),
            GameAreaPattern.Starburst => FitsStarburst(coord.q, coord.r),
            _ => true
        });
    }

    private static bool FitsWideFront(int q, int r)
    {
        var s = -q - r;
        return Math.Abs(q) <= 8 && Math.Abs(r) <= 4 && Math.Abs(s) <= 8;
    }

    private static bool FitsTallFront(int q, int r)
    {
        var s = -q - r;
        return Math.Abs(q) <= 4 && Math.Abs(r) <= 8 && Math.Abs(s) <= 8;
    }

    private static bool FitsCrossroads(int q, int r)
    {
        var s = -q - r;
        var radius = HexService.HexDistance(q, r);
        return radius <= 4 || Math.Abs(q) <= 1 || Math.Abs(r) <= 1 || Math.Abs(s) <= 1;
    }

    private static bool FitsStarburst(int q, int r)
    {
        var s = -q - r;
        var radius = HexService.HexDistance(q, r);
        return radius <= 5 || (radius <= DefaultGridRadius && (q == 0 || r == 0 || s == 0));
    }

    private static void ResetBoardStateForAreaChange(GameState state)
    {
        state.MasterTileQ = null;
        state.MasterTileR = null;

        foreach (var cell in state.Grid.Values)
        {
            cell.OwnerId = null;
            cell.OwnerAllianceId = null;
            cell.OwnerName = null;
            cell.OwnerColor = null;
            cell.Troops = 0;
            cell.IsMasterTile = false;
        }

        foreach (var player in state.Players)
        {
            ResetCarriedTroops(player);
            player.TerritoryCount = 0;
        }

        foreach (var alliance in state.Alliances)
            alliance.TerritoryCount = 0;
    }

    private static void EnsureGrid(GameState state)
    {
        if (state.Grid.Count == 0)
            state.Grid = BuildGridForState(state);
    }

    private static bool IsHost(GameRoom room, string userId) => room.HostUserId.ToString() == userId;

    private static List<PlayerDto> GetPlayersInHex(GameState state, int q, int r)
    {
        if (!state.HasMapLocation) return [];
        return state.Players
            .Where(p => p.CurrentLat.HasValue && p.CurrentLng.HasValue
                && HexService.IsPlayerInHex(p.CurrentLat.Value, p.CurrentLng.Value, q, r,
                    state.MapLat!.Value, state.MapLng!.Value, state.TileSizeMeters))
            .ToList();
    }

    /// <summary>
    /// Returns the set of hex keys visible to a player's team for Fog of War.
    /// Visible = adjacent to any owned hex (including the owned hex itself).
    /// Scout role extends visibility by 2 additional rings.
    /// </summary>
    private static HashSet<string> GetVisibleHexKeys(GameState state, string userId)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == userId);
        if (player == null) return [];

        var visible = new HashSet<string>();
        var scoutExtension = (state.Dynamics.PlayerRolesEnabled && player.Role == PlayerRole.Scout) ? 3 : 1;

        foreach (var cell in state.Grid.Values)
        {
            var isOwned = cell.OwnerId == userId
                || (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId);
            if (!isOwned) continue;

            // The owned hex itself is visible
            visible.Add(HexService.Key(cell.Q, cell.R));

            // Add neighbors up to scoutExtension rings
            foreach (var neighbor in HexService.SpiralSearch(cell.Q, cell.R, scoutExtension))
            {
                var nKey = HexService.Key(neighbor.q, neighbor.r);
                if (state.Grid.ContainsKey(nKey))
                    visible.Add(nKey);
            }
        }

        // Player's current hex is always visible
        if (player.CurrentLat.HasValue && player.CurrentLng.HasValue && state.HasMapLocation)
        {
            var currentHex = HexService.LatLngToHexForRoom(player.CurrentLat.Value, player.CurrentLng.Value,
                state.MapLat!.Value, state.MapLng!.Value, state.TileSizeMeters);
            var currentKey = HexService.Key(currentHex.q, currentHex.r);
            visible.Add(currentKey);
            foreach (var neighbor in HexService.Neighbors(currentHex.q, currentHex.r))
            {
                var nKey = HexService.Key(neighbor.q, neighbor.r);
                if (state.Grid.ContainsKey(nKey))
                    visible.Add(nKey);
            }
        }

        return visible;
    }

    /// <summary>
    /// Creates a snapshot filtered for fog of war — hides grid cells not visible to the player.
    /// Hidden cells show as neutral with 0 troops.
    /// </summary>
    public GameState GetPlayerSnapshot(GameState fullSnapshot, string userId)
    {
        if (!fullSnapshot.Dynamics.FogOfWarEnabled)
            return fullSnapshot;

        var visibleKeys = GetVisibleHexKeys(fullSnapshot, userId);

        // Create a new grid with hidden cells scrubbed
        var fogGrid = new Dictionary<string, HexCell>();
        foreach (var (key, cell) in fullSnapshot.Grid)
        {
            if (visibleKeys.Contains(key))
            {
                fogGrid[key] = cell; // already a snapshot copy
            }
            else
            {
                fogGrid[key] = new HexCell
                {
                    Q = cell.Q,
                    R = cell.R,
                    TerrainType = cell.TerrainType, // terrain is always visible
                    Troops = 0,
                    // Everything else null/default — hidden
                };
            }
        }

        // Return a shallow clone with the fog grid
        var playerSnapshot = new GameState
        {
            RoomCode = fullSnapshot.RoomCode,
            Phase = fullSnapshot.Phase,
            GameMode = fullSnapshot.GameMode,
            Players = fullSnapshot.Players,
            Alliances = fullSnapshot.Alliances,
            EventLog = fullSnapshot.EventLog,
            Grid = fogGrid,
            MapLat = fullSnapshot.MapLat,
            MapLng = fullSnapshot.MapLng,
            GridRadius = fullSnapshot.GridRadius,
            GameAreaMode = fullSnapshot.GameAreaMode,
            GameAreaPattern = fullSnapshot.GameAreaPattern,
            TileSizeMeters = fullSnapshot.TileSizeMeters,
            ClaimMode = fullSnapshot.ClaimMode,
            WinConditionType = fullSnapshot.WinConditionType,
            WinConditionValue = fullSnapshot.WinConditionValue,
            AllowSelfClaim = fullSnapshot.AllowSelfClaim,
            Dynamics = fullSnapshot.Dynamics,
            GameDurationMinutes = fullSnapshot.GameDurationMinutes,
            MasterTileQ = fullSnapshot.MasterTileQ,
            MasterTileR = fullSnapshot.MasterTileR,
            GameStartedAt = fullSnapshot.GameStartedAt,
            WinnerId = fullSnapshot.WinnerId,
            WinnerName = fullSnapshot.WinnerName,
            IsAllianceVictory = fullSnapshot.IsAllianceVictory,
            Achievements = fullSnapshot.Achievements,
            Missions = fullSnapshot.Missions,
            PreyTargetQ = fullSnapshot.PreyTargetQ,
            PreyTargetR = fullSnapshot.PreyTargetR,
            IsRushHour = fullSnapshot.IsRushHour,
        };

        // Filter missions to only those visible to this player
        var player = fullSnapshot.Players.FirstOrDefault(p => p.Id == userId);
        playerSnapshot.Missions = playerSnapshot.Missions
            .Where(m => m.Scope == "Main" || m.Scope == "Interim"
                || (m.Scope == "Team" && m.TargetTeamId == player?.AllianceId)
                || (m.Scope == "Personal" && m.TargetPlayerId == userId))
            .ToList();

        return playerSnapshot;
    }

    private static void SetCellOwner(HexCell cell, PlayerDto player)
    {
        cell.OwnerId = player.Id;
        cell.OwnerAllianceId = player.AllianceId;
        cell.OwnerName = player.Name;
        cell.OwnerColor = player.AllianceColor ?? player.Color;
    }

    private static void SetCellOwnerForSelf(HexCell cell, PlayerDto player)
    {
        cell.OwnerId = player.Id;
        cell.OwnerName = player.Name;
        cell.OwnerColor = player.Color;
        cell.OwnerAllianceId = null;
    }

    private static void ResetCarriedTroops(PlayerDto player)
    {
        player.CarriedTroops = 0;
        player.CarriedTroopsSourceQ = null;
        player.CarriedTroopsSourceR = null;
    }

    private static void ReturnCarriedTroops(GameState state, PlayerDto player)
    {
        if (player.CarriedTroops <= 0)
            return;

        HexCell? returnCell = null;
        if (player.CarriedTroopsSourceQ is int sourceQ && player.CarriedTroopsSourceR is int sourceR &&
            state.Grid.TryGetValue(HexService.Key(sourceQ, sourceR), out var sourceCell) &&
            sourceCell.OwnerId == player.Id)
        {
            returnCell = sourceCell;
        }

        returnCell ??= state.Grid.Values.FirstOrDefault(cell => cell.OwnerId == player.Id);
        if (returnCell != null)
            returnCell.Troops += player.CarriedTroops;
        ResetCarriedTroops(player);
    }

    private static void RefreshTerritoryCount(GameState state)
    {
        foreach (var player in state.Players)
            player.TerritoryCount = HexService.TerritoryCount(state.Grid, player.Id);

        foreach (var alliance in state.Alliances)
            alliance.TerritoryCount = HexService.AllianceTerritoryCount(state.Grid, alliance.Id);
    }

    private static void ApplyWinConditionAndLog(GameState state, DateTime now)
    {
        var previousPhase = state.Phase;
        ApplyWinCondition(state, now);
        if (previousPhase == GamePhase.GameOver || state.Phase != GamePhase.GameOver)
            return;

        ComputeAchievements(state);
        AppendEventLog(state, new GameEventLogEntry
        {
            Type = "GameOver",
            Message = state.WinnerName == null
                ? "The game is over."
                : $"{state.WinnerName} won the game.",
            WinnerId = state.WinnerId,
            WinnerName = state.WinnerName,
            IsAllianceVictory = state.IsAllianceVictory
        });
    }

    private static void ComputeAchievements(GameState state)
    {
        state.Achievements.Clear();

        // Territory Leader: player with highest TerritoryCount
        var maxTerritory = state.Players.Max(p => p.TerritoryCount);
        if (maxTerritory > 0)
        {
            foreach (var p in state.Players.Where(p => p.TerritoryCount == maxTerritory))
            {
                state.Achievements.Add(new Achievement
                {
                    Id = "territoryLeader",
                    PlayerId = p.Id,
                    PlayerName = p.Name,
                    TitleKey = "achievement.territoryLeader",
                    Value = maxTerritory.ToString()
                });
            }
        }

        // Army Commander: player with most total troops on the map
        var troopsByPlayer = state.Players.Select(p => new
        {
            Player = p,
            TotalTroops = state.Grid.Values.Where(c => c.OwnerId == p.Id).Sum(c => c.Troops)
        }).ToList();
        var maxTroops = troopsByPlayer.Count > 0 ? troopsByPlayer.Max(t => t.TotalTroops) : 0;
        if (maxTroops > 0)
        {
            foreach (var t in troopsByPlayer.Where(t => t.TotalTroops == maxTroops))
            {
                state.Achievements.Add(new Achievement
                {
                    Id = "armyCommander",
                    PlayerId = t.Player.Id,
                    PlayerName = t.Player.Name,
                    TitleKey = "achievement.armyCommander",
                    Value = maxTroops.ToString()
                });
            }
        }

        // Conqueror: player with most TileCaptured events as attacker
        var capturesByPlayer = state.EventLog
            .Where(e => e.Type == "TileCaptured" && e.PlayerId != null)
            .GroupBy(e => e.PlayerId!)
            .Select(g => new { PlayerId = g.Key, Count = g.Count() })
            .ToList();
        if (capturesByPlayer.Count > 0)
        {
            var maxCaptures = capturesByPlayer.Max(c => c.Count);
            foreach (var c in capturesByPlayer.Where(c => c.Count == maxCaptures))
            {
                var player = state.Players.FirstOrDefault(p => p.Id == c.PlayerId);
                if (player != null)
                {
                    state.Achievements.Add(new Achievement
                    {
                        Id = "conqueror",
                        PlayerId = player.Id,
                        PlayerName = player.Name,
                        TitleKey = "achievement.conqueror",
                        Value = maxCaptures.ToString()
                    });
                }
            }
        }

        // First Strike: player with earliest TileCaptured event
        var firstCapture = state.EventLog
            .Where(e => e.Type == "TileCaptured" && e.PlayerId != null)
            .OrderBy(e => e.CreatedAt)
            .FirstOrDefault();
        if (firstCapture != null)
        {
            var earliestTime = firstCapture.CreatedAt;
            var firstStrikers = state.EventLog
                .Where(e => e.Type == "TileCaptured" && e.PlayerId != null && e.CreatedAt == earliestTime)
                .Select(e => e.PlayerId!)
                .Distinct();
            foreach (var playerId in firstStrikers)
            {
                var player = state.Players.FirstOrDefault(p => p.Id == playerId);
                if (player != null)
                {
                    state.Achievements.Add(new Achievement
                    {
                        Id = "firstStrike",
                        PlayerId = player.Id,
                        PlayerName = player.Name,
                        TitleKey = "achievement.firstStrike"
                    });
                }
            }
        }
    }

    private static void ApplyWinCondition(GameState state, DateTime now)
    {
        if (state.Phase == GamePhase.GameOver)
            return;

        RefreshTerritoryCount(state);

        if (state.WinConditionType == WinConditionType.TimedGame &&
            state.GameStartedAt.HasValue &&
            state.GameDurationMinutes.HasValue &&
            now >= state.GameStartedAt.Value.AddMinutes(state.GameDurationMinutes.Value))
        {
            if (TrySetTerritoryLeaderAsWinner(state))
                state.Phase = GamePhase.GameOver;
            return;
        }

        switch (state.WinConditionType)
        {
            case WinConditionType.TerritoryPercent:
                ApplyTerritoryPercentWinCondition(state);
                break;
            case WinConditionType.Elimination:
                ApplyEliminationWinCondition(state);
                break;
        }
    }

    private static void ApplyTerritoryPercentWinCondition(GameState state)
    {
        var claimableHexes = state.Grid.Values.Count(cell => !cell.IsMasterTile);
        if (claimableHexes == 0)
            return;

        if (state.Alliances.Count > 0)
        {
            foreach (var alliance in state.Alliances)
            {
                if (alliance.TerritoryCount * 100 < claimableHexes * state.WinConditionValue)
                    continue;

                state.Phase = GamePhase.GameOver;
                state.WinnerId = alliance.Id;
                state.WinnerName = alliance.Name;
                state.IsAllianceVictory = true;
                return;
            }
        }
        else
        {
            foreach (var player in state.Players)
            {
                if (player.TerritoryCount * 100 < claimableHexes * state.WinConditionValue)
                    continue;

                state.Phase = GamePhase.GameOver;
                state.WinnerId = player.Id;
                state.WinnerName = player.Name;
                state.IsAllianceVictory = false;
                return;
            }
        }

        var claimedHexes = state.Grid.Values.Count(cell => !cell.IsMasterTile && cell.OwnerId != null);
        if (claimedHexes >= claimableHexes && TrySetTerritoryLeaderAsWinner(state))
            state.Phase = GamePhase.GameOver;
    }

    private static void ApplyEliminationWinCondition(GameState state)
    {
        if (state.Alliances.Count > 0)
        {
            var survivingAlliance = state.Alliances.Where(alliance => alliance.TerritoryCount > 0).ToList();
            if (survivingAlliance.Count <= 1 && TrySetTerritoryLeaderAsWinner(state))
            {
                state.Phase = GamePhase.GameOver;
            }

            return;
        }

        var survivingPlayers = state.Players.Where(player => player.TerritoryCount > 0).ToList();
        if (survivingPlayers.Count <= 1 && TrySetTerritoryLeaderAsWinner(state))
        {
            state.Phase = GamePhase.GameOver;
        }
    }

    private static bool TrySetTerritoryLeaderAsWinner(GameState state)
    {
        if (state.Alliances.Count > 0)
        {
            var allianceWinner = state.Alliances
                .OrderByDescending(alliance => alliance.TerritoryCount)
                .ThenBy(alliance => alliance.Name, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();

            if (allianceWinner == null)
                return false;

            state.WinnerId = allianceWinner.Id;
            state.WinnerName = allianceWinner.Name;
            state.IsAllianceVictory = true;
            return true;
        }

        var playerWinner = state.Players
            .OrderByDescending(player => player.TerritoryCount)
            .ThenBy(player => player.Name, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        if (playerWinner == null)
            return false;

        state.WinnerId = playerWinner.Id;
        state.WinnerName = playerWinner.Name;
        state.IsAllianceVictory = false;
        return true;
    }

    // Phase 10: Duel — challenge when hostile copresence detected
    public PendingDuel? InitiateDuel(string roomCode, string challengerId, string targetId, int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null) return null;

        lock (room.SyncRoot)
        {
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Duel))
                return null;

            // Check both players are in the hex
            var playersInHex = GetPlayersInHex(room.State, q, r);
            var challenger = playersInHex.FirstOrDefault(p => p.Id == challengerId);
            var target = playersInHex.FirstOrDefault(p => p.Id == targetId);
            if (challenger == null || target == null) return null;

            // Check no existing duel for either player
            if (room.PendingDuels.Values.Any(d => d.PlayerIds.Contains(challengerId) || d.PlayerIds.Contains(targetId)))
                return null;

            var duel = new PendingDuel
            {
                PlayerIds = [challengerId, targetId],
                TileQ = q,
                TileR = r,
                ExpiresAt = DateTime.UtcNow.AddSeconds(30)
            };
            room.PendingDuels[duel.Id] = duel;
            return duel;
        }
    }

    public (bool success, string? winnerId, string? loserId) ResolveDuel(string roomCode, string duelId, bool accepted)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (false, null, null);

        lock (room.SyncRoot)
        {
            if (!room.PendingDuels.TryGetValue(duelId, out var duel))
                return (false, null, null);

            room.PendingDuels.Remove(duelId);

            if (!accepted || DateTime.UtcNow > duel.ExpiresAt)
                return (false, null, null);

            // Resolve duel: compare territory + carried troops
            var player1 = room.State.Players.FirstOrDefault(p => p.Id == duel.PlayerIds[0]);
            var player2 = room.State.Players.FirstOrDefault(p => p.Id == duel.PlayerIds[1]);
            if (player1 == null || player2 == null) return (false, null, null);

            var score1 = player1.TerritoryCount + player1.CarriedTroops;
            var score2 = player2.TerritoryCount + player2.CarriedTroops;

            // Add some randomness
            score1 += Random.Shared.Next(1, 7);
            score2 += Random.Shared.Next(1, 7);

            var winnerId = score1 >= score2 ? player1.Id : player2.Id;
            var loserId = score1 >= score2 ? player2.Id : player1.Id;

            // Winner gets the duel tile
            var hexKey = HexService.Key(duel.TileQ, duel.TileR);
            if (room.State.Grid.TryGetValue(hexKey, out var cell))
            {
                var winner = room.State.Players.First(p => p.Id == winnerId);
                SetCellOwner(cell, winner);
                cell.Troops = Math.Max(cell.Troops, 1);
            }

            var winnerPlayer = room.State.Players.First(p => p.Id == winnerId);
            var loserPlayer = room.State.Players.First(p => p.Id == loserId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "DuelResult",
                Message = $"{winnerPlayer.Name} won a duel against {loserPlayer.Name}!",
                PlayerId = winnerId,
                PlayerName = winnerPlayer.Name,
                TargetPlayerId = loserId,
                TargetPlayerName = loserPlayer.Name,
                Q = duel.TileQ,
                R = duel.TileR
            });

            return (true, winnerId, loserId);
        }
    }

    // Phase 10: Hostage — detain a player
    public (GameState? state, string? error) DetainPlayer(string roomCode, string detainerId, string targetId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Hostage))
                return (null, "Hostage mode is not enabled.");

            var detainer = room.State.Players.FirstOrDefault(p => p.Id == detainerId);
            var target = room.State.Players.FirstOrDefault(p => p.Id == targetId);
            if (detainer == null || target == null)
                return (null, "Player not found.");

            // Check copresence — both must be in same hex
            if (detainer.CurrentLat == null || detainer.CurrentLng == null
                || target.CurrentLat == null || target.CurrentLng == null || !room.State.HasMapLocation)
                return (null, "Cannot determine player positions.");

            var detainerHex = HexService.LatLngToHexForRoom(detainer.CurrentLat.Value, detainer.CurrentLng!.Value,
                room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
            var targetHex = HexService.LatLngToHexForRoom(target.CurrentLat.Value, target.CurrentLng!.Value,
                room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);

            if (detainerHex.q != targetHex.q || detainerHex.r != targetHex.r)
                return (null, "Target must be in the same hex.");

            // Must be hostile
            if (detainer.AllianceId != null && detainer.AllianceId == target.AllianceId)
                return (null, "Cannot detain an allied player.");

            // Already detained?
            if (target.HeldByPlayerId != null)
                return (null, "Target is already detained.");

            target.HeldByPlayerId = detainerId;
            target.HeldUntil = DateTime.UtcNow.AddMinutes(3);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "Hostage",
                Message = $"{detainer.Name} detained {target.Name}!",
                PlayerId = detainerId,
                PlayerName = detainer.Name,
                TargetPlayerId = targetId,
                TargetPlayerName = target.Name
            });

            return (SnapshotState(room.State), null);
        }
    }

    // Phase 10: Release detained players — called from regen tick
    public void ProcessHostageReleases(GameRoom room)
    {
        lock (room.SyncRoot)
        {
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Hostage))
                return;

            var now = DateTime.UtcNow;
            foreach (var player in room.State.Players.Where(p => p.HeldByPlayerId != null))
            {
                var shouldRelease = false;

                // Timer expired
                if (player.HeldUntil.HasValue && now > player.HeldUntil.Value)
                    shouldRelease = true;

                // Ally copresence — check if an allied player is in the same hex
                if (!shouldRelease && player.CurrentLat != null && player.CurrentLng != null && room.State.HasMapLocation)
                {
                    var heldHex = HexService.LatLngToHexForRoom(player.CurrentLat.Value, player.CurrentLng!.Value,
                        room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                    var rescuers = GetPlayersInHex(room.State, heldHex.q, heldHex.r)
                        .Where(p => p.Id != player.Id && p.AllianceId != null && p.AllianceId == player.AllianceId);
                    if (rescuers.Any())
                        shouldRelease = true;
                }

                if (shouldRelease)
                {
                    player.HeldByPlayerId = null;
                    player.HeldUntil = null;
                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "HostageReleased",
                        Message = $"{player.Name} has been released!",
                        PlayerId = player.Id,
                        PlayerName = player.Name
                    });
                }
            }
        }
    }

    // Phase 10: Duel expiry cleanup
    public void ProcessDuelExpiry(GameRoom room)
    {
        lock (room.SyncRoot)
        {
            var now = DateTime.UtcNow;
            var expired = room.PendingDuels.Where(kv => now > kv.Value.ExpiresAt).Select(kv => kv.Key).ToList();
            foreach (var id in expired)
                room.PendingDuels.Remove(id);
        }
    }

    private static GameState SnapshotState(GameState state)
    {
        return new GameState
        {
            RoomCode = state.RoomCode,
            Phase = state.Phase,
            GameMode = state.GameMode,
            Players = state.Players.Select(player => new PlayerDto
            {
                Id = player.Id,
                Name = player.Name,
                Color = player.Color,
                AllianceId = player.AllianceId,
                AllianceName = player.AllianceName,
                AllianceColor = player.AllianceColor,
                CarriedTroops = player.CarriedTroops,
                CarriedTroopsSourceQ = player.CarriedTroopsSourceQ,
                CarriedTroopsSourceR = player.CarriedTroopsSourceR,
                CurrentLat = player.StealthUntil.HasValue && player.StealthUntil > DateTime.UtcNow ? null : player.CurrentLat,
                CurrentLng = player.StealthUntil.HasValue && player.StealthUntil > DateTime.UtcNow ? null : player.CurrentLng,
                IsHost = player.IsHost,
                IsConnected = player.IsConnected,
                TerritoryCount = player.TerritoryCount,
                VisitedHexes = [.. player.VisitedHexes],
                Role = player.Role,
                IsBeacon = player.IsBeacon,
                BeaconLat = player.BeaconLat,
                BeaconLng = player.BeaconLng,
                StealthUntil = player.StealthUntil,
                StealthCooldownUntil = player.StealthCooldownUntil,
                IsCommandoActive = player.IsCommandoActive,
                CommandoTargetQ = player.CommandoTargetQ,
                CommandoTargetR = player.CommandoTargetR,
                CommandoDeadline = player.CommandoDeadline,
                CommandoCooldownUntil = player.CommandoCooldownUntil,
                IsPrey = player.IsPrey,
                HeldByPlayerId = player.HeldByPlayerId,
                HeldUntil = player.HeldUntil
            }).ToList(),
            Alliances = state.Alliances.Select(alliance => new AllianceDto
            {
                Id = alliance.Id,
                Name = alliance.Name,
                Color = alliance.Color,
                MemberIds = [.. alliance.MemberIds],
                TerritoryCount = alliance.TerritoryCount,
                HQHexQ = alliance.HQHexQ,
                HQHexR = alliance.HQHexR,
                ClaimFrozenUntil = alliance.ClaimFrozenUntil,
                UnderdogBoostUntil = alliance.UnderdogBoostUntil
            }).ToList(),
            EventLog = state.EventLog.Select(entry => new GameEventLogEntry
            {
                CreatedAt = entry.CreatedAt,
                Type = entry.Type,
                Message = entry.Message,
                PlayerId = entry.PlayerId,
                PlayerName = entry.PlayerName,
                TargetPlayerId = entry.TargetPlayerId,
                TargetPlayerName = entry.TargetPlayerName,
                AllianceId = entry.AllianceId,
                AllianceName = entry.AllianceName,
                Q = entry.Q,
                R = entry.R,
                WinnerId = entry.WinnerId,
                WinnerName = entry.WinnerName,
                IsAllianceVictory = entry.IsAllianceVictory
            }).ToList(),
            Grid = state.Grid.ToDictionary(
                entry => entry.Key,
                entry => new HexCell
                {
                    Q = entry.Value.Q,
                    R = entry.Value.R,
                    OwnerId = entry.Value.OwnerId,
                    OwnerAllianceId = entry.Value.OwnerAllianceId,
                    OwnerName = entry.Value.OwnerName,
                    OwnerColor = entry.Value.OwnerColor,
                    Troops = entry.Value.Troops,
                    IsMasterTile = entry.Value.IsMasterTile,
                    TerrainType = entry.Value.TerrainType,
                    IsFortified = entry.Value.IsFortified,
                    LastVisitedAt = entry.Value.LastVisitedAt,
                    EngineerBuiltAt = entry.Value.EngineerBuiltAt,
                    IsFort = entry.Value.IsFort,
                    ContestProgress = entry.Value.ContestProgress,
                    ContestingPlayerId = entry.Value.ContestingPlayerId,
                }),
            MapLat = state.MapLat,
            MapLng = state.MapLng,
            GridRadius = state.GridRadius,
            GameAreaMode = state.GameAreaMode,
            GameAreaPattern = state.GameAreaPattern,
            TileSizeMeters = state.TileSizeMeters,
            ClaimMode = state.ClaimMode,
            WinConditionType = state.WinConditionType,
            WinConditionValue = state.WinConditionValue,
            AllowSelfClaim = state.AllowSelfClaim,
            Dynamics = new GameDynamics
            {
                ActiveCopresenceModes = [.. state.Dynamics.ActiveCopresenceModes],
                CopresencePreset = state.Dynamics.CopresencePreset,
                TerrainEnabled = state.Dynamics.TerrainEnabled,
                PlayerRolesEnabled = state.Dynamics.PlayerRolesEnabled,
                FogOfWarEnabled = state.Dynamics.FogOfWarEnabled,
                SupplyLinesEnabled = state.Dynamics.SupplyLinesEnabled,
                HQEnabled = state.Dynamics.HQEnabled,
                TimedEscalationEnabled = state.Dynamics.TimedEscalationEnabled,
                UnderdogPactEnabled = state.Dynamics.UnderdogPactEnabled,
                NeutralNPCEnabled = state.Dynamics.NeutralNPCEnabled,
                RandomEventsEnabled = state.Dynamics.RandomEventsEnabled,
                MissionSystemEnabled = state.Dynamics.MissionSystemEnabled,
            },
            GameDurationMinutes = state.GameDurationMinutes,
            MasterTileQ = state.MasterTileQ,
            MasterTileR = state.MasterTileR,
            GameStartedAt = state.GameStartedAt,
            WinnerId = state.WinnerId,
            WinnerName = state.WinnerName,
            IsAllianceVictory = state.IsAllianceVictory,
            Achievements = state.Achievements.Select(a => new Achievement
            {
                Id = a.Id,
                PlayerId = a.PlayerId,
                PlayerName = a.PlayerName,
                TitleKey = a.TitleKey,
                Value = a.Value
            }).ToList(),
            PreyTargetQ = state.PreyTargetQ,
            PreyTargetR = state.PreyTargetR,
            IsRushHour = state.IsRushHour,
            Missions = state.Missions.Select(m => new Mission
            {
                Id = m.Id,
                Type = m.Type,
                Title = m.Title,
                Description = m.Description,
                Scope = m.Scope,
                TargetTeamId = m.TargetTeamId,
                TargetPlayerId = m.TargetPlayerId,
                Objective = m.Objective,
                Progress = m.Progress,
                Status = m.Status,
                ExpiresAt = m.ExpiresAt,
                Reward = m.Reward
            }).ToList()
        };
    }

    private static string GenerateCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 6)
            .Select(_ => chars[Random.Shared.Next(chars.Length)])
            .ToArray());
    }
}
