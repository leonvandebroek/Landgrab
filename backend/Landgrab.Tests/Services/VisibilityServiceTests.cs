using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class VisibilityServiceTests
{
    [Fact]
    public void ComputeVisibleHexKeys_WhenViewerHasBeaconWithHeading_RevealsDirectedSector()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithBeaconEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", -4, 0)
            .WithPlayerPosition("p2", 4, 0)
            .Build();
        var service = new VisibilityService();
        var beaconPlayer = state.Players.Single(player => player.Id == "p1");
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

    [Fact]
    public void ComputeVisibleHexKeys_WhenOnlyTeammateHasBeacon_DoesNotRevealTeammateSector()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithBeaconEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", -4, 0)
            .WithPlayerPosition("p2", 4, 0)
            .Build();
        var service = new VisibilityService();
        var teammateBeacon = state.Players.Single(player => player.Id == "p2");
        var (beaconLat, beaconLng) = ServiceTestContext.HexCenter(0, 0);
        var (eastLat, eastLng) = ServiceTestContext.HexCenter(1, 0);
        var headingToEastHex = HexService.BearingDegrees(beaconLat, beaconLng, eastLat, eastLng);

        teammateBeacon.IsBeacon = true;
        teammateBeacon.BeaconLat = beaconLat;
        teammateBeacon.BeaconLng = beaconLng;
        teammateBeacon.BeaconHeading = headingToEastHex;
        state.Dynamics.BeaconSectorAngle = 45;

        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        // Beacon sectors are personal-only; allied beacons no longer auto-contribute to teammate visibility.
        visibleHexKeys.Should().NotContain(HexService.Key(0, 0));
        visibleHexKeys.Should().NotContain(HexService.Key(1, 0));
    }

    [Fact]
    public void ComputeVisibleHexKeys_WhenAllianceOwnsBorder_AddsAdjacentEnemyHexes()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Eve", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Bravo", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 3)
            .OwnHex(1, 0, "p2", "a2", troops: 4)
            .WithPlayerPosition("p1", -2, 0)
            .Build();
        var service = new VisibilityService();

        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        visibleHexKeys.Should().Contain(HexService.Key(1, 0));
    }

    [Fact]
    public void UpdateMemory_WhenViewerBeaconSeesHostile_DoesNotAutoShareBeaconIntelToAlliance()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithBeaconEnabled()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddPlayer("p3", "Eve", "a2")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .AddAlliance("a2", "Bravo", "p3")
            .WithPlayerPosition("p1", -4, 0)
            .WithPlayerPosition("p2", -3, 0)
            .WithPlayerPosition("p3", 3, 0)
            .OwnHex(1, 0, "p3", "a2", troops: 5)
            .Build();
        state.Dynamics.BeaconSectorAngle = 45;

        var viewer = state.Players.Single(player => player.Id == "p1");
        var (beaconLat, beaconLng) = ServiceTestContext.HexCenter(0, 0);
        var (eastLat, eastLng) = ServiceTestContext.HexCenter(1, 0);
        viewer.IsBeacon = true;
        viewer.BeaconLat = beaconLat;
        viewer.BeaconLng = beaconLng;
        viewer.BeaconHeading = HexService.BearingDegrees(beaconLat, beaconLng, eastLat, eastLng);

        var service = new VisibilityService();
        var room = new GameRoom { Code = state.RoomCode, State = state };
        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        service.UpdateMemory(room, state, "p1", "a1", visibleHexKeys);

        room.VisibilityMemory["p1"].RememberedHexes.Should().ContainKey(HexService.Key(1, 0));
        room.VisibilityMemory["p2"].RememberedHexes.Should().NotContainKey(HexService.Key(1, 0));
    }
}
