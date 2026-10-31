# Tricorder Map V2 Code Mapping

## Purpose

This document maps the proposed tricorder-style tile state system onto the current Landgrab frontend codebase. It identifies:

- the existing render spine
- reusable logic already present in the app
- where each proposed state would likely be implemented
- where the current frontend/backend contract is missing required state

The goal is to support implementation planning without making ad-hoc UI changes that duplicate state logic or create conflicting sources of truth.

## Current render spine

The main live-map render path today is:

- `frontend/landgrab-ui/src/components/map/GameMap.tsx`
- `frontend/landgrab-ui/src/components/map/layers/GameOverlayLayer.tsx`
- `frontend/landgrab-ui/src/components/map/HexTile.tsx`
- `frontend/landgrab-ui/src/components/game/map/hexRendering.ts`
- `frontend/landgrab-ui/src/components/map/TroopBadge.tsx`
- `frontend/landgrab-ui/src/components/map/layers/EffectsLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx`
- `frontend/landgrab-ui/src/components/game/TileInfoCard.tsx`
- `frontend/landgrab-ui/src/components/game/PlayerHUD.tsx`

## What each current piece owns

### `GameOverlayLayer.tsx`

Responsibilities:

- mounts all `HexTile` instances
- passes `isCurrent` and `isSelected`
- draws separate selected/current overlay polygons
- applies zoom-category classes and layer-preference classes

Key state inputs:

- `selectedHexKey`
- `currentHexKey`
- `grid`
- `hexGeometries`

### `HexTile.tsx`

Responsibilities:

- computes most current per-tile semantic state inline
- resolves ownership relation and hostility
- checks contested state and active raid state
- derives HQ state from alliances
- renders tile-local overlays and badges

Current rendered elements:

- polygon fill/border
- inline `[HQ]` / `[F]` text markers
- current hex crosshair
- raid overlay + icon
- fort-build progress ring
- troop badge

### `hexRendering.ts`

Responsibilities:

- computes fill style
- computes border style
- computes class names
- computes frontier/contested state

Key functions:

- `getHexOwnerColor(...)`
- `getHexTerritoryStatus(...)`
- `getHexFillStyle(...)`
- `getHexBorderStyle(...)`
- `getHexPolygonClassName(...)`

### `PlayerLayer.tsx`

Responsibilities:

- renders player markers
- groups players by hex or approximate fallback position
- already renders beacon markers for active beacons

Important detail:

- this file already converts player lat/lng into room hexes, which makes it a strong foundation for future copresence-derived tile signals

### `TileInfoCard.tsx`

Currently shows:

- owner
- troops
- fortified
- fort
- master tile
- neutral/unclaimed
- presence boost

Not yet shown:

- sabotage progress
- sabotaged / regen-disabled state
- rally state
- raid-only semantics
- claim freeze
- observer-reveal metadata

### `PlayerHUD.tsx`

Already knows about a lot of tactical ability state:

- beacon state
- rally point active/cooldown
- sabotage active/cooldown
- demolish progress/cooldown
- disabled action reasons via tile action helpers

This makes it one of the best sources for reused state derivation.

## Per-state mapping

## 1. Base ownership states

### States

- `neutral`
- `allied`
- `enemy`

### Existing sources

- `HexCell.ownerId`
- `HexCell.ownerAllianceId`
- current player/alliance from stores

### Current implementation points

- `HexTile.tsx`
  - computes `isMine`, `isFriendlyAllianceCell`, `isHostile`
- `hexRendering.ts`
  - `getHexOwnerColor(...)`
  - `getHexFillStyle(...)`
  - `getHexPolygonClassName(...)`

### Expected changes

- mostly refinement, not architecture change
- if explicit `allied` / `enemy` classes are desired, add them in `getHexPolygonClassName(...)`

### Risk

- low

## 2. Current tile state

### State

- `current`

### Existing source

- `useGameplayStore().currentHexKey`

### Current implementation points

- `GameOverlayLayer.tsx`
- `HexTile.tsx`
- `hexRendering.ts`

### Expected changes

- centralize precedence so current tile always owns primary border
- reduce duplication between tile-local current styling and overlay-level current polygon if needed

### Risk

- low

## 3. Selected target states

### States

- `selectedFriendly`
- `selectedHostile`

### Existing sources

- `useGameplayStore().selectedHexKey`
- target cell ownership relation

### Current implementation points

- `GameOverlayLayer.tsx` currently applies only a generic selected overlay
- `HexTile.tsx` already knows `isHostile` and `isFriendlyAllianceCell`
- `hexRendering.ts` only has generic `isSelected`

### Expected changes

- split selected state into hostile vs friendly variants
- likely implement in `HexTile.tsx` and `hexRendering.ts`
- add CSS classes such as `.is-selected-friendly` and `.is-selected-hostile`

### Risk

- low to medium

## 4. Reachability states

### States

- `reachable`
- `unreachable`

### Existing reusable logic

- `frontend/landgrab-ui/src/components/game/tileInteraction.ts`
  - `getTileActions(...)`
  - `getRemoteTileActions(...)`
  - disabled reasons such as out-of-range or adjacency-required

### Current limitation

- this logic is mostly surfaced in HUD/panel text, not on-map tile styling

### Best implementation anchors

- `tileInteraction.ts`
- `HexTile.tsx`
- possibly `GameOverlayLayer.tsx` for selection-linked chip placement

### Recommended architecture

- do not duplicate action-validity logic inline in the tile renderer
- instead derive `reachable` / `unreachable` from the same rules the HUD uses

### Risk

- medium

## 5. Contested state

### State

- `contested`

### Existing sources

- `useEffectsStore().contestedHexKeys`
- `getHexTerritoryStatus(...)`

### Current implementation points

- `HexTile.tsx`
- `hexRendering.ts`
- `EffectsLayer.tsx`

### Expected changes

- mostly precedence tuning and outdoor-visibility tuning
- contested should remain visible but lose to stronger mission states

### Risk

- low

## 6. Raid objective state

### State

- `raidObjective`

### Existing sources

- `gameState.activeRaids`
- `ActiveCommandoRaid.targetQ`
- `ActiveCommandoRaid.targetR`

### Current implementation points

- `HexTile.tsx`
  - `hasActiveRaid`
  - custom overlay polygon
  - top-left icon marker

### Expected changes

- formalize raid objective as a first-class urgency state
- unify it with any future objective halo logic

### Risk

- low

## 7. Rally objective state

### State

- `rallyObjective`

### Existing sources

- `Player.rallyPointActive`
- `Player.rallyPointQ`
- `Player.rallyPointR`
- `Player.rallyPointDeadline`

### Current implementation status

- state exists in `types/game.ts`
- `PlayerHUD.tsx` already reads and formats rally timers
- no live tile render path is currently present

### Best implementation anchors

- `HexTile.tsx`
- optionally `GameOverlayLayer.tsx` for separate objective overlays
- `TileInfoCard.tsx` for semantic explanation

### Expected changes

- derive the rally target tile from player/team state
- render convergence marker and optionally countdown ring

### Risk

- medium

## 8. Copresence states

### States

- `presenceCritical`
- `presenceSatisfied`

### Existing signals

- `PlayerLayer.tsx` already groups players by hex
- `TileInfoCard.tsx` already has a presence boost concept
- live player positions exist in `usePlayerLayerStore().players`

### Best implementation anchors

- `PlayerLayer.tsx` for player-to-hex grouping logic
- `HexTile.tsx` for tile chip rendering
- optional detail in `TileInfoCard.tsx`

### Expected changes

- derive ally/enemy counts per tile client-side
- add compact chip output rather than full visual takeover

### Data model change needed?

- not necessarily

### Risk

- medium

## 9. Build progress state

### State

- `buildProgress`

### Existing sources

- `HexCell.engineerBuiltAt`

### Current implementation points

- `HexTile.tsx`
- existing fort progress ring render pattern

### Expected changes

- treat current fort-build ring as the shared blueprint for all timed map actions

### Risk

- low

## 10. Demolish progress state

### State

- `demolishProgress`

### Existing sources

- `Player.demolishActive`
- `Player.demolishTargetKey`
- `Player.demolishStartedAt`

### Current implementation status

- data exists in `types/game.ts`
- `PlayerHUD.tsx` formats demolish timing
- CSS scaffold exists in `styles/index.css`
- no current render in `HexTile.tsx`

### Best implementation anchors

- `HexTile.tsx`
- shared progress-ring helper
- CSS already partially scaffolded

### Risk

- low to medium

## 11. Sabotage progress state

### State

- `sabotageProgress`

### Existing sources

- `Player.sabotageActive`
- `Player.sabotageStartedAt`
- `Player.sabotageTargetQ`
- `Player.sabotageTargetR`

### Current implementation status

- data exists in `types/game.ts`
- `PlayerHUD.tsx` already tracks sabotage active/cooldown
- docs call for tile info and timer behavior
- no current render in `HexTile.tsx`

### Best implementation anchors

- `HexTile.tsx`
- `TileInfoCard.tsx`
- shared progress-ring helper

### Risk

- medium

## 12. Regen blocked state

### State

- `regenBlocked`

### Expected source

- `HexCell.sabotagedUntil` or equivalent snapshot field

### Current frontend status

- this field is missing from `HexCell` in `types/game.ts`
- current map cannot render this state because the data does not exist client-side

### Required frontend changes

- `types/game.ts`
- `HexTile.tsx`
- `TileInfoCard.tsx`
- CSS

### Required backend/snapshot changes

- snapshot contract for `HexCell`
- backend serialization/state projection

### Risk

- medium to high

## 13. Claim freeze state

### State

- `claimFreeze`

### Existing source

- `AllianceDto.claimFrozenUntil`

### Current status

- data exists in `types/game.ts`
- no strong tile/HQ visual treatment found

### Best implementation anchors

- `PlayingHud.tsx` / `PlayerHUD.tsx` for primary alert
- optional HQ-local marker in `HexTile.tsx`
- optional explanation in `TileInfoCard.tsx`

### Risk

- low to medium

## 14. Structural identity states

### States

- `hq`
- `fort`
- `master`

### Existing sources

- HQ derived from `AllianceDto.hqHexQ/hqHexR`
- `HexCell.isFort`
- `HexCell.isMasterTile`

### Current implementation points

- `HexTile.tsx`
- `hexRendering.ts`
- `TileInfoCard.tsx`

### Expected changes

- move structure identity toward a formal top-glyph strategy
- reduce overlap between center text, structure markers, and troop badge

### Risk

- low

## 15. Raid-only semantic state

### State

- `raidOnlyObjective`

### Existing source

- currently not explicit in frontend data model
- can likely be inferred from HQ + action rules + selected tile context

### Best implementation anchors

- `tileInteraction.ts`
- `HexTile.tsx`
- `TileInfoCard.tsx`
- i18n strings for concise explanation

### Data model change needed?

- maybe not at first, but an explicit server-exposed flag could reduce ambiguity later

### Risk

- medium

## 16. Visibility source state

### State

- `visibilitySource`

### Existing sources

- `Player.isBeacon`
- `Player.beaconLat`
- `Player.beaconLng`

### Current implementation points

- `PlayerLayer.tsx` already renders a beacon icon/marker

### Expected changes

- extend `PlayerLayer.tsx` to render reveal/influence radius
- keep this primarily map-layer based, not tile-border based

### Risk

- low

## 17. Revealed-by-observer state

### State

- `revealedByObserver`

### Current gap

- frontend does not currently appear to receive visibility provenance per tile
- difficult to render honestly without explicit data or derivation rules

### Likely required changes

Frontend:

- `types/game.ts`
- `HexTile.tsx` or tooltip/info card surface

Backend:

- visibility snapshot contract or explicit tile provenance flag

### Risk

- high

## 18. Troop visibility state

### State

- `troopsVisible`

### Existing sources

- `HexCell.troops`
- ownership / structure status
- zoom category and layer preferences

### Current implementation points

- `HexTile.tsx`
- `TroopBadge.tsx`
- `GameOverlayLayer.tsx`
- CSS zoom and layer visibility rules

### Expected changes

- preserve the current numeric layer but keep it separate from tactical semantics
- avoid overloading troop badges with mission meaning

### Risk

- low

## Reuse opportunities

### Reuse `tileInteraction.ts` for reachability

The best way to implement `reachable` / `unreachable` is to reuse the same rule engine that currently drives enabled/disabled tile actions in the HUD.

### Reuse `PlayerHUD.tsx` timing logic

The HUD already formats and reasons about:

- rally countdown
- sabotage state
- demolish state
- beacon state

That logic should inform any shared timed-map-state helper.

### Reuse fort progress rendering as the standard timed ring

The fort progress ring in `HexTile.tsx` is the most direct current template for a shared timed-action rendering language.

### Reuse `PlayerLayer.tsx` hex grouping for copresence

Player position grouping is already implemented. That makes it the most natural starting point for tile-level copresence chips.

## Biggest current gaps

### Backend/frontend contract gaps

- `regenBlocked` / `SabotagedUntil`
- potentially `revealedByObserver`

### UI architecture gaps

- no single derived tricorder tile-state helper exists yet
- too much semantic state is currently computed inline in `HexTile.tsx`
- some important meaning exists only in HUD text, not on-map

## Recommended code-architecture direction

Before implementing multiple new states, introduce a shared derived-state helper, for example:

- `src/components/map/tricorderTileState.ts`
- or `src/utils/deriveHexPresentationState.ts`

That helper should accept:

- `cell`
- `hexId`
- current player
- selected/current hex keys
- active raid/rally/sabotage/demolish state
- contested state
- optionally player positions

And return a compact presentation object such as:

- `baseState`
- `relationState`
- `urgencyState`
- `progressState`
- `structureState`
- `chips[]`
- `badgeMode`

This would keep:

- `HexTile.tsx` simpler
- `TileInfoCard.tsx` consistent with the map
- future state additions safer and easier to test

## Suggested implementation order

1. Add derived reachability state using `tileInteraction.ts`
2. Generalize the progress ring pattern for all timed actions
3. Add rally objective rendering
4. Add beacon reveal radius in `PlayerLayer.tsx`
5. Add sabotage / regen-disabled contract and UI
6. Add copresence chips derived from live player positions
7. Add observer-provenance only after visibility contract is explicit

## Summary

The proposed tricorder map model fits reasonably well onto the existing frontend, but the codebase should avoid layering new state ad hoc inside `HexTile.tsx`.

The most important implementation principle is:

**derive map presentation state once, then feed it consistently into tile render, HUD copy, tooltip/info surfaces, and overlays.**
