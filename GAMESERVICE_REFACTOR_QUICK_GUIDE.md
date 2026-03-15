# GameService Refactor: Quick Reference Guide

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GameService (Facade)                     │
│                    Single injection point for GameHub            │
│                  delegates ALL calls to 5 services               │
└─────────────────────────────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────────────────┬──────────────────┐
    │             │                         │                  │
    ▼             ▼                         ▼                  ▼
┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐
│ Room    │ │ Lobby    │ │Gameplay │ │Host      │ │GameState │
│Service  │ │Service   │ │Service  │ │Control   │ │Service   │
│         │ │          │ │         │ │Service   │ │          │
│• Create │ │• Config  │ │• Move   │ │• Trigger │ │• Snapshot│
│• Join   │ │• Setup   │ │• Claim  │ │• Message │ │• Persist │
│• Get    │ │• Template│ │• Combat │ │• Control │ │• Transform
│• Remove │ │• Start   │ │• Ability│ │ Dynamics │ │          │
│• Query  │ │• Grid    │ │• Beacon │ │• Hostage │ │          │
└─────────┘ └──────────┘ └─────────┘ └──────────┘ └──────────┘
     │           │            │            │             │
     └───────────┴────────────┴────────────┴─────────────┘
              RoomService (owns _rooms dict)
                        │
                        ▼
         RoomPersistenceService (DB persistence)
```

## 📋 Method Distribution Checklist

### RoomService (9 methods) - Room CRUD & Connections
- [ ] `CreateRoom(hostUserId, hostUsername, connectionId)`
- [ ] `JoinRoom(roomCode, userId, username, connectionId)`
- [ ] `GetRoom(code)`
- [ ] `GetRoomByConnection(connectionId)`
- [ ] `GetRoomByUserId(userId, roomCode?)`
- [ ] `RemoveConnection(room, connectionId, returnedToLobby)`
- [ ] `RestoreRooms(rooms)`
- [ ] `GetRoomsForUser(userId)`
- [ ] `GetPlayingRoomCodes()` ← Background services call this

### LobbyService (26 methods) - Game Setup & Configuration
- [ ] `SetAlliance`, `ConfigureAlliances`, `DistributePlayersRandomly`
- [ ] `AssignAllianceStartingTile`, `SetMapLocation`, `SetTileSize`
- [ ] `SetHostBypassGps`, `SetMaxFootprint`
- [ ] `LoadMapTemplate`, `SaveCurrentAreaAsTemplate` (async)
- [ ] `UseCenteredGameArea`, `SetPatternGameArea`, `SetCustomGameArea`
- [ ] `SetClaimMode`, `SetAllowSelfClaim`, `SetWinCondition`
- [ ] `SetCopresenceModes`, `SetCopresencePreset`, `SetGameDynamics`
- [ ] `SetPlayerRole`, `SetAllianceHQ`
- [ ] `SetMasterTile`, `SetMasterTileByHex`, `AssignStartingTile`
- [ ] `StartGame` (includes AutoAssignTiles helper)

### GameplayService (12 methods) - Real-time Gameplay
- [ ] `UpdatePlayerLocation(roomCode, userId, lat, lng)` ← Main gameplay loop
- [ ] `PickUpTroops(roomCode, userId, q, r, count, lat, lng)`
- [ ] `PlaceTroops(roomCode, userId, q, r, count)`
- [ ] `ReClaimHex(roomCode, userId, q, r, mode)`
- [ ] `ActivateBeacon`, `DeactivateBeacon`
- [ ] `ActivateStealth`
- [ ] `ActivateCommandoRaid(roomCode, userId, targetQ, targetR)`
- [ ] `ResolveDuel(roomCode, duelId, accepted)`
- [ ] `DetainPlayer(roomCode, detainerId, targetId)`
- [ ] `SetHostObserverMode(roomCode, userId, enabled)`
- [ ] `PauseGame(roomCode, userId, paused)`

### HostControlService (5 methods) - Host Admin Controls
- [ ] `TriggerGameEvent(roomCode, userId, eventType, ...)`
- [ ] `UpdateGameDynamicsLive(roomCode, userId, dynamics)`
- [ ] `SendHostMessage(roomCode, userId, message)`
- [ ] `GetAllianceConnectionIds(room, allianceIds)` ← Helper for hub broadcasting
- [ ] `ProcessHostageReleases(room)` ← Called by background services

### GameStateService (15+ methods) - State & Persistence
- [ ] `GetStateSnapshot(roomCode)` ← Called frequently
- [ ] `AddReinforcementsToAllHexes(roomCode)` ← TroopRegenerationService calls
- [ ] `ProcessDuelExpiry(room)` ← TroopRegenerationService calls
- [ ] `GetPlayerSnapshot(fullSnapshot, userId)` ← Fog of War
- [ ] `GetPlayerSnapshot(fullSnapshot, userId, hiddenFogCells)` ← Overload
- [ ] `CreateHiddenFogCellsForBroadcast(fullSnapshot)` ← TroopRegenerationService
- [ ] `InitiateDuel(roomCode, challengerId, targetId, q, r)`
- [ ] `AppendEventLogPublic(state, entry)` ← RandomEventService calls
- [ ] `SnapshotStatePublic(state)` ← RandomEventService calls
- [ ] Plus internal helpers: QueuePersistence, SnapshotState, ApplyWinCondition, etc.

### Facade GameService (Router Only)
- [ ] Routes all calls to above 5 services
- [ ] Single DI injection point
- [ ] Minimal logic—mostly delegation

## 🔄 Critical Interaction Patterns

### Pattern 1: Modify Room State + Persist
```csharp
// In any service (Lobby, Gameplay, Host, etc.)
var room = RoomService.GetRoom(roomCode);
lock (room.SyncRoot) {
    // Modify room.State
    room.State.SomeField = newValue;
    
    // Get snapshot while locked
    var snapshot = GameStateService.GetStateSnapshot(roomCode);
    
    // Queue persistence (non-blocking)
    GameStateService.QueuePersistence(room, snapshot);
}
return (snapshot, null);
```

### Pattern 2: Background Service Loop
```csharp
// In TroopRegenerationService
foreach (var roomCode in RoomService.GetPlayingRoomCodes()) {
    var room = RoomService.GetRoom(roomCode);
    var (state, error) = GameStateService.AddReinforcementsToAllHexes(roomCode);
    var hiddenFogCells = GameStateService.CreateHiddenFogCellsForBroadcast(state);
    // Broadcast via hub...
}
```

### Pattern 3: Event Logging (Random Event Service)
```csharp
// In RandomEventService
lock (room.SyncRoot) {
    GameStateService.AppendEventLogPublic(room.State, new GameEventLogEntry {
        Type = "RandomEvent",
        Message = "..."
    });
}
var snapshot = GameStateService.SnapshotStatePublic(room.State);
// Broadcast...
```

## ⚠️ Critical Implementation Notes

### Lifetime Management
```csharp
// Program.cs - ALL must be Singleton (shared _rooms dict)
builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton<LobbyService>();
builder.Services.AddSingleton<GameplayService>();
builder.Services.AddSingleton<HostControlService>();
builder.Services.AddSingleton<GameStateService>();
builder.Services.AddSingleton<GameService>();  // Facade

// DON'T create scoped instances!
// RoomPersistenceService internally uses IServiceScopeFactory for DB access ✓
```

### Lock Requirements
```csharp
// ✓ ALWAYS lock when reading/modifying room.State
lock (room.SyncRoot) {
    // Safe zone
}

// ✓ Release lock BEFORE async calls
lock (room.SyncRoot) {
    var data = room.State.SomeData;
}
// Safe to do async work here

// ✗ DON'T hold lock during async operations
```

### Static/Shared State
```csharp
// These move to LobbyService (static, never mutated)
private static readonly string[] Colors = [...]
private static readonly string[] AllianceColors = [...]
private static readonly Dictionary<string, List<CopresenceMode>> CopresencePresets = ...

// RoomService owns this (only MUTABLE shared state)
private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();
```

## 🔗 No Changes Required For

- ✓ GameHub.cs (still injects GameService facade)
- ✓ TroopRegenerationService.cs (still calls same GameService methods)
- ✓ RandomEventService.cs (still calls same GameService methods)
- ✓ MissionService.cs (still calls same GameService methods)
- ✓ RoomPersistenceService.cs (no internal changes)
- ✓ All model files (GameRoom, GameState, HexCell, etc.)

## 📝 Files That MUST Change

| File | Changes | Impact |
|------|---------|--------|
| **GameService.cs** | Split into 5 files | High |
| **Program.cs** | Add 5 new service registrations | Medium |
| **RoomService.cs** | NEW FILE (~400 lines) | High |
| **LobbyService.cs** | NEW FILE (~1000 lines) | High |
| **GameplayService.cs** | NEW FILE (~1200 lines) | High |
| **HostControlService.cs** | NEW FILE (~200 lines) | High |
| **GameStateService.cs** | NEW FILE (~800 lines) | High |

## ✅ Implementation Checklist

- [ ] Create RoomService.cs (owns _rooms dict, simple CRUD)
- [ ] Create GameStateService.cs (state ops, persistence queueing)
- [ ] Create LobbyService.cs (game config, setup)
- [ ] Create GameplayService.cs (movement, claiming, combat)
- [ ] Create HostControlService.cs (admin controls)
- [ ] Create new GameService.cs (facade only)
- [ ] Update Program.cs (register 5 new services)
- [ ] Update GameService.cs startup restoration call (→ RoomService)
- [ ] Run all unit tests
- [ ] Run integration tests (GameHub → services)
- [ ] Test background services (TroopRegen, RandomEvent, Mission)
- [ ] Load test with multiple rooms in memory

## 🚀 Expected Benefits Post-Refactor

✓ **Clarity**: Each service has single responsibility
✓ **Testability**: Can test GameplayService without LobbyService
✓ **Maintainability**: 1000 lines > 3965 lines (4x easier to navigate)
✓ **Extensibility**: Easy to add new game mechanics to GameplayService
✓ **Isolation**: Bug in lobby setup won't affect gameplay engine
✓ **Reusability**: Services can be composed differently for different game modes

