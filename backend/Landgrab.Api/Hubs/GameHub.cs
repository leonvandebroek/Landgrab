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
    // ─── Connection lifecycle ────────────────────────────────────────────────

    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("Client connected: {ConnectionId} User: {User}",
            Context.ConnectionId, UserId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        gameService.RemoveConnection(Context.ConnectionId);
        if (room != null)
            await Clients.Group(room.Code).SendAsync("StateUpdated", room.State);
        await base.OnDisconnectedAsync(exception);
    }

    // ─── Room management ─────────────────────────────────────────────────────

    public async Task CreateRoom()
    {
        var room = gameService.CreateRoom(UserId, Username, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        await Clients.Caller.SendAsync("RoomCreated", room.Code, room.State);
    }

    public async Task JoinRoom(string roomCode)
    {
        var (room, error) = gameService.JoinRoom(roomCode, UserId, Username, Context.ConnectionId);
        if (error != null) { await SendError(error); return; }

        await Groups.AddToGroupAsync(Context.ConnectionId, room!.Code);
        await Clients.Group(room.Code).SendAsync("PlayerJoined", room.State);
    }

    public async Task SetMapLocation(double lat, double lng)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (state, error) = gameService.SetMapLocation(room.Code, UserId, lat, lng);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("StateUpdated", state);
    }

    public async Task SetAlliance(string allianceName)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (state, error) = gameService.SetAlliance(room.Code, UserId, allianceName);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("StateUpdated", state);
    }

    public async Task StartGame()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (state, error) = gameService.StartGame(room.Code, UserId);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("GameStarted", state);
    }

    // ─── Gameplay ────────────────────────────────────────────────────────────

    public async Task PlaceReinforcement(int q, int r)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (state, error) = gameService.PlaceReinforcement(room.Code, UserId, q, r);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("StateUpdated", state);
        if (state!.Phase == GamePhase.GameOver)
            await Clients.Group(room.Code).SendAsync("GameOver",
                new { state.WinnerId, state.WinnerName, state.IsAllianceVictory });
    }

    public async Task RollDice()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (state, error) = gameService.RollDice(room.Code, UserId);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("StateUpdated", state);
    }

    public async Task ClaimHex(int q, int r)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (state, error) = gameService.ClaimHex(room.Code, UserId, q, r);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("StateUpdated", state);
        if (state!.Phase == GamePhase.GameOver)
            await Clients.Group(room.Code).SendAsync("GameOver",
                new { state.WinnerId, state.WinnerName, state.IsAllianceVictory });
    }

    public async Task AttackHex(int fromQ, int fromR, int toQ, int toR)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (result, error) = gameService.AttackHex(room.Code, UserId, fromQ, fromR, toQ, toR);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("CombatResult", result);
        if (result!.NewState.Phase == GamePhase.GameOver)
            await Clients.Group(room.Code).SendAsync("GameOver",
                new
                {
                    result.NewState.WinnerId,
                    result.NewState.WinnerName,
                    result.NewState.IsAllianceVictory
                });
    }

    public async Task EndTurn()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null) { await SendError("Not in a room."); return; }

        var (state, error) = gameService.EndTurn(room.Code, UserId);
        if (error != null) { await SendError(error); return; }

        await Clients.Group(room.Code).SendAsync("StateUpdated", state);
    }

    // ─── Global FFA ──────────────────────────────────────────────────────────

    public async Task AttackGlobalHex(int fromQ, int fromR, int toQ, int toR)
    {
        var (result, error) = await globalMap.AttackHexAsync(
            Guid.Parse(UserId), fromQ, fromR, toQ, toR);
        if (error != null) { await SendError(error); return; }

        // Broadcast to global group so nearby players see the change
        await Clients.Group("global").SendAsync("GlobalHexUpdated", result);
    }

    public async Task JoinGlobalMap(double lat, double lng)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, "global");
        await globalMap.EnsurePlayerHasStartingHex(Guid.Parse(UserId), lat, lng);
        var hexes = await globalMap.GetHexesNearAsync(lat, lng);
        await Clients.Caller.SendAsync("GlobalMapLoaded", hexes);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private string UserId => Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new HubException("Not authenticated.");

    private string Username => Context.User?.FindFirstValue(ClaimTypes.Name)
        ?? Context.User?.FindFirstValue("unique_name")
        ?? "Unknown";

    private Task SendError(string message) =>
        Clients.Caller.SendAsync("Error", message);
}
