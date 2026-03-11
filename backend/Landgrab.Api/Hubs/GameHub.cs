using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Hubs;

[Authorize]
public class GameHub(GameService gameService, GlobalMapService globalMap, ILogger<GameHub> logger)
    : Hub
{
    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("Client connected: {ConnectionId} User: {User}",
            Context.ConnectionId, UserId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room != null)
        {
            gameService.RemoveConnection(room, Context.ConnectionId);
            var state = gameService.GetStateSnapshot(room.Code);
            if (state != null)
                await BroadcastState(room.Code, state);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task CreateRoom()
    {
        var room = gameService.CreateRoom(UserId, Username, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
            await Clients.Caller.SendAsync("RoomCreated", room.Code, state);
    }

    public async Task JoinRoom(string roomCode)
    {
        var (room, error) = gameService.JoinRoom(roomCode, UserId, Username, Context.ConnectionId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room!.Code);
        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
            await BroadcastState(room.Code, state, "PlayerJoined");
    }

    public async Task<string> RejoinRoom(string roomCode)
    {
        var existingRoom = gameService.GetRoomByUserId(UserId, roomCode);
        if (existingRoom == null)
        {
            const string message = "No active room found for the current user.";
            await SendError(message);
            throw new HubException(message);
        }

        var (room, error) = gameService.JoinRoom(existingRoom.Code, UserId, Username, Context.ConnectionId);
        if (error != null || room == null)
        {
            var message = error ?? "Unable to rejoin the active room.";
            await SendError(message);
            throw new HubException(message);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        var state = gameService.GetStateSnapshot(room.Code);
        if (state == null)
        {
            const string message = "Unable to load the current room state.";
            await SendError(message);
            throw new HubException(message);
        }

        await BroadcastState(room.Code, state, "PlayerJoined");
        return room.Code;
    }

    public async Task SetMapLocation(double lat, double lng)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.SetMapLocation(room.Code, UserId, lat, lng);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetAlliance(string allianceName)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.SetAlliance(room.Code, UserId, allianceName);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetTileSize(int meters)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.SetTileSize(room.Code, UserId, meters);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetClaimMode(string mode)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.SetClaimMode(room.Code, UserId, mode);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetWinCondition(string type, int value)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.SetWinCondition(room.Code, UserId, type, value);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetMasterTile(double lat, double lng)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.SetMasterTile(room.Code, UserId, lat, lng);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task AssignStartingTile(int q, int r, string targetPlayerId)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.AssignStartingTile(room.Code, UserId, q, r, targetPlayerId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task StartGame()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.StartGame(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await Clients.Group(room.Code).SendAsync("GameStarted", state);
    }

    public async Task UpdatePlayerLocation(double lat, double lng)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.UpdatePlayerLocation(room.Code, UserId, lat, lng);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task PickUpTroops(int q, int r, int count, double playerLat, double playerLng)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.PickUpTroops(room.Code, UserId, q, r, count, playerLat, playerLng);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task PlaceTroops(int q, int r, double playerLat, double playerLng)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("Not in a room.");
            return;
        }

        var (state, error) = gameService.PlaceTroops(room.Code, UserId, q, r, playerLat, playerLng);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task AttackGlobalHex(int fromQ, int fromR, int toQ, int toR)
    {
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
        await Groups.AddToGroupAsync(Context.ConnectionId, "global");
        await globalMap.EnsurePlayerHasStartingHex(Guid.Parse(UserId), lat, lng);
        var hexes = await globalMap.GetHexesNearAsync(lat, lng);
        await Clients.Caller.SendAsync("GlobalMapLoaded", hexes);
    }

    private async Task BroadcastState(string roomCode, GameState state, string? aliasEvent = null)
    {
        if (!string.IsNullOrWhiteSpace(aliasEvent))
            await Clients.Group(roomCode).SendAsync(aliasEvent, state);

        await Clients.Group(roomCode).SendAsync("StateUpdated", state);
        if (state.Phase == GamePhase.GameOver)
        {
            await Clients.Group(roomCode).SendAsync("GameOver", new
            {
                state.WinnerId,
                state.WinnerName,
                state.IsAllianceVictory
            });
        }
    }

    private async Task SendStateToCaller(GameState state)
    {
        await Clients.Caller.SendAsync("StateUpdated", state);
        if (state.Phase == GamePhase.GameOver)
        {
            await Clients.Caller.SendAsync("GameOver", new
            {
                state.WinnerId,
                state.WinnerName,
                state.IsAllianceVictory
            });
        }
    }

    private string UserId => Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? Context.User?.FindFirstValue(JwtRegisteredClaimNames.Sub)
        ?? throw new HubException("Not authenticated.");

    private string Username => Context.User?.FindFirstValue(ClaimTypes.Name)
        ?? Context.User?.FindFirstValue("unique_name")
        ?? "Unknown";

    private Task SendError(string message) =>
        Clients.Caller.SendAsync("Error", message);
}
