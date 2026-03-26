using FluentAssertions;
using Landgrab.Api.Services;

namespace Landgrab.Tests.Services;

public sealed class HexServiceBearingTests
{
    [Theory]
    [InlineData(0d, 0d, 1d, 0d, 0d)]
    [InlineData(0d, 0d, 0d, 1d, 90d)]
    [InlineData(1d, 0d, 0d, 0d, 180d)]
    [InlineData(0d, 0d, 0d, -1d, 270d)]
    [InlineData(0d, 0d, 1d, 1d, 45d)]
    [InlineData(52.370216d, 4.895168d, 52.370216d, 4.895168d, 0d)]
    public void BearingDegrees_KnownCoordinates_ReturnsExpectedBearing(
        double lat1,
        double lng1,
        double lat2,
        double lng2,
        double expectedBearing)
    {
        var bearing = HexService.BearingDegrees(lat1, lng1, lat2, lng2);
        var angularError = Math.Min(Math.Abs(bearing - expectedBearing), 360d - Math.Abs(bearing - expectedBearing));

        angularError.Should().BeLessThanOrEqualTo(1d);
    }

    [Theory]
    [InlineData(90d, 90d, 0d)]
    [InlineData(90d, 180d, 90d)]
    [InlineData(350d, 10d, 20d)]
    [InlineData(10d, 350d, 20d)]
    [InlineData(0d, 180d, 180d)]
    [InlineData(170d, 350d, 180d)]
    public void HeadingDiff_KnownHeadings_ReturnsShortestAngularDistance(double a, double b, double expectedDifference)
    {
        var difference = HexService.HeadingDiff(a, b);

        difference.Should().Be(expectedDifference);
    }
}