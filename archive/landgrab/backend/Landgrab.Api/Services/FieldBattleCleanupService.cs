using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public sealed class FieldBattleCleanupService(
    IServiceScopeFactory scopeFactory,
    ILogger<FieldBattleCleanupService> logger) : BackgroundService
{
    private static readonly TimeSpan TickInterval = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan MaxBattleAge = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TickInterval);

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var gameService = scope.ServiceProvider.GetRequiredService<GameService>();
                var cutoff = DateTime.UtcNow - MaxBattleAge;

                foreach (var room in gameService.GetRoomsSnapshot())
                {
                    CleanupRoomBattles(room, cutoff);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Field battle cleanup tick failed.");
            }
        }
    }

    private void CleanupRoomBattles(GameRoom room, DateTime cutoff)
    {
        lock (room.SyncRoot)
        {
            var staleBattles = room.State.ActiveFieldBattles
                .Where(battle => battle.CreatedAt < cutoff)
                .ToList();
            if (staleBattles.Count == 0)
            {
                return;
            }

            room.State.ActiveFieldBattles.RemoveAll(battle => battle.CreatedAt < cutoff);
            foreach (var staleBattle in staleBattles)
            {
                logger.LogWarning(
                    "Removed stale field battle {BattleId} in room {RoomCode} created at {CreatedAt}.",
                    staleBattle.Id,
                    room.Code,
                    staleBattle.CreatedAt);
            }
        }
    }
}
