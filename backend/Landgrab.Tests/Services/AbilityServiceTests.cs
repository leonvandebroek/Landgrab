using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class AbilityServiceTests
{
    [Fact]
    public void ActivateBeacon_WhenBeaconIsEnabled_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithBeaconEnabled()
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
    public void ActivateBeacon_WhenBeaconIsDisabled_Fails()
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
            .WithBeaconEnabled()
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
    public void ActivateCommandoRaid_ByNonCommander_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Scout)
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 3)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 1, 0);

        result.error.Should().Contain("Commander");
        result.state.Should().BeNull();
    }

    [Fact]
    public void ActivateCommandoRaid_ByCommander_CreatesActiveRaid_BothTeamsSeeIt()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .WithTroops(0, 0, 3)
            .WithClaimMode(ClaimMode.PresenceOnly)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state!.ActiveRaids.Should().HaveCount(1);
        result.state.ActiveRaids[0].TargetQ.Should().Be(2);
        result.state.ActiveRaids[0].InitiatorAllianceId.Should().Be("a1");
        result.state.ActiveRaids[0].Deadline.Should().BeCloseTo(beforeActivation.AddMinutes(5), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void ActivateCommandoRaid_WhenPlayerRolesAreDisabled_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", role: PlayerRole.Commander)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.state.Should().BeNull();
        result.error.Should().NotBeNull();
    }


    [Fact]
    public void ActivateBeacon_WhenAnotherPlayerAlreadyHasBeacon_BeaconsCanCoexist()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithBeaconEnabled()
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
    public void ActivateBeacon_ByNonScout_WhenPlayerRolesEnabled_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Commander)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1");

        result.error.Should().Contain("Scout");
        result.state.Should().BeNull();
    }

    [Fact]
    public void ActivateBeacon_WhenTeammateClaimsWithinTwoHexesOfBeacon_ExtendsAdjacencyRange()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithClaimMode(ClaimMode.AdjacencyRequired)
            .WithBeaconEnabled()
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
        context.Cell(2, 0).Troops.Should().Be(0);
    }

    [Fact]
    public void ActivateCommandoRaid_WhenAllianceAlreadyHasActiveRaid_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .Build();
        state.ActiveRaids.Add(new ActiveCommandoRaid
        {
            TargetQ = 1, TargetR = 0,
            InitiatorAllianceId = "a1",
            InitiatorPlayerId = "p1",
            Deadline = DateTime.UtcNow.AddMinutes(3)
        });
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.state.Should().BeNull();
        result.error.Should().Contain("active commando raid");
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

    [Fact]
    public void ActivateTacticalStrike_WhenCommanderUsesAbility_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .WithPlayerRole("p1", PlayerRole.Commander)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateTacticalStrike(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Player("p1").TacticalStrikeActive.Should().BeTrue();
        context.Player("p1").TacticalStrikeExpiry.Should().BeCloseTo(beforeActivation.AddMinutes(5), TimeSpan.FromSeconds(10));
        context.Player("p1").TacticalStrikeCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(20), TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void ActivateReinforce_OnFriendlyHex_AddsTroopsAndStartsCooldown()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddAlliance("a1", "Alpha", "p1")
            .WithPlayerRole("p1", PlayerRole.Commander)
            .OwnHex(0, 0, "p1", "a1", troops: 2)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateReinforce(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").ReinforceCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(15), TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void ActivateEmergencyRepair_OnFriendlyHex_AddsTroopsAndStartsCooldown()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddAlliance("a1", "Alpha", "p1")
            .WithPlayerRole("p1", PlayerRole.Engineer)
            .OwnHex(0, 0, "p1", "a1", troops: 1)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateEmergencyRepair(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(4);
        context.Player("p1").EmergencyRepairCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(15), TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void ActivateShieldWall_AlwaysReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);

        var (result, error) = context.AbilityService.ActivateShieldWall(ServiceTestContext.RoomCode, "p1");

        error.Should().NotBeNull();
        result.Should().BeNull();
    }

    [Fact]
    public void StartDemolish_OnEnemyFort_StartsChannelAndCooldown()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerRole("p1", PlayerRole.Engineer)
            .OwnHex(1, 0, "p2", "a2", troops: 4)
            .WithPlayerPosition("p1", 1, 0)
            .Build();
        state.Grid[HexService.Key(1, 0)].IsFort = true;
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.StartDemolish(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Player("p1").DemolishActive.Should().BeTrue();
        context.Player("p1").DemolishTargetKey.Should().Be(HexService.Key(1, 0));
        context.Player("p1").DemolishStartedAt.Should().BeCloseTo(beforeActivation, TimeSpan.FromSeconds(10));
        context.Player("p1").DemolishCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(30), TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void GetVisibleHexKeys_WithActiveBeacon_RevealsSurroundingHexesForAllianceMembers()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(10)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Scout)
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddPlayer("p3", "Enemy", allianceId: "a2")
            .OwnHex(5, 0, "p2", allianceId: "a1") // p2 owns hex far from beacon area
            .OwnHex(0, 0, "p3", allianceId: "a2") // enemy hex at beacon location
            .WithTroops(0, 0, 7) // enemy troops visible only if beacon reveals it
            .Build();
        state.Dynamics.FogOfWarEnabled = true;
        state.Dynamics.BeaconEnabled = true;
        var (beaconLat, beaconLng) = ServiceTestContext.HexCenter(0, 0);
        state.Players.First(p => p.Id == "p1").IsBeacon = true;
        state.Players.First(p => p.Id == "p1").BeaconLat = beaconLat;
        state.Players.First(p => p.Id == "p1").BeaconLng = beaconLng;
        var context = new ServiceTestContext(state);

        var snapshot = context.GameStateService.GetPlayerSnapshot(state, "p2");

        // (0,0) should be visible because scout p1 has beacon there — enemy troops exposed
        snapshot.Grid[HexService.Key(0, 0)].Troops.Should().Be(7);
    }

}
