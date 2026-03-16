using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class AbilityService(IGameRoomProvider roomProvider, GameStateService gameStateService)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);

    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Beacons only work during gameplay.");
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Beacon))
                return (null, "Beacon mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.CurrentLat == null || player.CurrentLng == null)
                return (null, "Your location is required to activate a beacon.");

            player.IsBeacon = true;
            player.BeaconLat = player.CurrentLat;
            player.BeaconLng = player.CurrentLng;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "BeaconActivated",
                Message = $"{player.Name} activated a beacon.",
                PlayerId = userId,
                PlayerName = player.Name
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) DeactivateBeacon(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            player.IsBeacon = false;
            player.BeaconLat = null;
            player.BeaconLng = null;

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId, int targetQ, int targetR)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Commando raids only work during gameplay.");
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.CommandoRaid))
                return (null, "CommandoRaid mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.IsCommandoActive)
                return (null, "You already have an active commando raid.");
            if (player.CommandoCooldownUntil.HasValue && player.CommandoCooldownUntil > DateTime.UtcNow)
                return (null, "Commando raid is on cooldown.");

            if (player.CurrentLat.HasValue && player.CurrentLng.HasValue && room.State.HasMapLocation)
            {
                var playerHex = HexService.LatLngToHexForRoom(player.CurrentLat.Value, player.CurrentLng.Value,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var dist = HexService.HexDistance(playerHex.q - targetQ, playerHex.r - targetR);
                if (dist > 3)
                    return (null, "Target hex must be within 3 hex distance.");
            }

            var key = HexService.Key(targetQ, targetR);
            if (!room.State.Grid.ContainsKey(key))
                return (null, "Invalid target hex.");

            player.IsCommandoActive = true;
            player.CommandoTargetQ = targetQ;
            player.CommandoTargetR = targetR;
            player.CommandoDeadline = DateTime.UtcNow.AddMinutes(5);
            player.CommandoCooldownUntil = DateTime.UtcNow.AddMinutes(15);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "CommandoRaidStarted",
                Message = $"{player.Name} launched a commando raid towards ({targetQ}, {targetR})!",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = targetQ,
                R = targetR
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }
}
