using Landgrab.Api.Hubs;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Services;

/// <summary>
/// Drives the virtual (bot) players of test mode: every tick each bot moves and may act,
/// and the result is broadcast to the human players exactly like a real player's update.
/// </summary>
public sealed class VirtualPlayerHostedService(
    GameService gameService,
    VirtualPlayerService virtualPlayerService,
    IHubContext<GameHub> hubContext,
    VisibilityService visibilityService,
    VisibilityBroadcastHelper visibilityBroadcastHelper,
    DerivedMapStateService derivedMapStateService,
    ILogger<VirtualPlayerHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromSeconds(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval);

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var roomCode in gameService.GetPlayingRoomCodes())
            {
                try
                {
                    await TickRoom(roomCode);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Virtual player tick failed for room {RoomCode}.", roomCode);
                }
            }
        }
    }

    private async Task TickRoom(string roomCode)
    {
        var room = gameService.GetRoom(roomCode);
        if (room == null)
            return;

        var result = virtualPlayerService.Tick(roomCode, TickInterval);
        if (!result.HasVirtualPlayers || result.State == null || !result.AnyMoved)
            return;

        var state = result.State;

        foreach (var battleId in result.FledBattleIds)
        {
            var (resolvedState, resolveResult, resolveError) = gameService.ResolveFieldBattle(roomCode, battleId);
            if (resolveError is null && resolvedState is not null && resolveResult is not null)
            {
                foreach (var pid in resolveResult.AllParticipantIds)
                    await hubContext.Clients.User(pid).SendAsync("FieldBattleResolved", resolveResult);
                state = resolvedState;
                result.GridChanged = true;
            }
        }

        if (result.GridChanged)
        {
            await visibilityBroadcastHelper.BroadcastPerViewer(
                room,
                state,
                hubContext.Clients.Group(roomCode),
                connectionId => hubContext.Clients.Client(connectionId),
                derivedMapStateService);
        }
        else
        {
            await visibilityBroadcastHelper.BroadcastPlayersPerViewer(
                room,
                state,
                connectionId => hubContext.Clients.Client(connectionId),
                visibilityService);
        }

        foreach (var lost in result.TilesLost)
        {
            foreach (var (connectionId, userId) in room.ConnectionMap)
            {
                if (userId != lost.PreviousOwnerId)
                    continue;

                await hubContext.Clients.Client(connectionId).SendAsync("TileLost", new
                {
                    Q = lost.Q,
                    R = lost.R,
                    AttackerName = lost.AttackerName
                });
            }
        }
    }
}
