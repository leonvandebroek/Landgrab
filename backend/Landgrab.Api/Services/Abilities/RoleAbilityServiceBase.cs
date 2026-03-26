using Landgrab.Api.Models;
using Landgrab.Api.Services;

namespace Landgrab.Api.Services.Abilities;

/// <summary>Marker interface enabling DI enumeration of all role ability services.</summary>
public interface IRoleAbilityService { }

/// <summary>
/// Provides shared helpers for all role ability service implementations.
/// Concrete services inherit this to avoid duplicating room-access and state-snapshot boilerplate.
/// </summary>
public abstract class RoleAbilityServiceBase(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService) : RoomScopedServiceBase(roomProvider, gameStateService), IRoleAbilityService
{
    /// <summary>
    /// Resolves the player's current hex cell.
    /// Returns false if the player has no current hex or it is not in the grid.
    /// </summary>
    protected static bool TryGetCurrentHex(GameState state, PlayerDto player, out HexCell cell)
    {
        cell = null!;
        if (!GameplayService.TryGetCurrentHex(state, player, out var q, out var r))
            return false;
        return state.Grid.TryGetValue(HexService.Key(q, r), out cell!) && cell is not null;
    }

    /// <summary>Returns true if the cell is owned by the player or a friendly alliance member.</summary>
    protected static bool IsFriendlyCell(PlayerDto player, HexCell cell) =>
        GameplayService.IsFriendlyCell(player, cell);

    /// <summary>
    /// Extracts the player's current hex coordinates and lat/lng.
    /// Returns false if any component is missing.
    /// </summary>
    protected static bool TryGetPlayerPosition(
        GameState state,
        PlayerDto player,
        out int currentQ,
        out int currentR,
        out double currentLat,
        out double currentLng)
    {
        currentLat = 0d;
        currentLng = 0d;

        if (!GameplayService.TryGetCurrentHex(state, player, out currentQ, out currentR)
            || !player.CurrentLat.HasValue
            || !player.CurrentLng.HasValue)
        {
            return false;
        }

        currentLat = player.CurrentLat.Value;
        currentLng = player.CurrentLng.Value;
        return true;
    }

    /// <summary>
    /// Extracts the player's physical coordinates.
    /// Falls back to hex-centre lat/lng when CurrentLat/Lng are not set.
    /// </summary>
    protected static bool TryGetPlayerCoordinates(
        GameState state,
        PlayerDto player,
        out double currentLat,
        out double currentLng)
    {
        currentLat = 0d;
        currentLng = 0d;

        if (player.CurrentLat.HasValue && player.CurrentLng.HasValue)
        {
            currentLat = player.CurrentLat.Value;
            currentLng = player.CurrentLng.Value;
            return true;
        }

        if (!state.HasMapLocation || !GameplayService.TryGetCurrentHex(state, player, out var currentQ, out var currentR))
            return false;

        (currentLat, currentLng) = HexService.HexToLatLng(
            currentQ,
            currentR,
            state.MapLat!.Value,
            state.MapLng!.Value,
            state.TileSizeMeters);
        return true;
    }

    /// <summary>Returns true if the player has an active sabotage mission.</summary>
    protected static bool HasActiveSabotage(PlayerDto player) =>
        player.SabotageTargetQ.HasValue && player.SabotageTargetR.HasValue;

    /// <summary>Clears intercept lock state from the scout player.</summary>
    protected static void ClearInterceptTracking(PlayerDto player)
    {
        player.InterceptTargetId = null;
        player.InterceptLockStartAt = null;
    }

    /// <summary>
    /// Removes expired sabotage-blocked tile entries from the player's tracking dictionary.
    /// </summary>
    protected static void CleanupExpiredSabotageBlockedTiles(PlayerDto player, DateTime now)
    {
        if (player.SabotageBlockedTiles.Count == 0)
            return;

        var expiredKeys = player.SabotageBlockedTiles
            .Where(entry => entry.Value <= now)
            .Select(entry => entry.Key)
            .ToList();

        foreach (var expiredKey in expiredKeys)
            player.SabotageBlockedTiles.Remove(expiredKey);
    }

    /// <summary>Formats a remaining duration as a human-readable string.</summary>
    protected static string FormatRemainingDuration(TimeSpan remaining)
    {
        var clampedRemaining = remaining <= TimeSpan.Zero ? TimeSpan.Zero : remaining;
        var totalSeconds = Math.Max(1, (int)Math.Ceiling(clampedRemaining.TotalSeconds));
        var minutes = totalSeconds / 60;
        var seconds = totalSeconds % 60;

        return minutes > 0
            ? $"{minutes}m {seconds}s"
            : $"{seconds}s";
    }

    /// <summary>Returns a distance² score between two lat/lng points (no sqrt needed for comparison).</summary>
    protected static double GetDistanceScore(double fromLat, double fromLng, double toLat, double toLng)
    {
        var latDiff = fromLat - toLat;
        var lngDiff = fromLng - toLng;
        return latDiff * latDiff + lngDiff * lngDiff;
    }

    /// <summary>
    /// Finds the adjacent hex in the player's grid that most closely matches the given heading.
    /// Returns null if no adjacent hex is within 30° of the heading or the player has no location.
    /// </summary>
    protected static (int targetQ, int targetR)? ResolveClosestAdjacentHex(
        GameState state,
        PlayerDto player,
        double heading)
    {
        if (!state.HasMapLocation
            || !TryGetPlayerPosition(state, player, out var currentQ, out var currentR, out var currentLat, out var currentLng))
        {
            return null;
        }

        var normalizedHeading = HexService.NormalizeHeading(heading);
        double? closestDiff = null;
        (int q, int r)? closestHex = null;

        foreach (var (candidateQ, candidateR) in HexService.Neighbors(currentQ, currentR))
        {
            if (!state.Grid.ContainsKey(HexService.Key(candidateQ, candidateR)))
                continue;

            var (candidateLat, candidateLng) = HexService.HexToLatLng(
                candidateQ,
                candidateR,
                state.MapLat!.Value,
                state.MapLng!.Value,
                state.TileSizeMeters);
            var candidateBearing = HexService.BearingDegrees(currentLat, currentLng, candidateLat, candidateLng);
            var headingDiff = HexService.HeadingDiff(normalizedHeading, candidateBearing);

            if (closestDiff is not null && headingDiff >= closestDiff.Value)
                continue;

            closestDiff = headingDiff;
            closestHex = (candidateQ, candidateR);
        }

        return closestDiff <= 30d ? closestHex : null;
    }
}
