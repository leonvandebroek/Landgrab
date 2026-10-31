using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using VirtuBattle.Server.Hubs;

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

    private HubConnection Connect() =>
        new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, GameHub.Path), o =>
            {
                o.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                o.Transports = Microsoft.AspNetCore.Http.Connections.HttpTransportType.LongPolling;
            })
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
