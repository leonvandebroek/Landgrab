using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using VirtuBattle.Server.Hubs;
using VirtuBattle.Server.Rooms;

namespace VirtuBattle.Server.Tests;

public class GameHubTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task Health_endpoint_responds()
    {
        using var http = factory.CreateClient();
        var response = await http.GetAsync("/health");
        response.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Two_players_join_and_see_each_other_then_one_leaves()
    {
        await using var alice = Connect();
        await using var bob = Connect();
        var aliceRosters = ListenForRosters(alice);

        await alice.StartAsync();
        await bob.StartAsync();

        var aliceJoin = await alice.InvokeAsync<JoinRoomResponse>(nameof(GameHub.JoinRoom), "hubtest", "Alice");
        Assert.Equal("HUBTEST", aliceJoin.RoomCode);
        Assert.Single(aliceJoin.Players);

        var bobJoin = await bob.InvokeAsync<JoinRoomResponse>(nameof(GameHub.JoinRoom), "HUBTEST", "Bob");
        Assert.Equal(["Alice", "Bob"], bobJoin.Players.Select(p => p.DisplayName));

        await WaitForRoster(aliceRosters, r => r.Players.Count == 2);

        await bob.StopAsync();

        var afterLeave = await WaitForRoster(aliceRosters, r => r.Players.Count == 1);
        Assert.Equal(aliceJoin.PlayerId, afterLeave.Players[0].PlayerId);
    }

    [Fact]
    public async Task Ping_echoes_client_time()
    {
        await using var client = Connect();
        await client.StartAsync();

        var pong = await client.InvokeAsync<PongResponse>(nameof(GameHub.Ping), 1234L);

        Assert.Equal(1234L, pong.ClientTimeMs);
        Assert.True(pong.ServerTimeMs > 0);
    }

    [Fact]
    public async Task Invalid_room_code_returns_readable_error()
    {
        await using var client = Connect();
        await client.StartAsync();

        var ex = await Assert.ThrowsAsync<HubException>(() =>
            client.InvokeAsync<JoinRoomResponse>(nameof(GameHub.JoinRoom), "x", "Alice"));
        Assert.Contains("Room code must be 4 to 8 letters or digits.", ex.Message);
    }

    [Fact]
    public async Task Positions_are_relayed_and_rate_modes_follow_distance()
    {
        await using var alice = Connect();
        await using var bob = Connect();
        var aliceMoves = Listen<PlayerPositionDto>(alice, nameof(IGameClient.PlayerMoved));
        var aliceModes = Listen<RateModeChangedEvent>(alice, nameof(IGameClient.RateModeChanged));
        var bobModes = Listen<RateModeChangedEvent>(bob, nameof(IGameClient.RateModeChanged));
        await alice.StartAsync();
        await bob.StartAsync();

        var aliceJoin = await alice.InvokeAsync<JoinRoomResponse>(nameof(GameHub.JoinRoom), "POSTEST", "Alice");
        Assert.Equal(RateMode.Idle, aliceJoin.RateMode.Mode);
        await alice.InvokeAsync(nameof(GameHub.UpdatePosition), new PositionUpdate(51.4416, 5.4697, 5, 1000));

        var bobJoin = await bob.InvokeAsync<JoinRoomResponse>(nameof(GameHub.JoinRoom), "POSTEST", "Bob");
        Assert.Single(bobJoin.Positions);
        await bob.InvokeAsync(nameof(GameHub.UpdatePosition), new PositionUpdate(51.4425, 5.4697, 8, 2000));

        var moved = await WaitFor(aliceMoves, m => m.PlayerId == bobJoin.PlayerId);
        Assert.Equal(51.4425, moved.Latitude, 6);
        Assert.Equal(2000, moved.TimestampMs);

        var aliceMode = await WaitFor(aliceModes, _ => true);
        Assert.Equal(RateMode.Engaged, aliceMode.Mode);
        Assert.Equal(1000, aliceMode.IntervalMs);
        Assert.Equal(RateMode.Engaged, (await WaitFor(bobModes, _ => true)).Mode);
    }

    [Fact]
    public async Task UpdatePosition_before_joining_is_refused()
    {
        await using var client = Connect();
        await client.StartAsync();

        var ex = await Assert.ThrowsAsync<HubException>(() =>
            client.InvokeAsync(nameof(GameHub.UpdatePosition), new PositionUpdate(51, 5, 5, 0)));
        Assert.Contains("Join a room before sending positions.", ex.Message);
    }

    private static Channel<T> Listen<T>(HubConnection connection, string method)
    {
        var channel = Channel.CreateUnbounded<T>();
        connection.On<T>(method, evt => channel.Writer.TryWrite(evt));
        return channel;
    }

    private static async Task<T> WaitFor<T>(Channel<T> channel, Func<T, bool> match)
    {
        using var cts = new CancellationTokenSource(Timeout);
        await foreach (var evt in channel.Reader.ReadAllAsync(cts.Token))
        {
            if (match(evt))
            {
                return evt;
            }
        }

        throw new TimeoutException("Expected event never arrived.");
    }

    private HubConnection Connect() =>
        new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, GameHub.Path), o =>
            {
                o.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
            })
            .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)))
            .Build();

    private static Channel<RosterChangedEvent> ListenForRosters(HubConnection connection)
    {
        var channel = Channel.CreateUnbounded<RosterChangedEvent>();
        connection.On<RosterChangedEvent>(nameof(IGameClient.RosterChanged), evt => channel.Writer.TryWrite(evt));
        return channel;
    }

    private static async Task<RosterChangedEvent> WaitForRoster(Channel<RosterChangedEvent> channel, Func<RosterChangedEvent, bool> match)
    {
        using var cts = new CancellationTokenSource(Timeout);
        await foreach (var evt in channel.Reader.ReadAllAsync(cts.Token))
        {
            if (match(evt))
            {
                return evt;
            }
        }

        throw new TimeoutException("Expected roster never arrived.");
    }
}
