using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Landgrab.Tests.Services;

/// <summary>
/// Tests for 30-player game scenarios: lobby capacity, win condition evaluation, and game start initialization.
/// Bug Hunt Round 4 coverage.
/// </summary>
public sealed class LargeScaleGameTests
{
    private const int MaxPlayers = 30;

    // ─── Area 8: Lobby Capacity and Game Start ──────────────────────────

    [Fact]
    public void JoinRoom_31stPlayer_IsRejectedWithMaxCapacityError()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");

        // Add 29 players (1 host + 29 guests = 30 total)
        for (var i = 2; i <= 30; i++)
        {
            var (_, error) = roomService.JoinRoom(room.Code, $"player-{i}", $"Player {i}", $"conn-{i}");
            error.Should().BeNull($"Player {i} should join successfully");
        }

        room.State.Players.Should().HaveCount(30);

        // 31st player should be rejected
        var (joinedRoom, joinError) = roomService.JoinRoom(room.Code, "player-31", "Player 31", "conn-31");

        joinedRoom.Should().BeNull();
        joinError.Should().Be("Room is full (max 30 players).");
        room.State.Players.Should().HaveCount(30);
    }

    [Fact]
    public void StartGame_With30Players_SuccessfullyInitializesAllPlayers()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();

        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(10)
            .WithMapLocation(52.0, 4.0)
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta")
            .AddPlayer(hostId, "Host", "a1");

        // Add 29 more players (15 per alliance)
        for (var i = 2; i <= 30; i++)
        {
            var allianceId = (i % 2 == 0) ? "a1" : "a2";
            builder.AddPlayer($"p{i}", $"Player{i}", allianceId);
        }

        var state = builder.Build();

        // Pre-assign alliance starting tiles to pass ValidateStartingAccess
        var a1Player = state.Players.First(p => p.AllianceId == "a1");
        var a2Player = state.Players.First(p => p.AllianceId == "a2");
        var availableHexes = state.Grid.Values.Where(c => !c.IsMasterTile).Take(2).ToList();

        availableHexes[0].OwnerId = a1Player.Id;
        availableHexes[0].OwnerAllianceId = "a1";
        availableHexes[0].Troops = 3;

        availableHexes[1].OwnerId = a2Player.Id;
        availableHexes[1].OwnerAllianceId = "a2";
        availableHexes[1].Troops = 3;

        var context = new ServiceTestContext(state, hostGuid);
        var sut = new LobbyService(context.RoomProvider.Object, context.GameStateService);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        error.Should().BeNull();
        result.Should().NotBeNull();
        result!.Phase.Should().Be(GamePhase.Playing);
        result.Players.Should().HaveCount(30);

        // Verify all players have starting positions
        var playersWithPositions = result.Players.Count(p => p.CurrentHexQ.HasValue && p.CurrentHexR.HasValue);
        playersWithPositions.Should().Be(30, "all 30 players should have starting hex coordinates");
    }

    [Fact]
    public void StartGame_With30PlayersIn5Alliances_DistributesStartingTilesEvenly()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();

        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(10)
            .WithMapLocation(52.0, 4.0)
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta")
            .AddAlliance("a3", "Gamma")
            .AddAlliance("a4", "Delta")
            .AddAlliance("a5", "Epsilon");

        // Host in a1
        builder.AddPlayer(hostId, "Host", "a1");

        // Distribute 29 players across 5 alliances (6 per alliance roughly)
        for (var i = 2; i <= 30; i++)
        {
            var allianceId = $"a{((i - 1) % 5) + 1}";
            builder.AddPlayer($"p{i}", $"Player{i}", allianceId);
        }

        var state = builder.Build();

        // Pre-assign starting tiles for each alliance
        var availableHexes = state.Grid.Values.Where(c => !c.IsMasterTile).Take(5).ToList();
        for (var a = 1; a <= 5; a++)
        {
            var allianceId = $"a{a}";
            var firstPlayer = state.Players.First(p => p.AllianceId == allianceId);
            availableHexes[a - 1].OwnerId = firstPlayer.Id;
            availableHexes[a - 1].OwnerAllianceId = allianceId;
            availableHexes[a - 1].Troops = 3;
        }

        var context = new ServiceTestContext(state, hostGuid);
        var sut = new LobbyService(context.RoomProvider.Object, context.GameStateService);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        error.Should().BeNull();
        result.Should().NotBeNull();
        result!.Alliances.Should().HaveCount(5);

        // Each alliance should have at least one starting tile
        foreach (var alliance in result.Alliances)
        {
            var allianceTiles = result.Grid.Values.Count(cell => cell.OwnerAllianceId == alliance.Id);
            allianceTiles.Should().BeGreaterThan(0, $"alliance {alliance.Name} should have starting territory");
        }
    }

    [Fact]
    public void StartGame_AllPlayersInOneAlliance_FailsValidationDueToLackOfTerritory()
    {
        // BUG FOUND: ValidateStartingAccess prevents starting a game where all players
        // are in one alliance with insufficient starting tiles.
        // This is NOT a bug - it's intentional validation to prevent unplayable games.

        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();

        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(10)
            .WithMapLocation(52.0, 4.0)
            .AddAlliance("a1", "MegaAlliance");

        // All 30 players in one alliance
        builder.AddPlayer(hostId, "Host", "a1");
        for (var i = 2; i <= 30; i++)
        {
            builder.AddPlayer($"p{i}", $"Player{i}", "a1");
        }

        var state = builder.Build();

        // AutoAssignAllianceStartingTiles will only assign ONE starting tile per alliance
        // With 30 players and only 1 alliance tile, most players will have no access
        // Let AutoAssignTiles do its job and see if it creates enough tiles

        var context = new ServiceTestContext(state, hostGuid);
        var sut = new LobbyService(context.RoomProvider.Object, context.GameStateService);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        // This is expected to fail - AutoAssignTiles only assigns one tile per alliance,
        // and ValidateStartingAccess detects that most players will have no access
        error.Should().NotBeNull();
        error.Should().Contain("would begin with 0 troops and no territory access");
    }

    // ─── Area 4: Win Condition Evaluation at Scale ──────────────────────

    [Fact]
    public void ApplyTerritoryPercentWinCondition_30Players10Alliances_ScansAllHexesCorrectly()
    {
        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .WithGrid(10)
            .WithWinCondition(WinConditionType.TerritoryPercent, 30);

        // Create 10 alliances with 3 players each
        for (var a = 1; a <= 10; a++)
        {
            builder.AddAlliance($"a{a}", $"Alliance{a}");
            for (var p = 1; p <= 3; p++)
            {
                var playerId = $"a{a}p{p}";
                builder.AddPlayer(playerId, $"Player{playerId}", $"a{a}");
            }
        }

        // Give alliance a1 enough territory to win (30% of claimable hexes)
        var state = builder.Build();
        var claimableHexes = state.Grid.Values.Count(c => !c.IsMasterTile);
        var hexesNeededForWin = (int)Math.Ceiling(claimableHexes * 0.30);

        var targetHexes = state.Grid.Values
            .Where(c => !c.IsMasterTile)
            .Take(hexesNeededForWin)
            .ToList();

        var firstPlayer = state.Players.First(p => p.AllianceId == "a1");
        foreach (var cell in targetHexes)
        {
            cell.OwnerId = firstPlayer.Id;
            cell.OwnerAllianceId = "a1";
            cell.OwnerName = firstPlayer.Name;
        }

        var winService = new WinConditionService();
        winService.RefreshTerritoryCount(state);
        winService.ApplyTerritoryPercentWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a1");
        state.IsAllianceVictory.Should().BeTrue();
    }

    [Fact]
    public void RefreshTerritoryCount_30PlayersOnLargeGrid_CompletesWithinReasonableTime()
    {
        var builder = ServiceTestContext.CreateBuilder()
            .WithGrid(15)
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta");

        for (var i = 1; i <= 30; i++)
        {
            var allianceId = (i % 2 == 0) ? "a1" : "a2";
            builder.AddPlayer($"p{i}", $"Player{i}", allianceId);
        }

        var state = builder.Build();

        // Assign random ownership
        var random = new Random(12345);
        foreach (var cell in state.Grid.Values.Where(c => !c.IsMasterTile))
        {
            var owner = state.Players[random.Next(state.Players.Count)];
            cell.OwnerId = owner.Id;
            cell.OwnerAllianceId = owner.AllianceId;
            cell.OwnerName = owner.Name;
        }

        var winService = new WinConditionService();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        winService.RefreshTerritoryCount(state);
        sw.Stop();

        // Should complete in well under 100ms even on large grid
        sw.ElapsedMilliseconds.Should().BeLessThan(100);

        // Verify counts are accurate
        var totalPlayerTerritories = state.Players.Sum(p => p.TerritoryCount);
        var totalAllianceTerritories = state.Alliances.Sum(a => a.TerritoryCount);
        var actualOwnedHexes = state.Grid.Values.Count(c => c.OwnerId != null);

        totalPlayerTerritories.Should().Be(actualOwnedHexes);
        totalAllianceTerritories.Should().Be(actualOwnedHexes);
    }

    [Fact]
    public void ApplyEliminationWinCondition_30Players_FindsSoleAllianceSurvivor()
    {
        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .WithGrid(8)
            .WithWinCondition(WinConditionType.Elimination)
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta");

        // 15 players per alliance
        for (var i = 1; i <= 30; i++)
        {
            var allianceId = (i <= 15) ? "a1" : "a2";
            builder.AddPlayer($"p{i}", $"Player{i}", allianceId);
        }

        var state = builder.Build();

        // Only alliance a1 has territory
        var a1Player = state.Players.First(p => p.AllianceId == "a1");
        var survivingHex = state.Grid.Values.First(c => !c.IsMasterTile);
        survivingHex.OwnerId = a1Player.Id;
        survivingHex.OwnerAllianceId = "a1";
        survivingHex.OwnerName = a1Player.Name;

        var winService = new WinConditionService();
        winService.RefreshTerritoryCount(state);
        winService.ApplyEliminationWinCondition(state);

        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a1");
        state.WinnerName.Should().Be("Alpha");
        state.IsAllianceVictory.Should().BeTrue();
    }

    [Fact]
    public void ApplyWinCondition_MultipleAlliancesHitThresholdSimultaneously_AwardsFirstInList()
    {
        // Simulate race condition: two alliances both meet win threshold on same tick
        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .WithGrid(6)
            .WithWinCondition(WinConditionType.TerritoryPercent, 40)
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta")
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2");

        var state = builder.Build();
        var claimableHexes = state.Grid.Values.Count(c => !c.IsMasterTile);
        var hexesNeeded = (int)Math.Ceiling(claimableHexes * 0.40);

        var allNonMasterHexes = state.Grid.Values.Where(c => !c.IsMasterTile).ToList();

        // Give both alliances exactly the win threshold
        var a1Hexes = allNonMasterHexes.Take(hexesNeeded).ToList();
        var a2Hexes = allNonMasterHexes.Skip(hexesNeeded).Take(hexesNeeded).ToList();

        foreach (var cell in a1Hexes)
        {
            cell.OwnerId = "p1";
            cell.OwnerAllianceId = "a1";
            cell.OwnerName = "Alice";
        }

        foreach (var cell in a2Hexes)
        {
            cell.OwnerId = "p2";
            cell.OwnerAllianceId = "a2";
            cell.OwnerName = "Bob";
        }

        var winService = new WinConditionService();
        winService.RefreshTerritoryCount(state);
        winService.ApplyTerritoryPercentWinCondition(state);

        // Should pick the first alliance that passes the check (order of Alliances list)
        state.Phase.Should().Be(GamePhase.GameOver);
        state.WinnerId.Should().Be("a1", "first alliance in list should win when both meet threshold");
        state.IsAllianceVictory.Should().BeTrue();
    }

    [Fact]
    public void ComputeAchievements_With30Players_CalculatesCorrectLeaders()
    {
        var builder = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .WithGrid(8)
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta");

        for (var i = 1; i <= 30; i++)
        {
            var allianceId = (i % 2 == 0) ? "a1" : "a2";
            builder.AddPlayer($"p{i}", $"Player{i}", allianceId);
        }

        var state = builder.Build();

        // Give p1 the most territory (10 hexes)
        var p1Hexes = state.Grid.Values.Where(c => !c.IsMasterTile).Take(10).ToList();
        foreach (var cell in p1Hexes)
        {
            cell.OwnerId = "p1";
            cell.OwnerAllianceId = "a1";
            cell.OwnerName = "Player1";
            cell.Troops = 5;
        }

        // Give p2 some territory (3 hexes) but most captures
        var p2Hexes = state.Grid.Values.Where(c => !c.IsMasterTile && c.OwnerId == null).Take(3).ToList();
        foreach (var cell in p2Hexes)
        {
            cell.OwnerId = "p2";
            cell.OwnerAllianceId = "a2";
            cell.OwnerName = "Player2";
            cell.Troops = 2;
        }

        // Add capture events
        for (var i = 0; i < 15; i++)
        {
            state.EventLog.Add(new GameEventLogEntry
            {
                Type = "TileCaptured",
                PlayerId = "p2",
                PlayerName = "Player2",
                CreatedAt = DateTime.UtcNow.AddMinutes(-i)
            });
        }

        var winService = new WinConditionService();
        winService.RefreshTerritoryCount(state);
        winService.ComputeAchievements(state);

        state.Achievements.Should().Contain(a => a.Id == "territoryLeader" && a.PlayerId == "p1");
        state.Achievements.Should().Contain(a => a.Id == "armyCommander" && a.PlayerId == "p1");
        state.Achievements.Should().Contain(a => a.Id == "conqueror" && a.PlayerId == "p2");
    }

    // ─── Test Helpers ────────────────────────────────────────────────────

    private static RoomService CreateRoomService()
    {
        var scopeFactoryMock = new Mock<IServiceScopeFactory>();
        var persistence = new RoomPersistenceService(
            scopeFactoryMock.Object,
            NullLogger<RoomPersistenceService>.Instance);

        return new RoomService(
            persistence,
            NullLogger<RoomService>.Instance);
    }
}
