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
}
