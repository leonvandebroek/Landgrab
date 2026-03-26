using System;
using System.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Hubs;

public partial class GameHub
{
    [Authorize]
    public async Task<CombatPreviewDto> GetCombatPreview(int q, int r)
    {
        if (!ValidateCoordRange(q, r))
        {
            const string message = "Invalid target coordinates.";
            await SendError(InvalidRequestCode, message);
            throw new HubException(message);
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            const string message = "Not in a room.";
            await SendError("ROOM_NOT_JOINED", message);
            throw new HubException(message);
        }

        var (preview, error) = gameService.GetCombatPreview(room.Code, UserId, q, r);
        if (error != null || preview == null)
        {
            var message = error ?? "Unable to calculate combat preview.";
            await SendError(MapErrorCode(message), message);
            throw new HubException(message);
        }

        return preview;
    }

    public async Task ActivateBeacon(double heading)
    {
        if (!ValidateHeading(heading))
        {
            await SendError(InvalidRequestCode, "Invalid heading.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateBeacon(room.Code, UserId, heading);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task<object?> ResolveRaidTarget(double heading)
    {
        if (!ValidateHeading(heading))
        {
            await SendError(InvalidRequestCode, "Invalid heading.");
            return null;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (target, error) = gameService.ResolveRaidTarget(room.Code, UserId, heading);
        if (error != null)
        {
            await SendError(error);
            return null;
        }

        if (target is not { } resolvedTarget)
            return null;

        return new { targetQ = resolvedTarget.targetQ, targetR = resolvedTarget.targetR };
    }

    public async Task DeactivateBeacon()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.DeactivateBeacon(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task<int> ShareBeaconIntel()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return 0;
        }

        if (room.State.Phase != GamePhase.Playing)
        {
            await SendError("Beacons only work during gameplay.");
            return 0;
        }
        var (sharedCount, error) = gameService.ShareBeaconIntel(room.Code, UserId, []);
        if (error != null)
        {
            await SendError(error);
            return 0;
        }

        var state = gameService.GetStateSnapshot(room.Code);
        if (state is not null)
        {
            await BroadcastState(room.Code, state);
        }

        return sharedCount;
    }

    public async Task ActivateCommandoRaid()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateCommandoRaid(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task<object?> ResolveTacticalStrikeTarget(double heading)
    {
        if (!ValidateHeading(heading))
        {
            await SendError(InvalidRequestCode, "Invalid heading.");
            return null;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (target, error) = gameService.ResolveTacticalStrikeTarget(room.Code, UserId, heading);
        if (error != null)
        {
            await SendError(error);
            return null;
        }

        if (target is not { } resolvedTarget)
            return null;

        return new { targetQ = resolvedTarget.targetQ, targetR = resolvedTarget.targetR };
    }

    public async Task ActivateTacticalStrike(int targetQ, int targetR)
    {
        if (!ValidateCoordRange(targetQ, targetR))
        {
            await SendError(InvalidRequestCode, "Invalid target coordinates.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateTacticalStrike(room.Code, UserId, targetQ, targetR);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task ActivateRallyPoint()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateRallyPoint(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    // Backward compatibility — old clients may still call ActivateReinforce
    public async Task ActivateReinforce() => await ActivateRallyPoint();

    public async Task<object?> AttemptIntercept(double heading)
    {
        if (!ValidateHeading(heading))
        {
            await SendError(InvalidRequestCode, "Invalid heading.");
            return null;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (result, error) = gameService.AttemptIntercept(room.Code, UserId, heading);
        if (error != null)
        {
            await SendError(error);
            return null;
        }

        if (result == null)
            return null;

        return result.Seconds.HasValue
            ? new { status = result.Status, seconds = result.Seconds.Value }
            : new { status = result.Status };
    }

    public async Task ActivateShieldWall()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateShieldWall(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task StartFortConstruction()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.StartFortConstruction(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task CancelFortConstruction()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.CancelFortConstruction(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task ActivateSabotage()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateSabotage(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task CancelSabotage()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.CancelSabotage(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task StartDemolish()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.StartDemolish(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task CancelDemolish()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.CancelDemolish(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task UpdatePlayerLocation(double lat, double lng, double? heading = null)
    {
        if (!ValidateLatLng(lat, lng))
        {
            await SendError(InvalidRequestCode, "Invalid coordinates.");
            return;
        }

        var now = DateTime.UtcNow;
        if (_lastLocationUpdate.TryGetValue(Context.ConnectionId, out var last) &&
            now - last < UpdatePlayerLocationInterval)
        {
            await SendError("RATE_LIMITED", "Player location updates are being sent too quickly.");
            return;
        }

        _lastLocationUpdate[Context.ConnectionId] = now;

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var result = gameService.UpdatePlayerLocation(room.Code, UserId, lat, lng, heading);
        if (result.error != null)
        {
            await SendError(result.error);
            return;
        }

        // Broadcast full state when the authoritative grid changes OR when mover crosses hex boundaries.
        // Hex-boundary moves must project visibility/memory immediately (prevents hidden-after-move memory gap).
        if (result.gridChanged || result.playerHexChanged)
        {
            await BroadcastState(room.Code, result.state!);
            return;
        }

        // Player moved but no grid changes — send lightweight position update
        await visibilityBroadcastHelper.BroadcastPlayersPerViewer(
            room,
            result.state!,
            connectionId => Clients.Client(connectionId),
            visibilityService);
    }

    public async Task PickUpTroops(int q, int r, int count, double playerLat, double playerLng)
    {
        if (!ValidateCoordRange(q, r) || !ValidateLatLng(playerLat, playerLng) || count <= 0)
        {
            await SendError(InvalidRequestCode, "Invalid troop pickup request.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var result = gameService.PickUpTroops(room.Code, UserId, q, r, count, playerLat, playerLng);
        if (result.error != null)
        {
            await SendError(MapErrorCode(result.error), result.error);
            return;
        }

        await BroadcastState(room.Code, result.state!);
    }

    public async Task PlaceTroops(int q, int r, double playerLat, double playerLng,
        int? troopCount = null)
    {
        if (!ValidateCoordRange(q, r) ||
            !ValidateLatLng(playerLat, playerLng) ||
            (troopCount.HasValue && troopCount.Value < 0))
        {
            await SendError(InvalidRequestCode, "Invalid troop placement request.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var targetKey = HexService.Key(q, r);
        var wasNeutralHex = room.State.Grid.TryGetValue(targetKey, out var existingCell)
            && existingCell.OwnerId == null;

        var (state, error, previousOwnerId, combatResult, autoTriggeredBattle) = gameService.PlaceTroops(
            room.Code, UserId, q, r, playerLat, playerLng, troopCount);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);

        if (previousOwnerId != null)
        {
            var lostConnections = room.ConnectionMap
                .Where(kv => kv.Value == previousOwnerId);
            foreach (var (connId, recipientUserId) in lostConnections)
            {
                var shouldNotify = state!.GameMode != GameMode.Alliances
                    || state.Phase != GamePhase.Playing
                    || (room.State.HostObserverMode && GameStateCommon.IsHost(room, recipientUserId));

                if (!shouldNotify)
                {
                    var visibleHexKeys = visibilityService.ComputeVisibleHexKeys(state, recipientUserId);
                    shouldNotify = visibleHexKeys.Contains(HexService.Key(q, r));
                }

                if (!shouldNotify)
                {
                    continue;
                }

                await Clients.Client(connId).SendAsync("TileLost", new { Q = q, R = r, AttackerName = Username });
            }
        }

        if (combatResult != null)
        {
            await Clients.Caller.SendAsync("CombatResult", combatResult);
        }

        if (wasNeutralHex)
        {
            var player = state!.Players.FirstOrDefault(candidate => candidate.Id == UserId);
            if (player?.CarriedTroops > 0 && state.Grid.TryGetValue(targetKey, out var claimedCell))
            {
                await Clients.Caller.SendAsync("NeutralClaimResult", new NeutralClaimResult
                {
                    Q = q,
                    R = r,
                    CarriedTroops = player.CarriedTroops,
                    TroopsOnHex = claimedCell.Troops
                });
            }
        }

        // Handle auto-triggered FieldBattle
        if (autoTriggeredBattle != null)
        {
            // Find all enemies on the hex to send invites
            var enemyIds = state!.Players
                .Where(p =>
                    p.Id != UserId
                    && p.CarriedTroops > 0
                    && GameplayService.TryGetCurrentHex(state, p, out var playerQ, out var playerR)
                    && playerQ == q
                    && playerR == r
                    && p.AllianceId != autoTriggeredBattle.InitiatorAllianceId)
                .Select(p => p.Id)
                .ToList();

            if (enemyIds.Count > 0)
            {
                var invite = new
                {
                    battleId = autoTriggeredBattle.Id.ToString(),
                    initiatorName = autoTriggeredBattle.InitiatorName,
                    initiatorAllianceName = state.Alliances
                        .FirstOrDefault(alliance => alliance.Id == autoTriggeredBattle.InitiatorAllianceId)?.Name ?? "",
                    q = autoTriggeredBattle.Q,
                    r = autoTriggeredBattle.R,
                    joinDeadline = autoTriggeredBattle.JoinDeadline.ToString("O")
                };

                // Send invite to all enemies on the hex
                foreach (var enemyId in enemyIds)
                {
                    foreach (var (connId, uid) in room.ConnectionMap)
                    {
                        if (uid == enemyId)
                            await Clients.Client(connId).SendAsync("FieldBattleInvite", invite);
                    }
                }

                // Schedule auto-resolution after 30 seconds (same as manual trigger)
                var capturedBattleId = autoTriggeredBattle.Id;
                var capturedRoomCode = room.Code;
                var capturedHubContext = hubContext;
                _ = Task.Run(async () =>
                {
                    await Task.Delay(TimeSpan.FromSeconds(30));
                    var resolvedRoom = gameService.GetRoom(capturedRoomCode);
                    if (resolvedRoom == null)
                        return;

                    var (resolvedState, result, resolveError) = gameService.ResolveFieldBattle(capturedRoomCode, capturedBattleId);
                    if (resolveError != null || resolvedState == null)
                        return;

                    await capturedHubContext.Clients.Group(capturedRoomCode).SendAsync("StateUpdated", resolvedState);
                    if (result != null)
                    {
                        foreach (var participantId in result.AllParticipantIds)
                        {
                            foreach (var (connId, uid) in resolvedRoom.ConnectionMap)
                            {
                                if (uid == participantId)
                                {
                                    await capturedHubContext.Clients.Client(connId)
                                        .SendAsync("FieldBattleResolved", new
                                        {
                                            battleId = result.BattleId.ToString(),
                                            initiatorWon = result.InitiatorWon,
                                            initiatorName = result.InitiatorName,
                                            q = result.Q,
                                            r = result.R,
                                            initiatorTroopsLost = result.InitiatorTroopsLost,
                                            enemyTroopsLost = result.EnemyTroopsLost,
                                            noEnemiesJoined = result.NoEnemiesJoined
                                        });
                                }
                            }
                        }
                    }
                });
            }
        }
    }


    public async Task AttackGlobalHex(int fromQ, int fromR, int toQ, int toR)
    {
        if (!ValidateCoordRange(fromQ, fromR) || !ValidateCoordRange(toQ, toR))
        {
            await SendError(InvalidRequestCode, "Invalid hex coordinates.");
            return;
        }

        var (result, error) = await globalMap.AttackHexAsync(Guid.Parse(UserId), fromQ, fromR, toQ, toR);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await Clients.Group("global").SendAsync("GlobalHexUpdated", result);
    }

    public async Task<object?> ResolveTroopTransferTarget(double heading)
    {
        if (heading < 0 || heading > 360)
        {
            await SendError(InvalidRequestCode, "Invalid heading.");
            return null;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (target, error) = gameService.ResolveTroopTransferTarget(room.Code, UserId, heading);
        if (error != null)
        {
            await SendError(error);
            return null;
        }

        if (target is not { } resolved)
            return null;

        return new { recipientId = resolved.id, recipientName = resolved.name };
    }

    public async Task<object?> InitiateTroopTransfer(int amount, string recipientId)
    {
        if (amount <= 0)
        {
            await SendError(InvalidRequestCode, "Amount must be positive.");
            return null;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (transferId, error) = gameService.InitiateTroopTransfer(room.Code, UserId, amount, recipientId);
        if (error != null)
        {
            await SendError(error);
            return null;
        }

        var transfer = room.State.ActiveTroopTransfers.FirstOrDefault(item => item.Id == transferId);
        if (transfer != null)
        {
            var recipientConnId = room.ConnectionMap.FirstOrDefault(pair => pair.Value == recipientId).Key;
            if (recipientConnId != null)
            {
                await Clients.Client(recipientConnId).SendAsync("TroopTransferReceived", new
                {
                    transferId = transfer.Id.ToString(),
                    initiatorId = transfer.InitiatorId,
                    initiatorName = transfer.InitiatorName,
                    amount = transfer.Amount,
                    expiresAt = transfer.ExpiresAt.ToString("O")
                });
            }
        }

        return new { transferId = transferId!.Value.ToString() };
    }

    public async Task RespondToTroopTransfer(string transferId, bool accepted)
    {
        if (!Guid.TryParse(transferId, out var parsedTransferId))
        {
            await SendError(InvalidRequestCode, "Invalid transfer ID.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var pendingTransfer = room.State.ActiveTroopTransfers.FirstOrDefault(item => item.Id == parsedTransferId);
        var initiatorId = pendingTransfer?.InitiatorId;
        var (state, error) = gameService.RespondToTroopTransfer(room.Code, UserId, parsedTransferId, accepted);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
        if (initiatorId != null && pendingTransfer != null)
        {
            var initiatorConnId = room.ConnectionMap.FirstOrDefault(pair => pair.Value == initiatorId).Key;
            if (initiatorConnId != null)
            {
                await Clients.Client(initiatorConnId).SendAsync("TroopTransferResult", new
                {
                    accepted,
                    amount = pendingTransfer.Amount,
                    recipientName = pendingTransfer.RecipientName,
                    initiatorName = pendingTransfer.InitiatorName
                });
            }
        }
    }

    public async Task<object?> InitiateFieldBattle()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (battle, error) = gameService.InitiateFieldBattle(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return null;
        }

        var snapshot = gameService.GetStateSnapshot(room.Code);
        if (snapshot != null)
            await BroadcastState(room.Code, snapshot);

        var enemyIds = room.State.Players
            .Where(player => player.CurrentHexQ == battle!.Q
                && player.CurrentHexR == battle.R
                && player.AllianceId != battle.InitiatorAllianceId
                && player.CarriedTroops > 0)
            .Select(player => player.Id)
            .ToList();
        var invite = new
        {
            battleId = battle!.Id.ToString(),
            initiatorName = battle.InitiatorName,
            initiatorAllianceName = room.State.Alliances
                .FirstOrDefault(alliance => alliance.Id == battle.InitiatorAllianceId)?.Name ?? "",
            q = battle.Q,
            r = battle.R,
            joinDeadline = battle.JoinDeadline.ToString("O")
        };
        foreach (var enemyId in enemyIds)
        {
            foreach (var (connId, uid) in room.ConnectionMap)
            {
                if (uid == enemyId)
                    await Clients.Client(connId).SendAsync("FieldBattleInvite", invite);
            }
        }

        var capturedBattleId = battle.Id;
        var capturedRoomCode = room.Code;
        var capturedHubContext = hubContext;
        _ = Task.Run(async () =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30));
            var resolvedRoom = gameService.GetRoom(capturedRoomCode);
            if (resolvedRoom == null)
                return;

            var (state, result, resolveError) = gameService.ResolveFieldBattle(capturedRoomCode, capturedBattleId);
            if (resolveError != null || state == null)
                return;

            await capturedHubContext.Clients.Group(capturedRoomCode).SendAsync("StateUpdated", state);
            if (result != null)
            {
                foreach (var participantId in result.AllParticipantIds)
                {
                    foreach (var (connId, uid) in resolvedRoom.ConnectionMap)
                    {
                        if (uid == participantId)
                        {
                            await capturedHubContext.Clients.Client(connId)
                                .SendAsync("FieldBattleResolved", new
                                {
                                    battleId = result.BattleId.ToString(),
                                    initiatorWon = result.InitiatorWon,
                                    initiatorName = result.InitiatorName,
                                    q = result.Q,
                                    r = result.R,
                                    initiatorTroopsLost = result.InitiatorTroopsLost,
                                    enemyTroopsLost = result.EnemyTroopsLost,
                                    noEnemiesJoined = result.NoEnemiesJoined
                                });
                        }
                    }
                }
            }
        });

        return new { battleId = battle.Id.ToString() };
    }

    public async Task JoinFieldBattle(string battleId)
    {
        if (!Guid.TryParse(battleId, out var parsedBattleId))
        {
            await SendError(InvalidRequestCode, "Invalid battle ID.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var error = gameService.JoinFieldBattle(room.Code, UserId, parsedBattleId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        var (state, result, resolveError) = gameService.ResolveFieldBattle(room.Code, parsedBattleId);
        if (resolveError != null || state == null)
            return;

        await BroadcastState(room.Code, state);
        if (result != null)
        {
            foreach (var participantId in result.AllParticipantIds)
            {
                foreach (var (connId, uid) in room.ConnectionMap)
                {
                    if (uid == participantId)
                    {
                        await Clients.Client(connId).SendAsync("FieldBattleResolved", new
                        {
                            battleId = result.BattleId.ToString(),
                            initiatorWon = result.InitiatorWon,
                            initiatorName = result.InitiatorName,
                            q = result.Q,
                            r = result.R,
                            initiatorTroopsLost = result.InitiatorTroopsLost,
                            enemyTroopsLost = result.EnemyTroopsLost,
                            noEnemiesJoined = result.NoEnemiesJoined
                        });
                    }
                }
            }
        }
    }

    public async Task JoinGlobalMap(double lat, double lng)
    {
        if (!ValidateLatLng(lat, lng))
        {
            await SendError(InvalidRequestCode, "Invalid coordinates.");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, "global");
        await globalMap.EnsurePlayerHasStartingHex(Guid.Parse(UserId), lat, lng);
        var hexes = await globalMap.GetHexesNearAsync(lat, lng);
        await Clients.Caller.SendAsync("GlobalMapLoaded", hexes);
    }
}
