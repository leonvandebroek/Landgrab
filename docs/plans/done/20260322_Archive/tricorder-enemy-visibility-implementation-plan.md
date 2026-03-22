# Tricorder Enemy Visibility — Implementation Plan

## Summary

This plan implements a server-side fog-of-war system for the Alliances game mode. The core change: instead of broadcasting one omniscient `GameState` to all players in a room, the backend will calculate per-viewer visibility, strip/replace hidden hostile data, and send viewer-specific projections via `Clients.Client(connectionId)`. The frontend then renders three visibility tiers (visible, remembered, hidden) using the already-filtered payload. The system introduces a per-player memory store on the backend, a new `VisibilityService`, an extended `HexCell` DTO with visibility fields, and frontend rendering changes across all tile/player/event surfaces.

---

## Phase 0 — Data Model Extensions

Extends the backend and frontend data contracts to support visibility tiers and remembered state. No behavioral changes yet — all new fields default to `visible` / null so existing behavior is preserved.

### Step 0.1 — Add `VisibilityTier` enum and extend `HexCell` (backend)

**Files to modify:**
- [backend/Landgrab.Api/Models/HexCell.cs](backend/Landgrab.Api/Models/HexCell.cs)

**Changes:**
1. Add `VisibilityTier` enum: `Visible`, `Remembered`, `Hidden`
2. Add to `HexCell`:
   - `VisibilityTier VisibilityTier` (default `Visible`)
   - `int? LastKnownTroops` (nullable)
   - `string? LastKnownOwnerId`
   - `string? LastKnownOwnerName`
   - `string? LastKnownOwnerColor`
   - `string? LastKnownOwnerAllianceId`
   - `bool? LastKnownIsFort`
   - `bool? LastKnownIsMasterTile`

**Dependencies:** None — this is the foundation step.

### Step 0.2 — Add `EnemySightingMemorySeconds` to GameDynamics / room settings

**Files to modify:**
- [backend/Landgrab.Api/Models/GameState.cs](backend/Landgrab.Api/Models/GameState.cs) — add `EnemySightingMemorySeconds` (int, default 0) to `GameDynamics`

**Dependencies:** None.

### Step 0.3 — Extend `GameStateCommon.SnapshotState` to clone new fields

**Files to modify:**
- [backend/Landgrab.Api/Services/GameStateCommon.cs](backend/Landgrab.Api/Services/GameStateCommon.cs) — add the new `HexCell` fields to the deep-clone lambda inside `SnapshotState`

**Dependencies:** Step 0.1

### Step 0.4 — Extend the frontend `HexCell` type

**Files to modify:**
- [frontend/landgrab-ui/src/types/game.ts](frontend/landgrab-ui/src/types/game.ts) — add:
  - `visibilityTier?: 'Visible' | 'Remembered' | 'Hidden'`
  - `lastKnownTroops?: number | null`
  - `lastKnownOwnerId?: string | null`
  - `lastKnownOwnerName?: string | null`
  - `lastKnownOwnerColor?: string | null`
  - `lastKnownOwnerAllianceId?: string | null`
  - `lastKnownIsFort?: boolean`
  - `lastKnownIsMasterTile?: boolean`

**Dependencies:** None.

### Step 0.5 — Extend frontend `GameDynamics` type

**Files to modify:**
- [frontend/landgrab-ui/src/types/game.ts](frontend/landgrab-ui/src/types/game.ts) — add `enemySightingMemorySeconds?: number` to `GameDynamics`

**Dependencies:** None.

### Step 0.6 — Add `enemySightingMemorySeconds` to frontend `GameDynamics` defaults

**Files to modify:**
- [frontend/landgrab-ui/src/components/map/HexTile.tsx](frontend/landgrab-ui/src/components/map/HexTile.tsx) — add to `DEFAULT_DYNAMICS`
- [frontend/landgrab-ui/src/components/game/TileInfoCard.tsx](frontend/landgrab-ui/src/components/game/TileInfoCard.tsx) — add to `DEFAULT_DYNAMICS`

**Dependencies:** Step 0.5

---

## Phase 1 — Backend Visibility Engine

Builds the core visibility calculation and per-player memory store. After this phase, the backend can compute what each viewer should see, but doesn't yet use it for broadcasting.

### Step 1.1 — Create `PlayerVisibilityMemory` model

**Files to create:**
- `backend/Landgrab.Api/Models/PlayerVisibilityMemory.cs`

**Contents:**
- `Dictionary<string, RememberedHex> RememberedHexes` — keyed by hex key `"q,r"`, stores last-known state per hex
- `Dictionary<string, PlayerSighting> PlayerSightings` — keyed by player ID, stores last-sighting position + timestamp
- `RememberedHex` record: `OwnerId`, `OwnerName`, `OwnerColor`, `OwnerAllianceId`, `Troops`, `IsFort`, `IsMasterTile`, `SeenAt` (DateTime)
- `PlayerSighting` record: `Lat`, `Lng`, `HexQ`, `HexR`, `SeenAt` (DateTime)

**Dependencies:** None.

### Step 1.2 — Add memory storage to `GameRoom`

**Files to modify:**
- [backend/Landgrab.Api/Models/GameState.cs](backend/Landgrab.Api/Models/GameState.cs) — add `ConcurrentDictionary<string, PlayerVisibilityMemory> VisibilityMemory` to `GameRoom` (keyed by player userId, `[JsonIgnore]` since this is transient in-memory state, like `ConnectionMap`)

**Dependencies:** Step 1.1

### Step 1.3 — Create `VisibilityService`

**Files to create:**
- `backend/Landgrab.Api/Services/VisibilityService.cs`

**Registration:** Singleton (same as other game services).

**Public methods:**

1. `HashSet<string> ComputeVisibleHexKeys(GameState state, string viewerUserId)`
   - Find the viewer's `PlayerDto` and all allied players
   - For each allied player with a current hex position: add all hexes within visibility radius (use `HexService.Spiral` or iterate hexes within N-ring distance). The visibility radius should be a constant (e.g., 3 hexes) — configurable later.
   - For each allied player with `IsBeacon == true` and `BeaconLat/Lng`: compute the beacon hex, add hexes within beacon reveal radius (2 hexes, matching existing adjacency extend logic)
   - Return the union of all visible hex keys

2. `void UpdateMemory(PlayerVisibilityMemory memory, GameState state, HashSet<string> visibleHexKeys, string viewerAllianceId)`
   - For each hex key in `visibleHexKeys`: if the hex is hostile (owner exists and `OwnerAllianceId != viewerAllianceId`), upsert `RememberedHex` with current live data + `SeenAt = UtcNow`
   - For each visible enemy player: upsert `PlayerSighting` with current position + `SeenAt = UtcNow`

3. `GameState BuildStateForViewer(GameState snapshotState, string viewerUserId, PlayerVisibilityMemory memory, HashSet<string> visibleHexKeys, bool isHostObserver, int enemySightingMemorySeconds)`
   - Deep-clone the snapshot (or work on an already-cloned copy)
   - Determine viewer's alliance ID
   - **Grid filtering:** For each hex in the grid:
     - If hex is owned by viewer's alliance or unclaimed: tier = `Visible`, no changes
     - If hex key is in `visibleHexKeys`: tier = `Visible`, keep all live data
     - If hex key has a `RememberedHex` entry in memory: tier = `Remembered`, replace live data with remembered data (set `VisibilityTier`, `LastKnown*` fields, zero out `Troops` to `LastKnownTroops`, blank tactical fields like `SabotagedUntil`, `IsFortified`, `EngineerBuiltAt`)
     - Otherwise: tier = `Hidden`, strip all hostile data (set `OwnerId/Name/Color/AllianceId` to null, `Troops` to 0, all tactical fields blank)
   - **Player filtering:** Filter `Players` list:
     - Allied players: keep full data
     - Hostile players in `visibleHexKeys` (their current hex): keep position data
     - Hostile players with sighting memory within `enemySightingMemorySeconds`: include with stale position from memory, strip tactical fields (cooldowns, ability states)
     - All other hostile players: strip position fields (`CurrentLat/Lng/HexQ/HexR` → null), strip tactical ability state, keep only `Id`, `Name`, `Color`, `Emoji`, `AllianceId/Name/Color`, `IsConnected`, `TerritoryCount`
   - **ActiveRaids filtering:** Only include raids where either the target hex is visible OR the raid's `InitiatorAllianceId` matches viewer
   - **EventLog filtering:** Only include entries where:
     - `AllianceId` matches viewer's alliance, OR
     - The event's `Q,R` hex (if present) is in `visibleHexKeys`, OR
     - The event's `PlayerId` or `TargetPlayerId` is in viewer's alliance, OR
     - The event type is a game-wide type (GameStarted, GameOver, etc.)
   - **ContestedEdges filtering:** Only include edges where at least one hex is visible to the viewer
   - If `isHostObserver`: skip all filtering, return full omniscient state
   - Return the projected state

**Dependencies:** Steps 0.1, 1.1, 1.2

### Step 1.4 — Add visibility-radius constants

**Files to modify:**
- `backend/Landgrab.Api/Services/VisibilityService.cs` (created in 1.3) — define constants:
  - `DefaultVisibilityRadius = 3` (hexes around each player)
  - `BeaconRevealRadius = 2` (matching existing adjacency extend)
  - These radii apply to the viewer's own position and each allied player's position

**Dependencies:** Step 1.3

### Step 1.5 — Unit tests for `VisibilityService`

**Files to create:**
- `backend/Landgrab.Tests/Services/VisibilityServiceTests.cs`

**Test cases:**
- `ComputeVisibleHexKeys` returns hexes within radius of player position
- `ComputeVisibleHexKeys` includes allied player footprints
- `ComputeVisibleHexKeys` includes beacon footprints
- `BuildStateForViewer` marks hostile hex as `Visible` when in range
- `BuildStateForViewer` marks hostile hex as `Remembered` when previously seen
- `BuildStateForViewer` marks hostile hex as `Hidden` when never seen
- `BuildStateForViewer` strips hostile troop counts on hidden hexes
- `BuildStateForViewer` preserves last-known troops on remembered hexes
- `BuildStateForViewer` strips hostile player positions when not visible
- `BuildStateForViewer` preserves sighting memory within configured seconds
- `BuildStateForViewer` returns omniscient state for host observer
- Event log entries from hidden space are stripped
- ActiveRaids in hidden space are stripped
- ContestedEdges in hidden space are stripped

**Dependencies:** Steps 1.3, existing test support (`ServiceTestContext`)

---

## Phase 2 — Backend Broadcast Conversion

Converts the broadcast path from group-send to per-viewer-send. This is the critical behavioral change.

### Step 2.1 — Refactor `GameHub.BroadcastState` to per-viewer projection

**Files to modify:**
- [backend/Landgrab.Api/Hubs/GameHub.cs](backend/Landgrab.Api/Hubs/GameHub.cs)

**Changes:**
1. Inject `VisibilityService` into `GameHub` constructor
2. Modify `BroadcastState(string roomCode, GameState state, string? aliasEvent)`:
   - Get the `GameRoom` to access `ConnectionMap` and `VisibilityMemory`
   - If `state.Phase != GamePhase.Playing` or `state.GameMode != GameMode.Alliances`: keep existing group broadcast (fog-of-war only applies during active Alliances gameplay)
   - Otherwise: iterate `room.ConnectionMap` entries. For each `(connectionId, userId)`:
     - Get or create `PlayerVisibilityMemory` from `room.VisibilityMemory`
     - Compute `visibleHexKeys` via `VisibilityService.ComputeVisibleHexKeys`
     - Call `VisibilityService.UpdateMemory` to refresh the player's memory
     - Determine if this user is host + observer mode
     - Call `VisibilityService.BuildStateForViewer`
     - `ComputeAndAttach` (contested edges) on the viewer-specific state
     - Send via `Clients.Client(connectionId).SendAsync("StateUpdated", viewerState)`
     - If alias event: also send alias event on same connection
     - If GameOver: also send GameOver on same connection
3. Handle `aliasEvent` and `GameOver` per-connection

**Dependencies:** Step 1.3

### Step 2.2 — Refactor `SendStateToCaller` for visibility

**Files to modify:**
- [backend/Landgrab.Api/Hubs/GameHub.cs](backend/Landgrab.Api/Hubs/GameHub.cs)

**Changes:**
- `SendStateToCaller` should also apply per-viewer projection when in active Alliances play
- Look up the caller's userId, get their memory, compute visible hexes, build viewer state

**Dependencies:** Step 2.1

### Step 2.3 — Refactor `PlayersMoved` broadcast for visibility

**Files to modify:**
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs)

**Changes:**
- The `PlayersMoved` event at line ~238 currently sends `result.state!.Players` to the whole group
- Change to per-viewer: for each connection, filter the players list to only include players that the viewer can see (allies + visible hostile players + sighting-memory players)
- Send per-connection via `Clients.Client(connId).SendAsync("PlayersMoved", filteredPlayers)`

**Dependencies:** Step 2.1

### Step 2.4 — Refactor `TroopRegenerationService` broadcast for visibility

**Files to modify:**
- [backend/Landgrab.Api/Services/TroopRegenerationService.cs](backend/Landgrab.Api/Services/TroopRegenerationService.cs)

**Changes:**
- This background service sends `StateUpdated` via `hubContext.Clients.Group(roomCode)` at line ~51
- Change to per-viewer projection: iterate `room.ConnectionMap`, build viewer-specific state for each, send via `hubContext.Clients.Client(connId)`
- Also apply per-viewer filtering to `DrainTick` events (only send if the drained hex is visible to that viewer)
- Extract the per-viewer broadcast logic into a shared helper method (either on `VisibilityService` or a new `VisibilityBroadcastHelper`) to avoid duplication with `GameHub.BroadcastState`

**Dependencies:** Step 2.1

### Step 2.5 — Filter `GameStarted` event for visibility

**Files to modify:**
- [backend/Landgrab.Api/Hubs/GameHub.Host.cs](backend/Landgrab.Api/Hubs/GameHub.Host.cs)

**Changes:**
- Line ~28: `SendAsync("GameStarted", state)` currently goes to group
- At game start, no hostile territory exists yet, so initial state is effectively the same for all viewers. But for correctness and to set up memory stores, send per-viewer.
- Initialize `PlayerVisibilityMemory` entries for all players in the room at game start.

**Dependencies:** Step 2.1

### Step 2.6 — Create broadcast helper to reduce duplication

**Files to create:**
- `backend/Landgrab.Api/Services/VisibilityBroadcastHelper.cs`

**Purpose:** Extract the common per-viewer broadcast iteration (iterate connections, compute visibility, build viewer state, send) into a reusable helper that both `GameHub` and `TroopRegenerationService` can call.

**Signature concept:**
```csharp
Task BroadcastPerViewer(
    GameRoom room,
    GameState snapshotState,
    IHubClients clients,
    VisibilityService visibilityService,
    DerivedMapStateService derivedMapService,
    string? aliasEvent = null)
```

**Dependencies:** Steps 2.1, 2.4

---

## Phase 3 — Frontend Visibility Rendering

Updates all frontend rendering surfaces to consume the visibility tier from the backend payload and render visible/remembered/hidden states distinctly.

### Step 3.1 — Update `normalizeGameState` to handle visibility fields

**Files to modify:**
- [frontend/landgrab-ui/src/utils/gameHelpers.ts](frontend/landgrab-ui/src/utils/gameHelpers.ts)

**Changes:**
- Ensure `visibilityTier` defaults to `'Visible'` if absent (backward compat with old payloads)
- Pass through `lastKnown*` fields

**Dependencies:** Step 0.4

### Step 3.2 — Update `gridDiff.hasHexChanged` to include visibility fields

**Files to modify:**
- [frontend/landgrab-ui/src/utils/gridDiff.ts](frontend/landgrab-ui/src/utils/gridDiff.ts)

**Changes:**
- Add `visibilityTier` and `lastKnownTroops` to the comparison so grid normalization correctly detects visibility changes

**Dependencies:** Step 0.4

### Step 3.3 — Update `tricorderTileState.ts` to consume visibility tiers

**Files to modify:**
- [frontend/landgrab-ui/src/components/map/tricorderTileState.ts](frontend/landgrab-ui/src/components/map/tricorderTileState.ts)

**Changes:**
1. Add to `TricorderTileState` interface:
   - `visibilityTier: 'Visible' | 'Remembered' | 'Hidden'`
   - `isRemembered: boolean`
2. In `deriveTileState`:
   - Read `cell.visibilityTier ?? 'Visible'`
   - Set `isRemembered = visibilityTier === 'Remembered'`
   - For `'Hidden'` hostile tiles: set `baseState = 'neutral'` (treat as unknown), `strengthUnknown = true`, clear all urgency/progress/structure state
   - For `'Remembered'` hostile tiles: keep `baseState = 'enemy'`, set `strengthUnknown = false` but badge should show `lastKnownTroops` with stale styling
3. Update `getStrengthUnknownState`:
   - Return `true` when `visibilityTier === 'Hidden'` and cell is enemy
   - Return `false` when `visibilityTier === 'Remembered'` (we have stale data)
4. Suppress urgency state (`isContested`, `hasActiveRaid`, `rallyObjective`) for `'Hidden'` tiles
5. Suppress progress state for `'Hidden'` and `'Remembered'` tiles

**Dependencies:** Steps 0.4, 0.6

### Step 3.4 — Update `HexTile.tsx` to render visibility tiers

**Files to modify:**
- [frontend/landgrab-ui/src/components/map/HexTile.tsx](frontend/landgrab-ui/src/components/map/HexTile.tsx)

**Changes:**
1. Read `visibilityTier` from the derived tile state
2. For `'Remembered'` tiles:
   - Add CSS class `hex-remembered` to the polygon
   - Use `lastKnownTroops` for the TroopBadge instead of `cell.troops`
   - Pass `isStale={true}` prop to `TroopBadge` (new prop, see Step 3.5)
   - Suppress progress rings, urgency overlays, raid markers
3. For `'Hidden'` tiles:
   - Add CSS class `hex-hidden-hostile` to the polygon
   - Don't render TroopBadge at all
   - Don't render structure glyphs
   - Don't render any tactical overlays
4. For `'Visible'` tiles: no changes (current behavior)

**Dependencies:** Step 3.3

### Step 3.5 — Update `TroopBadge.tsx` for stale display

**Files to modify:**
- [frontend/landgrab-ui/src/components/map/TroopBadge.tsx](frontend/landgrab-ui/src/components/map/TroopBadge.tsx)

**Changes:**
1. Add `isStale?: boolean` prop
2. When `isStale` is true:
   - Add CSS class `stale-badge` to the badge
   - Display the troop count with a `~` prefix or `?` suffix to indicate staleness (e.g., "~15" or "15?")
   - Or: show the count normally but the CSS class applies a muted/desaturated appearance
3. Keep existing `isForestBlind` behavior for completely unknown (`?`) display

**Dependencies:** None

### Step 3.6 — Add CSS for remembered and hidden tile states

**Files to modify:**
- [frontend/landgrab-ui/src/styles/tricorder-map.css](frontend/landgrab-ui/src/styles/tricorder-map.css) or [frontend/landgrab-ui/src/styles/index.css](frontend/landgrab-ui/src/styles/index.css)

**Changes:**
- `.hex-remembered`: reduced opacity (0.5–0.6), desaturated filter, dashed border or subtle overlay indicator
- `.hex-hidden-hostile`: very low opacity or fully transparent for hostile data, just show base hex shape
- `.stale-badge`: desaturated, lower opacity, italic or different font treatment
- Remembered tiles should have a subtle "last known" visual indicator (e.g., faint diagonal hatch pattern via CSS, or a muted color wash)

**Dependencies:** Steps 3.4, 3.5

### Step 3.7 — Update `PlayerLayer.tsx` for visibility-filtered players

**Files to modify:**
- [frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx](frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx)

**Changes:**
- The backend will already filter hostile players out of the `Players` list when they're not visible
- For players included with stale sighting data (from `enemySightingMemorySeconds`): the backend will set position fields but could add a `isStalePosition?: boolean` field to the Player DTO — OR the frontend can detect this from a timestamp
- Render stale-sighting players with a distinct visual: ghosted/translucent marker, dashed border, "last seen" label
- This step may be minimal if the backend fully controls player list filtering

**Dependencies:** Step 0.4, Phase 2 backend changes

### Step 3.8 — Update `TileInfoCard.tsx` for visibility tiers

**Files to modify:**
- [frontend/landgrab-ui/src/components/game/TileInfoCard.tsx](frontend/landgrab-ui/src/components/game/TileInfoCard.tsx)

**Changes:**
1. Read `visibilityTier` from the derived tile state
2. For `'Hidden'` tiles: show "Unknown territory" or similar — no owner, no troops, no tactical info
3. For `'Remembered'` tiles: show last-known owner and troop count with "last known" label, suppress tactical operations (sabotage/demolish/rally countdown), show `?` for live tactical state
4. For `'Visible'` tiles: no changes

**Dependencies:** Step 3.3

### Step 3.9 — Update `HexTooltipOverlay.tsx` for visibility tiers

**Files to modify:**
- [frontend/landgrab-ui/src/components/map/HexTooltipOverlay.tsx](frontend/landgrab-ui/src/components/map/HexTooltipOverlay.tsx)

**Changes:**
1. Read `visibilityTier` from the cell (or derive it)
2. For `'Hidden'` tiles: show only coordinates, no owner/troop/threat info
3. For `'Remembered'` tiles: show last-known data with "last known" label, suppress threat level
4. For `'Visible'` tiles: no changes

**Dependencies:** Step 0.4

### Step 3.10 — Update `GameEventLog.tsx` — no frontend changes needed

The backend will already filter the event log per-viewer. The frontend just renders what it receives. No code changes needed here unless we want to style events from remembered space differently.

**Dependencies:** Phase 2 backend changes

---

## Phase 4 — Room Settings UI

Allows the host to configure `enemySightingMemorySeconds` in the lobby setup wizard.

### Step 4.1 — Add backend endpoints for sighting memory setting

**Files to modify:**
- [backend/Landgrab.Api/Services/GameConfigService.cs](backend/Landgrab.Api/Services/GameConfigService.cs) (or wherever `SetGameDynamics`/`SetBeaconEnabled` lives)

**Changes:**
- Add `SetEnemySightingMemory(string roomCode, string userId, int seconds)` method
- Validate: `seconds >= 0 && seconds <= 300` (0 to 5 minutes max)
- Update `state.Dynamics.EnemySightingMemorySeconds`

**Dependencies:** Step 0.2

### Step 4.2 — Add hub method for sighting memory setting

**Files to modify:**
- [backend/Landgrab.Api/Hubs/GameHub.Host.cs](backend/Landgrab.Api/Hubs/GameHub.Host.cs) or [GameHub.Lobby.cs](backend/Landgrab.Api/Hubs/GameHub.Lobby.cs)

**Changes:**
- Add `SetEnemySightingMemory(int seconds)` hub method
- Validate input, call service, broadcast updated state

**Dependencies:** Step 4.1

### Step 4.3 — Add frontend UI for sighting memory setting

**Files to modify:**
- The lobby setup wizard component (likely under `frontend/landgrab-ui/src/components/lobby/` or the game dynamics configuration panel)

**Changes:**
- Add a toggle/slider for "Enemy Sighting Memory" with options: Off (0), 15s, 30s, 60s, 120s
- Wire to the `SetEnemySightingMemory` hub invoke
- Add i18n keys for the setting name and description

**Dependencies:** Step 4.2

### Step 4.4 — Add i18n keys

**Files to modify:**
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts)

**Changes:**
- Add keys for: sighting memory setting label, description, remembered tile tooltip text, hidden tile tooltip text, stale badge label, etc.

**Dependencies:** None

---

## Phase 5 — Integration Testing & Polish

### Step 5.1 — Integration tests for broadcast path

**Files to create:**
- `backend/Landgrab.Tests/Services/VisibilityBroadcastTests.cs`

**Test scenarios:**
- Two players from different alliances receive different state projections
- Hidden hostile troop counts are absent from viewer payload
- Remembered hex contains last-known data
- Host observer receives full omniscient state
- PlayersMoved event only includes visible players per viewer
- Event log is filtered per viewer

**Dependencies:** Phase 2

### Step 5.2 — Verify `SanitizeGameDynamics` includes new field

**Files to modify:**
- [backend/Landgrab.Api/Hubs/GameHub.cs](backend/Landgrab.Api/Hubs/GameHub.cs) — `SanitizeGameDynamics` method must include `EnemySightingMemorySeconds`

**Dependencies:** Step 0.2

### Step 5.3 — Frontend production build validation

**Verification:**
- `npm run build` from `frontend/landgrab-ui/` must pass with zero TypeScript errors

**Dependencies:** All Phase 3 steps

### Step 5.4 — Backend build validation

**Verification:**
- `dotnet build --configuration Debug` from `backend/Landgrab.Api/` must pass
- `dotnet test` from `backend/Landgrab.Tests/` must pass

**Dependencies:** All Phase 1–2 steps

---

## Edge Cases to Handle

1. **Player joins mid-game:** Their `PlayerVisibilityMemory` starts empty — they see no remembered hexes. Initialize empty memory in `JoinRoom`.

2. **Player reconnects:** Look up existing memory by userId (it persists in `GameRoom.VisibilityMemory`). Send fresh viewer-specific state on reconnect via `SendStateToCaller`.

3. **Alliance changes mid-game:** If alliances could theoretically change during play, remembered hexes from the old alliance should be invalidated (but alliances are fixed after game start, so this is not applicable).

4. **Beacon activation/deactivation:** Visibility footprint changes — the next `BroadcastState` call will compute the new footprint and any newly-visible hostile hexes will update memory.

5. **Host observer toggle:** When toggling observer mode mid-game, the host's next state update should reflect full omniscient state (or filtered state if toggled off).

6. **Lobby phase:** No visibility filtering during lobby phase. Only filter during `GamePhase.Playing` in Alliances mode.

7. **Game over phase:** Continue sending filtered state during game over (players should see the map as they last knew it, not suddenly reveal all).

8. **Empty grid / no map location:** Visibility calculation short-circuits — no hex positions to compute. Return empty visible set.

9. **Memory size growth:** `RememberedHexes` grows over time. In a normal game with ~200 hexes, this is negligible. No pruning needed.

10. **Race conditions on memory updates:** Memory writes happen inside the same `lock (room.SyncRoot)` scope as state mutations, since `BroadcastState` is called after state changes. The `VisibilityMemory` dict is `ConcurrentDictionary` for thread safety during read/write.

11. **`TileLost` event (line 305 of GameHub.Gameplay.cs):** This sends directly to specific connections via `Clients.Client(connId)`. Already per-connection, but should check if the viewer should actually know about this tile loss (only send if the hex is visible to the recipient).

12. **ContestedEdges recomputation:** `DerivedMapStateService.ComputeAndAttach` must now run per-viewer projection, not on the shared state. The broadcast helper should call `ComputeAndAttach` on each viewer's projected state.

---

## Open Questions

1. **Visibility radius value:** The spec doesn't specify exact hex-radius for player visibility. Proposed: 3 hexes (player position ± 3 rings). This is configurable via constant. Should this be a room setting?

2. **Remembered ownership for neutral tiles:** If a hostile tile is captured and then becomes neutral (decayed), and the viewer hasn't seen it since it was hostile — the remembered state will show it as hostile-owned. This is correct per the spec (memory, not truth). Confirm this is desired.

3. **Forward Observer role:** The code-mapping mentions "Forward Observer" alongside Beacon. Currently the codebase only implements Beacon as a reveal mechanic (Scout role). Is Forward Observer a separate planned feature, or is it another name for Scout/Beacon? If the latter, no additional work needed.

4. **Alliance-wide memory sharing:** The spec says remembered data is per-player by default, shared only through explicit intel mechanics. The initial implementation should be per-player only. Alliance-wide sharing is a future feature.

5. **`DynamicsChanged` event:** Line ~201 of GameHub.Host.cs sends dynamics to the group. This is purely config data and doesn't leak hostile intel — no filtering needed. Confirm.

---

## Dependency Graph

```
Phase 0 (Data Models)
  ├── 0.1 HexCell extensions (backend)
  ├── 0.2 GameDynamics enemy sighting setting
  ├── 0.3 SnapshotState clone (depends: 0.1)
  ├── 0.4 HexCell type (frontend)
  ├── 0.5 GameDynamics type (frontend)
  └── 0.6 Default dynamics (depends: 0.5)

Phase 1 (Visibility Engine)
  ├── 1.1 PlayerVisibilityMemory model
  ├── 1.2 GameRoom memory storage (depends: 1.1)
  ├── 1.3 VisibilityService (depends: 0.1, 1.1, 1.2)
  ├── 1.4 Visibility constants (depends: 1.3)
  └── 1.5 Unit tests (depends: 1.3)

Phase 2 (Broadcast Conversion) — depends: Phase 1
  ├── 2.1 GameHub.BroadcastState refactor (depends: 1.3)
  ├── 2.2 SendStateToCaller refactor (depends: 2.1)
  ├── 2.3 PlayersMoved refactor (depends: 2.1)
  ├── 2.4 TroopRegenerationService refactor (depends: 2.1)
  ├── 2.5 GameStarted filter (depends: 2.1)
  └── 2.6 Broadcast helper extraction (depends: 2.1, 2.4)

Phase 3 (Frontend Rendering) — depends: Phase 0 frontend steps
  ├── 3.1 normalizeGameState (depends: 0.4)
  ├── 3.2 gridDiff (depends: 0.4)
  ├── 3.3 tricorderTileState (depends: 0.4, 0.6)
  ├── 3.4 HexTile (depends: 3.3)
  ├── 3.5 TroopBadge stale display
  ├── 3.6 CSS (depends: 3.4, 3.5)
  ├── 3.7 PlayerLayer (depends: 0.4, Phase 2)
  ├── 3.8 TileInfoCard (depends: 3.3)
  ├── 3.9 HexTooltipOverlay (depends: 0.4)
  └── 3.10 GameEventLog (no changes)

Phase 4 (Room Settings) — depends: 0.2
  ├── 4.1 Backend config endpoint
  ├── 4.2 Hub method (depends: 4.1)
  ├── 4.3 Frontend UI (depends: 4.2)
  └── 4.4 i18n keys

Phase 5 (Testing & Polish) — depends: all above
  ├── 5.1 Integration tests
  ├── 5.2 SanitizeGameDynamics
  ├── 5.3 Frontend build validation
  └── 5.4 Backend build validation
```

## Files Summary

### New files
| File | Phase | Purpose |
|------|-------|---------|
| `backend/Landgrab.Api/Models/PlayerVisibilityMemory.cs` | 1.1 | Memory model for per-player remembered state |
| `backend/Landgrab.Api/Services/VisibilityService.cs` | 1.3 | Core visibility computation + state projection |
| `backend/Landgrab.Api/Services/VisibilityBroadcastHelper.cs` | 2.6 | Shared per-viewer broadcast iteration logic |
| `backend/Landgrab.Tests/Services/VisibilityServiceTests.cs` | 1.5 | Unit tests |
| `backend/Landgrab.Tests/Services/VisibilityBroadcastTests.cs` | 5.1 | Integration tests |

### Modified files (backend)
| File | Steps |
|------|-------|
| `Models/HexCell.cs` | 0.1 |
| `Models/GameState.cs` | 0.2, 1.2 |
| `Services/GameStateCommon.cs` | 0.3 |
| `Services/DerivedMapStateService.cs` | (may need per-viewer filtering in 2.6) |
| `Services/GameConfigService.cs` | 4.1 |
| `Services/TroopRegenerationService.cs` | 2.4 |
| `Hubs/GameHub.cs` | 2.1, 2.2, 5.2 |
| `Hubs/GameHub.Gameplay.cs` | 2.3 |
| `Hubs/GameHub.Host.cs` | 2.5, 4.2 |
| `Program.cs` | (register VisibilityService singleton) |

### Modified files (frontend)
| File | Steps |
|------|-------|
| `types/game.ts` | 0.4, 0.5 |
| `utils/gameHelpers.ts` | 3.1 |
| `utils/gridDiff.ts` | 3.2 |
| `components/map/tricorderTileState.ts` | 3.3 |
| `components/map/HexTile.tsx` | 0.6, 3.4 |
| `components/map/TroopBadge.tsx` | 3.5 |
| `components/map/layers/PlayerLayer.tsx` | 3.7 |
| `components/map/HexTooltipOverlay.tsx` | 3.9 |
| `components/game/TileInfoCard.tsx` | 0.6, 3.8 |
| `styles/tricorder-map.css` or `styles/index.css` | 3.6 |
| `i18n/en.ts` | 4.4 |
| `i18n/nl.ts` | 4.4 |
| Lobby wizard component (TBD) | 4.3 |
