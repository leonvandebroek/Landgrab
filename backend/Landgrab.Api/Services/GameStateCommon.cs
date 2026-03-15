using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

internal static class GameStateCommon
{
    internal const int MaxEventLogEntries = 100;

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
            HostBypassGps = state.HostBypassGps,
            MaxFootprintMetersOverride = state.MaxFootprintMetersOverride,
            HostObserverMode = state.HostObserverMode,
            IsPaused = state.IsPaused,
            PreyTargetQ = state.PreyTargetQ,
            PreyTargetR = state.PreyTargetR,
            IsRushHour = state.IsRushHour,
            Missions = state.Missions.Select(m => new Mission
            {
                Id = m.Id,
                Type = m.Type,
                Title = m.Title,
                TitleKey = m.TitleKey,
                Description = m.Description,
                DescriptionKey = m.DescriptionKey,
                Scope = m.Scope,
                TargetTeamId = m.TargetTeamId,
                TargetPlayerId = m.TargetPlayerId,
                Objective = m.Objective,
                Progress = m.Progress,
                Status = m.Status,
                ExpiresAt = m.ExpiresAt,
                Reward = m.Reward,
                RewardKey = m.RewardKey
            }).ToList()
        };
    }
}
