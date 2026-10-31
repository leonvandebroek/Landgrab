using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class GameStateCommonTests
{
    // =====================================================================
    // AppendEventLog
    // =====================================================================

    [Fact]
    public void AppendEventLog_AddsEntry()
    {
        var state = new GameStateBuilder().Build();

        GameStateCommon.AppendEventLog(state, new GameEventLogEntry
        {
            Type = "Test",
            Message = "hello"
        });

        state.EventLog.Should().ContainSingle();
        state.EventLog[0].Type.Should().Be("Test");
    }

    [Fact]
    public void AppendEventLog_TruncatesAboveMaxEntries()
    {
        var state = new GameStateBuilder().Build();
        for (var i = 0; i < GameStateCommon.MaxEventLogEntries + 10; i++)
            GameStateCommon.AppendEventLog(state, new GameEventLogEntry
            {
                Type = "Entry",
                Message = $"msg-{i}"
            });

        state.EventLog.Should().HaveCount(GameStateCommon.MaxEventLogEntries);
        // The oldest entries should have been removed
        state.EventLog[0].Message.Should().Be("msg-10");
    }

    // =====================================================================
    // SnapshotState — deep copy isolation
    // =====================================================================

    [Fact]
    public void SnapshotState_IsDeepCopy_GridMutationDoesNotAffectSnapshot()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1", troops: 5)
            .Build();

        var snapshot = GameStateCommon.SnapshotState(state);

        // Mutate original
        state.Grid[HexService.Key(0, 0)].Troops = 99;

        snapshot.Grid[HexService.Key(0, 0)].Troops.Should().Be(5,
            "snapshot grid is a deep copy");
    }

    [Fact]
    public void SnapshotState_IsDeepCopy_PlayerMutationDoesNotAffectSnapshot()
    {
        var state = new GameStateBuilder()
            .AddPlayer("p1", "Alice")
            .Build();

        var snapshot = GameStateCommon.SnapshotState(state);

        state.Players[0].Name = "Mutated";

        snapshot.Players[0].Name.Should().Be("Alice");
    }

    [Fact]
    public void SnapshotState_PreservesAllScalarFields()
    {
        var state = new GameStateBuilder()
            .WithGrid(1)
            .WithMapLocation(52.0, 4.0, 30)
            .WithClaimMode(ClaimMode.PresenceWithTroop)
            .WithWinCondition(WinConditionType.Elimination)
            .WithPaused(true)
            .Build();
        state.HostBypassGps = true;
        state.HostObserverMode = true;

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.RoomCode.Should().Be(state.RoomCode);
        snapshot.MapLat.Should().Be(52.0);
        snapshot.MapLng.Should().Be(4.0);
        snapshot.TileSizeMeters.Should().Be(30);
        snapshot.ClaimMode.Should().Be(ClaimMode.PresenceWithTroop);
        snapshot.WinConditionType.Should().Be(WinConditionType.Elimination);
        snapshot.IsPaused.Should().BeTrue();
        snapshot.HostBypassGps.Should().BeTrue();
        snapshot.HostObserverMode.Should().BeTrue();
    }


    [Fact]
    public void SnapshotState_WithLargeGrid_CopiesAllHexes()
    {
        var state = new GameStateBuilder()
            .WithGrid(6)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1", troops: 3)
            .Build();

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        var snapshot = GameStateCommon.SnapshotState(state);
        stopwatch.Stop();
        state.Grid[HexService.Key(0, 0)].Troops = 9;

        snapshot.Grid.Should().HaveCount(state.Grid.Count);
        snapshot.Grid[HexService.Key(0, 0)].Troops.Should().Be(3);
        stopwatch.Elapsed.Should().BeLessThan(TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void AppendEventLog_WhenCallsAreExternallySynchronized_SupportsConcurrentUsage()
    {
        var state = new GameStateBuilder().Build();
        var syncRoot = new object();

        System.Threading.Tasks.Parallel.For(0, 250, i =>
        {
            lock (syncRoot)
            {
                GameStateCommon.AppendEventLog(state, new GameEventLogEntry
                {
                    Type = "Concurrent",
                    Message = $"msg-{i}"
                });
            }
        });

        state.EventLog.Should().HaveCount(GameStateCommon.MaxEventLogEntries);
        state.EventLog.Should().OnlyContain(entry => entry.Type == "Concurrent");
        state.EventLog.Select(entry => entry.Message).Should().OnlyHaveUniqueItems();
    }

}
