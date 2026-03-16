using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class TroopRegenerationTests
{
    [Fact]
    public void AddReinforcementsToAllHexes_WhenGameIsPlaying_AddsTroopsToOwnedHexesAndMasterTile()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithMasterTile(0, 0)
            .AddPlayer("p1", "Alice")
            .OwnHex(1, 0, "p1", troops: 3)
            .WithTroops(0, 0, 4)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(1, 0).Troops.Should().Be(4);
        context.Cell(0, 0).Troops.Should().Be(5);
        result.state!.Grid[Landgrab.Api.Services.HexService.Key(1, 0)].Troops.Should().Be(4);
        result.state.Grid[Landgrab.Api.Services.HexService.Key(0, 0)].Troops.Should().Be(5);
    }

    [Fact]
    public void AddReinforcementsToAllHexes_WhenGameIsNotPlaying_ReturnsErrorAndLeavesStateUnchanged()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1", troops: 2)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.state.Should().BeNull();
        result.error.Should().Be("Reinforcements only apply while the game is playing.");
        context.Cell(0, 0).Troops.Should().Be(2);
    }

    [Fact]
    public void AddReinforcementsToAllHexes_WhenRushHourIsActive_ClearsRushHourOnTheTick()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1", troops: 2)
            .Build();
        state.IsRushHour = true;
        state.GameStartedAt = DateTime.UtcNow.AddMinutes(-10);
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.error.Should().BeNull();
        context.State.IsRushHour.Should().BeFalse();
        context.Cell(0, 0).Troops.Should().Be(3);
    }
}
