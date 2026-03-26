using Landgrab.Api.Models;

namespace Landgrab.Api.Services.Abilities;

/// <summary>
/// Handles Commander role abilities: Commando Raid, Tactical Strike, Rally Point, and Shield Wall.
/// </summary>
public sealed class CommanderAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService)
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    /// <summary>Resolves the current hex as the commando raid target based on player position.</summary>
    public ((int targetQ, int targetR)? target, string? error) ResolveRaidTarget(string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Commando raids only work during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Only a Commander can resolve a commando raid target.");
            if (!TryGetPlayerPosition(room.State, player, out var currentQ, out var currentR, out _, out _))
                return (null, "Your location is required to resolve a commando raid target.");

            return ((currentQ, currentR), null);
        }
    }

    /// <summary>Activates a commando raid from the Commander's current position.</summary>
    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId)
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
            if (!GameplayService.TryGetCurrentHex(room.State, player, out var currentQ, out var currentR))
                return (null, "Your location is required to activate a commando raid.");

            var targetQ = currentQ;
            var targetR = currentR;
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
                Message = $"{player.Name} launched a commando raid from ({targetQ}, {targetR})! Everyone converge!",
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

    /// <summary>Resolves the adjacent hex closest to the player's heading as the tactical strike target.</summary>
    public ((int targetQ, int targetR)? target, string? error) ResolveTacticalStrikeTarget(string roomCode, string userId, double heading)
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
            if (!room.State.HasMapLocation)
                return (null, "This room does not have a valid map location configured.");
            if (!double.IsFinite(heading))
                return (null, "A valid heading is required to resolve a tactical strike target.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Only a Commander can resolve a tactical strike target.");
            if (!TryGetPlayerPosition(room.State, player, out _, out _, out _, out _))
                return (null, "Your location is required to resolve a tactical strike target.");

            return (ResolveClosestAdjacentHex(room.State, player, heading), null);
        }
    }

    /// <summary>Activates a tactical strike on the specified adjacent target hex.</summary>
    public (GameState? state, string? error) ActivateTacticalStrike(string roomCode, string userId, int targetQ, int targetR)
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
            if (!GameplayService.TryGetCurrentHex(room.State, player, out var currentQ, out var currentR))
                return (null, "Your location is required to activate Tactical Strike.");

            var targetKey = HexService.Key(targetQ, targetR);
            if (!room.State.Grid.ContainsKey(targetKey))
                return (null, "Invalid target hex.");
            if (HexService.HexDistance(currentQ, currentR, targetQ, targetR) != 1)
                return (null, "Tactical Strike target must be an adjacent hex.");

            player.TacticalStrikeActive = true;
            player.TacticalStrikeExpiry = DateTime.UtcNow.AddMinutes(5);
            player.TacticalStrikeCooldownUntil = DateTime.UtcNow.AddMinutes(20);
            player.TacticalStrikeTargetQ = targetQ;
            player.TacticalStrikeTargetR = targetR;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "TacticalStrikeActivated",
                Message = $"{player.Name} activated Tactical Strike on ({targetQ}, {targetR}).",
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

    /// <summary>Activates a rally point at the Commander's current friendly hex.</summary>
    public (GameState? state, string? error) ActivateRallyPoint(string roomCode, string userId)
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

    /// <summary>Shield Wall has been removed from the game.</summary>
    public (GameState? state, string? error) ActivateShieldWall(string roomCode, string userId)
        => (null, "Shield Wall has been removed.");
}
