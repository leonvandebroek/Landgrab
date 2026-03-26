using Landgrab.Api.Hubs;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Services.Abilities;

/// <summary>
/// Handles role-agnostic shared abilities available to all players:
/// Troop Transfer, and Field Battle.
/// </summary>
public sealed class SharedAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    IHubContext<GameHub> hubContext)
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    /// <summary>
    /// Resolves the closest allied player in the direction of the heading as a troop transfer target.
    /// </summary>
    public ((string id, string name)? target, string? error) ResolveTroopTransferTarget(
        string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Troop transfers only work during gameplay.");
            if (!double.IsFinite(heading) || heading < 0d || heading > 360d)
                return (null, "A valid heading is required.");

            var initiator = room.State.Players.FirstOrDefault(player => player.Id == userId);
            if (initiator == null)
                return (null, "Player not in room.");
            if (!initiator.CurrentLat.HasValue || !initiator.CurrentLng.HasValue)
                return (null, "Your location is required to resolve a troop transfer target.");
            if (string.IsNullOrWhiteSpace(initiator.AllianceId))
                return (null, "You must be in an alliance to transfer troops.");

            var normalizedHeading = HexService.NormalizeHeading(heading);
            var initiatorLat = initiator.CurrentLat.Value;
            var initiatorLng = initiator.CurrentLng.Value;

            double? bestDistance = null;
            (string id, string name)? bestTarget = null;

            foreach (var candidate in room.State.Players)
            {
                if (candidate.Id == userId
                    || candidate.AllianceId != initiator.AllianceId
                    || !candidate.CurrentLat.HasValue
                    || !candidate.CurrentLng.HasValue)
                {
                    continue;
                }

                var candidateBearing = HexService.BearingDegrees(
                    initiatorLat,
                    initiatorLng,
                    candidate.CurrentLat.Value,
                    candidate.CurrentLng.Value);
                var headingDiff = HexService.HeadingDiff(normalizedHeading, candidateBearing);
                if (headingDiff > 45d)
                    continue;

                var distanceScore = GetDistanceScore(
                    initiatorLat,
                    initiatorLng,
                    candidate.CurrentLat.Value,
                    candidate.CurrentLng.Value);
                if (bestDistance.HasValue && distanceScore >= bestDistance.Value)
                    continue;

                bestDistance = distanceScore;
                bestTarget = (candidate.Id, candidate.Name);
            }

            return (bestTarget, null);
        }
    }

    /// <summary>Initiates a troop transfer request from the initiator to the recipient.</summary>
    public (Guid? transferId, string? error) InitiateTroopTransfer(
        string roomCode, string userId, int amount, string recipientId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Troop transfers only work during gameplay.");
            if (amount < 1)
                return (null, "Amount must be at least 1.");

            var initiator = room.State.Players.FirstOrDefault(player => player.Id == userId);
            if (initiator == null)
                return (null, "Player not in room.");
            if (initiator.CarriedTroops < amount)
                return (null, "You do not have enough carried troops.");
            if (string.IsNullOrWhiteSpace(initiator.AllianceId))
                return (null, "You must be in an alliance to transfer troops.");

            var recipient = room.State.Players.FirstOrDefault(player => player.Id == recipientId);
            if (recipient == null)
                return (null, "Recipient not in room.");
            if (string.IsNullOrWhiteSpace(recipient.AllianceId) || recipient.AllianceId != initiator.AllianceId)
                return (null, "Troops can only be transferred to an ally.");

            if (GameplayService.TryGetCurrentHex(room.State, initiator, out var currentQ, out var currentR)
                && room.State.Grid.TryGetValue(HexService.Key(currentQ, currentR), out var currentCell)
                && currentCell.OwnerId != null
                && currentCell.OwnerAllianceId != initiator.AllianceId)
            {
                return (null, "Cannot transfer from an enemy hex.");
            }

            if (room.State.ActiveTroopTransfers.Any(transfer =>
                    transfer.InitiatorId == userId && transfer.RecipientId == recipientId))
            {
                return (null, "A transfer to this player is already pending.");
            }

            var now = DateTime.UtcNow;
            if (initiator.TroopTransferCooldownUntil.HasValue
                && initiator.TroopTransferCooldownUntil.Value > now)
            {
                return (null, "Troop transfer is on cooldown.");
            }

            var transfer = new ActiveTroopTransfer
            {
                InitiatorId = initiator.Id,
                InitiatorName = initiator.Name,
                RecipientId = recipient.Id,
                RecipientName = recipient.Name,
                Amount = amount,
                ExpiresAt = now.AddSeconds(30)
            };

            room.State.ActiveTroopTransfers.Add(transfer);
            return (transfer.Id, null);
        }
    }

    /// <summary>Responds to a pending troop transfer — accepted or declined.</summary>
    public (GameState? state, string? error) RespondToTroopTransfer(
        string roomCode, string userId, Guid transferId, bool accepted)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var transfer = room.State.ActiveTroopTransfers.FirstOrDefault(item => item.Id == transferId);
            if (transfer == null)
                return (null, "Troop transfer not found.");
            if (transfer.RecipientId != userId)
                return (null, "Only the recipient can respond to this troop transfer.");
            if (transfer.ExpiresAt <= DateTime.UtcNow)
                return (null, "Troop transfer has expired.");

            var initiator = room.State.Players.FirstOrDefault(player => player.Id == transfer.InitiatorId);
            var recipient = room.State.Players.FirstOrDefault(player => player.Id == transfer.RecipientId);
            if (initiator == null || recipient == null)
                return (null, "Transfer participant is no longer in the room.");

            if (accepted)
            {
                if (initiator.CarriedTroops < transfer.Amount)
                    return (null, "Initiator no longer has enough carried troops.");

                initiator.CarriedTroops -= transfer.Amount;
                recipient.CarriedTroops += transfer.Amount;

                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "TroopTransferCompleted",
                    Message = $"{initiator.Name} transferred {transfer.Amount} troop(s) to {recipient.Name}.",
                    PlayerId = initiator.Id,
                    PlayerName = initiator.Name,
                    TargetPlayerId = recipient.Id,
                    TargetPlayerName = recipient.Name
                });
            }

            room.State.ActiveTroopTransfers.RemoveAll(item => item.Id == transfer.Id);
            initiator.TroopTransferCooldownUntil = DateTime.UtcNow.AddMinutes(1);

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    /// <summary>Initiates a field battle on the current neutral hex — enemy must join within 30 s.</summary>
    public (ActiveFieldBattle? battle, string? error) InitiateFieldBattle(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Field battle only works during gameplay.");

            var initiator = room.State.Players.FirstOrDefault(player => player.Id == userId);
            if (initiator == null)
                return (null, "Player not in room.");
            if (!GameplayService.TryGetCurrentHex(room.State, initiator, out var currentQ, out var currentR))
                return (null, "Your location is required to initiate a field battle.");
            if (initiator.CarriedTroops <= 0)
                return (null, "You need carried troops to initiate a field battle.");
            if (initiator.FieldBattleCooldownUntil.HasValue && initiator.FieldBattleCooldownUntil > DateTime.UtcNow)
                return (null, "Field battle is on cooldown.");
            if (room.State.ActiveFieldBattles.Any(battle => battle.InitiatorId == userId))
                return (null, "You already have an active field battle.");

            var currentKey = HexService.Key(currentQ, currentR);
            if (!room.State.Grid.TryGetValue(currentKey, out var currentCell))
                return (null, "Invalid current hex.");
            if (currentCell.OwnerId != null)
                return (null, "Field battles can only be initiated on neutral hexes.");

            var hasActiveTacticalStrike = room.State.Players.Any(player =>
                player.TacticalStrikeActive
                && player.TacticalStrikeTargetQ == currentQ
                && player.TacticalStrikeTargetR == currentR);
            if (hasActiveTacticalStrike)
                return (null, "Cannot initiate a field battle on an active Tactical Strike hex.");

            var hasActiveCommandoRaid = room.State.ActiveRaids.Any(raid => raid.TargetQ == currentQ && raid.TargetR == currentR);
            if (hasActiveCommandoRaid)
                return (null, "Cannot initiate a field battle on an active Commando Raid hex.");

            var hasEnemyOnHex = room.State.Players.Any(player =>
                player.Id != initiator.Id
                && player.CarriedTroops > 0
                && GameplayService.TryGetCurrentHex(room.State, player, out var playerQ, out var playerR)
                && playerQ == currentQ
                && playerR == currentR
                && player.AllianceId != initiator.AllianceId);
            if (!hasEnemyOnHex)
                return (null, "No enemy with troops is present on this hex.");

            var battle = new ActiveFieldBattle
            {
                InitiatorId = initiator.Id,
                InitiatorName = initiator.Name,
                InitiatorAllianceId = initiator.AllianceId ?? "",
                Q = currentQ,
                R = currentR,
                InitiatorTroops = initiator.CarriedTroops,
                JoinDeadline = DateTime.UtcNow.AddSeconds(30)
            };

            room.State.ActiveFieldBattles.Add(battle);
            return (battle, null);
        }
    }

    /// <summary>Joins an existing field battle as an enemy combatant.</summary>
    public string? JoinFieldBattle(string roomCode, string userId, Guid battleId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return "Room not found.";

        lock (room.SyncRoot)
        {
            var battle = room.State.ActiveFieldBattles.FirstOrDefault(item => item.Id == battleId);
            if (battle == null)
                return "Field battle not found.";
            if (battle.Resolved)
                return "Battle already resolved.";
            if (battle.JoinDeadline <= DateTime.UtcNow)
                return "Field battle join window has closed.";

            var player = room.State.Players.FirstOrDefault(candidate => candidate.Id == userId);
            if (player == null)
                return "Player not in room.";
            if (player.AllianceId == battle.InitiatorAllianceId)
                return "Only enemy alliances can join this field battle.";
            if (player.CarriedTroops <= 0)
                return "You need carried troops to join a field battle.";
            if (!GameplayService.TryGetCurrentHex(room.State, player, out var q, out var r)
                || q != battle.Q
                || r != battle.R)
            {
                return "You must be on the battle hex to join.";
            }
            if (battle.JoinedEnemyIds.Contains(userId, StringComparer.Ordinal))
                return "You have already joined this battle.";

            battle.JoinedEnemyIds.Add(userId);
            return null;
        }
    }

    /// <summary>Selects a targeted enemy for an active field battle.</summary>
    public (GameState? state, string? error) SelectFieldBattleTarget(
        string roomCode,
        string initiatorId,
        Guid battleId,
        string targetId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var battle = room.State.ActiveFieldBattles.FirstOrDefault(item => item.Id == battleId);
            if (battle == null)
                return (null, "Field battle not found.");
            if (battle.Resolved)
                return (null, "Battle already resolved.");
            if (battle.JoinDeadline <= DateTime.UtcNow)
                return (null, "Field battle join window has closed.");
            if (!string.Equals(battle.InitiatorId, initiatorId, StringComparison.Ordinal))
                return (null, "Only the battle initiator can select a target.");
            if (!string.IsNullOrWhiteSpace(battle.TargetEnemyId))
                return (null, "Field battle target already selected.");

            var target = room.State.Players.FirstOrDefault(player => player.Id == targetId);
            if (target == null)
                return (null, "Target player not in room.");
            if (target.AllianceId == battle.InitiatorAllianceId)
                return (null, "Target must be an enemy player.");
            if (target.CarriedTroops <= 0)
                return (null, "Target has no carried troops.");
            if (!GameplayService.TryGetCurrentHex(room.State, target, out var targetQ, out var targetR)
                || targetQ != battle.Q
                || targetR != battle.R)
            {
                return (null, "Target must be on the battle hex.");
            }
            if (battle.FledEnemyIds.Contains(targetId, StringComparer.Ordinal))
                return (null, "Target has already fled this battle.");

            battle.TargetEnemyId = targetId;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    /// <summary>Marks the targeted enemy as having fled the field battle.</summary>
    public string? FleeBattle(string roomCode, string playerId, Guid battleId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return "Room not found.";

        lock (room.SyncRoot)
        {
            var battle = room.State.ActiveFieldBattles.FirstOrDefault(item => item.Id == battleId);
            if (battle == null)
                return "Field battle not found.";
            if (battle.Resolved)
                return "Battle already resolved.";
            if (battle.JoinDeadline <= DateTime.UtcNow)
                return "Field battle join window has closed.";
            if (!string.Equals(battle.TargetEnemyId, playerId, StringComparison.Ordinal))
                return "Only the targeted enemy can flee this battle.";
            if (battle.FledEnemyIds.Contains(playerId, StringComparer.Ordinal))
                return "You have already fled this battle.";

            battle.FledEnemyIds.Add(playerId);
            return null;
        }
    }

    /// <summary>Resolves the field battle outcome, distributing troop losses to both sides.</summary>
    public (GameState? state, FieldBattleResultDto? result, string? error) ResolveFieldBattle(
        string roomCode, Guid battleId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, null, "Room not found.");

        lock (room.SyncRoot)
        {
            var battle = room.State.ActiveFieldBattles.FirstOrDefault(item => item.Id == battleId);
            if (battle == null)
                return (null, null, "Field battle not found.");
            if (battle.Resolved)
                return (null, null, "Battle already resolved.");

            battle.Resolved = true;
            var initiator = room.State.Players.FirstOrDefault(player => player.Id == battle.InitiatorId);
            if (initiator == null)
            {
                room.State.ActiveFieldBattles.RemoveAll(item => item.Id == battle.Id);
                return (null, null, "Battle initiator is no longer in the room.");
            }

            var result = new FieldBattleResultDto
            {
                BattleId = battle.Id,
                InitiatorName = battle.InitiatorName,
                InitiatorAllianceId = battle.InitiatorAllianceId,
                Q = battle.Q,
                R = battle.R,
                AllParticipantIds = [battle.InitiatorId, .. battle.JoinedEnemyIds.Distinct(StringComparer.Ordinal)]
            };

            if (battle.JoinedEnemyIds.Count == 0)
            {
                result.NoEnemiesJoined = true;
                result.InitiatorWon = true;
                initiator.FieldBattleCooldownUntil = DateTime.UtcNow.AddHours(24);
                initiator.FieldBattleCooldownHexQ = battle.Q;
                initiator.FieldBattleCooldownHexR = battle.R;
                room.State.ActiveFieldBattles.RemoveAll(item => item.Id == battle.Id);
                var noEnemySnapshot = SnapshotState(room.State);
                QueuePersistence(room, noEnemySnapshot);
                return (noEnemySnapshot, result, null);
            }

            var joinedEnemies = room.State.Players
                .Where(player => battle.JoinedEnemyIds.Contains(player.Id, StringComparer.Ordinal))
                .ToList();
            if (joinedEnemies.Count == 0)
            {
                result.NoEnemiesJoined = true;
                result.InitiatorWon = true;
                initiator.FieldBattleCooldownUntil = DateTime.UtcNow.AddHours(24);
                initiator.FieldBattleCooldownHexQ = battle.Q;
                initiator.FieldBattleCooldownHexR = battle.R;
                room.State.ActiveFieldBattles.RemoveAll(item => item.Id == battle.Id);
                var missingEnemySnapshot = SnapshotState(room.State);
                QueuePersistence(room, missingEnemySnapshot);
                return (missingEnemySnapshot, result, null);
            }

            var initiatorTroopsBefore = Math.Max(0, initiator.CarriedTroops);
            var enemyTroopsBeforeSum = joinedEnemies.Sum(player => Math.Max(0, player.CarriedTroops));
            var enemyHighest = joinedEnemies.Max(player => Math.Max(0, player.CarriedTroops));

            var initiatorStrength = initiatorTroopsBefore;
            var enemyStrength = room.State.Dynamics.FieldBattleResolutionMode switch
            {
                FieldBattleResolutionMode.InitiatorVsSumOfJoined => enemyTroopsBeforeSum,
                FieldBattleResolutionMode.InitiatorVsHighestOfJoined => enemyHighest,
                FieldBattleResolutionMode.InitiatorPlusRandomVsSumPlusRandom => enemyTroopsBeforeSum,
                FieldBattleResolutionMode.InitiatorPlusRandomVsHighestPlusRandom => enemyHighest,
                _ => enemyTroopsBeforeSum
            };

            if (room.State.Dynamics.FieldBattleResolutionMode is FieldBattleResolutionMode.InitiatorPlusRandomVsSumPlusRandom
                or FieldBattleResolutionMode.InitiatorPlusRandomVsHighestPlusRandom)
            {
                initiatorStrength += Random.Shared.Next(0, 6);
                enemyStrength += Random.Shared.Next(0, 6);
            }

            var initiatorWon = initiatorStrength >= enemyStrength;
            result.InitiatorWon = initiatorWon;

            if (initiatorWon)
            {
                var initiatorLoss = Math.Min(initiatorTroopsBefore, (int)Math.Ceiling(enemyStrength / 2d));
                initiator.CarriedTroops = Math.Max(0, initiatorTroopsBefore - initiatorLoss);
                result.InitiatorTroopsLost = initiatorLoss;

                var enemyLossTotal = enemyTroopsBeforeSum;
                foreach (var enemy in joinedEnemies)
                    enemy.CarriedTroops = 0;
                result.EnemyTroopsLost = enemyLossTotal;
            }
            else
            {
                var enemyWinnerLoss = Math.Min(enemyTroopsBeforeSum, (int)Math.Ceiling(initiatorStrength / 2d));
                var remainingEnemyLoss = enemyWinnerLoss;
                foreach (var enemy in joinedEnemies
                             .OrderByDescending(player => player.CarriedTroops)
                             .ThenBy(player => player.Id, StringComparer.Ordinal))
                {
                    if (remainingEnemyLoss <= 0)
                        break;

                    var loss = Math.Min(enemy.CarriedTroops, remainingEnemyLoss);
                    enemy.CarriedTroops -= loss;
                    remainingEnemyLoss -= loss;
                }

                result.EnemyTroopsLost = enemyWinnerLoss;
                result.InitiatorTroopsLost = initiatorTroopsBefore;
                initiator.CarriedTroops = 0;
            }

            var cooldownUntil = DateTime.UtcNow.AddHours(24);
            initiator.FieldBattleCooldownUntil = cooldownUntil;
            initiator.FieldBattleCooldownHexQ = battle.Q;
            initiator.FieldBattleCooldownHexR = battle.R;
            foreach (var enemy in joinedEnemies)
            {
                enemy.FieldBattleCooldownUntil = cooldownUntil;
                enemy.FieldBattleCooldownHexQ = battle.Q;
                enemy.FieldBattleCooldownHexR = battle.R;
            }

            room.State.ActiveFieldBattles.RemoveAll(item => item.Id == battle.Id);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "FieldBattleResolved",
                Message = $"{battle.InitiatorName}'s field battle at ({battle.Q}, {battle.R}) resolved.",
                PlayerId = battle.InitiatorId,
                PlayerName = battle.InitiatorName,
                Q = battle.Q,
                R = battle.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, result, null);
        }
    }
}
