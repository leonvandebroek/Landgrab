using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Hubs;

public partial class GameHub
{
    public async Task CreateRoom()
    {
        var room = gameService.CreateRoom(UserId, Username, Context.ConnectionId);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);
        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
        {
            await Clients.Caller.SendAsync("RoomCreated", room.Code, state);
        }
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
        {
            await BroadcastState(room.Code, state, "PlayerJoined");
        }
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
        {
            return;
        }

        gameService.RemoveConnection(room, Context.ConnectionId, returnedToLobby: true);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, room.Code);
        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
        {
            await BroadcastState(room.Code, state);
        }
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
            modes.Any(mode => !IsRecognizedCopresenceMode(mode) ||
                string.Equals(mode, nameof(CopresenceMode.None), StringComparison.OrdinalIgnoreCase)))
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

        var supportedModes = modes
            .Where(IsSupportedCopresenceMode)
            .Select(mode => Enum.Parse<CopresenceMode>(mode, true))
            .ToList();

        var (state, error) = gameService.SetCopresenceModes(room.Code, UserId, supportedModes.Select(mode => mode.ToString()).ToList());
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
        if (dynamics == null)
        {
            await SendError(InvalidRequestCode, "Invalid game dynamics configuration.");
            return;
        }

        var sanitizedDynamics = SanitizeGameDynamics(dynamics);
        if (!ValidateGameDynamics(sanitizedDynamics))
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

        var (state, error) = gameService.SetGameDynamics(room.Code, UserId, sanitizedDynamics);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetPlayerRole(string role)
    {
        if (!IsSupportedPlayerRole(role))
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

    public async Task SetWizardStep(int step)
    {
        if (step < 0)
        {
            await SendError(InvalidRequestCode, "Wizard step must be 0 or greater.");
            return;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetWizardStep(room.Code, UserId, step);
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
}
