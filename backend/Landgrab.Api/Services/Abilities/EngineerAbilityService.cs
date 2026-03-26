using Landgrab.Api.Models;

namespace Landgrab.Api.Services.Abilities;

/// <summary>
/// Handles Engineer role abilities: Fort Construction, Sabotage, and Demolish.
/// </summary>
public sealed class EngineerAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    RoleProgressService roleProgressService)
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    /// <summary>Starts fort construction on the Engineer's current owned hex.</summary>
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

    /// <summary>Cancels an in-progress fort construction mission.</summary>
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

    /// <summary>Starts a sabotage mission on the Engineer's current enemy hex.</summary>
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

            var now = DateTime.UtcNow;
            CleanupExpiredSabotageBlockedTiles(player, now);
            var targetKey = HexService.Key(currentCell.Q, currentCell.R);
            if (player.SabotageBlockedTiles.TryGetValue(targetKey, out var blockedUntil) && blockedUntil > now)
            {
                var remaining = blockedUntil - now;
                return (null, $"Sabotage is blocked on this hex for another {FormatRemainingDuration(remaining)}.");
            }

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

    /// <summary>Cancels an in-progress sabotage mission.</summary>
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

    /// <summary>Starts a demolish mission on the Engineer's current enemy fort hex.</summary>
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
            player.DemolishFacingLockStartAt = null;
            player.DemolishFacingHexKey = null;

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

    /// <summary>Cancels an in-progress demolish mission.</summary>
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
            player.DemolishFacingLockStartAt = null;
            player.DemolishFacingHexKey = null;

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
