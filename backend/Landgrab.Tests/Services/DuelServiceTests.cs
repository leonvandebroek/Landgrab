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


    [Fact]
    public void InitiateDuel_WhenBothPlayersAlreadyHaveDifferentPendingDuels_ReturnsNull()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Duel)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .AddPlayer("p3", "Cara")
            .AddPlayer("p4", "Dylan")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithPlayerPosition("p3", 0, 0)
            .WithPlayerPosition("p4", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);
        context.Room.PendingDuels["duel-a"] = new PendingDuel
        {
            Id = "duel-a",
            PlayerIds = ["p1", "p3"],
            TileQ = 0,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(30)
        };
        context.Room.PendingDuels["duel-b"] = new PendingDuel
        {
            Id = "duel-b",
            PlayerIds = ["p2", "p4"],
            TileQ = 0,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(30)
        };

        var duel = context.DuelService.InitiateDuel(ServiceTestContext.RoomCode, "p1", "p2", 0, 0);

        duel.Should().BeNull();
        context.Room.PendingDuels.Keys.Should().BeEquivalentTo(["duel-a", "duel-b"]);
    }

    [Fact]
    public void ResolveDuel_WhenWinnerHasLargeScoreAdvantage_CapturesOnlyTheDuelHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p2")
            .OwnHex(1, -1, "p2")
            .Build();
        state.Players.Single(player => player.Id == "p1").TerritoryCount = 10;
        state.Players.Single(player => player.Id == "p1").CarriedTroops = 10;
        state.Players.Single(player => player.Id == "p2").TerritoryCount = 0;
        state.Players.Single(player => player.Id == "p2").CarriedTroops = 0;
        var context = new ServiceTestContext(state);
        var duel = new PendingDuel
        {
            Id = "duel-only-hex",
            PlayerIds = ["p1", "p2"],
            TileQ = 1,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(30)
        };
        context.Room.PendingDuels[duel.Id] = duel;

        var result = context.DuelService.ResolveDuel(ServiceTestContext.RoomCode, duel.Id, accepted: true);
        context.WinConditionService.RefreshTerritoryCount(context.State);

        result.success.Should().BeTrue();
        result.winnerId.Should().Be("p1");
        context.Cell(1, 0).OwnerId.Should().Be("p1");
        context.Cell(1, -1).OwnerId.Should().Be("p2");
        context.Player("p1").TerritoryCount.Should().Be(2);
        context.Player("p2").TerritoryCount.Should().Be(1);
    }

    [Fact]
    public void ResolveDuel_WhenScoreGapExceedsMaxRollDifference_HigherBaseScoreAlwaysWins()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p2")
            .Build();
        state.Players.Single(player => player.Id == "p1").TerritoryCount = 20;
        state.Players.Single(player => player.Id == "p1").CarriedTroops = 10;
        state.Players.Single(player => player.Id == "p2").TerritoryCount = 0;
        state.Players.Single(player => player.Id == "p2").CarriedTroops = 0;
        var context = new ServiceTestContext(state);
        var duel = new PendingDuel
        {
            Id = "duel-gap",
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
    }

    [Fact]
    public void DetainPlayer_SetsHeldUntilAboutThreeMinutesFromNow()
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
        context.Player("p2").HeldUntil.Should().BeCloseTo(beforeDetain.AddMinutes(3), TimeSpan.FromSeconds(10));
        result.state!.Players.Single(player => player.Id == "p2").HeldByPlayerId.Should().Be("p1");
    }

    [Fact]
    public void DetainedPlayer_CannotPlaceTroops()
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
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);

        var detainResult = context.DuelService.DetainPlayer(ServiceTestContext.RoomCode, "p2", "p1");
        var placeResult = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 0, 0, lat, lng);

        detainResult.error.Should().BeNull();
        placeResult.state.Should().BeNull();
        placeResult.error.Should().Be("You are detained and cannot take actions.");
    }

    [Fact]
    public void ProcessHostageReleases_WhenCalledBeforeAndAfterExpiry_UsesStrictBoundary()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Hostage)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        state.Players.Single(player => player.Id == "p1").HeldByPlayerId = "p2";
        state.Players.Single(player => player.Id == "p1").HeldUntil = DateTime.UtcNow.AddMilliseconds(200);
        var context = new ServiceTestContext(state);

        context.DuelService.ProcessHostageReleases(context.Room);

        context.Player("p1").HeldByPlayerId.Should().Be("p2");
        context.Player("p1").HeldUntil.Should().NotBeNull();

        System.Threading.Thread.Sleep(300);
        context.DuelService.ProcessHostageReleases(context.Room);

        context.Player("p1").HeldByPlayerId.Should().BeNull();
        context.Player("p1").HeldUntil.Should().BeNull();
        context.State.EventLog.Should().Contain(entry => entry.Type == "HostageReleased" && entry.PlayerId == "p1");
    }

    [Fact]
    public void ProcessHostageReleases_WhenMultiplePlayersExpire_ReleasesAllInOnePass()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithCopresenceModes(CopresenceMode.Hostage)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .AddPlayer("p3", "Cara")
            .Build();
        state.Players.Single(player => player.Id == "p1").HeldByPlayerId = "p2";
        state.Players.Single(player => player.Id == "p1").HeldUntil = DateTime.UtcNow.AddSeconds(-1);
        state.Players.Single(player => player.Id == "p3").HeldByPlayerId = "p2";
        state.Players.Single(player => player.Id == "p3").HeldUntil = DateTime.UtcNow.AddSeconds(-1);
        var context = new ServiceTestContext(state);

        context.DuelService.ProcessHostageReleases(context.Room);

        context.Player("p1").HeldByPlayerId.Should().BeNull();
        context.Player("p3").HeldByPlayerId.Should().BeNull();
        context.State.EventLog.Should().Contain(entry => entry.Type == "HostageReleased" && entry.PlayerId == "p1");
        context.State.EventLog.Should().Contain(entry => entry.Type == "HostageReleased" && entry.PlayerId == "p3");
    }

    [Fact]
    public void ProcessDuelExpiry_WhenCalledBeforeAndAfterExpiry_UsesStrictBoundary()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .Build();
        var context = new ServiceTestContext(state);
        context.Room.PendingDuels["boundary"] = new PendingDuel
        {
            Id = "boundary",
            PlayerIds = ["p1", "p2"],
            TileQ = 0,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddMilliseconds(200)
        };

        context.DuelService.ProcessDuelExpiry(context.Room);

        context.Room.PendingDuels.Should().ContainKey("boundary");

        System.Threading.Thread.Sleep(300);
        context.DuelService.ProcessDuelExpiry(context.Room);

        context.Room.PendingDuels.Should().NotContainKey("boundary");
    }

    [Fact]
    public void ProcessDuelExpiry_WhenMultipleDuelsHaveExpired_RemovesAllExpiredEntries()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .AddPlayer("p3", "Cara")
            .Build();
        var context = new ServiceTestContext(state);
        context.Room.PendingDuels["expired-1"] = new PendingDuel
        {
            Id = "expired-1",
            PlayerIds = ["p1", "p2"],
            TileQ = 0,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(-1)
        };
        context.Room.PendingDuels["expired-2"] = new PendingDuel
        {
            Id = "expired-2",
            PlayerIds = ["p2", "p3"],
            TileQ = 0,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(-1)
        };
        context.Room.PendingDuels["active"] = new PendingDuel
        {
            Id = "active",
            PlayerIds = ["p1", "p3"],
            TileQ = 0,
            TileR = 0,
            ExpiresAt = DateTime.UtcNow.AddSeconds(30)
        };

        context.DuelService.ProcessDuelExpiry(context.Room);

        context.Room.PendingDuels.Keys.Should().BeEquivalentTo(["active"]);
    }

}
