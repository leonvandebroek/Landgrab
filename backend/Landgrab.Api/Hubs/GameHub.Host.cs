using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Hubs;

public partial class GameHub
{
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

        room.VisibilityMemory.Clear();
        foreach (var player in state!.Players)
        {
            room.VisibilityMemory.TryAdd(player.Id, new PlayerVisibilityMemory());
        }

        await visibilityBroadcastHelper.BroadcastPerViewer(
            room,
            state,
            Clients.Group(room.Code),
            connectionId => Clients.Client(connectionId),
            derivedMapStateService,
            "GameStarted");
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
        {
            await BroadcastState(room.Code, state);
        }
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
        {
            await BroadcastState(room.Code, state);
        }
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
        {
            await BroadcastState(room.Code, state);
        }
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
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task UpdateGameDynamicsLive(string roomCode, GameDynamics dynamics)
    {
        if (dynamics == null)
        {
            await SendError(InvalidRequestCode, "Invalid game dynamics configuration.");
            return;
        }

        var sanitizedDynamics = SanitizeGameDynamics(dynamics);
        if (!ValidateRoomCode(roomCode) || !ValidateGameDynamics(sanitizedDynamics))
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

        var (state, error) = gameService.UpdateGameDynamicsLive(room.Code, UserId, sanitizedDynamics);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await Clients.Group(room.Code).SendAsync("DynamicsChanged", state!.Dynamics);
        await BroadcastState(room.Code, state);
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
        if (error != null)
        {
            await SendError(error);
            return;
        }

        var payload = new { message, fromHost = true, targetAllianceIds };

        if (targetAllianceIds != null && targetAllianceIds.Count > 0)
        {
            var connectionIds = gameService.GetAllianceConnectionIds(room, targetAllianceIds);
            foreach (var connId in connectionIds)
            {
                await Clients.Client(connId).SendAsync("HostMessage", payload);
            }

            if (!connectionIds.Contains(Context.ConnectionId))
            {
                await Clients.Caller.SendAsync("HostMessage", payload);
            }
        }
        else
        {
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
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }

    public async Task SetFieldBattleResolutionMode(string mode)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return;
        }

        var (state, error) = gameService.SetFieldBattleResolutionMode(room.Code, UserId, mode);
        if (error != null)
        {
            await SendError(error);
            return;
        }

        await BroadcastState(room.Code, state!);
    }
}
