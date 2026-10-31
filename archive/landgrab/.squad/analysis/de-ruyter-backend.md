# De Ruyter — Backend Architecture Analysis

_Produced: 2026-03-24 | Author: De Ruyter (Backend Dev)_

---

## 1. Service Architecture & Separation of Concerns

### Current State
`GameService` (137 lines) is a pure delegation facade — every public method is a one-liner that forwards to the appropriate domain service. Domain services are: `RoomService`, `LobbyService`, `AllianceConfigService`, `MapAreaService`, `GameConfigService`, `GameplayService`, `AbilityService`, `HostControlService`, `GameStateService`, `WinConditionService`, `VisibilityService`, `VisibilityBroadcastHelper`, `TroopRegenerationService`, `HexService`, `DerivedMapStateService`, `RoomPersistenceService`, `GameTemplateService`.

Every domain service carries identical boilerplate: four private delegation helpers (`GetRoom`, `SnapshotState`, `AppendEventLog`, `QueuePersistence`) that all point back to `GameStateCommon` or `GameStateService`. This appears in at least 7 services.

`GameplayService` (1440 lines) is the largest and most over-loaded: it handles GPS location updates, hex coordinate resolution, troop pick-up/placement, three combat modes, fort/sabotage/demolish progress tracking, rally point expiry, commando raid resolution, troop regeneration ticks, and it doubles as a utility library used directly by `AbilityService` (`TryGetCurrentHex`, `IsFriendlyCell`, `SetCellOwner`, `ResetCarriedTroops`, etc.).

`AbilityService` (1331 lines) handles all nine role abilities for all three roles (Commander: commando raid, tactical strike, rally point, troop transfer, field battle; Scout: beacon, share intel, intercept; Engineer: fort construction, sabotage, demolish) in a single class.

### Strengths
- `GameService` as a thin facade is the correct call — hub code only imports one service and the facade never grows logic.
- Clear domain boundaries exist (config, map area, alliances, gameplay, abilities, persistence, visibility) — the concepts are right, just the sizes are wrong.
- `GameStateCommon` provides a single source of truth for constants, snapshot logic, and grid math.

### Recommendations
1. **Split `GameplayService`**: Extract role-progress tracking (`UpdateFortConstructionProgress`, `UpdateSabotageProgress`, `UpdateDemolishProgress`, `CleanupExpiredSabotageBlockedTiles`, `UpdateScoutSabotageAlert`) into a `RoleProgressService`. The remaining core (`UpdatePlayerLocation`, `PlaceTroops`, `PickUpTroops`, combat) is already cohesive.
2. **Split `AbilityService`** into `CommanderAbilityService`, `ScoutAbilityService`, and `EngineerAbilityService`. Each is independent and ~400 lines. `GameService` would composite all three.
3. **Extract the service boilerplate** into a protected base class `RoomScopedService` with `GetRoom`, `Snapshot`, `AppendLog`, `Persist` methods — eliminating the 7× duplication of identical delegation wrappers.

---

## 2. SOLID Principles

### Current State
**Single Responsibility**: `GameplayService` clearly violates SRP — movement, combat, troop mechanics, and role-ability progress are all housed in one class. It also serves as a utility library (methods marked `internal static`) for other services, meaning it has two distinct reasons to change. `AbilityService` similarly conflates all three player roles.

**Open/Closed**: Adding a new player role (e.g. a fourth role) requires modifying `AbilityService`, `LobbyService`, `GameStateCommon.SyncBeaconStateForRole`, `GameplayService.UpdatePlayerLocation`, `GameHub.Gameplay`, and `GameService`. There is no ability interface or role abstraction.

**Liskov/Interface Segregation**: `IGameRoomProvider` (3 methods: `GetRoom`, `GetRoomByConnection`, `GetRoomByUserId`) is correctly minimal. No other interfaces exist for domain services — all dependencies are taken as concrete types.

**Dependency Inversion**: Domain services depend on the `IGameRoomProvider` abstraction for room access, which is good. All other service dependencies are concrete (`GameStateService`, `WinConditionService`, `VisibilityService`), making mocking harder.

### Strengths
- `IGameRoomProvider` is a well-designed minimal interface.
- `GameService` facade means hub code depends only on one aggregate, not on each service separately.
- The `lock (room.SyncRoot)` discipline is consistently applied.

### Recommendations
1. **Introduce `IRoleAbilityService`** with `Activate`/`Deactivate` methods. Each role service implements it. `AbilityService` (or `GameService`) dispatches by `PlayerRole` enum, enabling new roles to be added without modifying existing services.
2. **Introduce interfaces for the three core services** most likely to need mocking: `IGameplayService`, `IAbilityService`, `ILobbyService`. This unblocks unit testing.
3. The dual `*Core` static / instance method pattern in `WinConditionService` (e.g. `ApplyWinCondition` → `ApplyWinConditionCore`) is an OCP smell — the static variants exist only so `GameplayService` can call them directly. Remove the static variants; instead inject `WinConditionService` into `GameplayService`.

---

## 3. DRY Violations

### Current State
Three major classes of repetition:

**A. Service boilerplate (7+ files)**
```csharp
private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
private static void AppendEventLog(GameState state, GameEventLogEntry e) => GameStateCommon.AppendEventLog(state, e);
private void QueuePersistence(GameRoom room, GameState s) => gameStateService.QueuePersistence(room, s);
```
Found identically in: `AbilityService`, `GameplayService`, `LobbyService`, `MapAreaService`, `AllianceConfigService`, `GameConfigService`, `HostControlService`.

**B. Hub room-lookup guard (59 occurrences)**
```csharp
var room = gameService.GetRoomByConnection(Context.ConnectionId);
if (room == null) { await SendError("ROOM_NOT_JOINED", "Not in a room."); return; }
```
Appears ~24 times in `GameHub.Lobby.cs`, ~25 times in `GameHub.Gameplay.cs`, ~10 times in `GameHub.Host.cs`.

**C. `QueuePersistence` logic duplicated between `RoomService` and `GameStateService`**
Both contain the same fire-and-forget `_ = Task.Run(async () => { ... PersistRoomStateAsync(...) ... })` implementation. `RoomService` calls its own copy; all other services call `GameStateService.QueuePersistence`. This means persistence is routed through two different paths.

**D. Win condition delegation chain**
`GameplayService` (lines 1434–1439) defines five `internal static` wrapper methods that do nothing except call `WinConditionService.*Core`. This creates a parallel routing table for win-condition logic, making it unclear which entry point is authoritative.

### Strengths
- Constants are centralized in `GameStateCommon` (colors, radii, tile sizes).
- `SanitizeGameDynamics` is centralized in `GameHub` rather than repeated.

### Recommendations
1. **`RoomScopedService` base class** to eliminate the 7× service boilerplate (see §1 rec 3).
2. **Hub `GetRequiredRoom()` helper method**:
   ```csharp
   private GameRoom? TryGetCurrentRoom(out Task? errorTask) { ... }
   ```
   Or use a helper that returns the room or sends the error and returns null, reducing the guard from 4 lines to 1.
3. **Consolidate `QueuePersistence`** into `GameStateService` only; remove the copy in `RoomService`. `RoomService` should call `gameStateService.QueuePersistence(...)`.
4. **Remove `GameplayService` win-condition wrappers** — inject `WinConditionService` and call it directly.

---

## 4. SignalR Hub Design

### Current State
The four partial classes are: `GameHub.cs` (base, lifecycle, helpers, validation — 321 lines), `GameHub.Lobby.cs` (lobby configuration, room join/create — 652 lines), `GameHub.Gameplay.cs` (playing-phase actions — 838 lines), `GameHub.Host.cs` (host-only controls — 310 lines).

**Partial class boundary inconsistencies:**
- `SetBeaconEnabled`, `SetTileDecayEnabled`, `SetGameDynamics`, `SetClaimMode`, `SetWinCondition`, `SetEnemySightingMemory` are in `Lobby.cs` but are host-only operations. They could arguably belong in `Host.cs`.
- `StartGame` is in `Host.cs`, but `ReturnToLobby` is in `Lobby.cs` — both are lifecycle transitions.
- `SetFieldBattleResolutionMode` is in `Host.cs` without enum validation (no `ValidateEnumString<FieldBattleResolutionMode>` call).

**Error handling inconsistencies:**
- Most lobby methods: `await SendError(error)` — uses `GENERAL` code (no domain code).
- Most gameplay methods: `await SendError(MapErrorCode(error), error)` — better.
- `PlaceTroops` in `GameHub.Gameplay.cs` uses `SendError("Not in a room.")` with no error code at all (different from the `"ROOM_NOT_JOINED"` code used everywhere else).
- `ResolveTroopTransferTarget` validates heading as `heading < 0 || heading > 360` while `ValidateHeading` in base class checks `!double.IsFinite(heading)` — inconsistent validation approach.

**Parameter validation gaps:**
- `SetTileSize` in Lobby has no validation on `meters` (no range check before calling service).
- `SetFieldBattleResolutionMode` in Host has no `ValidateEnumString` guard.
- `InitiateTroopTransfer` doesn't validate `recipientId` with `ValidateIdentifier`.

### Strengths
- `HubExceptionFilter` is excellent — all unhandled exceptions are caught, logged with structured context (method name + connection ID), and returned as generic error messages without leaking stack traces.
- Validation helpers (`ValidateCoordRange`, `ValidateLatLng`, `ValidateRoomCode`, `ValidateIdentifier`, `ValidateEnumString<T>`) are well-designed and consistent where applied.
- `SanitizeGameDynamics` provides a clean sanitization layer before passing dynamics to services.

### Recommendations
1. **Standardize error codes**: all `SendError(error)` calls in Lobby should become `SendError(MapErrorCode(error), error)`. Fix the `PlaceTroops` `"Not in a room."` inconsistency.
2. **Add missing validations**: `SetFieldBattleResolutionMode` → add `ValidateEnumString<FieldBattleResolutionMode>`. `InitiateTroopTransfer` → validate `recipientId` with `ValidateIdentifier`.
3. **Expand `MapErrorCode`**: it currently only handles 5 string-matched cases. Consider a typed error contract (enum or const keys) returned from services instead of parsing error message strings.
4. **Move host-config methods** (`SetBeaconEnabled`, `SetTileDecayEnabled`, `SetGameDynamics`, `SetClaimMode`, `SetWinCondition`) to `GameHub.Host.cs` for clearer ownership.

---

## 5. In-Memory State Architecture (Alliances Mode)

### Current State
State is stored in `RoomService._rooms` as `ConcurrentDictionary<string, GameRoom>`. Each `GameRoom` has a `SyncRoot` object used for `lock(...)` on all state mutations. There are 73 `lock(room.SyncRoot)` call sites across services — each service correctly acquires the lock before any read-modify-write.

**Known race condition risk in `TroopRegenerationService`:**
The 30-second tick calls four operations in sequence without holding a single combined lock:
```csharp
gameService.ResolveExpiredCommandoRaids(roomCode);  // locks internally
gameService.ResolveExpiredRallyPoints(roomCode);     // locks internally
gameService.ResolveActiveSabotages(roomCode);        // locks internally
var result = gameService.AddReinforcementsToAllHexes(roomCode); // locks internally
```
Between each call the lock is released, allowing hub actions to interleave. In the worst case, a player's state changes between `ResolveActiveSabotages` and `AddReinforcementsToAllHexes`, potentially violating invariants. In practice impact is small but it is architecturally unsound.

**Fire-and-forget timer in `InitiateFieldBattle`:**
```csharp
_ = Task.Run(async () => {
    await Task.Delay(TimeSpan.FromSeconds(30));
    // ... resolve battle ...
});
```
This `Task` is untracked. If the room is cleaned up or the server restarts within the 30-second window, the delayed resolution silently fails with no compensation. The captured `hubContext` reference leaks for 30 seconds per invocation.

**`GetRoomByConnection` is O(n)** — scans all rooms to find one by connection ID. Fine at small scale, problematic if many rooms accumulate.

### Strengths
- `lock (room.SyncRoot)` per-room (not global) is the right granularity — rooms are fully independent.
- `ConcurrentDictionary` for the top-level rooms dictionary ensures safe concurrent room creation.
- `QueuePersistence` fire-and-forget pattern prevents database writes from blocking the lock.

### Recommendations
1. **Composite tick method**: add a `GameRoom.ExecuteTickOperations(Action<GameState> tick)` method that holds the lock for a single combined mutation and exposes a `GameState` snapshot at the end. `TroopRegenerationService` calls one lock-bounded composite operation.
2. **Track field battle timers**: store `CancellationTokenSource` in `ActiveFieldBattle` and cancel/restart on `JoinFieldBattle`. This prevents orphaned `Task.Run` instances and enables room-cleanup integration.
3. **Add a `ConnectionMap` index** (`ConcurrentDictionary<connectionId, roomCode>`) in `RoomService` to make `GetRoomByConnection` O(1).

---

## 6. EF Core / Persistence (FFA Mode)

### Current State
`GlobalMapService` is `Scoped` (injected directly into `GameHub` constructor). This is acceptable because `GameHub` itself is transient per-connection.

`GetHexesNearAsync` uses a bounding-box LINQ query on Q and R columns:
```csharp
.Where(h => h.Q >= centerQ - approxRadius && h.Q <= centerQ + approxRadius &&
            h.R >= centerR - approxRadius && h.R <= centerR + approxRadius)
```
At `radiusKm = 50` this could match up to ~7,500 rows. There is no explicit index on `(Q, R)`, and the `Include(h => h.Owner).Include(h => h.OwnerAlliance)` causes two additional joins — potential N+1 concern if not EF-optimized. EF Core should handle these as single-query joins but the bounding box at high density is a performance concern.

`AttackHexAsync` uses `db.GlobalHexes.FindAsync(fromQ, fromR)` and `db.GlobalHexes.FindAsync(toQ, toR)` — two separate round-trips. A single query with an `In` clause or `WHERE Q IN (...) AND R IN (...)` would halve the database calls.

`RoomPersistenceService` has a well-designed per-room write-lock (`ConcurrentDictionary<string, RoomWriteLock>`) to prevent concurrent room serialization.

Auto-migration on startup (`db.Database.MigrateAsync()`) is done in a try/catch that logs a warning and continues — this means the app can start with a missing table, which could surface as confusing runtime errors rather than a clear startup failure.

### Strengths
- `AsNoTracking()` is consistently used for read-only queries — good.
- `RoomPersistenceService` serializes rooms to JSON in `PersistedRoom` — decouples persistence format from EF model.
- Startup room restoration is comprehensive (deactivate stale, restore active).

### Recommendations
1. **Add a composite index** on `GlobalHex(Q, R)` in the EF model configuration, or at minimum add a migration that creates it. Document the expected query pattern.
2. **Batch the two `FindAsync` calls** in `AttackHexAsync` into a single `.Where(h => (h.Q == fromQ && h.R == fromR) || (h.Q == toQ && h.R == toR)).ToListAsync()`.
3. **Consider startup migration policy**: for production, consider making migration failures fatal (`throw`) or at least surfacing them through a health-check endpoint that returns degraded status.

---

## 7. Error Handling

### Current State
**Hub layer**: `HubExceptionFilter` provides a global safety net. It catches all unhandled exceptions, logs them with structured context (method name, connection ID), and sends `{ Code: "GENERAL", Message: "An unexpected error occurred." }` to the caller — no stack traces leak.

Within hub methods, errors from services arrive as `(state, error)` tuples or `string? error` returns. The error is passed directly to `SendError`, which means the service-level error message (e.g. `"Only the host can set the map location."`) is sent verbatim to the client. For most game errors this is intentional (user-facing), but there is no distinction between "safe to expose to client" and "internal diagnostic" errors.

**`MapErrorCode`** does string matching on the error text:
```csharp
if (normalized.Contains("room not found")) return "ROOM_NOT_FOUND";
if (normalized.Contains("already")) return "ROOM_ALREADY_JOINED";
```
This is brittle. If a service error message changes slightly (e.g. casing, phrasing), the error code degrades silently to `"GENERAL"`.

**Silent failure in `InitiateFieldBattle`**'s delayed Task:
```csharp
var (state, result, resolveError) = gameService.ResolveFieldBattle(...);
if (resolveError != null || state == null) return; // silent
```
The delayed resolution swallows all errors without logging.

**Null-safety**: Some hub methods assume `state!` is non-null after checking `error == null`, which is correct by contract but fragile if a service is refactored to return `(null, null)`.

### Strengths
- `HubExceptionFilter` guarantees no stack traces reach clients — strong security posture.
- Consistent `(result, error)` tuple pattern across all services is easy to follow.
- `HubErrorDto` with `Code` + `Message` is a well-structured client contract.

### Recommendations
1. **Typed error returns**: replace `string? error` with a `ServiceError` record `(string Code, string Message)`. Services return domain-specific codes (`"ROOM_NOT_FOUND"`, `"NOT_HOST"`, etc.) and hub methods forward the code directly without `MapErrorCode` string matching.
2. **Log the delayed field battle resolution failure** — at minimum add `logger.LogWarning(...)` when `resolveError != null` in the `Task.Run` body.
3. **Guard `state!` dereferences**: add `Debug.Assert(state != null)` or null-check + log when a service returns `(null, null)`.

---

## 8. Cross-cutting Concerns

### Current State
**Logging**: `RoomService`, `TroopRegenerationService`, `RoomPersistenceService`, and `GameHub` have `ILogger` injected and use it. `GameplayService`, `AbilityService`, `LobbyService`, `WinConditionService`, `AllianceConfigService`, `MapAreaService`, `HostControlService`, `GameConfigService` have **zero logging**. Game-significant events (game start, combat resolution, player connecting/disconnecting) are written to the in-memory `EventLog` but not to structured server logs.

**Rate limiting configuration**: The `"auth"` policy in `Program.cs` is configured as:
```csharp
Window = TimeSpan.FromSeconds(1), PermitLimit = 60
```
This is **60 requests per second per IP** — not "10 req/min" as documented in `CLAUDE.md`. This is likely a misconfiguration; for auth endpoints (register, login, password reset) the expected protection is against brute-force, which requires a much lower limit (e.g. 5–10 per minute).

**Authorization**: The hub is `[Authorize]` at class level. All REST endpoints use `.RequireAuthorization()` at group level. The `/health` endpoint is appropriately public. No gaps found.

**Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, and conditional `Strict-Transport-Security` are set in middleware — good.

**`GetRoomByUserId` with no `roomCode`** scans all rooms holding a lock per room — O(n × lock contention) in the reconnect path.

### Strengths
- Security headers are comprehensive.
- `[Authorize]` on hub class level prevents anonymous connections at the hub layer.
- JWT is validated on every request (expiry, issuer, audience, signing key).
- Rate limiting is applied at group level (all `/api/auth/*`).

### Recommendations
1. **Fix the rate limit**: change to `Window = TimeSpan.FromMinutes(1), PermitLimit = 10` for auth endpoints. The current config provides essentially no brute-force protection.
2. **Add structured logging to `GameplayService` and `AbilityService`**: log game-significant events at `Debug` or `Information` level (combat result, ability activated, win condition triggered).
3. **Sync `CLAUDE.md`** rate-limit documentation once the config is corrected.

---

## 9. Game Logic Complexity

### Current State
**`AbilityService`**: Nine abilities for three roles are all implemented in one 1331-line class. Each ability is self-contained with its own lock, validation, and event log entries. The abilities are: `ActivateBeacon`, `DeactivateBeacon`, `ShareBeaconIntel`, `ResolveRaidTarget`, `ActivateCommandoRaid`, `ResolveTacticalStrikeTarget`, `ActivateTacticalStrike`, `ResolveRaidTarget`, `AttemptIntercept`, `InitiateTroopTransfer`, `RespondToTroopTransfer`, `InitiateFieldBattle`, `JoinFieldBattle`, `ResolveFieldBattle`, `ActivateRallyPoint`, `ActivateShieldWall`, `StartFortConstruction`, `CancelFortConstruction`, `ActivateSabotage`, `CancelSabotage`, `StartDemolish`, `CancelDemolish`. The class also contains private helper methods (`ResolveClosestAdjacentHex`, `TryGetCurrentHex`, `IsFriendlyCell`, etc.) that are duplicated from `GameplayService`.

**`WinConditionService`**: Dual API (public instance + internal static `*Core`). The internal static variants exist because `GameplayService` calls them via `GameplayService.ApplyWinConditionAndLog` wrapper which then calls `WinConditionService.ApplyWinConditionAndLogCore`. This creates a chain: `GameplayService.ApplyWinConditionAndLog` → `WinConditionService.ApplyWinConditionAndLogCore`. Two hops for one operation.

**`VisibilityService`**: Well-structured. `ComputeVisibleHexKeys`, `UpdateMemory`, and `BuildStateForViewer` are clearly separated concerns with good doc comments. `ComputeBeaconSectorKeys` is shared between visibility computation and intel sharing.

**`GameplayService.UpdatePlayerLocation`**: 120-line method that handles location update, field-battle cooldown, role-progress updates (fort, sabotage, demolish), shepherd tracking, scout beacon sync, win condition check, and persistence queueing. Difficult to follow the full flow.

### Strengths
- `VisibilityService` is appropriately focused and well-documented.
- `WinConditionService` win-condition logic (`ApplyTerritoryPercentWinCondition`, `ApplyEliminationWinCondition`, `TimedGame`) is clear and correct.
- Combat resolution in `GameplayService` (`CalculateCombatStats`, `ResolveCombat`) is well-encapsulated in private methods.

### Recommendations
1. **Split `AbilityService`** into `CommanderAbilityService` (raid, tactical strike, rally, troop transfer, field battle), `ScoutAbilityService` (beacon, intel, intercept), and `EngineerAbilityService` (fort, sabotage, demolish). Compose them in `GameService`.
2. **Remove `WinConditionService.*Core` static variants** — inject the service into `GameplayService` and call instance methods directly.
3. **Break `UpdatePlayerLocation` into sub-methods**: `UpdateRoleProgressions(state, player, hexKey)`, `UpdateBeaconState(state, player, lat, lng)`, `UpdateShepherdVisits(state, player, lat, lng, now)`. The main method orchestrates and returns the `gridChanged` flag.

---

## 10. Testability

### Current State
The test project (`backend/Landgrab.Tests`) exists and has 295 tests (294 passing, 1 skipped) covering key service scenarios. Services use constructor injection and accept `IGameRoomProvider` for room access — this can be satisfied by constructing a `RoomService` in tests without a full DI container.

**Hardest things to unit test**:
- `TroopRegenerationService`: it is a `BackgroundService` that uses real `PeriodicTimer` and `IServiceScopeFactory`. Testing it requires mocking the scope factory and the timer — cumbersome.
- `Task.Run` fire-and-forget in `InitiateFieldBattle` hub method: the delayed resolution is not awaited and the test has no hook to observe it.
- `QueuePersistence` (`Task.Run` inside service methods): tests cannot easily assert persistence calls were made without intercepting `RoomPersistenceService`.
- `GlobalMapService`: depends on `AppDbContext` which requires a real or in-memory database.
- Services without interfaces: mocking `GameplayService` in an `AbilityService` test requires a real `GameplayService` instance, which requires a real `WinConditionService`, etc. — integration tests only.

### Strengths
- All in-memory services can be instantiated with just a `RoomService` and a `GameStateService` — no web server needed.
- The `(result, error)` tuple pattern makes service output easy to assert without side-effect inspection.
- `CreateScenarioRoom` in `RoomService` (the playtest injection path) is directly usable as a test fixture builder.

### Recommendations
1. **Introduce interfaces** for `IGameplayService`, `IAbilityService`, `ILobbyService` — enables mock-based unit tests for services that depend on them.
2. **Make `QueuePersistence` injectable via a delegate or interface** so tests can assert or suppress persistence calls without standing up a real database.
3. **Extract `IFieldBattleTimer`** interface from the field battle delay logic so tests can inject a fake timer that resolves synchronously.
4. **Test coverage gaps to address**: `VisibilityService.UpdateMemory` with beacon intel sharing, `WinConditionService.TimedGame`, and `HostControlService.TriggerGameEvent`.

---

## Priority Improvement List

| Priority | Issue | Effort |
|---|---|---|
| 1 | **Fix rate limiting** — auth policy is 60/sec, not 10/min; provides no brute-force protection | Low |
| 2 | **Standardize hub error codes** — inconsistent `SendError` calls (some with code, some without); add missing `ValidateEnumString` guards on `SetFieldBattleResolutionMode` and `InitiateTroopTransfer` | Low |
| 3 | **Consolidate `QueuePersistence`** — remove duplicate implementation in `RoomService`; route all calls through `GameStateService` | Low |
| 4 | **Extract `RoomScopedService` base class** — eliminate the 7× repeated four-liner boilerplate across domain services | Med |
| 5 | **Hub room-lookup helper** — reduce the 59 repeated three-line room-guard blocks into a single reusable method | Med |
| 6 | **Replace `MapErrorCode` string-matching** with typed error codes from services — prevents silent code regression when error messages change | Med |
| 7 | **Split `AbilityService`** into three role-specific services — improves SRP and testability; ~400 lines each | Med |
| 8 | **Field battle timer cleanup** — track `CancellationTokenSource` in `ActiveFieldBattle`; cancel on room cleanup; log resolution errors | Med |
| 9 | **Add structured logging to `GameplayService` and `AbilityService`** — zero logging in 1440-line + 1331-line files makes production diagnosis difficult | Med |
| 10 | **Add composite tick operation** in `TroopRegenerationService** — hold a single lock across raid/rally/sabotage/regen tick to prevent interleaved state mutations | High |
