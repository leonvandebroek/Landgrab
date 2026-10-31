using Landgrab.Api.Models;

namespace Landgrab.Api.Services.Abilities;

/// <summary>
/// Evaluates per-player Engineer role progress on every movement tick.
/// Invalidates Fort Construction, Sabotage, and Demolish missions when preconditions are violated.
/// No injected dependencies — all data is passed as parameters.
/// </summary>
public sealed class RoleProgressService
{
    /// <summary>
    /// Checks fort construction progress for the given player.
    /// Invalidates the mission if ownership is lost; completes it when all 6 perimeter hexes are visited.
    /// </summary>
    /// <returns>true if any hex grid cell changed state (triggers broadcast).</returns>
    public bool UpdateFortProgress(GameState state, PlayerDto player, string? currentHexKey)
    {
        if (player.Role != PlayerRole.Engineer
            || !player.FortTargetQ.HasValue
            || !player.FortTargetR.HasValue)
            return false;

        var targetKey = HexService.Key(player.FortTargetQ.Value, player.FortTargetR.Value);
        if (!state.Grid.TryGetValue(targetKey, out var targetCell) || targetCell.OwnerId != player.Id)
        {
            var invalidatedQ = player.FortTargetQ;
            var invalidatedR = player.FortTargetR;
            GameplayService.ClearFortConstructionTracking(player);
            GameStateCommon.AppendEventLog(state, new GameEventLogEntry
            {
                Type = "FortConstructionInvalidated",
                Message = $"{player.Name}'s fort construction was invalidated.",
                PlayerId = player.Id,
                PlayerName = player.Name,
                Q = invalidatedQ,
                R = invalidatedR
            });
            return true;
        }

        if (string.IsNullOrEmpty(currentHexKey))
            return false;

        var perimeterKeys = HexService.Neighbors(player.FortTargetQ.Value, player.FortTargetR.Value)
            .Select(neighbor => HexService.Key(neighbor.q, neighbor.r))
            .ToHashSet(StringComparer.Ordinal);

        var stateChanged = false;
        if (perimeterKeys.Contains(currentHexKey)
            && !player.FortPerimeterVisited.Contains(currentHexKey, StringComparer.Ordinal))
        {
            player.FortPerimeterVisited.Add(currentHexKey);
            stateChanged = true;
        }

        if (player.FortPerimeterVisited.Count < 6)
            return stateChanged;

        // Redundant no-op kept from original for parity; assignment below is the real write.
        if (!targetCell.IsFort)
        {
            targetCell.IsFort = false;
        }

        targetCell.IsFort = true;
        GameplayService.ClearFortConstructionTracking(player);
        GameStateCommon.AppendEventLog(state, new GameEventLogEntry
        {
            Type = "FortBuilt",
            Message = $"{player.Name} completed fort construction at ({targetCell.Q}, {targetCell.R}).",
            PlayerId = player.Id,
            PlayerName = player.Name,
            Q = targetCell.Q,
            R = targetCell.R
        });
        return true;
    }

    /// <summary>
    /// Checks sabotage progress for the given player.
    /// Invalidates the mission if the target is no longer enemy-owned;
    /// completes it when 3 perimeter hexes have been visited.
    /// </summary>
    /// <returns>true if any hex grid cell changed state (triggers broadcast).</returns>
    public bool UpdateSabotageProgress(GameState state, PlayerDto player, string? currentHexKey)
    {
        if (player.Role != PlayerRole.Engineer
            || !player.SabotageTargetQ.HasValue
            || !player.SabotageTargetR.HasValue)
            return false;

        var targetKey = HexService.Key(player.SabotageTargetQ.Value, player.SabotageTargetR.Value);
        if (!state.Grid.TryGetValue(targetKey, out var targetCell)
            || targetCell.OwnerId == null
            || GameplayService.IsFriendlyCell(player, targetCell))
        {
            var invalidatedQ = player.SabotageTargetQ;
            var invalidatedR = player.SabotageTargetR;
            GameplayService.ClearSabotageTracking(player);
            GameStateCommon.AppendEventLog(state, new GameEventLogEntry
            {
                Type = "SabotageInvalidated",
                Message = $"{player.Name}'s sabotage was invalidated.",
                PlayerId = player.Id,
                PlayerName = player.Name,
                Q = invalidatedQ,
                R = invalidatedR
            });
            return true;
        }

        if (string.IsNullOrEmpty(currentHexKey))
            return false;

        var perimeterKeys = HexService.Neighbors(player.SabotageTargetQ.Value, player.SabotageTargetR.Value)
            .Select(neighbor => HexService.Key(neighbor.q, neighbor.r))
            .ToHashSet(StringComparer.Ordinal);

        var stateChanged = false;
        if (perimeterKeys.Contains(currentHexKey)
            && !player.SabotagePerimeterVisited.Contains(currentHexKey, StringComparer.Ordinal))
        {
            player.SabotagePerimeterVisited.Add(currentHexKey);
            stateChanged = true;
        }

        if (player.SabotagePerimeterVisited.Count < 3)
            return stateChanged;

        targetCell.SabotagedUntil = DateTime.UtcNow.AddMinutes(10);
        player.SabotageCooldownUntil = DateTime.UtcNow.AddMinutes(20);
        GameplayService.ClearSabotageTracking(player);
        GameStateCommon.AppendEventLog(state, new GameEventLogEntry
        {
            Type = "SabotageComplete",
            Message = $"Sabotage complete! ({targetCell.Q}, {targetCell.R}) will not regenerate troops for 10 minutes.",
            PlayerId = player.Id,
            PlayerName = player.Name,
            Q = targetCell.Q,
            R = targetCell.R
        });
        return true;
    }

    /// <summary>
    /// Checks demolish progress for the given player.
    /// Invalidates when the target fort no longer qualifies; completes after 3 facing-lock approaches.
    /// </summary>
    /// <returns>true if any hex grid cell changed state (triggers broadcast).</returns>
    public bool UpdateDemolishProgress(GameState state, PlayerDto player, string? currentHexKey)
    {
        if (player.Role != PlayerRole.Engineer || string.IsNullOrEmpty(player.DemolishTargetKey))
            return false;

        var (targetQ, targetR) = GameplayService.GetHexCoordinatesFromKey(state, player.DemolishTargetKey);
        if (targetQ is null || targetR is null
            || !state.Grid.TryGetValue(player.DemolishTargetKey, out var targetCell)
            || !targetCell.IsFort
            || targetCell.OwnerId == null
            || GameplayService.IsFriendlyCell(player, targetCell))
        {
            var (invalidatedQ, invalidatedR) = GameplayService.GetHexCoordinatesFromKey(state, player.DemolishTargetKey);
            GameplayService.ClearDemolishTracking(player);
            GameStateCommon.AppendEventLog(state, new GameEventLogEntry
            {
                Type = "DemolishInvalidated",
                Message = $"{player.Name}'s demolish mission was invalidated.",
                PlayerId = player.Id,
                PlayerName = player.Name,
                Q = invalidatedQ,
                R = invalidatedR
            });
            return true;
        }

        if (string.IsNullOrEmpty(currentHexKey)
            || !GameplayService.TryGetCurrentHex(state, player, out var playerQ, out var playerR)
            || !state.HasMapLocation
            || !player.CurrentLat.HasValue
            || !player.CurrentLng.HasValue
            || !player.CurrentHeading.HasValue)
        {
            return GameplayService.ClearDemolishFacingLock(player);
        }

        var isAdjacentToTarget = HexService.HexDistance(playerQ, playerR, targetQ.Value, targetR.Value) == 1;
        var (targetLat, targetLng) = HexService.HexToLatLng(
            targetQ.Value,
            targetR.Value,
            state.MapLat!.Value,
            state.MapLng!.Value,
            state.TileSizeMeters);
        var bearingToTarget = HexService.BearingDegrees(
            player.CurrentLat.Value,
            player.CurrentLng.Value,
            targetLat,
            targetLng);
        var facingTarget = HexService.HeadingDiff(
            HexService.NormalizeHeading(player.CurrentHeading.Value),
            bearingToTarget) <= 20d;

        if (!isAdjacentToTarget || !facingTarget)
            return GameplayService.ClearDemolishFacingLock(player);

        if (string.Equals(player.DemolishFacingHexKey, currentHexKey, StringComparison.Ordinal)
            && player.DemolishFacingLockStartAt.HasValue)
        {
            var elapsedSeconds = (DateTime.UtcNow - player.DemolishFacingLockStartAt.Value).TotalSeconds;
            if (elapsedSeconds < 5d)
                return false;

            if (!player.DemolishApproachDirectionsMade.Contains(currentHexKey, StringComparer.Ordinal))
                player.DemolishApproachDirectionsMade.Add(currentHexKey);

            GameplayService.ClearDemolishFacingLock(player);

            if (player.DemolishApproachDirectionsMade.Count < 3)
                return true;

            targetCell.IsFort = false;
            player.DemolishCooldownUntil = DateTime.UtcNow.AddMinutes(30);
            GameplayService.ClearDemolishTracking(player);
            GameStateCommon.AppendEventLog(state, new GameEventLogEntry
            {
                Type = "DemolishCompleted",
                Message = $"{player.Name} demolished the fort at ({targetCell.Q}, {targetCell.R}).",
                PlayerId = player.Id,
                PlayerName = player.Name,
                Q = targetCell.Q,
                R = targetCell.R
            });
            GameplayService.InvalidateEngineerMissionsForHex(state, targetCell);
            return true;
        }

        if (string.Equals(player.DemolishFacingHexKey, currentHexKey, StringComparison.Ordinal)
            && player.DemolishFacingLockStartAt.HasValue)
        {
            return false;
        }

        player.DemolishFacingHexKey = currentHexKey;
        player.DemolishFacingLockStartAt = DateTime.UtcNow;
        return true;
    }
}
