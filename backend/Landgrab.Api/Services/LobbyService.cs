using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class LobbyService(IGameRoomProvider roomProvider, GameStateService gameStateService)
{
    private const int StartingTroopCount = 3;

    internal static int DefaultGridRadius => GameStateCommon.DefaultGridRadius;
    internal static int DefaultTileSizeMeters => GameStateCommon.DefaultTileSizeMeters;
    internal static int MaxFootprintMeters => GameStateCommon.MaxFootprintMeters;
    internal static int MinimumDrawnHexCount => GameStateCommon.MinimumDrawnHexCount;
    internal static string[] Colors => GameStateCommon.Colors;
    internal static string[] AllianceColors => GameStateCommon.AllianceColors;
    internal static IReadOnlyDictionary<string, List<CopresenceMode>> CopresencePresets => GameStateCommon.CopresencePresets;

    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);
    private static void SetCellOwner(HexCell cell, PlayerDto player) => GameplayService.SetCellOwner(cell, player);
    private static void RefreshTerritoryCount(GameState state) => GameplayService.RefreshTerritoryCount(state);

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

    public (GameState? state, string? error) SetWizardStep(string roomCode, string userId, int step)
    {
        if (step < 0)
            return (null, "Wizard step must be 0 or greater.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can change the wizard step.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Wizard step can only be changed during lobby.");

            room.State.CurrentWizardStep = step;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) AssignStartingTile(string roomCode, string userId, int q, int r, string targetPlayerId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
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
            cell.Troops = StartingTroopCount;
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

    public (GameState? state, string? error) StartGame(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
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

            AutoAssignTiles(room);
            RefreshTerritoryCount(room.State);
            GrantStartingTroops(room.State);

            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "The master tile must be set before starting the game.");

            var startingAccessError = ValidateStartingAccess(room.State);
            if (startingAccessError != null)
                return (null, startingAccessError);

            room.State.Phase = GamePhase.Playing;
            room.State.GameStartedAt = DateTime.UtcNow;

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

    internal static Dictionary<string, HexCell> BuildGridForState(GameState state) => GameStateCommon.BuildGridForState(state);

    internal static int GetAllowedTileSizeMeters(IEnumerable<(int q, int r)> coordinates, int requestedMeters, int maxFootprintMeters) =>
        GameStateCommon.GetAllowedTileSizeMeters(coordinates, requestedMeters, maxFootprintMeters);

    internal static bool IsHost(GameRoom room, string userId) => GameStateCommon.IsHost(room, userId);

    private static void AutoAssignTiles(GameRoom room)
    {
        GameStateCommon.EnsureGrid(room.State);

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

        if (room.State.Alliances.Count > 0)
        {
            AutoAssignAllianceStartingTiles(room);
            return;
        }

        AutoAssignPlayerStartingTiles(room);
    }

    private static void AutoAssignAllianceStartingTiles(GameRoom room)
    {
        var alliancesNeedingTile = room.State.Alliances
            .Where(a => a.MemberIds.Count > 0 && HexService.AllianceTerritoryCount(room.State.Grid, a.Id) == 0)
            .ToList();
        if (alliancesNeedingTile.Count == 0)
            return;

        var available = GetAvailableStartingPositions(room.State, alliancesNeedingTile.Count);
        var host = room.State.Players.FirstOrDefault(p => p.IsHost);

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
            cell.Troops = StartingTroopCount;
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AllianceStartingTileAssigned",
                Message = $"Alliance {alliance.Name} was auto-assigned a starting tile at ({q}, {r}).",
                PlayerId = host?.Id,
                PlayerName = host?.Name,
                AllianceId = alliance.Id,
                AllianceName = alliance.Name,
                Q = q,
                R = r
            });
        }

        RefreshTerritoryCount(room.State);
    }

    private static void AutoAssignPlayerStartingTiles(GameRoom room)
    {
        var playersNeedingTile = room.State.Players
            .Where(player => HexService.TerritoryCount(room.State.Grid, player.Id) == 0)
            .ToList();
        if (playersNeedingTile.Count == 0)
            return;

        var available = GetAvailableStartingPositions(room.State, playersNeedingTile.Count);
        var host = room.State.Players.FirstOrDefault(p => p.IsHost);

        for (var i = 0; i < playersNeedingTile.Count && i < available.Count; i++)
        {
            var player = playersNeedingTile[i];
            var (q, r) = available[i];
            var cell = room.State.Grid[HexService.Key(q, r)];
            SetCellOwner(cell, player);
            cell.Troops = StartingTroopCount;
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "StartingTileAssigned",
                Message = $"{player.Name} was auto-assigned a starting tile at ({q}, {r}).",
                PlayerId = host?.Id,
                PlayerName = host?.Name,
                TargetPlayerId = player.Id,
                TargetPlayerName = player.Name,
                Q = q,
                R = r
            });
        }

        RefreshTerritoryCount(room.State);
    }

    private static List<(int q, int r)> GetAvailableStartingPositions(GameState state, int count)
    {
        const int preferredRingRadius = 4;
        var positions = HexService.GetEvenlySpacedRing(count, preferredRingRadius, state.GridRadius);
        var available = positions
            .Where(pos =>
            {
                var key = HexService.Key(pos.q, pos.r);
                return state.Grid.TryGetValue(key, out var cell)
                       && cell.OwnerId == null
                       && !cell.IsMasterTile
                       && cell.TerrainType != TerrainType.Water;
            })
            .ToList();

        if (available.Count >= count)
            return available;

        return state.Grid.Values
            .Where(cell => cell.OwnerId == null && !cell.IsMasterTile && cell.TerrainType != TerrainType.Water)
            .OrderByDescending(cell => HexService.HexDistance(cell.Q, cell.R))
            .ThenBy(cell => Math.Atan2(cell.R + cell.Q / 2d, cell.Q))
            .Select(cell => (cell.Q, cell.R))
            .ToList();
    }

    private static void GrantStartingTroops(GameState state)
    {
        foreach (var player in state.Players)
            GameplayService.ResetCarriedTroops(player);

        foreach (var player in state.Players)
        {
            var allianceTerritoryCount = player.AllianceId == null
                ? 0
                : state.Alliances.FirstOrDefault(alliance => alliance.Id == player.AllianceId)?.TerritoryCount ?? 0;

            if (player.TerritoryCount > 0 || allianceTerritoryCount > 0)
                player.CarriedTroops = StartingTroopCount;
        }
    }

    private static string? ValidateStartingAccess(GameState state)
    {
        var blockedPlayers = state.Players
            .Where(player =>
            {
                var allianceTerritoryCount = player.AllianceId == null
                    ? 0
                    : state.Alliances.FirstOrDefault(alliance => alliance.Id == player.AllianceId)?.TerritoryCount ?? 0;

                return player.CarriedTroops <= 0 &&
                       player.TerritoryCount <= 0 &&
                       allianceTerritoryCount <= 0;
            })
            .Select(player => player.Name)
            .ToList();

        if (blockedPlayers.Count == 0)
            return null;

        return $"Cannot start the game because these players would begin with 0 troops and no territory access: {string.Join(", ", blockedPlayers)}.";
    }
}
