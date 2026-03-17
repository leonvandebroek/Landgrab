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

    public async Task ActivateTacticalStrike()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateTacticalStrike(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task ActivateReinforce()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateReinforce(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
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

    public async Task ActivateEmergencyRepair()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ActivateEmergencyRepair(room.Code, UserId);
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

        var result = gameService.UpdatePlayerLocation(room.Code, UserId, lat, lng);
        if (result.error != null)
        {
            await SendError(result.error);
            return;
        }

        if (result.gridChanged)
        {
            await BroadcastState(room.Code, result.state!);
            return;
        }

        await Clients.Group(room.Code).SendAsync("PlayersMoved", result.state!.Players);
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
}
