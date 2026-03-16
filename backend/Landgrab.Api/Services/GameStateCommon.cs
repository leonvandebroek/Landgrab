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

    internal static readonly Dictionary<string, List<CopresenceMode>> CopresencePresets = new()
    {
        ["Klassiek"] = [],
        ["Territorium"] = [CopresenceMode.Shepherd, CopresenceMode.Drain],
        ["Formatie"] = [CopresenceMode.FrontLine, CopresenceMode.Rally],
    };

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
                CurrentHexQ = player.CurrentHexQ,
                CurrentHexR = player.CurrentHexR,
                IsHost = player.IsHost,
                IsConnected = player.IsConnected,
                TerritoryCount = player.TerritoryCount,
                Role = player.Role,
                IsBeacon = player.IsBeacon,
                BeaconLat = player.BeaconLat,
                BeaconLng = player.BeaconLng,
                IsCommandoActive = player.IsCommandoActive,
                CommandoTargetQ = player.CommandoTargetQ,
                CommandoTargetR = player.CommandoTargetR,
                CommandoDeadline = player.CommandoDeadline,
                CommandoCooldownUntil = player.CommandoCooldownUntil
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
            IsRushHour = state.IsRushHour
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
