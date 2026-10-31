# Landgrab Background Services Analysis

## Executive Summary

Three background services manage automated game dynamics:
1. **TroopRegenerationService** - 30s ticker for reinforcements & duel cleanup
2. **MissionService** - 5min ticker for mission generation, progress evaluation, and reward distribution
3. **RandomEventService** - 10min ticker for room-wide random events (~33% chance per tick)

All three follow the same architectural pattern: loop through active rooms, check feature flag + pause state, apply core logic in a lock, then broadcast updates via SignalR.

---

## 1. TroopRegenerationService

**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Api/Services/TroopRegenerationService.cs`

### Timer & Frequency
- **Interval:** 30 seconds (PeriodicTimer)
- **Frequency:** ~720 times/hour per room

### Feature Flag
- No explicit flag—runs whenever a room is in "Playing" state and not paused
- Respects `room.State.IsPaused` to skip execution

### Core Business Logic (via GameService delegates)

#### Phase 8.1: Rush Hour Auto-End
- **Method:** `gameplayService.AddReinforcementsToAllHexes()` (line 764-768)
- **Logic:** 
  - Checks `room.State.IsRushHour` flag
  - Sets it to `false` after any tick (simplified: lasts only one ~30s regen cycle)
  - Original design intent: 5-minute duration, but currently resets every 30s
- **Testing Seam:** Mock `room.State.IsRushHour`; verify it gets set to false each cycle

#### Phase 7: Troop Reinforcements (Main Loop)
- **Method:** `gameplayService.AddReinforcementsToAllHexes()` (lines 752-966)
- **Core Rules:**
  1. **Base Regen:** Every owned/master hex gets +1 troop per tick (line 879)
  2. **Drain Copresence Mode:** Skip regen if hostile player physically present (lines 843-850)
  3. **Shepherd Mode:** Decay -1 troop if unvisited >3 min; skip normal regen (lines 854-868)
  4. **Supply Lines Mode:** BFS from first owned hex per alliance; isolated hexes skip regen (lines 784-838, 872-876)
  5. **Timed Escalation:** +1 bonus per 30 min elapsed (lines 775-779, 881-882)
  6. **Terrain Building:** +1 extra regen (lines 885-886)
  7. **Defender Role:** Double regen when Defender is physically present in own hex (lines 889-894)
  8. **PresenceBattle Mode:** Contest progress shifts ±0.1 per friendly/hostile; capture at 1.0 (lines 899-956)

#### Phase 10: Duel Expiry
- **Method:** `duelService.ProcessDuelExpiry(room)` (line 34)
- **Logic:** Remove expired duels from `room.PendingDuels` (timestamp check)
- **Testing Seam:** Create pending duel with past `ExpiresAt`; verify removed

#### Phase 7: Fog of War Broadcast (Per-Player)
- **Method:** `gameService.CreateHiddenFogCellsForBroadcast(state)` + `gameService.GetPlayerSnapshot(state, userId, hiddenFogCells)`
- **Logic:** If FogOfWar enabled, send different state snapshot to each player with hidden cells
- **Testing Seam:** Mock `GetPlayerSnapshot` to verify it's called with correct userId/hiddenCells

#### Game Over Check
- **Logic:** If `state.Phase == GamePhase.GameOver`, broadcast "GameOver" event (lines 57-65)

### Private Methods & Helpers
- **GetPlayersInHex(state, q, r)** (GameplayService, line 1076): Filters players by hex proximity using map coordinates
- **SetCellOwner()** (GameplayService, line 1098): Updates ownership + color
- **Supply Lines BFS** (lines 788-838): Breadth-first search to find connected alliance territory

### Testing Seams (to avoid timer)
1. **Inject GameService mock** into service constructor
2. **Mock `GetPlayingRoomCodes()`** to return test room codes
3. **Mock `AddReinforcementsToAllHexes()`** to verify call count/params
4. **Call the service's public `ExecuteAsync()` manually** with a CancellationToken that fires after one tick
5. **Or extract core logic** into private testable method (e.g., `ProcessReinforcementTick(GameService, GameRoom)`)

---

## 2. MissionService

**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Api/Services/MissionService.cs`

### Timer & Frequency
- **Interval:** 5 minutes (PeriodicTimer)
- **Frequency:** ~288 times/hour per room

### Feature Flag
- **Check:** `room.State.Dynamics.MissionSystemEnabled` (line 70)
- Also respects `room.State.IsPaused`

### Core Business Logic

#### Mission Generation
- **Timing:**
  - **Initial:** On first tick, if `state.Missions.Count == 0` (line 99)
  - **Interim:** Every ~30 min `(now - lastGen).TotalMinutes >= 30` (line 109)

##### Initial Mission Generation (Line 168-195)
Creates:
1. **Main Mission** (1x per game): "Hold the Hill" (control center hex for 10 min)
2. **Team Missions** (1x per alliance): Random from `TeamMissionPool` (3 templates):
   - "Divide and Conquer" - Own hexes in 3 quadrants
   - "Encirclement" - Surround enemy hex on all 6 sides
   - "Territory Rush" - Claim 5 hexes
3. **Personal Missions** (1x per player): Random from `PersonalMissionPool` (3 templates):
   - "Scout Patrol" - Visit 8 hexes
   - "Frontline Fighter" - Win 2 attacks (approx via territory count)
   - "Fortifier" - Reinforce 3 hexes to 5+ troops

##### Interim Mission Generation (Line 210-230)
- **Room-wide:** 1 random from `InterimMissionPool` (2 templates):
  - "Flag Planting" (10min) - Claim 3 neutral hexes
  - "Last Defender" (5min) - Don't lose any hexes for 5 minutes
- **Per-player refresh:** 1 personal mission if player has no active personal mission
- **Expiry:** Interim missions have `ExpiresAt = now + template.Duration`

#### Mission Progress Evaluation (Lines 291-478)
Each mission's `Progress` is calculated 0.0–1.0 based on objective:

| Objective | Formula | Notes |
|-----------|---------|-------|
| `HoldCenter` | +0.5 per tick if center is owned (max 1.0 in 2 ticks = 10 min) | Line 337-348 |
| `OwnQuadrants` | Count unique quadrants / 3 | Line 351-365 |
| `SurroundEnemy` | Check if any enemy hex has all 6 neighbors owned; else best ratio | Line 368-415 |
| `ClaimCount:N` | Owned hex count / N | Line 418-424 |
| `VisitHexes:N` | Player's `VisitedHexes.Count / N` | Line 427-435 |
| `WinAttacks:N` | Player's owned hex count / N (proxy for attacks won) | Line 438-449 |
| `FortifyHexes:N` | Count of player's hexes with ≥5 troops / N | Line 452-458 |
| `ClaimNeutral:N` | Total owned hexes in grid / N (rough proxy) | Line 461-470 |
| `NoLosses` | Set to 1.0 initially; remains unless territory drops (simplified) | Line 329-333 |

**Testing Seams:**
- Call `EvaluateMissionProgress(state, mission)` directly (private method → extract or use reflection)
- Construct minimal `GameState` with specific hex ownership/player positions
- Verify progress values at various thresholds

#### Mission Completion & Expiry (Lines 119-135)
```csharp
if (mission.Progress >= 1.0)
{
    mission.Status = "Completed";
    ApplyMissionReward(state, mission);
    completedMissions.Add(mission);
}
else if (mission.ExpiresAt.HasValue && now > mission.ExpiresAt.Value)
{
    mission.Status = "Expired";
    failedMissions.Add(mission);
}
```

#### Reward Application (Lines 482-538)
Applied when mission status changes to "Completed":

1. **Determine target hexes:**
   - Personal scope: All non-master hexes owned by `mission.TargetPlayerId` (line 510-512)
   - Team scope: All non-master hexes owned by `mission.TargetTeamId` (line 515-519)
   - Main/Interim: All non-master hexes with any owner (line 523-525)

2. **Apply troop bonus:**
   - "troops to all hexes" → Add to all target hexes (line 490-495)
   - "troops to random hex" → Add to one random target hex (line 497-502)
   - **Parsing:** Extract number after '+' in reward string (line 528-537)

**Testing Seams:**
- Call `ApplyMissionReward(state, mission)` directly (private → extract or reflection)
- Verify `HexCell.Troops` increment on correct cells
- Test edge case: no valid target hexes

### Private Methods to Target
- **`EvaluateMissionProgress()`** - Complex logic with 8+ objective types
- **`ApplyMissionReward()`** - Troop distribution logic
- **`GetRewardTargetHexes()`** - Hex filtering by scope
- **`GenerateInitialMissions()`** - Template selection & mission creation
- **`GenerateInterimMissions()`** - Interim + refresh logic
- **`ParseRewardTroops()`** - String parsing fallback to 3
- **`GetMissionTargetClients()`** - SignalR client targeting (public via hubContext call)

### Testing Seams (to avoid timer)
1. **Extract ProcessMissions() loop** into a testable static method
2. **Create GameState builder method**: `WithMissionSystemEnabled()`, `WithMissions()`
3. **Mock GameService** to return test room codes
4. **Call evaluation methods directly** with constructed game states
5. **Verify mission list mutations** inside the lock (Progress, Status, expirations)
6. **Test reward application** by checking hex troop counts before/after
7. **Mock hubContext** (IHubContext<GameHub>) to verify SignalR broadcasts

---

## 3. RandomEventService

**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Api/Services/RandomEventService.cs`

### Timer & Frequency
- **Interval:** 10 minutes (PeriodicTimer)
- **Check Frequency:** ~144 times/hour per room
- **Fire Rate:** ~33% chance per tick → ~every 30 min on average

### Feature Flag
- **Check:** `room.State.Dynamics.RandomEventsEnabled` (line 32)
- Also respects `room.State.IsPaused`

### Core Business Logic

#### Event Type Pool
```csharp
private static readonly string[] EventTypes = ["Calamity", "Epidemic", "BonusTroops", "RushHour"];
```

#### 1. Calamity Event (Line 64-82)
- **Trigger:** Select random owned non-master hex with troops > 0
- **Effect:** Set `target.Troops = 0` (total wipeout)
- **Log:** `"Calamity! Hex ({Q}, {R}) lost all troops."`
- **Testing:** Construct state with owned hex; call event; verify troops = 0

#### 2. Epidemic Event (Line 85-111)
- **Trigger:** Find largest alliance by `TerritoryCount`
- **Effect:** Select random owned non-master hex from that alliance with troops > 0; subtract 2 troops (min 0)
- **Log:** `"Epidemic! {AllianceName} lost 2 troops at ({Q}, {R})."`
- **Testing:** Create 2 alliances with different territory counts; verify largest loses troops

#### 3. BonusTroops Event (Line 114-129)
- **Trigger:** Every alliance with at least one non-master hex
- **Effect:** Add 2 troops to a random hex per alliance (if hex exists)
- **Log:** `"Bonus Troops! Every team received +2 troops."`
- **Testing:** Verify each alliance's hex gets +2 (or state has no such hex)

#### 4. RushHour Event (Line 132-141)
- **Trigger:** Set `room.State.IsRushHour = true`
- **Effect:** Claimed hexes count double for 5 minutes (intent; simplified in AddReinforcementsToAllHexes)
- **Log:** `"Rush Hour! Claimed hexes count double for 5 minutes."`
- **Timeout:** Currently resets after 1 regen tick (~30s); design intent is 5 min
- **Testing:** Set IsRushHour; verify it persists/decays correctly

### Event Broadcast (Lines 146-162)
```csharp
// Broadcast state snapshot
snapshot = gameService.SnapshotStatePublic(room.State);
await hubContext.Clients.Group(room.Code).SendAsync("StateUpdated", snapshot, ct);

// Broadcast event details
await hubContext.Clients.Group(room.Code).SendAsync("RandomEvent", new
{
    type = eventType,
    title = eventType,
    description = $"A {eventType} event has occurred!"
}, ct);
```

### Private Methods
- **`ApplyRandomEvent()`** - Main event dispatcher with lock & switch

### Testing Seams (to avoid timer)
1. **Mock Random.Shared** to control event type selection → inject as dependency or use mocking library
2. **Extract ApplyRandomEvent()** into static method accepting `GameService`, `GameRoom`, `string eventType`
3. **Call event handlers directly** without timer:
   - Create specific game state (alliances, territories, hex ownership)
   - Call `ApplyRandomEvent(..., "Calamity")` directly
4. **Mock hubContext** to verify broadcasts
5. **Mock GetPlayingRoomCodes()** to return test room
6. **Verify state changes** (troops, IsRushHour, event log) before/after

---

## 4. Supporting GameService Methods

**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Api/Services/GameService.cs`

GameService is a facade that delegates to sub-services. The background services call:

### From TroopRegenerationService:
1. **`GetPlayingRoomCodes()`** → delegates to `roomService.GetPlayingRoomCodes()`
2. **`GetRoom(roomCode)`** → delegates to `roomService.GetRoom(roomCode)`
3. **`AddReinforcementsToAllHexes(roomCode)`** → delegates to `gameplayService.AddReinforcementsToAllHexes(roomCode)`
   - **Complex logic:** 11 phases of reinforcement with 7+ feature flags
   - **Line 752-966:** Implements all reinforcement rules
4. **`ProcessDuelExpiry(room)`** → delegates to `duelService.ProcessDuelExpiry(room)`
5. **`CreateHiddenFogCellsForBroadcast(state)`** → delegates to `gameStateService.CreateHiddenFogCellsForBroadcast(state)`
6. **`GetPlayerSnapshot(state, userId, hiddenFogCells)`** → delegates to `gameStateService.GetPlayerSnapshot(...)`
7. **`SnapshotStatePublic(state)`** → delegates to `gameStateService.SnapshotState(state)`

### From MissionService:
1. **`GetPlayingRoomCodes()`**
2. **`GetRoom(roomCode)`**
3. **`SnapshotStatePublic(state)`**
4. **`AppendEventLogPublic(state, entry)`** → delegates to `gameStateService.AppendEventLog(state, entry)`

### From RandomEventService:
1. **`GetPlayingRoomCodes()`**
2. **`GetRoom(roomCode)`**
3. **`SnapshotStatePublic(state)`**
4. **`AppendEventLogPublic(state, entry)`**

---

## Existing Test Patterns

**Location:** `/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Tests/`

### TestSupport Infrastructure

#### ServiceTestContext (TestSupport/ServiceTestContext.cs)
```csharp
public sealed class ServiceTestContext
{
    public GameRoom Room { get; }
    public GameState State => Room.State;
    public GameStateService GameStateService { get; }
    public GameplayService GameplayService { get; }
    public DuelService DuelService { get; }
    public AbilityService AbilityService { get; }
    
    public static (double lat, double lng) HexCenter(int q, int r)
    public PlayerDto Player(string playerId)
    public HexCell Cell(int q, int r)
}
```

#### GameStateBuilder (TestSupport/GameStateBuilder.cs)
Fluent builder pattern with chainable methods:
- `.WithGrid(radius)` - Create hex grid
- `.WithPhase(phase)` - Set GamePhase
- `.AddPlayer(id, name, allianceId)` - Add player
- `.AddAlliance(id, name, memberIds...)` - Add alliance
- `.OwnHex(q, r, playerId, allianceId, troops)` - Set hex ownership
- `.WithTroops(q, r, troops)` - Set troop count
- `.WithPlayerPosition(playerId, q, r)` - Set player location
- `.WithCopresenceModes(modes...)` - Set active copresence modes
- `.WithTerrainEnabled()` / `.WithSupplyLinesEnabled()` / `.WithPlayerRolesEnabled()` - Feature flags
- `.WithMasterTile(q, r)` - Set center hex
- `.WithMasterTile()` - Add methods for missions if needed
- `.WithPaused()` - Set pause state

### Example Test Pattern (DuelServiceTests.cs)
```csharp
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
    
    var duel = context.DuelService.InitiateDuel(ServiceTestContext.RoomCode, "p1", "p2", 0, 0);
    
    duel.Should().NotBeNull();
    context.Room.PendingDuels.Should().ContainKey(duel.Id);
}
```

### Test Patterns Used
- **FluentAssertions** for assertions (`.Should()`, `.Be()`, `.ContainKey()`)
- **Fact/Theory** for xUnit tests
- **Mocks:** IGameRoomProvider, ILogger<T>
- **State mutation verification:** Check grid/player properties directly
- **No async needed** for unit tests (services are sync except background loops)

---

## Summary: Unit Testing Approach

### For TroopRegenerationService:
1. **Create helper static method** `ProcessReinforcementTick(GameService gameService, GameRoom room)` to extract timer loop
2. **Test reinforcement phases in isolation:**
   - Base regen: owned hex with 0 troops → +1
   - Drain mode: hostile player present → skip regen
   - Shepherd mode: unvisited >3min → decay -1, skip normal
   - Supply lines: isolated hex → skip regen
   - Escalation, terrain, roles, presence battle: each with feature flag variations
3. **Test duel expiry:** Create pending duel with past timestamp → verify removed
4. **Test fog of war broadcast:** Mock getPlayerSnapshot → verify called with correct userId

### For MissionService:
1. **Extend GameStateBuilder** with:
   - `.WithMissionsEnabled()`, `.WithMissions(List<Mission>)`, `.WithLastMissionGeneration(roomCode, DateTime)`
2. **Test mission generation:**
   - Initial: count = 1 main + N team + N personal
   - Interim: 1 room-wide + N personal refreshes after 30min
3. **Test progress evaluation** (extract private methods):
   - Each of 9 objective types with edge cases (no valid targets, threshold crossings)
4. **Test reward application:**
   - Correct hexes selected per scope
   - Correct troop count added
   - No reward if no target hexes
5. **Test mission status transitions:**
   - Completed: progress ≥ 1.0 → status = "Completed" → reward applied
   - Expired: ExpiresAt < now → status = "Expired" → no reward

### For RandomEventService:
1. **Mock Random.Shared** or extract event selection into injectable method
2. **Test each event type:**
   - Calamity: random owned hex → troops = 0
   - Epidemic: largest alliance's hex → troops -= 2 (min 0)
   - BonusTroops: all alliances' hexes → troops += 2 (if hex exists)
   - RushHour: set IsRushHour = true; verify decay logic in AddReinforcementsToAllHexes
3. **Test event selection probability** (uniform across 4 types)
4. **Test event log entries** and SignalR broadcasts

### Key Testing Insights:
- **Locks are transparent:** Tests don't need to worry about concurrency (synchronous)
- **Feature flags are values in GameState:** Set via builder methods
- **No database needed:** Use mocks for IGameRoomProvider
- **Extraction is key:** Pull private methods into static testables or use reflection
- **SignalR can be mocked:** IHubContext<GameHub> is injectable and mockable
- **Avoid timer loops:** Extract core logic into static/instance methods called directly

