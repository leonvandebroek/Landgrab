using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameStateService(IGameRoomProvider roomProvider, RoomPersistenceService roomPersistenceService, ILogger<GameStateService> logger)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);

    public GameState? GetStateSnapshot(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return null;

        lock (room.SyncRoot)
            return SnapshotState(room.State);
    }

    public GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);

    public void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);

    public void QueuePersistence(GameRoom room, GameState stateSnapshot)
    {
        var roomCode = room.Code;
        var hostUserId = room.HostUserId;
        var createdAt = room.CreatedAt;
        var persistedAt = DateTime.UtcNow;

        _ = Task.Run(async () =>
        {
            try
            {
                await roomPersistenceService.PersistRoomStateAsync(
                    roomCode,
                    hostUserId,
                    createdAt,
                    stateSnapshot,
                    persistedAt);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to persist room state for {RoomCode}", roomCode);
            }
        });
    }

    public void QueuePersistenceIfGameOver(GameRoom room, GameState stateSnapshot, GamePhase previousPhase)
    {
        if (previousPhase == GamePhase.GameOver || stateSnapshot.Phase != GamePhase.GameOver)
            return;

        QueuePersistence(room, stateSnapshot);
    }

    /// <summary>Returns the list of player connection IDs that belong to the given alliance IDs.</summary>
    public List<string> GetAllianceConnectionIds(GameRoom room, List<string> allianceIds)
    {
        var memberIds = room.State.Alliances
            .Where(a => allianceIds.Contains(a.Id))
            .SelectMany(a => a.MemberIds)
            .ToHashSet();

        return room.ConnectionMap
            .Where(kvp => memberIds.Contains(kvp.Value))
            .Select(kvp => kvp.Key)
            .ToList();
    }
}
