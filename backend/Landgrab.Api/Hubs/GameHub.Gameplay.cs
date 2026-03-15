using System;
using System.Linq;
using System.Threading.Tasks;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Hubs;

public partial class GameHub
{
    public async Task ActivateBeacon()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateBeacon(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
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

    public async Task ActivateStealth()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateStealth(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task ActivateCommandoRaid(int targetQ, int targetR)
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

        var (state, error) = gameService.ActivateCommandoRaid(room.Code, UserId, targetQ, targetR);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task UpdatePlayerLocation(double lat, double lng)
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

        var (state, error, newDuel, tollPaid, preyCaught) = gameService.UpdatePlayerLocation(room.Code, UserId, lat, lng);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);

        // Phase 5: Toll — notify all clients a toll was paid
        if (tollPaid != null)
        {
            var (payerId, amount, hexQ, hexR) = tollPaid.Value;
            await Clients.Group(room.Code).SendAsync("TollPaid", new
            {
                payerId,
                amount,
                hexQ,
                hexR
            });
        }

        // Phase 6: JagerProoi — notify all clients a prey was caught
        if (preyCaught != null)
        {
            var (hunterId, preyId, reward) = preyCaught.Value;
            await Clients.Group(room.Code).SendAsync("PreyCaught", new
            {
                hunterId,
                preyId,
                reward
            });
        }

        // Phase 10: Duel — notify challenged player
        if (newDuel != null)
        {
            var challengedId = newDuel.PlayerIds.FirstOrDefault(id => id != UserId);
            if (challengedId != null)
            {
                var challengedConnectionId = room.ConnectionMap
                    .FirstOrDefault(kv => kv.Value == challengedId).Key;
                if (challengedConnectionId != null)
                {
                    await Clients.Client(challengedConnectionId).SendAsync("DuelChallenge", newDuel);
                }
            }
        }
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

        var (state, error, ambushResult) = gameService.PickUpTroops(room.Code, UserId, q, r, count, playerLat, playerLng);
        if (error != null)
        {
            await SendError(MapErrorCode(error), error);
            return;
        }

        await BroadcastState(room.Code, state!);

        if (ambushResult != null)
        {
            await Clients.Group(room.Code).SendAsync("AmbushResult", ambushResult);
        }
    }

    public async Task PlaceTroops(int q, int r, double playerLat, double playerLng,
        int? troopCount = null, bool claimForSelf = false)
    {
        if (!ValidateCoordRange(q, r) ||
            !ValidateLatLng(playerLat, playerLng) ||
            (troopCount.HasValue && troopCount.Value <= 0))
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

        var (state, error, previousOwnerId, combatResult) = gameService.PlaceTroops(
            room.Code, UserId, q, r, playerLat, playerLng, troopCount, claimForSelf);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);

        if (previousOwnerId != null)
        {
            var lostConnections = room.ConnectionMap
                .Where(kv => kv.Value == previousOwnerId)
                .Select(kv => kv.Key);
            foreach (var connId in lostConnections)
            {
                await Clients.Client(connId).SendAsync("TileLost", new { Q = q, R = r, AttackerName = Username });
            }
        }

        if (combatResult != null)
        {
            await Clients.Caller.SendAsync("CombatResult", combatResult);
        }
    }

    public async Task ReClaimHex(int q, int r, string mode)
    {
        if (!ValidateCoordRange(q, r) || !ValidateEnumString<ReClaimMode>(mode))
        {
            await SendError(InvalidRequestCode, "Invalid reclaim request.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        if (!Enum.TryParse<ReClaimMode>(mode, true, out var parsedMode))
        {
            await SendError("Invalid reclaim mode.");
            return;
        }

        var (state, error) = gameService.ReClaimHex(room.Code, UserId, q, r, parsedMode);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
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

    // Phase 10: Duel
    public async Task AcceptDuel(string duelId)
    {
        if (!ValidateIdentifier(duelId))
        {
            await SendError(InvalidRequestCode, "Invalid duel identifier.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (success, winnerId, loserId) = gameService.ResolveDuel(room.Code, duelId, true);
        if (!success)
        {
            await SendError("Duel could not be resolved.");
            return;
        }

        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
        {
            await BroadcastState(room.Code, state);
        }

        await Clients.Group(room.Code).SendAsync("DuelResult", new { duelId, winnerId, loserId });
    }

    public async Task DeclineDuel(string duelId)
    {
        if (!ValidateIdentifier(duelId))
        {
            await SendError(InvalidRequestCode, "Invalid duel identifier.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        gameService.ResolveDuel(room.Code, duelId, false);
    }

    // Phase 10: Hostage
    public async Task DetainPlayer(string targetPlayerId)
    {
        if (!ValidateIdentifier(targetPlayerId))
        {
            await SendError(InvalidRequestCode, "Invalid player identifier.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.DetainPlayer(room.Code, UserId, targetPlayerId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }
}
