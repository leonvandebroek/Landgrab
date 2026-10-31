# Tricorder Map V2 State Spec Addendum

## Purpose

This addendum captures the important tricorder/UI states that should be considered **after** the original `tricorder-map-v2-state-spec.md` has been implemented.

The original spec focuses on the core field-usable tile state model. This addendum covers the next layer of completeness:

- uncertainty and partial information
- positive local modifiers
- ephemeral tactical surfaces
- map-wide viewing modes
- implementation notes from the existing `tricorder-v2.css` prototype

This document is intended as a **Phase 2+ follow-up** for the developer once the core V2 state system is live.

---

## Why this addendum exists

After comparing the original V2 docs against the current codebase, several important concepts were found to be either:

- missing from the original state spec,
- underrepresented because they are not pure tile states,
- or already partially scaffolded in code but not explicitly documented.

These items are not required to establish the base tricorder model, but they are important if the map is meant to become a truly complete field instrument.

---

## 1. Hidden strength / uncertain information state

### Proposed state for hidden strength

- `strengthUnknown`
- or `concealedStrength`

### Why hidden strength matters

The original spec includes `troopsVisible`, but a tricorder also needs to represent when troop strength is **not knowable**.

This is tactically significant because “unknown” is itself actionable information.

### Existing code evidence for hidden strength

- `TroopBadge.tsx` supports `isForestBlind`
- when `isForestBlind` is true, the badge shows `?` instead of a troop number
- i18n strings already include a `forestBlind` explanation

### Recommended visual treatment for hidden strength

- keep the center badge channel
- replace troop number with `?`
- optionally add a subtle chip or tooltip explanation
- avoid making this a loud objective/halo state

### Suggested precedence for hidden strength

- lives inside the **numeric strength** layer
- does not override current/selected/objective/progress states

---

## 2. Positive local modifier state

### Proposed state for positive modifiers

- `presenceBoosted`
- or `localModifierPositive`

### Why positive local modifiers matter

The original V2 spec includes copresence sufficiency
(`presenceCritical`, `presenceSatisfied`) but does not explicitly model
the case where the player’s presence is already granting a beneficial
tile effect.

This is a different semantic from “we need more people here.”

### Existing code evidence for positive modifiers

- `TileInfoCard.tsx` already accepts `isPresenceBoosted`
- i18n contains the message:
  - “You’re here — troops recover 3× faster!”

### Recommended visual treatment for positive modifiers

- best as:
  - info card row,
  - compact positive chip,
  - or subtle green/cyan modifier badge
- should not compete with urgency or objective states

### Suggested precedence for positive modifiers

- lower than current/selected/objective/progress
- similar priority to a passive modifier chip

---

## 3. Ephemeral tactical interaction surfaces

These are not durable tile states, but they are still core tricorder behavior.

### Proposed interaction-layer states for ephemeral tactics

- `combatPreview`
- `mapFeedback`
- `actionResolved`

### Why ephemeral tactical surfaces matter

The field tricorder is not only about persistent map semantics. It also needs to support short-lived tactical interpretation such as:

- “what happens if I commit here?”
- “did that claim/reinforce/attack succeed?”
- “why did this action fail?”

### Existing code evidence for ephemeral tactical surfaces

- `gameplayStore.ts` contains:
  - `combatPreview`
  - `mapFeedback`
- `useGameActionsGameplay.ts` triggers `GetCombatPreview`
- `GameView.tsx` renders `CombatPreviewModal`

### Recommendation for ephemeral tactical surfaces

Do **not** fold these into the primary tile-state model.

Instead, add a dedicated section in the broader tricorder documentation for:

- interaction-layer surfaces,
- temporary tactical overlays,
- post-action feedback states.

### Suggested implementation surfaces for ephemeral tactics

- modal or sidecard for preview
- short-lived inline map feedback
- selected-tile contextual callouts

---

## 4. Map-wide viewing modes

These are not tile-local states, but they strongly affect how the tricorder is interpreted.

### Proposed map-wide mode section for tricorder overlays

- `playerMode`
- `observerMode`
- `fogVisible`
- `worldDimMaskEnabled`
- `timeOverlayEnabled`

### Why map-wide viewing modes matter

A tile never exists in isolation. The user’s interpretation of the map changes depending on whether they are:

- playing normally,
- observing as host,
- operating under fog/visibility limits,
- or seeing dimmed/non-playable world areas.

### Existing code evidence for map-wide viewing modes

- `GameView.tsx` checks `hostObserverMode`
- `types/game.ts` includes `hostObserverMode`
- `GameMap.tsx` supports `WorldDimMask`
- `mapLayerPreferences.ts` includes `worldDimMask` and `timeOverlay`

### Recommendation for map-wide viewing modes

Add a **map-wide overlays and modes** section to the long-term tricorder docs.

These should be treated as a separate layer above or alongside tile states.

---

## 5. Beacon / reveal semantics beyond the radius source

### Original spec already includes for beacon visibility

- `visibilitySource`
- `revealedByObserver`

### What still needs expansion for beacon visibility

The original spec captures the idea, but future documentation should also clarify:

- whether reveal is alliance-wide or local
- whether tiles should show visibility provenance
- whether reveal radius should be permanent, pulsed, or optional via layer toggle
- how beacon visibility interacts with fog, neutral tiles, and enemy information certainty

### Recommendation for beacon visibility follow-up

Once the basic reveal radius is implemented, add a follow-up section for:

- visibility provenance,
- reveal ownership,
- and cognitive load rules for fog systems.

---

## 6. Tactical strike as a player-scoped tactical state

### Proposed category for Tactical Strike

- player-scoped tactical states not yet visualized on tiles

### Existing code evidence for Tactical Strike

- `Player.tacticalStrikeActive`
- `Player.tacticalStrikeExpiry`
- `Player.tacticalStrikeCooldownUntil`
- `PlayerHUD.tsx` already represents the ability state

### Why Tactical Strike matters later

Tactical Strike exists in gameplay state and UI, but it is not yet part of the tile-state model.

That may be correct for the first implementation.

However, if Tactical Strike later gains:

- tile targeting,
- area-of-effect visualization,
- or temporary danger zones,

then it should be documented as a future map-state candidate.

### Recommendation for Tactical Strike follow-up

Do not force Tactical Strike into the tile-state model now.

Instead, track it in a future-facing appendix:

- “player-scoped tactical states that may later gain map representation.”

---

## 7. Existing style prototype in `tricorder-v2.css`

### Why the CSS prototype matters

The original state spec is conceptual, but the codebase already contains a concrete CSS prototype for many of the proposed V2 states.

### Current prototype file location

- `frontend/landgrab-ui/src/styles/tricorder-v2.css`

### Prototype coverage already present in CSS

The file contains style scaffolding for:

- split friendly/hostile selection
- reachable / unreachable chips
- build / demolish / sabotage rings
- rally halo
- regen-blocked indicator
- structure glyphs
- copresence chips
- beacon reveal radius

### Recommendation for the CSS prototype

After the core V2 implementation lands, update the main docs to explicitly treat `tricorder-v2.css` as:

- a visual prototype,
- a naming convention seed,
- and a candidate source for class naming consistency.

This reduces the chance that implementation drifts away from the style language that has already been drafted.

---

## Recommended Phase 2 additions

If the original V2 spec is fully implemented, the next additions should be prioritized like this:

### Highest-value follow-ups

1. `strengthUnknown`
2. `presenceBoosted`
3. map-wide mode documentation
4. interaction-layer documentation (`combatPreview`, `mapFeedback`)
5. visibility provenance clarification

### Medium-value follow-ups

1. Tactical Strike future-map treatment
2. formal adoption of `tricorder-v2.css` naming and visual grammar

---

## Recommended update to the original V2 state taxonomy

Once Phase 1 is complete, consider extending the original categories with two small additions:

### Numeric strength state

- `troopsVisible`
- `strengthUnknown`

### Passive modifier chip state

- `presenceBoosted`
- `regenBlocked`
- `raidOnlyObjective`

This keeps the original model compact while improving completeness.

---

## Summary

This addendum is intentionally not part of the first implementation scope.

Instead, it documents the **next set of important tricorder concepts** that should be added once the original V2 tile-state model is working:

- uncertain strength
- positive local presence modifiers
- temporary tactical interaction states
- map-wide viewer and visibility modes
- future tactical map semantics
- and the existing CSS prototype as a concrete design seed

The main implementation rule remains:

**Do not overload the core tile-state system too early — land the stable field-readable layers first, then add uncertainty, modifiers, and map-wide interpretation layers as a second step.**
