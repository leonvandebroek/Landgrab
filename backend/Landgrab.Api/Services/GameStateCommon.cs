using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

internal static class GameStateCommon
{
    internal const int MaxEventLogEntries = 100;
    internal const int DefaultGridRadius = 8;
    internal const int DefaultTileSizeMeters = 25;
    internal const int MaxFootprintMeters = 1_000;
    internal const int MinimumDrawnHexCount = 7;

    internal static readonly string[] Colors =
        ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e",
         "#e91e63", "#00bcd4", "#8bc34a", "#ff5722", "#673ab7", "#009688", "#ffc107", "#795548"];

    internal static readonly string[] AllianceColors =
        ["#ef4444", "#06b6d4", "#f59e0b", "#a855f7", "#10b981", "#ec4899", "#e67e22", "#34495e"];

    internal static readonly string[] PlayerEmojis =
        ["🐺", "🦊", "🐻", "🦁", "🐯", "🐸", "🦅", "🐬", "🦝", "🦨"];

    internal static void AppendEventLog(GameState state, GameEventLogEntry entry)
    {
        state.EventLog.Add(entry);
        if (state.EventLog.Count <= MaxEventLogEntries)
            return;

        state.EventLog.RemoveRange(0, state.EventLog.Count - MaxEventLogEntries);
    }

    internal static GameState SnapshotState(GameState state)
    {
        return new GameState
        {
            RoomCode = state.RoomCode,
            Phase = state.Phase,
            GameMode = state.GameMode,
            CurrentWizardStep = state.CurrentWizardStep,
            Players = state.Players.Select(player => new PlayerDto
            {
                Id = player.Id,
                Name = player.Name,
                Color = player.Color,
                Emoji = player.Emoji,
                AllianceId = player.AllianceId,
                AllianceName = player.AllianceName,
                AllianceColor = player.AllianceColor,
                CarriedTroops = player.CarriedTroops,
                CarriedTroopsSourceQ = player.CarriedTroopsSourceQ,
                CarriedTroopsSourceR = player.CarriedTroopsSourceR,
                CurrentLat = player.CurrentLat,
                CurrentLng = player.CurrentLng,
                CurrentHeading = player.CurrentHeading,
                CurrentHexQ = player.CurrentHexQ,
                CurrentHexR = player.CurrentHexR,
                IsHost = player.IsHost,
                IsConnected = player.IsConnected,
                TerritoryCount = player.TerritoryCount,
                Role = player.Role,
                IsBeacon = player.IsBeacon,
                BeaconLat = player.BeaconLat,
                BeaconLng = player.BeaconLng,
                BeaconHeading = player.BeaconHeading,
                CommandoRaidCooldownUntil = player.CommandoRaidCooldownUntil,
                TacticalStrikeActive = player.TacticalStrikeActive,
                TacticalStrikeExpiry = player.TacticalStrikeExpiry,
                TacticalStrikeCooldownUntil = player.TacticalStrikeCooldownUntil,
                TacticalStrikeTargetQ = player.TacticalStrikeTargetQ,
                TacticalStrikeTargetR = player.TacticalStrikeTargetR,
                RallyPointActive = player.RallyPointActive,
                RallyPointDeadline = player.RallyPointDeadline,
                RallyPointCooldownUntil = player.RallyPointCooldownUntil,
                RallyPointQ = player.RallyPointQ,
                RallyPointR = player.RallyPointR,
                SabotageAlertNearby = player.SabotageAlertNearby,
                InterceptTargetId = player.InterceptTargetId,
                InterceptLockStartAt = player.InterceptLockStartAt,
                FortTargetQ = player.FortTargetQ,
                FortTargetR = player.FortTargetR,
                FortPerimeterVisited = [.. player.FortPerimeterVisited],
                SabotageTargetQ = player.SabotageTargetQ,
                SabotageTargetR = player.SabotageTargetR,
                SabotagePerimeterVisited = [.. player.SabotagePerimeterVisited],
                SabotageCooldownUntil = player.SabotageCooldownUntil,
                SabotageBlockedTiles = player.SabotageBlockedTiles.ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.Ordinal),
                DemolishTargetKey = player.DemolishTargetKey,
                DemolishApproachDirectionsMade = [.. player.DemolishApproachDirectionsMade],
                DemolishFacingLockStartAt = player.DemolishFacingLockStartAt,
                DemolishFacingHexKey = player.DemolishFacingHexKey,
                PreviousHexKey = player.PreviousHexKey,
                DemolishCooldownUntil = player.DemolishCooldownUntil
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
                    VisibilityTier = entry.Value.VisibilityTier,
                    LastKnownTroops = entry.Value.LastKnownTroops,
                    LastKnownOwnerId = entry.Value.LastKnownOwnerId,
                    LastKnownOwnerName = entry.Value.LastKnownOwnerName,
                    LastKnownOwnerColor = entry.Value.LastKnownOwnerColor,
                    LastKnownOwnerAllianceId = entry.Value.LastKnownOwnerAllianceId,
                    LastKnownIsFort = entry.Value.LastKnownIsFort,
                    LastKnownIsMasterTile = entry.Value.LastKnownIsMasterTile,
                    LastSeenAt = entry.Value.LastSeenAt,
                    IsMasterTile = entry.Value.IsMasterTile,
                    IsFortified = entry.Value.IsFortified,
                    LastVisitedAt = entry.Value.LastVisitedAt,
                    IsFort = entry.Value.IsFort,
                    SabotagedUntil = entry.Value.SabotagedUntil,
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
            Dynamics = new GameDynamics
            {
                BeaconEnabled = state.Dynamics.BeaconEnabled,
                BeaconSectorAngle = state.Dynamics.BeaconSectorAngle,
                TileDecayEnabled = state.Dynamics.TileDecayEnabled,
                CombatMode = state.Dynamics.CombatMode,
                PlayerRolesEnabled = state.Dynamics.PlayerRolesEnabled,
                HQEnabled = state.Dynamics.HQEnabled,
                HQAutoAssign = state.Dynamics.HQAutoAssign,
                EnemySightingMemorySeconds = state.Dynamics.EnemySightingMemorySeconds,
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
            HostBypassGps = state.HostBypassGps,
            MaxFootprintMetersOverride = state.MaxFootprintMetersOverride,
            HostObserverMode = state.HostObserverMode,
            IsPaused = state.IsPaused,
            ActiveRaids = state.ActiveRaids.Select(r => new ActiveCommandoRaid
            {
                Id = r.Id,
                TargetQ = r.TargetQ,
                TargetR = r.TargetR,
                InitiatorAllianceId = r.InitiatorAllianceId,
                InitiatorPlayerId = r.InitiatorPlayerId,
                InitiatorPlayerName = r.InitiatorPlayerName,
                Deadline = r.Deadline,
                IsHQRaid = r.IsHQRaid
            }).ToList(),
            ContestedEdges = state.ContestedEdges?.Select(edge => new ContestedEdgeDto
            {
                HexKeyA = edge.HexKeyA,
                HexKeyB = edge.HexKeyB,
                NeighborIndex = edge.NeighborIndex,
                TeamAColor = edge.TeamAColor,
                TeamBColor = edge.TeamBColor,
                Intensity = edge.Intensity
            }).ToList(),
        };
    }

    internal static bool IsHost(GameRoom room, string userId) => room.HostUserId.ToString() == userId;

    internal static void EnsureGrid(GameState state)
    {
        if (state.Grid.Count == 0)
            state.Grid = BuildGridForState(state);
    }

    internal static Dictionary<string, HexCell> BuildGridForState(GameState state)
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

    internal static int GetAllowedTileSizeMeters(
        IEnumerable<(int q, int r)> coordinates,
        int requestedMeters,
        int maxFootprintMeters)
    {
        var maxAllowedMeters = Math.Max(15,
            HexService.GetMaxTileSizeForFootprint(coordinates, maxFootprintMeters));
        return Math.Clamp(requestedMeters, 15, maxAllowedMeters);
    }

    internal static void ResetBoardStateForAreaChange(GameState state)
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
            GameplayService.ResetCarriedTroops(player);
            player.TerritoryCount = 0;
        }

        foreach (var alliance in state.Alliances)
            alliance.TerritoryCount = 0;
    }

    internal static IEnumerable<(int q, int r)> BuildPatternCoordinates(GameAreaPattern pattern)
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
        return Math.Abs(q) <= DefaultGridRadius && Math.Abs(r) <= 4 && Math.Abs(s) <= DefaultGridRadius;
    }

    private static bool FitsTallFront(int q, int r)
    {
        var s = -q - r;
        return Math.Abs(q) <= 4 && Math.Abs(r) <= DefaultGridRadius && Math.Abs(s) <= DefaultGridRadius;
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
}
