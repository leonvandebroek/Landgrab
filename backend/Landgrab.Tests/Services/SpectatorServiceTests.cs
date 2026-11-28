using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Landgrab.Tests.Services;

public sealed class SpectatorServiceTests
{
    private const string Secret = "test-secret-test-secret-test-secret-test-secret-test-secret-test-1234";

    private sealed class Fixture
    {
        public RoomService Rooms { get; }
        public SpectatorService Spectators { get; }
        public string HostId { get; } = Guid.NewGuid().ToString();
        public GameRoom Room { get; }

        public Fixture(string secret = Secret)
        {
            var persistence = new RoomPersistenceService(
                new Mock<IServiceScopeFactory>().Object,
                NullLogger<RoomPersistenceService>.Instance);
            Rooms = new RoomService(persistence, NullLogger<RoomService>.Instance);
            var gameState = new GameStateService(Rooms, persistence, NullLogger<GameStateService>.Instance);
            var configuration = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Secret"] = secret })
                .Build();
            Spectators = new SpectatorService(Rooms, gameState, configuration);
            Room = Rooms.CreateRoom(HostId, "Host", "conn-host");
        }

        public string Enable()
        {
            var (_, _, error) = Spectators.SetEnabled(Room.Code, HostId, true);
            error.Should().BeNull();
            return Spectators.GetWatchCode(Room);
        }
    }

    [Fact]
    public void Join_WhenSpectatorsAreOff_IsRefused()
    {
        var fx = new Fixture();
        var code = fx.Spectators.GetWatchCode(fx.Room);

        var (room, error) = fx.Spectators.Join(code, Guid.NewGuid().ToString(), "Viewer", "conn-v");

        room.Should().BeNull();
        error.Should().Be("That watch code is not valid.");
        fx.Room.SpectatorConnections.Should().BeEmpty();
    }

    [Fact]
    public void Join_WithTheWatchCode_AddsASpectatorButNoPlayer()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        var viewerId = Guid.NewGuid().ToString();

        var (room, error) = fx.Spectators.Join(code, viewerId, "Viewer", "conn-v");

        error.Should().BeNull();
        room.Should().BeSameAs(fx.Room);
        fx.Room.SpectatorConnections.Should().ContainKey("conn-v");
        fx.Room.State.Players.Should().ContainSingle(player => player.Id == fx.HostId);
        fx.Room.ConnectionMap.Should().NotContainKey("conn-v");
        fx.Spectators.GetRoomByConnection("conn-v").Should().BeSameAs(fx.Room);
        // Player-facing lookups keep treating the spectator as "not in a room".
        fx.Rooms.GetRoomByConnection("conn-v").Should().BeNull();
        fx.Rooms.GetRoomByUserId(viewerId).Should().BeNull();
    }

    [Theory]
    [InlineData("lower")]
    [InlineData("dashed")]
    [InlineData("spaced")]
    public void Join_AcceptsTheCodeHoweverItIsTyped(string style)
    {
        var fx = new Fixture();
        var code = fx.Enable();
        var typed = style switch
        {
            "lower" => code.ToLowerInvariant(),
            "dashed" => code[..4] + "-" + code[4..],
            _ => " " + code[..4] + " " + code[4..] + " "
        };

        var (room, error) = fx.Spectators.Join(typed, Guid.NewGuid().ToString(), "Viewer", "conn-v");

        error.Should().BeNull();
        room.Should().NotBeNull();
    }

    [Fact]
    public void Join_WithTheRoomCode_IsRefused()
    {
        var fx = new Fixture();
        fx.Enable();

        var (room, error) = fx.Spectators.Join(fx.Room.Code, Guid.NewGuid().ToString(), "Viewer", "conn-v");

        room.Should().BeNull();
        error.Should().Be("That watch code is not valid.");
    }

    [Fact]
    public void Join_ByAPlayerOfTheRoom_IsRefused()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        var playerId = Guid.NewGuid().ToString();
        fx.Rooms.JoinRoom(fx.Room.Code, playerId, "Player", "conn-p").error.Should().BeNull();

        var asPlayer = fx.Spectators.Join(code, playerId, "Player", "conn-p2");
        var asHost = fx.Spectators.Join(code, fx.HostId, "Host", "conn-h2");

        asPlayer.error.Should().Be("Players in this game cannot watch it.");
        asHost.error.Should().Be("Players in this game cannot watch it.");
        fx.Room.SpectatorConnections.Should().BeEmpty();
    }

    [Fact]
    public void Join_FromAConnectionThatIsPlayingElsewhere_IsRefused()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        var otherHost = Guid.NewGuid().ToString();
        fx.Rooms.CreateRoom(otherHost, "Other", "conn-other");

        var (room, error) = fx.Spectators.Join(code, otherHost, "Other", "conn-other");

        room.Should().BeNull();
        error.Should().Be("Leave your current room before watching another one.");
    }

    [Fact]
    public void Join_WorksWhileTheGameIsRunning()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        fx.Room.State.Phase = GamePhase.Playing;

        var (room, error) = fx.Spectators.Join(code, Guid.NewGuid().ToString(), "Viewer", "conn-v");

        error.Should().BeNull();
        room.Should().NotBeNull();
    }

    [Fact]
    public void Join_StopsAtTheSpectatorLimit()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        for (var i = 0; i < SpectatorService.MaxSpectatorConnections; i++)
            fx.Spectators.Join(code, Guid.NewGuid().ToString(), $"V{i}", $"conn-{i}").error.Should().BeNull();

        var (room, error) = fx.Spectators.Join(code, Guid.NewGuid().ToString(), "Late", "conn-late");

        room.Should().BeNull();
        error.Should().Be("This game already has the maximum number of spectators.");
    }

    [Fact]
    public void Join_IsRateLimitedPerAccount()
    {
        var fx = new Fixture();
        fx.Enable();
        var guesser = Guid.NewGuid().ToString();
        for (var i = 0; i < 10; i++)
            fx.Spectators.Join("AAAAAAAA", guesser, "Guesser", "conn-g").error.Should().Be("That watch code is not valid.");

        var (_, error) = fx.Spectators.Join(fx.Spectators.GetWatchCode(fx.Room), guesser, "Guesser", "conn-g");

        error.Should().Be("Too many attempts. Wait a minute and try again.");
        // Someone else is not affected.
        fx.Spectators.Join(fx.Spectators.GetWatchCode(fx.Room), Guid.NewGuid().ToString(), "Viewer", "conn-v")
            .error.Should().BeNull();
    }

    [Fact]
    public void SetEnabled_ByNonHost_IsRefused()
    {
        var fx = new Fixture();

        var (state, _, error) = fx.Spectators.SetEnabled(fx.Room.Code, Guid.NewGuid().ToString(), true);

        state.Should().BeNull();
        error.Should().Be("Only the host can change spectator settings.");
        fx.Room.State.SpectatorsEnabled.Should().BeFalse();
    }

    [Fact]
    public void SetEnabledFalse_RemovesEveryoneAndRetiresTheCode()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        fx.Spectators.Join(code, Guid.NewGuid().ToString(), "A", "conn-a");
        fx.Spectators.Join(code, Guid.NewGuid().ToString(), "B", "conn-b");

        var (state, removed, error) = fx.Spectators.SetEnabled(fx.Room.Code, fx.HostId, false);

        error.Should().BeNull();
        state!.SpectatorsEnabled.Should().BeFalse();
        removed.Should().BeEquivalentTo(["conn-a", "conn-b"]);
        fx.Room.SpectatorConnections.Should().BeEmpty();
        fx.Spectators.GetRoomByConnection("conn-a").Should().BeNull();

        // Turning it back on gives a different code: the old link stays dead.
        fx.Enable().Should().NotBe(code);
        fx.Spectators.Join(code, Guid.NewGuid().ToString(), "C", "conn-c").error
            .Should().Be("That watch code is not valid.");
    }

    [Fact]
    public void RegenerateWatchCode_ChangesTheCodeAndRemovesEveryone()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        fx.Spectators.Join(code, Guid.NewGuid().ToString(), "A", "conn-a");

        var (state, removed, error) = fx.Spectators.RegenerateWatchCode(fx.Room.Code, fx.HostId);

        error.Should().BeNull();
        state!.SpectatorsEnabled.Should().BeTrue();
        removed.Should().BeEquivalentTo(["conn-a"]);
        var newCode = fx.Spectators.GetWatchCode(fx.Room);
        newCode.Should().NotBe(code);
        fx.Spectators.Join(code, Guid.NewGuid().ToString(), "B", "conn-b").error.Should().NotBeNull();
        fx.Spectators.Join(newCode, Guid.NewGuid().ToString(), "B", "conn-b").error.Should().BeNull();
    }

    [Fact]
    public void RegenerateWatchCode_ByNonHost_IsRefused()
    {
        var fx = new Fixture();
        var code = fx.Enable();

        var (_, _, error) = fx.Spectators.RegenerateWatchCode(fx.Room.Code, Guid.NewGuid().ToString());

        error.Should().Be("Only the host can change spectator settings.");
        fx.Spectators.GetWatchCode(fx.Room).Should().Be(code);
    }

    [Fact]
    public void RemoveSpectator_RemovesAllConnectionsOfThatAccountOnly()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        var a = Guid.NewGuid().ToString();
        var b = Guid.NewGuid().ToString();
        fx.Spectators.Join(code, a, "A", "conn-a1");
        fx.Spectators.Join(code, a, "A", "conn-a2");
        fx.Spectators.Join(code, b, "B", "conn-b");

        var refused = fx.Spectators.RemoveSpectator(fx.Room.Code, b, a);
        var (removed, error) = fx.Spectators.RemoveSpectator(fx.Room.Code, fx.HostId, a);

        refused.error.Should().Be("Only the host can remove spectators.");
        error.Should().BeNull();
        removed.Should().BeEquivalentTo(["conn-a1", "conn-a2"]);
        fx.Room.SpectatorConnections.Keys.Should().BeEquivalentTo(["conn-b"]);
    }

    [Fact]
    public void Leave_RemovesOnlyThatConnection()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        fx.Spectators.Join(code, Guid.NewGuid().ToString(), "A", "conn-a");
        fx.Spectators.Join(code, Guid.NewGuid().ToString(), "B", "conn-b");

        fx.Spectators.Leave("conn-a").Should().BeSameAs(fx.Room);
        fx.Spectators.Leave("conn-a").Should().BeNull();

        fx.Room.SpectatorConnections.Keys.Should().BeEquivalentTo(["conn-b"]);
        // Leaving never touches players.
        fx.Room.State.Players.Single().IsConnected.Should().BeTrue();
    }

    [Fact]
    public void RemovePlayersFromSpectators_DropsASpectatorWhoBecameAPlayer()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        var switcher = Guid.NewGuid().ToString();
        var viewer = Guid.NewGuid().ToString();
        fx.Spectators.Join(code, switcher, "Switcher", "conn-s");
        fx.Spectators.Join(code, viewer, "Viewer", "conn-v");
        fx.Rooms.JoinRoom(fx.Room.Code, switcher, "Switcher", "conn-s-play").error.Should().BeNull();

        var removed = fx.Spectators.RemovePlayersFromSpectators(fx.Room);

        removed.Should().BeEquivalentTo(["conn-s"]);
        fx.Room.SpectatorConnections.Keys.Should().BeEquivalentTo(["conn-v"]);
    }

    [Fact]
    public void GetInfo_IsHostOnlyAndListsEachAccountOnce()
    {
        var fx = new Fixture();
        var code = fx.Enable();
        var a = Guid.NewGuid().ToString();
        fx.Spectators.Join(code, a, "Tablet", "conn-a1");
        fx.Spectators.Join(code, a, "Tablet", "conn-a2");

        var forOther = fx.Spectators.GetInfo(fx.Room.Code, a);
        var (info, error) = fx.Spectators.GetInfo(fx.Room.Code, fx.HostId);

        forOther.info.Should().BeNull();
        forOther.error.Should().Be("Only the host can see spectator settings.");
        error.Should().BeNull();
        info!.Enabled.Should().BeTrue();
        info.WatchCode.Should().Be(code);
        info.Spectators.Should().ContainSingle().Which.Name.Should().Be("Tablet");
    }

    [Fact]
    public void GetInfo_WhenOff_HasNoWatchCode()
    {
        var fx = new Fixture();

        var (info, _) = fx.Spectators.GetInfo(fx.Room.Code, fx.HostId);

        info!.Enabled.Should().BeFalse();
        info.WatchCode.Should().BeNull();
    }

    [Fact]
    public void WatchCode_IsStableReadableAndDependsOnTheServerSecret()
    {
        var fx = new Fixture();
        var code = fx.Enable();

        code.Should().MatchRegex("^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$");
        fx.Spectators.GetWatchCode(fx.Room).Should().Be(code);
        code.Should().NotContain(fx.Room.Code);

        // Same room data under another secret gives another code, so it cannot be computed by a client.
        var otherConfig = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Jwt:Secret"] = Secret + "x" })
            .Build();
        var other = new SpectatorService(fx.Rooms, null!, otherConfig);
        other.GetWatchCode(fx.Room).Should().NotBe(code);
    }

    [Fact]
    public void WatchCode_IsNotInTheGameStateSentToPlayers()
    {
        var fx = new Fixture();
        var code = fx.Enable();

        var json = System.Text.Json.JsonSerializer.Serialize(GameStateCommon.SnapshotState(fx.Room.State));

        json.Should().NotContain(code);
        json.Should().Contain("SpectatorsEnabled");
    }

    [Fact]
    public void Snapshot_KeepsSpectatorSettings()
    {
        var state = new GameState { SpectatorsEnabled = true, SpectatorEpoch = 3 };

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.SpectatorsEnabled.Should().BeTrue();
        snapshot.SpectatorEpoch.Should().Be(3);
    }
}
