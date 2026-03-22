# Project Decisions Log

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
