using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Tests.Services;

public sealed class VisibilityBroadcastHelperTests
{
    [Fact]
    public async Task BroadcastPerViewer_WhenAlliancesGameIsPlaying_ProjectsStatePerViewer()
    {
        var hostUserId = Guid.NewGuid();
        var enemyUserId = Guid.NewGuid().ToString();
        var state = new TestSupport.GameStateBuilder()
            .WithGrid(5)
            .WithMap()
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostUserId.ToString(), "Host")
            .AddPlayer(enemyUserId, "Enemy")
            .AddAlliance("a1", "Blue", hostUserId.ToString())
            .AddAlliance("a2", "Red", enemyUserId)
            .WithPlayerPosition(hostUserId.ToString(), 0, 0)
            .WithPlayerPosition(enemyUserId, 4, 0)
            .OwnHex(0, 0, hostUserId.ToString(), "a1", troops: 5)
            .OwnHex(4, 0, enemyUserId, "a2", troops: 7)
            .Build();

        var room = new GameRoom
        {
            Code = state.RoomCode,
            HostUserId = hostUserId,
            State = state
        };
        room.ConnectionMap.TryAdd("conn-host", hostUserId.ToString());
        room.ConnectionMap.TryAdd("conn-enemy", enemyUserId);

        var groupProxy = new RecordingClientProxy();
        var hostProxy = new RecordingClientProxy();
        var enemyProxy = new RecordingClientProxy();
        var proxies = new Dictionary<string, RecordingClientProxy>(StringComparer.Ordinal)
        {
            ["conn-host"] = hostProxy,
            ["conn-enemy"] = enemyProxy
        };

        var helper = new VisibilityBroadcastHelper(new VisibilityService());

        await helper.BroadcastPerViewer(
            room,
            state,
            groupProxy,
            connectionId => proxies[connectionId],
            new DerivedMapStateService());

        groupProxy.Calls.Should().BeEmpty();

        var hostState = hostProxy.SingleStateUpdated();
        var enemyState = enemyProxy.SingleStateUpdated();

        hostState.Grid[HexService.Key(4, 0)].OwnerId.Should().Be(enemyUserId);
        hostState.Grid[HexService.Key(4, 0)].Troops.Should().Be(7);
        hostState.Grid[HexService.Key(4, 0)].VisibilityTier.Should().Be(VisibilityTier.Hidden);
        enemyState.Grid[HexService.Key(0, 0)].OwnerId.Should().Be(hostUserId.ToString());
        enemyState.Grid[HexService.Key(0, 0)].Troops.Should().Be(5);
        enemyState.Grid[HexService.Key(0, 0)].VisibilityTier.Should().Be(VisibilityTier.Hidden);
    }

    [Fact]
    public async Task BroadcastPlayersPerViewer_WhenHostilesAreOutOfSight_OnlySendsAlliedAndVisiblePlayers()
    {
        var hostUserId = Guid.NewGuid();
        var allyUserId = Guid.NewGuid().ToString();
        var enemyUserId = Guid.NewGuid().ToString();
        var state = new TestSupport.GameStateBuilder()
            .WithGrid(5)
            .WithMap()
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostUserId.ToString(), "Host")
            .AddPlayer(allyUserId, "Ally")
            .AddPlayer(enemyUserId, "Enemy")
            .AddAlliance("a1", "Blue", hostUserId.ToString(), allyUserId)
            .AddAlliance("a2", "Red", enemyUserId)
            .WithPlayerPosition(hostUserId.ToString(), 0, 0)
            .WithPlayerPosition(allyUserId, 1, 0)
            .WithPlayerPosition(enemyUserId, 4, 0)
            .Build();

        var room = new GameRoom
        {
            Code = state.RoomCode,
            HostUserId = hostUserId,
            State = state
        };
        room.ConnectionMap.TryAdd("conn-host", hostUserId.ToString());

        var hostProxy = new RecordingClientProxy();
        var helper = new VisibilityBroadcastHelper(new VisibilityService());

        await helper.BroadcastPlayersPerViewer(
            room,
            state,
            connectionId => connectionId == "conn-host"
                ? hostProxy
                : throw new InvalidOperationException("Unexpected connection."),
            new VisibilityService());

        var movedPlayers = hostProxy.SinglePlayersMoved();
        movedPlayers.Select(player => player.Name).Should().BeEquivalentTo(["Host", "Ally"]);
        movedPlayers.Should().NotContain(player => player.Name == "Enemy");
    }

    [Fact]
    public void CreateStateForViewer_WhenHostObserverModeIsEnabledForHost_ReturnsUnfilteredState()
    {
        var hostUserId = Guid.NewGuid();
        var enemyUserId = Guid.NewGuid().ToString();
        var state = new TestSupport.GameStateBuilder()
            .WithGrid(5)
            .WithMap()
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostUserId.ToString(), "Host")
            .AddPlayer(enemyUserId, "Enemy")
            .AddAlliance("a1", "Blue", hostUserId.ToString())
            .AddAlliance("a2", "Red", enemyUserId)
            .WithPlayerPosition(hostUserId.ToString(), 0, 0)
            .WithPlayerPosition(enemyUserId, 4, 0)
            .OwnHex(4, 0, enemyUserId, "a2", troops: 7)
            .Build();
        state.HostObserverMode = true;

        var room = new GameRoom
        {
            Code = state.RoomCode,
            HostUserId = hostUserId,
            State = state
        };

        var helper = new VisibilityBroadcastHelper(new VisibilityService());

        var viewerState = helper.CreateStateForViewer(room, state, hostUserId.ToString(), new DerivedMapStateService());

        viewerState.Grid[HexService.Key(4, 0)].OwnerId.Should().Be(enemyUserId);
        viewerState.Grid[HexService.Key(4, 0)].VisibilityTier.Should().NotBe(VisibilityTier.Hidden);
    }

    private sealed class RecordingClientProxy : IClientProxy
    {
        public List<(string Method, object?[] Args)> Calls { get; } = [];

        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            Calls.Add((method, args));
            return Task.CompletedTask;
        }

        public GameState SingleStateUpdated()
        {
            return Calls.Single(call => call.Method == "StateUpdated").Args.OfType<GameState>().Single();
        }

        public List<PlayerDto> SinglePlayersMoved()
        {
            return Calls.Single(call => call.Method == "PlayersMoved").Args.OfType<List<PlayerDto>>().Single();
        }
    }
}
