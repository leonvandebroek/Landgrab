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
            if (room.State.Dynamics.PlayerRolesEnabled && player.Role != PlayerRole.Scout)
                return (null, "Only a Scout can activate the Beacon.");
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
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Commando raids only work during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null) return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Only a Commander can activate a commando raid.");
            if (player.CommandoRaidCooldownUntil.HasValue && player.CommandoRaidCooldownUntil > DateTime.UtcNow)
                return (null, "Commando raid is on cooldown.");
            if (room.State.ActiveRaids.Any(r => r.InitiatorAllianceId == player.AllianceId))
                return (null, "Your alliance already has an active commando raid.");

            var key = HexService.Key(targetQ, targetR);
            if (!room.State.Grid.TryGetValue(key, out _))
                return (null, "Invalid target hex.");

            var isHQRaid = room.State.Alliances.Any(a =>
                a.HQHexQ == targetQ && a.HQHexR == targetR);
            if (isHQRaid)
            {
                var totalHexes = room.State.Grid.Count;
                var claimedHexes = room.State.Grid.Values.Count(c => c.OwnerId != null && !c.IsMasterTile);
                if (totalHexes > 0 && (double)claimedHexes / totalHexes < 0.40)
                    return (null, "The battle hasn't reached its peak yet — HQ raids unlock when 40% of the map is claimed.");
            }

            var raid = new ActiveCommandoRaid
            {
                TargetQ = targetQ,
                TargetR = targetR,
                InitiatorAllianceId = player.AllianceId ?? "",
                InitiatorPlayerId = userId,
                InitiatorPlayerName = player.Name,
                Deadline = DateTime.UtcNow.AddMinutes(5),
                IsHQRaid = isHQRaid
            };
            room.State.ActiveRaids.Add(raid);
            player.CommandoRaidCooldownUntil = DateTime.UtcNow.AddMinutes(15);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "CommandoRaidStarted",
                Message = $"{player.Name} launched a commando raid on ({targetQ}, {targetR})! Everyone converge!",
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
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Rally Point only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null) return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Rally Point can only be activated by a Commander.");
            if (player.RallyPointCooldownUntil.HasValue && player.RallyPointCooldownUntil > DateTime.UtcNow)
                return (null, "Rally Point is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to activate a Rally Point.");
            if (!IsFriendlyCell(player, currentCell))
                return (null, "Rally Point must be activated on a friendly hex.");

            player.RallyPointActive = true;
            player.RallyPointDeadline = DateTime.UtcNow.AddMinutes(3);
            player.RallyPointCooldownUntil = DateTime.UtcNow.AddMinutes(15);
            player.RallyPointQ = currentCell.Q;
            player.RallyPointR = currentCell.R;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "RallyPointActivated",
                Message = $"{player.Name} called a rally at ({currentCell.Q}, {currentCell.R})! Converge for bonus troops!",
                PlayerId = userId, PlayerName = player.Name,
                Q = currentCell.Q, R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateShieldWall(string roomCode, string userId)
        => (null, "Shield Wall has been removed.");

    public (GameState? state, string? error) StartFortConstruction(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Fort construction only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Engineer)
                return (null, "Only an Engineer can start fort construction.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to start fort construction.");
            if (currentCell.OwnerId != userId)
                return (null, "Fort construction must start on one of your own hexes.");
            if (currentCell.IsFort)
                return (null, "This hex is already a fort.");
            if (player.FortTargetQ.HasValue)
                return (null, "You are already constructing a fort.");

            player.FortTargetQ = currentCell.Q;
            player.FortTargetR = currentCell.R;
            player.FortPerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "FortConstructionStarted",
                Message = $"Fort construction started at ({currentCell.Q}, {currentCell.R}).",
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

    public (GameState? state, string? error) CancelFortConstruction(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (!player.FortTargetQ.HasValue || !player.FortTargetR.HasValue)
                return (null, "You do not have a fort construction mission in progress.");

            var targetQ = player.FortTargetQ;
            var targetR = player.FortTargetR;
            player.FortTargetQ = null;
            player.FortTargetR = null;
            player.FortPerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "FortConstructionCancelled",
                Message = $"{player.Name} cancelled fort construction.",
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

    public (GameState? state, string? error) ActivateSabotage(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Sabotage only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null) return (null, "Player not in room.");
            if (player.Role != PlayerRole.Engineer)
                return (null, "Sabotage can only be performed by an Engineer.");
            if (player.SabotageCooldownUntil.HasValue && player.SabotageCooldownUntil > DateTime.UtcNow)
                return (null, "Sabotage is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to sabotage a hex.");
            if (IsFriendlyCell(player, currentCell) || currentCell.OwnerId == null)
                return (null, "You can only sabotage an enemy hex.");

            player.SabotageTargetQ = currentCell.Q;
            player.SabotageTargetR = currentCell.R;
            player.SabotagePerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "SabotageStarted",
                Message = $"{player.Name} is sabotaging ({currentCell.Q}, {currentCell.R})! Defend it!",
                PlayerId = userId, PlayerName = player.Name,
                Q = currentCell.Q, R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) CancelSabotage(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (!player.SabotageTargetQ.HasValue || !player.SabotageTargetR.HasValue)
                return (null, "You do not have a sabotage mission in progress.");

            var targetQ = player.SabotageTargetQ;
            var targetR = player.SabotageTargetR;
            player.SabotageTargetQ = null;
            player.SabotageTargetR = null;
            player.SabotagePerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "SabotageCancelled",
                Message = $"{player.Name} cancelled sabotage.",
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

            player.DemolishTargetKey = HexService.Key(currentCell.Q, currentCell.R);
            player.DemolishApproachDirectionsMade.Clear();

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

    public (GameState? state, string? error) CancelDemolish(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (string.IsNullOrEmpty(player.DemolishTargetKey))
                return (null, "You do not have a demolish mission in progress.");

            int? targetQ = null;
            int? targetR = null;
            if (room.State.Grid.TryGetValue(player.DemolishTargetKey, out var targetCell))
            {
                targetQ = targetCell.Q;
                targetR = targetCell.R;
            }

            player.DemolishTargetKey = null;
            player.DemolishApproachDirectionsMade.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "DemolishCancelled",
                Message = $"{player.Name} cancelled demolish.",
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
