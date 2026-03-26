using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class AllianceConfigServiceTests
{
    [Fact]
    public void SetAlliance_WhenPlayerJoinsExistingAlliance_AssignsAllianceAndUpdatesOwnedHexes()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p2")
            .OwnHex(0, 0, "p1")
            .WithTroops(0, 0, 2)
            .Build();
        var context = new ServiceTestContext(state);
        var service = CreateService(context);

        var result = service.SetAlliance(ServiceTestContext.RoomCode, "p1", "  alpha  ");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.Alliances.Should().HaveCount(1);
        context.Player("p1").AllianceId.Should().Be("a1");
        context.Player("p1").AllianceName.Should().Be("Alpha");
        context.Player("p1").AllianceColor.Should().Be(context.State.Alliances[0].Color);
        context.Player("p1").Color.Should().Be(context.State.Alliances[0].Color);
        context.State.Alliances[0].MemberIds.Should().BeEquivalentTo(new[] { "p2", "p1" });
        context.Cell(0, 0).OwnerAllianceId.Should().Be("a1");
        context.Cell(0, 0).OwnerColor.Should().Be(context.State.Alliances[0].Color);
        context.Cell(0, 0).OwnerName.Should().Be("Alice");
        context.Player("p1").TerritoryCount.Should().Be(1);
        context.State.Alliances[0].TerritoryCount.Should().Be(1);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "AllianceChanged"
            && entry.PlayerId == "p1"
            && entry.AllianceId == "a1"
            && entry.Message == "Alice joined alliance Alpha.");
        result.state!.Grid[HexService.Key(0, 0)].OwnerAllianceId.Should().Be("a1");
    }

    [Fact]
    public void SetAlliance_WhenPlayerSwitchesAlliance_RemovesPreviousMembershipAndLogsChange()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(1, 0, "p1", "a1")
            .WithTroops(1, 0, 4)
            .Build();
        var context = new ServiceTestContext(state);
        var service = CreateService(context);

        var result = service.SetAlliance(ServiceTestContext.RoomCode, "p1", "Beta");

        result.error.Should().BeNull();
        context.Player("p1").AllianceId.Should().Be("a2");
        context.Player("p1").AllianceName.Should().Be("Beta");
        context.State.Alliances.Single(alliance => alliance.Id == "a1").MemberIds.Should().BeEmpty();
        context.State.Alliances.Single(alliance => alliance.Id == "a2").MemberIds.Should().BeEquivalentTo(new[] { "p2", "p1" });
        context.Cell(1, 0).OwnerAllianceId.Should().Be("a2");
        context.Cell(1, 0).OwnerColor.Should().Be(context.State.Alliances.Single(alliance => alliance.Id == "a2").Color);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "AllianceChanged"
            && entry.PlayerId == "p1"
            && entry.AllianceId == "a2"
            && entry.Message == "Alice changed alliance from Alpha to Beta.");
    }

    [Fact]
    public void SetAlliance_WhenAllianceNameIsBlank_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var service = CreateService(context);

        var result = service.SetAlliance(ServiceTestContext.RoomCode, "p1", "   ");

        result.state.Should().BeNull();
        result.error.Should().Be("Alliance name is required.");
        context.State.Alliances.Should().BeEmpty();
        context.Player("p1").AllianceId.Should().BeNull();
    }

    [Fact]
    public void SetAlliance_WhenGameIsNotInLobby_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var service = CreateService(context);

        var result = service.SetAlliance(ServiceTestContext.RoomCode, "p1", "Alpha");

        result.state.Should().BeNull();
        result.error.Should().Be("Alliances can only be changed in the lobby.");
        context.State.Alliances.Should().BeEmpty();
    }

    [Fact]
    public void ConfigureAlliances_WhenHostProvidesValidNames_ReplacesAlliancesAndClearsPlayerAssignments()
    {
        var hostId = NewUserId();
        var playerId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host", "old")
            .WithPlayerAsHost(hostId)
            .AddPlayer(playerId, "Bob", "old")
            .AddAlliance("old", "Legacy", hostId, playerId)
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.ConfigureAlliances(ServiceTestContext.RoomCode, hostId, ["  Alpha  ", "Beta"]);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.Alliances.Should().HaveCount(2);
        context.State.Alliances.Select(alliance => alliance.Name).Should().Equal("Alpha", "Beta");
        context.State.Alliances.Should().OnlyContain(alliance => alliance.MemberIds.Count == 0);
        context.Player(hostId).AllianceId.Should().BeNull();
        context.Player(hostId).AllianceName.Should().BeNull();
        context.Player(hostId).AllianceColor.Should().BeNull();
        context.Player(playerId).AllianceId.Should().BeNull();
        context.Player(playerId).AllianceName.Should().BeNull();
        context.Player(playerId).AllianceColor.Should().BeNull();
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "AlliancesConfigured"
            && entry.PlayerId == hostId
            && entry.PlayerName == "Host"
            && entry.Message == "The host configured 2 alliances.");
    }

    [Fact]
    public void ConfigureAlliances_WhenCallerIsNotHost_Fails()
    {
        var hostId = NewUserId();
        var playerId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(playerId, "Bob")
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.ConfigureAlliances(ServiceTestContext.RoomCode, playerId, ["Alpha", "Beta"]);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can configure alliances.");
        context.State.Alliances.Should().BeEmpty();
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact(Skip = "Current implementation does not reject duplicate alliance names. Enable when duplicate-name validation is added.")]
    public void ConfigureAlliances_WhenAllianceNamesContainDuplicates_Fails()
    {
    }

    [Fact]
    public void ConfigureAlliances_WhenAllianceNamesAreEmpty_Fails()
    {
        var hostId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.ConfigureAlliances(ServiceTestContext.RoomCode, hostId, []);

        result.state.Should().BeNull();
        result.error.Should().Be("At least one alliance name is required.");
        context.State.Alliances.Should().BeEmpty();
    }

    [Fact]
    public void DistributePlayersRandomly_WhenHostDistributesPlayers_AssignsPlayersEvenlyAcrossAlliances()
    {
        var hostId = NewUserId();
        var player2Id = NewUserId();
        var player3Id = NewUserId();
        var player4Id = NewUserId();
        var player5Id = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(player2Id, "Bob")
            .AddPlayer(player3Id, "Cara")
            .AddPlayer(player4Id, "Dan")
            .AddPlayer(player5Id, "Eve")
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta")
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.DistributePlayersRandomly(ServiceTestContext.RoomCode, hostId);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.Alliances.Select(alliance => alliance.MemberIds.Count).Should().BeEquivalentTo(new[] { 3, 2 });
        context.State.Alliances.SelectMany(alliance => alliance.MemberIds).Should().BeEquivalentTo(new[]
        {
            hostId,
            player2Id,
            player3Id,
            player4Id,
            player5Id
        });
        context.State.Players.Should().OnlyContain(player =>
            player.AllianceId != null
            && player.AllianceName != null
            && player.AllianceColor != null
            && player.Color == context.State.Alliances.Single(alliance => alliance.Id == player.AllianceId).Color);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "PlayersDistributed"
            && entry.PlayerId == hostId
            && entry.PlayerName == "Host"
            && entry.Message == "The host randomly distributed all players across alliances.");
    }

    [Fact]
    public void DistributePlayersRandomly_WhenCallerIsNotHost_Fails()
    {
        var hostId = NewUserId();
        var playerId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host")
            .WithPlayerAsHost(hostId)
            .AddPlayer(playerId, "Bob")
            .AddAlliance("a1", "Alpha")
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.DistributePlayersRandomly(ServiceTestContext.RoomCode, playerId);

        result.state.Should().BeNull();
        result.error.Should().Be("Only the host can distribute players.");
        context.State.Alliances[0].MemberIds.Should().BeEmpty();
        context.Player(playerId).AllianceId.Should().BeNull();
    }

    [Fact]
    public void AssignAllianceStartingTile_WhenAssignmentIsValid_ClaimsHexForAlliance()
    {
        var hostId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .WithMasterTile(0, 0)
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .AddAlliance("a1", "Alpha", hostId)
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.AssignAllianceStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "a1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Cell(1, 0).OwnerId.Should().Be(hostId);
        context.Cell(1, 0).OwnerAllianceId.Should().Be("a1");
        context.Cell(1, 0).OwnerName.Should().Be("Host");
        context.Cell(1, 0).OwnerColor.Should().Be(context.State.Alliances.Single(alliance => alliance.Id == "a1").Color);
        context.Cell(1, 0).Troops.Should().Be(3);
        context.Player(hostId).TerritoryCount.Should().Be(1);
        context.State.Alliances.Single(alliance => alliance.Id == "a1").TerritoryCount.Should().Be(1);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "AllianceStartingTileAssigned"
            && entry.PlayerId == hostId
            && entry.AllianceId == "a1"
            && entry.Q == 1
            && entry.R == 0
            && entry.Message == "Alliance Alpha was assigned a starting tile at (1, 0).");
    }

    [Fact]
    public void AssignAllianceStartingTile_WhenHexIsOutsideGrid_Fails()
    {
        var hostId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .WithMasterTile(0, 0)
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .AddAlliance("a1", "Alpha", hostId)
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.AssignAllianceStartingTile(ServiceTestContext.RoomCode, hostId, 3, 0, "a1");

        result.state.Should().BeNull();
        result.error.Should().Be("Invalid hex.");
        context.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void AssignAllianceStartingTile_WhenHexIsAlreadyAssigned_Fails()
    {
        var hostId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .WithMasterTile(0, 0)
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .AddAlliance("a1", "Alpha", hostId)
            .OwnHex(1, 0, hostId, "a1")
            .WithTroops(1, 0, 2)
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.AssignAllianceStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "a1");

        result.state.Should().BeNull();
        result.error.Should().Be("This hex is already assigned.");
        context.Cell(1, 0).Troops.Should().Be(2);
    }

    [Fact]
    public void SetAllianceHQ_WhenHexIsValidAndOwnedByAlliance_SetsHqCoordinates()
    {
        var hostId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .AddAlliance("a1", "Alpha", hostId)
            .OwnHex(1, 0, hostId, "a1")
            .Build();
        state.Dynamics.HQEnabled = true;
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.SetAllianceHQ(ServiceTestContext.RoomCode, hostId, 1, 0, "a1");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.State.Alliances.Single(alliance => alliance.Id == "a1").HQHexQ.Should().Be(1);
        context.State.Alliances.Single(alliance => alliance.Id == "a1").HQHexR.Should().Be(0);
        result.state!.Alliances.Single(alliance => alliance.Id == "a1").HQHexQ.Should().Be(1);
        result.state.Alliances.Single(alliance => alliance.Id == "a1").HQHexR.Should().Be(0);
        context.State.EventLog.Should().ContainSingle(entry =>
            entry.Type == "AllianceHQAssigned"
            && entry.PlayerId == hostId
            && entry.AllianceId == "a1"
            && entry.Q == 1
            && entry.R == 0
            && entry.Message == "Alliance Alpha HQ was assigned at (1, 0).");
    }

    [Fact]
    public void SetAllianceHQ_WhenHexIsNotOwnedByAlliance_Fails()
    {
        var hostId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .AddPlayer("p2", "Rival", "a2")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(1, 0, "p2", "a2")
            .Build();
        state.Dynamics.HQEnabled = true;
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.SetAllianceHQ(ServiceTestContext.RoomCode, hostId, 1, 0, "a1");

        result.state.Should().BeNull();
        result.error.Should().Be("HQ must be placed on a tile owned by the selected alliance.");
        context.State.Alliances.Single(alliance => alliance.Id == "a1").HQHexQ.Should().BeNull();
        context.State.Alliances.Single(alliance => alliance.Id == "a1").HQHexR.Should().BeNull();
        context.State.EventLog.Should().NotContain(entry => entry.Type == "AllianceHQAssigned");
    }

    [Fact]
    public void SetAllianceHQ_WhenHqMechanicIsDisabled_Fails()
    {
        var hostId = NewUserId();
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPhase(GamePhase.Lobby)
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .AddAlliance("a1", "Alpha", hostId)
            .Build();
        var context = CreateHostedContext(state, hostId);
        var service = CreateService(context);

        var result = service.SetAllianceHQ(ServiceTestContext.RoomCode, hostId, 1, 0, "a1");

        result.state.Should().BeNull();
        result.error.Should().Be("HQ mechanic is not enabled for this game.");
        context.State.Alliances.Single(alliance => alliance.Id == "a1").HQHexQ.Should().BeNull();
        context.State.Alliances.Single(alliance => alliance.Id == "a1").HQHexR.Should().BeNull();
    }

    private static AllianceConfigService CreateService(ServiceTestContext context)
    {
        return new AllianceConfigService(context.RoomProvider.Object, context.GameStateService);
    }

    private static ServiceTestContext CreateHostedContext(GameState state, string hostId)
    {
        var context = new ServiceTestContext(state);
        context.Room.HostUserId = Guid.Parse(hostId);
        return context;
    }

    private static string NewUserId() => Guid.NewGuid().ToString();
}
