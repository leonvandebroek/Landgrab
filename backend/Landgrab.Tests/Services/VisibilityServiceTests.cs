using FluentAssertions;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class VisibilityServiceTests
{
    [Fact]
    public void ComputeVisibleHexKeys_WhenBeaconHasHeading_RevealsDirectedSector()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithBeaconEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 4, 0)
            .Build();
        var service = new VisibilityService();
        var beaconPlayer = state.Players.Single(player => player.Id == "p2");
        var (beaconLat, beaconLng) = ServiceTestContext.HexCenter(0, 0);
        var (eastLat, eastLng) = ServiceTestContext.HexCenter(1, 0);
        var headingToEastHex = HexService.BearingDegrees(beaconLat, beaconLng, eastLat, eastLng);

        beaconPlayer.IsBeacon = true;
        beaconPlayer.BeaconLat = beaconLat;
        beaconPlayer.BeaconLng = beaconLng;
        beaconPlayer.BeaconHeading = headingToEastHex;
        state.Dynamics.BeaconSectorAngle = 45;

        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        visibleHexKeys.Should().Contain(HexService.Key(0, 0));
        visibleHexKeys.Should().Contain(HexService.Key(1, 0));
        visibleHexKeys.Should().NotContain(HexService.Key(-1, 1));
    }
}