# Physical Presence Mechanics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework Landgrab's game mechanics so that every meaningful action requires physical presence, removing digital board-game abstractions that don't fit a physically-mobile scout game.

**Architecture:** Backend changes follow a remove-then-redesign order: strip deprecated mechanics first (reducing noise), then implement redesigned ones. Frontend changes come last, after the backend API surface is stable. All changes are tested with xUnit using `ServiceTestContext` + `GameStateBuilder`.

**Design reference:** `docs/plans/2026-03-17-physical-presence-game-dynamics-design.md`

**Tech Stack:** ASP.NET Core 8, SignalR, xUnit, FluentAssertions, Moq, React 19, TypeScript, Zustand

---

## Phase 1: Removals (Backend)

### Task 1: Remove Defender role and ShieldWall

**Files:**
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Api/Services/GameStateCommon.cs`
- Modify: `backend/Landgrab.Api/Services/AbilityService.cs`
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`
- Modify: `backend/Landgrab.Tests/Services/AbilityServiceTests.cs`

**Step 1: Write failing test**

Add to `AbilityServiceTests.cs`:
```csharp
[Fact]
public void ActivateShieldWall_AlwaysReturnsError()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(2)
        .AddPlayer("p1", "Alice", role: PlayerRole.Defender)
        .Build();
    var context = new ServiceTestContext(state);

    var (result, error) = context.AbilityService.ActivateShieldWall(ServiceTestContext.RoomCode, "p1");

    error.Should().NotBeNull();
    result.Should().BeNull();
}
```

**Step 2: Run test to verify it fails**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "ActivateShieldWall_AlwaysReturnsError" -v
```
Expected: FAIL (method still exists and succeeds)

**Step 3: Remove Defender role**

In `Models/GameState.cs`, remove `Defender` from `PlayerRole` enum:
```csharp
public enum PlayerRole
{
    None,
    Commander,
    Scout,
    Engineer
}
```

Remove from `PlayerDto`:
```csharp
// Remove these three fields entirely:
// public bool ShieldWallActive { get; set; }
// public DateTime? ShieldWallExpiry { get; set; }
// public DateTime? ShieldWallCooldownUntil { get; set; }
```

**Step 4: Remove ShieldWall from GameStateCommon.cs**

In `SnapshotState`, remove the three ShieldWall lines (lines ~72-74):
```csharp
// Remove:
// ShieldWallActive = player.ShieldWallActive,
// ShieldWallExpiry = player.ShieldWallExpiry,
// ShieldWallCooldownUntil = player.ShieldWallCooldownUntil,
```

**Step 5: Remove ShieldWall from combat calculation in GameplayService.cs**

Find `CalculateCombatStats`. Remove the ShieldWall block (~lines 591-598):
```csharp
// Remove this entire block:
// var shieldWallActive = state.Players.Any(defender =>
//     defender.Role == PlayerRole.Defender && ...);
// if (shieldWallActive)
//     AddBonus(defenderBonuses, "Shield Wall", 2);
```

Also remove the ShieldWall expiry check in `ExpireTimedAbilities` (~lines 1197-1200):
```csharp
// Remove:
// if (player.ShieldWallActive && player.ShieldWallExpiry <= now)
// {
//     player.ShieldWallActive = false;
//     player.ShieldWallExpiry = null;
// }
```

**Step 6: Remove ActivateShieldWall from AbilityService.cs**

Delete the entire `ActivateShieldWall` method.

Replace with a stub that always errors (so the hub method compiles):
```csharp
public (GameState? state, string? error) ActivateShieldWall(string roomCode, string userId)
    => (null, "Shield Wall has been removed.");
```

**Step 7: Run test to verify it passes**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "ActivateShieldWall_AlwaysReturnsError" -v
```
Expected: PASS

**Step 8: Run full test suite**
```bash
cd backend/Landgrab.Tests && dotnet test -v
```
Fix any compilation errors from removed fields.

**Step 9: Commit**
```bash
git add backend/ && git commit -m "feat: remove Defender role and ShieldWall ability"
```

---

### Task 2: Remove ReClaimHex

**Files:**
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`
- Modify: `backend/Landgrab.Tests/Services/GameplayServiceTests.cs`

**Step 1: Write failing test**

Add to `GameplayServiceTests.cs`:
```csharp
[Fact]
public void ReClaimHex_AlwaysReturnsError()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(2)
        .AddPlayer("p1", "Alice")
        .OwnHex(0, 0, "p1")
        .Build();
    var context = new ServiceTestContext(state);

    var (result, error) = context.GameplayService.ReClaimHex(
        ServiceTestContext.RoomCode, "p1", 0, 0, ReClaimMode.Alliance);

    error.Should().NotBeNull();
    result.Should().BeNull();
}
```

**Step 2: Run to verify it fails**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "ReClaimHex_AlwaysReturnsError" -v
```

**Step 3: Remove ReClaimMode enum from GameState.cs**

```csharp
// Remove entirely:
// public enum ReClaimMode { Alliance, Self, Abandon }
```

**Step 4: Remove ReClaimHex method from GameplayService.cs**

Delete the entire `ReClaimHex` method (~lines 762-820). Replace with stub:
```csharp
public (GameState? state, string? error) ReClaimHex(string roomCode, string userId, int q, int r, ReClaimMode mode)
    => (null, "ReClaimHex has been removed.");
```

Since we're removing the enum, change the signature to use a string placeholder temporarily, then remove it entirely once the hub is updated.

**Step 5: Remove ReClaimHex from GameHub.Gameplay.cs**

Delete the entire `ReClaimHex` hub method.

**Step 6: Remove ReClaimMode enum and ReClaimHex method entirely**

Now that the hub reference is gone, delete the stub and enum completely.

**Step 7: Delete existing ReClaimHex tests**

Remove `ReClaimHex_ToAllianceClaim_Succeeds`, `ReClaimHex_WhenHexIsNotOwnedByPlayer_Fails`, `ReClaimHex_SelfClaimDisallowed_Fails` from `GameplayServiceTests.cs`.

**Step 8: Run full suite**
```bash
cd backend/Landgrab.Tests && dotnet test -v
```

**Step 9: Commit**
```bash
git add backend/ && git commit -m "feat: remove ReClaimHex mechanic"
```

---

### Task 3: Remove AllowSelfClaim and claimForSelf

**Files:**
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Api/Services/GameStateCommon.cs`
- Modify: `backend/Landgrab.Api/Services/GameConfigService.cs`
- Modify: `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`
- Modify: `backend/Landgrab.Api/Hubs/GameHub.Lobby.cs`
- Modify: `backend/Landgrab.Tests/Services/GameplayServiceTests.cs`

**Step 1: Write failing test**

```csharp
[Fact]
public void PlaceTroops_AlwaysClaimsForAlliance_NotSelf()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(2)
        .AddPlayer("p1", "Alice", allianceId: "a1")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .WithTroops(0, 0, 3)
        .WithCarriedTroops("p1", 3, 0, 0)
        .Build();
    state.AllowSelfClaim = false; // Should be gone — this line should fail to compile
    var context = new ServiceTestContext(state);
    var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

    var (result, error, _, _) = context.GameplayService.PlaceTroops(
        ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng, claimForSelf: true);

    // claimForSelf param should be gone — alliance ownership always
    result!.Grid[HexService.Key(1, 0)].OwnerAllianceId.Should().Be("a1");
}
```

**Step 2: Run to verify it fails** (compilation failure expected)
```bash
cd backend/Landgrab.Tests && dotnet build
```

**Step 3: Remove AllowSelfClaim from GameState.cs**
```csharp
// Remove from GameState:
// public bool AllowSelfClaim { get; set; } = true;
```

**Step 4: Remove claimForSelf from PlaceTroops in GameplayService.cs**

Change signature from:
```csharp
public (GameState? state, string? error, string? previousOwnerId, CombatResult? combatResult) PlaceTroops(
    string roomCode, string userId, int q, int r, double playerLat, double playerLng,
    int? troopCount = null, bool claimForSelf = false)
```
To:
```csharp
public (GameState? state, string? error, string? previousOwnerId, CombatResult? combatResult) PlaceTroops(
    string roomCode, string userId, int q, int r, double playerLat, double playerLng,
    int? troopCount = null)
```

Remove all `claimForSelf` logic inside the method. Replace `ClaimNeutralHex(room.State, player, cell, q, r, claimForSelf)` with `ClaimNeutralHex(room.State, player, cell, q, r)`.

Remove `SetCellOwnerForSelf` method entirely. In `ClaimNeutralHex`, remove the `claimForSelf` parameter and all `if (claimForSelf)` branches — always call `SetCellOwner`.

**Step 5: Remove AllowSelfClaim from GameStateCommon.cs**

Remove from `SnapshotState`:
```csharp
// Remove:
// AllowSelfClaim = state.AllowSelfClaim,
```

**Step 6: Remove SetAllowSelfClaim from GameConfigService.cs**

Delete the `SetAllowSelfClaim` method entirely.

**Step 7: Update hub signatures**

In `GameHub.Gameplay.cs`, remove `claimForSelf` parameter from `PlaceTroops`:
```csharp
public async Task PlaceTroops(int q, int r, double playerLat, double playerLng, int? troopCount = null)
```

In `GameHub.Lobby.cs`, remove the `SetAllowSelfClaim` hub method.

**Step 8: Remove affected tests, run suite**
```bash
cd backend/Landgrab.Tests && dotnet test -v
```

**Step 9: Commit**
```bash
git add backend/ && git commit -m "feat: remove AllowSelfClaim — tiles always claimed for alliance"
```

---

### Task 4: Remove SupplyLinesEnabled and RushHour

**Files:**
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Api/Services/GameStateCommon.cs`
- Modify: `backend/Landgrab.Api/Services/GameConfigService.cs`
- Modify: `backend/Landgrab.Api/Services/HostControlService.cs`

**Step 1: Remove from model**

In `GameState.cs`, remove from `GameDynamics`:
```csharp
// Remove:
// public bool SupplyLinesEnabled { get; set; }
```

Remove from `GameState`:
```csharp
// Remove:
// public bool IsRushHour { get; set; }
```

**Step 2: Remove SupplyLines from regen in GameplayService.cs**

Find `if (room.State.Dynamics.SupplyLinesEnabled)` block (~line 846). Delete the entire supply lines isolation check and the skip-regen-if-isolated logic.

**Step 3: Remove RushHour multiplier from regen**

Find `if (room.State.IsRushHour)` (~line 831). Delete the RushHour territory count multiplier block.

**Step 4: Remove from GameStateCommon.cs**

Remove from `SnapshotState`:
```csharp
// Remove:
// SupplyLinesEnabled = state.Dynamics.SupplyLinesEnabled,
// IsRushHour = state.IsRushHour,
```

**Step 5: Remove from GameConfigService.cs**

In `SetGameDynamics`, remove:
```csharp
// Remove:
// room.State.Dynamics.SupplyLinesEnabled = dynamics.SupplyLinesEnabled;
```

**Step 6: Remove RushHour from HostControlService.cs**

Delete the `"RushHour"` case from the `TriggerGameEvent` switch statement.

**Step 7: Run suite**
```bash
cd backend/Landgrab.Tests && dotnet test -v
```

**Step 8: Commit**
```bash
git add backend/ && git commit -m "feat: remove SupplyLinesEnabled and RushHour mechanics"
```

---

### Task 5: Change default ClaimMode to PresenceOnly

**Files:**
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Tests/Services/GameplayServiceTests.cs`

**Step 1: Write failing test**

```csharp
[Fact]
public void GameState_DefaultClaimMode_IsPresenceOnly()
{
    var state = new GameState();
    state.ClaimMode.Should().Be(ClaimMode.PresenceOnly);
}
```

**Step 2: Run to verify it fails**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "GameState_DefaultClaimMode_IsPresenceOnly" -v
```
Expected: FAIL (default is currently AdjacencyRequired)

**Step 3: Change the default**

In `GameState.cs`:
```csharp
// Change from:
public ClaimMode ClaimMode { get; set; } = ClaimMode.AdjacencyRequired;
// To:
public ClaimMode ClaimMode { get; set; } = ClaimMode.PresenceOnly;
```

**Step 4: Run test to verify it passes**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "GameState_DefaultClaimMode_IsPresenceOnly" -v
```

**Step 5: Update tests that assumed AdjacencyRequired default**

Search for any tests setting up state without an explicit ClaimMode that rely on adjacency behavior. Update them to explicitly set `ClaimMode = ClaimMode.AdjacencyRequired` if they test adjacency logic.

**Step 6: Run full suite**
```bash
cd backend/Landgrab.Tests && dotnet test -v
```

**Step 7: Commit**
```bash
git add backend/ && git commit -m "feat: change default ClaimMode to PresenceOnly"
```

---

## Phase 2: Redesigned Mechanics (Backend)

### Task 6: Redesign CommandoRaid → Game-Level Presence Battle

This is the largest change. CommandoRaid goes from a player-level GPS-tracking mechanic to a game-level timed presence battle that both teams see.

**Files:**
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Api/Services/AbilityService.cs`
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Api/Services/TroopRegenerationService.cs`
- Modify: `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`
- Modify: `backend/Landgrab.Tests/Services/AbilityServiceTests.cs`

**Step 1: Add ActiveCommandoRaid model to GameState.cs**

```csharp
public class ActiveCommandoRaid
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int TargetQ { get; set; }
    public int TargetR { get; set; }
    public string InitiatorAllianceId { get; set; } = "";
    public string InitiatorPlayerId { get; set; } = "";
    public string InitiatorPlayerName { get; set; } = "";
    public DateTime Deadline { get; set; }
    public bool IsHQRaid { get; set; }
}
```

Add to `GameState`:
```csharp
public List<ActiveCommandoRaid> ActiveRaids { get; set; } = [];
```

Remove old CommandoRaid fields from `PlayerDto` (they're now game-level):
```csharp
// Remove:
// public bool IsCommandoActive { get; set; }
// public int? CommandoTargetQ { get; set; }
// public int? CommandoTargetR { get; set; }
// public DateTime? CommandoDeadline { get; set; }
// public DateTime? CommandoCooldownUntil { get; set; }
```

Add per-player cooldown (still needed):
```csharp
public DateTime? CommandoRaidCooldownUntil { get; set; }
```

**Step 2: Write failing tests**

```csharp
[Fact]
public void ActivateCommandoRaid_ByNonCommander_Fails()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", role: PlayerRole.Scout)
        .OwnHex(0, 0, "p1")
        .WithTroops(0, 0, 3)
        .Build();
    var context = new ServiceTestContext(state);

    var (result, error) = context.AbilityService.ActivateCommandoRaid(
        ServiceTestContext.RoomCode, "p1", 1, 0);

    error.Should().Contain("Commander");
    result.Should().BeNull();
}

[Fact]
public void ActivateCommandoRaid_ByCommander_CreatesActiveRaid_BothTeamsSeeIt()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(4)
        .AddPlayer("p1", "Alice", role: PlayerRole.Commander, allianceId: "a1")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .WithTroops(0, 0, 3)
        .WithClaimMode(ClaimMode.PresenceOnly)
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    var context = new ServiceTestContext(state);

    var (result, error) = context.AbilityService.ActivateCommandoRaid(
        ServiceTestContext.RoomCode, "p1", 2, 0);

    error.Should().BeNull();
    result.Should().NotBeNull();
    result!.ActiveRaids.Should().HaveCount(1);
    result.ActiveRaids[0].TargetQ.Should().Be(2);
    result.ActiveRaids[0].InitiatorAllianceId.Should().Be("a1");
    result.ActiveRaids[0].Deadline.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(5), TimeSpan.FromSeconds(5));
}

[Fact]
public void ResolveCommandoRaid_AttackersWinWithTwoPlusPresence_CapturesHexAndTransfersTroops()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(4)
        .AddPlayer("p1", "Alice", role: PlayerRole.Commander, allianceId: "a1")
        .AddPlayer("p2", "Bob", allianceId: "a1")
        .AddPlayer("p3", "Charlie", allianceId: "a2")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .OwnHex(2, 0, "p3", allianceId: "a2")
        .WithTroops(2, 0, 6)
        .WithCarriedTroops("p1", 0)
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    // Place p1 and p2 physically at (2,0), p3 is not there
    var (lat, lng) = ServiceTestContext.HexCenter(2, 0);
    state.Players.First(p => p.Id == "p1").CurrentLat = lat;
    state.Players.First(p => p.Id == "p1").CurrentLng = lng;
    state.Players.First(p => p.Id == "p2").CurrentLat = lat;
    state.Players.First(p => p.Id == "p2").CurrentLng = lng;

    state.ActiveRaids.Add(new ActiveCommandoRaid
    {
        TargetQ = 2, TargetR = 0,
        InitiatorAllianceId = "a1",
        InitiatorPlayerId = "p1",
        Deadline = DateTime.UtcNow.AddSeconds(-1) // expired
    });

    var context = new ServiceTestContext(state);
    var result = context.GameplayService.ResolveExpiredCommandoRaids(ServiceTestContext.RoomCode);

    result.state.Should().NotBeNull();
    result.state!.Grid[HexService.Key(2, 0)].OwnerAllianceId.Should().Be("a1");
    result.state.Grid[HexService.Key(2, 0)].Troops.Should().BeGreaterThan(0); // troops transferred
    result.state.ActiveRaids.Should().BeEmpty();
}

[Fact]
public void ResolveCommandoRaid_AttackersHaveOnlyOnePresence_RaidFails()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(4)
        .AddPlayer("p1", "Alice", role: PlayerRole.Commander, allianceId: "a1")
        .AddPlayer("p3", "Charlie", allianceId: "a2")
        .OwnHex(2, 0, "p3", allianceId: "a2")
        .WithTroops(2, 0, 6)
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    var (lat, lng) = ServiceTestContext.HexCenter(2, 0);
    state.Players.First(p => p.Id == "p1").CurrentLat = lat;
    state.Players.First(p => p.Id == "p1").CurrentLng = lng;
    // p3 is NOT physically there

    state.ActiveRaids.Add(new ActiveCommandoRaid
    {
        TargetQ = 2, TargetR = 0,
        InitiatorAllianceId = "a1",
        InitiatorPlayerId = "p1",
        Deadline = DateTime.UtcNow.AddSeconds(-1)
    });

    var context = new ServiceTestContext(state);
    var result = context.GameplayService.ResolveExpiredCommandoRaids(ServiceTestContext.RoomCode);

    result.state!.Grid[HexService.Key(2, 0)].OwnerAllianceId.Should().Be("a2"); // unchanged
    result.state.ActiveRaids.Should().BeEmpty();
}
```

**Step 3: Run to verify they fail**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "CommandoRaid" -v
```

**Step 4: Rewrite ActivateCommandoRaid in AbilityService.cs**

```csharp
public (GameState? state, string? error) ActivateCommandoRaid(
    string roomCode, string userId, int targetQ, int targetR)
{
    var room = GetRoom(roomCode);
    if (room == null) return (null, "Room not found.");

    lock (room.SyncRoot)
    {
        if (room.State.Phase != GamePhase.Playing)
            return (null, "Commando raids only work during gameplay.");
        if (!room.State.Dynamics.PlayerRolesEnabled)
            return (null, "Player roles are not active.");

        var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
        if (player == null) return (null, "Player not in room.");
        if (player.Role != PlayerRole.Commander)
            return (null, "Only a Commander can activate a commando raid.");
        if (player.CommandoRaidCooldownUntil.HasValue && player.CommandoRaidCooldownUntil > DateTime.UtcNow)
            return (null, "Commando raid is on cooldown.");
        if (room.State.ActiveRaids.Any(r => r.InitiatorAllianceId == player.AllianceId))
            return (null, "Your alliance already has an active commando raid.");

        var key = HexService.Key(targetQ, targetR);
        if (!room.State.Grid.TryGetValue(key, out var targetCell))
            return (null, "Invalid target hex.");

        // HQ raids require the 40% map density gate
        var isHQRaid = room.State.Alliances.Any(a =>
            a.HQHexQ == targetQ && a.HQHexR == targetR);
        if (isHQRaid)
        {
            var totalHexes = room.State.Grid.Count;
            var claimedHexes = room.State.Grid.Values.Count(c => c.OwnerId != null && !c.IsMasterTile);
            if (totalHexes > 0 && (double)claimedHexes / totalHexes < 0.40)
                return (null, "The battle hasn't reached its peak yet — HQ raids unlock when 40% of the map is claimed.");
        }

        var raid = new ActiveCommandoRaid
        {
            TargetQ = targetQ,
            TargetR = targetR,
            InitiatorAllianceId = player.AllianceId ?? "",
            InitiatorPlayerId = userId,
            InitiatorPlayerName = player.Name,
            Deadline = DateTime.UtcNow.AddMinutes(5),
            IsHQRaid = isHQRaid
        };
        room.State.ActiveRaids.Add(raid);
        player.CommandoRaidCooldownUntil = DateTime.UtcNow.AddMinutes(15);

        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "CommandoRaidStarted",
            Message = $"{player.Name} launched a commando raid on ({targetQ}, {targetR})! Everyone converge!",
            PlayerId = userId,
            PlayerName = player.Name,
            Q = targetQ,
            R = targetR
        });

        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }
}
```

**Step 5: Add ResolveExpiredCommandoRaids to GameplayService.cs**

```csharp
public (GameState? state, string? error) ResolveExpiredCommandoRaids(string roomCode)
{
    var room = GetRoom(roomCode);
    if (room == null) return (null, "Room not found.");

    lock (room.SyncRoot)
    {
        var now = DateTime.UtcNow;
        var expired = room.State.ActiveRaids.Where(r => r.Deadline <= now).ToList();
        if (expired.Count == 0) return (null, null);

        foreach (var raid in expired)
        {
            ResolveRaid(room.State, raid, now);
            room.State.ActiveRaids.Remove(raid);
        }

        winConditionService.RefreshTerritoryCount(room.State);
        winConditionService.ApplyWinConditionAndLog(room.State, now);
        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }
}

private static void ResolveRaid(GameState state, ActiveCommandoRaid raid, DateTime now)
{
    var key = HexService.Key(raid.TargetQ, raid.TargetR);
    if (!state.Grid.TryGetValue(key, out var cell)) return;

    var attackers = GetPlayersInHex(state, raid.TargetQ, raid.TargetR)
        .Where(p => p.AllianceId == raid.InitiatorAllianceId)
        .ToList();
    var defenders = GetPlayersInHex(state, raid.TargetQ, raid.TargetR)
        .Where(p => p.AllianceId != raid.InitiatorAllianceId)
        .ToList();

    var attackerWins = attackers.Count >= 2 && attackers.Count > defenders.Count;

    if (attackerWins)
    {
        var spoils = cell.Troops;
        var initiatorPlayer = state.Players.FirstOrDefault(p => p.Id == raid.InitiatorPlayerId);
        var newOwner = attackers.First();

        cell.OwnerId = newOwner.Id;
        cell.OwnerName = newOwner.Name;
        cell.OwnerAllianceId = raid.InitiatorAllianceId;
        cell.OwnerColor = newOwner.AllianceColor ?? newOwner.Color;
        cell.Troops = spoils; // troops transfer to attacker

        // If HQ raid: apply claim freeze to losing alliance
        if (raid.IsHQRaid)
        {
            var losingAlliance = state.Alliances.FirstOrDefault(a =>
                a.HQHexQ == raid.TargetQ && a.HQHexR == raid.TargetR);
            if (losingAlliance != null)
                losingAlliance.ClaimFrozenUntil = now.AddMinutes(5);
        }

        AppendEventLog(state, new GameEventLogEntry
        {
            Type = "CommandoRaidSuccess",
            Message = $"Commando raid succeeded! {raid.InitiatorPlayerName}'s team captured ({raid.TargetQ}, {raid.TargetR}) and took {spoils} troops!",
            AllianceId = raid.InitiatorAllianceId,
            Q = raid.TargetQ,
            R = raid.TargetR
        });
    }
    else
    {
        AppendEventLog(state, new GameEventLogEntry
        {
            Type = "CommandoRaidFailed",
            Message = $"Commando raid failed at ({raid.TargetQ}, {raid.TargetR}) — defenders held their ground.",
            Q = raid.TargetQ,
            R = raid.TargetR
        });
    }
}
```

**Step 6: Remove old GPS-based CommandoRaid resolution from UpdatePlayerLocation in GameplayService.cs**

Find and delete the block starting with `// Phase 6: CommandoRaid — check if player arrived at target` (~lines 174-220).

**Step 7: Call ResolveExpiredCommandoRaids in TroopRegenerationService.cs**

In the regen tick loop (after processing each room), add:
```csharp
gameplayService.ResolveExpiredCommandoRaids(room.Code);
```

**Step 8: Update hub**

In `GameHub.Gameplay.cs`, update `ActivateCommandoRaid` to remove the old `playerLat/Lng` check — the new activation doesn't need them:
```csharp
public async Task ActivateCommandoRaid(int targetQ, int targetR)
{
    // ... existing room lookup ...
    var (state, error) = gameService.ActivateCommandoRaid(room.Code, UserId, targetQ, targetR);
    // ... existing error/broadcast ...
}
```

**Step 9: Update GameStateCommon.cs snapshot**

In `SnapshotState`, add `ActiveRaids` to the snapshot. Remove old per-player CommandoRaid fields.

**Step 10: Run tests**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "CommandoRaid" -v
```

**Step 11: Run full suite**
```bash
cd backend/Landgrab.Tests && dotnet test -v
```

**Step 12: Commit**
```bash
git add backend/ && git commit -m "feat: redesign CommandoRaid as game-level presence battle"
```

---

### Task 7: HQ Immunity to Normal Combat

**Files:**
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Tests/Services/GameplayServiceTests.cs`

**Step 1: Write failing test**

```csharp
[Fact]
public void PlaceTroops_OnEnemyHQHex_Fails()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", allianceId: "a1")
        .AddPlayer("p2", "Bob", allianceId: "a2")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .WithTroops(0, 0, 5)
        .OwnHex(1, 0, "p2", allianceId: "a2")
        .WithTroops(1, 0, 2)
        .WithCarriedTroops("p1", 5, 0, 0)
        .Build();
    // Mark (1, 0) as alliance a2's HQ
    state.Alliances.Add(new AllianceDto { Id = "a2", HQHexQ = 1, HQHexR = 0 });
    state.Dynamics.HQEnabled = true;
    var context = new ServiceTestContext(state);
    var (lat, lng) = ServiceTestContext.HexCenter(1, 0);

    var (result, error, _, _) = context.GameplayService.PlaceTroops(
        ServiceTestContext.RoomCode, "p1", 1, 0, lat, lng);

    error.Should().Contain("CommandoRaid");
    result.Should().BeNull();
}
```

**Step 2: Run to verify it fails**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "PlaceTroops_OnEnemyHQHex_Fails" -v
```

**Step 3: Add HQ immunity check in GameplayService.cs PlaceTroops**

In the combat branch of `PlaceTroops` (where `cell.OwnerId != null` and it's an enemy hex), add before combat resolution:
```csharp
// HQ tiles are immune to normal combat — must be captured via CommandoRaid
if (state.Dynamics.HQEnabled)
{
    var isHQHex = state.Alliances.Any(a => a.HQHexQ == q && a.HQHexR == r);
    if (isHQHex)
        return (null, "This is an HQ hex — it can only be captured via a Commander's Commando Raid.", null, null);
}
```

**Step 4: Run test to verify it passes**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "PlaceTroops_OnEnemyHQHex_Fails" -v
```

**Step 5: Run full suite and commit**
```bash
cd backend/Landgrab.Tests && dotnet test -v
git add backend/ && git commit -m "feat: HQ hexes immune to normal combat — CommandoRaid only"
```

---

### Task 8: Beacon → Scout Forward Observer (Fog Reveal)

**Files:**
- Modify: `backend/Landgrab.Api/Services/AbilityService.cs`
- Modify: `backend/Landgrab.Api/Services/GameStateService.cs`
- Modify: `backend/Landgrab.Tests/Services/AbilityServiceTests.cs`

**Step 1: Write failing test**

```csharp
[Fact]
public void ActivateBeacon_ByNonScout_Fails()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", role: PlayerRole.Commander)
        .Build();
    state.Dynamics.BeaconEnabled = true;
    var context = new ServiceTestContext(state);

    var (result, error) = context.AbilityService.ActivateBeacon(ServiceTestContext.RoomCode, "p1");

    error.Should().Contain("Scout");
    result.Should().BeNull();
}

[Fact]
public void GetVisibleHexKeys_WithActiveBeacon_RevealsSurroundingHexes()
{
    // The Scout at (0,0) has beacon active — allies at (5,5) should see hexes around (0,0)
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(10)
        .AddPlayer("p1", "Alice", role: PlayerRole.Scout, allianceId: "a1")
        .AddPlayer("p2", "Bob", allianceId: "a1")
        .OwnHex(5, 5, "p2", allianceId: "a1")
        .Build();
    state.Dynamics.FogOfWarEnabled = true;
    state.Dynamics.BeaconEnabled = true;
    state.Dynamics.PlayerRolesEnabled = true;
    var (beaconLat, beaconLng) = ServiceTestContext.HexCenter(0, 0);
    state.Players.First(p => p.Id == "p1").IsBeacon = true;
    state.Players.First(p => p.Id == "p1").BeaconLat = beaconLat;
    state.Players.First(p => p.Id == "p1").BeaconLng = beaconLng;

    var context = new ServiceTestContext(state);
    // p2 is the observer — their fog snapshot should reveal hexes near (0,0)
    var snapshot = context.GameStateService.GetPlayerSnapshot(state, "p2");

    var hexNearBeacon = snapshot.Grid[HexService.Key(0, 0)];
    hexNearBeacon.Troops.Should().Be(0); // revealed but empty
    // Without beacon, (0,0) would be hidden (no alliance ownership near it)
}
```

**Step 2: Run to verify they fail**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "Beacon" -v
```

**Step 3: Add Scout role check to ActivateBeacon in AbilityService.cs**

```csharp
if (!room.State.Dynamics.PlayerRolesEnabled)
    return (null, "Player roles are not active.");
if (player.Role != PlayerRole.Scout)
    return (null, "Only a Scout can activate the Beacon.");
```

**Step 4: Extend GetVisibleHexKeys in GameStateService.cs to include Beacon-revealed hexes**

In `GetVisibleHexKeys`, after the existing visibility logic, add:
```csharp
// Beacon: Scout alliance members reveal hexes around active beacons
if (state.Dynamics.BeaconEnabled && state.Dynamics.FogOfWarEnabled)
{
    var activeBeacons = state.Players
        .Where(p => p.IsBeacon
            && p.AllianceId == player.AllianceId
            && p.BeaconLat.HasValue && p.BeaconLng.HasValue
            && state.HasMapLocation)
        .ToList();

    foreach (var beacon in activeBeacons)
    {
        var beaconHex = HexService.LatLngToHexForRoom(
            beacon.BeaconLat!.Value, beacon.BeaconLng!.Value,
            state.MapLat!.Value, state.MapLng!.Value, state.TileSizeMeters);

        foreach (var neighbor in HexService.SpiralSearch(beaconHex.q, beaconHex.r, 3))
        {
            var nKey = HexService.Key(neighbor.q, neighbor.r);
            if (state.Grid.ContainsKey(nKey))
                visible.Add(nKey);
        }
    }
}
```

**Step 5: Run tests**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "Beacon" -v
```

**Step 6: Run full suite and commit**
```bash
cd backend/Landgrab.Tests && dotnet test -v
git add backend/ && git commit -m "feat: Beacon becomes Scout Forward Observer — reveals fog for alliance"
```

---

### Task 9: Reinforce → Rally Point (Commander)

**Files:**
- Modify: `backend/Landgrab.Api/Services/AbilityService.cs`
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Tests/Services/AbilityServiceTests.cs`

**Step 1: Add RallyPoint fields to PlayerDto in GameState.cs**

```csharp
// Replace ReinforceCooldownUntil with:
public bool RallyPointActive { get; set; }
public DateTime? RallyPointDeadline { get; set; }
public DateTime? RallyPointCooldownUntil { get; set; }
public int? RallyPointQ { get; set; }
public int? RallyPointR { get; set; }
```

**Step 2: Write failing tests**

```csharp
[Fact]
public void ActivateReinforce_ByNonCommander_Fails()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", role: PlayerRole.Scout, allianceId: "a1")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    var context = new ServiceTestContext(state);

    var (result, error) = context.AbilityService.ActivateReinforce(ServiceTestContext.RoomCode, "p1");

    error.Should().Contain("Commander");
}

[Fact]
public void ActivateReinforce_ByCommander_ActivatesRallyPoint()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", role: PlayerRole.Commander, allianceId: "a1")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    var context = new ServiceTestContext(state);
    var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
    state.Players.First(p => p.Id == "p1").CurrentLat = lat;
    state.Players.First(p => p.Id == "p1").CurrentLng = lng;

    var (result, error) = context.AbilityService.ActivateReinforce(ServiceTestContext.RoomCode, "p1");

    error.Should().BeNull();
    var commander = result!.Players.First(p => p.Id == "p1");
    commander.RallyPointActive.Should().BeTrue();
    commander.RallyPointDeadline.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(3), TimeSpan.FromSeconds(5));
}

[Fact]
public void ResolveRallyPoint_AlliesArrive_AddTroopsScaledToPlatoon()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", role: PlayerRole.Commander, allianceId: "a1")
        .AddPlayer("p2", "Bob", allianceId: "a1")
        .AddPlayer("p3", "Carol", allianceId: "a1")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .WithTroops(0, 0, 2)
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    state.Alliances.Add(new AllianceDto { Id = "a1", MemberIds = ["p1", "p2", "p3"] });
    var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
    // All three arrive at hex (0,0)
    foreach (var p in state.Players)
    { p.CurrentLat = lat; p.CurrentLng = lng; }
    state.Players.First(p => p.Id == "p1").RallyPointActive = true;
    state.Players.First(p => p.Id == "p1").RallyPointQ = 0;
    state.Players.First(p => p.Id == "p1").RallyPointR = 0;
    state.Players.First(p => p.Id == "p1").RallyPointDeadline = DateTime.UtcNow.AddSeconds(-1);

    var context = new ServiceTestContext(state);
    context.GameplayService.ResolveExpiredRallyPoints(ServiceTestContext.RoomCode);

    // 3 allies arrived → +2 per ally = +6 troops, capped at 2× platoon size (2×3=6)
    context.Cell(0, 0).Troops.Should().Be(8); // 2 base + 6 rally
}
```

**Step 3: Run to verify they fail**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "RallyPoint|Reinforce" -v
```

**Step 4: Rewrite ActivateReinforce in AbilityService.cs**

```csharp
public (GameState? state, string? error) ActivateReinforce(string roomCode, string userId)
{
    var room = GetRoom(roomCode);
    if (room == null) return (null, "Room not found.");

    lock (room.SyncRoot)
    {
        if (room.State.Phase != GamePhase.Playing)
            return (null, "Rally Point only works during gameplay.");
        if (!room.State.Dynamics.PlayerRolesEnabled)
            return (null, "Player roles are not active.");

        var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
        if (player == null) return (null, "Player not in room.");
        if (player.Role != PlayerRole.Commander)
            return (null, "Rally Point can only be activated by a Commander.");
        if (player.RallyPointCooldownUntil.HasValue && player.RallyPointCooldownUntil > DateTime.UtcNow)
            return (null, "Rally Point is on cooldown.");
        if (!TryGetCurrentHex(room.State, player, out var currentCell))
            return (null, "Your location is required to activate a Rally Point.");
        if (!IsFriendlyCell(player, currentCell))
            return (null, "Rally Point must be activated on a friendly hex.");

        player.RallyPointActive = true;
        player.RallyPointDeadline = DateTime.UtcNow.AddMinutes(3);
        player.RallyPointCooldownUntil = DateTime.UtcNow.AddMinutes(15);
        player.RallyPointQ = currentCell.Q;
        player.RallyPointR = currentCell.R;

        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "RallyPointActivated",
            Message = $"{player.Name} called a rally at ({currentCell.Q}, {currentCell.R})! Converge for bonus troops!",
            PlayerId = userId, PlayerName = player.Name,
            Q = currentCell.Q, R = currentCell.R
        });

        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }
}
```

**Step 5: Add ResolveExpiredRallyPoints to GameplayService.cs**

```csharp
public void ResolveExpiredRallyPoints(string roomCode)
{
    var room = GetRoom(roomCode);
    if (room == null) return;

    lock (room.SyncRoot)
    {
        var now = DateTime.UtcNow;
        var commanders = room.State.Players
            .Where(p => p.RallyPointActive && p.RallyPointDeadline <= now)
            .ToList();

        foreach (var commander in commanders)
        {
            if (commander.RallyPointQ == null || commander.RallyPointR == null) continue;
            var key = HexService.Key(commander.RallyPointQ.Value, commander.RallyPointR.Value);
            if (!room.State.Grid.TryGetValue(key, out var cell)) continue;

            var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == commander.AllianceId);
            var platoonSize = alliance?.MemberIds.Count ?? 1;
            var maxTroops = platoonSize * 2;

            var alliesAtRally = GetPlayersInHex(room.State, commander.RallyPointQ.Value, commander.RallyPointR.Value)
                .Where(p => p.AllianceId == commander.AllianceId)
                .ToList();

            var troopsToAdd = Math.Min(alliesAtRally.Count * 2, maxTroops);
            cell.Troops += troopsToAdd;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "RallyPointResolved",
                Message = $"Rally Point complete — {alliesAtRally.Count} scouts arrived, +{troopsToAdd} troops at ({commander.RallyPointQ}, {commander.RallyPointR}).",
                Q = commander.RallyPointQ, R = commander.RallyPointR
            });

            commander.RallyPointActive = false;
            commander.RallyPointDeadline = null;
            commander.RallyPointQ = null;
            commander.RallyPointR = null;
        }
    }
}
```

**Step 6: Call ResolveExpiredRallyPoints in TroopRegenerationService.cs tick**

**Step 7: Run tests and commit**
```bash
cd backend/Landgrab.Tests && dotnet test -v
git add backend/ && git commit -m "feat: redesign Reinforce as Rally Point — allies converge for troops"
```

---

### Task 10: EmergencyRepair → Sabotage (Engineer)

**Files:**
- Modify: `backend/Landgrab.Api/Services/AbilityService.cs`
- Modify: `backend/Landgrab.Api/Models/GameState.cs`
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Tests/Services/AbilityServiceTests.cs`

**Step 1: Update PlayerDto fields in GameState.cs**

Replace `EmergencyRepairCooldownUntil` with:
```csharp
public bool SabotageActive { get; set; }
public DateTime? SabotageStartedAt { get; set; }
public int? SabotageTargetQ { get; set; }
public int? SabotageTargetR { get; set; }
public DateTime? SabotageCooldownUntil { get; set; }
```

Add to `HexCell`:
```csharp
public DateTime? SabotagedUntil { get; set; }
```

**Step 2: Write failing tests**

```csharp
[Fact]
public void ActivateEmergencyRepair_OnEnemyHex_StartsSabotage()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", role: PlayerRole.Engineer, allianceId: "a1")
        .AddPlayer("p2", "Bob", allianceId: "a2")
        .OwnHex(1, 0, "p2", allianceId: "a2")
        .WithTroops(1, 0, 3)
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    var (lat, lng) = ServiceTestContext.HexCenter(1, 0);
    state.Players.First(p => p.Id == "p1").CurrentLat = lat;
    state.Players.First(p => p.Id == "p1").CurrentLng = lng;

    var context = new ServiceTestContext(state);
    var (result, error) = context.AbilityService.ActivateEmergencyRepair(ServiceTestContext.RoomCode, "p1");

    error.Should().BeNull();
    var engineer = result!.Players.First(p => p.Id == "p1");
    engineer.SabotageActive.Should().BeTrue();
    engineer.SabotageTargetQ.Should().Be(1);
    engineer.SabotageTargetR.Should().Be(0);
}

[Fact]
public void ResolveSabotage_EngineerStaysOneMinute_DisablesHexRegen()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", role: PlayerRole.Engineer, allianceId: "a1")
        .AddPlayer("p2", "Bob", allianceId: "a2")
        .OwnHex(1, 0, "p2", allianceId: "a2")
        .WithTroops(1, 0, 3)
        .Build();
    state.Dynamics.PlayerRolesEnabled = true;
    var (lat, lng) = ServiceTestContext.HexCenter(1, 0);
    var engineer = state.Players.First(p => p.Id == "p1");
    engineer.CurrentLat = lat;
    engineer.CurrentLng = lng;
    engineer.SabotageActive = true;
    engineer.SabotageStartedAt = DateTime.UtcNow.AddMinutes(-1).AddSeconds(-1); // 1 min elapsed
    engineer.SabotageTargetQ = 1;
    engineer.SabotageTargetR = 0;

    var context = new ServiceTestContext(state);
    context.GameplayService.ResolveActiveSabotages(ServiceTestContext.RoomCode);

    context.Cell(1, 0).SabotagedUntil.Should().NotBeNull();
    context.Cell(1, 0).SabotagedUntil!.Value.Should().BeCloseTo(
        DateTime.UtcNow.AddMinutes(10), TimeSpan.FromSeconds(10));
    engineer.SabotageActive.Should().BeFalse();
}
```

**Step 3: Rewrite ActivateEmergencyRepair in AbilityService.cs**

```csharp
public (GameState? state, string? error) ActivateEmergencyRepair(string roomCode, string userId)
{
    var room = GetRoom(roomCode);
    if (room == null) return (null, "Room not found.");

    lock (room.SyncRoot)
    {
        if (room.State.Phase != GamePhase.Playing)
            return (null, "Sabotage only works during gameplay.");
        if (!room.State.Dynamics.PlayerRolesEnabled)
            return (null, "Player roles are not active.");

        var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
        if (player == null) return (null, "Player not in room.");
        if (player.Role != PlayerRole.Engineer)
            return (null, "Sabotage can only be performed by an Engineer.");
        if (player.SabotageCooldownUntil.HasValue && player.SabotageCooldownUntil > DateTime.UtcNow)
            return (null, "Sabotage is on cooldown.");
        if (!TryGetCurrentHex(room.State, player, out var currentCell))
            return (null, "Your location is required to sabotage a hex.");
        if (IsFriendlyCell(player, currentCell) || currentCell.OwnerId == null)
            return (null, "You can only sabotage an enemy hex.");

        player.SabotageActive = true;
        player.SabotageStartedAt = DateTime.UtcNow;
        player.SabotageTargetQ = currentCell.Q;
        player.SabotageTargetR = currentCell.R;
        player.SabotageCooldownUntil = DateTime.UtcNow.AddMinutes(20);

        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "SabotageStarted",
            Message = $"{player.Name} is sabotaging ({currentCell.Q}, {currentCell.R})! Defend it!",
            PlayerId = userId, PlayerName = player.Name,
            Q = currentCell.Q, R = currentCell.R
        });

        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }
}
```

**Step 4: Add ResolveActiveSabotages to GameplayService.cs**

Called from the regen tick. Checks if engineer has been in the hex for ≥1 minute. If engineer left the hex, cancels. If complete, sets `cell.SabotagedUntil`.

```csharp
public void ResolveActiveSabotages(string roomCode)
{
    var room = GetRoom(roomCode);
    if (room == null) return;

    lock (room.SyncRoot)
    {
        var now = DateTime.UtcNow;
        var engineers = room.State.Players
            .Where(p => p.SabotageActive && p.SabotageTargetQ.HasValue)
            .ToList();

        foreach (var engineer in engineers)
        {
            var key = HexService.Key(engineer.SabotageTargetQ!.Value, engineer.SabotageTargetR!.Value);
            if (!room.State.Grid.TryGetValue(key, out var cell)) { engineer.SabotageActive = false; continue; }

            // Check engineer is still in the hex
            var stillPresent = TryGetCurrentHex(room.State, engineer, out var eq, out var er)
                && eq == engineer.SabotageTargetQ && er == engineer.SabotageTargetR;

            if (!stillPresent)
            {
                engineer.SabotageActive = false;
                engineer.SabotageStartedAt = null;
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "SabotageCancelled",
                    Message = $"{engineer.Name}'s sabotage was interrupted.",
                    Q = engineer.SabotageTargetQ, R = engineer.SabotageTargetR
                });
                continue;
            }

            if (engineer.SabotageStartedAt.HasValue &&
                (now - engineer.SabotageStartedAt.Value).TotalMinutes >= 1)
            {
                cell.SabotagedUntil = now.AddMinutes(10);
                engineer.SabotageActive = false;
                engineer.SabotageStartedAt = null;
                engineer.SabotageTargetQ = null;
                engineer.SabotageTargetR = null;

                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "SabotageComplete",
                    Message = $"Sabotage complete! ({cell.Q}, {cell.R}) will not regenerate troops for 10 minutes.",
                    Q = cell.Q, R = cell.R
                });
            }
        }
    }
}
```

**Step 5: Skip regen on sabotaged hexes in GameplayService.cs regen tick**

In the regen tick, add before adding troops to a cell:
```csharp
if (cell.SabotagedUntil.HasValue && cell.SabotagedUntil > now)
    continue; // Sabotaged — skip regen
if (cell.SabotagedUntil.HasValue && cell.SabotagedUntil <= now)
    cell.SabotagedUntil = null; // Sabotage expired — clear flag
```

**Step 6: Update GameStateCommon.cs snapshot** to include `SabotagedUntil` on HexCell and new engineer fields.

**Step 7: Run tests and commit**
```bash
cd backend/Landgrab.Tests && dotnet test -v
git add backend/ && git commit -m "feat: redesign EmergencyRepair as Sabotage — disable enemy hex regen"
```

---

### Task 11: Presence-Boosted Troop Regeneration

**Files:**
- Modify: `backend/Landgrab.Api/Services/GameplayService.cs`
- Modify: `backend/Landgrab.Tests/Services/GameplayServiceTests.cs`

**Step 1: Write failing test**

```csharp
[Fact]
public void AddReinforcements_HexWithFriendlyPresence_RegeneratesAtTripleRate()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", allianceId: "a1")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .WithTroops(0, 0, 3)
        .Build();
    // Place p1 physically at (0,0)
    var (lat, lng) = ServiceTestContext.HexCenter(0, 0);
    state.Players.First(p => p.Id == "p1").CurrentLat = lat;
    state.Players.First(p => p.Id == "p1").CurrentLng = lng;
    var context = new ServiceTestContext(state);

    context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

    // Base regen is 1, presence multiplier is 3x → expect 3 added = total 6
    context.Cell(0, 0).Troops.Should().Be(6);
}

[Fact]
public void AddReinforcements_HexWithoutPresence_RegeneratesAtBaseRate()
{
    var state = ServiceTestContext.CreateBuilder()
        .WithGrid(3)
        .AddPlayer("p1", "Alice", allianceId: "a1")
        .OwnHex(0, 0, "p1", allianceId: "a1")
        .WithTroops(0, 0, 3)
        .Build();
    // p1 has no location set
    var context = new ServiceTestContext(state);

    context.GameplayService.AddReinforcementsToAllHexes(ServiceTestContext.RoomCode);

    context.Cell(0, 0).Troops.Should().Be(4); // base +1
}
```

**Step 2: Run to verify they fail**
```bash
cd backend/Landgrab.Tests && dotnet test --filter "AddReinforcements.*Presence" -v
```

**Step 3: Add presence multiplier to regen tick in GameplayService.cs**

In the regen loop, find where `cell.Troops += baseRegen` (or equivalent) is computed. Add:

```csharp
// Presence bonus: 3× regen if a friendly player is physically on this hex
var friendlyPresent = GetPlayersInHex(state, cell.Q, cell.R)
    .Any(p => IsFriendlyCell(p, cell));
var presenceMultiplier = friendlyPresent ? 3 : 1;
var troopsToAdd = baseRegen * presenceMultiplier;
cell.Troops += troopsToAdd;
```

**Step 4: Run tests and commit**
```bash
cd backend/Landgrab.Tests && dotnet test -v
git add backend/ && git commit -m "feat: presence-boosted troop regen — 3× when friendly player on hex"
```

---

## Phase 3: Frontend

### Task 12: Frontend Cleanup — Remove Deprecated Mechanics

Remove UI for: ReClaimHex, AllowSelfClaim, SupplyLinesEnabled, RushHour host event, Defender role, ShieldWall.

**Files:**
- Modify: `frontend/landgrab-ui/src/components/game/TileActionPanel.tsx` — remove ReClaimHex buttons
- Modify: `frontend/landgrab-ui/src/components/game/AbilityBar.tsx` — remove ShieldWall button
- Modify: `frontend/landgrab-ui/src/components/lobby/RolesStep.tsx` — remove Defender from role list
- Modify: `frontend/landgrab-ui/src/components/lobby/RoleSelector.tsx` — remove Defender option
- Modify: `frontend/landgrab-ui/src/components/lobby/RoleModal.tsx` — remove Defender
- Modify: `frontend/landgrab-ui/src/components/lobby/roleModalUtils.ts` — remove Defender
- Modify: `frontend/landgrab-ui/src/components/game/HostControlPlane.tsx` — remove RushHour event trigger
- Modify: `frontend/landgrab-ui/src/components/game/PlayingHud.tsx` — remove AllowSelfClaim toggle if present
- Modify: `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts` — remove handlers for deprecated events
- Modify: `frontend/landgrab-ui/src/i18n/en.ts` + `nl.ts` — remove strings for removed mechanics

**Steps:**

1. Search for `ReClaimHex`, `ShieldWall`, `SupplyLines`, `RushHour`, `Defender`, `AllowSelfClaim`, `claimForSelf` across the frontend:
```bash
cd frontend/landgrab-ui && grep -rn "ReClaimHex\|ShieldWall\|SupplyLines\|RushHour\|Defender\|AllowSelfClaim\|claimForSelf" src/ --include="*.ts" --include="*.tsx"
```

2. Remove each occurrence. UI elements: delete the button/toggle. Handlers: delete the function. i18n keys: delete the entry in both `en.ts` and `nl.ts`.

3. Build to verify no TypeScript errors:
```bash
cd frontend/landgrab-ui && npm run build
```

4. Commit:
```bash
git add frontend/ && git commit -m "feat: remove deprecated mechanics from frontend UI"
```

---

### Task 13: Frontend — CommandoRaid Presence Battle UI

**Files:**
- Modify: `frontend/landgrab-ui/src/components/game/AbilityBar.tsx`
- Modify: `frontend/landgrab-ui/src/components/game/TileActionPanel.tsx`
- Modify: `frontend/landgrab-ui/src/components/game/map/HexGridLayer.ts`
- Modify: `frontend/landgrab-ui/src/components/game/map/hexRendering.ts`
- Modify: `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`
- Modify: `frontend/landgrab-ui/src/i18n/en.ts` + `nl.ts`
- Modify: `frontend/landgrab-ui/src/stores/gameStore.ts`

**Key changes:**

1. **Store**: Add `activeRaids: ActiveCommandoRaid[]` to `gameStore` state (sourced from `GameState.ActiveRaids`).

2. **Map rendering**: In `hexRendering.ts`, highlight the target hex of active raids with a pulsing border (both teams see it). Use a distinct color (e.g. red pulsing ring).

3. **AbilityBar**: Show CommandoRaid button for Commander role only. Disabled while a raid is active for the player's alliance.

4. **TileActionPanel**: When Commander taps an enemy hex and no raid is active, show "Launch Commando Raid" button. Show the 40% gate message if conditions not met.

5. **SignalR handlers**: Handle `CommandoRaidStarted`, `CommandoRaidSuccess`, `CommandoRaidFailed` events — show toast notification to all players.

6. **Countdown display**: Show a countdown timer on the raided hex (visible to both attacker and defender maps).

7. **i18n**: Add keys for all new strings.

**Build and commit:**
```bash
cd frontend/landgrab-ui && npm run build
git add frontend/ && git commit -m "feat: CommandoRaid presence battle UI — countdown, map highlight, notifications"
```

---

### Task 14: Frontend — Beacon Forward Observer UI

**Files:**
- Modify: `frontend/landgrab-ui/src/components/game/AbilityBar.tsx`
- Modify: `frontend/landgrab-ui/src/components/game/map/hexRendering.ts`
- Modify: `frontend/landgrab-ui/src/i18n/en.ts` + `nl.ts`

**Key changes:**

1. Show Beacon button in `AbilityBar` for Scout role only.
2. When beacon is active, show a radius indicator on the map around the Scout's position showing the revealed area.
3. Update button label: "Forward Observer" (activated) / "Activate Beacon" (idle).
4. Add i18n keys.

```bash
cd frontend/landgrab-ui && npm run build
git add frontend/ && git commit -m "feat: Beacon Forward Observer UI — Scout ability with fog reveal indicator"
```

---

### Task 15: Frontend — Rally Point and Sabotage UI

**Files:**
- Modify: `frontend/landgrab-ui/src/components/game/AbilityBar.tsx`
- Modify: `frontend/landgrab-ui/src/components/game/TileInfoCard.tsx`
- Modify: `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`
- Modify: `frontend/landgrab-ui/src/i18n/en.ts` + `nl.ts`

**Key changes:**

**Rally Point:**
1. Rename "Reinforce" button to "Rally Point" in `AbilityBar` (Commander only).
2. When active, show a rally marker on the map at the Commander's hex with the countdown.
3. Handle `RallyPointActivated` and `RallyPointResolved` SignalR events with toast notifications.

**Sabotage:**
1. Rename "Emergency Repair" button to "Sabotage" in `AbilityBar` (Engineer only).
2. In `TileInfoCard`, show a sabotage countdown timer on enemy hexes being sabotaged (1-minute completion timer) and a "sabotaged" indicator on hexes where regen is disabled (`SabotagedUntil` is set).
3. Handle `SabotageStarted`, `SabotageCancelled`, `SabotageComplete` SignalR events with toast notifications.
4. Show the `SabotagedUntil` remaining time on the tile info card.

```bash
cd frontend/landgrab-ui && npm run build
git add frontend/ && git commit -m "feat: Rally Point and Sabotage UI — renamed abilities with live timers"
```

---

### Task 16: Frontend — Presence Regen Boost Indicator

**Files:**
- Modify: `frontend/landgrab-ui/src/components/game/map/hexRendering.ts`
- Modify: `frontend/landgrab-ui/src/components/game/TileInfoCard.tsx`

**Key changes:**

1. In hex rendering, show a subtle glow or indicator on friendly hexes where the local player is physically present, signalling the 3× regen boost.
2. In `TileInfoCard`, show "Boosted regen (3×) — you are here" when the player is on their own tile.

```bash
cd frontend/landgrab-ui && npm run build
git add frontend/ && git commit -m "feat: presence regen boost indicator on map and tile info"
```

---

## Final Verification

```bash
# Backend
cd backend/Landgrab.Tests && dotnet test -v

# Frontend
cd frontend/landgrab-ui && npm run build && npm run lint
```

Confirm all tests pass and the frontend builds cleanly before marking the feature branch ready for review.
