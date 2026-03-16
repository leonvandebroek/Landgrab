# Background Services - Unit Testing Quick Reference

## Overview Table

| Service | Timer | Flag Check | Core Methods | Complexity |
|---------|-------|-----------|--------------|-----------|
| **TroopRegenerationService** | 30s | `IsPaused` | `AddReinforcementsToAllHexes()`, `ProcessDuelExpiry()` | **Very High** (11 reinforcement phases) |
| **MissionService** | 5min | `MissionSystemEnabled` + `IsPaused` | `GenerateInitialMissions()`, `EvaluateMissionProgress()`, `ApplyMissionReward()` | **High** (9 mission types) |
| **RandomEventService** | 10min | `RandomEventsEnabled` + `IsPaused` | `ApplyRandomEvent()` with 4 event types | **Medium** |

---

## TroopRegenerationService - Core Logic to Test

### 1. Base Reinforcement (Line 879)
```
Every owned/master hex: +1 troop/tick
```
**Test:** Hex with 0 troops → after tick → 1 troop ✓

### 2-8. Feature-Gated Reinforcement Rules

| Rule | Feature | Condition | Effect | Lines |
|------|---------|-----------|--------|-------|
| Drain Copresence | `Drain` mode | Hostile player in hex | Skip regen | 843-850 |
| Shepherd Decay | `Shepherd` mode | Unvisited >3min | -1 troop, skip normal | 854-868 |
| Supply Lines | `SupplyLinesEnabled` | Isolated hex (BFS) | Skip regen | 872-876 |
| Timed Escalation | `TimedEscalationEnabled` | +1 per 30min elapsed | +escalationBonus | 881-882 |
| Terrain Bonus | `TerrainEnabled` | Building terrain | +1 extra | 885-886 |
| Defender Bonus | `PlayerRolesEnabled` | Defender physically present | +1 extra (double total) | 889-894 |
| PresenceBattle | `PresenceBattle` mode | Hostile/friendly copresence | Contest progress ±0.1; capture at 1.0 | 899-956 |
| Rush Hour | IsRushHour flag | Triggered by RandomEvent | Claimed hexes count double (intent; reset after tick) | 764-768 |

**Test Approach:**
- Create GameState with specific features enabled/disabled
- Place players, set terrain, set troop counts
- Call `gameplayService.AddReinforcementsToAllHexes(roomCode)` directly
- Verify troop deltas match expected formula

### 3. Duel Expiry (ProcessDuelExpiry)
**Test:** Pending duel with `ExpiresAt < now` → removed from `room.PendingDuels`

### 4. Fog of War Broadcast
**Test:** Feature enabled → `GetPlayerSnapshot()` called per player with correct userId

---

## MissionService - Core Logic to Test

### 1. Mission Generation Schedule

| Trigger | Count | Scope | Timing |
|---------|-------|-------|--------|
| **Initial** | 1 main + N team + N personal | Once per game | When `Missions.Count == 0` |
| **Interim (Room-wide)** | 1 random from pool | Every 30min | If `(now - lastGen) >= 30min` |
| **Interim (Per-player refresh)** | 1 personal per player | Every 30min | If no active personal mission |

### 2. Mission Types & Objectives

#### Main Mission (1x game)
- **"Hold the Hill"** - Control center hex (MasterTile) for 10 min
  - Progress: +0.5 per 5min tick (=1.0 in 2 ticks)
  - Reward: +5 troops to random hex

#### Team Missions (1x per alliance) - 3 Templates
| Mission | Objective | Progress Formula | Reward |
|---------|-----------|-----------------|--------|
| Divide & Conquer | Own hexes in 3 quadrants | `quadrants / 3` | +3 troops random |
| Encirclement | Surround enemy hex on 6 sides | Max surrounded ratio or 1.0 if full surround | +5 troops random |
| Territory Rush | Claim 5 hexes | `ownedCount / 5` | +3 troops random |

#### Personal Missions (1x per player) - 3 Templates
| Mission | Objective | Progress Formula | Reward |
|---------|-----------|-----------------|--------|
| Scout Patrol | Visit 8 hexes | `visitedCount / 8` | +2 troops all hexes |
| Frontline Fighter | Win 2 attacks | `ownedCount / 2` (proxy) | +3 troops random |
| Fortifier | Reinforce 3 hexes to 5+ troops | `fortifiedCount / 3` | +3 troops random |

#### Interim Missions (1x per 30min) - 2 Templates
| Mission | Objective | Duration | Progress | Reward |
|---------|-----------|----------|----------|--------|
| Flag Planting | Claim 3 neutral hexes | 10min | `claimedCount / 3` (rough) | +3 troops random |
| Last Defender | Don't lose hexes for 5min | 5min | Set to 1.0 initially; reset if territory drops | +5 troops random |

### 3. Progress Evaluation (9 Objective Types)

**Extract for testing:** `EvaluateMissionProgress(GameState state, Mission mission)` (private → use reflection or extract)

```csharp
// Test each objective type with edge cases:
EvaluateHoldCenter(state, mission)        // +0.5 per tick if center owned
EvaluateOwnQuadrants(state, mission)      // Count distinct quadrants
EvaluateSurroundEnemy(state, mission)     // BFS check or max ratio
EvaluateClaimCount(state, mission, obj)   // Owned hex count / target
EvaluateVisitHexes(state, mission, obj)   // Player.VisitedHexes.Count / target
EvaluateWinAttacksApprox(state, mission, obj) // Owned hex count / target (proxy)
EvaluateFortifyHexes(state, mission, obj) // Count hexes with ≥5 troops / target
EvaluateClaimNeutral(state, mission, obj) // Total owned / target (rough)
EvaluateNoLosses(state, mission)          // Set to 1.0; reset if drops
```

### 4. Reward Application

**Extract for testing:** `ApplyMissionReward(GameState state, Mission mission)` (private)

**Logic:**
1. Get target hexes: 
   - Personal → all hex owned by `mission.TargetPlayerId` (non-master)
   - Team → all hex owned by `mission.TargetTeamId` (non-master)
   - Main/Interim → all hexes with any owner (non-master)

2. Apply reward:
   - "troops to all hexes" → add to all targets
   - "troops to random hex" → add to one random target
   - Parse "+N" from reward string; fallback to 3

### 5. Status Transitions

```
Active → Completed: progress >= 1.0 → apply reward, broadcast "MissionCompleted"
Active → Expired: ExpiresAt < now → broadcast "MissionFailed" (no reward)
New → Active: on broadcast
```

---

## RandomEventService - Core Logic to Test

### Event Type Pool
```csharp
["Calamity", "Epidemic", "BonusTroops", "RushHour"]
```

### Event Effects

| Event | Trigger | Effect | Log Message |
|-------|---------|--------|-------------|
| **Calamity** | Random owned hex with troops | Troops → 0 | "Calamity! Hex ({Q},{R}) lost all troops." |
| **Epidemic** | Largest alliance (by TerritoryCount) | Random hex: troops -= 2 (min 0) | "Epidemic! {AllianceName} lost 2 troops at ({Q},{R})." |
| **BonusTroops** | All alliances with ≥1 hex | Each gets +2 to random hex | "Bonus Troops! Every team received +2 troops." |
| **RushHour** | Set global flag | `IsRushHour = true`; reset after ~30s | "Rush Hour! Claimed hexes count double for 5 minutes." |

**Test Approach:**
- Mock `Random.Shared.Next()` or inject random source
- Call `ApplyRandomEvent(gameService, room, cancellationToken)` directly (private → extract or reflect)
- Verify state mutations and event log entries
- Verify SignalR broadcasts to room (mock hubContext)

---

## GameService Delegates - Key Methods

### Core Gameplay Logic
- **`AddReinforcementsToAllHexes(roomCode)`** ← TroopRegenerationService
  - **File:** GameplayService.cs:752-966
  - **Features:** 11 phases of reinforcement logic
  - **Private helpers:**
    - `GetPlayersInHex(state, q, r)` - Line 1076
    - `SetCellOwner(cell, player)` - Line 1098
    - Supply lines BFS (lines 788-838)

- **`ProcessDuelExpiry(room)`** ← TroopRegenerationService  
  - **File:** DuelService.cs:200-209
  - **Logic:** Remove duels with `ExpiresAt < now`

### State Snapshot & Broadcasting
- **`SnapshotStatePublic(state)`** - Serialize game state
- **`AppendEventLogPublic(state, entry)`** - Add event log entry
- **`GetPlayerSnapshot(state, userId, [hiddenFogCells])`** - Filter state per player
- **`CreateHiddenFogCellsForBroadcast(state)`** - Generate hidden cells for fog of war

### Room & Lobby
- **`GetPlayingRoomCodes()`** - List active rooms
- **`GetRoom(roomCode)`** - Fetch room by code

---

## Testing Infrastructure (Existing)

### ServiceTestContext
Location: `backend/Landgrab.Tests/TestSupport/ServiceTestContext.cs`

**Features:**
- Mocks `IGameRoomProvider` and loggers
- Provides `GameStateService`, `GameplayService`, `DuelService`, `AbilityService`
- Helper methods: `Player(id)`, `Cell(q, r)`, `HexCenter(q, r)`

### GameStateBuilder
Location: `backend/Landgrab.Tests/TestSupport/GameStateBuilder.cs`

**Fluent API:**
```csharp
ServiceTestContext.CreateBuilder()
    .WithGrid(2)
    .WithMasterTile(0, 0)
    .WithPhase(GamePhase.Playing)
    .WithCopresenceModes(CopresenceMode.Drain)
    .WithTerrainEnabled()
    .WithSupplyLinesEnabled()
    .AddPlayer("p1", "Alice")
    .AddAlliance("a1", "Team A", "p1")
    .OwnHex(1, 0, "p1", "a1", troops: 5)
    .WithPlayerPosition("p1", 1, 0)
    .Build()
```

**Extend with:**
- `.WithMissionSystemEnabled()`
- `.WithRandomEventsEnabled()`
- `.WithFogOfWarEnabled()`
- `.WithMissions(List<Mission>)`
- `.WithDuels(List<PendingDuel>)`
- `.WithLastMissionGeneration(roomCode, DateTime)`

---

## Testing Pattern Summary

### 1. Avoid Timer Loops
✗ Don't: Instantiate service and wait for background task
✓ Do: Extract core logic into static/testable methods

```csharp
// Before: Tightly coupled to timer
public sealed class TroopRegenerationService(IServiceScopeFactory scopeFactory, IHubContext<GameHub> hubContext)
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            // ... logic ...
        }
    }
}

// After: Testable
public sealed class TroopRegenerationService(IServiceScopeFactory scopeFactory, IHubContext<GameHub> hubContext)
{
    private async Task ProcessReinforcementTick(GameService gameService, GameRoom room, CancellationToken ct)
    {
        // Extracted logic - testable without timer
        var (state, error) = gameService.AddReinforcementsToAllHexes(room.Code);
        gameService.ProcessDuelExpiry(room);
        // ... broadcast ...
    }
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            // Call ProcessReinforcementTick(...)
        }
    }
}
```

### 2. Mock External Dependencies
- `IServiceScopeFactory` - Return mock service scope
- `IHubContext<GameHub>` - Mock client proxies
- `ILogger<T>` - Mock or use no-op
- `Random.Shared` - Mock or inject `Random` parameter

### 3. Test State Mutations in Lock
```csharp
lock (room.SyncRoot)
{
    // Changes here are atomic; tests don't need concurrent access
    var (state, error) = gameService.AddReinforcementsToAllHexes(roomCode);
    Assert.NotNull(state);
    Assert.Null(error);
    Assert.Equal(expectedTroops, state.Grid[...].Troops);
}
```

### 4. Use Feature Flags
```csharp
var state = ServiceTestContext.CreateBuilder()
    .WithTerrainEnabled(true)
    .WithSupplyLinesEnabled(false)
    .WithCopresenceModes(CopresenceMode.Drain)
    .Build();
```

### 5. Test Private Methods
Use **reflection** or **extract to static**:
```csharp
// Via reflection (xUnit + System.Reflection)
var method = typeof(MissionService).GetMethod("EvaluateMissionProgress", 
    System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
method?.Invoke(null, new object[] { state, mission });

// Or extract to static utility:
internal static class MissionEvaluators
{
    public static void EvaluateHoldCenter(GameState state, Mission mission) { ... }
    public static void EvaluateOwnQuadrants(GameState state, Mission mission) { ... }
}
```

---

## Key Test Targets by Service

### TroopRegenerationService
- [ ] Base regen: +1 troop per owned hex
- [ ] Drain mode: skip regen if hostile copresent
- [ ] Shepherd decay: -1 if unvisited >3min
- [ ] Supply lines: BFS isolation check
- [ ] Escalation bonus: +1 per 30min
- [ ] Terrain building: +1 extra
- [ ] Defender role: double regen
- [ ] PresenceBattle: contest progress/capture
- [ ] Rush hour: flag set/reset
- [ ] Duel expiry: old duels removed
- [ ] Game over broadcast: on terminal phase

### MissionService
- [ ] Initial generation: 1 main + N team + N personal
- [ ] Interim generation: schedule every 30min
- [ ] Interim per-player refresh: skip if active personal exists
- [ ] Mission progress: each of 9 objective types
- [ ] Status transitions: active → completed/expired
- [ ] Reward application: correct hex selection + troop count
- [ ] Reward parsing: extract "+N" from string
- [ ] Broadcast: correct clients per scope

### RandomEventService
- [ ] Event selection: uniform distribution (can mock Random)
- [ ] Calamity: target hex troops → 0
- [ ] Epidemic: largest alliance's hex troops -= 2
- [ ] BonusTroops: all alliances' hexes += 2
- [ ] RushHour: flag set; decays in AddReinforcementsToAllHexes
- [ ] Event logging: entries appended
- [ ] Broadcast: StateUpdated + RandomEvent to group

