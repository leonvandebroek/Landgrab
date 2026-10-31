using Microsoft.AspNetCore.SignalR;
using VirtuBattle.Server.Rooms;

namespace VirtuBattle.Server.Hubs;

/// <summary>
/// The real-time game hub. M0 covers joining a room, the roster and a latency ping.
/// Positions (M1), shots (M2) and Nearby Interaction token relay (M3) come next.
/// </summary>
public sealed class GameHub(RoomRegistry rooms, TimeProvider timeProvider, ILogger<GameHub> logger) : Hub<IGameClient>
{
    public const string Path = "/hub/game";

    public async Task<JoinRoomResponse> JoinRoom(string roomCode, string displayName)
    {
        JoinResult result;
        try
        {
            result = rooms.Join(Context.ConnectionId, roomCode, displayName);
        }
        catch (ArgumentException ex)
        {
            throw new HubException(ex.Message.Split(" (Parameter", 2)[0]);
        }

        if (result.PreviousRoomCode is { } previous)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, previous);
            await BroadcastRoster(previous, rooms.GetRoster(previous));
        }

        var code = result.Player.RoomCode;
        await Groups.AddToGroupAsync(Context.ConnectionId, code);
        await BroadcastRoster(code, result.Roster);

        logger.LogInformation("{Name} joined room {Room} ({Count} players)", result.Player.DisplayName, code, result.Roster.Count);

        return new JoinRoomResponse(
            result.Player.PlayerId,
            code,
            result.Roster.Select(PlayerDto.From).ToArray(),
            NowMs());
    }

    public async Task LeaveRoom()
    {
        if (rooms.Leave(Context.ConnectionId) is { } left)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, left.Player.RoomCode);
            await BroadcastRoster(left.Player.RoomCode, left.Roster);
        }
    }

    /// <summary>Round-trip probe so the client can show latency and estimate clock offset.</summary>
    public PongResponse Ping(long clientTimeMs) => new(clientTimeMs, NowMs());

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (rooms.Leave(Context.ConnectionId) is { } left)
        {
            logger.LogInformation("{Name} disconnected from room {Room}", left.Player.DisplayName, left.Player.RoomCode);
            await BroadcastRoster(left.Player.RoomCode, left.Roster);
        }

        await base.OnDisconnectedAsync(exception);
    }

    private Task BroadcastRoster(string roomCode, IReadOnlyList<Player> roster) =>
        Clients.Group(roomCode).RosterChanged(new RosterChangedEvent(roomCode, roster.Select(PlayerDto.From).ToArray()));

    private long NowMs() => timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
}
