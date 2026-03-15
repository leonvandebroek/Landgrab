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
        result.ambushResult.Should().BeNull();
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
    public void PickUpTroops_WhenAlreadyCarryingFromDifferentHex_Fails()
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

        result.error.Should().Be("Place your carried troops before picking up from a different hex.");
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(2);
    }

    [Fact]
    public void PlaceTroops_OnAdjacentNeutralHex_ClaimsHex()
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
        context.Cell(1, 0).Troops.Should().Be(2);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PlaceTroops_OnNonAdjacentNeutralHex_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithCarriedTroops("p1", 2, 0, 0)
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
        context.Cell(1, 0).Troops.Should().Be(2);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PlaceTroops_OnEnemyHexWithInferiorForce_Fails()
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
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

        var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("You need more effective strength to overcome the defenders.");
        context.Cell(1, 0).OwnerId.Should().Be("p2");
        context.Cell(1, 0).Troops.Should().Be(3);
        context.Player("p1").CarriedTroops.Should().Be(3);
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
    public void ReClaimHex_ToAllianceClaim_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddAlliance("a1", "Alpha", "p1")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 3)
            .Build();
        state.Grid[HexService.Key(0, 0)].OwnerAllianceId = null;
        state.Grid[HexService.Key(0, 0)].OwnerColor = state.Players.Single(player => player.Id == "p1").Color;
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.ReClaimHex(ServiceTestContext.RoomCode, "p1", 0, 0, ReClaimMode.Alliance);

        result.error.Should().BeNull();
        context.Cell(0, 0).OwnerAllianceId.Should().Be("a1");
        context.Cell(0, 0).OwnerColor.Should().Be("#a1");
    }

    [Fact]
    public void ReClaimHex_WhenHexIsNotOwnedByPlayer_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.ReClaimHex(ServiceTestContext.RoomCode, "p1", 0, 0, ReClaimMode.Alliance);

        result.state.Should().BeNull();
        result.error.Should().Be("You can only reclaim your own hexes.");
    }

    [Fact]
    public void ReClaimHex_SelfClaimDisallowed_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .WithAllowSelfClaim(false)
            .AddPlayer("p1", "Alice", "a1")
            .AddAlliance("a1", "Alpha", "p1")
            .OwnHex(0, 0, "p1", "a1")
            .WithTroops(0, 0, 3)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.ReClaimHex(ServiceTestContext.RoomCode, "p1", 0, 0, ReClaimMode.Self);

        result.state.Should().BeNull();
        result.error.Should().Be("Self-claiming is not allowed in this game.");
        context.Cell(0, 0).OwnerAllianceId.Should().Be("a1");
    }

    [Fact]
    public void ReClaimHex_Abandon_ClearsOwnershipAndTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.ReClaimHex(ServiceTestContext.RoomCode, "p1", 0, 0, ReClaimMode.Abandon);

        result.error.Should().BeNull();
        context.Cell(0, 0).OwnerId.Should().BeNull();
        context.Cell(0, 0).OwnerName.Should().BeNull();
        context.Cell(0, 0).OwnerAllianceId.Should().BeNull();
        context.Cell(0, 0).OwnerColor.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(0);
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
}
