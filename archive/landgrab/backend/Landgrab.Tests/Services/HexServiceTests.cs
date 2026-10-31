using System.Reflection;
using FluentAssertions;
using Landgrab.Api.Services;

namespace Landgrab.Tests.Services;

public sealed class HexServiceTests
{
    [Fact]
    public void Neighbors_AnyHex_ReturnsExactlySixHexes()
    {
        var neighbors = HexService.Neighbors(4, -2).ToList();

        neighbors.Should().HaveCount(6);
        neighbors.Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public void Neighbors_Origin_ReturnsExpectedCoordinateSet()
    {
        var neighbors = HexService.Neighbors(0, 0).ToList();

        neighbors.Should().BeEquivalentTo(
        [
            (1, 0),
            (1, -1),
            (0, -1),
            (-1, 0),
            (-1, 1),
            (0, 1)
        ]);
    }

    [Fact]
    public void AreAdjacent_AdjacentHexes_ReturnsTrue()
    {
        var areAdjacent = HexService.AreAdjacent(0, 0, 1, -1);

        areAdjacent.Should().BeTrue();
    }

    [Fact]
    public void AreAdjacent_NonAdjacentHexes_ReturnsFalse()
    {
        var areAdjacent = HexService.AreAdjacent(0, 0, 2, -1);

        areAdjacent.Should().BeFalse();
    }

    [Fact]
    public void AreAdjacent_SameHex_ReturnsFalse()
    {
        var areAdjacent = HexService.AreAdjacent(3, -2, 3, -2);

        areAdjacent.Should().BeFalse();
    }

    [Fact]
    public void HexDistance_Origin_ReturnsZero()
    {
        var distance = HexService.HexDistance(0, 0);

        distance.Should().Be(0);
    }

    [Fact]
    public void HexDistance_AdjacentHex_ReturnsOne()
    {
        var distance = HexService.HexDistance(1, 0);

        distance.Should().Be(1);
    }

    [Theory]
    [InlineData(2, -1, 2)]
    [InlineData(3, -3, 3)]
    [InlineData(-4, 2, 4)]
    public void HexDistance_DistantHex_ReturnsExpectedValue(int q, int r, int expectedDistance)
    {
        var distance = HexService.HexDistance(q, r);

        distance.Should().Be(expectedDistance);
    }

    [Fact]
    public void HexRing_RadiusOne_ReturnsSixHexes()
    {
        var ring = InvokeHexRing(1);

        ring.Should().HaveCount(6);
        ring.Should().OnlyContain(hex => HexService.HexDistance(hex.q, hex.r) == 1);
    }

    [Fact]
    public void HexRing_RadiusTwo_ReturnsTwelveHexes()
    {
        var ring = InvokeHexRing(2);

        ring.Should().HaveCount(12);
        ring.Should().OnlyContain(hex => HexService.HexDistance(hex.q, hex.r) == 2);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(1, 7)]
    [InlineData(2, 19)]
    [InlineData(3, 37)]
    public void Spiral_Radius_ReturnsExpectedHexCount(int radius, int expectedCount)
    {
        var count = HexService.Spiral(radius).Count();

        count.Should().Be(expectedCount);
    }

    [Fact]
    public void LatLngToHexForRoom_MapCenter_ReturnsOriginHex()
    {
        const double mapLat = 52.370216;
        const double mapLng = 4.895168;

        var hex = HexService.LatLngToHexForRoom(mapLat, mapLng, mapLat, mapLng, 25);

        hex.Should().Be((0, 0));
    }

    [Fact]
    public void HexToLatLng_AdjacentHex_RoundTripsBackToSameHex()
    {
        const double mapLat = 52.370216;
        const double mapLng = 4.895168;
        const int tileSizeMeters = 25;
        var position = HexService.HexToLatLng(1, -1, mapLat, mapLng, tileSizeMeters);

        var hex = HexService.LatLngToHexForRoom(position.lat, position.lng, mapLat, mapLng, tileSizeMeters);

        hex.Should().Be((1, -1));
    }

    [Fact]
    public void GetEvenlySpacedRing_RequestingThreeHexes_ReturnsThreeUniqueHexes()
    {
        var ring = HexService.GetEvenlySpacedRing(3, 2, 3);

        ring.Should().HaveCount(3);
        ring.Should().OnlyHaveUniqueItems();
        ring.Should().OnlyContain(hex => HexService.HexDistance(hex.q, hex.r) == 2);
    }

    [Fact]
    public void IsConnected_DisconnectedCoordinates_ReturnsFalse()
    {
        var isConnected = HexService.IsConnected([(0, 0), (2, 0)]);

        isConnected.Should().BeFalse();
    }

    [Fact]
    public void IsConnected_ConnectedCoordinates_ReturnsTrue()
    {
        var isConnected = HexService.IsConnected([(0, 0), (1, 0), (1, -1)]);

        isConnected.Should().BeTrue();
    }

    private static IReadOnlyCollection<(int q, int r)> InvokeHexRing(int radius)
    {
        var method = typeof(HexService).GetMethod("HexRing", BindingFlags.NonPublic | BindingFlags.Static);
        method.Should().NotBeNull();

        var result = method!.Invoke(null, [radius]);

        return ((IEnumerable<(int q, int r)>)result!).ToList();
    }
}
