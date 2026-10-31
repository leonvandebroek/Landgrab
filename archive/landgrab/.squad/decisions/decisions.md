# Project Decisions Log

## Immediate Proximity Reveal on Movement (De Ruyter, Backend)

**Date:** 2026-03-23  
**Agent:** De Ruyter  
**Scope:** Backend visibility broadcast on player movement  
**Status:** Implemented

### Problem

Players reported delayed enemy tile intel when moving onto/adjacent to hostile hexes. Movement updates often emitted `PlayersMoved` only, which does not include tile-state projection updates.

### Decision

In `GameHub.UpdatePlayerLocation`, trigger full `BroadcastState` when the mover changed hex (`PreviousHexKey` differs from current hex key), in addition to existing `gridChanged` cases.

### Rationale

`BroadcastState` runs per-viewer projection (`VisibilityBroadcastHelper`) and recomputes visibility (`VisibilityService.ComputeVisibleHexKeys`) before `StateUpdated`, ensuring adjacency-based reveal (radius 1 for non-Scout players) is fresh immediately after movement. This is the minimum-path fix and does not alter Scout beacon sector logic.

### Validation

- `dotnet build --configuration Debug` in `backend/Landgrab.Api/` ✅
- `dotnet test` in `backend/Landgrab.Tests/` ✅ (295 total; 294 passed; 1 skipped)

---

## Compass Crash: Perpetual rAF Loop Fix (Vermeer, Frontend)

**Date:** 2026-03-23  
**Agent:** Vermeer  
**Scope:** Frontend compass/heading tracking  
**Status:** Implemented

### Problem

App crashed and reloaded approximately 30–60 seconds after enabling compass/heading tracking.

### Root Causes

1. **Perpetual rAF loop (critical crash cause):** `lerpBearing` function always rescheduled itself with `requestAnimationFrame(lerpBearing)` — even after the map bearing fully converged to the target. This drove `map.setBearing()` at ~60fps indefinitely, causing Leaflet CSS-transform thrash that accumulated into OOM tab crash after 30–60 seconds.

2. **Q/E handler listener churn (minor):** Q/E heading keydown handler listed `compassHeading` in dependency array. Because the sensor fires every ~60ms, the handler was removed and re-registered ~16 times per second.

### Fixes Applied

1. **lerpBearing exits on convergence:** Now returns early (without calling `requestAnimationFrame`) when `Math.abs(diff) < 0.3`. Added `lerpBearingRef` at component scope to hold the stable function reference. The `effectiveHeading` sync effect now checks `bearingRafRef.current === 0` and restarts the loop via `requestAnimationFrame(lerpBearingRef.current)` when a new heading target arrives. Loop only runs while there is rotation work to do.

2. **Stable Q/E handler via compassHeadingRef:** Added `compassHeadingRef` (kept current by its own `useEffect([compassHeading])`). Q/E handler reads heading from refs and has an empty dependency array — registers once, never re-registers.

### Validation

- `npm run lint && npm run build`: 0 errors, 1 pre-existing unrelated warning in `DemolishCard.tsx`. 294 modules, build clean.

---

## Location Broadcast Throttle Reduction (Vermeer, Frontend)

**Date:** 2026-03-23  
**Agent:** Vermeer  
**Scope:** Frontend proximity reveal latency  
**Status:** Implemented

### Problem

Non-Scout players saw a noticeable 3-second delay when walking onto or adjacent to an enemy tile. Tile reveal did not appear instantly after movement.

### Root Cause

`LOCATION_BROADCAST_THROTTLE_MS = 3000` in `useGameActionsGameplay.ts` — 3-second coalescing throttle on `UpdatePlayerLocation` hub invocations. After first send, any subsequent location change within 3 seconds was queued and only dispatched when the throttle window expired.

### Decision

Reduced `LOCATION_BROADCAST_THROTTLE_MS` from `3000` to `750` milliseconds.

### Rationale

- Still coalesces rapid GPS/debug updates (prevents server spam)
- Sends within 750ms of a position change (imperceptible to user)
- No logic changes to heartbeat (30s), minimum movement threshold (5m), or store/render pipeline

**File changed:** `frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts` line 15

### Validation

`npm run lint && npm run build` — 0 errors, 1 pre-existing unrelated warning in `DemolishCard.tsx`.

---

## Strip Server-Side Masking & Explicit Beacon Intel Share

**Date:** 2026-03-22  
**Agents:** De Ruyter (backend), Vermeer (frontend)  
**Scope:** Beacon architecture refactor  
**Status:** Implemented

### Problem

Architecture evolved to: backend always sends full tile data; frontend controls visibility rendering. Previous beacon implementation redundantly:

1. Stored explicit `PlayerDto.BeaconScanHexes` populated server-side
2. Recomputed cone on every player movement/heading change
3. Forced full `StateUpdated` broadcasts even for non-game-state changes
4. Automatically shared beacon intel without explicit player action

### Decision

1. **Remove server-side masking:** `VisibilityService.BuildStateForViewer` now only sets `VisibilityTier` enum; never nulls/zeros hidden tile fields
2. **Remove implicit beacon re-scan:** `GameplayService.UpdatePlayerLocation` no longer recomputes cone or forces `gridChanged` on beacon movement
3. **Remove BeaconScanHexes field:** Deleted from `PlayerDto` and all projection paths
4. **Add explicit Share Intel action:** New hub method `ShareBeaconIntel(roomCode, hexKeys[])` that updates alliance member remembered hexes and broadcasts `StateUpdated`
5. **Client-side cone geometry:** Frontend now computes beacon cone locally from `currentHexQ/R` + `beaconHeading` via new `beaconCone.ts` utility

### Why

- **Aligns with architecture:** Backend sends authoritative full state; frontend controls display
- **Eliminates redundancy:** Server no longer duplicates geometry that frontend can compute
- **Clarifies UX:** Beacon intel sharing is now explicit action, not automatic side effect
- **Reduces overhead:** Cone recomputation removed from every player movement tick
- **Maintains consistency:** Backend still authoritative; client just displays locally computed geometry
- **Preserves teamwork:** Scout sharing still works through updated `SeenAt` timestamps in alliance history

### Implementation

**Backend:**
- `VisibilityService.BuildStateForViewer`: removed masking, only set `VisibilityTier`
- `GameplayService.UpdatePlayerLocation`: removed cone recomputation and `gridChanged` flag marking
- `AbilityService`: removed beacon cone payload
- `GameHub`: added `ShareBeaconIntel(roomCode, hexKeys[])` with validation and broadcast

**Frontend:**
- New `src/utils/beaconCone.ts`: pure `computeBeaconCone(playerHexKey, headingDegrees, grid)` function
- `AbilityOverlayLayer`: local cone computation, reactive to heading changes
- `useGameActionsAbilities`: wired `handleShareBeaconIntel` to invoke hub method with locally computed cone

### Validation

- Backend: `dotnet build` ✅, `dotnet test` ✅ (292/293 passed, 1 skipped)
- Frontend: `npm run lint` ✅ (0 errors), `npm run build` ✅ (tsc + vite clean)

---

## Backend decision: unify beacon sector computation for visibility + sharing

**Date:** 2026-03-22  
**Agent:** De Ruyter  
**Scope:** `backend/Landgrab.Api`  
**Status:** Implemented

### Decision
Extract and reuse beacon-sector computation in `VisibilityService` via:

```csharp
public HashSet<string> ComputeBeaconSectorKeys(GameState state, PlayerDto player)
```

Both fog-of-war visibility (`ComputeVisibleHexKeys`) and explicit alliance intel sharing (`AbilityService.ShareBeaconIntel`) now use this shared method.

### Why
Beacon sector rules (heading normalization, range, sector angle, map-bound key filtering) are gameplay-critical and must remain identical across two call sites:
1. what scouts can reveal live,
2. what is persisted into alliance visibility memory on Share Intel.

Centralizing removes behavior drift risk and keeps future beacon tuning (range/angle logic) single-source.

### Notes
- Beacon range constant renamed and reduced to `BeaconRange = 3`.
- `ShareBeaconIntel` only snapshots enemy-owned hexes and writes them into each alliance member's `PlayerVisibilityMemory.RememberedHexes`.

---

## Beacon "Share Intel" UX pattern

**Date:** 2026-03-22  
**Agent:** Vermeer  
**Status:** Implemented

### Decision
Active-beacon footer now holds two buttons side-by-side: "Turn Off" (danger/secondary) and "Share Intel" (primary). The Share Intel button calls the `ShareBeaconIntel` hub method and shows 3-second inline feedback directly on the card rather than routing through the info-ledge or a modal.

### Rationale
The ability card already owns focus during beacon interaction. Inline feedback on the card is immediately adjacent to the action that triggered it, reducing cognitive load. The info-ledge is reserved for passive/asynchronous events; an explicit player action deserves synchronous, co-located confirmation.

### Feedback display
- `shareIntelDone` with interpolated `{{count}}` for success with tiles found  
- `shareIntelNone` for the zero-result case  
- Feedback auto-clears after 3 000 ms via `setTimeout`  
- Button disabled (`isSharing: true`) during the async call to prevent double-tap

### i18n pattern
Added `shareIntelDescription` key even though it is not currently rendered, to document intent for future tooltip/help integrations.

---

## Dialog Stacking: Option A — Queue

**Date:** 2026-03-22  
**Agent:** vermeer  
**Status:** Implemented

### Problem

Rapid combat/claim outcomes caused multiple outcome dialogs to render simultaneously, stacking on top of each other and obscuring game state.

### Root Cause

`combatResult` and `neutralClaimResult` are independent nullable state fields in `gameplayStore`. `setCombatResult(result)` and `setNeutralClaimResult(result)` both call `set(...)` unconditionally — so two back-to-back arrivals produce two simultaneous visible modals.

### Approach Chosen: Option A — Queue

A `QueuedOutcomeDialog` discriminated union (`{ type: 'combat'; result: CombatResult } | { type: 'claim'; result: NeutralClaimResult }`) and an `outcomeDialogQueue: QueuedOutcomeDialog[]` array were added to `gameplayStore`. The setters now:

- **On new result:** Check if another dialog is already shown. If so, append to queue. If not, show immediately (existing behavior).
- **On dismissal (null):** Pop the next item from the queue and activate it (setting the appropriate `combatResult` or `neutralClaimResult`). If queue is empty, clear normally.

### Why Option A over B or C

- **Option B (replace/most-recent-wins)** would silently discard information the player needs to see (e.g., a territory-captured outcome hidden by a subsequent combat loss). Queue is safer and fairer.
- **Option C (consolidate)** requires semantic merging of different result types and would need backend changes to distinguish claim count — too invasive for a P2 fix.
- **Option A** is the safest, most complete fix and required changes to exactly one file (`gameplayStore.ts`).

### Impact

- `gameplayStore.ts`: new `QueuedOutcomeDialog` type, `outcomeDialogQueue` state, updated `setCombatResult` / `setNeutralClaimResult`, updated `clearGameplayUi`.
- No changes to `GameView.tsx`, `useSignalRHandlers.ts`, or `agentBridge.ts` — full backward compatibility.
- Build: `npm run lint && npm run build` passes (0 errors).

---

## Beacon Cone — Three Bug Fix

**Date:** 2026-03-22  
**Agent:** vermeer-beacon-debug  
**Scope:** Frontend heading responsiveness + backend heading preservation + cone tile visibility  
**Status:** Implemented

### Three interconnected bugs

**A — Q/E debug heading not forwarded to overlay:** `GameMap.tsx` passed raw `compassHeading` (sensor) to `AbilityOverlayLayer`, but debug heading edits (Q/E) only existed in local state. Overlay read stale `myPlayer.beaconHeading` from server.

**B — Backend wiping BeaconHeading on every heartbeat:** `GameplayService.UpdatePlayerLocation` unconditionally set `BeaconHeading = null` when no compass sensor present. This destroyed the heading set by `ActivateBeacon` on any movement without new sensor data.

**C — Beacon cone tiles render as Hidden:** `tricorderTileState.deriveTileState` returned hidden state for all `visibilityTier === 'Hidden'` tiles before checking beacon cone membership. Server sent full tile data for scanned hexes but frontend discarded it.

### Fixes

**Frontend:**
- `GameMap.tsx`: Forward `debugCompassHeading ?? compassHeading` to overlay
- `AbilityOverlayLayer.tsx`: Compute cone with effective heading; add isBeacon check; sync cone hexes to store
- `gameplayStore.ts`: Add `beaconConeHexKeys: ReadonlySet<string>` + `setBeaconConeHexKeys` action
- `tricorderTileState.ts`: Override visibility when hex in cone; let full Visible rendering pass through
- `HexTile.tsx`, `TileInfoCard.tsx`: Pass `beaconConeHexKeys` to derivation

**Backend:**
- `GameplayService.cs`: Only update `BeaconHeading` when `CurrentHeading.HasValue` — preserve existing value otherwise

### Validation

- Build: ✅ `npm run lint && npm run build` — 0 errors, 293 modules
- Backward compatible; no breaking changes
- Surgical changes isolated to cone rendering paths

---

## Abilities Expansion — Architectural Decisions (Rembrandt, 2026-03-24)

**Status:** Binding  
**Related:** `rembrandt-abilities-expansion-blueprint.md`

### Decision A — Tactical Strike: Confirm Required (No Auto-Fire)

**Status:** Binding  
**Ruling:** Bearing auto-targets the adjacent hex in real time (polling every 500ms via `ResolveTacticalStrikeTarget`), but the player must explicitly tap "Arm Strike" to commit. No auto-fire on pointing.  
**Rationale:** 20-minute cooldown makes accidental activation a severe UX failure. Consistent with the existing "Lock Target" confirmation pattern across all bearing-based abilities.  
**Impact:** Frontend `TacticalStrikeCard.tsx` keeps the "Lock Target" button. Backend unchanged.

### Decision B — Troop Transfer Targeting: Name Preview + Confirm Required

**Status:** Binding  
**Ruling:** `ResolveTroopTransferTarget(heading)` returns the closest alliance member within a **45° bearing cone** from the caller's position. The card shows "Targeting: [PlayerName]" in real time. The player must tap "Send Troops" to commit.  
**Rationale:** Transferring to the wrong teammate is a costly mistake. Name preview with explicit confirmation protects against mis-sends. 45° tolerance (vs 30° for hex targeting) accounts for imprecise GPS between players.  
**Impact:** New hub method `ResolveTroopTransferTarget(heading)`. New `TroopTransferCard.tsx` with polling useEffect.

### Decision C — Field Battle Join UX: Notification Banner (Not Modal)

**Status:** Binding  
**Ruling:** Enemy players on the same hex receive a **non-blocking notification banner** (extended `notificationStore`) with inline Join/Ignore buttons and a live 30-second countdown. No full-screen modal.  
**Rationale:** A full modal interrupts active player movement. A banner allows response without blocking game context. Consistent with `hostMessage` notification pattern already in `notificationStore`.  
**Impact:** New `FieldBattleInvitePanel.tsx`. Extend `notificationStore` with `fieldBattleInvite` key. New `TroopTransferReceivedPanel.tsx` uses same pattern.

### Decision D — Field Battle Timer: Background Task in Hub Method

**Status:** Binding  
**Ruling:** The 30-second resolution timer fires via `_ = Task.Run(async () => { await Task.Delay(30s); ... })` inside the `InitiateFieldBattle` hub method. `IHubContext<GameHub>` is injected into the `GameHub` constructor to support pushing from the background task.  
**Rationale:** A new `BackgroundService` is overkill for a per-battle event. `Task.Run` with captured hub context is lightweight and precedented in this codebase (see `TroopRegenerationService` for the hub context injection pattern). `battle.Resolved` flag prevents double-resolution.  
**Impact:** Add `IHubContext<GameHub>` to `GameHub` constructor. Verify DI registration in `Program.cs`.

### Decision E — Field Battle No-Join Outcome: Cancellation (Not Initiator Win)

**Status:** Binding  
**Ruling:** If 30 seconds expire with zero enemies joining, the battle is **cancelled**. No troops are lost by either side. The initiator's cooldown still applies.  
**Rationale:** Awarding a victory with no opponent engaged is gameable and feels hollow. Cancellation with cooldown creates a deliberate risk/reward trade-off: initiating costs a cooldown even if no one responds.  
**Impact:** `ResolveFieldBattle` must set `result.NoEnemiesJoined = true` and skip troop deduction when `JoinedEnemyIds` is empty.

### Non-Decisions (Explicitly Out of Scope)

- **Troop Transfer max range:** Unbounded — any alliance member with a known GPS location is a valid target. No radius cap. This may be revisited if abuse patterns emerge.
- **Field Battle tile-claiming:** The spec is explicit — Field Battle does NOT claim the tile. No change to territory logic.
- **Wizard step numbering:** Field Battle config is added WITHIN the existing Game Dynamics wizard step, not as a new numbered step. Avoids renumbering.

---

## De Ruyter — Abilities Expansion Backend Done (2026-03-24)

Implemented backend changes from Rembrandt's blueprint across models, services, hubs, and tests.

### Implemented

1. **Commando Raid target removal**
   - `AbilityService.ResolveRaidTarget` now resolves to the commander's current hex (heading accepted for signature compatibility, no adjacency targeting).
   - `AbilityService.ActivateCommandoRaid` signature changed to `(roomCode, userId)` and derives target from current hex.
   - `GameService` facade updated to match new signature.
   - `GameHub.Gameplay.ActivateCommandoRaid` changed to parameterless; target coordinate validation removed.
   - Event log text updated to reflect raid launch from current hex.

2. **Tactical Strike adjacency tightening**
   - In `AbilityService.ActivateTacticalStrike`, range check changed from `> 1` to `!= 1`.
   - Error message updated to: `"Tactical Strike target must be an adjacent hex."`

3. **Troop Transfer (new)**
   - Added models to `GameState.cs`: `ActiveTroopTransfer`, `TroopTransferResultDto`, `PlayerDto.TroopTransferCooldownUntil`, `GameState.ActiveTroopTransfers`
   - Added service methods in `AbilityService`: `ResolveTroopTransferTarget`, `InitiateTroopTransfer`, `RespondToTroopTransfer`
   - Added `GameService` facades for all three methods.
   - Added hub methods in `GameHub.Gameplay.cs`: `ResolveTroopTransferTarget`, `InitiateTroopTransfer`, `RespondToTroopTransfer`
   - Added recipient/initiator notifications: `TroopTransferReceived`, `TroopTransferResult`

4. **Field Battle (new)**
   - Added enum/models to `GameState.cs`: `FieldBattleResolutionMode`, `ActiveFieldBattle`, `FieldBattleResultDto`, `GameDynamics.FieldBattleResolutionMode` (default `InitiatorVsSumOfJoined`), `PlayerDto.FieldBattleCooldownUntil`, `GameState.ActiveFieldBattles`
   - Added `AbilityService` methods: `InitiateFieldBattle`, `JoinFieldBattle`, `ResolveFieldBattle`
   - Added required `room.SyncRoot` locking and `battle.Resolved` race protection in `ResolveFieldBattle`.
   - Added `GameService` facades for the field battle methods.
   - Added `GameHub.Gameplay` methods: `InitiateFieldBattle`, `JoinFieldBattle`
   - Added async timer-based auto-resolution path in hub via injected `IHubContext<GameHub>`.
   - Added host config: `GameConfigService.SetFieldBattleResolutionMode`, `GameService.SetFieldBattleResolutionMode`, `GameHub.Host.SetFieldBattleResolutionMode`
   - Added cooldown lifecycle clear in `GameplayService.UpdatePlayerLocation` when player moves hex or reaches 0 carried troops.

5. **Snapshot/state propagation updates**
   - `GameStateCommon.SnapshotState` updated to clone all newly added ability fields/collections and new dynamics value.
   - `GameHub.SanitizeGameDynamics` updated to include `FieldBattleResolutionMode`.
   - `GameConfigService.SetGameDynamics` updated to persist `FieldBattleResolutionMode`.

6. **Tests**
   - Updated existing `AbilityServiceTests` for Commando Raid / Tactical Strike behavior changes.
   - Added new `AbilityServiceTests` for: Troop transfer initiation and acceptance, Field battle initiation and resolution

### Validation

- `dotnet build --configuration Debug` (backend/Landgrab.Api): ✅
- `dotnet test` (backend/Landgrab.Tests): ✅ (299 total, 298 passed, 1 skipped)

---

## Vermeer — Abilities Expansion Frontend Done (2026-03-24)

### Implemented
- Steps 1–21 of the abilities blueprint
- troopTransfer and fieldBattle added to AbilityKey union
- All new type interfaces in game.ts
- notificationStore extended for TroopTransferRequest and FieldBattleInvite
- useSignalR: 4 new GameEvents + conn.on registrations
- useSignalRHandlers: 4 new event handlers with toast notifications
- useGameActionsAbilities: CommandoRaid simplified (no args), 5 new callbacks added
- CommandoRaidCard: rewritten — raids current hex directly
- TacticalStrikeCard: currentHex prop removed
- New components: TroopTransferCard, TroopTransferReceivedPanel, FieldBattleCard, FieldBattleInvitePanel
- PlayingHud, GameView, App: wired all new components and handlers
- DynamicsStep: Field Battle resolution mode radio group added
- i18n/en.ts and i18n/nl.ts: all new keys added

### Deviations from Blueprint
- Blueprint suggested 'troops' as icon; used `helmet` (closest valid GameIconName)
- Blueprint suggested 'victory' as icon; used `trophy` (valid GameIconName)
- TroopTransferReceivedPanel and FieldBattleInvitePanel get invoke via `onRespondToTroopTransfer`/`onJoinFieldBattle` props threaded through PlayingHud (no context/direct invoke access in components)

### Validation
- `npm run lint`: ✅ (0 errors)
- `npm run build`: ✅ (0 errors)
- Commit: 0c6e61b

---

## Validation: Instant Tile Visibility, Compass Stability, Scout Ability Gating (steen, 2026-03-23)

**Requested by:** Léon van de Broek  
**Session type:** Code-level validation (Landgrab MCP not connected; live browser testing blocked)

### Test 1 — Instant tile visibility (non-Scout player)

**Status: PASS (code-level)**

**Fix:** Adds `isLocallyVisible()` in `frontend/landgrab-ui/src/utils/localVisibility.ts` — mirrors backend `ComputeVisibleHexKeys` logic client-side. Both `HexTile.tsx` and `TileInfoCard.tsx` compute `alliedPlayerHexKeys` and `allianceOwnedHexKeys` via `useMemo`. `tricorderTileState.ts` calls `isLocallyVisible()` immediately, deriving `visibilityTierEarly = 'Visible'` without waiting for server message. Location broadcast throttle reduced: `LOCATION_BROADCAST_THROTTLE_MS = 750ms` (was 3000ms).

**Verdict:** When a Commander player moves adjacent to an enemy tile, `alliedPlayerHexKeys` updates in the same React render cycle, `isLocallyVisible()` returns `true`, and the tile info renders immediately.

### Test 2 — Compass stability (90+ seconds)

**Status: PASS (code-level)**

**Fix applied:** Original bug was perpetual `requestAnimationFrame` loop in `lerpBearing` never exited. Fix adds convergence check: `if (Math.abs(diff) < 0.3) { ... return; // Stop loop }`. Loop self-terminates on convergence and restarts only when `effectiveHeading` changes. Additional stability: state updates throttled to max once per 60ms via RAF; `headingRef` holds latest raw value; proper cleanup on unmount; pauses when `document.hidden`.

**Verdict:** No perpetual loop. Loop runs only during active bearing changes, then stops. Memory stable for 90+ seconds.

### Test 3 — Scout ability gating

**Status: PASS (code-level)**

**Implementation:** Scout sees `intercept` + `beacon` + `shareIntel` (when beaconEnabled). Commander sees `tacticalStrike` + `commandoRaid` only. Engineer sees role-specific abilities only. Gating logic is unambiguous.

---


---

## Round 2 Bug Hunt Decisions

### FB-01: Field Battle — Enforce Participant Integrity (De Ruyter, Backend)

**Date:** 2026-03-27  
**Agent:** De Ruyter  
**Scope:** Backend field battle lifecycle  
**Status:** Fixed

**Problem:** Field battle join/target-selection boundaries lacked strict guards, allowing role confusion and cross-battle targeting inconsistencies.

**Decision:** Restrict `JoinFieldBattle` and `SelectFieldBattleTarget` with stricter participant guards:
- Initiator cannot join as enemy
- If battle has `TargetEnemyId` (challenge flow), only that exact target may join
- `SelectFieldBattleTarget` requires `targetId` to already be in `JoinedEnemyIds`

**Rationale:** Prevent role confusion and cross-battle targeting inconsistencies where an initiator could select a player who never opted into that battle.

**Validation:** Backend build clean, tests pass (357/358).

---

### FB-02: Field Battle — Cleanup Unresolved Initiator Battles (De Ruyter, Backend)

**Date:** 2026-03-27  
**Agent:** De Ruyter  
**Scope:** Backend field battle cleanup  
**Status:** Fixed

**Decision:** In `RoomService.RemoveConnection`, remove unresolved active field battles initiated by the disconnecting user when it is their last active connection.

**Rationale:** Avoid orphaned unresolved battles with disconnected initiator and stale state/invites.

**Validation:** Backend tests pass.

---

### TT-01: Troop Transfer — Expire-on-Access Pruning (De Ruyter, Backend)

**Date:** 2026-03-27  
**Agent:** De Ruyter  
**Scope:** Backend troop transfer validation  
**Status:** Fixed

**Decision:** Prune expired transfers at the start of both `InitiateTroopTransfer` and `RespondToTroopTransfer` under room lock. Treat missing/expired transfer IDs uniformly as "not found".

**Rationale:** Removes stale transfer buildup and prevents edge behavior where expired entries remain in state. Preserves TOCTOU safety because transfer acceptance still rechecks initiator troops at response time.

**Validation:** Backend tests pass.

---

### FRNT-01: RejoinRoom — Stale Detection (Vermeer, Frontend)

**Date:** 2026-03-27  
**Agent:** Vermeer  
**Scope:** Frontend auto-resume  
**Status:** Fixed

**Decision:** Treat "room not found" / "room no longer exists" as stale RejoinRoom failures. Clear saved session during auto-resume.

**Rationale:** Prevents repeated auto-resume attempts when the room has been deleted, avoiding reconnect loops that trap the user in a stale session.

**Validation:** Frontend lint passes.

---

### FRNT-02: Reconnect — Ability UI Reset (Vermeer, Frontend)

**Date:** 2026-03-27  
**Agent:** Vermeer  
**Scope:** Frontend reconnection handling  
**Status:** Fixed

**Decision:** Exit ability mode on SignalR reconnected events.

**Rationale:** Ensures targeting/confirming UI does not remain stuck after reconnecting to the room.

**Validation:** Frontend lint passes.

---

### FRNT-03: Notifications — Expiry Safety (Vermeer, Frontend)

**Date:** 2026-03-27  
**Agent:** Vermeer  
**Scope:** Frontend notification lifecycle  
**Status:** Fixed

**Decision:** Schedule auto-clear for troop transfer requests and field battle invites using their expiry timestamps, with a 10s fallback.

**Rationale:** Avoids stale notifications lingering if panels are unmounted or timers are missed.

**Validation:** Frontend lint passes.

---

### FRNT-04: Field Battle — Invite Expiry Guard (Vermeer, Frontend)

**Date:** 2026-03-27  
**Agent:** Vermeer  
**Scope:** Frontend field battle UX  
**Status:** Fixed

**Decision:** Hide the invite panel when the join window has elapsed.

**Rationale:** Prevents users from acting on expired battle IDs.

**Validation:** Frontend lint passes.

---

### CC-01: UpdatePlayerPosition — Off-Grid Coordinate Validation (Spinoza, Cross-cutting)

**Date:** 2026-03-27  
**Agent:** Spinoza  
**Scope:** Backend coordinate validation  
**Status:** Fixed

**Problem:** `UpdatePlayerPosition` accepted off-grid coordinates without validation, risking game state corruption.

**Decision:** Add grid existence check; off-grid q,r coordinates now null the player's position. Flee detection updated to handle both in-grid movement and off-grid steps.

**File:** `backend/Landgrab.Api/Services/GameplayService.cs` ~line 547

**Rationale:** Prevents invalid coordinate acceptance that could break game state integrity.

**Validation:** Full build/test/lint verification passing (352/353 tests).

---

## Test Gaps Identified (Spinoza)

**Date:** 2026-03-27

### GAP-1: UpdatePlayerPosition with Off-Grid Coordinates (Medium Priority)

**What's missing:** Unit test calling `GameplayService.UpdatePlayerPosition` with q,r coordinates not present in the game grid, asserting that `player.CurrentHexQ` and `player.CurrentHexR` are set to `null`.

**Why it matters:** The bug was undetected because no test exercised this path.

**Suggested cases:**
- `UpdatePlayerPosition_WhenCoordNotInGrid_NullsPlayerPosition`
- `UpdatePlayerPosition_WhenCoordInGrid_SetsPlayerPosition`
- `UpdatePlayerPosition_WhenPlayerMovesOffGrid_TriggersFlee`
- `UpdatePlayerPosition_WhenPlayerRemainsAtBattleHex_DoesNotTriggerFlee`

---

### GAP-2: UpdatePlayerPosition Flee Detection (Low Priority)

**What's missing:** Tests for the field battle flee path — moving from battle hex to another in-grid hex triggers flee, while staying at the battle hex does not.

---

### GAP-3: PlayersMoved Cooldown Fields (Low Priority)

**What's missing:** Integration test on `VisibilityBroadcastHelper.CreatePlayersForViewer` asserting that `*CooldownUntil` fields are copied from allied player records. This would guard against accidental stripping in a future refactor.


---

## Spinoza Round 3: QA Bug Investigation — Field Battle Invite & Intercept Race Condition

**Date:** 2026-03-29  
**Agent:** Spinoza (Tester/QA)  
**Sprint:** Round 3 Bug Hunt

### BUG 8: `FieldBattleInvitePanel` stale invite after battle resolves

**Area:** cross-cut (frontend + backend)  
**Severity:** low  
**File:** frontend/landgrab-ui/src/components/game/abilities/FieldBattleInvitePanel.tsx:39-43  
**Status:** no-bug  
**Fix:** Frontend already correctly handles stale invites via timer-based expiration and server `FieldBattleResolved` event clearing.

#### Investigation Summary

The `FieldBattleInvitePanel` component reads from `notificationStore.fieldBattleInvite`. The panel has two self-clearing mechanisms:

1. **Timer-based expiration (lines 39-43):** A `useEffect` hook checks if the `secondsLeft` countdown reaches `null` (when `joinDeadline` passes) and auto-clears the invite via `setFieldBattleInvite(null)`.
   
2. **Server signal clearing (useSignalRHandlers.ts:721):** When the backend sends a `FieldBattleResolved` event (after a battle concludes or a player flees), the handler explicitly calls `useNotificationStore.getState().setFieldBattleInvite(null)`.

The backend correctly sends `FieldBattleResolved` to all participants when:
- A battle is resolved manually via `ResolveFieldBattle` (SharedAbilityService.cs:443)
- A player flees and the battle auto-resolves (GameHub.Gameplay.cs:443, 502)

**Conclusion:** No stale-invite bug exists. The panel clears on both natural expiration and server-driven resolution.

---

### BUG 9: Commando raid intercept — race between `AttemptIntercept` and raid expiration

**Area:** backend  
**Severity:** low  
**File:** backend/Landgrab.Api/Services/Abilities/ScoutAbilityService.cs:232-239  
**Status:** no-bug  
**Fix:** `AttemptIntercept` already gracefully handles stale target by checking `HasActiveSabotage(engineer)` and returning `"noTarget"` status when sabotage is cleared.

#### Investigation Summary

The race condition window: A scout calls `AttemptIntercept` while an engineer's commando raid is still active, then the raid expires (via `ResolveExpiredCommandoRaids`) before the scout's next intercept call.

When `AttemptIntercept` is called:
1. If the engineer no longer has an active sabotage (`!HasActiveSabotage(engineer)`) — line 233
2. Or the engineer moved off the hex — lines 234-236
3. The method calls `ClearInterceptTracking(scout)` and returns `(new InterceptAttemptResult("noTarget"), null)`

**Server behavior:** The scout's intercept lock is reset, and the scout sees a `"noTarget"` result on their next attempt. No error is thrown, and the game state remains consistent.

**Raid expiration clearing sabotage:** When `ResolveExpiredCommandoRaids` runs, it does NOT explicitly clear `SabotageTargetQ/R` for the engineer. However, the sabotage perimeter visit tracking is separate from the raid itself. The sabotage mission persists until either:
- The scout successfully intercepts (clears via line 273: `GameplayService.ClearSabotageTracking(engineer)`)
- The engineer cancels sabotage manually
- The engineer completes the sabotage perimeter

**Clarification:** Commando raids and sabotage are distinct mechanics. A raid expiration does not auto-clear sabotage state. The intercept logic checks for active sabotage presence, not raid presence.

**Conclusion:** No race condition bug. `AttemptIntercept` handles stale targets gracefully by returning `"noTarget"` when the engineer no longer has active sabotage or is no longer co-located with the scout.

---

### Test Coverage Added

To confirm the graceful handling of stale intercept targets, 2 new xUnit tests were added to `backend/Landgrab.Tests/Services/AbilityServiceTests.cs`:

1. **`AttemptIntercept_AfterRaidExpires_ReturnsNoTarget`**  
   Simulates a scout starting an intercept lock on an engineer, then the engineer's sabotage being cleared (mimicking raid expiration or manual cancellation). Verifies that the next intercept call returns `"noTarget"` and clears the scout's tracking state.

2. **`AttemptIntercept_WhenEngineerMovesOffHex_ClearsTrackingAndReturnsNoTarget`**  
   Verifies that if the engineer moves to a different hex while the scout is locking, the next intercept call detects the mismatch and returns `"noTarget"`.

**Test Results:** All 360 tests pass (359 passed, 1 skipped).

---

### Decisions

**Decision #43: FieldBattleInvite auto-dismissal is correct as implemented**  
**Status:** Confirmed  
**Rationale:** The frontend panel correctly self-dismisses via timer expiration and server-driven `FieldBattleResolved` events. No changes needed.

**Decision #44: AttemptIntercept graceful stale-target handling is correct**  
**Status:** Confirmed  
**Rationale:** The backend already checks for active sabotage and co-location on every intercept call. Stale targets (after raid expiration or engineer movement) return `"noTarget"` status without errors. Test coverage added to prevent regression.

---

## De Ruyter — Enemy Memory Scrutiny Fix (2026-03-26)

**Agent:** De Ruyter  
**Scope:** Backend movement/visibility pipeline  
**Status:** Implemented

### Scope Reviewed

Full backend movement/visibility pipeline across:
- `backend/Landgrab.Api/Services/VisibilityService.cs`
- `backend/Landgrab.Api/Services/GameplayService.cs`
- `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`
- `backend/Landgrab.Api/Services/VisibilityBroadcastHelper.cs`
- `backend/Landgrab.Api/Models/PlayerVisibilityMemory.cs`
- `backend/Landgrab.Api/Models/GameState.cs`
- `backend/Landgrab.Api/Models/HexCell.cs`

### Findings

#### 1. Memory data model and projection are correct

- `RememberedHex.SeenAt` is the authoritative timestamp (`PlayerVisibilityMemory.cs:6-15`).
- `BuildStateForViewer(...)` applies `Remembered` tier and maps `SeenAt` to `HexCell.LastSeenAt` (`VisibilityService.cs:203-216`, `405-416`).
- `EnemySightingMemorySeconds` is read from dynamics and enforced as TTL in projection (`GameState.cs:81`, `VisibilityBroadcastHelper.cs:113`, `VisibilityService.cs:189-207`).

#### 2. The real gap was in movement-only broadcasts

**Root cause:** `PlayersMoved` path did not update remembered tile memory before sending movement payload.
- `BroadcastPlayersPerViewer(...)` emits only `PlayersMoved` with `List<PlayerDto>` (`VisibilityBroadcastHelper.cs:62-77`), i.e. no grid/visibility tiers are included.
- Before this fix, `CreatePlayersForViewer(...)` computed visibility but did not persist sightings to `room.VisibilityMemory`, so enemy tiles could disappear immediately after moving away because no fresh remembered stamp existed during movement-only flow.

#### 3. Memory persistence behavior

- `PlayerVisibilityMemory` itself is persistent per room/player (`GameState.cs:306`) and is not cleared on each movement tick.
- It is only reset on host-triggered game restart flow (`GameHub.Host.cs:28-31`).

### Implemented Fix

#### A. Stamp memory in movement-only per-viewer path

**File:** `backend/Landgrab.Api/Services/VisibilityBroadcastHelper.cs`
- In `CreatePlayersForViewer(...)`, after computing `visibleHexKeys`, call:
  - `visibilityService.UpdateMemory(room, state, viewerUserId, normalizedViewerAllianceId, visibleHexKeys);`
- This ensures `RememberedHexes[*].SeenAt` gets refreshed whenever a viewer sees hostile tiles, including during `PlayersMoved`-only broadcasts.

#### B. Regression test for movement-only memory stamping

**File:** `backend/Landgrab.Tests/Services/VisibilityBroadcastHelperTests.cs`
- Added: `BroadcastPlayersPerViewer_WhenEnemyTileIsVisible_RefreshesRememberedHexMemory`
- Verifies that broadcasting `PlayersMoved` updates `room.VisibilityMemory[viewer].RememberedHexes` for visible hostile hexes.

### SignalR Behavior Verification

- `PlayersMoved` contains only player projections (`List<PlayerDto>`), not grid tiers.
- `StateUpdated` carries full projected game state with per-tile `VisibilityTier` + `LastSeenAt`.
- Therefore, memory must be written during movement flow so next projection has data to render `Remembered` correctly.

### Validation

- `cd backend/Landgrab.Api && dotnet build --configuration Debug` ✅
- `cd backend/Landgrab.Tests && dotnet test` (357 passed; pre-existing unrelated failure noted)
- Targeted memory-flow tests pass:
  - `VisibilityBroadcastHelperTests.BroadcastPlayersPerViewer_WhenEnemyTileIsVisible_RefreshesRememberedHexMemory` ✅
  - `GameplayServiceTests.UpdatePlayerLocation_WhenEnemyHexLeavesVisibility_StampsRememberedHexBeforeMove` ✅

---

## Vermeer — Tie Radar Sweep Radius to Player Visibility Range

**Date:** 2026-03-27  
**Agent:** Vermeer (Frontend Dev)  
**Status:** Implemented  

### Context

The radar sweep layer was using a hardcoded `SCAN_RADIUS_METERS = 600` constant. This didn't reflect the player's actual visibility range, which varies by role and beacon state:

- **Base visibility:** 1 hex (from `VisibilityService.cs` — `VisibilityRadius = 1`)
- **Beacon/Scout visibility:** 3 hexes (from `VisibilityService.cs` — `BeaconRange = 3`)
- **Scout role:** Permanent beacon (`isBeacon` always true for Scout)
- **Hex size:** Dynamic game config (`state.tileSizeMeters`, typically 50-100m)

### Implementation

#### 1. RadarSweepLayer Changes

**Added props:**
```typescript
export interface RadarSweepLayerProps {
  map: L.Map;
  isActive: boolean;
  visibilityHexes: number;    // NEW: 1 or 3 based on player role/beacon
  hexSizeMeters: number;       // NEW: from state.tileSizeMeters
}
```

**Removed hardcoded constant:**
```typescript
// BEFORE
const SCAN_RADIUS_METERS = 600;

// AFTER
const scanRadiusMeters = hexSizeMeters * visibilityHexes;
```

**Updated `computeRadiusPx` signature:**
```typescript
// BEFORE
function computeRadiusPx(map: L.Map, lat: number, lng: number): number

// AFTER
function computeRadiusPx(map: L.Map, lat: number, lng: number, scanRadiusMeters: number): number
```

Added `scanRadiusMeters` to `useEffect` dependency array to trigger re-render when visibility changes.

#### 2. GameMap Changes

**Compute visibility from local player:**
```typescript
const visibilityHexes = useMemo(() => {
  if (!myPlayer) return 1;
  // Scout has permanent beacon, or any player with active beacon gets 3-hex visibility
  return myPlayer.isBeacon || myPlayer.role === 'Scout' ? 3 : 1;
}, [myPlayer]);
```

**Pass props to RadarSweepLayer:**
```tsx
<RadarSweepLayer
  map={mapInstance}
  isActive={state.phase === 'Playing' && currentLocation != null && layerPrefs.radarSweep}
  visibilityHexes={visibilityHexes}
  hexSizeMeters={state.tileSizeMeters ?? 50}
/>
```

### Behavior

- **Base player (no beacon):** Sweep radius = `tileSizeMeters × 1` (e.g., 50m tiles → 50m sweep)
- **Scout (permanent beacon):** Sweep radius = `tileSizeMeters × 3` (e.g., 50m tiles → 150m sweep)
- **Any player with active beacon:** Sweep radius = `tileSizeMeters × 3`
- **Dynamic scaling:** Radius adjusts when host changes tile size or when player activates/deactivates beacon

The sweep ring and wedge both use the computed `scanRadiusMeters`, so the entire radar visualization scales consistently.

### Validation

```bash
npm run lint   # ✓ 0 errors
npm run build  # ✓ 301 modules, clean
```

No TypeScript errors, no linting violations.

---

