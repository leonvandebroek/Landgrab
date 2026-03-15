# GameService Refactoring Documentation

Complete analysis and refactoring roadmap for `backend/Landgrab.Api/Services/GameService.cs`

## 📋 Documentation Files

This refactoring is documented across **4 comprehensive documents** (2,351 lines total):

### 1. **REFACTOR_MAP_GameService.md** (753 lines) ⭐ PRIMARY REFERENCE
**Most detailed technical specification**

- **Section 1**: Complete consumer analysis with line-by-line method call mapping
  - GameHub (104 calls) - grouped by feature area
  - TroopRegenerationService (6 calls) 
  - RandomEventService (5 calls)
  - MissionService (2 calls)

- **Section 2**: Method grouping by target service domain (10 services)
  - Clear responsibility for each service
  - LOC estimates for each group
  - Key dependencies listed

- **Section 3**: Cross-service dependency graph with ASCII art

- **Section 4**: Detailed background service dependencies
  - Critical methods for TroopRegenerationService
  - Critical methods for RandomEventService  
  - Critical methods for MissionService

- **Section 5**: Thread safety & state management discussion
  - Current locking pattern
  - Background service implications
  - Refactoring constraints

- **Section 6**: Extra files and types needed
  - 10 new service files to create
  - Required model updates
  - DI configuration changes

- **Section 7**: Detailed method mapping table
  - All 61 methods mapped
  - Current LOC, target service, type, consumers

- **Section 8-11**: Implementation notes, DI chains, risks, and sequence

**Use this for:** Deep technical understanding, implementation details, risk analysis

---

### 2. **REFACTOR_SUMMARY_GameService.txt** (360 lines) ⭐ QUICK REFERENCE
**Executive summary and quick lookup guide**

- Consumer breakdown (104 + 6 + 5 + 2 = 117 total calls)
- 10 target services with ~200 LOC each (except GameplayService at 1,200)
- Method grouping by category (Room, Lobby, Gameplay, etc.)
- Cross-service dependencies overview
- Thread safety constraints summary
- New files checklist
- Refactoring risks summary
- Implementation phase overview
- Key metrics and statistics

**Use this for:** Quick reference, presentations, understanding scope

---

### 3. **REFACTOR_VISUAL_GUIDE.txt** (586 lines) ⭐ DIAGRAMS & FLOWCHARTS
**Visual architecture and dependency diagrams**

- **Section 1**: Current monolithic state diagram
- **Section 2**: Target distributed architecture with ASCII art
- **Section 3**: Dependency injection configuration (before/after)
- **Section 4**: GameHub constructor migration example
- **Section 5**: Method distribution across services (visual bars)
- **Section 6**: Thread safety architecture detail
- **Section 7**: Implementation phases with dependency order
- **Section 8**: Method call distribution heatmap
- **Section 9**: Files created summary
- **Section 10**: Summary statistics

**Use this for:** Understanding architecture, presentations, visualizing dependencies

---

### 4. **REFACTOR_INDEX.md** (301 lines) - Previous Overview
Quick overview of previous analysis phases

---

## 🎯 Key Findings

### Current State
- **GameService**: 3,965 lines of code
- **Public Methods**: 61 
- **Primary Consumer**: GameHub (104 calls)
- **Other Consumers**: TroopRegenerationService (6), RandomEventService (5), MissionService (2)

### Target State
- **10 Domain Services** to distribute GameService responsibilities
- **Total Extracted LOC**: ~2,950 lines
- **Largest Service**: GameplayService (1,200 LOC)
- **Smallest Service**: EventManagementService (100 LOC)

### Critical Services (In Priority Order)

1. **RoomConnectionService** (~200 LOC, 10 methods)
   - Room creation, joining, connection tracking
   - CRITICAL: `GetPlayingRoomCodes()` used by all background services
   - CRITICAL: `GetRoom()` used by all background services

2. **GameplayService** (~1,200 LOC, 5 methods) ⭐ LARGEST & MOST COMPLEX
   - Core game mechanics (movement, combat, claiming)
   - Contains 400+ LOC `UpdatePlayerLocation()` method
   - Contains 340+ LOC `AddReinforcementsToAllHexes()` method
   - HIGH RISK extraction - comprehensive testing required

3. **GameStateManagementService** (~200 LOC, 7 methods)
   - State snapshots and visibility
   - Contains 370+ LOC `CreateHiddenFogCellsForBroadcast()` (fog of war)
   - CRITICAL: Used by TroopRegenerationService, RandomEventService, MissionService

4. **GameLobbyService** (~400 LOC, 20 methods)
   - Pre-game configuration and setup
   - Many validation-heavy methods

5. **Other Services** (600 LOC total)
   - GameStartService, CopresenceAbilityService, DuelManagementService
   - HostageManagementService, EventManagementService, AdminHostService

---

## 🔄 Method Distribution by Service

| Service | Methods | LOC | GameHub Calls | Background Calls | Complexity |
|---------|---------|-----|---------------|------------------|------------|
| RoomConnectionService | 10 | ~200 | 25 | 4 | LOW |
| GameStateManagementService | 7 | ~200 | 10 | 6 | MEDIUM |
| GameLobbyService | 20 | ~400 | 22 | 0 | MEDIUM |
| GameStartService | 5 | ~150 | 7 | 0 | MEDIUM |
| GameplayService | 5 | ~1,200 | 15 | 1 | HIGH ⭐ |
| CopresenceAbilityService | 4 | ~300 | 6 | 0 | MEDIUM |
| DuelManagementService | 3 | ~120 | 4 | 1 | MEDIUM |
| HostageManagementService | 2 | ~80 | 2 | 0 | LOW |
| EventManagementService | 1 | ~100 | 0 | 2 | LOW |
| AdminHostService | 5 | ~200 | 8 | 0 | MEDIUM |
| **TOTAL** | **61** | **~2,950** | **104** | **13** | - |

---

## ⚙️ Thread Safety Model

Current implementation uses:
```csharp
lock (room.SyncRoot)  // Single synchronization point per room
{
    // All mutations happen here atomically
    room.State.Players.Add(...);
    room.State.Grid[hex].Troops += 5;
    QueuePersistence(room, snapshot);
}
```

**CRITICAL CONSTRAINT**: Refactored services MUST preserve this locking pattern:
- ❌ Do NOT introduce new locks for individual services
- ✓ Use room.SyncRoot consistently across all services
- ✓ Background services continue direct mutation (performance critical)
- ✓ Utility methods must be reentrant

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (LOW RISK)
- Extract RoomConnectionService
- Update Program.cs DI
- Test room creation/joining

### Phase 2: Utilities (LOW RISK)
- Extract GameStateManagementService
- Test snapshots, visibility, fog of war

### Phase 3: Duel System (MEDIUM RISK)
- Extract DuelManagementService
- Test with TroopRegenerationService

### Phase 4: Lobby Configuration (MEDIUM RISK)
- Extract GameLobbyService
- Update GameHub (~20 methods)

### Phase 5: Game Startup (MEDIUM RISK)
- Extract GameStartService
- Update GameHub (~5 methods)

### Phase 6: Gameplay (HIGH RISK ⭐ CRITICAL PATH)
- Extract GameplayService (1,200 LOC)
- Split UpdatePlayerLocation if possible
- Heavy testing required
- Update GameHub (~12 methods)
- Update TroopRegenerationService

### Phase 7: Remaining Services (MEDIUM RISK)
- CopresenceAbilityService, AdminHostService
- HostageManagementService, EventManagementService

### Phase 8: Integration (MEDIUM RISK)
- Verify background services
- Full system integration test

---

## 📁 Files to Create

**New Service Files** (10 files):
```
Services/
├── RoomConnectionService.cs
├── GameStateManagementService.cs
├── GameLobbyService.cs
├── GameStartService.cs
├── GameplayService.cs                    (⭐ CRITICAL - 1,200 LOC)
├── CopresenceAbilityService.cs
├── DuelManagementService.cs
├── HostageManagementService.cs
├── EventManagementService.cs
└── AdminHostService.cs
```

**Files to Update**:
- `Hubs/GameHub.cs` - Constructor (10 deps instead of 1), 104 method calls re-routed
- `Program.cs` - DI configuration (+10 services)

**Optional**:
- `Services/IGameService.cs` - Facade for backward compatibility

**Unchanged**:
- `Services/TroopRegenerationService.cs` - Uses public API only
- `Services/RandomEventService.cs` - Uses public API only
- `Services/MissionService.cs` - Uses public API only

---

## ⚠️ Key Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Breaking background services | HIGH | Keep GetPlayingRoomCodes, GetRoom public; minimal facade if needed |
| Race conditions in new services | HIGH | Use existing room.SyncRoot consistently; no new locks |
| UpdatePlayerLocation complexity (400+ LOC) | MEDIUM | Split into sub-services for movement, duel, toll logic |
| Fog of War visibility bugs | MEDIUM | Test CreateHiddenFogCellsForBroadcast thoroughly |
| Circular dependencies | MEDIUM | Use DI carefully; RoomConnectionService at base level |
| State mutation isolation | MEDIUM | Maintain lock discipline in all public methods |

---

## 📊 Impact Analysis

### GameHub Constructor Changes
**Before**: 1 dependency (GameService)
**After**: 12 dependencies (10 services + GlobalMapService, TerrainFetchService)

```csharp
// BEFORE: Simple but monolithic
public class GameHub(GameService gameService, ...) { ... }

// AFTER: More precise but more dependencies
public class GameHub(
    RoomConnectionService roomService,
    GameStateManagementService stateService,
    GameLobbyService lobbyService,
    GameStartService startService,
    GameplayService gameplayService,
    CopresenceAbilityService abilityService,
    DuelManagementService duelService,
    HostageManagementService hostageService,
    EventManagementService eventService,
    AdminHostService adminService,
    GlobalMapService globalMap,
    TerrainFetchService terrainFetchService,
    IServiceScopeFactory scopeFactory,
    ILogger<GameHub> logger) { ... }
```

### Consumer Count
- **GameHub**: 104 calls distributed across 10 services
- **TroopRegenerationService**: 6 calls (minimal facade needed or direct calls to: RoomConnectionService, GameplayService, DuelManagementService, GameStateManagementService)
- **RandomEventService**: 5 calls (uses: RoomConnectionService, EventManagementService, GameStateManagementService)
- **MissionService**: 2 calls (uses: RoomConnectionService, GameStateManagementService)

---

## 🔗 Dependencies

### External Services Used
- GlobalMapService (map templates)
- TerrainFetchService (terrain data)
- HexService (hex operations)
- RoomPersistenceService (DB persistence)
- ILogger<T> (logging)

### New Internal Dependencies
- RoomConnectionService ← used by 9+ other services
- GameStateManagementService ← used by background services
- GameplayService ← depends on DuelManagementService

---

## 📖 How to Use These Documents

1. **Starting Point**: Read this file (README_REFACTOR_GAMESERVICE.md)

2. **Understanding Scope**: Read REFACTOR_SUMMARY_GameService.txt
   - Get quick overview of all changes
   - Understand method distribution
   - See key metrics

3. **Visual Understanding**: Read REFACTOR_VISUAL_GUIDE.txt
   - See architecture diagrams
   - Understand dependency flows
   - Review implementation phases

4. **Implementation Details**: Read REFACTOR_MAP_GameService.md
   - Detailed consumer analysis
   - Method mapping table
   - Risk analysis
   - Thread safety discussion
   - Implementation notes

5. **Starting Implementation**:
   - Create RoomConnectionService first (Phase 1)
   - Follow the recommended implementation sequence
   - Test each phase before moving to next

---

## ✅ Pre-Refactor Checklist

- [ ] Understand current GameService architecture (read all documents)
- [ ] Identify all consumers of GameService (confirmed: GameHub, TroopRegen, RandomEvent, Mission)
- [ ] Understand thread safety model (lock(room.SyncRoot) pattern)
- [ ] Backup existing code
- [ ] Set up branch for refactoring
- [ ] Plan testing strategy for each phase
- [ ] Review dependencies (GlobalMapService, TerrainFetchService, HexService)
- [ ] Update DI configuration plan
- [ ] Identify largest method (UpdatePlayerLocation - 400+ LOC)
- [ ] Plan fog of war testing (CreateHiddenFogCellsForBroadcast - 370 LOC)

---

## 📞 Quick Reference

**Largest Method**: UpdatePlayerLocation (400+ LOC)
- Location: GameService.cs ~line 1560
- Handles: Movement, duel initiation, toll collection, prey capture
- Target Service: GameplayService

**Most Complex Logic**: Fog of War Visibility
- Method: CreateHiddenFogCellsForBroadcast (370 LOC)
- Target Service: GameStateManagementService
- Critical for: TroopRegenerationService broadcasts

**Most Refactored Service**: GameLobbyService
- 20 methods, ~400 LOC
- Handles: All pre-game configuration
- Consumers: GameHub only

**Most Critical Service**: RoomConnectionService
- 10 methods, ~200 LOC
- Used by: 9 other services + all background services
- Must be extracted first (Phase 1)

**Background Service Critical Path**:
1. GetPlayingRoomCodes() - from RoomConnectionService
2. GetRoom() - from RoomConnectionService
3. AddReinforcementsToAllHexes() - from GameplayService
4. ProcessDuelExpiry() - from DuelManagementService
5. CreateHiddenFogCellsForBroadcast() - from GameStateManagementService
6. GetPlayerSnapshot() - from GameStateManagementService

---

## 📝 Notes

- **No Files Modified**: This analysis does not modify any source files
- **Documentation Only**: All refactoring specifications are in these markdown/text files
- **Ready for Implementation**: Can be handed to development team as specification
- **2,351 Total Lines**: Comprehensive documentation covering all aspects
- **Cross-Referenced**: All documents reference each other

---

**Generated**: Complete refactoring analysis of GameService.cs
**Status**: ✅ Ready for implementation
**Next Step**: Read REFACTOR_SUMMARY_GameService.txt for quick overview

