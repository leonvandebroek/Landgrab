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

    [Fact]
    public void BuildStateForViewer_WhenBeaconSectorSeesHostile_SetsLastSeenAndKnownFields()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(4)
            .WithBeaconEnabled()
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Eve", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Bravo", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .OwnHex(1, 0, "p2", "a2", troops: 6)
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

        var visibleState = service.BuildStateForViewer(
            GameStateCommon.SnapshotState(state),
            "p1",
            room.VisibilityMemory["p1"],
            visibleHexKeys,
            isHostObserver: false,
            enemySightingMemorySeconds: state.Dynamics.EnemySightingMemorySeconds);

        var seenCell = visibleState.Grid[HexService.Key(1, 0)];
        seenCell.VisibilityTier.Should().Be(VisibilityTier.Visible);
        seenCell.OwnerId.Should().Be("p2");
        seenCell.OwnerAllianceId.Should().Be("a2");
        seenCell.Troops.Should().Be(6);

        var hiddenSource = state;
        hiddenSource.Players.Single(player => player.Id == "p1").IsBeacon = false;
        hiddenSource.Players.Single(player => player.Id == "p1").BeaconLat = null;
        hiddenSource.Players.Single(player => player.Id == "p1").BeaconLng = null;
        hiddenSource.Players.Single(player => player.Id == "p1").BeaconHeading = null;
        var hiddenVisibleKeys = service.ComputeVisibleHexKeys(hiddenSource, "p1");
        var rememberedState = service.BuildStateForViewer(
            GameStateCommon.SnapshotState(hiddenSource),
            "p1",
            room.VisibilityMemory["p1"],
            hiddenVisibleKeys,
            isHostObserver: false,
            enemySightingMemorySeconds: hiddenSource.Dynamics.EnemySightingMemorySeconds);
        var rememberedCell = rememberedState.Grid[HexService.Key(1, 0)];
        rememberedCell.VisibilityTier.Should().Be(VisibilityTier.Remembered);
        rememberedCell.LastKnownTroops.Should().Be(6);
        rememberedCell.LastKnownOwnerId.Should().Be("p2");
        rememberedCell.LastKnownOwnerAllianceId.Should().Be("a2");
        rememberedCell.LastKnownIsFort.Should().BeFalse();
        rememberedCell.LastSeenAt.Should().NotBeNull();
    }


    [Fact]
    public void ComputeVisibleHexKeys_WhenViewerHasCurrentHex_IncludesAllHexesWithinVisibilityRadius()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .WithPlayerPosition("p1", 1, 0)
            .Build();
        var service = new VisibilityService();

        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        visibleHexKeys.Should().Contain(HexService.Key(1, 0));
        visibleHexKeys.Should().Contain(HexService.Key(2, 0));
        visibleHexKeys.Should().Contain(HexService.Key(0, 0));
        visibleHexKeys.Should().Contain(HexService.Key(1, 1));
        visibleHexKeys.Should().NotContain(HexService.Key(3, 0));
    }

    [Fact]
    public void BuildStateForViewer_WhenEnemyHexIsWithinVisibilityRadius_MarksHexVisible()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 1, 0)
            .OwnHex(2, 0, "p2", "a2", troops: 4)
            .Build();
        var service = new VisibilityService();
        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        var visibleState = service.BuildStateForViewer(
            GameStateCommon.SnapshotState(state),
            "p1",
            new PlayerVisibilityMemory(),
            visibleHexKeys,
            isHostObserver: false,
            enemySightingMemorySeconds: 0);

        visibleState.Grid[HexService.Key(2, 0)].VisibilityTier.Should().Be(VisibilityTier.Visible);
    }

    [Fact]
    public void BuildStateForViewer_WhenEnemyHexIsOutsideVisibilityRadius_MarksHexHidden()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 1, 0)
            .OwnHex(3, 0, "p2", "a2", troops: 4)
            .Build();
        var service = new VisibilityService();
        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        var visibleState = service.BuildStateForViewer(
            GameStateCommon.SnapshotState(state),
            "p1",
            new PlayerVisibilityMemory(),
            visibleHexKeys,
            isHostObserver: false,
            enemySightingMemorySeconds: 0);

        visibleState.Grid[HexService.Key(3, 0)].VisibilityTier.Should().Be(VisibilityTier.Hidden);
    }

    // ── Area 4: Fog-of-war radius ─────────────────────────────────────────────

    [Fact]
    public void ComputeVisibleHexKeys_WhenAlliedPlayerIsOnDifferentHex_IncludesAlliesRadiusInViewerVisibility()
    {
        // p1 is far from (2,0). Only p2 (allied) is near (2,0), so (2,0) should be visible to p1 through alliance.
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", -3, 0)
            .WithPlayerPosition("p2", 2, 0)
            .Build();
        var service = new VisibilityService();

        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        // (2,0) is p2's hex — radius 1 around p2 includes (1,0), (2,0), (3,0) etc.
        visibleHexKeys.Should().Contain(HexService.Key(2, 0));
        // (-3,0) is p1's own hex
        visibleHexKeys.Should().Contain(HexService.Key(-3, 0));
        // (0,0) is outside radius-1 of both players
        visibleHexKeys.Should().NotContain(HexService.Key(0, 0));
    }

    [Fact]
    public void ComputeVisibleHexKeys_WhenViewerOwnsAllianceTile_AllianceTileIsAlwaysVisible()
    {
        // p1 is far from the owned tile at (2,0), but alliance ownership keeps it in visible set.
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", -3, 0)
            .OwnHex(2, 0, "p1", "a1", troops: 2)
            .Build();
        var service = new VisibilityService();

        var visibleHexKeys = service.ComputeVisibleHexKeys(state, "p1");

        visibleHexKeys.Should().Contain(HexService.Key(2, 0));
    }

}
