using Microsoft.AspNetCore.SignalR;
using VirtuBattle.Server.Rooms;

namespace VirtuBattle.Server.Hubs;

/// <summary>
/// The real-time game hub: rooms and roster (M0), positions and rate modes (M1).
/// Shots (M2) and Nearby Interaction token relay (M3) come next.
/// </summary>
public sealed class GameHub(RoomRegistry rooms, TimeProvider timeProvider, ILogger<GameHub> logger) : Hub<IGameClient>
{
    public const string Path = "/hub/game";

    public async Task<JoinRoomResponse> JoinRoom(string roomCode, string displayName)
    {
        var result = Guard(() => rooms.Join(Context.ConnectionId, roomCode, displayName));

        if (result.PreviousRoomCode is { } previous)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, previous);
            await BroadcastRoster(previous, rooms.GetRoster(previous));
            await NotifyModeChanges(result.PreviousRoomModeChanges);
        }

        var code = result.Player.RoomCode;
        await Groups.AddToGroupAsync(Context.ConnectionId, code);
        await BroadcastRoster(code, result.Roster);

        logger.LogInformation("{Name} joined room {Room} ({Count} players)", result.Player.DisplayName, code, result.Roster.Count);

        return new JoinRoomResponse(
            result.Player.PlayerId,
            code,
            result.Roster.Select(PlayerDto.From).ToArray(),
            result.Positions.Select(p => PlayerPositionDto.From(p.Player, p.Position)).ToArray(),
            RateModeChangedEvent.From(result.Mode, null),
            NowMs());
    }

    public async Task LeaveRoom()
    {
        if (rooms.Leave(Context.ConnectionId) is { } left)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, left.Player.RoomCode);
            await BroadcastRoster(left.Player.RoomCode, left.Roster);
            await NotifyModeChanges(left.ModeChanges);
        }
    }

    /// <summary>Stores the caller's position, relays it to the rest of the room and updates rate modes.</summary>
    public async Task UpdatePosition(PositionUpdate update)
    {
        var result = Guard(() => rooms.UpdatePosition(
            Context.ConnectionId, update.Latitude, update.Longitude, update.HorizontalAccuracy, update.TimestampMs))
            ?? throw new HubException("Join a room before sending positions.");

        await Clients.OthersInGroup(result.Player.RoomCode).PlayerMoved(PlayerPositionDto.From(result.Player, result.Position));
        await NotifyModeChanges(result.ModeChanges);
    }

    /// <summary>Round-trip probe so the client can show latency and estimate clock offset.</summary>
    public PongResponse Ping(long clientTimeMs) => new(clientTimeMs, NowMs());

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (rooms.Leave(Context.ConnectionId) is { } left)
        {
            logger.LogInformation("{Name} disconnected from room {Room}", left.Player.DisplayName, left.Player.RoomCode);
            await BroadcastRoster(left.Player.RoomCode, left.Roster);
            await NotifyModeChanges(left.ModeChanges);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task NotifyModeChanges(IReadOnlyList<RateModeChange> changes)
    {
        foreach (var change in changes)
        {
            logger.LogInformation("Player {Player} rate mode {Mode} (nearest {Distance:F0} m)", change.PlayerId, change.Mode, change.NearestDistanceMeters);
            await Clients.Client(change.ConnectionId).RateModeChanged(RateModeChangedEvent.From(change.Mode, change.NearestDistanceMeters));
        }
    }

    private Task BroadcastRoster(string roomCode, IReadOnlyList<Player> roster) =>
        Clients.Group(roomCode).RosterChanged(new RosterChangedEvent(roomCode, roster.Select(PlayerDto.From).ToArray()));

    /// <summary>Turns validation errors into HubExceptions, whose message the client gets to see.</summary>
    private static T Guard<T>(Func<T> action)
    {
        try
        {
            return action();
        }
        catch (ArgumentException ex)
        {
            throw new HubException(ex.Message.Split(" (Parameter", 2)[0]);
        }
    }

    private long NowMs() => timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
}
