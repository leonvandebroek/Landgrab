using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class DuelServiceTests
{
    [Fact]
    public void InitiateDuel_WhenModeEnabledAndPlayersColocated_CreatesPendingDuel()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Duel)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeCreation = DateTime.UtcNow;

        var duel = context.DuelService.InitiateDuel(ServiceTestContext.RoomCode, "p1", "p2", 0, 0);

        duel.Should().NotBeNull();
        duel!.PlayerIds.Should().Equal("p1", "p2");
        duel.TileQ.Should().Be(0);
        duel.TileR.Should().Be(0);
        duel.ExpiresAt.Should().BeCloseTo(beforeCreation.AddSeconds(30), TimeSpan.FromSeconds(10));
        context.Room.PendingDuels.Should().ContainKey(duel.Id);
    }

    [Fact]
    public void InitiateDuel_WhenModeDisabled_ReturnsNull()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var duel = context.DuelService.InitiateDuel(ServiceTestContext.RoomCode, "p1", "p2", 0, 0);

        duel.Should().BeNull();
        context.Room.PendingDuels.Should().BeEmpty();
    }

    [Fact]
    public void InitiateDuel_WhenPlayersAreNotColocated_ReturnsNull()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Duel)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var duel = context.DuelService.InitiateDuel(ServiceTestContext.RoomCode, "p1", "p2", 0, 0);

        duel.Should().BeNull();
        context.Room.PendingDuels.Should().BeEmpty();
    }

    [Fact]
    public void InitiateDuel_WhenEitherPlayerAlreadyHasPendingDuel_ReturnsNull()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Duel)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .AddPlayer("p3", "Cara")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithPlayerPosition("p3", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        context.Room.PendingDuels["existing"] = new PendingDuel
        {
            Id = "existing",
            PlayerIds = ["p1", "p3"],
            TileQ = 0,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(30)
        };

        var duel = context.DuelService.InitiateDuel(ServiceTestContext.RoomCode, "p1", "p2", 0, 0);

        duel.Should().BeNull();
        context.Room.PendingDuels.Should().ContainSingle();
    }

    [Fact]
    public void ResolveDuel_WithAcceptance_WinnerCapturesTerritory()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p2")
            .WithTroops(1, 0, 2)
            .Build();
        state.Players.Single(player => player.Id == "p1").TerritoryCount = 10;
        state.Players.Single(player => player.Id == "p1").CarriedTroops = 5;
        state.Players.Single(player => player.Id == "p2").TerritoryCount = 0;
        state.Players.Single(player => player.Id == "p2").CarriedTroops = 0;
        var context = new ServiceTestContext(state);
        var duel = new PendingDuel
        {
            Id = "duel1234",
            PlayerIds = ["p1", "p2"],
            TileQ = 1,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(30)
        };
        context.Room.PendingDuels[duel.Id] = duel;

        var result = context.DuelService.ResolveDuel(ServiceTestContext.RoomCode, duel.Id, accepted: true);

        result.success.Should().BeTrue();
        result.winnerId.Should().Be("p1");
        result.loserId.Should().Be("p2");
        context.Room.PendingDuels.Should().NotContainKey(duel.Id);
        context.Cell(1, 0).OwnerId.Should().Be("p1");
        context.Cell(1, 0).Troops.Should().BeGreaterThanOrEqualTo(1);
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "DuelResult" && entry.PlayerId == "p1");
    }

    [Fact]
    public void ResolveDuel_WithDecline_DoesNotChangeTerritory()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p2")
            .WithTroops(1, 0, 2)
            .Build();
        var context = new ServiceTestContext(state);
        var duel = new PendingDuel
        {
            Id = "duel1234",
            PlayerIds = ["p1", "p2"],
            TileQ = 1,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(30)
        };
        context.Room.PendingDuels[duel.Id] = duel;

        var result = context.DuelService.ResolveDuel(ServiceTestContext.RoomCode, duel.Id, accepted: false);

        result.success.Should().BeFalse();
        result.winnerId.Should().BeNull();
        result.loserId.Should().BeNull();
        context.Room.PendingDuels.Should().NotContainKey(duel.Id);
        context.Cell(1, 0).OwnerId.Should().Be("p2");
        context.State.EventLog.Should().NotContain(entry => entry.Type == "DuelResult");
    }

    [Fact]
    public void ResolveDuel_WhenExpired_ReturnsFailureAndLeavesTerritoryUnchanged()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p2")
            .WithTroops(1, 0, 2)
            .Build();
        var context = new ServiceTestContext(state);
        var duel = new PendingDuel
        {
            Id = "expired1",
            PlayerIds = ["p1", "p2"],
            TileQ = 1,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(-1)
        };
        context.Room.PendingDuels[duel.Id] = duel;

        var result = context.DuelService.ResolveDuel(ServiceTestContext.RoomCode, duel.Id, accepted: true);

        result.success.Should().BeFalse();
        result.winnerId.Should().BeNull();
        result.loserId.Should().BeNull();
        context.Room.PendingDuels.Should().NotContainKey(duel.Id);
        context.Cell(1, 0).OwnerId.Should().Be("p2");
    }

    [Fact]
    public void DetainPlayer_WhenPlayersShareHex_Succeeds()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Hostage)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        var beforeDetain = DateTime.UtcNow;

        var result = context.DuelService.DetainPlayer(ServiceTestContext.RoomCode, "p1", "p2");

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        context.Player("p2").HeldByPlayerId.Should().Be("p1");
        context.Player("p2").HeldUntil.Should().BeCloseTo(beforeDetain.AddMinutes(3), TimeSpan.FromSeconds(10));
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "Hostage" && entry.PlayerId == "p1" && entry.TargetPlayerId == "p2");
    }

    [Fact]
    public void DetainPlayer_WhenPlayersAreNotColocated_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Hostage)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.DuelService.DetainPlayer(ServiceTestContext.RoomCode, "p1", "p2");

        result.state.Should().BeNull();
        result.error.Should().Be("Target must be in the same hex.");
        context.Player("p2").HeldByPlayerId.Should().BeNull();
    }

    [Fact]
    public void DetainPlayer_WhenTargetIsAllied_Fails()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Hostage)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.DuelService.DetainPlayer(ServiceTestContext.RoomCode, "p1", "p2");

        result.state.Should().BeNull();
        result.error.Should().Be("Cannot detain an allied player.");
        context.Player("p2").HeldByPlayerId.Should().BeNull();
    }
}
