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


    [Fact]
    public void ActivateBeacon_WhenAnotherPlayerAlreadyHasBeacon_BeaconsCanCoexist()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithCopresenceModes(CopresenceMode.Beacon)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 1, 0)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var firstResult = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p2");
        var secondResult = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1");

        firstResult.error.Should().BeNull();
        secondResult.error.Should().BeNull();
        context.Player("p1").IsBeacon.Should().BeTrue();
        context.Player("p2").IsBeacon.Should().BeTrue();
        context.Player("p1").BeaconLat.Should().Be(context.Player("p1").CurrentLat);
        context.Player("p2").BeaconLat.Should().Be(context.Player("p2").CurrentLat);
        context.State.EventLog.Should().Contain(entry => entry.Type == "BeaconActivated" && entry.PlayerId == "p1");
        context.State.EventLog.Should().Contain(entry => entry.Type == "BeaconActivated" && entry.PlayerId == "p2");
    }

    [Fact]
    public void ActivateBeacon_WhenTeammateClaimsWithinTwoHexesOfBeacon_ExtendsAdjacencyRange()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithClaimMode(ClaimMode.AdjacencyRequired)
            .WithCopresenceModes(CopresenceMode.Beacon)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 2, 0)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (claimLat, claimLng) = ServiceTestContext.HexCenter(2, 0);

        var beaconResult = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p2");
        var placeResult = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 2, 0, claimLat, claimLng);

        beaconResult.error.Should().BeNull();
        placeResult.error.Should().BeNull();
        context.Cell(2, 0).OwnerId.Should().Be("p1");
        context.Cell(2, 0).Troops.Should().Be(1);
    }

    [Fact]
    public void ActivateCommandoRaid_WhenTargetIsExactlyThreeHexesAway_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithCopresenceModes(CopresenceMode.CommandoRaid)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 3, 0);

        result.error.Should().BeNull();
        context.Player("p1").IsCommandoActive.Should().BeTrue();
        context.Player("p1").CommandoTargetQ.Should().Be(3);
        context.Player("p1").CommandoTargetR.Should().Be(0);
    }

    [Fact]
    public void ActivateCommandoRaid_WhenTargetHexIsEnemyOwned_StillSucceedsBecauseOwnershipIsNotValidated()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithCopresenceModes(CopresenceMode.CommandoRaid)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .WithPlayerPosition("p1", 0, 0)
            .OwnHex(2, 0, "p2", troops: 3)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.error.Should().BeNull();
        context.Player("p1").IsCommandoActive.Should().BeTrue();
        context.Cell(2, 0).OwnerId.Should().Be("p2");
        context.Cell(2, 0).Troops.Should().Be(3);
    }

    [Fact]
    public void ActivateCommandoRaid_WhenPlayerReachesNeutralTargetHex_SetsTargetTroopsFromCarriedTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithCopresenceModes(CopresenceMode.CommandoRaid)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .WithCarriedTroops("p1", 4, 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (targetLat, targetLng) = ServiceTestContext.HexCenter(2, 0);

        var activationResult = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);
        var moveResult = context.GameplayService.UpdatePlayerLocation(ServiceTestContext.RoomCode, "p1", targetLat, targetLng);

        activationResult.error.Should().BeNull();
        moveResult.error.Should().BeNull();
        context.Cell(2, 0).OwnerId.Should().Be("p1");
        context.Cell(2, 0).Troops.Should().Be(4);
        context.Player("p1").CarriedTroops.Should().Be(0);
        context.Player("p1").IsCommandoActive.Should().BeFalse();
        context.State.EventLog.Should().Contain(entry => entry.Type == "CommandoRaidSuccess" && entry.PlayerId == "p1");
    }

    [Fact]
    public void DeactivateBeacon_WhenPlayerDoesNotHaveBeacon_SucceedsWithoutChanges()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.DeactivateBeacon(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Player("p1").IsBeacon.Should().BeFalse();
        context.Player("p1").BeaconLat.Should().BeNull();
        context.Player("p1").BeaconLng.Should().BeNull();
    }

}
