using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class HostControlServiceTests
{
    [Fact]
    public void SetHostObserverMode_HostEnablesObserverMode_Succeeds()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SetHostObserverMode(ServiceTestContext.RoomCode, hostId, enabled: true);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state.Should().NotBeSameAs(context.State);
        context.State.HostObserverMode.Should().BeTrue();
        result.state!.HostObserverMode.Should().BeTrue();
        var entry = context.State.EventLog.Should().ContainSingle().Which;
        entry.Type.Should().Be("HostObserverModeEnabled");
        entry.Message.Should().BeEmpty();
    }

    [Fact]
    public void SetHostObserverMode_WhenRequesterIsNotHost_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var nonHostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(nonHostId, "Guest")
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SetHostObserverMode(ServiceTestContext.RoomCode, nonHostId, enabled: true);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can toggle observer mode.");
        context.State.HostObserverMode.Should().BeFalse();
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void SetHostObserverMode_WhenGameIsNotPlaying_StillSucceeds()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SetHostObserverMode(ServiceTestContext.RoomCode, hostId, enabled: true);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.HostObserverMode.Should().BeTrue();
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "HostObserverModeEnabled");
    }

    [Fact]
    public void UpdateGameDynamicsLive_UpdatesFlags()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);
        var dynamics = new GameDynamics
        {
            PlayerRolesEnabled = true,
            HQEnabled = true,
            HQAutoAssign = true
        };

        var result = service.UpdateGameDynamicsLive(ServiceTestContext.RoomCode, hostId, dynamics);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.Dynamics.PlayerRolesEnabled.Should().BeTrue();
        context.State.Dynamics.HQEnabled.Should().BeTrue();
        context.State.Dynamics.HQAutoAssign.Should().BeTrue();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "HostDynamicsUpdated");
    }

    [Fact]
    public void UpdateGameDynamicsLive_WhenRequesterIsNotHost_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var nonHostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(nonHostId, "Guest")
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.UpdateGameDynamicsLive(ServiceTestContext.RoomCode, nonHostId, new GameDynamics());

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can change game dynamics.");
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void UpdateGameDynamicsLive_WhenGameIsNotPlaying_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.UpdateGameDynamicsLive(ServiceTestContext.RoomCode, hostId, new GameDynamics());

        result.state.Should().BeNull();
        result.error.Should().Be("Live dynamics changes require an active game.");
        context.State.EventLog.Should().BeEmpty();
    }


    [Fact]
    public void SendHostMessage_ToAllPlayers_AppendsBroadcastMessage()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SendHostMessage(ServiceTestContext.RoomCode, hostId, "Hold the line.", null);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "HostMessage" &&
            entry.Message == "[Host → all players] Hold the line.");
    }

    [Fact]
    public void SendHostMessage_ToTargetAlliances_UsesAllianceNamesInMessage()
    {
        var hostId = Guid.NewGuid().ToString();
        var enemyId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .AddPlayer(enemyId, "Enemy", "a2")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Bravo", enemyId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SendHostMessage(ServiceTestContext.RoomCode, hostId, "Bravo advance now.", ["a2"]);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "HostMessage" &&
            entry.Message == "[Host → Bravo] Bravo advance now.");
    }

    [Fact]
    public void SendHostMessage_WhenMessageIsWhitespace_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SendHostMessage(ServiceTestContext.RoomCode, hostId, "   ", null);

        result.state.Should().BeNull();
        result.error.Should().Be("Message must be between 1 and 500 characters.");
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void SendHostMessage_WhenMessageIsTooLong_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SendHostMessage(ServiceTestContext.RoomCode, hostId, new string('x', 501), null);

        result.state.Should().BeNull();
        result.error.Should().Be("Message must be between 1 and 500 characters.");
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void SendHostMessage_WhenRequesterIsNotHost_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var nonHostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(nonHostId, "Guest")
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SendHostMessage(ServiceTestContext.RoomCode, nonHostId, "Test", null);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can send messages.");
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void SendHostMessage_WhenGameIsNotPlaying_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.SendHostMessage(ServiceTestContext.RoomCode, hostId, "Test", null);

        result.state.Should().BeNull();
        result.error.Should().Be("Messages can only be sent during gameplay.");
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void PauseGame_HostPausesGame_Succeeds()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.PauseGame(ServiceTestContext.RoomCode, hostId, paused: true);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.IsPaused.Should().BeTrue();
        result.state!.IsPaused.Should().BeTrue();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "GamePaused");
    }

    [Fact]
    public void PauseGame_HostResumesGame_Succeeds()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPaused()
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.PauseGame(ServiceTestContext.RoomCode, hostId, paused: false);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.IsPaused.Should().BeFalse();
        result.state!.IsPaused.Should().BeFalse();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "GameResumed");
    }

    [Fact]
    public void PauseGame_WhenRequesterIsNotHost_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var nonHostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(nonHostId, "Guest")
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.PauseGame(ServiceTestContext.RoomCode, nonHostId, paused: true);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can pause or resume the game.");
        context.State.IsPaused.Should().BeFalse();
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void PauseGame_WhenGameIsNotPlaying_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.GameOver)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.PauseGame(ServiceTestContext.RoomCode, hostId, paused: true);

        result.state.Should().BeNull();
        result.error.Should().Be("Can only pause or resume during gameplay.");
        context.State.IsPaused.Should().BeFalse();
        context.State.EventLog.Should().BeEmpty();
    }

    private static (ServiceTestContext context, HostControlService service) CreateService(GameState state, string hostId)
    {
        var context = new ServiceTestContext(state);
        context.Room.HostUserId = Guid.Parse(hostId);
        var service = new HostControlService(
            context.RoomProvider.Object,
            context.GameStateService);
        return (context, service);
    }
}
