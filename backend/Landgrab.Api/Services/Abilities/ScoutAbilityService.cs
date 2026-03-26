using Landgrab.Api.Models;

namespace Landgrab.Api.Services.Abilities;

/// <summary>
/// Handles Scout role abilities: Beacon activation/deactivation, intel sharing, and intercept.
/// </summary>
public sealed class ScoutAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    VisibilityService visibilityService)
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    private static readonly TimeSpan ShareIntelCooldown = TimeSpan.FromSeconds(60);

    /// <summary>Activates or updates the Scout's beacon with the given heading.</summary>
    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Beacons only work during gameplay.");
            if (!room.State.Dynamics.BeaconEnabled)
                return (null, "Beacon mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (!double.IsFinite(heading))
                return (null, "A valid heading is required.");

            var normalizedHeading = HexService.NormalizeHeading(heading);
            player.CurrentHeading = normalizedHeading;

            if (room.State.Dynamics.PlayerRolesEnabled)
            {
                if (player.Role != PlayerRole.Scout)
                    return (null, "Only a Scout can use Beacon heading.");

                GameStateCommon.SyncBeaconStateForRole(room.State, player);
            }
            else
            {
                if (player.CurrentLat == null || player.CurrentLng == null)
                    return (null, "Your location is required to activate a beacon.");

                player.IsBeacon = true;
                player.BeaconLat = player.CurrentLat;
                player.BeaconLng = player.CurrentLng;
                player.BeaconHeading = normalizedHeading;

                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "BeaconActivated",
                    Message = $"{player.Name} activated a beacon.",
                    PlayerId = userId,
                    PlayerName = player.Name
                });
            }

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    /// <summary>Deactivates the player's beacon.</summary>
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
            if (room.State.Dynamics.PlayerRolesEnabled && player.Role == PlayerRole.Scout)
                return (null, "Scout beacon is always active.");

            player.IsBeacon = false;
            player.BeaconLat = null;
            player.BeaconLng = null;
            player.BeaconHeading = null;

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    /// <summary>
    /// Shares beacon sector intel with all alliance members, subject to cooldown.
    /// </summary>
    public (int sharedCount, string? error) ShareBeaconIntel(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (0, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (0, "Beacons only work during gameplay.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (0, "Player not in room.");
            if (!room.State.Dynamics.BeaconEnabled)
                return (0, "Beacon mode is not active.");

            if (room.State.Dynamics.PlayerRolesEnabled)
            {
                if (player.Role != PlayerRole.Scout)
                    return (0, "Only a Scout can share intel.");

                GameStateCommon.SyncBeaconStateForRole(room.State, player);
            }
            else if (!player.IsBeacon)
            {
                return (0, "Beacon must be active to share intel.");
            }

            if (!player.IsBeacon || !player.BeaconHeading.HasValue)
                return (0, "A valid heading is required to share intel.");

            var now = DateTime.UtcNow;
            if (player.ShareIntelCooldownUntil.HasValue && player.ShareIntelCooldownUntil.Value > now)
                return (0, "Share Intel is on cooldown.");

            var alliance = room.State.Alliances.FirstOrDefault(candidate =>
                               candidate.MemberIds.Contains(player.Id, StringComparer.Ordinal))
                           ?? room.State.Alliances.FirstOrDefault(candidate => candidate.Id == player.AllianceId);
            if (alliance == null || alliance.MemberIds.Count == 0)
                return (0, null);

            var coneHexKeys = visibilityService.ComputeBeaconSectorKeys(room.State, player);
            var rememberedHexes = new Dictionary<string, RememberedHex>(StringComparer.Ordinal);
            foreach (var hexKey in coneHexKeys)
            {
                if (!room.State.Grid.TryGetValue(hexKey, out var cell))
                    continue;

                rememberedHexes[hexKey] = new RememberedHex(
                    cell.OwnerId,
                    cell.OwnerName,
                    cell.OwnerColor,
                    cell.OwnerAllianceId,
                    cell.Troops,
                    cell.IsFort,
                    cell.IsMasterTile,
                    now);
            }

            if (rememberedHexes.Count == 0)
                return (0, null);

            foreach (var memberId in alliance.MemberIds.Distinct(StringComparer.Ordinal))
            {
                var memory = room.VisibilityMemory.GetOrAdd(memberId, _ => new PlayerVisibilityMemory());
                foreach (var (hexKey, rememberedHex) in rememberedHexes)
                {
                    memory.RememberedHexes[hexKey] = rememberedHex;
                }
            }

            player.ShareIntelCooldownUntil = now.Add(ShareIntelCooldown);
            return (rememberedHexes.Count, null);
        }
    }

    /// <summary>
    /// Attempts to intercept an Engineer's active sabotage on the same hex as the Scout.
    /// </summary>
    public (InterceptAttemptResult? result, string? error) AttemptIntercept(string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Intercept only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");
            if (!double.IsFinite(heading))
                return (null, "A valid heading is required to attempt an intercept.");

            var scout = room.State.Players.FirstOrDefault(player => player.Id == userId);
            if (scout == null)
                return (null, "Player not in room.");
            if (scout.Role != PlayerRole.Scout)
                return (null, "Only a Scout can attempt an intercept.");
            if (!GameplayService.TryGetCurrentHex(room.State, scout, out var scoutQ, out var scoutR)
                || !TryGetPlayerCoordinates(room.State, scout, out var scoutLat, out var scoutLng))
            {
                return (null, "Your location is required to attempt an intercept.");
            }

            PlayerDto? engineer = null;
            if (string.IsNullOrWhiteSpace(scout.InterceptTargetId))
            {
                engineer = room.State.Players
                    .Where(candidate => candidate.Id != scout.Id
                        && GameplayService.TryGetCurrentHex(room.State, candidate, out var candidateQ, out var candidateR)
                        && candidateQ == scoutQ
                        && candidateR == scoutR
                        && HasActiveSabotage(candidate)
                        && (scout.AllianceId == null || candidate.AllianceId != scout.AllianceId))
                    .OrderBy(candidate => TryGetPlayerCoordinates(room.State, candidate, out var candidateLat, out var candidateLng)
                        ? GetDistanceScore(scoutLat, scoutLng, candidateLat, candidateLng)
                        : double.MaxValue)
                    .FirstOrDefault();

                if (engineer == null)
                    return (new InterceptAttemptResult("noTarget"), null);

                scout.InterceptTargetId = engineer.Id;
                scout.InterceptLockStartAt = null;
            }
            else
            {
                engineer = room.State.Players.FirstOrDefault(candidate => candidate.Id == scout.InterceptTargetId);
            }

            if (engineer == null
                || !HasActiveSabotage(engineer)
                || !GameplayService.TryGetCurrentHex(room.State, engineer, out var engineerQ, out var engineerR)
                || engineerQ != scoutQ
                || engineerR != scoutR)
            {
                ClearInterceptTracking(scout);
                return (new InterceptAttemptResult("noTarget"), null);
            }

            if (!TryGetPlayerCoordinates(room.State, engineer, out var engineerLat, out var engineerLng))
            {
                ClearInterceptTracking(scout);
                return (new InterceptAttemptResult("noTarget"), null);
            }

            var normalizedHeading = HexService.NormalizeHeading(heading);
            var bearingToEngineer = HexService.BearingDegrees(scoutLat, scoutLng, engineerLat, engineerLng);
            var scoutFacingEngineer = HexService.HeadingDiff(normalizedHeading, bearingToEngineer) <= 20d;
            var reverseBearing = HexService.BearingDegrees(engineerLat, engineerLng, scoutLat, scoutLng);
            var engineerFacingScout = engineer.CurrentHeading.HasValue
                && HexService.HeadingDiff(HexService.NormalizeHeading(engineer.CurrentHeading.Value), reverseBearing) <= 90d;

            if (!scoutFacingEngineer || engineerFacingScout)
            {
                scout.InterceptLockStartAt = null;
                return (new InterceptAttemptResult("broken"), null);
            }

            var now = DateTime.UtcNow;
            if (!scout.InterceptLockStartAt.HasValue)
            {
                scout.InterceptLockStartAt = now;
                return (new InterceptAttemptResult("locking", 0d), null);
            }

            var elapsedSeconds = (now - scout.InterceptLockStartAt.Value).TotalSeconds;
            if (elapsedSeconds < 5d)
                return (new InterceptAttemptResult("locking", elapsedSeconds), null);

            var targetHexKey = HexService.Key(engineer.SabotageTargetQ!.Value, engineer.SabotageTargetR!.Value);
            GameplayService.ClearSabotageTracking(engineer);
            engineer.SabotageBlockedTiles[targetHexKey] = now.AddMinutes(5);
            ClearInterceptTracking(scout);

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (new InterceptAttemptResult("success"), null);
        }
    }
}
