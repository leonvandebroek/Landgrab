# GameService Refactor Analysis - Complete Index

## 📚 Documentation Files Generated

This analysis provides a **complete refactor roadmap** for splitting the monolithic `GameService` (3965 lines) into 5 specialized services plus a thin facade.

### 1. **REFACTOR_SUMMARY.txt** (351 lines)
**Read This First** - High-level executive overview
- Summary of all 7 analysis sections
- Key metrics and statistics  
- Recommendations for implementation
- Quick lookup table of methods by service

**Best for**: Understanding the big picture, management review

---

### 2. **GAMESERVICE_REFACTOR_QUICK_GUIDE.md** (225 lines)
**Quick Reference** - Visual architecture + implementation checklist
- Architecture diagram (flowchart of service dependencies)
- Method distribution checklist (all 60+ methods mapped to services)
- Critical interaction patterns (3 common patterns)
- Implementation checklist (30+ items)
- Files that MUST change vs. DON'T change

**Best for**: During implementation, quick lookup, team reference

---

### 3. **GAMESERVICE_REFACTOR_MAP.md** (559 lines)
**Detailed Technical Analysis** - Complete architectural specification
- Section 1: Constructor dependencies & static/shared state
- Section 2: Public methods grouped by target service
- Section 3: Private helpers grouped by target service
- Section 4: Cross-service dependencies & collaboration cycles
- Section 5: Methods consumed by external services (GameHub, BG services)
- Section 6: DI/lifetime pitfalls & migration hazards
- Section 7: Non-obvious files requiring changes
- Implementation order (recommended 7-step sequence)
- Testing strategy by service

**Best for**: Architecture review, dependency analysis, detailed planning

---

## 🎯 Key Findings

### Services to Create (5 total)

| Service | Lines | Responsibilities | Dependencies |
|---------|-------|------------------|--------------|
| **RoomService** | ~400 | Room CRUD, connections | None (owns _rooms dict) |
| **LobbyService** | ~1000 | Game config, setup, templates | RoomService |
| **GameplayService** | ~1200 | Real-time gameplay (movement, claiming, combat) | RoomService, GameStateService |
| **HostControlService** | ~200 | Host-only admin controls | RoomService, GameStateService |
| **GameStateService** | ~800 | State snapshots, persistence, transformations | RoomService, RoomPersistenceService |

### Facade (1 new file)

| Service | Lines | Responsibilities |
|---------|-------|------------------|
| **GameService** | ~100 | Router only - delegates all calls to above 5 services |

---

## 📊 Method Distribution Summary

### RoomService (9 public methods)
```
CreateRoom, JoinRoom, GetRoom, GetRoomByConnection, GetRoomByUserId,
RemoveConnection, RestoreRooms, GetRoomsForUser, GetPlayingRoomCodes
```

### LobbyService (26 public methods)
```
SetAlliance, ConfigureAlliances, DistributePlayersRandomly,
AssignAllianceStartingTile, SetMapLocation, SetTileSize,
SetHostBypassGps, SetMaxFootprint, LoadMapTemplate, SaveCurrentAreaAsTemplate,
UseCenteredGameArea, SetPatternGameArea, SetCustomGameArea,
SetClaimMode, SetAllowSelfClaim, SetWinCondition,
SetCopresenceModes, SetCopresencePreset, SetGameDynamics, SetPlayerRole,
SetAllianceHQ, SetMasterTile, SetMasterTileByHex, AssignStartingTile, StartGame
```

### GameplayService (12 public methods)
```
UpdatePlayerLocation, PickUpTroops, PlaceTroops, ReClaimHex,
ActivateBeacon, DeactivateBeacon, ActivateStealth, ActivateCommandoRaid,
ResolveDuel, DetainPlayer, SetHostObserverMode, PauseGame
```

### HostControlService (5 public methods)
```
TriggerGameEvent, UpdateGameDynamicsLive, SendHostMessage,
GetAllianceConnectionIds, ProcessHostageReleases
```

### GameStateService (15+ public methods)
```
GetStateSnapshot, AddReinforcementsToAllHexes, ProcessDuelExpiry,
GetPlayerSnapshot (2 overloads), CreateHiddenFogCellsForBroadcast,
InitiateDuel, AppendEventLogPublic, SnapshotStatePublic
+ Internal helpers: SnapshotState, QueuePersistence, ApplyWinCondition, etc.
```

**Total: 60+ public methods distributed across 5 services**

---

## ⚠️ Critical Architecture Decisions

### 1. Lifetime Management (SINGLETON REQUIRED)
All 6 services must be `AddSingleton` because they share the in-memory `_rooms` dictionary.
- Cannot use Scoped services (would create isolated _rooms copies)
- Cannot use Transient services (would lose all room data)
- Non-negotiable due to in-memory game state architecture

### 2. Shared Mutable State
Only **RoomService owns the mutable `_rooms` dict**. All other services access rooms through RoomService methods only.
```csharp
private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();  // RoomService only
```

### 3. Lock Requirements
Every public method that reads/modifies `room.State` must:
1. Get room via `RoomService.GetRoom()`
2. Acquire lock: `lock (room.SyncRoot)`
3. Modify state
4. Release lock BEFORE async operations
5. Queue persistence via `GameStateService`

### 4. Async/Await Safety Pattern
```csharp
lock (room.SyncRoot) {
    // Do synchronous work
    var data = room.State.Field;
    room.State.Field = newValue;
}
// OK to do async work here (lock released)
await GameStateService.QueuePersistence(...);
```

---

## 🔄 Critical Dependencies (No Cycles)

```
GameService (Facade)
  ├─ RoomService (base layer)
  ├─ LobbyService → RoomService
  ├─ GameplayService → RoomService + GameStateService
  ├─ HostControlService → RoomService + GameStateService
  └─ GameStateService → RoomService + RoomPersistenceService
```

**No circular dependencies.** All flow downward to RoomService at the base.

---

## 📝 Files Requiring Changes

### MUST CHANGE (5 files)
1. **Program.cs** - Register 5 new services + update startup code
2. **RoomService.cs** - NEW FILE (~400 lines)
3. **LobbyService.cs** - NEW FILE (~1000 lines)
4. **GameplayService.cs** - NEW FILE (~1200 lines)
5. **HostControlService.cs** - NEW FILE (~200 lines)
6. **GameStateService.cs** - NEW FILE (~800 lines)
7. **GameService.cs** - Replace 3965-line monolith with 100-line facade

### NO CHANGES (8 files)
- GameHub.cs (still injects GameService facade)
- TroopRegenerationService.cs (still calls same GameService methods)
- RandomEventService.cs (still calls same GameService methods)
- MissionService.cs (still calls same GameService methods)
- RoomPersistenceService.cs (no changes)
- All model files (GameRoom, GameState, HexCell, PlayerDto, AllianceDto, etc.)

---

## 🚀 Implementation Path (Recommended Order)

### Phase 1: Foundation (Day 1-2)
1. Create RoomService (owns _rooms, simple CRUD)
2. Create GameStateService (depends on RoomService)

### Phase 2: Configuration (Day 3-4)
3. Create LobbyService (game setup)
4. Create GameplayService (gameplay mechanics)

### Phase 3: Admin & Testing (Day 5-6)
5. Create HostControlService (admin controls)
6. Create new GameService facade (router only)
7. Update Program.cs

### Phase 4: Verification (Day 7)
8. Run all unit tests
9. Run integration tests (GameHub + BG services)
10. Load test with multiple concurrent rooms

---

## 🧪 Testing Strategy

### Unit Tests (Service-Level)
- **RoomService**: Connection/room tracking, concurrent _rooms access
- **LobbyService**: Configuration validation, game area setup
- **GameplayService**: Movement, claiming, combat resolution, copresence modes
- **HostControlService**: Host-only operations, permissions
- **GameStateService**: Snapshot consistency, persistence queueing, win conditions
- **Facade GameService**: Routing correctness (all calls reach right service)

### Integration Tests (Full Stack)
- GameHub → Facade → underlying services
- Background services (TroopRegen, RandomEvent, Mission) → GameStateService
- Persistence end-to-end (modify → queue → RoomPersistenceService)
- Concurrent room operations (threading safety)

### Load Tests
- 10 concurrent rooms with 3-5 players each
- Background service loops with 100+ rooms
- Connection/disconnection under load

---

## 📈 Expected Benefits Post-Refactor

| Benefit | Impact |
|---------|--------|
| **Clarity** | Each service has single responsibility |
| **Testability** | Can test GameplayService without LobbyService loaded |
| **Maintainability** | 1000-line max files vs. 3965-line monolith (4x easier) |
| **Extensibility** | Easy to add new game mechanics to GameplayService |
| **Isolation** | Bug in lobby setup won't break gameplay engine |
| **Reusability** | Services composable for different game modes |
| **Performance** | Possible to optimize individual services independently |
| **Team Velocity** | Multiple developers can work on different services in parallel |

---

## ❓ Frequently Asked Questions

### Q: Why Singleton services for in-memory state?
**A:** The `_rooms` dictionary is the single source of truth for all active games. Multiple instances would mean rooms are invisible to other service instances. Singleton ensures all services see the same _rooms dict.

### Q: What about thread-safety?
**A:** Each GameRoom has a `SyncRoot` object for locking. Any code that reads/modifies room.State must acquire this lock. GameStateService.QueuePersistence is non-blocking (fire-and-forget).

### Q: Can I use async/await with locks?
**A:** Release the lock BEFORE async calls. Current code pattern is correct: extract data while locked, release lock, then call async persistence.

### Q: Will this refactor break GameHub?
**A:** No. GameHub continues to inject `GameService` (the facade). All method calls route through the facade to the appropriate service. From GameHub's perspective, nothing changes.

### Q: Will background services break?
**A:** No. TroopRegenerationService, RandomEventService, and MissionService create scoped DI containers, but GameService is Singleton so they get the same instance. All their method calls continue to work.

### Q: What's the biggest risk?
**A:** **Lifetime misconfiguration.** If any service becomes Scoped or Transient instead of Singleton, you'll have multiple _rooms dictionaries and rooms will randomly disappear. Must use AddSingleton for all 6 services.

---

## 🔗 Document Navigation

| Need | Read This |
|------|-----------|
| **Big picture overview** | REFACTOR_SUMMARY.txt (this file's parent) |
| **Quick method lookup** | GAMESERVICE_REFACTOR_QUICK_GUIDE.md (checklist section) |
| **Architecture details** | GAMESERVICE_REFACTOR_MAP.md (section 1-4) |
| **Dependency analysis** | GAMESERVICE_REFACTOR_MAP.md (section 4-5) |
| **Pitfalls & hazards** | GAMESERVICE_REFACTOR_MAP.md (section 6) |
| **Files to change** | GAMESERVICE_REFACTOR_QUICK_GUIDE.md (table section) |
| **Implementation steps** | GAMESERVICE_REFACTOR_MAP.md (section 7) |

---

## ✅ Pre-Implementation Checklist

- [ ] Read REFACTOR_SUMMARY.txt
- [ ] Review GAMESERVICE_REFACTOR_QUICK_GUIDE.md architecture diagram
- [ ] Read GAMESERVICE_REFACTOR_MAP.md section 1-2 (method distribution)
- [ ] Review section 4 (dependencies) and section 6 (pitfalls)
- [ ] Understand Singleton requirement for all 6 services
- [ ] Understand lock acquisition pattern before modifying room.State
- [ ] Confirm with team: can we do 7-day refactor sprint?
- [ ] Set up branch: feature/gameservice-refactor
- [ ] Create comprehensive unit test suite first (TDD)
- [ ] Assign developers to each service (or pair)

---

## 📞 Questions?

Refer to the detailed analysis documents:
- **Architecture questions** → GAMESERVICE_REFACTOR_MAP.md
- **Method distribution questions** → GAMESERVICE_REFACTOR_QUICK_GUIDE.md
- **High-level questions** → REFACTOR_SUMMARY.txt

Generated: 2024-03-15
Analysis Scope: Complete refactor roadmap for GameService split
Total Documentation: 1,135 lines across 3 files
