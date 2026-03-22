# Project Decisions Log

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
