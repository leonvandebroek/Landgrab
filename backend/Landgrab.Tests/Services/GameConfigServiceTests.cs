using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class GameConfigServiceTests
{
    private static readonly Guid HostGuid = Guid.Parse("00000000-0000-0000-0000-000000000001");
    private static readonly string HostUserId = HostGuid.ToString();
    private static readonly string GuestUserId = Guid.Parse("00000000-0000-0000-0000-000000000002").ToString();

    [Theory]
    [InlineData("PresenceOnly", ClaimMode.PresenceOnly)]
    [InlineData("presencewithtroop", ClaimMode.PresenceWithTroop)]
    [InlineData("AdjacencyRequired", ClaimMode.AdjacencyRequired)]
    public void SetClaimMode_ValidMode_UpdatesStateAndReturnsSnapshot(string claimMode, ClaimMode expectedMode)
    {
        var (context, sut) = CreateContext();

        var result = sut.SetClaimMode(ServiceTestContext.RoomCode, HostUserId, claimMode);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state.Should().NotBeSameAs(context.State);
        result.state!.ClaimMode.Should().Be(expectedMode);
        context.State.ClaimMode.Should().Be(expectedMode);
    }

    [Fact]
    public void SetClaimMode_InvalidMode_ReturnsError()
    {
        var (context, sut) = CreateContext(builder => builder.WithClaimMode(ClaimMode.AdjacencyRequired));

        var result = sut.SetClaimMode(ServiceTestContext.RoomCode, HostUserId, "invalid-mode");

        result.state.Should().BeNull();
        result.error.Should().Be("Invalid claim mode.");
        context.State.ClaimMode.Should().Be(ClaimMode.AdjacencyRequired);
    }

    [Fact]
    public void SetClaimMode_NonHost_ReturnsError()
    {
        var (context, sut) = CreateContext(builder => builder.WithClaimMode(ClaimMode.AdjacencyRequired));

        var result = sut.SetClaimMode(ServiceTestContext.RoomCode, GuestUserId, "PresenceOnly");

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can change claim mode.");
        context.State.ClaimMode.Should().Be(ClaimMode.AdjacencyRequired);
    }

    [Fact]
    public void SetClaimMode_WhenNotInLobby_ReturnsError()
    {
        var (context, sut) = CreateContext(phase: GamePhase.Playing, configure: builder => builder.WithClaimMode(ClaimMode.AdjacencyRequired));

        var result = sut.SetClaimMode(ServiceTestContext.RoomCode, HostUserId, "PresenceOnly");

        result.state.Should().BeNull();
        result.error.Should().Be("Claim mode can only be changed in the lobby.");
        context.State.ClaimMode.Should().Be(ClaimMode.AdjacencyRequired);
    }

    [Fact]
    public void SetWinCondition_TerritoryPercent_ValidThreshold_UpdatesState()
    {
        var (context, sut) = CreateContext();

        var result = sut.SetWinCondition(ServiceTestContext.RoomCode, HostUserId, "TerritoryPercent", 75);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state!.WinConditionType.Should().Be(WinConditionType.TerritoryPercent);
        result.state.WinConditionValue.Should().Be(75);
        result.state.GameDurationMinutes.Should().BeNull();
        context.State.WinConditionType.Should().Be(WinConditionType.TerritoryPercent);
        context.State.WinConditionValue.Should().Be(75);
        context.State.GameDurationMinutes.Should().BeNull();
    }

    [Fact]
    public void SetWinCondition_Elimination_SetsValueToOneAndClearsDuration()
    {
        var (context, sut) = CreateContext();
        context.State.GameDurationMinutes = 45;

        var result = sut.SetWinCondition(ServiceTestContext.RoomCode, HostUserId, "Elimination", 999);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state!.WinConditionType.Should().Be(WinConditionType.Elimination);
        result.state.WinConditionValue.Should().Be(1);
        result.state.GameDurationMinutes.Should().BeNull();
        context.State.WinConditionType.Should().Be(WinConditionType.Elimination);
        context.State.WinConditionValue.Should().Be(1);
        context.State.GameDurationMinutes.Should().BeNull();
    }

    [Fact]
    public void SetWinCondition_TimedGame_ValidDuration_UpdatesState()
    {
        var (context, sut) = CreateContext();

        var result = sut.SetWinCondition(ServiceTestContext.RoomCode, HostUserId, "TimedGame", 30);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state!.WinConditionType.Should().Be(WinConditionType.TimedGame);
        result.state.WinConditionValue.Should().Be(30);
        result.state.GameDurationMinutes.Should().Be(30);
        context.State.WinConditionType.Should().Be(WinConditionType.TimedGame);
        context.State.WinConditionValue.Should().Be(30);
        context.State.GameDurationMinutes.Should().Be(30);
    }

    [Theory]
    [InlineData("TerritoryPercent", 0, "Territory percent must be between 1 and 100.")]
    [InlineData("TerritoryPercent", 101, "Territory percent must be between 1 and 100.")]
    [InlineData("TimedGame", 0, "Timed games must last at least 1 minute.")]
    public void SetWinCondition_InvalidValue_ReturnsError(string winConditionType, int value, string expectedError)
    {
        var (context, sut) = CreateContext();

        var result = sut.SetWinCondition(ServiceTestContext.RoomCode, HostUserId, winConditionType, value);

        result.state.Should().BeNull();
        result.error.Should().Be(expectedError);
        context.State.WinConditionType.Should().Be(WinConditionType.TerritoryPercent);
        context.State.WinConditionValue.Should().Be(100);
    }

    [Fact]
    public void SetWinCondition_InvalidType_ReturnsError()
    {
        var (context, sut) = CreateContext();

        var result = sut.SetWinCondition(ServiceTestContext.RoomCode, HostUserId, "UnknownCondition", 50);

        result.state.Should().BeNull();
        result.error.Should().Be("Invalid win condition.");
        context.State.WinConditionType.Should().Be(WinConditionType.TerritoryPercent);
        context.State.WinConditionValue.Should().Be(100);
    }

    [Fact]
    public void SetWinCondition_NonHost_ReturnsError()
    {
        var (context, sut) = CreateContext();

        var result = sut.SetWinCondition(ServiceTestContext.RoomCode, GuestUserId, "Elimination", 1);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can change the win condition.");
        context.State.WinConditionType.Should().Be(WinConditionType.TerritoryPercent);
        context.State.WinConditionValue.Should().Be(100);
    }

    [Fact]
    public void SetWinCondition_WhenNotInLobby_ReturnsError()
    {
        var (context, sut) = CreateContext(phase: GamePhase.Playing);

        var result = sut.SetWinCondition(ServiceTestContext.RoomCode, HostUserId, "Elimination", 1);

        result.state.Should().BeNull();
        result.error.Should().Be("Win condition can only be changed in the lobby.");
        context.State.WinConditionType.Should().Be(WinConditionType.TerritoryPercent);
        context.State.WinConditionValue.Should().Be(100);
    }

    [Fact]
    public void SetGameDynamics_FullDynamicsObject_AppliesAllFlags()
    {
        var (context, sut) = CreateContext();

        var dynamics = new GameDynamics
        {
            TerrainEnabled = true,
            PlayerRolesEnabled = false,
            FogOfWarEnabled = true,
            HQEnabled = true,
            HQAutoAssign = true,
            TimedEscalationEnabled = false,
            UnderdogPactEnabled = true
        };

        var result = sut.SetGameDynamics(ServiceTestContext.RoomCode, HostUserId, dynamics);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state!.Dynamics.TerrainEnabled.Should().BeTrue();
        result.state.Dynamics.PlayerRolesEnabled.Should().BeFalse();
        result.state.Dynamics.FogOfWarEnabled.Should().BeTrue();
        result.state.Dynamics.HQEnabled.Should().BeTrue();
        result.state.Dynamics.HQAutoAssign.Should().BeTrue();
        result.state.Dynamics.TimedEscalationEnabled.Should().BeFalse();
        result.state.Dynamics.UnderdogPactEnabled.Should().BeTrue();
        context.State.Dynamics.TerrainEnabled.Should().BeTrue();
        context.State.Dynamics.PlayerRolesEnabled.Should().BeFalse();
        context.State.Dynamics.FogOfWarEnabled.Should().BeTrue();
        context.State.Dynamics.HQEnabled.Should().BeTrue();
        context.State.Dynamics.HQAutoAssign.Should().BeTrue();
        context.State.Dynamics.TimedEscalationEnabled.Should().BeFalse();
        context.State.Dynamics.UnderdogPactEnabled.Should().BeTrue();
    }

    [Fact]
    public void SetGameDynamics_NonHost_ReturnsError()
    {
        var (context, sut) = CreateContext();

        var result = sut.SetGameDynamics(ServiceTestContext.RoomCode, GuestUserId, new GameDynamics
        {
            TerrainEnabled = true,
            PlayerRolesEnabled = true,
            FogOfWarEnabled = true,
            HQEnabled = true,
            TimedEscalationEnabled = true,
            UnderdogPactEnabled = true
        });

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can change game dynamics.");
        context.State.Dynamics.TerrainEnabled.Should().BeFalse();
        context.State.Dynamics.PlayerRolesEnabled.Should().BeFalse();
        context.State.Dynamics.FogOfWarEnabled.Should().BeFalse();
        context.State.Dynamics.HQEnabled.Should().BeFalse();
        context.State.Dynamics.TimedEscalationEnabled.Should().BeFalse();
        context.State.Dynamics.UnderdogPactEnabled.Should().BeFalse();
    }

    [Fact]
    public void SetGameDynamics_WhenNotInLobby_ReturnsError()
    {
        var (context, sut) = CreateContext(phase: GamePhase.Playing);

        var result = sut.SetGameDynamics(ServiceTestContext.RoomCode, HostUserId, new GameDynamics
        {
            TerrainEnabled = true
        });

        result.state.Should().BeNull();
        result.error.Should().Be("Game dynamics can only be changed in the lobby.");
        context.State.Dynamics.TerrainEnabled.Should().BeFalse();
    }

    private static (ServiceTestContext context, GameConfigService sut) CreateContext(
        Action<GameStateBuilder>? configure = null,
        GamePhase phase = GamePhase.Lobby)
    {
        var builder = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(phase)
            .AddPlayer(HostUserId, "Host")
            .AddPlayer(GuestUserId, "Guest")
            .WithPlayerAsHost(HostUserId);

        configure?.Invoke(builder);

        var context = new ServiceTestContext(builder.Build());
        context.Room.HostUserId = HostGuid;

        var sut = new GameConfigService(context.RoomProvider.Object, context.GameStateService);
        return (context, sut);
    }
}
