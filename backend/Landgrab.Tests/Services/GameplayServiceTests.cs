using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class GameplayServiceTests
{
    [Fact]
    public void PickUpTroops_FromOwnHex_SucceedsAndCarriesTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 3, lat, lng);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(0, 0).Troops.Should().Be(2);
        context.Player("p1").CarriedTroops.Should().Be(3);
        context.Player("p1").CarriedTroopsSourceQ.Should().Be(0);
        context.Player("p1").CarriedTroopsSourceR.Should().Be(0);
        result.state!.Grid[HexService.Key(0, 0)].Troops.Should().Be(2);
    }

    [Fact]
    public void PickUpTroops_FromEnemyHex_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p2")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 1, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("You can only pick up troops from your own hexes.");
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_WhenGameIsNotPlaying_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 1, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("This action is only available while the game is playing.");
    }

    [Fact]
    public void PickUpTroops_WhenHexDoesNotHaveEnoughTroops_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 1)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 2, lat, lng);

        result.error.Should().Be("That hex does not have enough troops.");
        context.Cell(0, 0).Troops.Should().Be(1);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_WhenAlreadyCarryingFromDifferentHex_AccumulatesTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p1")
            .WithTroops(0, 0, 5)
            .WithCarriedTroops("p1", 2, 1, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 1, lat, lng);

        result.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(4);
        context.Player("p1").CarriedTroops.Should().Be(3);
        context.Player("p1").CarriedTroopsSourceQ.Should().Be(0);
        context.Player("p1").CarriedTroopsSourceR.Should().Be(0);
    }

    [Fact]
    public void PlaceTroops_OnAdjacentNeutralHex_ClaimsHexWithoutDroppingCarriedTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithCarriedTroops("p1", 2, 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().BeNull();
        result.previousOwnerId.Should().BeNull();
        result.combatResult.Should().BeNull();
        context.Cell(1, 0).OwnerId.Should().Be("p1");
        context.Cell(1, 0).Troops.Should().Be(0);
        context.Player("p1").CarriedTroops.Should().Be(2);
    }

    [Fact]
    public void PlaceTroops_OnNonAdjacentNeutralHex_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithCarriedTroops("p1", 2, 0, 0)
            .WithClaimMode(ClaimMode.AdjacencyRequired)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(2, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 2, 0, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("This room requires neutral claims to border your territory.");
        context.Cell(2, 0).OwnerId.Should().BeNull();
    }

    [Fact]
    public void PlaceTroops_OnOwnHex_ReinforcesHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 4)
            .WithCarriedTroops("p1", 3, 1, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 0, 0, lat, lng);

        result.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(7);
        context.Player("p1").CarriedTroops.Should().Be(0);
        result.state!.Grid[HexService.Key(0, 0)].Troops.Should().Be(7);
    }

    [Fact]
    public void PlaceTroops_OnOwnHex_WithSpecificTroopCount_ReinforcesPartially()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 4)
            .WithCarriedTroops("p1", 3, 1, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 0, 0, lat, lng, 2);

        result.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(6);
        context.Player("p1").CarriedTroops.Should().Be(1);
        context.Player("p1").CarriedTroopsSourceQ.Should().Be(1);
        context.Player("p1").CarriedTroopsSourceR.Should().Be(0);
        result.state!.Grid[HexService.Key(0, 0)].Troops.Should().Be(6);
    }

    [Fact]
    public void PlaceTroops_OnOwnHexWithoutCarriedTroops_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 4)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 0, 0, lat, lng);

        result.error.Should().Be("You are not carrying any troops.");
        context.Cell(0, 0).Troops.Should().Be(4);
    }

    [Fact]
    public void PlaceTroops_OnEnemyHexWithSuperiorForce_CapturesHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p2")
            .WithTroops(1, 0, 2)
            .WithCarriedTroops("p1", 4, 0, 0)
            .Build();
        state.Dynamics.CombatMode = CombatMode.Classic;
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().BeNull();
        result.previousOwnerId.Should().Be("p2");
        result.combatResult.Should().NotBeNull();
        result.combatResult!.AttackerWon.Should().BeTrue();
        result.combatResult.HexCaptured.Should().BeTrue();
        result.combatResult.DefenderLost.Should().Be(2);
        context.Cell(1, 0).OwnerId.Should().Be("p1");
        context.Cell(1, 0).Troops.Should().Be(0);
        context.Player("p1").CarriedTroops.Should().Be(2);
        context.Player("p1").CarriedTroopsSourceQ.Should().Be(1);
        context.Player("p1").CarriedTroopsSourceR.Should().Be(0);
    }

    [Fact]
    public void PlaceTroops_OnEnemyHexWithInferiorForce_ReturnsCombatRepelledResult()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p2")
            .WithTroops(1, 0, 3)
            .WithCarriedTroops("p1", 3, 0, 0)
            .Build();
        state.Dynamics.CombatMode = CombatMode.Classic;
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.state.Should().NotBeNull();
        result.error.Should().BeNull();
        result.previousOwnerId.Should().BeNull();
        result.combatResult.Should().NotBeNull();
        result.combatResult!.AttackerWon.Should().BeFalse();
        result.combatResult.HexCaptured.Should().BeFalse();
        context.Cell(1, 0).OwnerId.Should().Be("p2");
        context.Cell(1, 0).Troops.Should().Be(3);
        context.Player("p1").CarriedTroops.Should().Be(1);
    }

    [Fact]
    public void PlaceTroops_InPresenceWithTroopModeWithoutCarriedTroops_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithClaimMode(ClaimMode.PresenceWithTroop)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().Be("You must be carrying at least 1 troop to claim a neutral hex in this room.");
        context.Cell(1, 0).OwnerId.Should().BeNull();
    }

    [Fact]
    public void AddReinforcementsToAllHexes_AddsOneToOwnedAndMasterTiles()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithMasterTile(0, 0)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p1")
            .OwnHex(1, -1, "p2")
            .WithTroops(1, 0, 2)
            .WithTroops(1, -1, 4)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(0, 0).Troops.Should().Be(1);
        context.Cell(1, 0).Troops.Should().Be(3);
        context.Cell(1, -1).Troops.Should().Be(5);
    }

    [Fact]
    public void AddReinforcementsToAllHexes_WhenGameIsNotPlaying_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .WithMasterTile(0, 0)
            .AddPlayer("p1", "Alice")
            .OwnHex(1, 0, "p1")
            .WithTroops(1, 0, 2)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.state.Should().BeNull();
        result.error.Should().Be("Reinforcements only apply while the game is playing.");
        context.Cell(1, 0).Troops.Should().Be(2);
    }

    [Fact]
    public void PickUpTroops_WhenCountIsLessThanOne_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 0, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("Pick-up count must be at least 1.");
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_OnMasterTile_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithMasterTile(0, 0)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 1, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("The master tile cannot be used for troop pick-up.");
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_WhenAlreadyCarryingFromSameHex_AccumulatesTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .WithCarriedTroops("p1", 2, 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 3, lat, lng);

        result.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(2);
        context.Player("p1").CarriedTroops.Should().Be(5);
        context.Player("p1").CarriedTroopsSourceQ.Should().Be(0);
        context.Player("p1").CarriedTroopsSourceR.Should().Be(0);
    }

    [Fact]
    public void PlaceTroops_OnAllianceMembersHex_ReinforcesHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .OwnHex(1, 0, "p2", "a1")
            .WithTroops(1, 0, 2)
            .WithCarriedTroops("p1", 3, 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().BeNull();
        result.previousOwnerId.Should().BeNull();
        result.combatResult.Should().BeNull();
        context.Cell(1, 0).OwnerId.Should().Be("p2");
        context.Cell(1, 0).OwnerAllianceId.Should().Be("a1");
        context.Cell(1, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PlaceTroops_CombatAccountsForFortDefenseBonus()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p2")
            .WithTroops(1, 0, 3)
            .WithCarriedTroops("p1", 4, 0, 0)
            .Build();
        state.Dynamics.CombatMode = CombatMode.Classic;
        state.Grid[HexService.Key(1, 0)].IsFort = true;

        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.state.Should().NotBeNull();
        result.error.Should().BeNull();
        result.combatResult.Should().NotBeNull();
        result.combatResult!.AttackerWon.Should().BeFalse();
        result.combatResult.DefenderBonus.Should().Be(1);
        context.Cell(1, 0).OwnerId.Should().Be("p2");
        context.Cell(1, 0).Troops.Should().Be(3);
        context.Player("p1").CarriedTroops.Should().Be(2);
    }

    [Fact]
    public void PlaceTroops_InPresenceWithTroopMode_ConsumesOnlyOneCarriedTroopForNeutralClaim()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithClaimMode(ClaimMode.PresenceWithTroop)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithCarriedTroops("p1", 3, 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().BeNull();
        result.combatResult.Should().BeNull();
        context.Cell(1, 0).OwnerId.Should().Be("p1");
        context.Cell(1, 0).Troops.Should().Be(1);
        context.Player("p1").CarriedTroops.Should().Be(2);
        context.Player("p1").CarriedTroopsSourceQ.Should().Be(0);
        context.Player("p1").CarriedTroopsSourceR.Should().Be(0);
    }

    [Fact]
    public void PlaceTroops_WhenCaptureMeetsWinCondition_EndsTheGame()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(1)
            .WithWinCondition(WinConditionType.TerritoryPercent, 50)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .OwnHex(-1, 0, "p1")
            .OwnHex(0, 1, "p1")
            .OwnHex(1, 0, "p2")
            .WithTroops(1, 0, 1)
            .WithCarriedTroops("p1", 2, 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        result.state!.Phase.Should().Be(GamePhase.GameOver);
        result.state.WinnerId.Should().Be("p1");
        result.state.WinnerName.Should().Be("Alice");
        context.State.EventLog.Should().Contain(entry => entry.Type == "GameOver" && entry.WinnerId == "p1");
    }

    [Fact]
    public void AddReinforcementsToAllHexes_WithHostilePresent_SkipsRegen()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(5);
    }

    [Fact]
    public void UpdatePlayerLocation_UpdatesPlayerCoordinates()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);
        const double heading = 135d;

        var result = context.GameplayService.UpdatePlayerLocation(ServiceTestContext.RoomCode, "p1", lat, lng, heading);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Player("p1").CurrentLat.Should().Be(lat);
        context.Player("p1").CurrentLng.Should().Be(lng);
        context.Player("p1").CurrentHeading.Should().Be(heading);
    }

    [Fact]
    public void UpdatePlayerLocation_WhenScoutRoleActive_RefreshesBeaconHeadingWithoutForcingGridChange()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithBeaconEnabled()
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Scout)
            .AddPlayer("p2", "Eve", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Bravo", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .OwnHex(1, 0, "p2", "a2", troops: 4)
            .Build();
        state.Dynamics.BeaconSectorAngle = 45;
        var context = new ServiceTestContext(state);
        context.Player("p1").CurrentHeading = 90d;
        GameStateCommon.SyncBeaconStateForRole(state, context.Player("p1"));

        var (movedLat, movedLng) = ServiceTestContext.HexCenter(0, 1);
        var (scanTargetLat, scanTargetLng) = ServiceTestContext.HexCenter(1, 0);
        var updatedHeading = HexService.BearingDegrees(movedLat, movedLng, scanTargetLat, scanTargetLng);

        var result = context.GameplayService.UpdatePlayerLocation(
            ServiceTestContext.RoomCode,
            "p1",
            movedLat,
            movedLng,
            updatedHeading);

        result.error.Should().BeNull();
        result.gridChanged.Should().BeFalse();
        context.Player("p1").BeaconLat.Should().Be(movedLat);
        context.Player("p1").BeaconLng.Should().Be(movedLng);
        context.Player("p1").BeaconHeading.Should().BeApproximately(HexService.NormalizeHeading(updatedHeading), 0.0001d);
    }

    [Fact]
    public void PlaceTroops_WhenAttackerHasTacticalStrike_IgnoresFortBonusesAndConsumesAbility()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1")
            .OwnHex(1, 0, "p2", "a2")
            .WithTroops(1, 0, 3)
            .WithCarriedTroops("p1", 4, 0, 0)
            .Build();
        state.Grid[HexService.Key(1, 0)].IsFort = true;
        state.Grid[HexService.Key(1, 0)].IsFortified = true;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeActive = true;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeExpiry = DateTime.UtcNow.AddMinutes(5);
        state.Players.Single(player => player.Id == "p1").TacticalStrikeTargetQ = 1;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeTargetR = 0;
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().BeNull();
        result.combatResult.Should().NotBeNull();
        result.combatResult!.DefenderBonus.Should().Be(0);
        context.Player("p1").TacticalStrikeActive.Should().BeFalse();
        context.Player("p1").TacticalStrikeExpiry.Should().BeNull();
        context.Player("p1").TacticalStrikeTargetQ.Should().BeNull();
        context.Player("p1").TacticalStrikeTargetR.Should().BeNull();
    }

    [Fact]
    public void PlaceTroops_WhenTacticalStrikeTargetsDifferentHex_KeepsDefenderBonusesAndAbility()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1")
            .OwnHex(1, 0, "p2", "a2")
            .WithTroops(1, 0, 3)
            .WithCarriedTroops("p1", 4, 0, 0)
            .Build();
        state.Dynamics.CombatMode = CombatMode.Classic;
        state.Grid[HexService.Key(1, 0)].IsFort = true;
        state.Grid[HexService.Key(1, 0)].IsFortified = true;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeActive = true;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeExpiry = DateTime.UtcNow.AddMinutes(5);
        state.Players.Single(player => player.Id == "p1").TacticalStrikeTargetQ = 0;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeTargetR = 0;
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.error.Should().BeNull();
        result.combatResult.Should().NotBeNull();
        result.combatResult!.DefenderBonus.Should().Be(2);
        context.Player("p1").TacticalStrikeActive.Should().BeTrue();
        context.Player("p1").TacticalStrikeTargetQ.Should().Be(0);
        context.Player("p1").TacticalStrikeTargetR.Should().Be(0);
    }

    [Fact]
    public void UpdatePlayerLocation_WhenDemolishFacingLockCompletesThirdApproach_RemovesFortAndClearsState()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerRole("p1", PlayerRole.Engineer)
            .OwnHex(1, 0, "p2", "a2", troops: 3)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        state.Grid[HexService.Key(1, 0)].IsFort = true;
        var engineer = state.Players.Single(player => player.Id == "p1");
        engineer.DemolishTargetKey = HexService.Key(1, 0);
        engineer.DemolishApproachDirectionsMade =
        [
            HexService.Key(2, -1),
            HexService.Key(1, -1)
        ];
        engineer.DemolishFacingHexKey = HexService.Key(0, 0);
        engineer.DemolishFacingLockStartAt = DateTime.UtcNow.AddSeconds(-6);
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
        var (targetLat, targetLng) = ServiceTestContext.HexCenter(1, 0);
        var heading = HexService.BearingDegrees(lat, lng, targetLat, targetLng);

        var result = context.GameplayService.UpdatePlayerLocation(ServiceTestContext.RoomCode, "p1", lat, lng, heading);

        result.error.Should().BeNull();
        result.gridChanged.Should().BeTrue();
        context.Cell(1, 0).IsFort.Should().BeFalse();
        context.Player("p1").DemolishTargetKey.Should().BeNull();
        context.Player("p1").DemolishApproachDirectionsMade.Should().BeEmpty();
        context.Player("p1").DemolishFacingHexKey.Should().BeNull();
        context.Player("p1").DemolishFacingLockStartAt.Should().BeNull();
        context.Player("p1").DemolishCooldownUntil.Should().NotBeNull();
        context.State.EventLog.Should().Contain(entry => entry.Type == "DemolishCompleted" && entry.PlayerId == "p1");
    }

    [Fact]
    public void UpdatePlayerLocation_WhenScoutIsNearActiveSabotage_SetsSabotageAlertNearby()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Scout)
            .AddPlayer("p2", "Bob", allianceId: "a2", role: PlayerRole.Engineer)
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 2, 0)
            .Build();
        var engineer = state.Players.Single(player => player.Id == "p2");
        engineer.SabotageTargetQ = 2;
        engineer.SabotageTargetR = 0;
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.UpdatePlayerLocation(ServiceTestContext.RoomCode, "p1", lat, lng, 180d);

        result.error.Should().BeNull();
        context.Player("p1").SabotageAlertNearby.Should().BeTrue();
    }

    [Fact]
    public void UpdatePlayerLocation_RemovesExpiredSabotageBlockedTiles()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", role: PlayerRole.Engineer)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var player = state.Players.Single(candidate => candidate.Id == "p1");
        player.SabotageBlockedTiles[HexService.Key(1, 0)] = DateTime.UtcNow.AddMinutes(-1);
        player.SabotageBlockedTiles[HexService.Key(0, 1)] = DateTime.UtcNow.AddMinutes(2);
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.UpdatePlayerLocation(ServiceTestContext.RoomCode, "p1", lat, lng, 90d);

        result.error.Should().BeNull();
        player.SabotageBlockedTiles.Should().NotContainKey(HexService.Key(1, 0));
        player.SabotageBlockedTiles.Should().ContainKey(HexService.Key(0, 1));
    }

    [Fact]
    public void AddReinforcementsToAllHexes_WhenTimedAbilitiesExpired_ClearsThem()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .Build();
        state.Players.Single(player => player.Id == "p1").TacticalStrikeActive = true;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeExpiry = DateTime.UtcNow.AddMinutes(-1);
        state.Players.Single(player => player.Id == "p1").TacticalStrikeTargetQ = 0;
        state.Players.Single(player => player.Id == "p1").TacticalStrikeTargetR = 0;
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.error.Should().BeNull();
        context.Player("p1").TacticalStrikeActive.Should().BeFalse();
        context.Player("p1").TacticalStrikeExpiry.Should().BeNull();
        context.Player("p1").TacticalStrikeTargetQ.Should().BeNull();
        context.Player("p1").TacticalStrikeTargetR.Should().BeNull();
    }

    [Fact]
    public void PlaceTroops_OnEnemyHQHex_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .WithTroops(0, 0, 5)
            .OwnHex(1, 0, "p2", allianceId: "a2")
            .WithTroops(1, 0, 2)
            .WithCarriedTroops("p1", 5, 0, 0)
            .Build();
        state.Alliances.Add(new AllianceDto { Id = "a2", HQHexQ = 1, HQHexR = 0 });
        state.Dynamics.HQEnabled = true;
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var (result, error, _, _) = context.GameplayService.PlaceTroops(
            ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        error.Should().Contain("CommandoRaid");
        result.Should().BeNull();
    }

    [Fact]
    public void UpdatePlayerLocation_WhenThirdSabotagePerimeterHexIsVisited_DisablesHexRegen()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Engineer)
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .OwnHex(1, 0, "p2", allianceId: "a2")
            .WithTroops(1, 0, 3)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
        var engineer = state.Players.First(p => p.Id == "p1");
        engineer.SabotageTargetQ = 1;
        engineer.SabotageTargetR = 0;
        engineer.SabotagePerimeterVisited =
        [
            HexService.Key(2, 0),
            HexService.Key(2, -1)
        ];
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.UpdatePlayerLocation(ServiceTestContext.RoomCode, "p1", lat, lng, null);

        result.error.Should().BeNull();
        result.gridChanged.Should().BeTrue();
        context.Cell(1, 0).SabotagedUntil.Should().NotBeNull();
        context.Cell(1, 0).SabotagedUntil!.Value.Should().BeCloseTo(
            DateTime.UtcNow.AddMinutes(10), TimeSpan.FromSeconds(10));
        engineer.SabotageTargetQ.Should().BeNull();
        engineer.SabotageTargetR.Should().BeNull();
        engineer.SabotagePerimeterVisited.Should().BeEmpty();
        engineer.SabotageCooldownUntil.Should().NotBeNull();
    }

    [Fact]
    public void ResolveRallyPoint_AlliesArrive_AddTroopsScaledToPlatoon()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddPlayer("p3", "Carol", allianceId: "a1")
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .WithTroops(0, 0, 2)
            .Build();
        state.Alliances.Add(new AllianceDto { Id = "a1", MemberIds = ["p1", "p2", "p3"] });
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
        foreach (var p in state.Players) { p.CurrentLat = lat; p.CurrentLng = lng; }
        state.Players.First(p => p.Id == "p1").RallyPointActive = true;
        state.Players.First(p => p.Id == "p1").RallyPointQ = 0;
        state.Players.First(p => p.Id == "p1").RallyPointR = 0;
        state.Players.First(p => p.Id == "p1").RallyPointDeadline = DateTime.UtcNow.AddSeconds(-1);
        var context = new ServiceTestContext(state);

        context.GameplayService.ResolveExpiredRallyPoints(ServiceTestContext.RoomCode);

        context.Cell(0, 0).Troops.Should().Be(8); // 2 base + 6 rally (3 allies × 2)
    }

    [Fact]
    public void ResolveCommandoRaid_AttackersWinWithTwoPlusPresence_CapturesHexAndTransfersTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddPlayer("p3", "Charlie", allianceId: "a2")
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .OwnHex(2, 0, "p3", allianceId: "a2")
            .WithTroops(2, 0, 6)
            .WithCarriedTroops("p1", 0)
            .Build();
        var (lat, lng) = ServiceTestContext.HexCenter(2, 0);
        state.Players.First(p => p.Id == "p1").CurrentLat = lat;
        state.Players.First(p => p.Id == "p1").CurrentLng = lng;
        state.Players.First(p => p.Id == "p2").CurrentLat = lat;
        state.Players.First(p => p.Id == "p2").CurrentLng = lng;
        state.ActiveRaids.Add(new ActiveCommandoRaid
        {
            TargetQ = 2, TargetR = 0,
            InitiatorAllianceId = "a1",
            InitiatorPlayerId = "p1",
            InitiatorPlayerName = "Alice",
            Deadline = DateTime.UtcNow.AddSeconds(-1)
        });
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.ResolveExpiredCommandoRaids(ServiceTestContext.RoomCode);

        result.state.Should().NotBeNull();
        result.state!.Grid[HexService.Key(2, 0)].OwnerAllianceId.Should().Be("a1");
        result.state.Grid[HexService.Key(2, 0)].Troops.Should().BeGreaterThan(0);
        result.state.ActiveRaids.Should().BeEmpty();
    }

    [Fact]
    public void ResolveCommandoRaid_AttackersHaveOnlyOnePresence_RaidFails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Commander)
            .AddPlayer("p3", "Charlie", allianceId: "a2")
            .OwnHex(2, 0, "p3", allianceId: "a2")
            .WithTroops(2, 0, 6)
            .Build();
        var (lat, lng) = ServiceTestContext.HexCenter(2, 0);
        state.Players.First(p => p.Id == "p1").CurrentLat = lat;
        state.Players.First(p => p.Id == "p1").CurrentLng = lng;
        state.ActiveRaids.Add(new ActiveCommandoRaid
        {
            TargetQ = 2, TargetR = 0,
            InitiatorAllianceId = "a1",
            InitiatorPlayerId = "p1",
            InitiatorPlayerName = "Alice",
            Deadline = DateTime.UtcNow.AddSeconds(-1)
        });
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.ResolveExpiredCommandoRaids(ServiceTestContext.RoomCode);

        result.state!.Grid[HexService.Key(2, 0)].OwnerAllianceId.Should().Be("a2");
        result.state.ActiveRaids.Should().BeEmpty();
    }

    [Fact]
    public void AddReinforcements_HexWithFriendlyPresence_RegeneratesAtTripleRate()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .WithTroops(0, 0, 3)
            .Build();
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
        state.Players.First(p => p.Id == "p1").CurrentLat = lat;
        state.Players.First(p => p.Id == "p1").CurrentLng = lng;
        var context = new ServiceTestContext(state);

        context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        // Base regen is 1, presence multiplier is 3x → expect 3 added = total 6
        context.Cell(0, 0).Troops.Should().Be(6);
    }

    [Fact]
    public void AddReinforcements_HexWithoutPresence_RegeneratesAtBaseRate()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .OwnHex(0, 0, "p1", allianceId: "a1")
            .WithTroops(0, 0, 3)
            .Build();
        // p1 has no location set
        var context = new ServiceTestContext(state);

        context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        context.Cell(0, 0).Troops.Should().Be(4); // base +1
    }

}
