using Landgrab.Api.Hubs;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Services;

public sealed class TroopRegenerationService(
    IServiceScopeFactory scopeFactory,
    IHubContext<GameHub> hubContext,
    ILogger<TroopRegenerationService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var gameService = scope.ServiceProvider.GetRequiredService<GameService>();

                foreach (var roomCode in gameService.GetPlayingRoomCodes())
                {
                    var room = gameService.GetRoom(roomCode);
                    if (room == null) continue;
                    if (room.State.IsPaused) continue;

                    gameService.ResolveExpiredCommandoRaids(roomCode);
                    var result = gameService.AddReinforcementsToAllHexes(roomCode);
                    var state = result.state;
                    if (result.error != null || state == null)
                        continue;

                    foreach (var drainTick in result.drainTicks)
                    {
                        await hubContext.Clients.Group(roomCode).SendAsync("DrainTick", new
                        {
                            q = drainTick.q,
                            r = drainTick.r,
                            troopsLost = drainTick.troopsLost,
                            allianceId = drainTick.allianceId
                        }, stoppingToken);
                    }

                    if (state.Dynamics.FogOfWarEnabled)
                    {
                        var hostObserverUserId = state.HostObserverMode
                            ? room.HostUserId.ToString()
                            : null;
                        var hiddenFogCells = gameService.CreateHiddenFogCellsForBroadcast(state);

                        foreach (var (connectionId, userId) in room.ConnectionMap)
                        {
                            var playerSnapshot = hostObserverUserId == userId
                                ? state
                                : gameService.GetPlayerSnapshot(state, userId, hiddenFogCells);
                            await hubContext.Clients.Client(connectionId).SendAsync("StateUpdated", playerSnapshot, stoppingToken);
                        }
                    }
                    else
                    {
                        await hubContext.Clients.Group(roomCode).SendAsync("StateUpdated", state, stoppingToken);
                    }

                    if (state.Phase == GamePhase.GameOver)
                    {
                        await hubContext.Clients.Group(roomCode).SendAsync("GameOver", new
                        {
                            state.WinnerId,
                            state.WinnerName,
                            state.IsAllianceVictory
                        }, stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Troop regeneration tick failed.");
            }
        }
    }
}
