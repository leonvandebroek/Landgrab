using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class GameplayServicePickupValidationTests
{
    private const string PickUpOwnHexesOnlyError = "You can only pick up troops from your own hexes.";
    private const string PickUpSingleSourceError = "You are already carrying troops from another hex. Place them before picking up from a different hex.";
    private const double MetersPerDegreeLat = 111_320d;

    [Fact]
    public void PickUpTroops_FromOwnHexWithTroops_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 2, lat, lng);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(0, 0).Troops.Should().Be(3);
        context.Player("p1").CarriedTroops.Should().Be(2);
    }

    [Fact]
    public void PickUpTroops_FromAlliedHex_ReturnsOwnHexOnlyError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .OwnHex(0, 0, "p2", "a1")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 2, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be(PickUpOwnHexesOnlyError);
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_WhenAlreadyCarryingFromDifferentSourceHex_ReturnsSingleSourceError()
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

        result.state.Should().BeNull();
        result.error.Should().Be(PickUpSingleSourceError);
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(2);
        context.Player("p1").CarriedTroopsSourceQ.Should().Be(1);
        context.Player("p1").CarriedTroopsSourceR.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_FromHexWithZeroTroops_ReturnsInsufficientTroopsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 1, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("That hex does not have enough troops.");
        context.Cell(0, 0).Troops.Should().Be(0);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_FromEnemyHex_ReturnsOwnHexOnlyError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Bravo", "p2")
            .OwnHex(0, 0, "p2", "a2")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 1, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be(PickUpOwnHexesOnlyError);
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    [Fact]
    public void PickUpTroops_WhenPlayerIsTooFarFromTargetHex_ReturnsGpsProximityError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 5)
            .Build();
        var context = new ServiceTestContext(state);
        var center = ServiceTestContext.HexCenter(0, 0);
        var farAway = OffsetMetersEast(center, 30d);

        var result = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 1, farAway.lat, farAway.lng);

        result.state.Should().BeNull();
        result.error.Should().NotBeNull();
        result.error!.Should().Contain("Move closer");
        context.Cell(0, 0).Troops.Should().Be(5);
        context.Player("p1").CarriedTroops.Should().Be(0);
    }

    private static (double lat, double lng) OffsetMetersEast(
        (double lat, double lng) origin,
        double metersEast)
    {
        var cosLat = Math.Cos(ServiceTestContext.DefaultMapLat * Math.PI / 180d);
        var lngOffset = metersEast / (MetersPerDegreeLat * Math.Max(Math.Abs(cosLat), 1e-9d));
        return (origin.lat, origin.lng + lngOffset);
    }
}
