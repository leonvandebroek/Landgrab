# Project Decisions Log

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
