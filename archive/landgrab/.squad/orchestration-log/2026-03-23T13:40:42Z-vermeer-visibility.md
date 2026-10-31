# Vermeer Orchestration Log — Client-Side Visibility Derivation

**Timestamp:** 2026-03-23T13:40:42Z  
**Agent:** vermeer-visibility (Frontend)  
**Task:** Added `localVisibility.ts` utility for client-side visibility derivation; `tricorderTileState.ts` now uses local-first with server-tier fallback. Instant tile reveals, zero round-trip.

## Work Summary

- **Created** `src/utils/localVisibility.ts`
  - Implements `isLocallyVisible()` matching backend `VisibilityService.ComputeVisibleHexKeys` logic
  - Checks: radius 1 of allied players, alliance-owned territory, hostile borders, beacon cone
  - Deterministic and instant — no network latency

- **Integrated** into `src/components/game/map/tricorderTileState.ts`
  - Now uses local visibility computation as primary (server tier as fallback)
  - Tiles reveal instantly when player moves adjacent
  - Server's `VisibilityTier` remains authoritative for Remembered and alliance-shared data

- **Updated call sites** in `HexTile.tsx` and `TileInfoCard.tsx`
  - Added `alliedPlayerHexKeys` and `allianceOwnedHexKeys` computation in `useMemo`
  - Passed to `deriveTileState` for local visibility override
  - React Compiler compatible: proper dependency arrays, no eslint warnings

- **Validated** implementation
  - TypeScript strict mode ✅
  - ESLint clean (one pre-existing warning in `DemolishCard.tsx`)
  - `npm run build` successful
  - Backward-compatible with existing backend

## User Experience Impact

- **Instant tile reveals** — no 750ms+ delay when moving adjacent to new territory
- **Seamless integration** — works with existing `PlayersMoved` events
- **Fully transparent** — no new data sent by backend, just client-side computation

## Related Outputs

- Implementation: Frontend `landgrab-ui` components and utilities
- Decision: `.squad/decisions/inbox/vermeer-visibility-client-side.md`
