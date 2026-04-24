using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class GameplayE2ETests
{
    // ── Full game lifecycle: claim neutral tiles until territory win ──

    [Fact]
    public void FullGame_ClaimTilesAndReachTerritoryThreshold_TriggersWin()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(1)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.TerritoryPercent, 60)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .Build();
        var context = new ServiceTestContext(state);

        // Grid radius 1 has 7 hexes, master tile at (0,0) means 6 claimable.
        // 60% of 6 = 3.6, so need 4 hexes to win.
        var hexesToClaim = new[] { (1, 0), (1, -1), (0, -1), (-1, 0) };
        foreach (var (q, r) in hexesToClaim)
        {
            var (lat, lng) = ServiceTestContext.HexCenter(q, r);
            var result = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", q, r, lat, lng);
            result.error.Should().BeNull($"claiming ({q},{r}) should succeed");
        }

        context.State.Phase.Should().Be(GamePhase.GameOver);
        context.State.WinnerId.Should().Be("p1");
        context.State.WinnerName.Should().Be("Alice");
    }

    // ── Troop pickup, move, and attack ──

    [Fact]
    public void TroopLifecycle_PickUpAndAttackEnemy_ResolvesCorrectly()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithWinCondition(WinConditionType.TerritoryPercent, 100)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1", troops: 6)
            .OwnHex(1, 0, "p2", troops: 1)
            .Build();
        var context = new ServiceTestContext(state);
        var (sourceLat, sourceLng) = ServiceTestContext.HexCenter(0, 0);
        var (targetLat, targetLng) = ServiceTestContext.HexCenter(1, 0);

        // Pick up troops
        var pickup = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 0, 0, 5, sourceLat, sourceLng);
        pickup.error.Should().BeNull();
        context.Cell(0, 0).Troops.Should().Be(1);
        context.Player("p1").CarriedTroops.Should().Be(5);

        // Attack enemy hex
        var attack = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 1, 0, targetLat, targetLng);
        attack.error.Should().BeNull();
        attack.combatResult.Should().NotBeNull();

        // Attacker (5) vs Defender (1) — attacker should win
        context.Cell(1, 0).OwnerId.Should().Be("p1");
    }

    // ── Tactical strike ignores fort bonuses during combat ──

    [Fact]
    public void TacticalStrike_WhenActiveOnTargetHex_IgnoresFortBonuses()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .WithWinCondition(WinConditionType.TerritoryPercent, 100)
            .AddPlayer("p1", "Alice", role: PlayerRole.Commander)
            .AddPlayer("p2", "Bob")
            .OwnHex(0, 0, "p1", troops: 8)
            .OwnHex(1, 0, "p2", troops: 3)
            .WithPlayerPosition("p1", 0, 0)
            .WithCarriedTroops("p1", 5)
            .Build();
        state.Grid[HexService.Key(1, 0)].IsFort = true;
        var context = new ServiceTestContext(state);

        // Activate tactical strike on the target hex
        var strikeResult = context.AbilityService.ActivateTacticalStrike(ServiceTestContext.RoomCode, "p1", 1, 0);
        strikeResult.error.Should().BeNull();
        context.Player("p1").TacticalStrikeActive.Should().BeTrue();
        context.Player("p1").TacticalStrikeTargetQ.Should().Be(1);
        context.Player("p1").TacticalStrikeTargetR.Should().Be(0);

        // Move player to target hex to get combat preview
        var (targetLat, targetLng) = ServiceTestContext.HexCenter(1, 0);
        context.Player("p1").CurrentLat = targetLat;
        context.Player("p1").CurrentLng = targetLng;
        context.Player("p1").CurrentHexQ = 1;
        context.Player("p1").CurrentHexR = 0;

        // Get combat preview — fort bonus should be nullified
        var preview = context.GameplayService.GetCombatPreview(ServiceTestContext.RoomCode, "p1", 1, 0);
        preview.error.Should().BeNull();
        var fortBonus = preview.preview!.DefenderBonuses
            .Where(b => b.Source.Contains("Fort", StringComparison.OrdinalIgnoreCase));
        fortBonus.Should().BeEmpty("tactical strike should nullify fort bonuses");
    }

    // ── Fort construction and demolish lifecycle ──

    [Fact]
    public void FortLifecycle_BuildAndThenDemolishFromEnemy()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Engineer)
            .AddPlayer("p2", "Bob", "a2", role: PlayerRole.Engineer)
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 2)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        // Start fort construction
        var fortResult = context.AbilityService.StartFortConstruction(ServiceTestContext.RoomCode, "p1");
        fortResult.error.Should().BeNull();
        context.Player("p1").FortTargetQ.Should().Be(0);
        context.Player("p1").FortTargetR.Should().Be(0);

        // Simulate completed fort (perimeter walk completion is done via UpdatePlayerLocation)
        context.Cell(0, 0).IsFort = true;
        context.Player("p1").FortTargetQ = null;
        context.Player("p1").FortTargetR = null;

        // Enemy engineer starts demolish
        context.Player("p2").CurrentHexQ = 0;
        context.Player("p2").CurrentHexR = 0;
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
        context.Player("p2").CurrentLat = lat;
        context.Player("p2").CurrentLng = lng;
        var demolishResult = context.AbilityService.StartDemolish(ServiceTestContext.RoomCode, "p2");
        demolishResult.error.Should().BeNull();
        context.Player("p2").DemolishTargetKey.Should().Be(HexService.Key(0, 0));

        // Cancel demolish
        var cancelResult = context.AbilityService.CancelDemolish(ServiceTestContext.RoomCode, "p2");
        cancelResult.error.Should().BeNull();
        context.Player("p2").DemolishTargetKey.Should().BeNull();
    }

    // ── Sabotage and intercept flow ──

    [Fact]
    public void SabotageInterceptFlow_ScoutBlocksEngineerSabotage()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(3)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1", role: PlayerRole.Scout)
            .AddPlayer("p2", "Bob", allianceId: "a2", role: PlayerRole.Engineer)
            .AddPlayer("p3", "Carol", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p3")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(1, 0, "p3", allianceId: "a1")
            .Build();
        // Position engineer on the enemy hex (a1-owned)
        var (hexLat, hexLng) = ServiceTestContext.HexCenter(1, 0);
        var engineer = state.Players.Single(p => p.Id == "p2");
        engineer.CurrentLat = hexLat;
        engineer.CurrentLng = hexLng;
        engineer.CurrentHexQ = 1;
        engineer.CurrentHexR = 0;
        var context = new ServiceTestContext(state);

        // Engineer starts sabotage on enemy hex
        var sabotageResult = context.AbilityService.ActivateSabotage(ServiceTestContext.RoomCode, "p2");
        sabotageResult.error.Should().BeNull();
        engineer.SabotageTargetQ.Should().Be(1);
        engineer.SabotageTargetR.Should().Be(0);

        // Position scout on same hex
        var scout = state.Players.Single(p => p.Id == "p1");
        scout.CurrentLat = hexLat;
        scout.CurrentLng = hexLng;
        scout.CurrentHexQ = 1;
        scout.CurrentHexR = 0;

        // Scout attempts intercept — starts locking
        var firstAttempt = context.AbilityService.AttemptIntercept(ServiceTestContext.RoomCode, "p1", 0d);
        firstAttempt.error.Should().BeNull();
        firstAttempt.result!.Status.Should().Be("locking");
        scout.InterceptTargetId.Should().Be("p2");

        // Simulate 6 seconds passing
        scout.InterceptLockStartAt = DateTime.UtcNow.AddSeconds(-6);

        // Scout completes intercept
        var secondAttempt = context.AbilityService.AttemptIntercept(ServiceTestContext.RoomCode, "p1", 0d);
        secondAttempt.error.Should().BeNull();
        secondAttempt.result!.Status.Should().Be("success");

        // Verify sabotage was blocked
        engineer.SabotageTargetQ.Should().BeNull();
        engineer.SabotageTargetR.Should().BeNull();
        engineer.SabotageBlockedTiles.Should().ContainKey(HexService.Key(1, 0));
        scout.InterceptTargetId.Should().BeNull();
    }

    // ── Field battle full flow ──

    [Fact]
    public void FieldBattle_InitiateJoinResolve_CompleteBattleFlow()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 0, 0)
            .WithCarriedTroops("p1", 4)
            .WithCarriedTroops("p2", 3)
            .Build();
        var context = new ServiceTestContext(state);

        // Initiate field battle
        var initResult = context.AbilityService.InitiateFieldBattle(ServiceTestContext.RoomCode, "p1");
        initResult.error.Should().BeNull();
        initResult.battle.Should().NotBeNull();
        var battleId = initResult.battle!.Id;
        context.State.ActiveFieldBattles.Should().ContainSingle();

        // Enemy joins
        var joinError = context.AbilityService.JoinFieldBattle(ServiceTestContext.RoomCode, "p2", battleId);
        joinError.Should().BeNull();
        context.State.ActiveFieldBattles[0].JoinedEnemyIds.Should().Contain("p2");

        // Resolve battle
        var resolveResult = context.AbilityService.ResolveFieldBattle(ServiceTestContext.RoomCode, battleId);
        resolveResult.error.Should().BeNull();
        resolveResult.state.Should().NotBeNull();
        resolveResult.result.Should().NotBeNull();
        context.State.ActiveFieldBattles.Should().BeEmpty();

        // Both players should have cooldowns set
        context.Player("p1").FieldBattleCooldownUntil.Should().NotBeNull();
        context.Player("p2").FieldBattleCooldownUntil.Should().NotBeNull();
    }

    // ── Troop transfer: resolve target, initiate, accept ──

    [Fact]
    public void TroopTransfer_ResolveTargetInitiateAndAccept_MovesTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", allianceId: "a1")
            .AddPlayer("p2", "Bob", allianceId: "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .WithPlayerPosition("p1", 0, 0)
            .WithPlayerPosition("p2", 1, 0)
            .WithCarriedTroops("p1", 5)
            .WithCarriedTroops("p2", 1)
            .Build();
        var context = new ServiceTestContext(state);

        // Resolve target using bearing
        var (p1Lat, p1Lng) = ServiceTestContext.HexCenter(0, 0);
        var (p2Lat, p2Lng) = ServiceTestContext.HexCenter(1, 0);
        var heading = HexService.BearingDegrees(p1Lat, p1Lng, p2Lat, p2Lng);
        var resolveResult = context.AbilityService.ResolveTroopTransferTarget(ServiceTestContext.RoomCode, "p1", heading);
        resolveResult.error.Should().BeNull();
        resolveResult.target.Should().NotBeNull();
        resolveResult.target!.Value.id.Should().Be("p2");

        // Initiate transfer
        var initiateResult = context.AbilityService.InitiateTroopTransfer(ServiceTestContext.RoomCode, "p1", 3, "p2");
        initiateResult.error.Should().BeNull();
        initiateResult.transferId.Should().NotBeNull();
        context.State.ActiveTroopTransfers.Should().ContainSingle();

        // Accept transfer
        var transferId = initiateResult.transferId!.Value;
        var acceptResult = context.AbilityService.RespondToTroopTransfer(ServiceTestContext.RoomCode, "p2", transferId, true);
        acceptResult.error.Should().BeNull();
        context.Player("p1").CarriedTroops.Should().Be(2);
        context.Player("p2").CarriedTroops.Should().Be(4);
        context.State.ActiveTroopTransfers.Should().BeEmpty();
        context.Player("p1").TroopTransferCooldownUntil.Should().NotBeNull();
    }

    // ── Win by elimination ──

    [Fact]
    public void WinByElimination_LastPlayerWithTerritory_Wins()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(1)
            .WithMasterTile(0, 0)
            .WithWinCondition(WinConditionType.Elimination)
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p1", troops: 6)
            .OwnHex(-1, 0, "p1", troops: 3)
            .OwnHex(0, 1, "p2", troops: 1)
            .Build();
        var context = new ServiceTestContext(state);
        var (sourceLat, sourceLng) = ServiceTestContext.HexCenter(1, 0);
        var (targetLat, targetLng) = ServiceTestContext.HexCenter(0, 1);

        // Pick up troops and attack
        var pickup = context.GameplayService.PickUpTroops(ServiceTestContext.RoomCode, "p1", 1, 0, 5, sourceLat, sourceLng);
        pickup.error.Should().BeNull();

        var attack = context.GameplayService.PlaceTroops(ServiceTestContext.RoomCode, "p1", 0, 1, targetLat, targetLng);
        attack.error.Should().BeNull();

        // p2 should have lost their only hex → elimination
        context.State.Phase.Should().Be(GamePhase.GameOver);
        context.State.WinnerId.Should().Be("p1");
    }

    // ── Timed game: highest territory wins when time expires ──

    [Fact]
    public void TimedGame_WhenTimeExpires_HighestTerritoryWins()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(1)
            .WithTimedGame(30, DateTime.UtcNow.AddMinutes(-31))
            .AddPlayer("p1", "Alice")
            .AddPlayer("p2", "Bob")
            .OwnHex(1, 0, "p1")
            .OwnHex(1, -1, "p1")
            .OwnHex(0, -1, "p1")
            .OwnHex(-1, 0, "p2")
            .Build();
        var context = new ServiceTestContext(state);

        context.WinConditionService.ApplyWinConditionAndLog(context.State, DateTime.UtcNow);

        context.State.Phase.Should().Be(GamePhase.GameOver);
        context.State.WinnerId.Should().Be("p1");
        context.State.WinnerName.Should().Be("Alice");
    }

    // ── Reinforcement tick adds troops to owned hexes ──

    [Fact]
    public void ReinforcementTick_AddsBaseTroopsToOwnedHexes()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1", troops: 2)
            .OwnHex(1, 0, "p1", troops: 3)
            .Build();
        var context = new ServiceTestContext(state);

        var result = context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

        result.error.Should().BeNull();
        result.state.Should().NotBeNull();
        // Base regen is +1 per hex (no player physically present)
        context.Cell(0, 0).Troops.Should().Be(3);
        context.Cell(1, 0).Troops.Should().Be(4);
    }

    // ── Rally point resolves with bonus troops when allies converge ──

    [Fact]
    public void RallyPoint_WhenActiveAndResolved_GrantsBonusTroops()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice", "a1", role: PlayerRole.Commander)
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 2)
            .WithPlayerPosition("p1", 0, 0)
            .Build();
        var context = new ServiceTestContext(state);

        // Activate rally point
        var rallyResult = context.AbilityService.ActivateRallyPoint(ServiceTestContext.RoomCode, "p1");
        rallyResult.error.Should().BeNull();
        context.Player("p1").RallyPointActive.Should().BeTrue();
        context.Player("p1").RallyPointQ.Should().Be(0);
        context.Player("p1").RallyPointR.Should().Be(0);

        // Place ally on the rally hex
        var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
        context.Player("p2").CurrentLat = lat;
        context.Player("p2").CurrentLng = lng;
        context.Player("p2").CurrentHexQ = 0;
        context.Player("p2").CurrentHexR = 0;

        // Simulate rally expiry so it resolves
        context.Player("p1").RallyPointDeadline = DateTime.UtcNow.AddSeconds(-1);
        var troopsBefore = context.Cell(0, 0).Troops;

        context.GameplayService.ResolveExpiredRallyPoints(ServiceTestContext.RoomCode);

        // Rally resolved: troops should have been added
        context.Cell(0, 0).Troops.Should().BeGreaterThan(troopsBefore);
        context.Player("p1").RallyPointActive.Should().BeFalse();
        context.State.EventLog.Should().Contain(e => e.Type == "RallyPointResolved");
    }
}
