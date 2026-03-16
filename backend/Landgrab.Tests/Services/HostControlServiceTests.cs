using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;
using Microsoft.Extensions.Logging.Abstractions;

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
        entry.Type.Should().Be("HostAction");
        entry.Message.Should().Be("Host entered observer mode.");
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
        context.State.EventLog.Should().ContainSingle(entry => entry.Message == "Host entered observer mode.");
    }

    [Fact]
    public void UpdateGameDynamicsLive_WithCustomPreset_UpdatesFlagsAndFiltersNoneMode()
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
            TerrainEnabled = true,
            PlayerRolesEnabled = true,
            FogOfWarEnabled = true,
            SupplyLinesEnabled = true,
            HQEnabled = true,
            TimedEscalationEnabled = true,
            UnderdogPactEnabled = true,
            NeutralNPCEnabled = true,
            RandomEventsEnabled = true,
            MissionSystemEnabled = true,
            CopresencePreset = "Aangepast",
            ActiveCopresenceModes = [CopresenceMode.None, CopresenceMode.Ambush, CopresenceMode.Duel]
        };

        var result = service.UpdateGameDynamicsLive(ServiceTestContext.RoomCode, hostId, dynamics);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.Dynamics.TerrainEnabled.Should().BeTrue();
        context.State.Dynamics.PlayerRolesEnabled.Should().BeTrue();
        context.State.Dynamics.FogOfWarEnabled.Should().BeTrue();
        context.State.Dynamics.SupplyLinesEnabled.Should().BeTrue();
        context.State.Dynamics.HQEnabled.Should().BeTrue();
        context.State.Dynamics.TimedEscalationEnabled.Should().BeTrue();
        context.State.Dynamics.UnderdogPactEnabled.Should().BeTrue();
        context.State.Dynamics.NeutralNPCEnabled.Should().BeTrue();
        context.State.Dynamics.RandomEventsEnabled.Should().BeTrue();
        context.State.Dynamics.MissionSystemEnabled.Should().BeTrue();
        context.State.Dynamics.CopresencePreset.Should().Be("Aangepast");
        context.State.Dynamics.ActiveCopresenceModes.Should().Equal(CopresenceMode.Ambush, CopresenceMode.Duel);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "HostAction" &&
            entry.Message == "Host updated game dynamics.");
    }

    [Fact]
    public void UpdateGameDynamicsLive_WithNamedPreset_UsesServerPresetModes()
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
            CopresencePreset = "Chaos",
            ActiveCopresenceModes = [CopresenceMode.Relay]
        };

        var result = service.UpdateGameDynamicsLive(ServiceTestContext.RoomCode, hostId, dynamics);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.Dynamics.CopresencePreset.Should().Be("Chaos");
        context.State.Dynamics.ActiveCopresenceModes.Should().Equal(
            CopresenceMode.JagerProoi,
            CopresenceMode.Duel,
            CopresenceMode.PresenceBonus);
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
    public void UpdateGameDynamicsLive_WithUnknownNamedPreset_Fails()
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
            CopresencePreset = "UnknownPreset"
        };

        var result = service.UpdateGameDynamicsLive(ServiceTestContext.RoomCode, hostId, dynamics);

        result.state.Should().BeNull();
        result.error.Should().Be("Unknown copresence preset: UnknownPreset");
        context.State.Dynamics.CopresencePreset.Should().BeNull();
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void TriggerGameEvent_CalamityWithExplicitTarget_RemovesAllTroopsFromHex()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .OwnHex(0, 0, hostId)
            .WithTroops(0, 0, 5)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.TriggerGameEvent(ServiceTestContext.RoomCode, hostId, "Calamity", 0, 0, null);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(0, 0).Troops.Should().Be(0);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "RandomEvent" &&
            entry.Message == "Calamity! Hex (0, 0) lost all troops." &&
            entry.Q == 0 &&
            entry.R == 0);
    }

    [Fact]
    public void TriggerGameEvent_EpidemicWithTargetAlliance_ReducesTroopsAndLogsAlliance()
    {
        var hostId = Guid.NewGuid().ToString();
        var allyId = Guid.NewGuid().ToString();
        var enemyId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Host", allyId)
            .WithPlayerAsHost(hostId)
            .AddPlayer(enemyId, "Enemy", "a2")
            .AddAlliance(allyId, "Alpha", hostId)
            .AddAlliance("a2", "Bravo", enemyId)
            .OwnHex(1, 0, enemyId, "a2")
            .WithTroops(1, 0, 4)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.TriggerGameEvent(ServiceTestContext.RoomCode, hostId, "Epidemic", null, null, "a2");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(1, 0).Troops.Should().Be(2);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "RandomEvent" &&
            entry.Message == "Epidemic! Bravo lost 2 troops at (1, 0)." &&
            entry.AllianceId == "a2" &&
            entry.AllianceName == "Bravo" &&
            entry.Q == 1 &&
            entry.R == 0);
    }

    [Fact]
    public void TriggerGameEvent_BonusTroopsWithoutTargetAlliance_AddsTroopsToEveryAlliance()
    {
        var hostId = Guid.NewGuid().ToString();
        var allyId = Guid.NewGuid().ToString();
        var enemyId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Host", allyId)
            .WithPlayerAsHost(hostId)
            .AddPlayer(enemyId, "Enemy", "a2")
            .AddAlliance(allyId, "Alpha", hostId)
            .AddAlliance("a2", "Bravo", enemyId)
            .OwnHex(0, 0, hostId, allyId)
            .WithTroops(0, 0, 1)
            .OwnHex(1, 0, enemyId, "a2")
            .WithTroops(1, 0, 3)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.TriggerGameEvent(ServiceTestContext.RoomCode, hostId, "BonusTroops", null, null, null);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(0, 0).Troops.Should().Be(3);
        context.Cell(1, 0).Troops.Should().Be(5);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "RandomEvent" &&
            entry.Message == "Bonus Troops! Every team received +2 troops.");
    }

    [Fact]
    public void TriggerGameEvent_RushHour_SetsRushHourFlag()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.TriggerGameEvent(ServiceTestContext.RoomCode, hostId, "RushHour", null, null, null);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.IsRushHour.Should().BeTrue();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "RandomEvent" &&
            entry.Message == "Rush Hour! Claimed hexes count double for 5 minutes.");
    }

    [Fact]
    public void TriggerGameEvent_WhenRequesterIsNotHost_Fails()
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

        var result = service.TriggerGameEvent(ServiceTestContext.RoomCode, nonHostId, "RushHour", null, null, null);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can trigger events.");
        context.State.IsRushHour.Should().BeFalse();
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void TriggerGameEvent_WhenGameIsNotPlaying_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.TriggerGameEvent(ServiceTestContext.RoomCode, hostId, "RushHour", null, null, null);

        result.state.Should().BeNull();
        result.error.Should().Be("Events can only be triggered during gameplay.");
        context.State.IsRushHour.Should().BeFalse();
    }

    [Fact]
    public void TriggerGameEvent_WithUnknownEventType_Fails()
    {
        var hostId = Guid.NewGuid().ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var (context, service) = CreateService(state, hostId);

        var result = service.TriggerGameEvent(ServiceTestContext.RoomCode, hostId, "Unknown", null, null, null);

        result.state.Should().BeNull();
        result.error.Should().Be("Unknown event type: Unknown");
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
            entry.Type == "HostAction" &&
            entry.Message == "Host paused the game.");
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
            entry.Type == "HostAction" &&
            entry.Message == "Host resumed the game.");
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
            context.GameStateService,
            NullLogger<HostControlService>.Instance);
        return (context, service);
    }
}
