using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class AbilityServiceTests
{
    [Fact]
    public void ActivateBeacon_WhenBeaconModeEnabled_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Beacon)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var player = context.Player("p1");

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        player.IsBeacon.Should().BeTrue();
        player.BeaconLat.Should().Be(player.CurrentLat);
        player.BeaconLng.Should().Be(player.CurrentLng);
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "BeaconActivated" && entry.PlayerId == "p1");
    }

    [Fact]
    public void ActivateBeacon_WhenBeaconModeIsDisabled_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("Beacon mode is not active.");
        context.Player("p1").IsBeacon.Should().BeFalse();
    }

    [Fact]
    public void ActivateBeacon_WithoutPlayerLocation_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Beacon)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("Your location is required to activate a beacon.");
    }

    [Fact]
    public void DeactivateBeacon_RemovesBeaconState()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        state.Players.Single(player => player.Id == "p1").IsBeacon = true;
        state.Players.Single(player => player.Id == "p1").BeaconLat = state.Players.Single(player => player.Id == "p1").CurrentLat;
        state.Players.Single(player => player.Id == "p1").BeaconLng = state.Players.Single(player => player.Id == "p1").CurrentLng;
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.DeactivateBeacon(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Player("p1").IsBeacon.Should().BeFalse();
        context.Player("p1").BeaconLat.Should().BeNull();
        context.Player("p1").BeaconLng.Should().BeNull();
    }

    [Fact]
    public void DeactivateBeacon_WhenPlayerIsMissing_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.DeactivateBeacon(ServiceTestContext.RoomCode, "missing");

        result.state.Should().BeNull();
        result.error.Should().Be("Player not in room.");
    }

    [Fact]
    public void ActivateStealth_WhenModeEnabled_SucceedsAndSnapshotHidesLocation()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Stealth)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateStealth(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Player("p1").StealthUntil.Should().NotBeNull();
        context.Player("p1").StealthCooldownUntil.Should().NotBeNull();
        context.Player("p1").CurrentLat.Should().NotBeNull();
        result.state!.Players.Single(player => player.Id == "p1").CurrentLat.Should().BeNull();
        context.Player("p1").StealthUntil.Should().BeCloseTo(beforeActivation.AddMinutes(3), TimeSpan.FromSeconds(10));
        context.Player("p1").StealthCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(8), TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void ActivateStealth_WhenModeIsDisabled_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateStealth(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("Stealth mode is not active.");
    }

    [Fact]
    public void ActivateStealth_WhenOnCooldown_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Stealth)
            .AddPlayer("p1", "Alice")
            .Build();
        state.Players.Single(player => player.Id == "p1").StealthCooldownUntil = DateTime.UtcNow.AddMinutes(1);
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateStealth(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("Stealth is on cooldown.");
    }

    [Fact]
    public void ActivateStealth_WhenAlreadyStealthed_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Stealth)
            .AddPlayer("p1", "Alice")
            .Build();
        state.Players.Single(player => player.Id == "p1").StealthUntil = DateTime.UtcNow.AddMinutes(1);
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateStealth(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("Already stealthed.");
    }

    [Fact]
    public void ActivateCommandoRaid_OnValidTargetHex_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithCopresenceModes(CopresenceMode.CommandoRaid)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.error.Should().BeNull();
        context.Player("p1").IsCommandoActive.Should().BeTrue();
        context.Player("p1").CommandoTargetQ.Should().Be(2);
        context.Player("p1").CommandoTargetR.Should().Be(0);
        context.Player("p1").CommandoDeadline.Should().BeCloseTo(beforeActivation.AddMinutes(5), TimeSpan.FromSeconds(10));
        context.Player("p1").CommandoCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(15), TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void ActivateCommandoRaid_WhenModeDisabled_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.state.Should().BeNull();
        result.error.Should().Be("CommandoRaid mode is not active.");
    }

    [Fact]
    public void ActivateCommandoRaid_WhenTargetIsOutOfRange_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithCopresenceModes(CopresenceMode.CommandoRaid)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 4, 0);

        result.state.Should().BeNull();
        result.error.Should().Be("Target hex must be within 3 hex distance.");
        context.Player("p1").IsCommandoActive.Should().BeFalse();
    }

    [Fact]
    public void ActivateCommandoRaid_WhenAlreadyActive_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithCopresenceModes(CopresenceMode.CommandoRaid)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        state.Players.Single(player => player.Id == "p1").IsCommandoActive = true;
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.state.Should().BeNull();
        result.error.Should().Be("You already have an active commando raid.");
    }
}
