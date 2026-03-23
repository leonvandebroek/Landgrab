# Session Log — Beacon Architecture Simplification

**Date:** 2026-03-22  
**Timestamp:** 2026-03-22T17:39:41Z  
**Agents:** de-ruyter, vermeer  
**Focus:** Beacon cone & intel share refactor

## Overview

Completed architectural refactor of beacon scanning and intel sharing, moving cone geometry computation from backend to frontend and replacing implicit automatic sharing with explicit client-driven action.

### Context

Team direction established: backend always sends full tile data to all clients; frontend controls visibility rendering via `VisibilityTier` enum. This decision eliminated the need for server-side payload masking and created opportunity to simplify beacon subsystem.

Previous implementation had `PlayerDto.BeaconScanHexes` populated server-side with explicit grid key list, sent to all players. Cone recomputation triggered on every beacon movement/heading change, forcing full `StateUpdated` broadcasts.

## Problem Statement

1. **Redundant server computation:** Cone geometry recalculated on every position/heading delta, even though frontend had all data needed to compute it
2. **Implicit vs. explicit:** Beacon intel was automatically shared; no clear user action for scout teamwork
3. **Payload bloat:** `BeaconScanHexes` added overhead to every `PlayerDto` projection
4. **Stale overlays:** Movement updates that didn't trigger `gridChanged` left client cones out of sync

## Solution

### Backend (de-ruyter)

1. **Removed masking:** `VisibilityService.BuildStateForViewer` now only sets `VisibilityTier`; never nulls/zeros hidden tile fields
2. **Removed auto re-scan:** `GameplayService.UpdatePlayerLocation` no longer recomputes cone or marks `gridChanged` on beacon movement
3. **Removed field:** Deleted `PlayerDto.BeaconScanHexes` from model and projection chain
4. **Added explicit action:** New hub method `ShareBeaconIntel(roomCode, hexKeys[])` that:
   - Validates authorization and beacon state
   - Updates `PlayerVisibilityMemory.RememberedHexes` with fresh `SeenAt` timestamps
   - Broadcasts `StateUpdated` to alliance members

### Frontend (vermeer)

1. **New utility:** `beaconCone.ts` with `computeBeaconCone(playerHexKey, headingDegrees, grid)` function
   - Pure function, no external state dependency
   - Maps 360° heading to 6 axial directions (60° sectors)
   - Returns 3-hex cone filtered to grid bounds
2. **Updated overlay:** `AbilityOverlayLayer` now computes cone locally from `myPlayer` heading
   - Reactive to heading changes
   - No server round-trip required
3. **Share Intel action:** `handleShareBeaconIntel` in `useGameActionsAbilities`
   - Computes cone locally
   - Invokes `ShareBeaconIntel(roomCode, hexKeys[])`
   - Clear UX signal for scout teamwork

## Validation

| Component | Check | Result |
|-----------|-------|--------|
| Backend | `dotnet build` | ✅ Clean |
| Backend | `dotnet test` | ✅ 292/293 passed (1 skipped) |
| Frontend | `npm run lint` | ✅ 0 errors |
| Frontend | `npm run build` | ✅ tsc + vite clean |

## Files Affected

### Backend
- `Services/VisibilityService.cs` — removed masking
- `Services/GameplayService.cs` — removed re-scan
- `Services/GameStateCommon.cs` — removed BeaconScanHexes
- `Services/AbilityService.cs` — removed cone payload
- `Hubs/GameHub.cs` — added ShareBeaconIntel method
- Test support files updated

### Frontend
- `src/utils/beaconCone.ts` — new utility
- `src/types/game.ts` — removed beaconScanHexes field
- `src/components/game/AbilityOverlayLayer.tsx` — local computation
- `src/hooks/useGameActionsAbilities.ts` — Share Intel integration

## Implications

1. **Client-side autonomy:** Frontend no longer waits for server beacon cone updates; computes immediately
2. **Clearer UX:** Share Intel is now explicit action, not automatic side effect of movement
3. **Reduced overhead:** One less field in every player DTO projection
4. **Maintained consistency:** Backend still authoritative on game state; client just computes display geometry
5. **Preserved teamwork:** Scout intel sharing still works through alliance history + fresh `SeenAt` timestamps

## Next Steps

- Integration testing with multiplayer gameplay
- Verify beacon cone visibility works correctly as player rotates
- Test Share Intel with multiple alliance members
- Monitor backend load for improvement (removed per-movement re-scans)

---

**Status:** Architectural refactor complete, awaiting integration validation
