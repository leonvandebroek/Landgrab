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
    public void SnapshotState_StealthedPlayer_LocationIsHidden()
    {
        var state = new GameStateBuilder()
            .AddPlayer("p1", "Alice")
            .Build();
        state.Players[0].CurrentLat = 52.0;
        state.Players[0].CurrentLng = 4.0;
        state.Players[0].StealthUntil = DateTime.UtcNow.AddMinutes(2); // active stealth

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.Players[0].CurrentLat.Should().BeNull("stealthed player location is hidden");
        snapshot.Players[0].CurrentLng.Should().BeNull("stealthed player location is hidden");
    }

    [Fact]
    public void SnapshotState_ExpiredStealth_LocationIsVisible()
    {
        var state = new GameStateBuilder()
            .AddPlayer("p1", "Alice")
            .Build();
        state.Players[0].CurrentLat = 52.0;
        state.Players[0].CurrentLng = 4.0;
        state.Players[0].StealthUntil = DateTime.UtcNow.AddMinutes(-1); // expired

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.Players[0].CurrentLat.Should().Be(52.0);
        snapshot.Players[0].CurrentLng.Should().Be(4.0);
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
        state.IsRushHour = true;

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
        snapshot.IsRushHour.Should().BeTrue();
    }


    [Fact]
    public void SnapshotState_WithMissionsActive_CopiesMissionDataIndependently()
    {
        var state = new GameStateBuilder()
            .AddPlayer("p1", "Alice")
            .Build();
        state.Dynamics.MissionSystemEnabled = true;
        state.Missions.Add(new Mission
        {
            Id = "m1",
            Type = "Capture",
            Title = "Capture center",
            Description = "Take the center hex",
            Scope = "Main",
            Objective = "Capture",
            Progress = 0.5,
            Status = "Active",
            Reward = "Bonus troops"
        });

        var snapshot = GameStateCommon.SnapshotState(state);
        state.Missions[0].Title = "Mutated";

        snapshot.Dynamics.MissionSystemEnabled.Should().BeTrue();
        snapshot.Missions.Should().ContainSingle();
        snapshot.Missions[0].Title.Should().Be("Capture center");
        snapshot.Missions[0].Description.Should().Be("Take the center hex");
    }

    [Fact]
    public void SnapshotState_WithRandomEventsActive_CopiesDynamicsAndEventLog()
    {
        var state = new GameStateBuilder().Build();
        state.Dynamics.RandomEventsEnabled = true;
        state.EventLog.Add(new GameEventLogEntry
        {
            Type = "RandomEvent",
            Message = "Storm front arrived"
        });

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.Dynamics.RandomEventsEnabled.Should().BeTrue();
        snapshot.EventLog.Should().ContainSingle(entry => entry.Type == "RandomEvent" && entry.Message == "Storm front arrived");
    }

    [Fact]
    public void SnapshotState_WithDuelModeActive_CopiesDuelModeAndDuelEvents()
    {
        var state = new GameStateBuilder()
            .WithCopresenceModes(CopresenceMode.Duel)
            .Build();
        state.EventLog.Add(new GameEventLogEntry
        {
            Type = "DuelResult",
            Message = "Alice won a duel against Bob!",
            PlayerId = "p1",
            TargetPlayerId = "p2",
            Q = 1,
            R = 0
        });

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.Dynamics.ActiveCopresenceModes.Should().Contain(CopresenceMode.Duel);
        snapshot.EventLog.Should().ContainSingle(entry => entry.Type == "DuelResult" && entry.Q == 1 && entry.R == 0);
    }

    [Fact]
    public void SnapshotState_WithAllDynamicsEnabled_CopiesEveryFlagAndActiveMode()
    {
        var state = new GameStateBuilder()
            .WithCopresenceModes(
                CopresenceMode.Beacon,
                CopresenceMode.Duel,
                CopresenceMode.Hostage,
                CopresenceMode.Stealth,
                CopresenceMode.CommandoRaid)
            .Build();
        state.Dynamics.CopresencePreset = "Chaos";
        state.Dynamics.TerrainEnabled = true;
        state.Dynamics.PlayerRolesEnabled = true;
        state.Dynamics.FogOfWarEnabled = true;
        state.Dynamics.SupplyLinesEnabled = true;
        state.Dynamics.HQEnabled = true;
        state.Dynamics.TimedEscalationEnabled = true;
        state.Dynamics.UnderdogPactEnabled = true;
        state.Dynamics.NeutralNPCEnabled = true;
        state.Dynamics.RandomEventsEnabled = true;
        state.Dynamics.MissionSystemEnabled = true;

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.Dynamics.CopresencePreset.Should().Be("Chaos");
        snapshot.Dynamics.ActiveCopresenceModes.Should().BeEquivalentTo(state.Dynamics.ActiveCopresenceModes);
        snapshot.Dynamics.TerrainEnabled.Should().BeTrue();
        snapshot.Dynamics.PlayerRolesEnabled.Should().BeTrue();
        snapshot.Dynamics.FogOfWarEnabled.Should().BeTrue();
        snapshot.Dynamics.SupplyLinesEnabled.Should().BeTrue();
        snapshot.Dynamics.HQEnabled.Should().BeTrue();
        snapshot.Dynamics.TimedEscalationEnabled.Should().BeTrue();
        snapshot.Dynamics.UnderdogPactEnabled.Should().BeTrue();
        snapshot.Dynamics.NeutralNPCEnabled.Should().BeTrue();
        snapshot.Dynamics.RandomEventsEnabled.Should().BeTrue();
        snapshot.Dynamics.MissionSystemEnabled.Should().BeTrue();
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

    [Fact]
    public void SnapshotState_WithHeldPlayer_ExposesHostageStateInSnapshot()
    {
        var state = new GameStateBuilder()
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .Build();
        state.Players.Single(player => player.Id == "p2").HeldByPlayerId = "p1";
        state.Players.Single(player => player.Id == "p2").HeldUntil = DateTime.UtcNow.AddMinutes(3);

        var snapshot = GameStateCommon.SnapshotState(state);

        snapshot.Players.Single(player => player.Id == "p2").HeldByPlayerId.Should().Be("p1");
        snapshot.Players.Single(player => player.Id == "p2").HeldUntil.Should().NotBeNull();
    }

}
