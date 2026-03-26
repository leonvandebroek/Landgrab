using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

/// <summary>
/// Computes viewer-specific visibility, remembered enemy intelligence, and safe game-state projections.
/// </summary>
public class VisibilityService
{
    private const int VisibilityRadius = 1;
    private const int BeaconRange = 3;

    private static readonly HashSet<string> GameWideEventTypes =
    [
        "GameStarted",
        "GameOver",
        "HostAction",
        "HostMessage",
        "RandomEvent"
    ];

    /// <summary>
    /// Computes the currently visible hex keys for a viewer based on allied positions, personal beacons, and owned territory.
    /// </summary>
    public HashSet<string> ComputeVisibleHexKeys(GameState state, string viewerUserId)
    {
        var visibleHexKeys = new HashSet<string>(StringComparer.Ordinal);
        var viewer = state.Players.FirstOrDefault(player => player.Id == viewerUserId);
        if (viewer is null)
        {
            return visibleHexKeys;
        }

        var viewerAllianceId = viewer.AllianceId;
        var alliedPlayers = state.Players
            .Where(player => IsAlliedPlayer(player, viewerUserId, viewerAllianceId))
            .ToList();

        foreach (var alliedPlayer in alliedPlayers)
        {
            if (!HasValidCurrentHexForVisibility(alliedPlayer))
            {
                continue;
            }

            var currentHexQ = alliedPlayer.CurrentHexQ.GetValueOrDefault();
            var currentHexR = alliedPlayer.CurrentHexR.GetValueOrDefault();
            AddRadiusKeys(state, visibleHexKeys, currentHexQ, currentHexR, VisibilityRadius);
        }

        if (state.HasMapLocation && viewer.IsBeacon && viewer.BeaconLat.HasValue && viewer.BeaconLng.HasValue)
        {
            var beaconSectorKeys = ComputeBeaconSectorKeys(state, viewer);
            foreach (var beaconKey in beaconSectorKeys)
            {
                visibleHexKeys.Add(beaconKey);
            }
        }

        if (!string.IsNullOrWhiteSpace(viewerAllianceId))
        {
            foreach (var (key, cell) in state.Grid)
            {
                if (cell.OwnerAllianceId == viewerAllianceId)
                {
                    visibleHexKeys.Add(key);
                }
            }

            AddAllianceBorderHostileKeys(state, visibleHexKeys, viewerAllianceId);
        }

        return visibleHexKeys;
    }

    /// <summary>
    /// Refreshes remembered hostile intel for a viewer and shares it across the viewer's alliance.
    /// </summary>
    public void UpdateMemory(
        GameRoom room,
        GameState state,
        string viewerUserId,
        string viewerAllianceId,
        HashSet<string> visibleHexKeys)
    {
        var viewer = state.Players.FirstOrDefault(player => player.Id == viewerUserId);
        if (viewer is null)
        {
            return;
        }

        var alliedUserIds = GetSharedMemoryRecipients(state, viewerUserId, viewerAllianceId);
        var sharedMemories = alliedUserIds
            .Distinct(StringComparer.Ordinal)
            .Where(userId => userId != viewerUserId)
            .Select(userId => room.VisibilityMemory.GetOrAdd(userId, _ => new PlayerVisibilityMemory()))
            .ToList();
        var viewerMemory = room.VisibilityMemory.GetOrAdd(viewerUserId, _ => new PlayerVisibilityMemory());
        var beaconSectorKeys = ComputeBeaconSectorKeys(state, viewer);

        var now = DateTime.UtcNow;

        foreach (var key in visibleHexKeys)
        {
            if (!state.Grid.TryGetValue(key, out var cell) || !IsHostileCell(cell, viewerAllianceId))
            {
                continue;
            }

            var rememberedHex = new RememberedHex(
                cell.OwnerId,
                cell.OwnerName,
                cell.OwnerColor,
                cell.OwnerAllianceId,
                cell.Troops,
                cell.IsFort,
                cell.IsMasterTile,
                now);

            viewerMemory.RememberedHexes[key] = rememberedHex;

            if (beaconSectorKeys.Contains(key))
            {
                continue;
            }

            foreach (var memory in sharedMemories)
            {
                memory.RememberedHexes[key] = rememberedHex;
            }
        }

        var alliedSightingMemories = new List<PlayerVisibilityMemory>(sharedMemories.Count + 1)
        {
            viewerMemory
        };
        alliedSightingMemories.AddRange(sharedMemories);

        foreach (var player in state.Players)
        {
            if (player.Id == viewerUserId || IsAlliedPlayer(player, viewerUserId, viewerAllianceId))
            {
                continue;
            }

            if (!TryGetPlayerHexKey(player, out var playerHexKey) || !visibleHexKeys.Contains(playerHexKey))
            {
                continue;
            }

            if (!TryGetPlayerCoordinates(state, player, out var lat, out var lng))
            {
                continue;
            }

            var sighting = new PlayerSighting(
                lat,
                lng,
                player.CurrentHexQ!.Value,
                player.CurrentHexR!.Value,
                now);

            foreach (var memory in alliedSightingMemories)
            {
                memory.PlayerSightings[player.Id] = sighting;
            }
        }
    }

    /// <summary>
    /// Builds a viewer-safe projection of a snapshot game state.
    /// </summary>
    public GameState BuildStateForViewer(
        GameState snapshotState,
        string viewerUserId,
        PlayerVisibilityMemory memory,
        HashSet<string> visibleHexKeys,
        bool isHostObserver,
        int enemySightingMemorySeconds)
    {
        if (isHostObserver)
        {
            return snapshotState;
        }

        var viewerAllianceId = snapshotState.Players
            .FirstOrDefault(player => player.Id == viewerUserId)
            ?.AllianceId;
        var now = DateTime.UtcNow;
        var rememberCutoff = now.AddSeconds(-Math.Max(0, enemySightingMemorySeconds));

        foreach (var (key, cell) in snapshotState.Grid)
        {
            var isFriendlyOrNeutral = string.IsNullOrEmpty(cell.OwnerId)
                || (!string.IsNullOrWhiteSpace(viewerAllianceId) && cell.OwnerAllianceId == viewerAllianceId);

            if (isFriendlyOrNeutral || visibleHexKeys.Contains(key))
            {
                cell.VisibilityTier = VisibilityTier.Visible;
                continue;
            }

            if (memory.RememberedHexes.TryGetValue(key, out var rememberedHex))
            {
                if (enemySightingMemorySeconds <= 0 || rememberedHex.SeenAt < rememberCutoff)
                {
                    memory.RememberedHexes.Remove(key);
                    cell.VisibilityTier = VisibilityTier.Hidden;
                    continue;
                }

                ApplyRememberedCell(cell, rememberedHex);
                continue;
            }

            cell.VisibilityTier = VisibilityTier.Hidden;
        }

        foreach (var player in snapshotState.Players)
        {
            if (IsAlliedPlayer(player, viewerUserId, viewerAllianceId))
            {
                continue;
            }

            var isVisible = TryGetPlayerHexKey(player, out var currentHexKey)
                && visibleHexKeys.Contains(currentHexKey);

            if (isVisible)
            {
                SanitizeHostilePlayer(player, keepPosition: true);
                continue;
            }

            PlayerSighting? sighting = null;
            var hasRecentSighting = enemySightingMemorySeconds > 0
                && memory.PlayerSightings.TryGetValue(player.Id, out sighting)
                && sighting.SeenAt >= now.AddSeconds(-enemySightingMemorySeconds);

            if (hasRecentSighting)
            {
                player.CurrentLat = sighting!.Lat;
                player.CurrentLng = sighting.Lng;
                player.CurrentHexQ = sighting.HexQ;
                player.CurrentHexR = sighting.HexR;
                SanitizeHostilePlayer(player, keepPosition: true);
                continue;
            }

            SanitizeHostilePlayer(player, keepPosition: false);
        }

        foreach (var alliance in snapshotState.Alliances)
        {
            if (alliance.Id == viewerAllianceId)
            {
                continue;
            }

            var hqVisible = alliance.HQHexQ.HasValue
                && alliance.HQHexR.HasValue
                && visibleHexKeys.Contains(HexService.Key(alliance.HQHexQ.Value, alliance.HQHexR.Value));

            if (!hqVisible)
            {
                alliance.HQHexQ = null;
                alliance.HQHexR = null;
                alliance.ClaimFrozenUntil = null;
            }
        }

        snapshotState.ActiveRaids = snapshotState.ActiveRaids
            .Where(raid => raid.InitiatorAllianceId == viewerAllianceId
                || visibleHexKeys.Contains(HexService.Key(raid.TargetQ, raid.TargetR)))
            .ToList();

        snapshotState.EventLog = snapshotState.EventLog
            .Where(entry =>
                (!string.IsNullOrWhiteSpace(viewerAllianceId) && entry.AllianceId == viewerAllianceId)
                || (entry.Q.HasValue
                    && entry.R.HasValue
                    && visibleHexKeys.Contains(HexService.Key(entry.Q.Value, entry.R.Value)))
                || GameWideEventTypes.Contains(entry.Type))
            .ToList();

        if (snapshotState.ContestedEdges is not null)
        {
            snapshotState.ContestedEdges = snapshotState.ContestedEdges
                .Where(edge =>
                    visibleHexKeys.Contains(edge.HexKeyA)
                    || visibleHexKeys.Contains(edge.HexKeyB)
                    || IsOwnedByAlliance(snapshotState.Grid, edge.HexKeyA, viewerAllianceId)
                    || IsOwnedByAlliance(snapshotState.Grid, edge.HexKeyB, viewerAllianceId))
                .ToList();
        }

        return snapshotState;
    }

    /// <summary>
    /// Computes the visible sector hex keys contributed by a beacon player.
    /// </summary>
    public HashSet<string> ComputeBeaconSectorKeys(GameState state, PlayerDto player)
    {
        var visibleHexKeys = new HashSet<string>(StringComparer.Ordinal);
        if (!state.HasMapLocation || !player.IsBeacon || !player.BeaconLat.HasValue || !player.BeaconLng.HasValue)
        {
            return visibleHexKeys;
        }

        var beaconHex = HexService.LatLngToHexForRoom(
            player.BeaconLat.Value,
            player.BeaconLng.Value,
            state.MapLat!.Value,
            state.MapLng!.Value,
            state.TileSizeMeters);

        if (player.BeaconHeading.HasValue)
        {
            AddSectorKeys(
                state,
                visibleHexKeys,
                beaconHex.q,
                beaconHex.r,
                player.BeaconLat.Value,
                player.BeaconLng.Value,
                player.BeaconHeading.Value,
                BeaconRange,
                state.Dynamics.BeaconSectorAngle);
        }
        else if (state.Grid.ContainsKey(HexService.Key(beaconHex.q, beaconHex.r)))
        {
            visibleHexKeys.Add(HexService.Key(beaconHex.q, beaconHex.r));
        }

        return visibleHexKeys;
    }

    private static void AddRadiusKeys(
        GameState state,
        HashSet<string> visibleHexKeys,
        int centerQ,
        int centerR,
        int radius)
    {
        foreach (var cell in state.Grid.Values)
        {
            if (HexService.HexDistance(cell.Q - centerQ, cell.R - centerR) <= radius)
            {
                visibleHexKeys.Add(HexService.Key(cell.Q, cell.R));
            }
        }
    }

    private static void AddSectorKeys(
        GameState state,
        HashSet<string> visibleHexKeys,
        int centerQ,
        int centerR,
        double beaconLat,
        double beaconLng,
        double heading,
        int range,
        int sectorAngle)
    {
        var centerKey = HexService.Key(centerQ, centerR);
        if (state.Grid.ContainsKey(centerKey))
        {
            visibleHexKeys.Add(centerKey);
        }

        var normalizedHeading = HexService.NormalizeHeading(heading);
        var halfSectorAngle = Math.Clamp(sectorAngle, 1, 360) / 2d;

        foreach (var (candidateQ, candidateR) in HexService.SpiralSearch(centerQ, centerR, range))
        {
            if (HexService.HexDistance(centerQ, centerR, candidateQ, candidateR) > range)
                continue;

            var candidateKey = HexService.Key(candidateQ, candidateR);
            if (!state.Grid.ContainsKey(candidateKey))
                continue;

            if (candidateQ == centerQ && candidateR == centerR)
            {
                visibleHexKeys.Add(candidateKey);
                continue;
            }

            var (candidateLat, candidateLng) = HexService.HexToLatLng(
                candidateQ,
                candidateR,
                state.MapLat!.Value,
                state.MapLng!.Value,
                state.TileSizeMeters);
            var candidateBearing = HexService.BearingDegrees(beaconLat, beaconLng, candidateLat, candidateLng);

            if (HexService.HeadingDiff(normalizedHeading, candidateBearing) <= halfSectorAngle)
            {
                visibleHexKeys.Add(candidateKey);
            }
        }
    }

    private static void ApplyRememberedCell(HexCell cell, RememberedHex rememberedHex)
    {
        cell.VisibilityTier = VisibilityTier.Remembered;
        cell.LastKnownTroops = rememberedHex.Troops;
        cell.LastKnownOwnerId = rememberedHex.OwnerId;
        cell.LastKnownOwnerName = rememberedHex.OwnerName;
        cell.LastKnownOwnerColor = rememberedHex.OwnerColor;
        cell.LastKnownOwnerAllianceId = rememberedHex.OwnerAllianceId;
        cell.LastKnownIsFort = rememberedHex.IsFort;
        cell.LastKnownIsMasterTile = rememberedHex.IsMasterTile;
        cell.LastSeenAt = rememberedHex.SeenAt;
    }

    private static List<string> GetSharedMemoryRecipients(GameState state, string viewerUserId, string viewerAllianceId)
    {
        if (string.IsNullOrWhiteSpace(viewerAllianceId))
        {
            return [viewerUserId];
        }

        var alliance = state.Alliances.FirstOrDefault(candidate => candidate.Id == viewerAllianceId);
        if (alliance is not null && alliance.MemberIds.Count > 0)
        {
            return alliance.MemberIds.Distinct(StringComparer.Ordinal).ToList();
        }

        return state.Players
            .Where(player => player.AllianceId == viewerAllianceId)
            .Select(player => player.Id)
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static bool IsAlliedPlayer(PlayerDto player, string viewerUserId, string? viewerAllianceId)
    {
        if (!string.IsNullOrWhiteSpace(viewerAllianceId))
        {
            return player.AllianceId == viewerAllianceId;
        }

        return player.Id == viewerUserId;
    }

    private static bool IsHostileCell(HexCell cell, string viewerAllianceId)
    {
        return !string.IsNullOrWhiteSpace(cell.OwnerId)
            && cell.OwnerAllianceId != viewerAllianceId;
    }

    private static bool IsOwnedByAlliance(
        IReadOnlyDictionary<string, HexCell> grid,
        string hexKey,
        string? viewerAllianceId)
    {
        return !string.IsNullOrWhiteSpace(viewerAllianceId)
            && grid.TryGetValue(hexKey, out var cell)
            && cell.OwnerAllianceId == viewerAllianceId;
    }

    private static bool HasValidCurrentHexForVisibility(PlayerDto player)
    {
        return player.CurrentHexQ.HasValue
            && player.CurrentHexR.HasValue
            && !(player.CurrentHexQ.Value == 0 && player.CurrentHexR.Value == 0);
    }

    private static void AddAllianceBorderHostileKeys(
        GameState state,
        HashSet<string> visibleHexKeys,
        string viewerAllianceId)
    {
        foreach (var cell in state.Grid.Values)
        {
            if (cell.OwnerAllianceId != viewerAllianceId)
            {
                continue;
            }

            foreach (var (neighborQ, neighborR) in HexService.Neighbors(cell.Q, cell.R))
            {
                var neighborKey = HexService.Key(neighborQ, neighborR);
                if (!state.Grid.TryGetValue(neighborKey, out var neighborCell) || !IsHostileCell(neighborCell, viewerAllianceId))
                {
                    continue;
                }

                visibleHexKeys.Add(neighborKey);
            }
        }
    }

    private static void SanitizeHostilePlayer(PlayerDto player, bool keepPosition)
    {
        if (!keepPosition)
        {
            player.CurrentLat = null;
            player.CurrentLng = null;
            player.CurrentHexQ = null;
            player.CurrentHexR = null;
        }

        player.IsHost = false;
        player.CarriedTroops = 0;
        player.CarriedTroopsSourceQ = null;
        player.CarriedTroopsSourceR = null;
    player.CurrentHeading = null;
        player.Role = PlayerRole.None;
        player.IsBeacon = false;
        player.BeaconLat = null;
        player.BeaconLng = null;
        player.BeaconHeading = null;
        player.ShareIntelCooldownUntil = null;
        player.CommandoRaidCooldownUntil = null;
        player.TacticalStrikeActive = false;
        player.TacticalStrikeExpiry = null;
        player.TacticalStrikeCooldownUntil = null;
        player.TacticalStrikeTargetQ = null;
        player.TacticalStrikeTargetR = null;
        player.RallyPointActive = false;
        player.RallyPointDeadline = null;
        player.RallyPointCooldownUntil = null;
        player.RallyPointQ = null;
        player.RallyPointR = null;
        player.SabotageAlertNearby = false;
        player.InterceptTargetId = null;
        player.InterceptLockStartAt = null;
        player.FortTargetQ = null;
        player.FortTargetR = null;
        player.FortPerimeterVisited.Clear();
        player.SabotageTargetQ = null;
        player.SabotageTargetR = null;
        player.SabotagePerimeterVisited.Clear();
        player.SabotageCooldownUntil = null;
        player.SabotageBlockedTiles.Clear();
        player.DemolishTargetKey = null;
        player.DemolishApproachDirectionsMade.Clear();
        player.DemolishFacingLockStartAt = null;
        player.DemolishFacingHexKey = null;
        player.PreviousHexKey = null;
        player.DemolishCooldownUntil = null;
    }

    private static bool TryGetPlayerCoordinates(
        GameState state,
        PlayerDto player,
        out double lat,
        out double lng)
    {
        if (player.CurrentLat.HasValue && player.CurrentLng.HasValue)
        {
            lat = player.CurrentLat.Value;
            lng = player.CurrentLng.Value;
            return true;
        }

        if (state.HasMapLocation && player.CurrentHexQ.HasValue && player.CurrentHexR.HasValue)
        {
            (lat, lng) = HexService.HexToLatLng(
                player.CurrentHexQ.Value,
                player.CurrentHexR.Value,
                state.MapLat!.Value,
                state.MapLng!.Value,
                state.TileSizeMeters);
            return true;
        }

        lat = 0;
        lng = 0;
        return false;
    }

    private static bool TryGetPlayerHexKey(PlayerDto player, out string hexKey)
    {
        if (player.CurrentHexQ.HasValue && player.CurrentHexR.HasValue)
        {
            hexKey = HexService.Key(player.CurrentHexQ.Value, player.CurrentHexR.Value);
            return true;
        }

        hexKey = string.Empty;
        return false;
    }
}
