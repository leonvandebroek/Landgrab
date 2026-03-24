using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameConfigService(IGameRoomProvider roomProvider, GameStateService gameStateService)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);

    public (GameState? state, string? error) SetClaimMode(string roomCode, string userId, string claimMode)
    {
        if (!Enum.TryParse<ClaimMode>(claimMode, true, out var parsedClaimMode))
            return (null, "Invalid claim mode.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can change claim mode.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Claim mode can only be changed in the lobby.");

            room.State.ClaimMode = parsedClaimMode;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

public (GameState? state, string? error) SetWinCondition(string roomCode, string userId,
        string winConditionType, int value)
    {
        if (!Enum.TryParse<WinConditionType>(winConditionType, true, out var parsedWinCondition))
            return (null, "Invalid win condition.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can change the win condition.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Win condition can only be changed in the lobby.");

            switch (parsedWinCondition)
            {
                case WinConditionType.TerritoryPercent:
                    if (value < 1 || value > 100)
                        return (null, "Territory percent must be between 1 and 100.");
                    room.State.WinConditionValue = value;
                    room.State.GameDurationMinutes = null;
                    break;
                case WinConditionType.Elimination:
                    room.State.WinConditionValue = 1;
                    room.State.GameDurationMinutes = null;
                    break;
                case WinConditionType.TimedGame:
                    if (value < 1)
                        return (null, "Timed games must last at least 1 minute.");
                    room.State.WinConditionValue = value;
                    room.State.GameDurationMinutes = value;
                    break;
            }

            room.State.WinConditionType = parsedWinCondition;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetFieldBattleResolutionMode(string roomCode, string userId, string mode)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can configure this.");
            if (!Enum.TryParse<FieldBattleResolutionMode>(mode, out var parsed))
                return (null, "Invalid resolution mode.");

            room.State.Dynamics.FieldBattleResolutionMode = parsed;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetBeaconEnabled(string roomCode, string userId, bool enabled)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can change beacon settings.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Beacon settings can only be changed in the lobby.");

            room.State.Dynamics.BeaconEnabled = enabled;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetTileDecayEnabled(string roomCode, string userId, bool enabled)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can change tile decay settings.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Tile decay settings can only be changed in the lobby.");

            room.State.Dynamics.TileDecayEnabled = enabled;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetEnemySightingMemory(string roomCode, string userId, int seconds)
    {
        if (seconds < 0 || seconds > 300)
            return (null, "Enemy sighting memory must be between 0 and 300 seconds.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can change enemy sighting memory.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Enemy sighting memory can only be changed in the lobby.");

            room.State.Dynamics.EnemySightingMemorySeconds = seconds;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetGameDynamics(string roomCode, string userId, GameDynamics dynamics)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can change game dynamics.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Game dynamics can only be changed in the lobby.");

            room.State.Dynamics.BeaconEnabled = dynamics.BeaconEnabled;
            room.State.Dynamics.BeaconSectorAngle = dynamics.BeaconSectorAngle;
            room.State.Dynamics.TileDecayEnabled = dynamics.TileDecayEnabled;
            room.State.Dynamics.CombatMode = dynamics.CombatMode;
            room.State.Dynamics.PlayerRolesEnabled = dynamics.PlayerRolesEnabled;
            room.State.Dynamics.HQEnabled = dynamics.HQEnabled;
            room.State.Dynamics.HQAutoAssign = dynamics.HQAutoAssign;
            room.State.Dynamics.FieldBattleResolutionMode = dynamics.FieldBattleResolutionMode;

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }
}
