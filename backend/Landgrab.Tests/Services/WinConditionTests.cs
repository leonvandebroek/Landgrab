using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class WinConditionTests
{
    private static readonly DateTime ReferenceTime = new(2025, 1, 15, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void ApplyWinCondition_GameAlreadyOver_DoesNothing()
    {
        var state = new GameStateBuilder()
            .WithPhase(GamePhase.GameOver)
            .AddPlayer("p1", "Alice")
            .Build();
        state.WinnerId = "existing-winner";
        state.WinnerName = "Alice";

        GameplayService.ApplyWinCondition(state, ReferenceTime);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("existing-winner");
        state.WinnerName.Should().Be("Alice");
    }

    [Fact]
    public void ApplyTerritoryPercentWinCondition_FreeForAllThresholdReached_SetsPlayerWinner()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.TerritoryPercent, 60)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p1")
            .OwnHex(1, -1, "p1")
            .OwnHex(0, -1, "p1")
            .OwnHex(-1, 0, "p1")
            .Build();

        GameplayService.RefreshTerritoryCount(state);
        GameplayService.ApplyTerritoryPercentWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("p1");
        state.WinnerName.Should().Be("Alice");
        state.IsAllianceVictory.Should().BeFalse();
    }

    [Fact]
    public void ApplyTerritoryPercentWinCondition_AllianceThresholdReached_SetsAllianceWinner()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithGameMode(GameMode.Alliances)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.TerritoryPercent, 60)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(1, 0, "p1", "a1")
            .OwnHex(1, -1, "p1", "a1")
            .OwnHex(0, -1, "p1", "a1")
            .OwnHex(-1, 0, "p1", "a1")
            .Build();

        GameplayService.RefreshTerritoryCount(state);
        GameplayService.ApplyTerritoryPercentWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a1");
        state.WinnerName.Should().Be("Alpha");
        state.IsAllianceVictory.Should().BeTrue();
    }

    [Fact]
    public void ApplyTerritoryPercentWinCondition_NoClaimableHexes_LeavesGameRunning()
    {
        var state = new GameStateBuilder()
            .WithGrid(0)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.TerritoryPercent, 60)
            .AddPlayer("p1", "Alice")
            .Build();

        GameplayService.RefreshTerritoryCount(state);
        GameplayService.ApplyTerritoryPercentWinCondition(state);

        state.Phase.Should().Be(GamePhase.Playing);
        state.WinnerId.Should().BeNull();
    }

    [Fact]
    public void ApplyTerritoryPercentWinCondition_AllHexesClaimedWithoutThreshold_PicksTerritoryLeader()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.TerritoryPercent, 80)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p1")
            .OwnHex(1, -1, "p1")
            .OwnHex(0, -1, "p1")
            .OwnHex(-1, 0, "p1")
            .OwnHex(-1, 1, "p2")
            .OwnHex(0, 1, "p2")
            .Build();

        GameplayService.RefreshTerritoryCount(state);
        GameplayService.ApplyTerritoryPercentWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("p1");
        state.WinnerName.Should().Be("Alice");
    }

    [Fact]
    public void ApplyEliminationWinCondition_FreeForAllSingleSurvivor_SetsWinner()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithWinCondition(WinConditionType.Elimination)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .Build();

        GameplayService.RefreshTerritoryCount(state);
        GameplayService.ApplyEliminationWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("p1");
        state.WinnerName.Should().Be("Alice");
        state.IsAllianceVictory.Should().BeFalse();
    }

    [Fact]
    public void ApplyEliminationWinCondition_FreeForAllMultipleSurvivors_LeavesGameRunning()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithWinCondition(WinConditionType.Elimination)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p2")
            .Build();

        GameplayService.RefreshTerritoryCount(state);
        GameplayService.ApplyEliminationWinCondition(state);

        state.Phase.Should().Be(GamePhase.Playing);
        state.WinnerId.Should().BeNull();
    }

    [Fact]
    public void ApplyEliminationWinCondition_AllianceSingleSurvivor_SetsAllianceWinner()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithGameMode(GameMode.Alliances)
            .WithWinCondition(WinConditionType.Elimination)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1")
            .Build();

        GameplayService.RefreshTerritoryCount(state);
        GameplayService.ApplyEliminationWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a1");
        state.WinnerName.Should().Be("Alpha");
        state.IsAllianceVictory.Should().BeTrue();
    }

    [Fact]
    public void ApplyWinCondition_TimedGameExpired_SetsTerritoryLeaderAsWinner()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithTimedGame(10, ReferenceTime.AddMinutes(-10))
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p1")
            .OwnHex(1, -1, "p2")
            .Build();

        GameplayService.ApplyWinCondition(state, ReferenceTime);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("p1");
        state.WinnerName.Should().Be("Alice");
    }

    [Fact]
    public void ApplyWinCondition_TimedGameNotExpired_LeavesGameRunning()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithTimedGame(10, ReferenceTime.AddMinutes(-9))
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .Build();

        GameplayService.ApplyWinCondition(state, ReferenceTime);

        state.Phase.Should().Be(GamePhase.Playing);
        state.WinnerId.Should().BeNull();
    }

    [Fact]
    public void TrySetTerritoryLeaderAsWinner_PlayerTie_BreaksTieAlphabetically()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .AddPlayer("p1", "Zulu")
            .AddPlayer("p2", "Alpha")
            .OwnHex(0, 0, "p1")
            .OwnHex(1, 0, "p2")
            .Build();

        GameplayService.RefreshTerritoryCount(state);

        var result = GameplayService.TrySetTerritoryLeaderAsWinner(state);

        result.Should().BeTrue();
        state.WinnerId.Should().Be("p2");
        state.WinnerName.Should().Be("Alpha");
        state.IsAllianceVictory.Should().BeFalse();
    }

    [Fact]
    public void TrySetTerritoryLeaderAsWinner_NoPlayersOrAlliances_ReturnsFalse()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .Build();

        var result = GameplayService.TrySetTerritoryLeaderAsWinner(state);

        result.Should().BeFalse();
        state.WinnerId.Should().BeNull();
        state.WinnerName.Should().BeNull();
    }


    [Fact]
    public void ApplyTerritoryPercentWinCondition_AtExactThreshold_SetsWinner()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.TerritoryPercent, 50)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p1")
            .OwnHex(1, -1, "p1")
            .OwnHex(0, -1, "p1")
            .Build();
        var service = new WinConditionService();

        service.RefreshTerritoryCount(state);
        service.ApplyTerritoryPercentWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("p1");
        state.WinnerName.Should().Be("Alice");
    }

    [Fact]
    public void ApplyTerritoryPercentWinCondition_AlliancesCompetingNearThreshold_SelectsAllianceThatMeetsBoundary()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithGameMode(GameMode.Alliances)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.TerritoryPercent, 50)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddPlayer("p3", "Cara", "a2")
            .AddPlayer("p4", "Dylan", "a2")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .AddAlliance("a2", "Beta", "p3", "p4")
            .OwnHex(1, 0, "p1", "a1")
            .OwnHex(1, -1, "p2", "a1")
            .OwnHex(0, -1, "p3", "a2")
            .OwnHex(-1, 0, "p4", "a2")
            .OwnHex(-1, 1, "p3", "a2")
            .Build();
        var service = new WinConditionService();

        service.RefreshTerritoryCount(state);
        service.ApplyTerritoryPercentWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a2");
        state.WinnerName.Should().Be("Beta");
        state.IsAllianceVictory.Should().BeTrue();
    }

    [Fact]
    public void ApplyEliminationWinCondition_WhenAllPlayersInOneAllianceLoseTerritory_SetsRemainingAllianceWinner()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithGameMode(GameMode.Alliances)
            .WithWinCondition(WinConditionType.Elimination)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddPlayer("p3", "Cara", "a2")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .AddAlliance("a2", "Beta", "p3")
            .OwnHex(0, 0, "p3", "a2")
            .Build();
        var service = new WinConditionService();

        service.RefreshTerritoryCount(state);
        service.ApplyEliminationWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a2");
        state.WinnerName.Should().Be("Beta");
    }

    [Fact]
    public void ApplyEliminationWinCondition_PlayerWithNoHexesButStillCarryingTroops_IsStillEliminated()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithWinCondition(WinConditionType.Elimination)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .WithCarriedTroops("p2", 5)
            .Build();
        var service = new WinConditionService();

        service.RefreshTerritoryCount(state);
        service.ApplyEliminationWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("p1");
        state.WinnerName.Should().Be("Alice");
    }

    [Fact]
    public void ApplyWinCondition_TimedGameOneSecondBeforeAndAfterExpiry_UsesBoundary()
    {
        var beforeExpiryState = new GameStateBuilder()
            .WithGrid(1)
            .WithTimedGame(10, ReferenceTime.AddMinutes(-10).AddSeconds(1))
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .Build();
        var afterExpiryState = new GameStateBuilder()
            .WithGrid(1)
            .WithTimedGame(10, ReferenceTime.AddMinutes(-10).AddSeconds(-1))
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1")
            .Build();
        var service = new WinConditionService();

        service.ApplyWinCondition(beforeExpiryState, ReferenceTime);
        service.ApplyWinCondition(afterExpiryState, ReferenceTime);

        beforeExpiryState.Phase.Should().Be(GamePhase.Playing);
        beforeExpiryState.WinnerId.Should().BeNull();
        afterExpiryState.Phase.Should().Be(GamePhase.GameOver);
        afterExpiryState.WinnerId.Should().Be("p1");
    }

    [Fact]
    public void ApplyWinCondition_TimedAllianceTie_PicksAlphabeticallyFirstAlliance()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithGameMode(GameMode.Alliances)
            .WithTimedGame(10, ReferenceTime.AddMinutes(-10))
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1")
            .OwnHex(1, 0, "p2", "a2")
            .Build();
        var service = new WinConditionService();

        service.ApplyWinCondition(state, ReferenceTime);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a1");
        state.WinnerName.Should().Be("Alpha");
        state.IsAllianceVictory.Should().BeTrue();
    }

    [Fact]
    public void ComputeAchievements_CalculatesExpectedAwards()
    {
        var state = new GameStateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .AddPlayer("p3", "Cara")
            .OwnHex(0, 0, "p1", troops: 3)
            .OwnHex(1, 0, "p1", troops: 2)
            .OwnHex(1, -1, "p2", troops: 1)
            .Build();
        state.EventLog.Add(new GameEventLogEntry
        {
            Type = "TileCaptured",
            PlayerId = "p2",
            PlayerName = "Bob",
            CreatedAt = ReferenceTime.AddMinutes(-5)
        });
        state.EventLog.Add(new GameEventLogEntry
        {
            Type = "TileCaptured",
            PlayerId = "p2",
            PlayerName = "Bob",
            CreatedAt = ReferenceTime.AddMinutes(-4)
        });
        state.EventLog.Add(new GameEventLogEntry
        {
            Type = "TileCaptured",
            PlayerId = "p1",
            PlayerName = "Alice",
            CreatedAt = ReferenceTime.AddMinutes(-3)
        });
        var service = new WinConditionService();

        service.RefreshTerritoryCount(state);
        service.ComputeAchievements(state);

        state.Achievements.Should().BeEquivalentTo(
            [
                new Achievement
                {
                    Id = "territoryLeader",
                    PlayerId = "p1",
                    PlayerName = "Alice",
                    TitleKey = "achievement.territoryLeader",
                    Value = "2"
                },
                new Achievement
                {
                    Id = "armyCommander",
                    PlayerId = "p1",
                    PlayerName = "Alice",
                    TitleKey = "achievement.armyCommander",
                    Value = "5"
                },
                new Achievement
                {
                    Id = "conqueror",
                    PlayerId = "p2",
                    PlayerName = "Bob",
                    TitleKey = "achievement.conqueror",
                    Value = "2"
                },
                new Achievement
                {
                    Id = "firstStrike",
                    PlayerId = "p2",
                    PlayerName = "Bob",
                    TitleKey = "achievement.firstStrike"
                }
            ],
            options => options.WithoutStrictOrdering());
    }

    [Fact]
    public void RefreshTerritoryCount_WithMixedOwnership_UpdatesPlayersAndAlliancesAccurately()
    {
        var state = new GameStateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddPlayer("p3", "Cara")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1")
            .OwnHex(1, 0, "p1", "a1")
            .OwnHex(1, -1, "p2", "a2")
            .OwnHex(0, -1, "p3")
            .Build();
        var service = new WinConditionService();

        service.RefreshTerritoryCount(state);

        state.Players.Single(player => player.Id == "p1").TerritoryCount.Should().Be(2);
        state.Players.Single(player => player.Id == "p2").TerritoryCount.Should().Be(1);
        state.Players.Single(player => player.Id == "p3").TerritoryCount.Should().Be(1);
        state.Alliances.Single(alliance => alliance.Id == "a1").TerritoryCount.Should().Be(2);
        state.Alliances.Single(alliance => alliance.Id == "a2").TerritoryCount.Should().Be(1);
    }

}
