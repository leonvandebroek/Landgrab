using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class AbilityServiceTests
{
    private const double EastHeading = 90d;

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

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1", EastHeading);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        player.IsBeacon.Should().BeTrue();
        player.BeaconLat.Should().Be(player.CurrentLat);
        player.BeaconLng.Should().Be(player.CurrentLng);
        player.BeaconHeading.Should().Be(EastHeading);
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

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1", EastHeading);

        result.state.Should().BeNull();
        result.error.Should().Be("Beacon mode is not active.");
        context.Player("p1").IsBeacon.Should().BeFalse();
    }

    [Fact]
    public void ActivateBeacon_WithScoutRole_SetsScoutHeadingWithoutAddingEvent()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Scout)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1", EastHeading);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Player("p1").CurrentHeading.Should().Be(EastHeading);
        context.State.EventLog.Should().NotContain(entry => entry.Type == "BeaconActivated");
    }

    [Fact]
    public void DeactivateBeacon_ForScoutRole_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Scout)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        GameStateCommon.SyncBeaconStateForRole(state, state.Players.Single(player => player.Id == "p1"));
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.DeactivateBeacon(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("Scout beacon is always active.");
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

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1");

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
            .WithPlayerPosition("p1", 0, 0)
            .WithTroops(0, 0, 3)
            .WithClaimMode(ClaimMode.PresenceOnly)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state!.ActiveRaids.Should().HaveCount(1);
        result.state.ActiveRaids[0].TargetQ.Should().Be(0);
        result.state.ActiveRaids[0].InitiatorAllianceId.Should().Be("a1");
        result.state.ActiveRaids[0].Deadline.Should().BeCloseTo(beforeActivation.AddMinutes(5), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void ResolveRaidTarget_WhenCommanderPointsAtAdjacentHex_ReturnsClosestHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (currentLat, currentLng) = ServiceTestContext.HexCenter(0, 0);
        var (targetLat, targetLng) = ServiceTestContext.HexCenter(1, 0);
        var targetHeading = HexService.BearingDegrees(currentLat, currentLng, targetLat, targetLng);

        var result = context.AbilityService.ResolveRaidTarget(ServiceTestContext.RoomCode, "p1", targetHeading);

        result.error.Should().BeNull();
        result.target.Should().Be((0, 0));
    }

    [Fact]
    public void ResolveRaidTarget_WhenPointingTowardMissingAdjacentHex_ReturnsCurrentHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(1)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .WithPlayerPosition("p1", 1, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (currentLat, currentLng) = ServiceTestContext.HexCenter(1, 0);
        var (missingLat, missingLng) = ServiceTestContext.HexCenter(2, 0);
        var missingHeading = HexService.BearingDegrees(currentLat, currentLng, missingLat, missingLng);

        var result = context.AbilityService.ResolveRaidTarget(ServiceTestContext.RoomCode, "p1", missingHeading);

        result.error.Should().BeNull();
        result.target.Should().Be((1, 0));
    }

    [Fact]
    public void ActivateCommandoRaid_WhenPlayerRolesAreDisabled_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", role: PlayerRole.Commander)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().NotBeNull();
    }


    [Fact]
    public void ActivateBeacon_WhenAnotherPlayerAlreadyHasBeacon_BeaconsCanCoexistWithoutRoles()
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

        var firstResult = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p2", EastHeading);
        var secondResult = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1", 210d);

        firstResult.error.Should().BeNull();
        secondResult.error.Should().BeNull();
        context.Player("p1").IsBeacon.Should().BeTrue();
        context.Player("p2").IsBeacon.Should().BeTrue();
        context.Player("p1").BeaconLat.Should().Be(context.Player("p1").CurrentLat);
        context.Player("p2").BeaconLat.Should().Be(context.Player("p2").CurrentLat);
        context.Player("p1").BeaconHeading.Should().Be(210d);
        context.Player("p2").BeaconHeading.Should().Be(EastHeading);
        context.State.EventLog.Should().Contain(entry => entry.Type == "BeaconActivated" && entry.PlayerId == "p1");
        context.State.EventLog.Should().Contain(entry => entry.Type == "BeaconActivated" && entry.PlayerId == "p2");
    }

    [Fact]
    public void ActivateBeacon_WhenRolesEnabledForScout_UpdatesHeadingAndBeaconState()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Scout)
            .WithPlayerPosition("p1", 1, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1", 210d);

        result.error.Should().BeNull();
        context.Player("p1").IsBeacon.Should().BeTrue();
        context.Player("p1").CurrentHeading.Should().Be(210d);
        context.Player("p1").BeaconHeading.Should().Be(210d);
        context.State.EventLog.Should().NotContain(entry => entry.Type == "BeaconActivated");
    }

    [Fact]
    public void ShareBeaconIntel_WhenNonScout_FailsInRoleMode()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ShareBeaconIntel(ServiceTestContext.RoomCode, "p1");

        result.sharedCount.Should().Be(0);
        result.error.Should().Be("Only a Scout can share intel.");
    }

    [Fact]
    public void ShareBeaconIntel_WhenScoutShares_UpdatesAllianceMemoryWithLastSeen()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Scout)
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        context.Room.VisibilityMemory.TryAdd("p1", new PlayerVisibilityMemory());
        context.Room.VisibilityMemory.TryAdd("p2", new PlayerVisibilityMemory());
        context.Player("p1").CurrentHeading = EastHeading;
        GameStateCommon.SyncBeaconStateForRole(context.State, context.Player("p1"));
        var candidateHex = context.VisibilityService
            .ComputeBeaconSectorKeys(context.State, context.Player("p1"))
            .First(hexKey => hexKey != HexService.Key(0, 0));
        var candidateCell = context.State.Grid[candidateHex];
        candidateCell.OwnerId = "p2";
        candidateCell.OwnerName = "Bob";
        candidateCell.OwnerAllianceId = "a1";
        candidateCell.OwnerColor = "#a1";
        candidateCell.Troops = 4;

        var before = DateTime.UtcNow;
        var result = context.AbilityService.ShareBeaconIntel(ServiceTestContext.RoomCode, "p1");
        var after = DateTime.UtcNow;

        result.error.Should().BeNull();
        result.sharedCount.Should().BeGreaterThan(0);
        var sharedRemembered = context.Room.VisibilityMemory["p2"].RememberedHexes[candidateHex];
        sharedRemembered.OwnerId.Should().Be("p2");
        sharedRemembered.OwnerAllianceId.Should().Be("a1");
        sharedRemembered.Troops.Should().Be(4);
        sharedRemembered.SeenAt.Should().BeOnOrAfter(before).And.BeOnOrBefore(after);
        context.Player("p1").ShareIntelCooldownUntil.Should().BeOnOrAfter(before.AddSeconds(59));
    }

    [Fact]
    public void ShareBeaconIntel_WhenOnCooldown_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Scout)
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        context.Player("p1").CurrentHeading = EastHeading;
        context.Player("p1").ShareIntelCooldownUntil = DateTime.UtcNow.AddSeconds(30);
        GameStateCommon.SyncBeaconStateForRole(context.State, context.Player("p1"));

        var result = context.AbilityService.ShareBeaconIntel(ServiceTestContext.RoomCode, "p1");

        result.sharedCount.Should().Be(0);
        result.error.Should().Be("Share Intel is on cooldown.");
    }

    [Fact]
    public void ActivateRallyPoint_ByNonCommander_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Scout)
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateRallyPoint(ServiceTestContext.RoomCode, "p1");

        result.error.Should().Contain("Commander");
    }

    [Fact]
    public void ActivateRallyPoint_ByCommander_ActivatesRallyPoint()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .Build();
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
        state.Players.First(p => p.Id == "p1").CurrentLat = lat;
        state.Players.First(p => p.Id == "p1").CurrentLng = lng;
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var (result, error) = context.AbilityService.ActivateRallyPoint(ServiceTestContext.RoomCode, "p1");

        error.Should().BeNull();
        var commander = result!.Players.First(p => p.Id == "p1");
        commander.RallyPointActive.Should().BeTrue();
        commander.RallyPointDeadline.Should().BeCloseTo(beforeActivation.AddMinutes(3), TimeSpan.FromSeconds(5));
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

        var result = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1", EastHeading);

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

        var beaconResult = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p2", EastHeading);
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
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        state.ActiveRaids.Add(new ActiveCommandoRaid
        {
            TargetQ = 1, TargetR = 0,
            InitiatorAllianceId = "a1",
            InitiatorPlayerId = "p1",
            Deadline = DateTime.UtcNow.AddMinutes(3)
        });
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1");

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
        context.Player("p1").BeaconHeading.Should().BeNull();
    }

    [Fact]
    public void ActivateTacticalStrike_WhenCommanderUsesAbility_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .WithPlayerRole("p1", PlayerRole.Commander)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateTacticalStrike(ServiceTestContext.RoomCode, "p1", 1, 0);

        result.error.Should().BeNull();
        context.Player("p1").TacticalStrikeActive.Should().BeTrue();
        context.Player("p1").TacticalStrikeExpiry.Should().BeCloseTo(beforeActivation.AddMinutes(5), TimeSpan.FromSeconds(10));
        context.Player("p1").TacticalStrikeCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(20), TimeSpan.FromSeconds(10));
        context.Player("p1").TacticalStrikeTargetQ.Should().Be(1);
        context.Player("p1").TacticalStrikeTargetR.Should().Be(0);
    }

    [Fact]
    public void ResolveTacticalStrikeTarget_WhenCommanderPointsAtAdjacentHex_ReturnsClosestHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (currentLat, currentLng) = ServiceTestContext.HexCenter(0, 0);
        var (targetLat, targetLng) = ServiceTestContext.HexCenter(1, 0);
        var targetHeading = HexService.BearingDegrees(currentLat, currentLng, targetLat, targetLng);

        var result = context.AbilityService.ResolveTacticalStrikeTarget(ServiceTestContext.RoomCode, "p1", targetHeading);

        result.error.Should().BeNull();
        result.target.Should().Be((1, 0));
    }

    [Fact]
    public void ActivateCommandoRaid_UsesCurrentHexAsTarget()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateCommandoRaid(ServiceTestContext.RoomCode, "p1");

        result.state.Should().NotBeNull();
        result.error.Should().BeNull();
        result.state!.ActiveRaids.Should().ContainSingle();
        result.state.ActiveRaids[0].TargetQ.Should().Be(0);
        result.state.ActiveRaids[0].TargetR.Should().Be(0);
    }

    [Fact]
    public void ActivateTacticalStrike_WhenTargetIsTooFar_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateTacticalStrike(ServiceTestContext.RoomCode, "p1", 2, 0);

        result.state.Should().BeNull();
        result.error.Should().Be("Tactical Strike target must be an adjacent hex.");
    }

    [Fact]
    public void ActivateRallyPoint_OnFriendlyHex_ActivatesRallyPointAndStartsCooldown()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Commander)
            .AddAlliance("a1", "Alpha", "p1")
            .OwnHex(0, 0, "p1", "a1", troops: 2)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeActivation = DateTime.UtcNow;

        var result = context.AbilityService.ActivateRallyPoint(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        // Troops not added immediately — rally resolves on deadline
        context.Player("p1").RallyPointActive.Should().BeTrue();
        context.Player("p1").RallyPointCooldownUntil.Should().BeCloseTo(beforeActivation.AddMinutes(15), TimeSpan.FromSeconds(10));
    }

    [Fact]
    public void ActivateSabotage_OnEnemyHex_StartsSabotage()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Engineer)
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .OwnHex(1, 0, "p2", allianceId: "a2")
            .WithTroops(1, 0, 3)
            .Build();
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);
        state.Players.First(p => p.Id == "p1").CurrentLat = lat;
        state.Players.First(p => p.Id == "p1").CurrentLng = lng;
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateSabotage(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        var engineer = result.state!.Players.First(p => p.Id == "p1");
        engineer.SabotageTargetQ.Should().Be(1);
        engineer.SabotageTargetR.Should().Be(0);
        engineer.SabotagePerimeterVisited.Should().BeEmpty();
        engineer.SabotageCooldownUntil.Should().BeNull();
    }

    [Fact]
    public void ActivateSabotage_WhenTileIsBlocked_FailsAndRemovesExpiredBlocks()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Engineer)
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .OwnHex(1, 0, "p2", allianceId: "a2")
            .WithPlayerPosition("p1", 1, 0)
            .Build();
        var engineer = state.Players.Single(player => player.Id == "p1");
        engineer.SabotageBlockedTiles[HexService.Key(1, 0)] = DateTime.UtcNow.AddMinutes(4);
        engineer.SabotageBlockedTiles[HexService.Key(-1, 0)] = DateTime.UtcNow.AddMinutes(-1);
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ActivateSabotage(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Contain("Sabotage is blocked on this hex");
        engineer.SabotageTargetQ.Should().BeNull();
        engineer.SabotageTargetR.Should().BeNull();
        engineer.SabotageBlockedTiles.Should().ContainKey(HexService.Key(1, 0));
        engineer.SabotageBlockedTiles.Should().NotContainKey(HexService.Key(-1, 0));
    }

    [Fact]
    public void StartFortConstruction_OnOwnedHex_StartsPerimeterTracking()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .AddAlliance("a1", "Alpha", "p1")
            .OwnHex(0, 0, "p1", "a1", troops: 2)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.StartFortConstruction(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Player("p1").FortTargetQ.Should().Be(0);
        context.Player("p1").FortTargetR.Should().Be(0);
        context.Player("p1").FortPerimeterVisited.Should().BeEmpty();
        context.State.EventLog.Should().Contain(entry => entry.Type == "FortConstructionStarted" && entry.PlayerId == "p1");
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
    public void StartDemolish_OnEnemyFort_StartsBreachTracking()
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

        var result = context.AbilityService.StartDemolish(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        context.Player("p1").DemolishTargetKey.Should().Be(HexService.Key(1, 0));
        context.Player("p1").DemolishApproachDirectionsMade.Should().BeEmpty();
        context.Player("p1").DemolishFacingLockStartAt.Should().BeNull();
        context.Player("p1").DemolishFacingHexKey.Should().BeNull();
        context.Player("p1").DemolishCooldownUntil.Should().BeNull();
    }

    [Fact]
    public void CancelDemolish_ClearsFacingLockFields()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .Build();
        var player = state.Players.Single(candidate => candidate.Id == "p1");
        player.DemolishTargetKey = HexService.Key(1, 0);
        player.DemolishApproachDirectionsMade.Add(HexService.Key(0, 0));
        player.DemolishFacingHexKey = HexService.Key(0, 0);
        player.DemolishFacingLockStartAt = DateTime.UtcNow.AddSeconds(-2);
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelDemolish(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        player.DemolishTargetKey.Should().BeNull();
        player.DemolishApproachDirectionsMade.Should().BeEmpty();
        player.DemolishFacingHexKey.Should().BeNull();
        player.DemolishFacingLockStartAt.Should().BeNull();
    }

    [Fact]
    public void AttemptIntercept_WhenScoutMaintainsLock_SucceedsAndBlocksSabotageTarget()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Scout)
            .AddPlayer("p2", "Bob", allianceId: "a2", role: PlayerRole.Engineer)
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var scout = state.Players.Single(player => player.Id == "p1");
        var engineer = state.Players.Single(player => player.Id == "p2");
        engineer.SabotageTargetQ = 1;
        engineer.SabotageTargetR = 0;
        var context = new ServiceTestContext(state);

        var firstAttempt = context.AbilityService.AttemptIntercept(ServiceTestContext.RoomCode, "p1", 0d);

        firstAttempt.error.Should().BeNull();
        firstAttempt.result.Should().BeEquivalentTo(new InterceptAttemptResult("locking", 0d));
        scout.InterceptTargetId.Should().Be("p2");
        scout.InterceptLockStartAt.Should().NotBeNull();

        scout.InterceptLockStartAt = DateTime.UtcNow.AddSeconds(-6);

        var secondAttempt = context.AbilityService.AttemptIntercept(ServiceTestContext.RoomCode, "p1", 0d);

        secondAttempt.error.Should().BeNull();
        secondAttempt.result.Should().BeEquivalentTo(new InterceptAttemptResult("success"));
        engineer.SabotageTargetQ.Should().BeNull();
        engineer.SabotageTargetR.Should().BeNull();
        engineer.SabotagePerimeterVisited.Should().BeEmpty();
        engineer.SabotageBlockedTiles.Should().ContainKey(HexService.Key(1, 0));
        scout.InterceptTargetId.Should().BeNull();
        scout.InterceptLockStartAt.Should().BeNull();
    }

    [Fact]
    public void InitiateTroopTransfer_WhenValid_AddsPendingTransfer()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .WithCarriedTroops("p1", 5)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.InitiateTroopTransfer(ServiceTestContext.RoomCode, "p1", 3, "p2");

        result.error.Should().BeNull();
        result.transferId.Should().NotBeNull();
        context.State.ActiveTroopTransfers.Should().ContainSingle();
        context.State.ActiveTroopTransfers[0].Amount.Should().Be(3);
    }

    [Fact]
    public void RespondToTroopTransfer_WhenAccepted_MovesTroopsAndSetsCooldown()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .WithCarriedTroops("p1", 5)
            .WithCarriedTroops("p2", 1)
            .Build();
        state.ActiveTroopTransfers.Add(new ActiveTroopTransfer
        {
            InitiatorId = "p1",
            InitiatorName = "Alice",
            RecipientId = "p2",
            RecipientName = "Bob",
            Amount = 3,
            ExpiresAt = DateTime.UtcNow.AddSeconds(20)
        });
        var context = new ServiceTestContext(state);
        var transferId = state.ActiveTroopTransfers[0].Id;

        var result = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p2", transferId, true);

        result.error.Should().BeNull();
        context.Player("p1").CarriedTroops.Should().Be(2);
        context.Player("p2").CarriedTroops.Should().Be(4);
        context.Player("p1").TroopTransferCooldownUntil.Should().NotBeNull();
        context.State.ActiveTroopTransfers.Should().BeEmpty();
    }

    [Fact]
    public void InitiateFieldBattle_WhenValid_CreatesActiveBattle()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p1", 4)
            .WithCarriedTroops("p2", 3)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.InitiateFieldBattle(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.battle.Should().NotBeNull();
        context.State.ActiveFieldBattles.Should().ContainSingle();
    }

    [Fact]
    public void ResolveFieldBattle_WhenEnemyJoins_ResolvesAndClearsBattle()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p1", 4)
            .WithCarriedTroops("p2", 2)
            .Build();
        var battleId = Guid.NewGuid();
        state.ActiveFieldBattles.Add(new ActiveFieldBattle
        {
            Id = battleId,
            InitiatorId = "p1",
            InitiatorName = "Alice",
            InitiatorAllianceId = "a1",
            Q = 0,
            R = 0,
            InitiatorTroops = 4,
            JoinDeadline = DateTime.UtcNow.AddSeconds(10),
            JoinedEnemyIds = ["p2"]
        });
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ResolveFieldBattle(ServiceTestContext.RoomCode, battleId);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.result.Should().NotBeNull();
        context.State.ActiveFieldBattles.Should().BeEmpty();
    }

    // ── Area 1: Ability cancel paths ─────────────────────────────────────────

    [Fact]
    public void CancelFortConstruction_WhenFortConstructionIsActive_CancelsAndClearsState()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var player = state.Players.Single(p => p.Id == "p1");
        player.FortTargetQ = 1;
        player.FortTargetR = 0;
        player.FortPerimeterVisited.Add(HexService.Key(0, 0));
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelFortConstruction(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Player("p1").FortTargetQ.Should().BeNull();
        context.Player("p1").FortTargetR.Should().BeNull();
        context.Player("p1").FortPerimeterVisited.Should().BeEmpty();
        context.State.EventLog.Should().Contain(entry => entry.Type == "FortConstructionCancelled" && entry.PlayerId == "p1");
    }

    [Fact]
    public void CancelFortConstruction_WhenNoFortConstructionActive_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelFortConstruction(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("You do not have a fort construction mission in progress.");
    }

    [Fact]
    public void CancelSabotage_WhenSabotageIsActive_CancelsAndClearsState()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Engineer)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var engineer = state.Players.Single(p => p.Id == "p1");
        engineer.SabotageTargetQ = 1;
        engineer.SabotageTargetR = 0;
        engineer.SabotagePerimeterVisited.Add(HexService.Key(0, 0));
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelSabotage(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Player("p1").SabotageTargetQ.Should().BeNull();
        context.Player("p1").SabotageTargetR.Should().BeNull();
        context.Player("p1").SabotagePerimeterVisited.Should().BeEmpty();
        context.State.EventLog.Should().Contain(entry => entry.Type == "SabotageCancelled" && entry.PlayerId == "p1");
    }

    [Fact]
    public void CancelSabotage_WhenNoSabotageActive_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Engineer)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelSabotage(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("You do not have a sabotage mission in progress.");
    }

    [Fact]
    public void CancelDemolish_WhenNoDemolishActive_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Engineer)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelDemolish(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("You do not have a demolish mission in progress.");
    }

    // ── Area 2: Troop transfer — decline path ────────────────────────────────

    [Fact]
    public void RespondToTroopTransfer_WhenDeclined_RemovesTransferAndSetsCooldown()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .WithCarriedTroops("p1", 5)
            .WithCarriedTroops("p2", 1)
            .Build();
        state.ActiveTroopTransfers.Add(new ActiveTroopTransfer
        {
            InitiatorId = "p1",
            InitiatorName = "Alice",
            RecipientId = "p2",
            RecipientName = "Bob",
            Amount = 3,
            ExpiresAt = DateTime.UtcNow.AddSeconds(20)
        });
        var context = new ServiceTestContext(state);
        var transferId = state.ActiveTroopTransfers[0].Id;

        var result = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p2", transferId, false);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.ActiveTroopTransfers.Should().BeEmpty();
        context.Player("p1").CarriedTroops.Should().Be(5);
        context.Player("p2").CarriedTroops.Should().Be(1);
        context.Player("p1").TroopTransferCooldownUntil.Should().NotBeNull();
    }

    [Fact]
    public void RespondToTroopTransfer_WhenCallerIsNotRecipient_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddPlayer("p3", "Carol", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2", "p3")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .WithPlayerPosition("p3", -1, 0)
            .WithCarriedTroops("p1", 5)
            .Build();
        var transferId = Guid.NewGuid();
        state.ActiveTroopTransfers.Add(new ActiveTroopTransfer
        {
            Id = transferId,
            InitiatorId = "p1",
            InitiatorName = "Alice",
            RecipientId = "p2",
            RecipientName = "Bob",
            Amount = 3,
            ExpiresAt = DateTime.UtcNow.AddSeconds(20)
        });
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p3", transferId, false);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the recipient can respond to this troop transfer.");
        context.State.ActiveTroopTransfers.Should().ContainSingle();
    }

    [Fact]
    public void RespondToTroopTransfer_WhenTransferNotFound_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var unknownId = Guid.NewGuid();

        var result = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p2", unknownId, false);

        result.state.Should().BeNull();
        result.error.Should().Be("Troop transfer not found.");
    }

    // ── Area 3: Field battle ─────────────────────────────────────────────────

    [Fact]
    public void ResolveFieldBattle_WhenDefenderHasMoreTroops_DefenderWins()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p1", 2)
            .WithCarriedTroops("p2", 5)
            .Build();
        // Default resolution mode is InitiatorVsSumOfJoined — fully deterministic.
        var battleId = Guid.NewGuid();
        state.ActiveFieldBattles.Add(new ActiveFieldBattle
        {
            Id = battleId,
            InitiatorId = "p1",
            InitiatorName = "Alice",
            InitiatorAllianceId = "a1",
            Q = 0,
            R = 0,
            InitiatorTroops = 2,
            JoinDeadline = DateTime.UtcNow.AddSeconds(10),
            JoinedEnemyIds = ["p2"]
        });
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ResolveFieldBattle(ServiceTestContext.RoomCode, battleId);

        result.error.Should().BeNull();
        result.result.Should().NotBeNull();
        result.result!.InitiatorWon.Should().BeFalse();
        context.Player("p1").CarriedTroops.Should().Be(0);
        context.Player("p2").CarriedTroops.Should().BeGreaterThan(0);
        context.State.ActiveFieldBattles.Should().BeEmpty();
    }

    [Fact]
    public void JoinFieldBattle_WhenPlayerIsOnBattleHex_JoinsSuccessfully()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p1", 4)
            .WithCarriedTroops("p2", 3)
            .Build();
        var battleId = Guid.NewGuid();
        state.ActiveFieldBattles.Add(new ActiveFieldBattle
        {
            Id = battleId,
            InitiatorId = "p1",
            InitiatorName = "Alice",
            InitiatorAllianceId = "a1",
            Q = 0,
            R = 0,
            InitiatorTroops = 4,
            JoinDeadline = DateTime.UtcNow.AddSeconds(10)
        });
        var context = new ServiceTestContext(state);

        var error = context.AbilityService.JoinFieldBattle(ServiceTestContext.RoomCode, "p2", battleId);

        error.Should().BeNull();
        context.State.ActiveFieldBattles.Single().JoinedEnemyIds.Should().Contain("p2");
    }

    [Fact]
    public void JoinFieldBattle_WhenBattleNotFound_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p2", 3)
            .Build();
        var context = new ServiceTestContext(state);
        var unknownBattleId = Guid.NewGuid();

        var error = context.AbilityService.JoinFieldBattle(ServiceTestContext.RoomCode, "p2", unknownBattleId);

        error.Should().Be("Field battle not found.");
    }



    [Fact]
    public void CancelFortConstruction_WhenMissionIsActive_ClearsTrackingAndAppendsEvent()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .Build();
        var player = state.Players.Single(candidate => candidate.Id == "p1");
        player.FortTargetQ = 0;
        player.FortTargetR = 1;
        player.FortPerimeterVisited.Add(HexService.Key(1, 0));
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelFortConstruction(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        player.FortTargetQ.Should().BeNull();
        player.FortTargetR.Should().BeNull();
        player.FortPerimeterVisited.Should().BeEmpty();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "FortConstructionCancelled"
            && entry.PlayerId == "p1"
            && entry.Q == 0
            && entry.R == 1);
    }

    [Fact]
    public void CancelFortConstruction_WhenMissionIsMissing_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelFortConstruction(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("You do not have a fort construction mission in progress.");
    }

    [Fact]
    public void CancelSabotage_WhenMissionIsActive_ClearsTrackingAndAppendsEvent()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .Build();
        var player = state.Players.Single(candidate => candidate.Id == "p1");
        player.SabotageTargetQ = 1;
        player.SabotageTargetR = 0;
        player.SabotagePerimeterVisited.Add(HexService.Key(0, 0));
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelSabotage(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        player.SabotageTargetQ.Should().BeNull();
        player.SabotageTargetR.Should().BeNull();
        player.SabotagePerimeterVisited.Should().BeEmpty();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "SabotageCancelled"
            && entry.PlayerId == "p1"
            && entry.Q == 1
            && entry.R == 0);
    }

    [Fact]
    public void CancelSabotage_WhenMissionIsMissing_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelSabotage(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("You do not have a sabotage mission in progress.");
    }

    [Fact]
    public void CancelDemolish_WhenMissionIsActive_ClearsTrackingAndAppendsEvent()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .Build();
        var player = state.Players.Single(candidate => candidate.Id == "p1");
        player.DemolishTargetKey = HexService.Key(1, 0);
        player.DemolishApproachDirectionsMade.Add(HexService.Key(0, 0));
        player.DemolishFacingHexKey = HexService.Key(0, 0);
        player.DemolishFacingLockStartAt = DateTime.UtcNow.AddSeconds(-2);
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelDemolish(ServiceTestContext.RoomCode, "p1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        player.DemolishTargetKey.Should().BeNull();
        player.DemolishApproachDirectionsMade.Should().BeEmpty();
        player.DemolishFacingHexKey.Should().BeNull();
        player.DemolishFacingLockStartAt.Should().BeNull();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "DemolishCancelled"
            && entry.PlayerId == "p1"
            && entry.Q == 1
            && entry.R == 0);
    }

    [Fact]
    public void CancelDemolish_WhenMissionIsMissing_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.CancelDemolish(ServiceTestContext.RoomCode, "p1");

        result.state.Should().BeNull();
        result.error.Should().Be("You do not have a demolish mission in progress.");
    }

    [Fact]
    public void RespondToTroopTransfer_WhenDeclined_RemovesPendingTransferAndSetsCooldown()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .WithCarriedTroops("p1", 5)
            .WithCarriedTroops("p2", 1)
            .Build();
        state.ActiveTroopTransfers.Add(new ActiveTroopTransfer
        {
            InitiatorId = "p1",
            InitiatorName = "Alice",
            RecipientId = "p2",
            RecipientName = "Bob",
            Amount = 3,
            ExpiresAt = DateTime.UtcNow.AddSeconds(20)
        });
        var context = new ServiceTestContext(state);
        var transferId = state.ActiveTroopTransfers[0].Id;

        var result = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p2", transferId, false);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Player("p1").CarriedTroops.Should().Be(5);
        context.Player("p2").CarriedTroops.Should().Be(1);
        context.Player("p1").TroopTransferCooldownUntil.Should().NotBeNull();
        context.State.ActiveTroopTransfers.Should().BeEmpty();
        context.State.EventLog.Should().NotContain(entry => entry.Type == "TroopTransferCompleted");
    }

    [Fact]
    public void RespondToTroopTransfer_WhenCallerIsNotRecipient_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddPlayer("p3", "Cara", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2", "p3")
            .Build();
        state.ActiveTroopTransfers.Add(new ActiveTroopTransfer
        {
            InitiatorId = "p1",
            InitiatorName = "Alice",
            RecipientId = "p2",
            RecipientName = "Bob",
            Amount = 2,
            ExpiresAt = DateTime.UtcNow.AddSeconds(20)
        });
        var context = new ServiceTestContext(state);
        var transferId = state.ActiveTroopTransfers[0].Id;

        var result = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p3", transferId, false);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the recipient can respond to this troop transfer.");
        context.State.ActiveTroopTransfers.Should().ContainSingle();
    }

    [Fact]
    public void RespondToTroopTransfer_WhenTransferIsMissing_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p2", Guid.NewGuid(), false);

        result.state.Should().BeNull();
        result.error.Should().Be("Troop transfer not found.");
    }

    [Fact]
    public void JoinFieldBattle_WhenBattleIsActive_AddsEnemyParticipant()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p1", 4)
            .WithCarriedTroops("p2", 3)
            .Build();
        var battleId = Guid.NewGuid();
        state.ActiveFieldBattles.Add(new ActiveFieldBattle
        {
            Id = battleId,
            InitiatorId = "p1",
            InitiatorName = "Alice",
            InitiatorAllianceId = "a1",
            Q = 0,
            R = 0,
            InitiatorTroops = 4,
            JoinDeadline = DateTime.UtcNow.AddSeconds(10)
        });
        var context = new ServiceTestContext(state);

        var error = context.AbilityService.JoinFieldBattle(ServiceTestContext.RoomCode, "p2", battleId);

        error.Should().BeNull();
        context.State.ActiveFieldBattles.Should().ContainSingle();
        context.State.ActiveFieldBattles[0].JoinedEnemyIds.Should().ContainSingle().Which.Should().Be("p2");
    }

    [Fact]
    public void JoinFieldBattle_WhenBattleIsMissing_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .Build();
        var context = new ServiceTestContext(state);

        var error = context.AbilityService.JoinFieldBattle(ServiceTestContext.RoomCode, "p1", Guid.NewGuid());

        error.Should().Be("Field battle not found.");
    }

    [Fact]
    public void ResolveFieldBattle_WhenEnemyStrengthIsHigher_EnemyWinsAndInitiatorLosesTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p1", 2)
            .WithCarriedTroops("p2", 5)
            .Build();
        var battleId = Guid.NewGuid();
        state.ActiveFieldBattles.Add(new ActiveFieldBattle
        {
            Id = battleId,
            InitiatorId = "p1",
            InitiatorName = "Alice",
            InitiatorAllianceId = "a1",
            Q = 0,
            R = 0,
            InitiatorTroops = 2,
            JoinDeadline = DateTime.UtcNow.AddSeconds(10),
            JoinedEnemyIds = ["p2"]
        });
        var context = new ServiceTestContext(state);

        var result = context.AbilityService.ResolveFieldBattle(ServiceTestContext.RoomCode, battleId);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.result.Should().NotBeNull();
        result.result!.InitiatorWon.Should().BeFalse();
        result.result.InitiatorTroopsLost.Should().Be(2);
        result.result.EnemyTroopsLost.Should().Be(1);
        context.Player("p1").CarriedTroops.Should().Be(0);
        context.Player("p2").CarriedTroops.Should().Be(4);
        context.Player("p1").FieldBattleCooldownUntil.Should().NotBeNull();
        context.Player("p2").FieldBattleCooldownUntil.Should().NotBeNull();
        context.State.ActiveFieldBattles.Should().BeEmpty();
    }

}
