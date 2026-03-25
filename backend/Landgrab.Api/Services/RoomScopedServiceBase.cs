using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

/// <summary>Base class providing shared room-access helpers to in-memory game services.</summary>
public abstract class RoomScopedServiceBase(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService)
{
    /// <summary>Gets an active room by its code, or <see langword="null"/> if not found.</summary>
    protected GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);

    /// <summary>Creates a deep snapshot of the given game state.</summary>
    protected static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);

    /// <summary>Appends an entry to the state's event log.</summary>
    protected static void AppendEventLog(GameState state, GameEventLogEntry entry) =>
        GameStateCommon.AppendEventLog(state, entry);

    /// <summary>Queues an async persistence write for the room.</summary>
    protected void QueuePersistence(GameRoom room, GameState snapshot) =>
        gameStateService.QueuePersistence(room, snapshot);
}
