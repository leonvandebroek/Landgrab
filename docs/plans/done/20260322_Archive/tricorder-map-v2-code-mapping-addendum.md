# Tricorder Map V2 Code Mapping Addendum

## Purpose

This addendum documents the additional implementation work that should be considered **after** the original `tricorder-map-v2-code-mapping.md` plan has been implemented.

It exists for three reasons:

1. to correct a state-contract assumption that is already outdated,
2. to capture implementation-relevant gaps that were not part of the original mapping,
3. to give the developer a clean Phase 2+ follow-up list once the core tricorder map model is in place.

---

## Important correction to the original code mapping

### `sabotagedUntil` is already present in the frontend type contract

The original code-mapping document treated `regenBlocked` / `SabotagedUntil` as a missing frontend data field.

That is no longer accurate.

### Current codebase status

`frontend/landgrab-ui/src/types/game.ts`

`HexCell` already contains:

- `sabotagedUntil?: string`

### What this changes

The follow-up work for `regenBlocked` is now primarily:

- render wiring in `HexTile.tsx`
- info-card representation in `TileInfoCard.tsx`
- styling in map CSS
- backend/state consistency verification (if needed)

It is **not** a guaranteed missing frontend contract field anymore.

### Action for developer

When implementing or reviewing `regenBlocked`:

- do not start by adding the field to `types/game.ts`
- start by verifying whether backend snapshots populate it consistently
- then implement map/info-card display

---

## Phase 2 implementation additions not covered strongly enough in the original mapping

## 1. Hidden troop count / uncertain strength

### Why hidden troop uncertainty matters

The original code mapping covered `troopsVisible`, but did not explicitly cover the inverse state where the tile’s strength is not fully knowable.

### Existing code anchors for hidden troop uncertainty

- `frontend/landgrab-ui/src/components/map/TroopBadge.tsx`
  - `isForestBlind?: boolean`
  - renders `?` instead of troop count
- i18n strings already reference forest blindness

### Recommended follow-up work for hidden troop uncertainty

Add explicit derived-state and UI handling for:

- `strengthUnknown`
- or `concealedStrength`

### Likely implementation points for hidden troop uncertainty

- `TroopBadge.tsx`
- derived tile presentation helper
- `HexTile.tsx`
- `TileInfoCard.tsx`
- optional tooltip/help text

### Architectural note for hidden troop uncertainty

This should remain a **numeric/visibility state**, not an urgency state.

---

## 2. Presence boost as a passive modifier state

### Why presence boost matters as a passive modifier

A presence-based beneficial modifier is already partially present in the codebase, but it is not reflected in the original code-mapping plan as a reusable state class.

### Existing code anchors for presence boost

- `frontend/landgrab-ui/src/components/game/TileInfoCard.tsx`
  - `isPresenceBoosted?: boolean`
- i18n strings for a positive recovery modifier

### Recommended follow-up work for presence boost

Introduce a lightweight passive modifier state that can be surfaced consistently in:

- selected tile info,
- compact tile chip,
- and any derived presentation model.

### Likely implementation points for presence boost

- derived tile presentation helper
- `TileInfoCard.tsx`
- optional compact chip in `HexTile.tsx`

### Architectural note for presence boost

Do not make this visually compete with objective, selection, or progress states.

---

## 3. Interaction-layer states are currently under-documented

### Why interaction-layer states matter

The original code mapping is tile-centric, but the codebase already contains short-lived tactical interaction state that strongly affects player understanding.

### Existing code anchors for interaction-layer states

- `frontend/landgrab-ui/src/stores/gameplayStore.ts`
  - `mapFeedback`
  - `combatPreview`
- `frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts`
  - preview fetching and action feedback
- `frontend/landgrab-ui/src/components/GameView.tsx`
  - `CombatPreviewModal`

### Recommended follow-up work for interaction-layer states

Document and optionally standardize a separate **interaction state layer** for:

- combat preview
- action outcome feedback
- tactical result messaging

### Architectural note for interaction-layer states

These should not be fused into the persistent hex-state model. They belong in an adjacent UX layer.

---

## 4. Map-wide viewer and overlay modes need explicit mapping

### Why map-wide modes matter in implementation

The original code mapping focused on per-tile state, but the current codebase already includes map-wide interpretation modes.

### Existing code anchors for map-wide modes

- `frontend/landgrab-ui/src/types/game.ts`
  - `hostObserverMode?: boolean`
- `frontend/landgrab-ui/src/components/GameView.tsx`
  - observer-mode flow
- `frontend/landgrab-ui/src/components/map/GameMap.tsx`
  - `WorldDimMask`
- `frontend/landgrab-ui/src/types/mapLayerPreferences.ts`
  - `worldDimMask`
  - `timeOverlay`

### Recommended follow-up work for map-wide modes

Add a separate implementation note or derived mode layer for:

- observer mode
- normal player mode
- fog/world mask presentation
- time overlay and visibility envelope behavior

### Architectural note for map-wide modes

These are best modeled as **map-wide display modes**, not tile-level semantic states.

---

## 5. `tricorder-v2.css` should be treated as an implementation scaffold

### Why the CSS scaffold matters

The current codebase already contains a real style prototype for many of the proposed V2 states.

### Existing code anchor for the CSS scaffold

- `frontend/landgrab-ui/src/styles/tricorder-v2.css`

### What is already scaffolded in the CSS file

- friendly vs hostile selection classes
- reachability chips
- build / demolish / sabotage rings
- rally halo
- corrupt/regen-blocked styling
- structure glyphs
- copresence chips
- beacon reveal radius

### Recommended follow-up work for the CSS scaffold

Once the original V2 implementation starts or lands:

- review class names in `tricorder-v2.css`
- decide whether they become the canonical naming scheme
- align JSX-generated classes and structure to them where practical

### Architectural note for the CSS scaffold

This file is not just styling speculation anymore; it is already an implementation-relevant prototype.

---

## 6. Tactical Strike should be tracked as a future map-affecting ability

### Why Tactical Strike matters as a future map concern

Tactical Strike is already part of player state and HUD state, but it is not represented in the original code mapping as a future map concern.

### Existing code anchors for Tactical Strike

- `types/game.ts`
  - `tacticalStrikeActive`
  - `tacticalStrikeExpiry`
  - `tacticalStrikeCooldownUntil`
- `PlayerHUD.tsx`
  - current ability UI
- `useGameActionsAbilities.ts`
  - activation flow

### Recommended follow-up work for Tactical Strike

Do not force map rendering immediately.

Instead, add a developer note that Tactical Strike should be revisited if it gains:

- tile targeting,
- target preview,
- area-of-effect telegraphing,
- or temporary zone indicators.

---

## Recommended Phase 2 implementation order

Once the original tricorder V2 work is implemented, the next code-facing priorities should be:

### Priority 1 — correctness and consistency

1. Correct any docs or comments that still say `sabotagedUntil` is missing from the frontend contract.
2. Verify backend snapshot/state consistency for `sabotagedUntil`.
3. Wire `regenBlocked` into map and info-card UI.

### Priority 2 — information completeness

1. Add explicit derived support for hidden troop/unknown strength.
2. Add a passive presence-boost modifier state.
3. Expand selected-tile info surfaces to explain uncertainty and modifiers.

### Priority 3 — UX layering

1. Document/standardize the interaction layer (`combatPreview`, `mapFeedback`).
2. Document/standardize map-wide modes (`observerMode`, dim mask, time overlay).
3. Decide whether `tricorder-v2.css` becomes the canonical V2 class vocabulary.

### Priority 4 — future tactical systems

1. Track Tactical Strike and future map-affecting abilities as separate map-semantics candidates.

---

## Suggested concrete developer tasks

After the original docs are implemented, the developer should consider creating or revising the following:

### Documentation tasks

- update `tricorder-map-v2-code-mapping.md` to remove the outdated `sabotagedUntil` assumption
- extend `tricorder-map-v2-state-spec.md` with an uncertainty/modifier appendix
- optionally add a short map-wide-modes appendix

### Code tasks

- add `regenBlocked` rendering in `HexTile.tsx`
- add sabotage-disabled detail in `TileInfoCard.tsx`
- add explicit `strengthUnknown` handling to the derived tile-state layer
- wire `tricorder-v2.css` class strategy into the chosen renderer implementation

### Architecture tasks

- keep ephemeral interaction state out of the persistent tile-state model
- keep map-wide modes separate from per-tile semantics
- centralize derived tile presentation state before adding secondary-phase features

---

## Summary

This addendum is the Phase 2+ companion to the original code-mapping plan.

It exists to tell the developer what should come **after** the first implementation of the original documents:

- correct the stale `sabotagedUntil` assumption,
- implement missing passive/uncertainty states,
- document interaction-layer and map-wide modes,
- and decide whether `tricorder-v2.css` becomes the canonical V2 style scaffold.

The most important long-term implementation rule remains:

**keep persistent tile semantics, temporary tactical interaction state, and map-wide viewing modes as separate layers of UI logic.**
