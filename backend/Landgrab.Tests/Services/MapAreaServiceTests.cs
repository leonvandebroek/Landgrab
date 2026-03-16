using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class MapAreaServiceTests
{
    [Fact]
    public void SetMapLocation_ValidCoordinates_UpdatesMapLocationAndEnsuresGrid()
    {
        var (context, sut, hostId, _) = CreateSut();
        context.State.Grid.Clear();

        var result = sut.SetMapLocation(ServiceTestContext.RoomCode, hostId, 51.924419, 4.477733);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.MapLat.Should().Be(51.924419);
        context.State.MapLng.Should().Be(4.477733);
        context.State.Grid.Should().NotBeEmpty();
        result.state!.MapLat.Should().Be(51.924419);
        result.state.MapLng.Should().Be(4.477733);
        result.state.Grid.Should().NotBeEmpty();
    }

    [Fact]
    public void SetMapLocation_WhenUserIsNotHost_Fails()
    {
        var (context, sut, _, guestId) = CreateSut();

        var result = sut.SetMapLocation(ServiceTestContext.RoomCode, guestId, 51.924419, 4.477733);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can set the map location.");
        context.State.MapLat.Should().Be(ServiceTestContext.DefaultMapLat);
        context.State.MapLng.Should().Be(ServiceTestContext.DefaultMapLng);
    }

    [Fact]
    public void SetMapLocation_WhenGameIsNotInLobby_Fails()
    {
        var (context, sut, hostId, _) = CreateSut(builder => builder.WithPhase(GamePhase.Playing));

        var result = sut.SetMapLocation(ServiceTestContext.RoomCode, hostId, 51.924419, 4.477733);

        result.state.Should().BeNull();
        result.error.Should().Be("Map location can only be changed in the lobby.");
        context.State.MapLat.Should().Be(ServiceTestContext.DefaultMapLat);
        context.State.MapLng.Should().Be(ServiceTestContext.DefaultMapLng);
    }

    [Fact]
    public void SetTileSize_WithValueBelowMinimum_ClampsToMinimum()
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetTileSize(ServiceTestContext.RoomCode, hostId, 5);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.TileSizeMeters.Should().Be(15);
        result.state!.TileSizeMeters.Should().Be(15);
    }

    [Fact]
    public void SetTileSize_WhenRequestedSizeExceedsAllowedFootprint_Fails()
    {
        var (context, sut, hostId, _) = CreateSut(builder => builder.WithGrid(8));

        var result = sut.SetTileSize(ServiceTestContext.RoomCode, hostId, 40);

        result.state.Should().BeNull();
        result.error.Should().Be($"This game area can use at most 33 meters per tile to stay within {1_000:N0} meters.");
        context.State.TileSizeMeters.Should().Be(ServiceTestContext.DefaultTileSizeMeters);
    }

    [Fact]
    public void SetHostBypassGps_TogglesBypassFlag()
    {
        var (context, sut, hostId, _) = CreateSut();

        var enableResult = sut.SetHostBypassGps(ServiceTestContext.RoomCode, hostId, true);
        var disableResult = sut.SetHostBypassGps(ServiceTestContext.RoomCode, hostId, false);

        enableResult.success.Should().BeTrue();
        enableResult.error.Should().BeNull();
        disableResult.success.Should().BeTrue();
        disableResult.error.Should().BeNull();
        context.State.HostBypassGps.Should().BeFalse();
    }

    [Fact]
    public void SetMaxFootprint_WithValidValue_UpdatesOverride()
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetMaxFootprint(ServiceTestContext.RoomCode, hostId, 2500);

        result.success.Should().BeTrue();
        result.error.Should().BeNull();
        context.State.MaxFootprintMetersOverride.Should().Be(2500);
    }

    [Fact]
    public void SetMaxFootprint_WhenValueIsOutOfRange_Fails()
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetMaxFootprint(ServiceTestContext.RoomCode, hostId, 99);

        result.success.Should().BeFalse();
        result.error.Should().Be("Max footprint must be between 100 and 50,000 meters.");
        context.State.MaxFootprintMetersOverride.Should().BeNull();
    }

    [Fact]
    public void UseCenteredGameArea_RebuildsDefaultCenteredGridAndResetsBoardState()
    {
        var (context, sut, hostId, _) = CreateSut(builder =>
            builder
                .WithGrid(2)
                .WithMasterTile(0, 0)
                .AddPlayer(Guid.NewGuid().ToString(), "Extra"));
        context.Cell(0, 0).OwnerId = hostId;
        context.Cell(0, 0).OwnerName = "Host";
        context.Cell(0, 0).OwnerColor = context.Player(hostId).Color;
        context.Cell(0, 0).Troops = 5;
        context.Player(hostId).CarriedTroops = 3;
        context.Player(hostId).CarriedTroopsSourceQ = 0;
        context.Player(hostId).CarriedTroopsSourceR = 0;
        context.Player(hostId).TerritoryCount = 4;

        var result = sut.UseCenteredGameArea(ServiceTestContext.RoomCode, hostId);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.GameAreaMode.Should().Be(GameAreaMode.Centered);
        context.State.GameAreaPattern.Should().BeNull();
        context.State.GridRadius.Should().Be(8);
        context.State.Grid.Keys.Should().BeEquivalentTo(HexService.Spiral(8).Select(coord => HexService.Key(coord.q, coord.r)));
        context.State.MasterTileQ.Should().BeNull();
        context.State.MasterTileR.Should().BeNull();
        context.Cell(0, 0).OwnerId.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(0);
        context.Player(hostId).CarriedTroops.Should().Be(0);
        context.Player(hostId).TerritoryCount.Should().Be(0);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "GameAreaUpdated" &&
            entry.Message == "The host switched the game area to the centered field." &&
            entry.PlayerId == hostId &&
            entry.PlayerName == "Host");
    }

    [Fact]
    public void UseCenteredGameArea_WithoutMapLocation_StillSucceeds()
    {
        var (context, sut, hostId, _) = CreateSut();
        context.State.MapLat = null;
        context.State.MapLng = null;

        var result = sut.UseCenteredGameArea(ServiceTestContext.RoomCode, hostId);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.HasMapLocation.Should().BeFalse();
        context.State.GridRadius.Should().Be(8);
        context.State.Grid.Should().HaveCount(217);
    }

    [Theory]
    [InlineData("WideFront", 133, 0, 4, 0, 5)]
    [InlineData("TallFront", 133, 4, 0, 5, 0)]
    [InlineData("Crossroads", 133, 6, -5, 6, -3)]
    [InlineData("Starburst", 109, 6, 0, 2, 4)]
    public void SetPatternGameArea_SupportedPatterns_BuildExpectedGrid(
        string pattern,
        int expectedCount,
        int includedQ,
        int includedR,
        int excludedQ,
        int excludedR)
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetPatternGameArea(ServiceTestContext.RoomCode, hostId, pattern);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.GameAreaMode.Should().Be(GameAreaMode.Pattern);
        context.State.GameAreaPattern.Should().Be(Enum.Parse<GameAreaPattern>(pattern));
        context.State.Grid.Should().HaveCount(expectedCount);
        context.State.GridRadius.Should().Be(8);
        context.State.Grid.Should().ContainKey(HexService.Key(includedQ, includedR));
        context.State.Grid.Should().NotContainKey(HexService.Key(excludedQ, excludedR));
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "GameAreaUpdated" &&
            entry.Message == $"The host applied the {pattern} game area pattern." &&
            entry.PlayerId == hostId);
    }

    [Fact]
    public void SetPatternGameArea_WithInvalidPatternName_Fails()
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetPatternGameArea(ServiceTestContext.RoomCode, hostId, "diamond");

        result.state.Should().BeNull();
        result.error.Should().Be("Invalid game area pattern.");
        context.State.GameAreaMode.Should().Be(GameAreaMode.Centered);
    }

    [Fact]
    public void SetCustomGameArea_WithValidCoordinates_CreatesGridAndResetsBoardState()
    {
        var (context, sut, hostId, _) = CreateSut(builder =>
            builder
                .WithGrid(2)
                .WithMasterTile(0, 0));
        context.Cell(0, 0).OwnerId = hostId;
        context.Cell(0, 0).OwnerName = "Host";
        context.Cell(0, 0).OwnerColor = context.Player(hostId).Color;
        context.Cell(0, 0).Troops = 4;
        context.Player(hostId).CarriedTroops = 2;
        context.Player(hostId).CarriedTroopsSourceQ = 0;
        context.Player(hostId).CarriedTroopsSourceR = 0;
        context.Player(hostId).TerritoryCount = 3;
        var coordinates = ConnectedCustomArea();

        var result = sut.SetCustomGameArea(ServiceTestContext.RoomCode, hostId, coordinates);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.GameAreaMode.Should().Be(GameAreaMode.Drawn);
        context.State.GameAreaPattern.Should().BeNull();
        context.State.GridRadius.Should().Be(1);
        context.State.Grid.Keys.Should().BeEquivalentTo(coordinates.Select(coord => HexService.Key(coord.Q, coord.R)));
        context.State.MasterTileQ.Should().BeNull();
        context.State.MasterTileR.Should().BeNull();
        context.State.Grid[HexService.Key(0, 0)].OwnerId.Should().BeNull();
        context.State.Grid[HexService.Key(0, 0)].Troops.Should().Be(0);
        context.Player(hostId).CarriedTroops.Should().Be(0);
        context.Player(hostId).TerritoryCount.Should().Be(0);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "GameAreaUpdated" &&
            entry.Message == "The host drew a custom game area." &&
            entry.PlayerId == hostId);
    }

    [Fact]
    public void SetCustomGameArea_WithNoCoordinates_FailsMinimumTileRequirement()
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetCustomGameArea(ServiceTestContext.RoomCode, hostId, []);

        result.state.Should().BeNull();
        result.error.Should().Be("Draw at least 7 tiles for a custom game area.");
        context.State.GameAreaMode.Should().Be(GameAreaMode.Centered);
    }

    [Fact]
    public void SetCustomGameArea_WithDisconnectedCoordinates_Fails()
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetCustomGameArea(ServiceTestContext.RoomCode, hostId, DisconnectedCustomArea());

        result.state.Should().BeNull();
        result.error.Should().Be("Custom game areas must be one connected shape.");
        context.State.GameAreaMode.Should().Be(GameAreaMode.Centered);
    }

    [Fact]
    public void SetMasterTile_WithGpsInsideGrid_AssignsMasterTile()
    {
        var (context, sut, hostId, _) = CreateSut();
        var (lat, lng) = ServiceTestContext.HexCenter(1, -1);

        var result = sut.SetMasterTile(ServiceTestContext.RoomCode, hostId, lat, lng);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.MasterTileQ.Should().Be(1);
        context.State.MasterTileR.Should().Be(-1);
        context.Cell(1, -1).IsMasterTile.Should().BeTrue();
        context.Cell(1, -1).Troops.Should().Be(1);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "MasterTileAssigned" &&
            entry.Message == "The master tile was assigned to hex (1, -1)." &&
            entry.PlayerId == hostId &&
            entry.Q == 1 &&
            entry.R == -1);
    }

    [Fact]
    public void SetMasterTile_WithGpsOutsideGrid_Fails()
    {
        var (context, sut, hostId, _) = CreateSut();
        var (lat, lng) = HexService.HexToLatLng(2, 0, ServiceTestContext.DefaultMapLat, ServiceTestContext.DefaultMapLng, ServiceTestContext.DefaultTileSizeMeters);

        var result = sut.SetMasterTile(ServiceTestContext.RoomCode, hostId, lat, lng);

        result.state.Should().BeNull();
        result.error.Should().Be("Master tile must be inside the room grid.");
        context.State.MasterTileQ.Should().BeNull();
        context.State.MasterTileR.Should().BeNull();
    }

    [Fact]
    public void SetMasterTile_WithoutMapLocation_UsesProvidedGpsAsMapCenter()
    {
        var (context, sut, hostId, _) = CreateSut();
        context.State.MapLat = null;
        context.State.MapLng = null;

        var result = sut.SetMasterTile(ServiceTestContext.RoomCode, hostId, 51.5007, -0.1246);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.MapLat.Should().Be(51.5007);
        context.State.MapLng.Should().Be(-0.1246);
        context.State.MasterTileQ.Should().Be(0);
        context.State.MasterTileR.Should().Be(0);
        context.Cell(0, 0).IsMasterTile.Should().BeTrue();
    }

    [Fact]
    public void SetMasterTileByHex_WithValidHex_AssignsNewMasterTileAndClearsPreviousOne()
    {
        var (context, sut, hostId, _) = CreateSut(builder =>
            builder
                .WithMasterTile(0, 0)
                .WithTroops(0, 0, 4));

        var result = sut.SetMasterTileByHex(ServiceTestContext.RoomCode, hostId, 1, 0);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.MasterTileQ.Should().Be(1);
        context.State.MasterTileR.Should().Be(0);
        context.Cell(0, 0).IsMasterTile.Should().BeFalse();
        context.Cell(0, 0).Troops.Should().Be(0);
        context.Cell(1, 0).IsMasterTile.Should().BeTrue();
        context.Cell(1, 0).Troops.Should().Be(1);
    }

    [Fact]
    public void SetMasterTileByHex_WhenHexIsNotInGrid_Fails()
    {
        var (context, sut, hostId, _) = CreateSut();

        var result = sut.SetMasterTileByHex(ServiceTestContext.RoomCode, hostId, 2, 0);

        result.state.Should().BeNull();
        result.error.Should().Be("Master tile must be inside the room grid.");
        context.State.MasterTileQ.Should().BeNull();
        context.State.MasterTileR.Should().BeNull();
    }

    private static (ServiceTestContext context, MapAreaService sut, string hostId, string guestId) CreateSut(
        Action<GameStateBuilder>? configure = null)
    {
        var hostId = Guid.NewGuid().ToString();
        var guestId = Guid.NewGuid().ToString();
        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(guestId, "Guest");

        configure?.Invoke(builder);

        var context = new ServiceTestContext(builder.Build());
        context.Room.HostUserId = Guid.Parse(hostId);
        var sut = new MapAreaService(context.RoomProvider.Object, context.GameStateService);
        return (context, sut, hostId, guestId);
    }

    private static IReadOnlyList<HexCoordinateDto> ConnectedCustomArea()
    {
        return HexService.Spiral(1)
            .Select(coord => new HexCoordinateDto { Q = coord.q, R = coord.r })
            .ToList();
    }

    private static IReadOnlyList<HexCoordinateDto> DisconnectedCustomArea()
    {
        return
        [
            new() { Q = 0, R = 0 },
            new() { Q = 1, R = 0 },
            new() { Q = 1, R = -1 },
            new() { Q = 0, R = -1 },
            new() { Q = -1, R = 0 },
            new() { Q = -1, R = 1 },
            new() { Q = 3, R = 0 }
        ];
    }
}
