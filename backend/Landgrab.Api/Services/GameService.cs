using System.Collections.Concurrent;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameService(RoomPersistenceService roomPersistenceService, ILogger<GameService> logger)
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();

    private static readonly string[] Colors =
        ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"];

    private static readonly string[] AllianceColors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"];

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
        room.State.Grid = HexService.BuildGrid(room.State.GridRadius);
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

            if (room.State.Players.Count >= 4)
                return (null, "Room is full (max 4 players).");

            var colorIndex = room.State.Players.Count % Colors.Length;
            room.State.Players.Add(new PlayerDto
            {
                Id = userId,
                Name = username,
                Color = Colors[colorIndex]
            });

            room.ConnectionMap.TryAdd(connectionId, userId);
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

                foreach (var player in room.State.Players)
                    player.IsConnected = false;
            }

            if (_rooms.TryAdd(normalizedCode, room))
            {
                restoredCount++;
                continue;
            }

            logger.LogWarning("Skipping restored room {RoomCode} because it already exists in memory.",
                normalizedCode);
        }

        return restoredCount;
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

    public void RemoveConnection(GameRoom room, string connectionId)
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

            var normalizedName = allianceName.Trim();
            var alliance = room.State.Alliances.FirstOrDefault(a =>
                a.Name.Equals(normalizedName, StringComparison.OrdinalIgnoreCase));

            if (alliance == null)
            {
                if (room.State.Alliances.Count >= 4)
                    return (null, "Max 4 alliances per game.");

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

            room.State.TileSizeMeters = Math.Clamp(meters, 50, 1000);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
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
            if (!IsHost(room, userId))
                return (null, "Only the host can set the master tile.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "The master tile can only be changed in the lobby.");

            EnsureGrid(room.State);

            if (!room.State.HasMapLocation)
            {
                room.State.MapLat = lat;
                room.State.MapLng = lng;
            }

            if (room.State.MapLat is null || room.State.MapLng is null)
                return (null, "Set the map location before placing the master tile.");

            if (room.State.MasterTileQ is int previousQ && room.State.MasterTileR is int previousR &&
                room.State.Grid.TryGetValue(HexService.Key(previousQ, previousR), out var previousCell))
            {
                previousCell.IsMasterTile = false;
                if (previousCell.OwnerId == null)
                    previousCell.Troops = 0;
            }

            var (q, r) = HexService.LatLngToHexForRoom(lat, lng,
                room.State.MapLat.Value, room.State.MapLng.Value, room.State.TileSizeMeters);

            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var masterCell))
                return (null, "Master tile must be inside the room grid.");
            if (masterCell.OwnerId != null)
                return (null, "The master tile must be an unowned hex.");

            masterCell.IsMasterTile = true;
            masterCell.Troops = Math.Max(masterCell.Troops, 1);
            room.State.MasterTileQ = q;
            room.State.MasterTileR = r;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
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
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
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
            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "The master tile must be set before starting the game.");
            if (room.State.Players.Any(player => string.IsNullOrWhiteSpace(player.AllianceId)))
                return (null, "Every player must join an alliance before the game can start.");

            RefreshTerritoryCount(room.State);
            if (room.State.Players.Any(player => player.TerritoryCount == 0))
                return (null, "Every player needs at least one starting tile before the game can start.");

            room.State.Phase = GamePhase.Playing;
            room.State.GameStartedAt = DateTime.UtcNow;
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
            ApplyWinCondition(room.State, DateTime.UtcNow);
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
            ApplyWinCondition(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) PlaceTroops(string roomCode, string userId,
        int q, int r, double playerLat, double playerLng)
    {
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
                return (null, "The master tile is invincible and cannot be conquered.");

            player.CurrentLat = playerLat;
            player.CurrentLng = playerLng;

            var sameAllianceHex = player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId;
            if (cell.OwnerId == userId || sameAllianceHex)
            {
                if (player.CarriedTroops <= 0)
                    return (null, "You are not carrying any troops.");

                cell.Troops += player.CarriedTroops;
                ResetCarriedTroops(player);
                ApplyWinCondition(room.State, DateTime.UtcNow);
                var reinforceSnapshot = SnapshotState(room.State);
                QueuePersistence(room, reinforceSnapshot);
                return (reinforceSnapshot, null);
            }

            if (cell.OwnerId == null)
            {
                var neutralClaimError = ClaimNeutralHex(room.State, player, cell, q, r);
                if (neutralClaimError != null)
                    return (null, neutralClaimError);

                RefreshTerritoryCount(room.State);
                ApplyWinCondition(room.State, DateTime.UtcNow);
                var neutralClaimSnapshot = SnapshotState(room.State);
                QueuePersistence(room, neutralClaimSnapshot);
                return (neutralClaimSnapshot, null);
            }

            if (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId)
                return (null, "You cannot attack an allied hex.");
            if (player.CarriedTroops <= cell.Troops)
                return (null, "You need to carry more troops than the target hex currently has.");

            var defendingTroops = cell.Troops;
            SetCellOwner(cell, player);
            cell.Troops = player.CarriedTroops - defendingTroops;
            ResetCarriedTroops(player);
            RefreshTerritoryCount(room.State);
            ApplyWinCondition(room.State, DateTime.UtcNow);
            var attackSnapshot = SnapshotState(room.State);
            QueuePersistence(room, attackSnapshot);
            return (attackSnapshot, null);
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

            foreach (var cell in room.State.Grid.Values.Where(cell => cell.OwnerId != null || cell.IsMasterTile))
                cell.Troops++;

            ApplyWinCondition(room.State, DateTime.UtcNow);
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

    private static string? ClaimNeutralHex(GameState state, PlayerDto player, HexCell cell, int q, int r)
    {
        switch (state.ClaimMode)
        {
            case ClaimMode.PresenceOnly:
            {
                var troopsPlaced = player.CarriedTroops > 0 ? player.CarriedTroops : 1;
                SetCellOwner(cell, player);
                cell.Troops = troopsPlaced;
                ResetCarriedTroops(player);
                return null;
            }
            case ClaimMode.PresenceWithTroop:
                if (player.CarriedTroops < 1)
                    return "You must be carrying at least 1 troop to claim a neutral hex in this room.";

                SetCellOwner(cell, player);
                cell.Troops = 1;
                player.CarriedTroops -= 1;
                if (player.CarriedTroops == 0)
                    ResetCarriedTroops(player);
                return null;
            case ClaimMode.AdjacencyRequired:
                if (!HexService.IsAdjacentToOwned(state.Grid, q, r, player.Id, player.AllianceId))
                    return "This room requires neutral claims to border your territory.";

                var adjacentTroopsPlaced = player.CarriedTroops > 0 ? player.CarriedTroops : 1;
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

    private static void EnsureGrid(GameState state)
    {
        if (state.Grid.Count == 0)
            state.Grid = HexService.BuildGrid(state.GridRadius);
    }

    private static bool IsHost(GameRoom room, string userId) => room.HostUserId.ToString() == userId;

    private static void SetCellOwner(HexCell cell, PlayerDto player)
    {
        cell.OwnerId = player.Id;
        cell.OwnerAllianceId = player.AllianceId;
        cell.OwnerName = player.Name;
        cell.OwnerColor = player.AllianceColor ?? player.Color;
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
                CurrentLat = player.CurrentLat,
                CurrentLng = player.CurrentLng,
                IsHost = player.IsHost,
                IsConnected = player.IsConnected,
                TerritoryCount = player.TerritoryCount
            }).ToList(),
            Alliances = state.Alliances.Select(alliance => new AllianceDto
            {
                Id = alliance.Id,
                Name = alliance.Name,
                Color = alliance.Color,
                MemberIds = [.. alliance.MemberIds],
                TerritoryCount = alliance.TerritoryCount
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
                    IsMasterTile = entry.Value.IsMasterTile
                }),
            MapLat = state.MapLat,
            MapLng = state.MapLng,
            GridRadius = state.GridRadius,
            TileSizeMeters = state.TileSizeMeters,
            ClaimMode = state.ClaimMode,
            WinConditionType = state.WinConditionType,
            WinConditionValue = state.WinConditionValue,
            GameDurationMinutes = state.GameDurationMinutes,
            MasterTileQ = state.MasterTileQ,
            MasterTileR = state.MasterTileR,
            GameStartedAt = state.GameStartedAt,
            WinnerId = state.WinnerId,
            WinnerName = state.WinnerName,
            IsAllianceVictory = state.IsAllianceVictory
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
