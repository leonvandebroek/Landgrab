using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Services;

/// <summary>
/// Centralizes per-viewer SignalR projections so active Alliances gameplay broadcasts respect fog-of-war.
/// </summary>
public class VisibilityBroadcastHelper(VisibilityService visibilityService)
{
    /// <summary>
    /// Broadcasts the latest state to all connected room members, projecting a viewer-safe state during active Alliances gameplay.
    /// </summary>
    public async Task BroadcastPerViewer(
        GameRoom room,
        GameState state,
        IClientProxy groupProxy,
        Func<string, IClientProxy> clientProxy,
        DerivedMapStateService derivedMapStateService,
        string? aliasEvent = null)
    {
        ArgumentNullException.ThrowIfNull(room);
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(groupProxy);
        ArgumentNullException.ThrowIfNull(clientProxy);
        ArgumentNullException.ThrowIfNull(derivedMapStateService);

        if (!RequiresPerViewerProjection(state))
        {
            var sharedState = CreateSharedState(state, derivedMapStateService);
            if (!string.IsNullOrWhiteSpace(aliasEvent))
            {
                await groupProxy.SendAsync(aliasEvent, sharedState);
            }

            await groupProxy.SendAsync("StateUpdated", sharedState);
            await BroadcastGameOverPerConnection(room, sharedState, clientProxy);
            return;
        }

        foreach (var (connectionId, viewerUserId) in room.ConnectionMap)
        {
            var viewerState = CreateStateForViewer(room, state, viewerUserId, derivedMapStateService);
            var proxy = clientProxy(connectionId);

            if (!string.IsNullOrWhiteSpace(aliasEvent))
            {
                await proxy.SendAsync(aliasEvent, viewerState);
            }

            await proxy.SendAsync("StateUpdated", viewerState);
            if (viewerState.Phase == GamePhase.GameOver)
            {
                await proxy.SendAsync("GameOver", BuildGameOverPayload(viewerState));
            }
        }
    }

    /// <summary>
    /// Broadcasts the lightweight player movement payload, filtering hostile players that are not currently visible to each viewer.
    /// </summary>
    public async Task BroadcastPlayersPerViewer(
        GameRoom room,
        GameState state,
        Func<string, IClientProxy> clientProxy,
        VisibilityService visibilityService)
    {
        ArgumentNullException.ThrowIfNull(room);
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(clientProxy);
        ArgumentNullException.ThrowIfNull(visibilityService);

        foreach (var (connectionId, viewerUserId) in room.ConnectionMap)
        {
            var players = CreatePlayersForViewer(room, state, viewerUserId, visibilityService);
            await clientProxy(connectionId).SendAsync("PlayersMoved", players);
        }
    }

    /// <summary>
    /// Creates the state that a specific viewer is allowed to observe.
    /// </summary>
    public GameState CreateStateForViewer(
        GameRoom room,
        GameState state,
        string viewerUserId,
        DerivedMapStateService derivedMapStateService)
    {
        ArgumentNullException.ThrowIfNull(room);
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(viewerUserId);
        ArgumentNullException.ThrowIfNull(derivedMapStateService);

        if (!RequiresPerViewerProjection(state))
        {
            return CreateSharedState(state, derivedMapStateService);
        }

        var memory = room.VisibilityMemory.GetOrAdd(viewerUserId, _ => new PlayerVisibilityMemory());
        var visibleHexKeys = visibilityService.ComputeVisibleHexKeys(state, viewerUserId);
        var viewerAllianceId = state.Players.FirstOrDefault(player => player.Id == viewerUserId)?.AllianceId ?? string.Empty;

        visibilityService.UpdateMemory(room, state, viewerUserId, viewerAllianceId, visibleHexKeys);

        var viewerState = GameStateCommon.SnapshotState(state);
        var isHostObserver = room.State.HostObserverMode && GameStateCommon.IsHost(room, viewerUserId);
        visibilityService.BuildStateForViewer(
            viewerState,
            viewerUserId,
            memory,
            visibleHexKeys,
            isHostObserver,
            state.Dynamics.EnemySightingMemorySeconds);

        derivedMapStateService.ComputeAndAttach(viewerState);
        return viewerState;
    }

    private static async Task BroadcastGameOverPerConnection(
        GameRoom room,
        GameState state,
        Func<string, IClientProxy> clientProxy)
    {
        if (state.Phase != GamePhase.GameOver)
        {
            return;
        }

        var payload = BuildGameOverPayload(state);
        foreach (var connectionId in room.ConnectionMap.Keys)
        {
            await clientProxy(connectionId).SendAsync("GameOver", payload);
        }
    }

    private static object BuildGameOverPayload(GameState state)
    {
        return new
        {
            state.WinnerId,
            state.WinnerName,
            state.IsAllianceVictory
        };
    }

    private static GameState CreateSharedState(GameState state, DerivedMapStateService derivedMapStateService)
    {
        var sharedState = GameStateCommon.SnapshotState(state);
        derivedMapStateService.ComputeAndAttach(sharedState);
        return sharedState;
    }

    private static bool RequiresPerViewerProjection(GameState state)
    {
        return state.Phase == GamePhase.Playing && state.GameMode == GameMode.Alliances;
    }

    private static List<PlayerDto> CreatePlayersForViewer(
        GameRoom room,
        GameState state,
        string viewerUserId,
        VisibilityService visibilityService)
    {
        if (!RequiresPerViewerProjection(state))
        {
            return state.Players.Select(ClonePlayer).ToList();
        }

        var isHostObserver = room.State.HostObserverMode && GameStateCommon.IsHost(room, viewerUserId);
        if (isHostObserver)
        {
            return state.Players.Select(ClonePlayer).ToList();
        }

        var viewerAllianceId = state.Players.FirstOrDefault(player => player.Id == viewerUserId)?.AllianceId;
        var visibleHexKeys = visibilityService.ComputeVisibleHexKeys(state, viewerUserId);
        var projectedPlayers = new List<PlayerDto>(state.Players.Count);

        foreach (var player in state.Players)
        {
            var isAllied = IsAlliedPlayer(player, viewerUserId, viewerAllianceId);
            if (isAllied)
            {
                projectedPlayers.Add(ClonePlayer(player));
                continue;
            }

            var isVisible = player.CurrentHexQ.HasValue
                && player.CurrentHexR.HasValue
                && visibleHexKeys.Contains(HexService.Key(player.CurrentHexQ.Value, player.CurrentHexR.Value));

            if (!isVisible)
            {
                continue;
            }

            var visibleHostile = ClonePlayer(player);
            SanitizeHostilePlayer(visibleHostile, keepPosition: true);
            projectedPlayers.Add(visibleHostile);
        }

        return projectedPlayers;
    }

    private static bool IsAlliedPlayer(PlayerDto player, string viewerUserId, string? viewerAllianceId)
    {
        if (!string.IsNullOrWhiteSpace(viewerAllianceId))
        {
            return player.AllianceId == viewerAllianceId;
        }

        return player.Id == viewerUserId;
    }

    private static PlayerDto ClonePlayer(PlayerDto player)
    {
        return new PlayerDto
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
            ShareIntelCooldownUntil = player.ShareIntelCooldownUntil,
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
        };
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
}
