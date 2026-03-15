using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;

namespace Landgrab.Api.Hubs;

[Authorize]
public class GameHub(GameService gameService, GlobalMapService globalMap, TerrainFetchService terrainFetchService, IServiceScopeFactory scopeFactory, ILogger<GameHub> logger)
    : Hub
{
    private const string InvalidRequestCode = "INVALID_INPUT";
    private const int MaxCoordinateValue = 1000;
    private const int MaxRoomCodeLength = 10;
    private const int MaxAllianceNameLength = 50;
    private const int MaxAllianceNamesCount = 20;
    private const int MaxHostMessageLength = 500;
    private const int MaxIdentifierLength = 100;
    private const int MaxShortStringLength = 50;
    private const int MaxTemplateNameLength = 100;
    private const int MaxDescriptionLength = 500;
    private const int MaxCustomAreaCoordinates = 500;
    private const int MaxModesCount = 20;
    private const int MaxTargetAllianceIdsCount = 20;
    private const string CustomCopresencePreset = "Aangepast";
    private static readonly ConcurrentDictionary<string, DateTime> _lastLocationUpdate = new();
    private static readonly TimeSpan UpdatePlayerLocationInterval = TimeSpan.FromMilliseconds(500);
    private static readonly HashSet<string> AllowedHostEventTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Calamity",
        "Epidemic",
        "BonusTroops",
        "RushHour"
    };

    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("Client connected: {ConnectionId} User: {User}",
            Context.ConnectionId, UserId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _lastLocationUpdate.TryRemove(Context.ConnectionId, out _);

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
        if (!ValidateRoomCode(roomCode))
        {
            await SendError(InvalidRequestCode, "Invalid room code.");
            return;
        }

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
        if (!ValidateRoomCode(roomCode))
        {
            const string message = "Invalid room code.";
            await SendError(InvalidRequestCode, message);
            throw new HubException(message);
        }

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
        if (!ValidateLatLng(lat, lng))
        {
            await SendError(InvalidRequestCode, "Invalid coordinates.");
            return;
        }

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
        if (string.IsNullOrWhiteSpace(allianceName) || !ValidateStringLength(allianceName, MaxAllianceNameLength))
        {
            await SendError(InvalidRequestCode, "Alliance name must be between 1 and 50 characters.");
            return;
        }

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
        if (allianceNames == null ||
            allianceNames.Count > MaxAllianceNamesCount ||
            allianceNames.Any(name => string.IsNullOrWhiteSpace(name) || !ValidateStringLength(name, MaxAllianceNameLength)))
        {
            await SendError(InvalidRequestCode, "Alliance names must contain at most 20 entries with names up to 50 characters.");
            return;
        }

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
        if (!ValidateCoordRange(q, r) || !ValidateIdentifier(allianceId))
        {
            await SendError(InvalidRequestCode, "Invalid starting tile or alliance identifier.");
            return;
        }

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
        if (!ValidateEnumString<GameAreaPattern>(pattern))
        {
            await SendError(InvalidRequestCode, "Invalid game area pattern.");
            return;
        }

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
        if (coordinates == null ||
            coordinates.Count > MaxCustomAreaCoordinates ||
            coordinates.Any(coord => coord == null || !ValidateCoordRange(coord.Q, coord.R)))
        {
            await SendError(InvalidRequestCode, "Custom game area must contain at most 500 valid coordinates.");
            return;
        }

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
        if (!ValidateEnumString<ClaimMode>(mode))
        {
            await SendError(InvalidRequestCode, "Invalid claim mode.");
            return;
        }

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

    public async Task SetAllowSelfClaim(bool allow)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetAllowSelfClaim(room.Code, UserId, allow);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetWinCondition(string type, int value)
    {
        if (!ValidateEnumString<WinConditionType>(type))
        {
            await SendError(InvalidRequestCode, "Invalid win condition.");
            return;
        }

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

    public async Task SetCopresenceModes(List<string> modes)
    {
        if (modes == null ||
            modes.Count > MaxModesCount ||
            modes.Any(mode => !ValidateEnumString<CopresenceMode>(mode) ||
                Enum.Parse<CopresenceMode>(mode, true) == CopresenceMode.None))
        {
            await SendError(InvalidRequestCode, "Invalid copresence modes.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetCopresenceModes(room.Code, UserId, modes);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetCopresencePreset(string preset)
    {
        if (!ValidateCopresencePreset(preset))
        {
            await SendError(InvalidRequestCode, "Invalid copresence preset.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetCopresencePreset(room.Code, UserId, preset);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetGameDynamics(GameDynamics dynamics)
    {
        if (!ValidateGameDynamics(dynamics))
        {
            await SendError(InvalidRequestCode, "Invalid game dynamics configuration.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetGameDynamics(room.Code, UserId, dynamics);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetPlayerRole(string role)
    {
        if (!ValidateEnumString<PlayerRole>(role))
        {
            await SendError(InvalidRequestCode, "Invalid player role.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetPlayerRole(room.Code, UserId, role);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetAllianceHQ(int q, int r, string allianceId)
    {
        if (!ValidateCoordRange(q, r) || !ValidateIdentifier(allianceId))
        {
            await SendError(InvalidRequestCode, "Invalid headquarters location or alliance identifier.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetAllianceHQ(room.Code, UserId, q, r, allianceId);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

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

    public async Task SetMasterTile(double lat, double lng)
    {
        if (!ValidateLatLng(lat, lng))
        {
            await SendError(InvalidRequestCode, "Invalid coordinates.");
            return;
        }

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
        if (!ValidateCoordRange(q, r))
        {
            await SendError(InvalidRequestCode, "Invalid hex coordinates.");
            return;
        }

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
        if (!ValidateCoordRange(q, r) || !ValidateIdentifier(targetPlayerId))
        {
            await SendError(InvalidRequestCode, "Invalid starting tile or player identifier.");
            return;
        }

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

        // Fetch terrain data before starting (outside the game lock)
        if (room.State.Dynamics.TerrainEnabled && room.State.HasMapLocation)
        {
            await terrainFetchService.AssignTerrainToGrid(
                room.State.Grid,
                room.State.MapLat!.Value,
                room.State.MapLng!.Value,
                room.State.TileSizeMeters);
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
                    await Clients.Client(challengedConnectionId).SendAsync("DuelChallenge", newDuel);
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
            await Clients.Group(room.Code).SendAsync("AmbushResult", ambushResult);
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
                await Clients.Client(connId).SendAsync("TileLost", new { Q = q, R = r, AttackerName = Username });
        }

        if (combatResult != null)
            await Clients.Caller.SendAsync("CombatResult", combatResult);
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
        if (room == null) { await SendError("ROOM_NOT_JOINED", "Not in a room."); return; }

        var (success, winnerId, loserId) = gameService.ResolveDuel(room.Code, duelId, true);
        if (!success) { await SendError("Duel could not be resolved."); return; }

        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null) await BroadcastState(room.Code, state);

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
        if (room == null) { await SendError("ROOM_NOT_JOINED", "Not in a room."); return; }

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
        if (room == null) { await SendError("ROOM_NOT_JOINED", "Not in a room."); return; }

        var (state, error) = gameService.DetainPlayer(room.Code, UserId, targetPlayerId);
        if (error != null) { await SendError(error); return; }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetHostBypassGps(string roomCode, bool bypass)
    {
        if (!ValidateRoomCode(roomCode))
        {
            await SendError(InvalidRequestCode, "Invalid room code.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (success, error) = gameService.SetHostBypassGps(room.Code, UserId, bypass);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
            await BroadcastState(room.Code, state);
    }

    public async Task SetMaxFootprint(string roomCode, int meters)
    {
        if (!ValidateRoomCode(roomCode))
        {
            await SendError(InvalidRequestCode, "Invalid room code.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (success, error) = gameService.SetMaxFootprint(room.Code, UserId, meters);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
            await BroadcastState(room.Code, state);
    }

    public async Task LoadMapTemplate(string roomCode, Guid templateId)
    {
        if (!ValidateRoomCode(roomCode))
        {
            await SendError(InvalidRequestCode, "Invalid room code.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (success, error) = await gameService.LoadMapTemplate(room.Code, UserId, templateId, scopeFactory);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
            await BroadcastState(room.Code, state);
    }

    public async Task SaveCurrentAreaAsTemplate(string roomCode, string name, string? description)
    {
        if (!ValidateRoomCode(roomCode) ||
            string.IsNullOrWhiteSpace(name) ||
            !ValidateStringLength(name, MaxTemplateNameLength) ||
            (description != null && !ValidateStringLength(description, MaxDescriptionLength)))
        {
            await SendError(InvalidRequestCode, "Invalid template details.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (success, error, templateId) = await gameService.SaveCurrentAreaAsTemplate(
            room.Code, UserId, name, description, scopeFactory);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await Clients.Caller.SendAsync("TemplateSaved", templateId);
    }

    // ── Host Observer Mode ────────────────────────────────────────────

    public async Task SetHostObserverMode(string roomCode, bool enabled)
    {
        if (!ValidateRoomCode(roomCode))
        {
            await SendError(InvalidRequestCode, "Invalid room code.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetHostObserverMode(room.Code, UserId, enabled);
        if (error != null) { await SendError(error); return; }
        await BroadcastState(room.Code, state!);
    }

    public async Task UpdateGameDynamicsLive(string roomCode, GameDynamics dynamics)
    {
        if (!ValidateRoomCode(roomCode) || !ValidateGameDynamics(dynamics))
        {
            await SendError(InvalidRequestCode, "Invalid game dynamics configuration.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.UpdateGameDynamicsLive(room.Code, UserId, dynamics);
        if (error != null) { await SendError(error); return; }
        await BroadcastState(room.Code, state!);
    }

    public async Task TriggerGameEvent(string roomCode, string eventType,
        int? targetQ, int? targetR, string? targetAllianceId)
    {
        if (!ValidateRoomCode(roomCode) ||
            !ValidateHostEventType(eventType) ||
            (targetQ.HasValue != targetR.HasValue) ||
            (targetQ.HasValue && !ValidateCoordRange(targetQ.Value, targetR!.Value)) ||
            (targetAllianceId != null && !ValidateIdentifier(targetAllianceId)))
        {
            await SendError(InvalidRequestCode, "Invalid event request.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.TriggerGameEvent(room.Code, UserId, eventType, targetQ, targetR, targetAllianceId);
        if (error != null) { await SendError(error); return; }

        await BroadcastState(room.Code, state!);
        await Clients.Group(room.Code).SendAsync("RandomEvent", new
        {
            type = eventType,
            title = eventType,
            description = $"The host triggered a {eventType} event!"
        });
    }

    public async Task SendHostMessage(string roomCode, string message, List<string>? targetAllianceIds)
    {
        if (!ValidateRoomCode(roomCode) ||
            string.IsNullOrWhiteSpace(message) ||
            !ValidateStringLength(message, MaxHostMessageLength) ||
            (targetAllianceIds != null &&
                (targetAllianceIds.Count > MaxTargetAllianceIdsCount ||
                 targetAllianceIds.Any(id => !ValidateIdentifier(id)))))
        {
            await SendError(InvalidRequestCode, "Invalid host message request.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SendHostMessage(room.Code, UserId, message, targetAllianceIds);
        if (error != null) { await SendError(error); return; }

        var payload = new { message, fromHost = true, targetAllianceIds };

        if (targetAllianceIds != null && targetAllianceIds.Count > 0)
        {
            // Send to targeted alliance members only
            var connectionIds = gameService.GetAllianceConnectionIds(room, targetAllianceIds);
            foreach (var connId in connectionIds)
                await Clients.Client(connId).SendAsync("HostMessage", payload);

            // Also send to host so they see confirmation, unless already included above
            if (!connectionIds.Contains(Context.ConnectionId))
                await Clients.Caller.SendAsync("HostMessage", payload);
        }
        else
        {
            // Broadcast to all players
            await Clients.Group(room.Code).SendAsync("HostMessage", payload);
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task PauseGame(string roomCode, bool paused)
    {
        if (!ValidateRoomCode(roomCode))
        {
            await SendError(InvalidRequestCode, "Invalid room code.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null || !string.Equals(room.Code, roomCode, StringComparison.OrdinalIgnoreCase))
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.PauseGame(room.Code, UserId, paused);
        if (error != null) { await SendError(error); return; }
        await BroadcastState(room.Code, state!);
    }

    private async Task BroadcastState(string roomCode, GameState state, string? aliasEvent = null)
    {
        if (!string.IsNullOrWhiteSpace(aliasEvent))
            await Clients.Group(roomCode).SendAsync(aliasEvent, state);

        // Phase 7: Fog of War — per-player filtered broadcasts during gameplay
        if (state.Dynamics.FogOfWarEnabled && state.Phase == GamePhase.Playing)
        {
            var room = gameService.GetRoom(roomCode);
            if (room != null)
            {
                var hostObserverUserId = state.HostObserverMode
                    ? room.HostUserId.ToString()
                    : null;
                var hiddenFogCells = gameService.CreateHiddenFogCellsForBroadcast(state);

                foreach (var (connectionId, userId) in room.ConnectionMap)
                {
                    var playerSnapshot = hostObserverUserId == userId
                        ? state
                        : gameService.GetPlayerSnapshot(state, userId, hiddenFogCells);
                    await Clients.Client(connectionId).SendAsync("StateUpdated", playerSnapshot);
                }

                return;
            }
        }

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

    private static bool ValidateStringLength(string? value, int maxLength) =>
        value is not null && value.Length <= maxLength;

    private static bool ValidateCoordRange(int q, int r) =>
        Math.Abs(q) <= MaxCoordinateValue && Math.Abs(r) <= MaxCoordinateValue;

    private static bool ValidateLatLng(double lat, double lng) =>
        double.IsFinite(lat) &&
        double.IsFinite(lng) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180;

    private static bool ValidateRoomCode(string? roomCode) =>
        !string.IsNullOrWhiteSpace(roomCode) && ValidateStringLength(roomCode, MaxRoomCodeLength);

    private static bool ValidateIdentifier(string? value) =>
        !string.IsNullOrWhiteSpace(value) && ValidateStringLength(value, MaxIdentifierLength);

    private static bool ValidateEnumString<TEnum>(string? value) where TEnum : struct, Enum =>
        !string.IsNullOrWhiteSpace(value) &&
        ValidateStringLength(value, MaxShortStringLength) &&
        Enum.TryParse<TEnum>(value, true, out _);

    private static bool ValidateCopresencePreset(string? preset) =>
        !string.IsNullOrWhiteSpace(preset) &&
        ValidateStringLength(preset, MaxShortStringLength) &&
        (string.Equals(preset, CustomCopresencePreset, StringComparison.Ordinal) || LobbyService.CopresencePresets.ContainsKey(preset));

    private static bool ValidateHostEventType(string? eventType) =>
        !string.IsNullOrWhiteSpace(eventType) &&
        ValidateStringLength(eventType, MaxIdentifierLength) &&
        AllowedHostEventTypes.Contains(eventType);

    private static bool ValidateGameDynamics(GameDynamics? dynamics)
    {
        if (dynamics == null || dynamics.ActiveCopresenceModes == null)
        {
            return false;
        }

        if (dynamics.CopresencePreset != null && !ValidateCopresencePreset(dynamics.CopresencePreset))
        {
            return false;
        }

        if (dynamics.ActiveCopresenceModes.Count > MaxModesCount)
        {
            return false;
        }

        return dynamics.ActiveCopresenceModes.All(mode =>
            Enum.IsDefined(mode) &&
            mode != CopresenceMode.None);
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
