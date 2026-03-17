using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class AbilityService(IGameRoomProvider roomProvider, GameStateService gameStateService)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);

    private static bool TryGetCurrentHex(GameState state, PlayerDto player, out HexCell cell)
    {
        cell = null!;

        if (!GameplayService.TryGetCurrentHex(state, player, out var q, out var r))
            return false;

        if (!state.Grid.TryGetValue(HexService.Key(q, r), out var currentCell) || currentCell is null)
            return false;

        cell = currentCell;
        return true;
    }

    private static bool IsFriendlyCell(PlayerDto player, HexCell cell)
    {
        return GameplayService.IsFriendlyCell(player, cell);
    }

    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Beacons only work during gameplay.");
            if (!room.State.Dynamics.BeaconEnabled)
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
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "CommandoRaid mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Scout)
                return (null, "Commando raids can only be performed by Scouts.");
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

    public (GameState? state, string? error) ActivateTacticalStrike(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Tactical strike only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Tactical strike can only be performed by Commanders.");
            if (player.TacticalStrikeCooldownUntil.HasValue && player.TacticalStrikeCooldownUntil > DateTime.UtcNow)
                return (null, "Tactical strike is on cooldown.");

            player.TacticalStrikeActive = true;
            player.TacticalStrikeExpiry = DateTime.UtcNow.AddMinutes(5);
            player.TacticalStrikeCooldownUntil = DateTime.UtcNow.AddMinutes(20);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "TacticalStrikeActivated",
                Message = $"{player.Name} activated Tactical Strike.",
                PlayerId = userId,
                PlayerName = player.Name
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateReinforce(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Reinforce only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Reinforce can only be performed by Commanders.");
            if (player.ReinforceCooldownUntil.HasValue && player.ReinforceCooldownUntil > DateTime.UtcNow)
                return (null, "Reinforce is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to use Reinforce.");
            if (!IsFriendlyCell(player, currentCell))
                return (null, "Reinforce can only target a friendly hex.");

            currentCell.Troops += 3;
            player.ReinforceCooldownUntil = DateTime.UtcNow.AddMinutes(15);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "ReinforceActivated",
                Message = $"{player.Name} reinforced hex ({currentCell.Q}, {currentCell.R}).",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = currentCell.Q,
                R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateShieldWall(string roomCode, string userId)
        => (null, "Shield Wall has been removed.");

    public (GameState? state, string? error) ActivateEmergencyRepair(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Emergency Repair only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Engineer)
                return (null, "Emergency Repair can only be performed by Engineers.");
            if (player.EmergencyRepairCooldownUntil.HasValue && player.EmergencyRepairCooldownUntil > DateTime.UtcNow)
                return (null, "Emergency Repair is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to use Emergency Repair.");
            if (!IsFriendlyCell(player, currentCell))
                return (null, "Emergency Repair can only target a friendly hex.");

            currentCell.Troops += 3;
            player.EmergencyRepairCooldownUntil = DateTime.UtcNow.AddMinutes(15);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "EmergencyRepairActivated",
                Message = $"{player.Name} repaired hex ({currentCell.Q}, {currentCell.R}).",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = currentCell.Q,
                R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) StartDemolish(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Demolish only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Engineer)
                return (null, "Demolish can only be performed by Engineers.");
            if (player.DemolishCooldownUntil.HasValue && player.DemolishCooldownUntil > DateTime.UtcNow)
                return (null, "Demolish is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to use Demolish.");
            if (!currentCell.IsFort)
                return (null, "Demolish requires an enemy fort.");
            if (IsFriendlyCell(player, currentCell) || currentCell.OwnerId == null)
                return (null, "Demolish requires an enemy fort.");

            player.DemolishActive = true;
            player.DemolishTargetKey = HexService.Key(currentCell.Q, currentCell.R);
            player.DemolishStartedAt = DateTime.UtcNow;
            player.DemolishCooldownUntil = DateTime.UtcNow.AddMinutes(30);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "DemolishStarted",
                Message = $"{player.Name} started demolishing the fort at ({currentCell.Q}, {currentCell.R}).",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = currentCell.Q,
                R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }
}
