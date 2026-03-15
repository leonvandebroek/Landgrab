# GameService Refactor Map: Splitting into 5 Specialized Services

## Executive Summary
GameService (3965 lines) is a monolithic service managing room creation, lobby configuration, gameplay mechanics, and game state persistence. The refactor splits it into 5 focused services with GameService becoming a thin facade:

- **RoomService**: Room CRUD and connection management
- **LobbyService**: Game configuration and setup
- **GameplayService**: Real-time gameplay actions (movement, claiming, combat)
- **HostControlService**: Host-only administrative operations
- **GameStateService**: State snapshots, persistence queuing, and state transformations

---

## 1. CURRENT CONSTRUCTOR DEPENDENCIES & STATIC/SHARED STATE

### Constructor Dependencies
```csharp
public class GameService(
    RoomPersistenceService roomPersistenceService,  // ← DB persistence via scoped DI
    ILogger<GameService> logger)
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();  // ← Singleton state
}
```

### Static/Shared State
| Field | Type | Visibility | Purpose | Target Service(s) |
|-------|------|------------|---------|-------------------|
| `_rooms` | `ConcurrentDictionary<string, GameRoom>` | private | In-memory room storage (singleton) | **RoomService** |
| `Colors` | `string[]` (16 colors) | private static | Player color palette | **LobbyService** (alliance colors) |
| `AllianceColors` | `string[]` (8 colors) | private static | Alliance color palette | **LobbyService** |
| `CopresencePresets` | `Dictionary<string, List<CopresenceMode>>` | private static | Game mode configs | **LobbyService** |
| `DefaultGridRadius`, `DefaultTileSizeMeters`, etc. | const | private | Game defaults | **LobbyService** + **GameStateService** |

### DI Requirements After Refactor
```csharp
// RoomService - SINGLETON (owns _rooms)
RoomService(RoomPersistenceService, ILogger)

// LobbyService - SINGLETON (reads from RoomService)
LobbyService(RoomService, ILogger)

// GameplayService - SINGLETON (reads from RoomService)  
GameplayService(RoomService, GameStateService, ILogger)

// HostControlService - SINGLETON (reads from RoomService)
HostControlService(RoomService, GameStateService, ILogger)

// GameStateService - SINGLETON (reads/calls RoomService for persistence)
GameStateService(RoomService, RoomPersistenceService, ILogger)

// Facade
GameService(RoomService, LobbyService, GameplayService, HostControlService, GameStateService, ILogger)
```

⚠️ **Critical Lifetime**: ALL services must be **Singleton** (shared in-memory room state). Cannot use Scoped DI.

---

## 2. PUBLIC METHODS GROUPED BY TARGET SERVICE

### RoomService (9 methods)
**Purpose**: Room CRUD, connection tracking, room queries
```
✓ CreateRoom(hostUserId, hostUsername, connectionId) → GameRoom
✓ JoinRoom(roomCode, userId, username, connectionId) → (GameRoom?, error)
✓ GetRoom(code) → GameRoom?
✓ GetRoomByConnection(connectionId) → GameRoom?
✓ GetRoomByUserId(userId, roomCode?) → GameRoom?
✓ RemoveConnection(room, connectionId, returnedToLobby) → void
✓ RestoreRooms(rooms) → int (restored count)
✓ GetRoomsForUser(userId) → RoomSummaryDto[]
✓ GetPlayingRoomCodes() → string[]
```

### LobbyService (26 methods)
**Purpose**: Game configuration, setup, template management (host + player actions)
```
✓ SetAlliance(roomCode, userId, allianceName) → (GameState?, error)
✓ ConfigureAlliances(roomCode, userId, allianceNames) → (GameState?, error)
✓ DistributePlayersRandomly(roomCode, userId) → (GameState?, error)
✓ AssignAllianceStartingTile(roomCode, userId, q, r, allianceId) → (GameState?, error)
✓ SetMapLocation(roomCode, userId, lat, lng) → (GameState?, error)
✓ SetTileSize(roomCode, userId, meters) → (GameState?, error)
✓ SetHostBypassGps(roomCode, userId, bypass) → (bool, error?)
✓ SetMaxFootprint(roomCode, userId, meters) → (bool, error?)
✓ LoadMapTemplate(roomCode, userId, templateId, scopeFactory) → (bool, error?)  [async]
✓ SaveCurrentAreaAsTemplate(roomCode, userId, name, desc, scopeFactory) → (bool, error?, templateId?)  [async]
✓ UseCenteredGameArea(roomCode, userId) → (GameState?, error)
✓ SetPatternGameArea(roomCode, userId, pattern) → (GameState?, error)
✓ SetCustomGameArea(roomCode, userId, coordinates) → (GameState?, error)
✓ SetClaimMode(roomCode, userId, claimMode) → (GameState?, error)
✓ SetAllowSelfClaim(roomCode, userId, allow) → (GameState?, error)
✓ SetWinCondition(roomCode, userId, type, value) → (GameState?, error)
✓ SetCopresenceModes(roomCode, userId, modes) → (GameState?, error)
✓ SetCopresencePreset(roomCode, userId, preset) → (GameState?, error)
✓ SetGameDynamics(roomCode, userId, dynamics) → (GameState?, error)
✓ SetPlayerRole(roomCode, userId, role) → (GameState?, error)
✓ SetAllianceHQ(roomCode, userId, q, r, allianceId) → (GameState?, error)
✓ SetMasterTile(roomCode, userId, lat, lng) → (GameState?, error)
✓ SetMasterTileByHex(roomCode, userId, q, r) → (GameState?, error)
✓ AssignStartingTile(roomCode, userId, q, r, targetPlayerId) → (GameState?, error)
✓ StartGame(roomCode, userId) → (GameState?, error)
```

### GameplayService (12 methods)
**Purpose**: Real-time gameplay actions (player actions during Playing phase)
```
✓ UpdatePlayerLocation(roomCode, userId, lat, lng) → (GameState?, error, PendingDuel?, tollPaid?, preyCaught?)
✓ PickUpTroops(roomCode, userId, q, r, count, playerLat, playerLng) → (GameState?, error, AmbushResult?)
✓ PlaceTroops(roomCode, userId, q, r, count) → (GameState?, error, previousOwnerId?, CombatResult?)
✓ ReClaimHex(roomCode, userId, q, r, mode) → (GameState?, error)
✓ ActivateBeacon(roomCode, userId) → (GameState?, error)
✓ DeactivateBeacon(roomCode, userId) → (GameState?, error)
✓ ActivateStealth(roomCode, userId) → (GameState?, error)
✓ ActivateCommandoRaid(roomCode, userId, targetQ, targetR) → (GameState?, error)
✓ ResolveDuel(roomCode, duelId, accepted) → (bool, winnerId?, loserId?)
✓ DetainPlayer(roomCode, detainerId, targetId) → (GameState?, error)
✓ SetHostObserverMode(roomCode, userId, enabled) → (GameState?, error)
✓ PauseGame(roomCode, userId, paused) → (GameState?, error)
```

### HostControlService (5 methods)
**Purpose**: Host-only administrative controls during gameplay
```
✓ TriggerGameEvent(roomCode, userId, eventType, ...) → (GameState?, error)
✓ UpdateGameDynamicsLive(roomCode, userId, dynamics) → (GameState?, error)
✓ SendHostMessage(roomCode, userId, message) → (GameState?, error)
✓ GetAllianceConnectionIds(room, allianceIds) → List<string>
✓ ProcessHostageReleases(room) → void  [called by background services]
```

### GameStateService (15+ methods)
**Purpose**: State snapshots, persistence, transformations, helper methods called by other services
```
✓ GetStateSnapshot(roomCode) → GameState?
✓ AddReinforcementsToAllHexes(roomCode) → (GameState?, error)  [called by TroopRegenerationService]
✓ ProcessDuelExpiry(room) → void  [called by TroopRegenerationService]
✓ GetPlayerSnapshot(fullSnapshot, userId) → GameState
✓ GetPlayerSnapshot(fullSnapshot, userId, hiddenFogCells) → GameState  [overload]
✓ CreateHiddenFogCellsForBroadcast(fullSnapshot) → IReadOnlyDictionary<string, HexCell>  [fog of war]
✓ InitiateDuel(roomCode, challengerId, targetId, q, r) → PendingDuel?
✓ AppendEventLogPublic(state, entry) → void  [wrapper: called by RandomEventService, MissionService]
✓ SnapshotStatePublic(state) → GameState  [wrapper: called by RandomEventService, MissionService]
```

---

## 3. PRIVATE HELPERS GROUPED BY TARGET SERVICE

### RoomService Private Helpers
```
(no private helpers needed - simple CRUD)
```

### LobbyService Private Helpers
```
✓ ValidateMasterTilePlacement(room, userId) → string?
✓ ValidateGameAreaUpdate(room, userId) → string?
✓ ApplyGameArea(room, mode, pattern, coordinates, logMsg) → (GameState?, error)
✓ SetMasterTileByHexCore(room, q, r) → (GameState?, error)
✓ AutoAssignTiles(room) → void  [called by StartGame]
✓ ResetBoardStateForAreaChange(state) → void
✓ BuildPatternCoordinates(pattern) → (int q, int r)[]
✓ FitsWideFront(q, r), FitsTallFront(q, r), FitsCrossroads(q, r), FitsStarburst(q, r) → bool
✓ IsHost(room, userId) → bool [utility]
```

### GameplayService Private Helpers
```
✓ ValidateRealtimeAction(state, userId, q, r, ...) → string?
✓ ClaimNeutralHex(state, player, cell, q, r, ...) → string?
✓ GetPlayersInHex(state, q, r) → List<PlayerDto>
✓ SetCellOwner(cell, player) → void
✓ SetCellOwnerForSelf(cell, player) → void
✓ ReturnCarriedTroops(state, player) → void
✓ ResetCarriedTroops(player) → void
✓ RefreshTerritoryCount(state) → void
```

### HostControlService Private Helpers
```
(possibly none, or inherits from GameplayService)
```

### GameStateService Private Helpers
```
✓ QueuePersistence(room, stateSnapshot) → void  [calls RoomPersistenceService async]
✓ QueuePersistenceIfGameOver(room, snapshot, previousPhase) → void
✓ CreatePlayerSnapshot(fullSnapshot, userId, visibleHexKeys) → GameState
✓ CreateSnapshotEnvelope(fullSnapshot, fogGrid) → GameState
✓ CreateHiddenFogCells(fullSnapshot) → Dictionary<string, HexCell>
✓ CreateHiddenFogCell(cell) → HexCell
✓ GetVisibleHexKeys(state, userId) → HashSet<string>
✓ GetVisibleMissions(fullSnapshot, userId) → List<Mission>
✓ EnsureGrid(state) → void
✓ ApplyWinConditionAndLog(state, now) → void
✓ ApplyWinCondition(state, now) → void
✓ ApplyTerritoryPercentWinCondition(state) → void
✓ ApplyEliminationWinCondition(state) → void
✓ TrySetTerritoryLeaderAsWinner(state) → bool
✓ ComputeAchievements(state) → void
✓ SnapshotState(state) → GameState  [core method]
✓ ValidateCoordinates(lat, lng) → string?
✓ GenerateCode() → string
```

---

## 4. CROSS-SERVICE DEPENDENCIES & COLLABORATION CYCLES

### Critical Dependency Flow
```
┌─────────────────────────────────────────────────────────┐
│  GameService (Facade)                                    │
│  ├─ delegates all to:                                    │
│  ├─> RoomService       (owns _rooms dict)                │
│  ├─> LobbyService      (reads from RoomService)          │
│  ├─> GameplayService   (reads from RoomService)          │
│  ├─> HostControlService(reads from RoomService)          │
│  └─> GameStateService  (reads from RoomService, calls    │
│                         RoomPersistenceService)          │
└─────────────────────────────────────────────────────────┘
```

### Service Interaction Patterns

#### 1️⃣ RoomService ↔ GameStateService (Persistence Cycle)
```csharp
// Pattern: Room lookup + state persistence
var room = RoomService.GetRoom(roomCode);
lock (room.SyncRoot) {
    // Modify room.State
    ...
    GameStateService.QueuePersistence(room, snapshot);
}
```
✓ **Clean**: RoomService provides room access
✓ **Clean**: GameStateService handles persistence

#### 2️⃣ LobbyService/GameplayService ↔ GameStateService (State Updates)
```csharp
// Pattern: Modify state, queue persistence, return snapshot
var room = RoomService.GetRoom(roomCode);
lock (room.SyncRoot) {
    // LobbyService/GameplayService modifies room.State
    room.State.SomeField = value;
    var snapshot = GameStateService.GetStateSnapshot(roomCode);
    GameStateService.QueuePersistence(room, snapshot);
    return (snapshot, null);
}
```
⚠️ **Cycle**: Both LobbyService AND GameStateService read the room from RoomService
- **Resolution**: Keep lock scope minimal, QueuePersistence is non-blocking

#### 3️⃣ Background Services → GameStateService (Async Broadcasting)
```csharp
// TroopRegenerationService
foreach (var roomCode in GameStateService.GetPlayingRoomCodes()) {
    var room = RoomService.GetRoom(roomCode);
    var (state, error) = GameStateService.AddReinforcementsToAllHexes(roomCode);
    var hiddenFogCells = GameStateService.CreateHiddenFogCellsForBroadcast(state);
    // Broadcast via hub...
}
```
✓ **Clean separation**: GameStateService provides all state ops

#### 4️⃣ RoomPersistenceService ← GameStateService (DB Persistence)
```csharp
// GameStateService.QueuePersistence
RoomPersistenceService.PersistRoomStateAsync(roomCode, hostUserId, createdAt, state, queuedAt);
```
✓ **One-way dependency**: GameStateService → RoomPersistenceService (no cycle)

### ⚠️ Lifetime Pitfall #1: Singleton Services with Scoped Locks
**Problem**: `RoomPersistenceService` is Singleton, but uses `IServiceScopeFactory` internally to create Scoped DB contexts for async persistence.

```csharp
public Task PersistRoomStateAsync(..., CancellationToken cancellationToken = default) {
    // Queued async, non-blocking
    using var scope = scopeFactory.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    // ... persist
}
```
✓ **OK**: Scoped contexts created *inside* Singleton service methods is safe

### ⚠️ Lifetime Pitfall #2: No Shared Mutable State Between Services
**Problem**: If two Singleton services tried to share mutable collections, thread-safety nightmares.

✓ **Solution**: RoomService owns `_rooms` dict exclusively. Other services request via RoomService methods only.

---

## 5. METHODS CONSUMED BY OTHER SERVICES (External Contracts)

### Methods called by GameHub
**Via GameService facade (→ routed to specific services)**
```
RoomService:
  CreateRoom, JoinRoom, GetRoomByConnection, GetStateSnapshot, RemoveConnection,
  GetRoomsForUser, GetRoomByUserId

LobbyService:
  SetAlliance, ConfigureAlliances, DistributePlayersRandomly, AssignAllianceStartingTile,
  SetMapLocation, SetTileSize, UseCenteredGameArea, SetPatternGameArea, SetCustomGameArea,
  SetClaimMode, SetAllowSelfClaim, SetWinCondition, SetCopresenceModes, SetCopresencePreset,
  SetGameDynamics, SetPlayerRole, SetAllianceHQ, SetMasterTile, SetMasterTileByHex,
  AssignStartingTile, LoadMapTemplate, SaveCurrentAreaAsTemplate, StartGame

GameplayService:
  UpdatePlayerLocation, PickUpTroops, PlaceTroops, ReClaimHex,
  ActivateBeacon, DeactivateBeacon, ActivateStealth, ActivateCommandoRaid,
  ResolveDuel, DetainPlayer, SetHostObserverMode, PauseGame

HostControlService:
  TriggerGameEvent, UpdateGameDynamicsLive, SendHostMessage
```

### Methods called by TroopRegenerationService (Background Service)
**Via GameService facade (→ routed to specific services)**
```
RoomService:
  GetPlayingRoomCodes, GetRoom

GameStateService:
  AddReinforcementsToAllHexes, ProcessDuelExpiry, CreateHiddenFogCellsForBroadcast,
  GetPlayerSnapshot
```

### Methods called by RandomEventService (Background Service)
**Via GameService facade (→ routed to specific services)**
```
RoomService:
  GetPlayingRoomCodes, GetRoom

GameStateService:
  AppendEventLogPublic, SnapshotStatePublic
```

### Methods called by MissionService (Background Service)
**Via GameService facade (→ routed to specific services)**
```
RoomService:
  GetPlayingRoomCodes, GetRoom

GameStateService:
  GetStateSnapshot, AppendEventLogPublic (indirectly via mission completion logic)
```

---

## 6. DI/LIFETIME PITFALLS & MIGRATION HAZARDS

### ✓ Singleton Requirement (Critical)
All five new services + facade **must be Singleton** because they share in-memory `_rooms` dict.

```csharp
// Program.cs AFTER refactor
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton<LobbyService>();
builder.Services.AddSingleton<GameplayService>();
builder.Services.AddSingleton<HostControlService>();
builder.Services.AddSingleton<GameStateService>();
builder.Services.AddSingleton<GameService>();  // Facade delegates to above
```

### ⚠️ Pitfall #1: Async/Await with Locks
**Pattern in GameStateService**:
```csharp
public async Task<(bool, error?, templateId?)> SaveCurrentAreaAsTemplate(...) {
    List<HexCoordinateDto> coordinates;
    lock (room.SyncRoot) {
        // Extract data while locked
        coordinates = room.State.Grid.Values.Select(...).ToList();
    }
    // Release lock BEFORE async DB call
    using (var scope = scopeFactory.CreateScope()) {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.SaveChangesAsync();  // ✓ No lock held during async
    }
    return (true, null, template.Id);
}
```
✓ **Pattern is correct**: Lock released before async calls

### ⚠️ Pitfall #2: RoomPersistenceService async without blocking
**Currently**:
```csharp
private void QueuePersistence(GameRoom room, GameState stateSnapshot) {
    _ = roomPersistenceService.PersistRoomStateAsync(...);  // Fire-and-forget
}
```
✓ **OK for now** but consider if you need to track persistence failures.

### ⚠️ Pitfall #3: GetStateSnapshot must lock
```csharp
public GameState? GetStateSnapshot(string roomCode) {
    var room = GetRoom(roomCode);
    if (room == null) return null;
    lock (room.SyncRoot)
        return SnapshotState(room.State);
}
```
✓ **Pattern is correct**: Snapshot under lock

### ⚠️ Pitfall #4: Static methods accessing mutable state
Methods like `SnapshotState`, `ApplyWinCondition`, etc. are **static** and operate on read-only snapshots, not the live GameState.
✓ **Safe**: Caller holds lock when passing live GameState

### ⚠️ Pitfall #5: BG Services Creating Scoped GameService
**TroopRegenerationService pattern**:
```csharp
using var scope = scopeFactory.CreateScope();
var gameService = scope.ServiceProvider.GetRequiredService<GameService>();
```
⚠️ **Problem**: Creates a *new scoped instance* of GameService via DI.
✓ **Resolution**: GameService is Singleton, so even if you request from a Scoped container, you get the same Singleton instance. This is safe.

### ⚠️ Pitfall #6: Thread-safety on Static Collections
```csharp
private static readonly string[] Colors = [...]  // Read-only at init
private static readonly Dictionary<string, List<CopresenceMode>> CopresencePresets = new() {...}
```
✓ **Safe**: Initialized once at startup, never mutated. No locking needed.

---

## 7. NON-OBVIOUS FILES/TYPES NEEDING CHANGES (Beyond GameService + Program.cs)

### Files That Must Change

#### 1️⃣ **Program.cs** (High Impact)
```csharp
// Current
builder.Services.AddSingleton<GameService>();
builder.Services.AddSingleton<RoomPersistenceService>();

// After
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton<LobbyService>();
builder.Services.AddSingleton<GameplayService>();
builder.Services.AddSingleton<HostControlService>();
builder.Services.AddSingleton<GameStateService>();
builder.Services.AddSingleton<GameService>();  // Facade
builder.Services.AddSingleton<RoomPersistenceService>();  // Keep as is
```

Also update startup restoration:
```csharp
using (var scope = app.Services.CreateScope()) {
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var roomPersistence = scope.ServiceProvider.GetRequiredService<RoomPersistenceService>();
    var roomService = scope.ServiceProvider.GetRequiredService<RoomService>();  // ← Change
    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    ...
    var restoredRoomCount = roomService.RestoreRooms(restoredRooms);  // ← Call RoomService
}
```

#### 2️⃣ **GameHub.cs** (Medium Impact)
Change constructor:
```csharp
// Before
public class GameHub(GameService gameService, GlobalMapService globalMap, ...)

// After  
public class GameHub(GameService gameService, GlobalMapService globalMap, ...)
// ✓ No change - still injects GameService facade (single injection point)
```

All hub method calls remain unchanged—they route through the facade.

#### 3️⃣ **TroopRegenerationService.cs** (Low Impact)
```csharp
// No changes to service signature or calls
// Already uses GetPlayingRoomCodes, GetRoom, AddReinforcementsToAllHexes, ProcessDuelExpiry, etc.
// These methods are on GameService facade ✓
```

#### 4️⃣ **RandomEventService.cs** (Low Impact)
```csharp
// No changes needed
// Already calls: GetPlayingRoomCodes, GetRoom, AppendEventLogPublic, SnapshotStatePublic
// These are on GameService facade ✓
```

#### 5️⃣ **MissionService.cs** (Low Impact)
```csharp
// No changes needed
// Already calls: GetPlayingRoomCodes, GetRoom, SnapshotStatePublic
// These are on GameService facade ✓
```

#### 6️⃣ **RoomPersistenceService.cs** (No Changes)
```
✓ No changes needed - remains as is
  (GameStateService calls it, not affected by internal GameService split)
```

### Model Files (No Changes Required)
```
✓ GameRoom.cs - used by RoomService
✓ GameState.cs - used by all services
✓ HexCell.cs - used by all services  
✓ PlayerDto.cs - used by all services
✓ AllianceDto.cs - used by all services
✓ PersistedRoom.cs - used by RoomPersistenceService (unchanged)
✓ Mission.cs, PendingDuel.cs, etc. - used by GameStateService/GameplayService
```

### Endpoint Files (Possible Small Impact)
If there are any endpoints directly calling GameService methods (unlikely, they go through GameHub):
- May need to add endpoints calling new services directly (e.g., HTTP endpoints for room queries)
- But currently appears all gameplay is via SignalR Hub ✓

---

## Summary: Services Before vs After

| Service | Lines (Est.) | Key Responsibility | New Dependencies |
|---------|--------------|-------------------|------------------|
| **GameService (OLD)** | 3965 | Everything (monolith) | RoomPersistenceService |
| **RoomService (NEW)** | ~400 | Room CRUD + connections | None (owns _rooms) |
| **LobbyService (NEW)** | ~1000 | Game config, setup, templates | RoomService |
| **GameplayService (NEW)** | ~1200 | Real-time gameplay actions | RoomService, GameStateService |
| **HostControlService (NEW)** | ~200 | Host admin controls | RoomService, GameStateService |
| **GameStateService (NEW)** | ~800 | State snapshots, persistence, transforms | RoomService, RoomPersistenceService |
| **GameService (NEW, Facade)** | ~100 | Route all calls to above services | RoomService, LobbyService, GameplayService, HostControlService, GameStateService |

---

## Implementation Order (Recommended)

1. **Create RoomService** - Extract room CRUD, no dependencies
2. **Create GameStateService** - Extract state methods, depends on RoomService
3. **Create LobbyService** - Extract lobby config, depends on RoomService
4. **Create GameplayService** - Extract gameplay, depends on RoomService + GameStateService
5. **Create HostControlService** - Extract host controls, depends on RoomService + GameStateService
6. **Create Facade GameService** - Delegates to all above
7. **Update Program.cs** - Register all new services
8. **Verify** - Run tests, ensure GameHub + background services work unchanged

---

## Testing Strategy

### Unit Test Coverage by Service
- **RoomService**: Connection/room tracking, concurrent operations on _rooms dict
- **LobbyService**: Configuration validation, game area setup, template operations
- **GameplayService**: Movement, claiming, combat resolution, copresence modes
- **HostControlService**: Host-only admin operations
- **GameStateService**: Snapshot consistency, persistence queueing, state transformations
- **Facade GameService**: Routing correctness (all calls reach correct service)

### Integration Tests
- GameHub → Facade → underlying services flow
- Background services (TroopRegen, RandomEvent, Mission) → GameStateService calls
- Persistence end-to-end (modify state → queue → RoomPersistenceService)
