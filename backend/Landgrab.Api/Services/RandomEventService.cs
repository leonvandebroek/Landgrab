using Landgrab.Api.Hubs;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Services;

public sealed class RandomEventService(
    IServiceScopeFactory scopeFactory,
    IHubContext<GameHub> hubContext,
    ILogger<RandomEventService> logger) : BackgroundService
{
    private static readonly string[] EventTypes = ["Calamity", "Epidemic", "BonusTroops", "RushHour"];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Fire every 10 minutes (events affect rooms on ~30 min cadence via random chance)
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(10));

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

                    // Only fire if random events are enabled
                    if (!room.State.Dynamics.RandomEventsEnabled) continue;

                    // ~33% chance per tick (≈ every 30 min on average)
                    if (Random.Shared.NextDouble() > 0.33) continue;

                    await ApplyRandomEvent(gameService, room, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Random event tick failed.");
            }
        }
    }

    private async Task ApplyRandomEvent(GameService gameService, GameRoom room, CancellationToken ct)
    {
        var eventType = EventTypes[Random.Shared.Next(EventTypes.Length)];

        lock (room.SyncRoot)
        {
            switch (eventType)
            {
                case "Calamity":
                {
                    // Random owned hex loses all troops
                    var ownedHexes = room.State.Grid.Values
                        .Where(c => c.OwnerId != null && !c.IsMasterTile && c.Troops > 0)
                        .ToList();
                    if (ownedHexes.Count > 0)
                    {
                        var target = ownedHexes[Random.Shared.Next(ownedHexes.Count)];
                        target.Troops = 0;
                        gameService.AppendEventLogPublic(room.State, new GameEventLogEntry
                        {
                            Type = "RandomEvent",
                            Message = $"Calamity! Hex ({target.Q}, {target.R}) lost all troops.",
                            Q = target.Q,
                            R = target.R
                        });
                    }
                    break;
                }

                case "Epidemic":
                {
                    // Largest team loses 2 troops on a random hex
                    var largestAlliance = room.State.Alliances
                        .OrderByDescending(a => a.TerritoryCount)
                        .FirstOrDefault();
                    if (largestAlliance != null)
                    {
                        var allianceHexes = room.State.Grid.Values
                            .Where(c => c.OwnerAllianceId == largestAlliance.Id && c.Troops > 0 && !c.IsMasterTile)
                            .ToList();
                        if (allianceHexes.Count > 0)
                        {
                            var target = allianceHexes[Random.Shared.Next(allianceHexes.Count)];
                            target.Troops = Math.Max(0, target.Troops - 2);
                            gameService.AppendEventLogPublic(room.State, new GameEventLogEntry
                            {
                                Type = "RandomEvent",
                                Message = $"Epidemic! {largestAlliance.Name} lost 2 troops at ({target.Q}, {target.R}).",
                                AllianceId = largestAlliance.Id,
                                AllianceName = largestAlliance.Name,
                                Q = target.Q,
                                R = target.R
                            });
                        }
                    }
                    break;
                }

                case "BonusTroops":
                {
                    // Every team gets +2 troops to a random owned hex
                    foreach (var alliance in room.State.Alliances)
                    {
                        var hex = room.State.Grid.Values
                            .FirstOrDefault(c => c.OwnerAllianceId == alliance.Id && !c.IsMasterTile);
                        if (hex != null)
                            hex.Troops += 2;
                    }
                    gameService.AppendEventLogPublic(room.State, new GameEventLogEntry
                    {
                        Type = "RandomEvent",
                        Message = "Bonus Troops! Every team received +2 troops."
                    });
                    break;
                }

                case "RushHour":
                {
                    room.State.IsRushHour = true;
                    gameService.AppendEventLogPublic(room.State, new GameEventLogEntry
                    {
                        Type = "RandomEvent",
                        Message = "Rush Hour! Claimed hexes count double for 5 minutes."
                    });
                    // Schedule end of rush hour (simplified: checked in next tick)
                    break;
                }
            }
        }

        // Broadcast updated state
        GameState snapshot;
        lock (room.SyncRoot)
        {
            snapshot = gameService.SnapshotStatePublic(room.State);
        }

        await hubContext.Clients.Group(room.Code).SendAsync("StateUpdated", snapshot, ct);
        await hubContext.Clients.Group(room.Code).SendAsync("RandomEvent", new
        {
            type = eventType,
            title = eventType,
            description = $"A {eventType} event has occurred!"
        }, ct);

        logger.LogInformation("Random event {EventType} fired for room {RoomCode}", eventType, room.Code);
    }
}
