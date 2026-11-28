using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Hubs;

/// <summary>
/// Spectating: watching a room with a watch code, without playing in it.
/// Spectator connections are not player connections, so every other hub method answers "Not in a room".
/// </summary>
public partial class GameHub
{
    private const int MaxWatchCodeInputLength = 32;

    /// <summary>Join a room as a spectator. Works before and during the game.</summary>
    public async Task<SpectateResultDto> SpectateRoom(string watchCode)
    {
        if (string.IsNullOrWhiteSpace(watchCode) || !ValidateStringLength(watchCode, MaxWatchCodeInputLength))
        {
            const string message = "That watch code is not valid.";
            await SendError("WATCH_CODE_INVALID", message);
            throw new HubException(message);
        }

        var previousRoom = spectatorService.GetRoomByConnection(Context.ConnectionId);
        var (room, error) = spectatorService.Join(watchCode, UserId, Username, Context.ConnectionId);
        if (error != null || room == null)
        {
            var message = error ?? "Unable to watch this game.";
            await SendError(MapSpectatorErrorCode(message), message);
            throw new HubException(message);
        }

        if (previousRoom != null && !ReferenceEquals(previousRoom, room))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, previousRoom.Code);
            await NotifyHostOfSpectators(previousRoom);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room.Code);

        var state = gameService.GetStateSnapshot(room.Code);
        if (state != null)
        {
            var fullState = visibilityBroadcastHelper.CreateStateForSpectator(state, derivedMapStateService);
            await Clients.Caller.SendAsync("StateUpdated", fullState);
            if (fullState.Phase == GamePhase.GameOver)
            {
                await Clients.Caller.SendAsync("GameOver", new
                {
                    fullState.WinnerId,
                    fullState.WinnerName,
                    fullState.IsAllianceVictory
                });
            }
        }

        await NotifyHostOfSpectators(room);
        return new SpectateResultDto { RoomCode = room.Code };
    }

    public async Task LeaveSpectating()
    {
        var room = spectatorService.Leave(Context.ConnectionId);
        if (room == null)
        {
            return;
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, room.Code);
        await NotifyHostOfSpectators(room);
    }

    /// <summary>Host only: the watch code and who is watching.</summary>
    public async Task<SpectatorInfoDto?> GetSpectatorInfo()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (info, error) = spectatorService.GetInfo(room.Code, UserId);
        if (error != null)
        {
            await SendError(MapErrorCode(error), error);
            return null;
        }

        return info;
    }

    /// <summary>Host only: allow or stop spectating. Stopping removes everyone and retires the code.</summary>
    public async Task<SpectatorInfoDto?> SetSpectatorsEnabled(bool enabled)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (state, removed, error) = spectatorService.SetEnabled(room.Code, UserId, enabled);
        if (error != null)
        {
            await SendError(MapErrorCode(error), error);
            return null;
        }

        await DropSpectatorConnections(room, removed, notifyHost: false);
        await BroadcastState(room.Code, state!);
        return await NotifyHostOfSpectators(room);
    }

    /// <summary>Host only: make a new watch code and remove everyone who is watching.</summary>
    public async Task<SpectatorInfoDto?> RegenerateWatchCode()
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (state, removed, error) = spectatorService.RegenerateWatchCode(room.Code, UserId);
        if (error != null)
        {
            await SendError(MapErrorCode(error), error);
            return null;
        }

        await DropSpectatorConnections(room, removed, notifyHost: false);
        await BroadcastState(room.Code, state!);
        return await NotifyHostOfSpectators(room);
    }

    /// <summary>Host only: remove one spectator.</summary>
    public async Task<SpectatorInfoDto?> RemoveSpectator(string spectatorUserId)
    {
        if (!ValidateIdentifier(spectatorUserId))
        {
            await SendError(InvalidRequestCode, "Invalid spectator.");
            return null;
        }

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room == null)
        {
            await SendError("ROOM_NOT_JOINED", "Not in a room.");
            return null;
        }

        var (removed, error) = spectatorService.RemoveSpectator(room.Code, UserId, spectatorUserId);
        if (error != null)
        {
            await SendError(MapErrorCode(error), error);
            return null;
        }

        await DropSpectatorConnections(room, removed, notifyHost: false);
        return await NotifyHostOfSpectators(room);
    }

    /// <summary>Takes removed spectator connections out of the room's group and tells them why.</summary>
    private async Task DropSpectatorConnections(GameRoom room, IReadOnlyList<string> connectionIds, bool notifyHost = true)
    {
        if (connectionIds.Count == 0)
        {
            return;
        }

        foreach (var connectionId in connectionIds)
        {
            // A connection that is (now) a player connection of this room keeps its group membership.
            if (!room.ConnectionMap.ContainsKey(connectionId))
            {
                await Groups.RemoveFromGroupAsync(connectionId, room.Code);
            }

            await Clients.Client(connectionId).SendAsync("SpectatorRemoved", new { roomCode = room.Code });
        }

        if (notifyHost)
        {
            await NotifyHostOfSpectators(room);
        }
    }

    /// <summary>A connection that starts playing stops watching whatever it was watching.</summary>
    private async Task StopSpectatingBeforePlaying()
    {
        var room = spectatorService.Leave(Context.ConnectionId);
        if (room == null)
        {
            return;
        }

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, room.Code);
        await NotifyHostOfSpectators(room);
    }

    /// <summary>Pushes the host-only spectator info (with the watch code) to the host's own connections.</summary>
    private async Task<SpectatorInfoDto> NotifyHostOfSpectators(GameRoom room)
    {
        var info = spectatorService.BuildInfo(room);
        var hostUserId = room.HostUserId.ToString();
        foreach (var (connectionId, userId) in room.ConnectionMap)
        {
            if (userId == hostUserId)
            {
                await Clients.Client(connectionId).SendAsync("SpectatorInfoUpdated", info);
            }
        }

        return info;
    }

    private static string MapSpectatorErrorCode(string message)
    {
        var normalized = message.ToLowerInvariant();
        if (normalized.Contains("too many attempts"))
        {
            return "WATCH_RATE_LIMITED";
        }

        if (normalized.Contains("players in this game"))
        {
            return "WATCH_PLAYER_BLOCKED";
        }

        if (normalized.Contains("maximum number"))
        {
            return "WATCH_FULL";
        }

        if (normalized.Contains("leave your current room"))
        {
            return "WATCH_ALREADY_PLAYING";
        }

        return "WATCH_CODE_INVALID";
    }
}
