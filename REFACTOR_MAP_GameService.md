# GameService Refactor Map
**Analysis of backend/Landgrab.Api/Services/GameService.cs**
**File Size:** 3965 lines | **Public Methods:** 61 | **Primary Language:** C#

---

## Executive Summary

GameService is a monolithic service managing all game room lifecycle, state management, and game mechanics. It has **104 direct method calls from GameHub alone** (the primary consumer), with additional usage from background services. The refactor should distribute methods into 6+ targeted services while maintaining thread-safe state management.

---

## 1. Consumer Analysis & Method Mapping

### 1.1 GameHub (Line 1-990 in Hub file)
**104 total method calls** - Primary consumer for player actions

#### Connection Management (7 calls)
- `GetRoomByConnection(connectionId)` - line 24, 93, 108, 127, 146, ...
- `RemoveConnection(room, connectionId, returnedToLobby)` - line 27, 97
- `JoinRoom(roomCode, userId, username, connectionId)` - line 47, 70
- `GetRoomByUserId(userId, roomCode)` - line 62
- `CreateRoom(hostUserId, hostUsername, connectionId)` - line 38

#### Room & State Access (5 calls)
- `GetStateSnapshot(roomCode)` - line 28, 40, 55, 79, 99, ...
- `GetRoomsForUser(userId)` - line 104
- `GetRoom(code)` - used indirectly

#### Game Setup (Lobby Phase) (15 calls)
- `SetMapLocation(roomCode, userId, lat, lng)` - line 115
- `SetAlliance(roomCode, userId, allianceName)` - line 134
- `ConfigureAlliances(roomCode, userId, List<allianceNames>)` - line 153
- `DistributePlayersRandomly(roomCode, userId)` - line 172
- `AssignAllianceStartingTile(roomCode, userId, q, r, allianceId)` - line 191
- `SetTileSize(roomCode, userId, meters)` - line 210
- `UseCenteredGameArea(roomCode, userId)` - line 229
- `SetPatternGameArea(roomCode, userId, pattern)` - line 248
- `SetCustomGameArea(roomCode, userId, coordinates)` - line 267
- `SetClaimMode(roomCode, userId, mode)` - line 286
- `SetAllowSelfClaim(roomCode, userId, allow)` - line 305
- `SetWinCondition(roomCode, userId, type, value)` - line 324
- `SetCopresenceModes(roomCode, userId, modes)` - line 343
- `SetCopresencePreset(roomCode, userId, preset)` - line 362
- `SetGameDynamics(roomCode, userId, dynamics)` - line 381

#### Game Map & Terrain (4 calls)
- `SetMasterTile(roomCode, userId, lat, lng)` - line 514
- `SetMasterTileByHex(roomCode, userId, q, r)` - line 533
- `AssignStartingTile(roomCode, userId, q, r, targetPlayerId)` - line 552
- `LoadMapTemplate(roomCode, userId, templateId, scopeFactory)` - line 834

#### Game Start & Progress (12 calls)
- `StartGame(roomCode, userId)` - line 581
- `UpdatePlayerLocation(roomCode, userId, lat, lng)` - line 600 [RETURNS: state, error, newDuel, tollPaid, preyCaught]
- `PickUpTroops(roomCode, userId, q, r, count, playerLat, playerLng)` - line 657
- `PlaceTroops(roomCode, userId, q, r, count, mode, playerLat, playerLng)` - line 680
- `ReClaimHex(roomCode, userId, q, r, mode)` - line 718
- `ActivateBeacon(roomCode, userId)` - line 438
- `DeactivateBeacon(roomCode, userId)` - line 457
- `ActivateStealth(roomCode, userId)` - line 476
- `ActivateCommandoRaid(roomCode, userId, targetQ, targetR)` - line 495
- `SetPlayerRole(roomCode, userId, role)` - line 400
- `SetAllianceHQ(roomCode, userId, q, r, allianceId)` - line 419
- `DetainPlayer(roomCode, detainerId, targetPlayerId)` - line 777

#### Duel Management (3 calls)
- `ResolveDuel(roomCode, duelId, accepted)` - line 754, 768
- InitiateDuel - NOT CALLED FROM GameHub (used by UpdatePlayerLocation internally)

#### Host/Admin Actions (13 calls)
- `SetHostBypassGps(roomCode, userId, bypass)` - line 792
- `SetMaxFootprint(roomCode, userId, meters)` - line 813
- `SaveCurrentAreaAsTemplate(roomCode, userId, ...)` - line 855
- `SetHostObserverMode(roomCode, userId, enabled)` - line 877
- `UpdateGameDynamicsLive(roomCode, userId, dynamics)` - line 891
- `TriggerGameEvent(roomCode, userId, eventType, targetQ, targetR, targetAllianceId)` - line 906
- `SendHostMessage(roomCode, userId, message, targetAllianceIds)` - line 927
- `GetAllianceConnectionIds(room, allianceIds)` - line 935
- `PauseGame(roomCode, userId, paused)` - line 961
- `GetPlayerSnapshot(state, userId, hiddenFogCells)` - line 980, 986
- `CreateHiddenFogCellsForBroadcast(state)` - line 980

#### Broadcast Helper
- `GetPlayerSnapshot(fullSnapshot, userId)` - Overload 1 (line 2910)
- `GetPlayerSnapshot(fullSnapshot, userId, hiddenFogCells)` - Overload 2 (line 2918)
- `CreateHiddenFogCellsForBroadcast(fullSnapshot)` - line 2955

---

### 1.2 TroopRegenerationService (78 lines)
**6 method calls** - Periodic reinforcement & duel expiry

```
foreach (var roomCode in gameService.GetPlayingRoomCodes())  // Line 23
    var room = gameService.GetRoom(roomCode)  // Line 25
    var (state, error) = gameService.AddReinforcementsToAllHexes(roomCode)  // Line 29
    gameService.ProcessDuelExpiry(room)  // Line 34
    var hiddenFogCells = gameService.CreateHiddenFogCellsForBroadcast(state)  // Line 42
    var playerSnapshot = gameService.GetPlayerSnapshot(state, userId, hiddenFogCells)  // Line 48
```

---

### 1.3 RandomEventService (163 lines)
**5 method calls** - Random event generation & logging

```
foreach (var roomCode in gameService.GetPlayingRoomCodes())  // Line 26
    var room = gameService.GetRoom(roomCode)  // Line 28
    gameService.AppendEventLogPublic(room.State, ...)  // Lines 74, 100, 124, 135
    var snapshot = gameService.SnapshotStatePublic(room.State)  // Line 150
```

**Special Note:** RandomEventService directly manipulates room.State inside lock (lines 60-144)
- Modifies: hex troops, IsRushHour flag, event logs
- Does NOT call GameService for mutations

---

### 1.4 MissionService (572 lines)
**2 method calls** - Mission snapshots only

```
foreach (var roomCode in gameService.GetPlayingRoomCodes())  // Line 67
    var room = gameService.GetRoom(roomCode)  // Line 69
    var snapshot = gameService.SnapshotStatePublic(room.State)  // Line 161
```

**Special Note:** MissionService directly manipulates room.State inside lock (lines 96-136)
- Modifies: missions, event logs, potential troop rewards
- Does NOT call GameService for mutations

---

## 2. Method Grouping by Target Service Domain

### Service 1: RoomConnectionService
**Purpose:** Room creation, joining, disconnection, connection tracking
**Lines in GameService:** ~180 LOC
**Methods:**
- `CreateRoom(hostUserId, hostUsername, connectionId)`
- `JoinRoom(roomCode, userId, username, connectionId)`
- `GetRoom(code)`
- `GetRoomByConnection(connectionId)`
- `GetRoomByUserId(userId, roomCode)`
- `RemoveConnection(room, connectionId, returnedToLobby)`
- `GetRoomsForUser(userId)`
- `GetPlayingRoomCodes()`
- `RestoreRooms(rooms)` [persistence-related]
- `GetAllianceConnectionIds(room, allianceIds)` [helper]

**Dependencies:**
- RoomPersistenceService (injected)
- GameRoom, GameState models
- SignalR Hub integration (indirect via consumer)

**Consumers:** GameHub primarily

---

### Service 2: GameLobbyService / LobbyConfigService
**Purpose:** Pre-game lobby configuration (maps, alliances, rules)
**Lines in GameService:** ~600 LOC
**Methods:**
- `SetMapLocation(roomCode, userId, lat, lng)`
- `SetAlliance(roomCode, userId, allianceName)`
- `ConfigureAlliances(roomCode, userId, List<allianceNames>)`
- `DistributePlayersRandomly(roomCode, userId)`
- `AssignAllianceStartingTile(roomCode, userId, q, r, allianceId)`
- `SetTileSize(roomCode, userId, meters)`
- `UseCenteredGameArea(roomCode, userId)`
- `SetPatternGameArea(roomCode, userId, pattern)`
- `SetCustomGameArea(roomCode, userId, coordinates)`
- `SetClaimMode(roomCode, userId, mode)`
- `SetAllowSelfClaim(roomCode, userId, allow)`
- `SetWinCondition(roomCode, userId, type, value)`
- `SetCopresenceModes(roomCode, userId, modes)`
- `SetCopresencePreset(roomCode, userId, preset)`
- `SetGameDynamics(roomCode, userId, dynamics)`
- `SetPlayerRole(roomCode, userId, role)`
- `SetHostBypassGps(roomCode, userId, bypass)`
- `SetMaxFootprint(roomCode, userId, meters)`
- `LoadMapTemplate(roomCode, userId, templateId, scopeFactory)` [async]
- `SaveCurrentAreaAsTemplate(roomCode, userId, ...)` [async]

**Dependencies:**
- RoomConnectionService (for GetRoom, room validation)
- GlobalMapService (referenced - map templates)
- TerrainFetchService (referenced - terrain data)
- Models: GameRoom, GameState, MapTemplate

**Consumers:** GameHub exclusively (lobby phase)

---

### Service 3: GameStartService / GameInitializationService
**Purpose:** Starting games, initial state setup
**Lines in GameService:** ~150 LOC
**Methods:**
- `StartGame(roomCode, userId)`
- `AssignStartingTile(roomCode, userId, q, r, targetPlayerId)`
- `SetMasterTile(roomCode, userId, lat, lng)`
- `SetMasterTileByHex(roomCode, userId, q, r)`
- `SetAllianceHQ(roomCode, userId, q, r, allianceId)`

**Dependencies:**
- RoomConnectionService (GetRoom)
- GameLobbyService (config validation)
- HexService (for hex operations)
- GlobalMapService (for map data)

**Consumers:** GameHub (StartGame action)

---

### Service 4: GameplayService / TroopManagementService
**Purpose:** Core gameplay mechanics (movement, placement, combat)
**Lines in GameService:** ~1200 LOC
**Methods:**
- `UpdatePlayerLocation(roomCode, userId, lat, lng)` [COMPLEX - 400+ LOC]
  - Returns: (state, error, newDuel, tollPaid, preyCaught)
  - Handles: Movement, duel initiation, toll collection, prey capture
- `PickUpTroops(roomCode, userId, q, r, count, playerLat, playerLng)`
  - Returns: (state, error, ambushResult)
- `PlaceTroops(roomCode, userId, q, r, count, mode, playerLat, playerLng)` [COMPLEX - 200+ LOC]
  - Returns: (state, error, previousOwnerId, combatResult)
  - Handles: Combat logic, alliance mechanics, hex claiming
- `ReClaimHex(roomCode, userId, q, r, mode)`
- `AddReinforcementsToAllHexes(roomCode)` [per-tick game loop]

**Dependencies:**
- RoomConnectionService (GetRoom)
- HexService (hex operations, validation)
- CombatResolver (internal or separate)
- DuelService (duel creation)

**Consumers:** GameHub (primary), TroopRegenerationService (reinforcements tick)

---

### Service 5: CopresenceAbilityService / SpecialActionsService
**Purpose:** Special copresence abilities and modes
**Lines in GameService:** ~300 LOC
**Methods:**
- `ActivateBeacon(roomCode, userId)`
- `DeactivateBeacon(roomCode, userId)`
- `ActivateStealth(roomCode, userId)`
- `ActivateCommandoRaid(roomCode, userId, targetQ, targetR)`

**Dependencies:**
- RoomConnectionService (GetRoom)
- GameplayService (state modifications)

**Consumers:** GameHub exclusively

---

### Service 6: DuelManagementService / CombatResolutionService
**Purpose:** Duel lifecycle and resolution
**Lines in GameService:** ~100 LOC
**Methods:**
- `InitiateDuel(roomCode, challengerId, targetId, q, r)`
- `ResolveDuel(roomCode, duelId, accepted)`
- `ProcessDuelExpiry(room)`

**Indirect Usage:**
- Called from UpdatePlayerLocation (duel creation)
- Called from TroopRegenerationService (expiry check)

**Dependencies:**
- RoomConnectionService (GetRoom)
- Models: PendingDuel

**Consumers:** GameHub (ResolveDuel), TroopRegenerationService (ProcessDuelExpiry)

---

### Service 7: HostageManagementService
**Purpose:** Hostage mechanics (capture/release)
**Lines in GameService:** ~80 LOC
**Methods:**
- `DetainPlayer(roomCode, detainerId, targetId)`
- `ProcessHostageReleases(room)`

**Dependencies:**
- RoomConnectionService (GetRoom)

**Consumers:** GameHub (DetainPlayer), [ProcessHostageReleases appears unused]

---

### Service 8: EventManagementService / GameEventService
**Purpose:** Event logging and snapshots
**Lines in GameService:** ~100 LOC
**Methods:**
- `AppendEventLogPublic(state, entry)` → delegates to private `AppendEventLog(state, entry)`
- `SnapshotStatePublic(state)` → delegates to private `SnapshotState(state)`
- `GetPlayerSnapshot(fullSnapshot, userId)` [Overload 1]
- `GetPlayerSnapshot(fullSnapshot, userId, hiddenFogCells)` [Overload 2]
- `CreateHiddenFogCellsForBroadcast(fullSnapshot)`

**Dependencies:**
- None explicit (utility methods)

**Consumers:** 
- TroopRegenerationService (snapshots, broadcasts)
- RandomEventService (event logging, snapshots)
- MissionService (snapshots)
- GameHub (broadcast helpers)

---

### Service 9: GameStateManagementService / GameStateService
**Purpose:** State queries, snapshots, visibility
**Lines in GameService:** ~200 LOC
**Methods:**
- `GetStateSnapshot(roomCode)`
- `GetPlayerSnapshot(fullSnapshot, userId)`
- `GetPlayerSnapshot(fullSnapshot, userId, hiddenFogCells)`
- `CreateHiddenFogCellsForBroadcast(fullSnapshot)`

**Dependencies:**
- None (utility/query only)

**Consumers:** All consumers (direct or indirect)

---

### Service 10: AdminHostService / GameAdminService
**Purpose:** Host admin actions and game control
**Lines in GameService:** ~200 LOC
**Methods:**
- `TriggerGameEvent(roomCode, userId, eventType, targetQ, targetR, targetAllianceId)`
- `SendHostMessage(roomCode, userId, message, targetAllianceIds)`
- `UpdateGameDynamicsLive(roomCode, userId, dynamics)`
- `SetHostObserverMode(roomCode, userId, enabled)`
- `PauseGame(roomCode, userId, paused)`

**Dependencies:**
- RoomConnectionService (GetRoom)
- GameplayService (for state access)

**Consumers:** GameHub exclusively

---

## 3. Cross-Service Dependencies Graph

```
RoomConnectionService
    ↓ uses
    └─ RoomPersistenceService [INJECTED]

GameLobbyService
    ↓ depends on
    ├─ RoomConnectionService (room lookup)
    ├─ GlobalMapService (map templates)
    └─ TerrainFetchService (terrain data)

GameStartService
    ↓ depends on
    ├─ RoomConnectionService
    ├─ GameLobbyService (config validation)
    ├─ HexService
    └─ GlobalMapService

GameplayService [★ CRITICAL - Large surface area]
    ↓ depends on
    ├─ RoomConnectionService
    ├─ HexService (core)
    ├─ DuelManagementService
    └─ [Combat logic - internal or extracted]

CopresenceAbilityService
    ↓ depends on
    ├─ RoomConnectionService
    └─ GameplayService

DuelManagementService
    ↓ depends on
    └─ RoomConnectionService

HostageManagementService
    ↓ depends on
    └─ RoomConnectionService

EventManagementService
    ↓ depends on
    └─ [None - utility methods only]

GameStateManagementService
    ↓ depends on
    └─ [None - utility methods only]

AdminHostService
    ↓ depends on
    ├─ RoomConnectionService
    └─ GameplayService
```

---

## 4. Methods Directly Used by Background Services

### TroopRegenerationService Dependencies:
```
1. GetPlayingRoomCodes()           → List<string> roomCodes
   [MUST KEEP PUBLIC - central room discovery]

2. GetRoom(roomCode)               → GameRoom
   [MUST KEEP PUBLIC - room access]

3. AddReinforcementsToAllHexes(roomCode)  → (GameState?, error)
   [CAN MOVE TO: GameplayService]
   [USES: room.State, lock(room.SyncRoot)]

4. ProcessDuelExpiry(room)         → void
   [CAN MOVE TO: DuelManagementService]
   [USES: room.State, room.SyncRoot]

5. CreateHiddenFogCellsForBroadcast(state)  → IReadOnlyDictionary<string, HexCell>
   [KEEP OR MOVE TO: EventManagementService/GameStateManagementService]
   [FOG OF WAR: Visibility calculation]

6. GetPlayerSnapshot(state, userId, hiddenFogCells)  → GameState
   [KEEP OR MOVE TO: GameStateManagementService]
   [FOG OF WAR: Player-specific snapshot]
```

### RandomEventService Dependencies:
```
1. GetPlayingRoomCodes()           → List<string>
   [SAME AS ABOVE - CRITICAL]

2. GetRoom(roomCode)               → GameRoom
   [SAME AS ABOVE]

3. AppendEventLogPublic(state, entry)  → void
   [CAN MOVE TO: EventManagementService]
   [WRAPS: private AppendEventLog]
   [USED: Direct state mutation in RandomEventService]

4. SnapshotStatePublic(state)      → GameState
   [CAN MOVE TO: GameStateManagementService]
   [WRAPS: private SnapshotState]
```

### MissionService Dependencies:
```
1. GetPlayingRoomCodes()           → List<string>
   [SAME AS ABOVE]

2. GetRoom(roomCode)               → GameRoom
   [SAME AS ABOVE]

3. SnapshotStatePublic(state)      → GameState
   [SAME AS ABOVE]
   [USED: Line 161 to broadcast missions]
```

---

## 5. Thread Safety & Room State Management

### Current Implementation:
- All GameService methods use: `lock (room.SyncRoot)` pattern
- `SyncRoot` is object field on GameRoom
- Multiple methods queue persistence: `QueuePersistence(room, snapshot)`

### Critical Observation:
**RandomEventService and MissionService DIRECTLY MUTATE room.State inside their own locks**
- They do NOT call GameService for mutations
- They only use GameService for:
  - Room discovery: `GetPlayingRoomCodes()`, `GetRoom()`
  - Snapshots: `SnapshotStatePublic()`
  - Event logging: `AppendEventLogPublic()`

### Refactoring Impact:
1. Keep `room.SyncRoot` locking pattern consistent
2. Extract services that operate on room.State must use same lock
3. Background services must continue direct mutation (performance critical)
4. Provide utility methods for state snapshot/event-log that background services can call

---

## 6. Extra Files/Types Needed for Refactor

### New Service Files to Create:
```
Services/
├── RoomConnectionService.cs         (~200 LOC)
├── GameLobbyService.cs              (~400 LOC)
├── GameStartService.cs              (~150 LOC)
├── GameplayService.cs               (~1200 LOC) ★ LARGEST
├── CopresenceAbilityService.cs      (~300 LOC)
├── DuelManagementService.cs         (~120 LOC)
├── HostageManagementService.cs      (~80 LOC)
├── EventManagementService.cs        (~100 LOC)
├── GameStateManagementService.cs    (~200 LOC)
├── AdminHostService.cs              (~200 LOC)
└── IGameService.cs (FACADE)         (~100 LOC) [optional]
```

### New Models/Enums (if not already present):
```
Models/
├── CombatResult.cs                  [used by PlaceTroops]
├── AmbushResult.cs                  [used by PickUpTroops]
└── [Verify existing]: PendingDuel, Mission, GameEventLogEntry, etc.
```

### DI Configuration Updates:
**File:** `Program.cs`

Current (assumed):
```csharp
services.AddScoped<GameService>();
services.AddScoped<RoomPersistenceService>();
```

New (refactored):
```csharp
// Core services
services.AddScoped<RoomPersistenceService>();

// Domain services
services.AddScoped<RoomConnectionService>();
services.AddScoped<GameLobbyService>();
services.AddScoped<GameStartService>();
services.AddScoped<GameplayService>();
services.AddScoped<CopresenceAbilityService>();
services.AddScoped<DuelManagementService>();
services.AddScoped<HostageManagementService>();
services.AddScoped<EventManagementService>();
services.AddScoped<GameStateManagementService>();
services.AddScoped<AdminHostService>();

// Optional: Facade for backward compatibility
services.AddScoped<GameService>();  // Could delegate to all above
```

### Consumer Update Points:
1. **GameHub.cs** (990 lines)
   - Inject all 10 new services instead of GameService
   - Update ~104 method calls to use appropriate service

2. **TroopRegenerationService.cs** (78 lines)
   - Keep injecting GameService (or minimal facade)
   - Methods: GetPlayingRoomCodes, GetRoom, AddReinforcementsToAllHexes, ProcessDuelExpiry, snapshots

3. **RandomEventService.cs** (163 lines)
   - Keep injecting GameService (or minimal facade)
   - Methods: GetPlayingRoomCodes, GetRoom, AppendEventLogPublic, SnapshotStatePublic

4. **MissionService.cs** (572 lines)
   - Keep injecting GameService (or minimal facade)
   - Methods: GetPlayingRoomCodes, GetRoom, SnapshotStatePublic

---

## 7. Detailed Method Mapping Table

| Method | Current LOC | Target Service | Type | Public? | Consumers |
|--------|------------|----------------|------|---------|-----------|
| CreateRoom | 30 | RoomConnectionService | Sync | Yes | GameHub |
| JoinRoom | 50 | RoomConnectionService | Sync | Yes | GameHub |
| GetRoom | 3 | RoomConnectionService | Sync | Yes | All |
| GetStateSnapshot | 10 | GameStateManagementService | Sync | Yes | GameHub, others |
| GetRoomByConnection | 2 | RoomConnectionService | Sync | Yes | GameHub |
| GetRoomByUserId | 20 | RoomConnectionService | Sync | Yes | GameHub |
| RestoreRooms | 40 | RoomConnectionService | Sync | Yes | Startup |
| GetRoomsForUser | 35 | RoomConnectionService | Sync | Yes | GameHub |
| GetPlayingRoomCodes | 15 | RoomConnectionService | Sync | Yes | **Background Services** |
| RemoveConnection | 30 | RoomConnectionService | Sync | Yes | GameHub |
| SetAlliance | 80 | GameLobbyService | Sync | Yes | GameHub |
| ConfigureAlliances | 50 | GameLobbyService | Sync | Yes | GameHub |
| DistributePlayersRandomly | 45 | GameLobbyService | Sync | Yes | GameHub |
| AssignAllianceStartingTile | 55 | GameLobbyService | Sync | Yes | GameHub |
| SetMapLocation | 25 | GameLobbyService | Sync | Yes | GameHub |
| SetTileSize | 25 | GameLobbyService | Sync | Yes | GameHub |
| SetHostBypassGps | 20 | GameLobbyService | Sync | Yes | GameHub |
| SetMaxFootprint | 20 | GameLobbyService | Sync | Yes | GameHub |
| LoadMapTemplate | 75 | GameLobbyService | Async | Yes | GameHub |
| SaveCurrentAreaAsTemplate | 50 | GameLobbyService | Async | Yes | GameHub |
| UseCenteredGameArea | 15 | GameLobbyService | Sync | Yes | GameHub |
| SetPatternGameArea | 20 | GameLobbyService | Sync | Yes | GameHub |
| SetCustomGameArea | 30 | GameLobbyService | Sync | Yes | GameHub |
| SetClaimMode | 25 | GameLobbyService | Sync | Yes | GameHub |
| SetAllowSelfClaim | 20 | GameLobbyService | Sync | Yes | GameHub |
| SetWinCondition | 40 | GameLobbyService | Sync | Yes | GameHub |
| SetCopresenceModes | 30 | GameLobbyService | Sync | Yes | GameHub |
| SetCopresencePreset | 30 | GameLobbyService | Sync | Yes | GameHub |
| SetGameDynamics | 30 | GameLobbyService | Sync | Yes | GameHub |
| SetPlayerRole | 30 | GameLobbyService | Sync | Yes | GameHub |
| SetAllianceHQ | 30 | GameStartService | Sync | Yes | GameHub |
| ActivateBeacon | 35 | CopresenceAbilityService | Sync | Yes | GameHub |
| DeactivateBeacon | 25 | CopresenceAbilityService | Sync | Yes | GameHub |
| ActivateStealth | 40 | CopresenceAbilityService | Sync | Yes | GameHub |
| ActivateCommandoRaid | 60 | CopresenceAbilityService | Sync | Yes | GameHub |
| SetMasterTile | 35 | GameStartService | Sync | Yes | GameHub |
| SetMasterTileByHex | 20 | GameStartService | Sync | Yes | GameHub |
| AssignStartingTile | 220 | GameStartService | Sync | Yes | GameHub |
| StartGame | 90 | GameStartService | Sync | Yes | GameHub |
| UpdatePlayerLocation | 400 | GameplayService | Sync | Yes | GameHub |
| PickUpTroops | 90 | GameplayService | Sync | Yes | GameHub |
| PlaceTroops | 200 | GameplayService | Sync | Yes | GameHub |
| ReClaimHex | 55 | GameplayService | Sync | Yes | GameHub |
| AddReinforcementsToAllHexes | 340 | GameplayService | Sync | Yes | TroopRegenerationService |
| AppendEventLogPublic | 2 | EventManagementService | Sync | Yes | RandomEventService, others |
| SnapshotStatePublic | 2 | GameStateManagementService | Sync | Yes | All background services |
| GetPlayerSnapshot (v1) | 10 | GameStateManagementService | Sync | Yes | GameHub |
| GetPlayerSnapshot (v2) | 40 | GameStateManagementService | Sync | Yes | TroopRegenerationService |
| CreateHiddenFogCellsForBroadcast | 370 | GameStateManagementService | Sync | Yes | TroopRegenerationService |
| InitiateDuel | 30 | DuelManagementService | Sync | Yes | UpdatePlayerLocation (internal) |
| ResolveDuel | 50 | DuelManagementService | Sync | Yes | GameHub |
| DetainPlayer | 50 | HostageManagementService | Sync | Yes | GameHub |
| ProcessHostageReleases | 45 | HostageManagementService | Sync | Yes | [Unused - move or delete] |
| ProcessDuelExpiry | 45 | DuelManagementService | Sync | Yes | TroopRegenerationService |
| SetHostObserverMode | 25 | AdminHostService | Sync | Yes | GameHub |
| UpdateGameDynamicsLive | 50 | AdminHostService | Sync | Yes | GameHub |
| TriggerGameEvent | 115 | AdminHostService | Sync | Yes | GameHub |
| SendHostMessage | 35 | AdminHostService | Sync | Yes | GameHub |
| PauseGame | 30 | AdminHostService | Sync | Yes | GameHub |
| GetAllianceConnectionIds | 5 | RoomConnectionService | Sync | Yes | GameHub, AdminHostService |

---

## 8. Implementation Notes

### Critical Refactoring Constraints:

1. **Thread Safety MUST be preserved**
   - All services must be thread-safe
   - Lock pattern: `lock (room.SyncRoot) { ... }`
   - Background services need safe snapshot access

2. **GameplayService is largest extraction (~1200 LOC)**
   - Contains ~40% of GameService logic
   - Has most complex interdependencies
   - Should be split further if possible:
     - Movement logic
     - Combat logic
     - Hex manipulation

3. **Background Services must stay lightweight**
   - They should NOT be refactored
   - TroopRegenerationService, RandomEventService, MissionService work correctly as-is
   - Provide clean, minimal public API for them to use

4. **Backward Compatibility Option**
   - Can create `GameService` facade that delegates to all 10 new services
   - Allows gradual migration of GameHub without big-bang refactor
   - Facade can be deleted after all consumers updated

5. **No file modifications as per request** ✓

---

## 9. Dependency Injection Chain

```
                    ┌─── RoomPersistenceService
                    │
    RoomConnectionService ──┐
                            │
    GameLobbyService ────────┤──── GlobalMapService
                            │     TerrainFetchService
    GameStartService ────────┤
                            │
    GameplayService ────────┐├──── HexService
                           ││     DuelManagementService
    CopresenceAbilityService┤
                           ││
    DuelManagementService ──┤
                           ││
    HostageManagementService┤
                           ││
    EventManagementService ─┤
                           ││
    GameStateManagementService ┐
                              │
    AdminHostService ────────────┤
                              │
    [All services inject above] ─┘

    GameHub injects ALL domain services + GlobalMapService, TerrainFetchService
```

---

## 10. Key Refactoring Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Breaking background services | HIGH | Keep GetPlayingRoomCodes, GetRoom public; provide facade if needed |
| Race conditions in new services | HIGH | Use existing room.SyncRoot pattern consistently; don't introduce new locks |
| UpdatePlayerLocation complexity | MEDIUM | Split into sub-services for movement, duel, toll logic |
| Fog of War visibility bugs | MEDIUM | Test GameStateManagementService CreateHiddenFogCellsForBroadcast thoroughly |
| Circular dependencies | MEDIUM | Keep RoomConnectionService at base level; no service depends on others with that depth |
| State mutation leaks | MEDIUM | All public methods must maintain lock discipline |

---

## 11. Implementation Sequence (Recommended)

1. **Phase 1: Foundation**
   - Extract RoomConnectionService (lowest risk)
   - Update Program.cs DI
   - Test room creation/joining

2. **Phase 2: State Management**
   - Extract GameStateManagementService (utility only)
   - Test snapshots, visibility

3. **Phase 3: Duel Management**
   - Extract DuelManagementService
   - Test with TroopRegenerationService

4. **Phase 4: Lobby Configuration**
   - Extract GameLobbyService
   - Update GameHub calls (~15 methods)

5. **Phase 5: Game Startup**
   - Extract GameStartService
   - Update GameHub calls (~5 methods)

6. **Phase 6: Gameplay** (Riskiest)
   - Extract GameplayService
   - Update GameHub calls (~12 methods)
   - Heavy testing needed

7. **Phase 7: Abilities & Admin**
   - Extract CopresenceAbilityService
   - Extract AdminHostService
   - Extract HostageManagementService/EventManagementService

8. **Phase 8: Background Services**
   - Verify TroopRegenerationService works
   - Verify RandomEventService works
   - Verify MissionService works

---

## Summary

**Total Methods:** 61 public methods
**Total LOC:** 3965 lines
**Target Services:** 10 specialized services
**Key Extraction:** GameplayService (~1200 LOC) is the critical path
**Backward Compatibility:** Facade pattern recommended for GameHub transition
**Background Services:** Must keep minimal public API (7 methods max)

