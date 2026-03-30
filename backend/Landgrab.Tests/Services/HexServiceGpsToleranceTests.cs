using FluentAssertions;
using Landgrab.Api.Services;

namespace Landgrab.Tests.Services;

public sealed class HexServiceGpsToleranceTests
{
    private const double MapLat = 52.370216d;
    private const double MapLng = 4.895168d;
    private const double MetersPerDegreeLat = 111_320d;

    [Fact]
    public void IsPlayerInHex_WhenPlayerIsAtExactHexCenter_ReturnsTrue()
    {
        const int tileSizeMeters = 25;
        var (lat, lng) = HexService.HexToLatLng(0, 0, MapLat, MapLng, tileSizeMeters);

        var allowed = HexService.IsPlayerInHex(
            lat,
            lng,
            0,
            0,
            MapLat,
            MapLng,
            tileSizeMeters,
            tileSizeMeters * 0.65d);

        allowed.Should().BeTrue();
    }

    [Fact]
    public void IsPlayerInHex_WhenPlayerIsWithinGpsToleranceOfHexCenter_ReturnsTrue()
    {
        const int tileSizeMeters = 25;
        var center = HexService.HexToLatLng(0, 0, MapLat, MapLng, tileSizeMeters);
        var nearEdge = OffsetMetersEast(center, tileSizeMeters * 0.65d);

        var allowed = HexService.IsPlayerInHex(
            nearEdge.lat,
            nearEdge.lng,
            0,
            0,
            MapLat,
            MapLng,
            tileSizeMeters,
            tileSizeMeters * 0.65d);

        allowed.Should().BeTrue();
    }

    [Fact]
    public void IsPlayerInHex_WhenPlayerIsJustBeyondGpsToleranceFromHexBoundary_ReturnsFalse()
    {
        const int tileSizeMeters = 25;
        var toleranceMeters = tileSizeMeters * 0.65d;
        var center = HexService.HexToLatLng(0, 0, MapLat, MapLng, tileSizeMeters);
        // Move beyond the hex boundary (tileSizeMeters) + tolerance
        var outsideTolerance = OffsetMetersEast(center, tileSizeMeters + toleranceMeters + 2d);

        var allowed = HexService.IsPlayerInHex(
            outsideTolerance.lat,
            outsideTolerance.lng,
            0,
            0,
            MapLat,
            MapLng,
            tileSizeMeters,
            toleranceMeters);

        allowed.Should().BeFalse();
    }

    [Fact]
    public void IsPlayerInHex_WhenPlayerIsTwoTileSizesAwayFromHexCenter_ReturnsFalse()
    {
        const int tileSizeMeters = 25;
        var center = HexService.HexToLatLng(0, 0, MapLat, MapLng, tileSizeMeters);
        // Two tile sizes away is clearly outside both the hex and its tolerance zone
        var farAway = OffsetMetersEast(center, tileSizeMeters * 2d);

        var allowed = HexService.IsPlayerInHex(
            farAway.lat,
            farAway.lng,
            0,
            0,
            MapLat,
            MapLng,
            tileSizeMeters,
            tileSizeMeters * 0.65d);

        allowed.Should().BeFalse();
    }

    [Theory]
    [InlineData(25)]
    [InlineData(50)]
    [InlineData(100)]
    public void IsPlayerInHex_ToleranceScalesWithConfiguredTileSize(int tileSizeMeters)
    {
        var center = HexService.HexToLatLng(0, 0, MapLat, MapLng, tileSizeMeters);
        var toleranceMeters = tileSizeMeters * 0.65d;
        // Position just outside hex boundary but within tolerance (should pass)
        var withinTolerance = OffsetMetersEast(center, tileSizeMeters + toleranceMeters * 0.5d);
        // Position beyond the hex boundary + tolerance to ensure rejection
        var beyondTolerance = OffsetMetersEast(center, tileSizeMeters + toleranceMeters + 2d);

        var withinAllowed = HexService.IsPlayerInHex(
            withinTolerance.lat,
            withinTolerance.lng,
            0,
            0,
            MapLat,
            MapLng,
            tileSizeMeters,
            toleranceMeters);

        var beyondAllowed = HexService.IsPlayerInHex(
            beyondTolerance.lat,
            beyondTolerance.lng,
            0,
            0,
            MapLat,
            MapLng,
            tileSizeMeters,
            toleranceMeters);

        withinAllowed.Should().BeTrue();
        beyondAllowed.Should().BeFalse();
    }

    private static (double lat, double lng) OffsetMetersEast((double lat, double lng) origin, double metersEast)
    {
        var cosLat = Math.Cos(MapLat * Math.PI / 180d);
        var lngOffset = metersEast / (MetersPerDegreeLat * Math.Max(Math.Abs(cosLat), 1e-9d));
        return (origin.lat, origin.lng + lngOffset);
    }
}