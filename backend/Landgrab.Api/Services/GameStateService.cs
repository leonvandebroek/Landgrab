using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameStateService(IGameRoomProvider roomProvider, RoomPersistenceService roomPersistenceService, ILogger<GameStateService> logger)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);

    public GameState? GetStateSnapshot(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return null;

        lock (room.SyncRoot)
            return SnapshotState(room.State);
    }

    public GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);

    public void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);

    public void QueuePersistence(GameRoom room, GameState stateSnapshot)
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

    public void QueuePersistenceIfGameOver(GameRoom room, GameState stateSnapshot, GamePhase previousPhase)
    {
        if (previousPhase == GamePhase.GameOver || stateSnapshot.Phase != GamePhase.GameOver)
            return;

        QueuePersistence(room, stateSnapshot);
    }

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

            visible.Add(HexService.Key(cell.Q, cell.R));

            foreach (var neighbor in HexService.SpiralSearch(cell.Q, cell.R, scoutExtension))
            {
                var nKey = HexService.Key(neighbor.q, neighbor.r);
                if (state.Grid.ContainsKey(nKey))
                    visible.Add(nKey);
            }
        }

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

        // Beacon: Scout alliance members reveal hexes around active beacons
        if (state.Dynamics.BeaconEnabled && state.Dynamics.FogOfWarEnabled)
        {
            var activeBeacons = state.Players
                .Where(p => p.IsBeacon
                    && p.AllianceId == player.AllianceId
                    && p.BeaconLat.HasValue && p.BeaconLng.HasValue
                    && state.HasMapLocation)
                .ToList();

            foreach (var beacon in activeBeacons)
            {
                var beaconHex = HexService.LatLngToHexForRoom(
                    beacon.BeaconLat!.Value, beacon.BeaconLng!.Value,
                    state.MapLat!.Value, state.MapLng!.Value, state.TileSizeMeters);

                foreach (var neighbor in HexService.SpiralSearch(beaconHex.q, beaconHex.r, 3))
                {
                    var nKey = HexService.Key(neighbor.q, neighbor.r);
                    if (state.Grid.ContainsKey(nKey))
                        visible.Add(nKey);
                }
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

        return CreatePlayerSnapshot(fullSnapshot, userId);
    }

    public GameState GetPlayerSnapshot(
        GameState fullSnapshot,
        string userId,
        IReadOnlyDictionary<string, HexCell> hiddenFogCells)
    {
        if (!fullSnapshot.Dynamics.FogOfWarEnabled)
            return fullSnapshot;

        return CreatePlayerSnapshot(fullSnapshot, userId, hiddenFogCells);
    }

    private GameState CreatePlayerSnapshot(
        GameState fullSnapshot,
        string userId,
        IReadOnlyDictionary<string, HexCell>? hiddenFogCells = null)
    {
        var visibleKeys = GetVisibleHexKeys(fullSnapshot, userId);
        var fogGrid = new Dictionary<string, HexCell>(fullSnapshot.Grid.Count);

        foreach (var (key, cell) in fullSnapshot.Grid)
        {
            if (visibleKeys.Contains(key))
            {
                fogGrid[key] = cell;
                continue;
            }

            fogGrid[key] = hiddenFogCells != null
                ? hiddenFogCells[key]
                : CreateHiddenFogCell(cell);
        }

        return CreateSnapshotEnvelope(fullSnapshot, fogGrid);
    }

    public IReadOnlyDictionary<string, HexCell> CreateHiddenFogCellsForBroadcast(GameState fullSnapshot)
    {
        if (!fullSnapshot.Dynamics.FogOfWarEnabled)
            return new Dictionary<string, HexCell>(0);

        return CreateHiddenFogCells(fullSnapshot);
    }

    private static Dictionary<string, HexCell> CreateHiddenFogCells(GameState fullSnapshot)
    {
        var hiddenFogCells = new Dictionary<string, HexCell>(fullSnapshot.Grid.Count);

        foreach (var (key, cell) in fullSnapshot.Grid)
            hiddenFogCells[key] = CreateHiddenFogCell(cell);

        return hiddenFogCells;
    }

    private static HexCell CreateHiddenFogCell(HexCell cell)
    {
        return new HexCell
        {
            Q = cell.Q,
            R = cell.R,
            TerrainType = cell.TerrainType,
            Troops = 0,
        };
    }

    private static GameState CreateSnapshotEnvelope(GameState fullSnapshot, Dictionary<string, HexCell> fogGrid)
    {
        return new GameState
        {
            RoomCode = fullSnapshot.RoomCode,
            Phase = fullSnapshot.Phase,
            GameMode = fullSnapshot.GameMode,
            CurrentWizardStep = fullSnapshot.CurrentWizardStep,
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
            Dynamics = fullSnapshot.Dynamics,
            GameDurationMinutes = fullSnapshot.GameDurationMinutes,
            MasterTileQ = fullSnapshot.MasterTileQ,
            MasterTileR = fullSnapshot.MasterTileR,
            GameStartedAt = fullSnapshot.GameStartedAt,
            WinnerId = fullSnapshot.WinnerId,
            WinnerName = fullSnapshot.WinnerName,
            IsAllianceVictory = fullSnapshot.IsAllianceVictory,
            Achievements = fullSnapshot.Achievements,
            HostBypassGps = fullSnapshot.HostBypassGps,
            MaxFootprintMetersOverride = fullSnapshot.MaxFootprintMetersOverride,
            HostObserverMode = fullSnapshot.HostObserverMode,
            IsPaused = fullSnapshot.IsPaused,
            ActiveRaids = fullSnapshot.ActiveRaids,
        };
    }

    /// <summary>Returns the list of player connection IDs that belong to the given alliance IDs.</summary>
    public List<string> GetAllianceConnectionIds(GameRoom room, List<string> allianceIds)
    {
        var memberIds = room.State.Alliances
            .Where(a => allianceIds.Contains(a.Id))
            .SelectMany(a => a.MemberIds)
            .ToHashSet();

        return room.ConnectionMap
            .Where(kvp => memberIds.Contains(kvp.Value))
            .Select(kvp => kvp.Key)
            .ToList();
    }
}
