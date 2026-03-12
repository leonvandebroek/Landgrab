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
            await SendError(MapErrorCode(error), error);
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
            await SendError("ROOM_NO_ACTIVE", message);
            throw new HubException(message);
        }

        var (room, error) = gameService.JoinRoom(existingRoom.Code, UserId, Username, Context.ConnectionId);
        if (error != null || room == null)
        {
            var message = error ?? "Unable to rejoin the active room.";
            await SendError(MapErrorCode(message), message);
            throw new HubException(message);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        var state = gameService.GetStateSnapshot(room.Code);
        if (state == null)
        {
            const string message = "Unable to load the current room state.";
            await SendError("ROOM_STATE_UNAVAILABLE", message);
            throw new HubException(message);
        }

        await BroadcastState(room.Code, state, "PlayerJoined");
        return room.Code;
    }

    public async Task ReturnToLobby()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
            return;

        gameService.RemoveConnection(room, Context.ConnectionId, returnedToLobby: true);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, room.Code);
        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
            await BroadcastState(room.Code, state);
    }

    public IReadOnlyList<RoomSummaryDto> GetMyRooms() => gameService.GetRoomsForUser(UserId);

    public async Task SetMapLocation(double lat, double lng)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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

    public async Task ConfigureAlliances(List<string> allianceNames)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.ConfigureAlliances(room.Code, UserId, allianceNames);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task DistributePlayers()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.DistributePlayersRandomly(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task AssignAllianceStartingTile(int q, int r, string allianceId)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.AssignAllianceStartingTile(room.Code, UserId, q, r, allianceId);
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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

    public async Task UseCenteredGameArea()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.UseCenteredGameArea(room.Code, UserId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetPatternGameArea(string pattern)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetPatternGameArea(room.Code, UserId, pattern);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetCustomGameArea(IReadOnlyList<HexCoordinateDto> coordinates)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetCustomGameArea(room.Code, UserId, coordinates);
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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

    public async Task SetMasterTileByHex(int q, int r)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetMasterTileByHex(room.Code, UserId, q, r);
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
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
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.PickUpTroops(room.Code, UserId, q, r, count, playerLat, playerLng);
        if (error != null)
        {
            await SendError(MapErrorCode(error), error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task PlaceTroops(int q, int r, double playerLat, double playerLng,
        int? troopCount = null, bool claimForSelf = false)
    {
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
                await Clients.Client(connId).SendAsync("TileLost", new { Q = q, R = r, AttackerName = Username });
        }

        if (combatResult != null)
            await Clients.Caller.SendAsync("CombatResult", combatResult);
    }

    public async Task ReClaimHex(int q, int r, string mode)
    {
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
        SendError("GENERAL", message);

    private Task SendError(string code, string message) =>
        Clients.Caller.SendAsync("Error", new HubErrorDto
        {
            Code = code,
            Message = message
        });

    private static string MapErrorCode(string message)
    {
        var normalized = message.ToLowerInvariant();
        if (normalized.Contains("room not found"))
        {
            return "ROOM_NOT_FOUND";
        }

        if (normalized.Contains("room is full"))
        {
            return "ROOM_FULL";
        }

        if (normalized.Contains("not in a room"))
        {
            return "ROOM_NOT_JOINED";
        }

        if (normalized.Contains("already"))
        {
            return "ROOM_ALREADY_JOINED";
        }

        if (normalized.Contains("host"))
        {
            return "HOST_REQUIRED";
        }

        return "GENERAL";
    }
}
