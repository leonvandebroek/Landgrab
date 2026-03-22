# PlayerHUD Ability UX — Phased Implementation Plan

**Date:** 2026-03-20
**Parent design doc:** `docs/plans/2026-03-20-playerhud-ability-ux-plan.md`
**Branch:** `feature/physical-presence-mechanics`

---

## Summary

This plan implements a complete ability UX overhaul: a bottom-panel state machine that replaces the `PlayerHUD` during ability flows, backend cancel endpoints for engineer missions, a naming cleanup (`EmergencyRepair` → `Sabotage`), a typed camera controller, per-ability targeting/mission cards, map overlays, and ability-mode precedence over standard tile interactions. It is broken into **5 phases** with explicit file paths, dependencies, and open questions.

---

## Phase 0 — Backend Foundation

These changes have zero frontend dependency and can be done first or in parallel with Phase 1.

### 0A. Add cancel endpoints for engineer missions

**What:** Add `CancelFortConstruction`, `CancelSabotage`, `CancelDemolish` methods that validate the player has an active mission, clear tracking fields, append a cancellation event log entry, and broadcast updated state.

**Files modified:**
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs) — add three new methods: `CancelFortConstruction(roomCode, userId)`, `CancelSabotage(roomCode, userId)`, `CancelDemolish(roomCode, userId)`. Each should:
  - Look up room & player
  - Validate the player actually has that mission in progress (e.g. `player.FortTargetQ.HasValue` for fort)
  - Clear the tracking fields (`FortTargetQ/R`, `FortPerimeterVisited` for fort; `SabotageTargetQ/R`, `SabotagePerimeterVisited` for sabotage; `DemolishTargetKey`, `DemolishApproachDirectionsMade` for demolish)
  - Append event log entry with type `FortConstructionCancelled` / `SabotageCancelled` / `DemolishCancelled`
  - Snapshot state, queue persistence, return `(snapshot, null)`
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs) — add three facade pass-through methods
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs) — add three hub methods: `CancelFortConstruction()`, `CancelSabotage()`, `CancelDemolish()`, following the same pattern as existing ability hub methods (get room by connection, call service, broadcast state)

**Dependencies:** None

**Open questions:** None — the design doc is explicit that these three abilities and only these three support cancellation.

### 0B. Rename EmergencyRepair → Sabotage (backend)

**What:** Rename the method/invocation path from `ActivateEmergencyRepair` to `ActivateSabotage` across the full backend stack.

**Files modified:**
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs) — rename `ActivateEmergencyRepair` → `ActivateSabotage`
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs) — rename facade method
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs) — rename hub method. **Decision needed:** keep the old `ActivateEmergencyRepair` as a temporary shim that calls the new method (for safe rollout), or hard-cut. Recommend hard-cut since frontend will change in the same branch.

**Dependencies:** Must coordinate with Phase 2B (frontend rename).

### 0C. Add cancel event log entry types where missing

**What:** Audit and ensure that all ability lifecycle transitions log events. The cancel methods from 0A already add their own entries. Additionally verify that existing "mission invalidated by state change" scenarios (e.g. losing the hex during fort construction) already log an event. If not, add entries in `GameplayService.cs` where engineer mission state is cleaned up by hex ownership changes.

**Files modified:**
- [backend/Landgrab.Api/Services/GameplayService.cs](backend/Landgrab.Api/Services/GameplayService.cs) — audit `ProcessPerimeterVisit`, `ProcessDemolishApproach`, and any hex ownership change handlers that clear engineer mission fields; add event log entries for `FortConstructionInvalidated`, `SabotageInvalidated`, `DemolishInvalidated` where missing

**Dependencies:** None

### 0D. Backend unit tests for new cancel methods

**What:** Add xUnit tests for all three cancel methods, including happy path, "no active mission" error, and concurrent state validation.

**Files created:**
- Tests added to existing [backend/Landgrab.Tests/Services/AbilityServiceTests.cs](backend/Landgrab.Tests/Services/AbilityServiceTests.cs) — add `CancelFortConstruction_*`, `CancelSabotage_*`, `CancelDemolish_*` test methods using the existing `ServiceTestContext` builder pattern

**Dependencies:** 0A

---

## Phase 1 — Frontend State Foundation

This phase establishes the core types, store changes, and camera controller that all subsequent UI work depends on. No visible UI changes yet.

### 1A. Define AbilityKey type and AbilityUiState in types

**What:** Create new shared types consumed by the store and all ability components.

**Files created:**
- `frontend/landgrab-ui/src/types/abilities.ts` — define:
  ```ts
  export type AbilityKey =
    | 'beacon'
    | 'tacticalStrike'
    | 'rallyPoint'
    | 'commandoRaid'
    | 'fortConstruction'
    | 'sabotage'
    | 'demolish';

  export type AbilityMode = 'idle' | 'targeting' | 'confirming' | 'active' | 'inProgress';

  export type MapFocusPreset = 'none' | 'player' | 'strategicTargeting' | 'localTracking';

  export interface AbilityUiState {
    activeAbility: AbilityKey | null;
    mode: AbilityMode;
    cardVisible: boolean;
    targetHexKey: string | null;
    pendingTargetHexKey: string | null;
    validTargetHexKeys: string[];
    mapFocusPreset: MapFocusPreset;
  }

  export type AbilityButtonState = 'ready' | 'targeting' | 'active' | 'inProgress' | 'cooldown' | 'blocked';
  ```

**Dependencies:** None

### 1B. Add AbilityUiState slice to gameplayStore

**What:** Extend `gameplayStore` with the `AbilityUiState` object and actions to transition between modes. Replace the existing `commandoTargetingMode: boolean` with the new unified state.

**Files modified:**
- [frontend/landgrab-ui/src/stores/gameplayStore.ts](frontend/landgrab-ui/src/stores/gameplayStore.ts) — add:
  - `abilityUi: AbilityUiState` (initial: `{ activeAbility: null, mode: 'idle', cardVisible: false, targetHexKey: null, pendingTargetHexKey: null, validTargetHexKeys: [], mapFocusPreset: 'none' }`)
  - `enterAbilityMode(ability: AbilityKey, mode: AbilityMode, focusPreset?: MapFocusPreset)` — sets activeAbility, mode, cardVisible=true, clears targets
  - `setAbilityMode(mode: AbilityMode)` — transitions mode only
  - `setAbilityTarget(hexKey: string)` — sets pendingTargetHexKey
  - `confirmAbilityTarget()` — moves pendingTargetHexKey to targetHexKey, mode → 'confirming'
  - `activateAbility()` — mode → 'active', clears pending
  - `hideAbilityCard()` — sets cardVisible=false (does NOT change mode/ability)
  - `showAbilityCard()` — sets cardVisible=true
  - `exitAbilityMode()` — resets all fields to idle defaults
  - `setValidTargetHexKeys(keys: string[])` — for commando raid targeting overlay
  - Keep `commandoTargetingMode` as a **derived** getter (`abilityUi.activeAbility === 'commandoRaid' && abilityUi.mode === 'targeting'`) or keep the boolean temporarily and sync it in Phase 3 when commando raid is migrated

**Dependencies:** 1A

### 1C. Create typed camera controller hook

**What:** Implement a `useMapCamera` hook that wraps the existing `mapNavigateRef` with typed imperative methods and presets.

**Files created:**
- `frontend/landgrab-ui/src/hooks/useMapCamera.ts` — exports:
  - `focusPlayer(zoom?: number)` — centers on the player's current hex position
  - `focusHex(q: number, r: number, zoom?: number)` — centers on a specific hex
  - `fitHexes(hexes: Array<[number, number]>, paddingPx?: number)` — fits view to contain all listed hexes
  - Named presets: `applyPreset(preset: MapFocusPreset)` that translates to the above calls
  - Internally reads from `gameState.mapCenter`, `gameState.tileSizeMeters` (for zoom scaling), and the existing `mapNavigateRef`

**Files modified:**
- [frontend/landgrab-ui/src/App.tsx](frontend/landgrab-ui/src/App.tsx) — expose `mapNavigateRef` through a context or pass it to the new hook. **Design decision:** either create a `MapCameraContext` provider wrapping `GameView`, or store the ref in `uiStore`. Recommend storing the navigate callback in `uiStore` since it's already a Zustand store and avoids prop drilling.
- [frontend/landgrab-ui/src/stores/uiStore.ts](frontend/landgrab-ui/src/stores/uiStore.ts) — add `mapNavigateFn: ((lat: number, lng: number) => void) | null` and `setMapNavigateFn(fn)`. Also add `mapSetZoomFn: ((zoom: number) => void) | null` if the Leaflet map exposes zoom control (needs verification).

**Dependencies:** None (but the Leaflet map component must expose both pan and zoom imperatives)

**Open questions:**
1. Does the current `GameMap` component expose zoom control imperatively, or only pan via `navigateRef`? If only pan, we need to also expose `setZoom` from the Leaflet map component.
2. Should `fitHexes` use Leaflet's `fitBounds` directly? This requires the map ref to be accessible. Consider storing the Leaflet map instance ref in `uiStore`.

### 1D. Add cancel hub invocations to useGameActionsAbilities

**What:** Add frontend invoke wrappers for the new cancel endpoints.

**Files modified:**
- [frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts](frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts) — add:
  - `handleCancelFortConstruction: () => Promise<void>` — invokes `'CancelFortConstruction'`
  - `handleCancelSabotage: () => Promise<void>` — invokes `'CancelSabotage'`
  - `handleCancelDemolish: () => Promise<void>` — invokes `'CancelDemolish'`
- [frontend/landgrab-ui/src/hooks/useGameActions.shared.ts](frontend/landgrab-ui/src/hooks/useGameActions.shared.ts) — add the three methods to `UseGameActionsResult` interface
- [frontend/landgrab-ui/src/hooks/useGameActions.ts](frontend/landgrab-ui/src/hooks/useGameActions.ts) — wire the three methods through the facade

**Dependencies:** 0A (backend must have the endpoints)

---

## Phase 2 — Ability Card Shell & Bottom Panel State Machine

This phase builds the reusable UI primitives. After this phase, the ability card can render and replace the HUD, but individual ability flows are not yet wired.

### 2A. Create AbilityCard component

**What:** A reusable bottom-panel replacement surface. This is not a single ability's card — it's the container shell that all ability-specific cards render into.

**Files created:**
- `frontend/landgrab-ui/src/components/game/AbilityCard.tsx` — renders:
  - Header with ability icon, title, and **Back to HUD** button
  - Body slot (children) for ability-specific content
  - Optional **Abort Mission** button (shown when `showAbort` prop is true)
  - Reads `abilityUi` from `gameplayStore` for mode styling
  - Props: `title`, `icon`, `children`, `onBackToHud`, `showAbort?`, `onAbort?`, `abortLabel?`
- `frontend/landgrab-ui/src/styles/ability-card.css` — styling that matches the existing `player-hud` bottom panel dimensions, glass-morphism style, safe-area insets

**Dependencies:** 1A, 1B

### 2B. Rename EmergencyRepair → Sabotage (frontend)

**What:** Rename all frontend references from `emergencyRepair` / `EmergencyRepair` to `sabotage` / `Sabotage`. This is a mechanical find-and-replace with type checking.

**Files modified:**
- [frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts](frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts) — rename `handleActivateEmergencyRepair` → `handleActivateSabotage`, change invoke string to `'ActivateSabotage'`
- [frontend/landgrab-ui/src/hooks/useGameActions.ts](frontend/landgrab-ui/src/hooks/useGameActions.ts) — update facade
- [frontend/landgrab-ui/src/hooks/useGameActions.shared.ts](frontend/landgrab-ui/src/hooks/useGameActions.shared.ts) — update interface
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — rename prop and references
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — rename prop
- [frontend/landgrab-ui/src/components/game/AbilityInfoSheet.tsx](frontend/landgrab-ui/src/components/game/AbilityInfoSheet.tsx) — rename `emergencyRepair` key in `ROLE_ABILITY_META` to `sabotage`
- [frontend/landgrab-ui/src/components/GameView.tsx](frontend/landgrab-ui/src/components/GameView.tsx) — rename prop threading if present
- [frontend/landgrab-ui/src/App.tsx](frontend/landgrab-ui/src/App.tsx) — rename prop threading if present
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts) — rename/alias the translation key if `emergencyRepair` is used in i18n (keep old key as alias for safety)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts) — same

**Dependencies:** 0B (backend rename must land first or simultaneously)

### 2C. Wire bottom-panel state machine into PlayingHud

**What:** Make `PlayingHud` conditionally render either `PlayerHUD` or `AbilityCard` based on `abilityUi.activeAbility` and `abilityUi.cardVisible`.

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — in the bottom panel rendering area:
  - Read `abilityUi` from `gameplayStore`
  - If `abilityUi.activeAbility !== null && abilityUi.cardVisible`, render the appropriate ability-specific card inside `AbilityCard` shell
  - Otherwise render the existing `PlayerHUD`
  - Wire `onBackToHud` to:
    - Pre-activation modes (`targeting`, `confirming`): call `exitAbilityMode()`
    - Post-activation modes (`active`, `inProgress`): call `hideAbilityCard()`

**Dependencies:** 2A, 1B

### 2D. Update ability buttons in PlayerHUD to derive state from abilityUi

**What:** Refactor the ability button state derivation in `PlayerHUD` to use `abilityUi` for targeting/active/inProgress states, and to reopen the ability card on re-tap when a mission is active.

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — for each ability button:
  - Derive `AbilityButtonState` from a combination of `abilityUi` state and player model fields (cooldowns, active flags)
  - On click of an ability button when mission is `active` or `inProgress`: call `showAbilityCard()` instead of re-activating
  - On click when `idle` and ability is `ready`: call `enterAbilityMode(abilityKey, ...)` instead of directly invoking the hub method
  - This is the biggest refactor in this phase

**Dependencies:** 1B, 2C

---

## Phase 3 — Individual Ability Flow Wiring

Each ability gets its own card content and map behavior. These can be done **in parallel** across multiple agents since they touch separate files/components (each ability gets its own card component). However, they all depend on Phase 2.

### 3A. Beacon flow

**Interaction:** Simple toggle. Brief active card with "Turn Off" + "Back to HUD".

**What:** Beacon is the simplest ability. Tapping the button either activates/deactivates directly (toggle behavior), or enters a brief card showing active status.

**Files created:**
- `frontend/landgrab-ui/src/components/game/abilities/BeaconCard.tsx` — renders inside `AbilityCard`:
  - If beacon is active: "Beacon Live" status, range description, **Turn Off** button, **Back to HUD** (via shell)
  - If beacon is inactive: **Activate Beacon** CTA, **Back to HUD**
  - On activate: invoke `handleActivateBeacon`, transition to `active` mode
  - On deactivate: invoke `handleDeactivateBeacon`, transition to `idle`

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — import and render `BeaconCard` when `abilityUi.activeAbility === 'beacon'`
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — beacon button enters ability mode on click instead of direct invoke

**Dependencies:** Phase 2

### 3B. Tactical Strike flow

**Interaction:** Confirm card → armed state. No targeting.

**Files created:**
- `frontend/landgrab-ui/src/components/game/abilities/TacticalStrikeCard.tsx` — renders:
  - Mode `confirming`: title, effect summary, reminder text, **Arm Strike** CTA, **Back to HUD**
  - On arm: invoke `handleActivateTacticalStrike`, transition to `active` mode
  - Mode `active`: "Strike Armed" status, expiry countdown, **Back to HUD**

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — render `TacticalStrikeCard` when active
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — button enters `confirming` mode on click; shows armed badge when active

**Dependencies:** Phase 2

### 3C. Rally Point flow

**Interaction:** Current-hex confirm card → active rally with countdown.

**Files created:**
- `frontend/landgrab-ui/src/components/game/abilities/RallyPointCard.tsx` — renders:
  - Mode `confirming`: "Start Rally Point here?" + current hex info, **Start Rally** CTA, **Back to HUD**
  - Mode `active`: countdown timer, rally hex, ally arrival tracking, **Back to HUD**
  - On activate: invoke `handleActivateReinforce`, transition to `active`

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — render when active
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — button enters `confirming` mode; validate current hex is friendly before allowing

**Map UX (if time):** Rally hex highlight + pulse marker. Could be a follow-up.

**Dependencies:** Phase 2

### 3D. Commando Raid flow

**Interaction:** Remote targeting → confirm → launch. Most complex UX.

**What:** This replaces the current `commandoTargetingMode` boolean with the full state machine. This is the only ability with remote map target selection.

**Files created:**
- `frontend/landgrab-ui/src/components/game/abilities/CommandoRaidCard.tsx` — renders:
  - Mode `targeting`: "Select raid target" instruction, target rules, **Back to HUD**
  - Mode `confirming`: selected target summary, owner info, HQ badge if applicable, **Launch Raid** CTA, **Back** (returns to targeting)
  - Mode `active/cooldown`: raid status, countdown

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — render when active
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — button enters `targeting` mode
- [frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts](frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts) — replace `commandoTargetingMode` check in `handleHexClick` with `abilityUi.activeAbility === 'commandoRaid' && abilityUi.mode === 'targeting'`. On hex click: set `pendingTargetHexKey`, transition to `confirming`. The actual invoke happens on confirm.
- [frontend/landgrab-ui/src/stores/gameplayStore.ts](frontend/landgrab-ui/src/stores/gameplayStore.ts) — eventually remove `commandoTargetingMode` boolean once fully replaced
- Camera: on entering targeting mode, call `applyPreset('strategicTargeting')` via `useMapCamera`

**Map overlay (if time):** Valid target hex highlighting + invalid hex dimming. This requires a new layer or data in the effects store—could be a follow-up.

**Dependencies:** Phase 2, 1C (camera controller)

### 3E. Fort Construction flow

**Interaction:** Current-hex validation → start → perimeter mission with progress.

**Files created:**
- `frontend/landgrab-ui/src/components/game/abilities/FortConstructionCard.tsx` — renders:
  - Mode `targeting` (validation/guidance): "Stand on one of your own non-fort hexes", current hex validity indicator, **Start Fort Construction** CTA (enabled only when current hex is valid), **Back to HUD**
  - Mode `inProgress`: progress `visited/6`, instruction, **Back to HUD**, **Abort Mission**
  - On start: invoke `handleStartFortConstruction`, transition to `inProgress`
  - On abort: invoke `handleCancelFortConstruction`, transition to `idle`
  - Read progress from `myPlayer.fortPerimeterVisited.length` / 6

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — render when active
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — button enters `targeting` (validation) mode; shows progress badge when in-progress
- Camera: on enter, apply `localTracking` preset

**Dependencies:** Phase 2, 0A (cancel endpoint), 1D (cancel invocation)

### 3F. Sabotage flow

**Interaction:** Current-hex validation → start → perimeter disruption mission.

**Files created:**
- `frontend/landgrab-ui/src/components/game/abilities/SabotageCard.tsx` — renders:
  - Mode `targeting`: "Stand on an enemy hex", current hex validity indicator, **Start Sabotage** CTA, **Back to HUD**
  - Mode `inProgress`: progress `visited/3`, instruction, **Back to HUD**, **Abort Mission**
  - On start: invoke `handleActivateSabotage`, transition to `inProgress`
  - On abort: invoke `handleCancelSabotage`, transition to `idle`
  - Read progress from `myPlayer.sabotagePerimeterVisited.length` / 3

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — render when active
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — button enters targeting mode; shows progress badge; hostile styling

**Dependencies:** Phase 2, 0A, 0B, 1D, 2B (rename)

### 3G. Demolish flow

**Interaction:** Current-hex validation → start → multi-approach breach mission.

**Files created:**
- `frontend/landgrab-ui/src/components/game/abilities/DemolishCard.tsx` — renders:
  - Mode `targeting`: "Stand inside an enemy fort", current hex validity indicator, **Start Demolish** CTA, **Back to HUD**
  - Mode `inProgress`: progress `approaches/3`, rule reminder, **Back to HUD**, **Abort Mission**
  - On start: invoke `handleStartDemolish`, transition to `inProgress`
  - On abort: invoke `handleCancelDemolish`, transition to `idle`
  - Read progress from `myPlayer.demolishApproachDirectionsMade.length` / 3

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) — render when active
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — button enters targeting mode; shows progress badge

**Dependencies:** Phase 2, 0A, 1D

---

## Phase 4 — Ability Mode Precedence & Tile Interaction Integration

This phase integrates the ability state machine with the rest of the gameplay interaction layer.

### 4A. Ability mode precedence over tile interactions

**What:** When `abilityUi.mode` is `targeting` or `confirming`, suppress normal tile-action buttons and redirect map taps to the active ability's handler.

**Files modified:**
- [frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts](frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts) — in `handleHexClick`:
  - Check `abilityUi.mode` before standard tile interaction logic
  - If `targeting` for commando raid: set pending target, show confirm card
  - If `targeting` for current-hex abilities (fort/sabotage/demolish): ignore the click (these don't use map tap targeting—they watch current hex)
  - If `active` or `inProgress`: allow normal tile interactions to proceed (the card can be hidden)
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx) — suppress tile action button rendering when `abilityUi.mode === 'targeting' || abilityUi.mode === 'confirming'`

**Dependencies:** Phase 3 (specifically 3D)

### 4B. Auto-exit ability mode on state invalidation

**What:** When a `StateUpdated` event arrives that invalidates the current ability state (e.g. player lost the hex they were fortifying), automatically exit ability mode.

**Files modified:**
- [frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts](frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts) — in `onStateUpdated`:
  - Read `abilityUi` from `gameplayStore`
  - If fort construction was active but `player.fortTargetQ` is now null → call `exitAbilityMode()`
  - If sabotage was active but `player.sabotageTargetQ` is now null → call `exitAbilityMode()`
  - If demolish was active but `player.demolishTargetKey` is now null → call `exitAbilityMode()`
  - If commando raid was targeting but player is no longer commander → call `exitAbilityMode()`

**Dependencies:** 1B

### 4C. Sync abilityUi mode from server state on reconnect/resume

**What:** When the player reconnects or resumes a session, derive the correct `abilityUi` state from the player's server-side fields. For example, if `fortTargetQ` is set, the player has an in-progress fort mission.

**Files modified:**
- [frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts](frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts) — in `onPlayerJoined` and `onStateUpdated` during resume:
  - Check the player's fields and set ability UI state accordingly
  - E.g. if `myPlayer.fortTargetQ != null` → `enterAbilityMode('fortConstruction', 'inProgress')` with `cardVisible: false`
- Alternatively, create a utility `deriveAbilityUiFromPlayer(player: Player): Partial<AbilityUiState>` in a shared util

**Dependencies:** 1B, 4B

---

## Phase 5 — Map Overlays & Polish (Can be incremental / follow-up)

This phase adds the visual map overlays. None of these are blocking for the core ability flows to work—players can use all abilities without overlays. These improve the UX significantly but can be shipped iteratively.

### 5A. Targeting overlay for Commando Raid

**What:** When in commando raid targeting mode, highlight valid target hexes and dim invalid ones.

**Files modified/created:**
- `frontend/landgrab-ui/src/components/map/layers/AbilityOverlayLayer.tsx` (new) — a canvas or SVG overlay layer that reads from `gameplayStore.abilityUi` and renders:
  - Valid target hex glow
  - Invalid target dim
  - Selected target marker
- [frontend/landgrab-ui/src/stores/effectsStore.ts](frontend/landgrab-ui/src/stores/effectsStore.ts) — optionally add `abilityOverlay` data if the overlay layer reads from here

**Dependencies:** 3D

### 5B. Perimeter overlay for Fort Construction

**What:** Show the six neighboring hexes as a perimeter ring around the fort target. Fill visited segments, highlight remaining.

**Files modified:**
- `frontend/landgrab-ui/src/components/map/layers/AbilityOverlayLayer.tsx` — add perimeter ring rendering logic for fort construction

**Dependencies:** 3E

### 5C. Perimeter overlay for Sabotage

**What:** Same structure as fort construction overlay but with hostile styling.

**Dependencies:** 3F, 5B (shares perimeter ring rendering code)

### 5D. Approach wedge overlay for Demolish

**What:** Show six approach wedges around the fort hex, mark completed approaches.

**Dependencies:** 3G, 5B (shares some rendering primitives)

### 5E. Rally Point map marker

**What:** Animated rally hex marker + pulse ring visible to all allied players.

**Dependencies:** 3C

### 5F. Beacon reveal ring

**What:** Animated reveal ring centered on the moving Scout marker.

**Dependencies:** 3A (existing beacon rendering may partially cover this)

---

## Dependency Graph (Summary)

```
Phase 0 (Backend)           Phase 1 (Frontend Foundation)
  0A ─────────────────────┬── 1D (cancel invoke wrappers)
  0B ─────────────────────┬── 2B (frontend rename)
  0C (audit)              │
  0D (tests) ← 0A        │
                          │
  ┌── 1A (types)          │
  │   └── 1B (store) ─────┼── 2C, 2D, 4A, 4B, 4C
  │                       │
  └── 1C (camera) ────────┼── 3D (commando)
                          │
Phase 2 (UI Primitives)   │
  2A (AbilityCard) ← 1A,1B
  2B (rename) ← 0B       │
  2C (PlayingHud wire) ← 2A, 1B
  2D (button refactor) ← 1B, 2C
                          │
Phase 3 (Ability Flows)   │   ← All depend on Phase 2
  3A Beacon               │ (parallel)
  3B Tactical Strike      │ (parallel)
  3C Rally Point          │ (parallel)
  3D Commando Raid ← 1C  │ (parallel)
  3E Fort ← 0A, 1D       │ (parallel)
  3F Sabotage ← 0A,0B,2B │ (parallel)
  3G Demolish ← 0A, 1D   │ (parallel)
                          │
Phase 4 (Integration)     │
  4A ← 3D                │
  4B ← 1B                │
  4C ← 1B, 4B            │
                          │
Phase 5 (Overlays)        │   ← All optional follow-up
  5A ← 3D                │
  5B ← 3E                │
  5C ← 3F, 5B            │
  5D ← 3G                │
  5E ← 3C                │
  5F ← 3A                │
```

---

## Parallelization Opportunities

1. **Phase 0 (all steps)** can run in parallel with **Phase 1 (1A, 1C)**, since they touch entirely separate stacks.
2. All **Phase 3 ability cards (3A–3G)** are independent of each other and can be built by separate agents simultaneously, as long as Phase 2 is complete.
3. **Phase 5 overlays** are orthogonal to each other.
4. **Phase 4** can partially overlap with Phase 3: step 4B can start after 1B without waiting for Phase 3.

---

## Open Questions Requiring Product Decisions

### Q1. Beacon: toggle or card?
The design doc says beacon is a "simple toggle" but also describes a brief active card. **Decision:** Should tapping the beacon button immediately toggle (current behavior), or should it always open a card first? Recommend: keep current toggle behavior for activate, but make the button reopen a card when active (for the "Turn Off" option and status display).

### Q2. Commando Raid valid targets
The backend currently allows targeting **any grid hex**. Should the frontend pre-filter valid targets for the overlay (e.g. only enemy-owned hexes, or unclaimed hexes)? The design doc says "valid targets glow; invalid targets dim" but doesn't define valid/invalid beyond the backend rules. **Decision needed** for what the frontend considers "valid" for overlay purposes.

### Q3. Camera zoom levels
The design doc says to avoid scattering raw zoom literals. What are the actual numeric zoom values for `strategicTargeting` (map-wide view for commando raid), `localTracking` (neighborhood view for engineer missions), and `currentHexCommit` (close-up for confirmation)? These depend on map scale which varies per game. **Recommendation:** derive zoom from `tileSizeMeters` in the game state — e.g. strategic = show ~20 hex radius, local = show ~5 hex radius.

### Q4. Backward compatibility period for EmergencyRepair hub method
Should `ActivateEmergencyRepair` be kept as a server-side shim for any period, or is a hard-cut acceptable since backend and frontend deploy together? **Recommendation:** hard-cut, since they ship in the same branch.

### Q5. Passive ability feedback
The design doc describes passive feedback (commander combat bonus, scout vision, first-visit bonus) as needing treatment, but explicitly says these don't need mission cards. Should passive feedback be part of this implementation scope, or a separate follow-up? **Recommendation:** separate follow-up — the scope is already very large.

### Q6. `commandoTargetingMode` migration timing
The existing `commandoTargetingMode` boolean in `gameplayStore` is consumed by multiple components. Should it be removed immediately in Phase 1B and all consumers updated, or should it be kept as a derived boolean and removed in a cleanup pass after Phase 3D? **Recommendation:** keep as derived/aliased in Phase 1B, remove in Phase 3D.

---

## New Files Summary

| File | Phase | Purpose |
|------|-------|---------|
| `frontend/landgrab-ui/src/types/abilities.ts` | 1A | Shared types |
| `frontend/landgrab-ui/src/hooks/useMapCamera.ts` | 1C | Typed camera controller |
| `frontend/landgrab-ui/src/components/game/AbilityCard.tsx` | 2A | Reusable card shell |
| `frontend/landgrab-ui/src/styles/ability-card.css` | 2A | Card styling |
| `frontend/landgrab-ui/src/components/game/abilities/BeaconCard.tsx` | 3A | Beacon flow |
| `frontend/landgrab-ui/src/components/game/abilities/TacticalStrikeCard.tsx` | 3B | Tactical Strike flow |
| `frontend/landgrab-ui/src/components/game/abilities/RallyPointCard.tsx` | 3C | Rally Point flow |
| `frontend/landgrab-ui/src/components/game/abilities/CommandoRaidCard.tsx` | 3D | Commando Raid flow |
| `frontend/landgrab-ui/src/components/game/abilities/FortConstructionCard.tsx` | 3E | Fort Construction flow |
| `frontend/landgrab-ui/src/components/game/abilities/SabotageCard.tsx` | 3F | Sabotage flow |
| `frontend/landgrab-ui/src/components/game/abilities/DemolishCard.tsx` | 3G | Demolish flow |
| `frontend/landgrab-ui/src/components/map/layers/AbilityOverlayLayer.tsx` | 5A | Map targeting/mission overlays |

## Modified Files Summary

| File | Phases | Nature of changes |
|------|--------|-------------------|
| `backend/.../Services/AbilityService.cs` | 0A, 0B | Add cancel methods, rename |
| `backend/.../Services/GameService.cs` | 0A, 0B | Facade pass-throughs |
| `backend/.../Hubs/GameHub.Gameplay.cs` | 0A, 0B | Hub methods for cancel, rename |
| `backend/.../Services/GameplayService.cs` | 0C | Audit event log entries |
| `backend/.../Tests/.../AbilityServiceTests.cs` | 0D | New cancel test cases |
| `frontend/.../stores/gameplayStore.ts` | 1B, 3D | Add AbilityUiState, migrations |
| `frontend/.../stores/uiStore.ts` | 1C | Add map navigate fn |
| `frontend/.../hooks/useGameActionsAbilities.ts` | 1D, 2B | Add cancel wrappers, rename |
| `frontend/.../hooks/useGameActions.ts` | 1D, 2B | Facade wiring |
| `frontend/.../hooks/useGameActions.shared.ts` | 1D, 2B | Interface updates |
| `frontend/.../hooks/useGameActionsGameplay.ts` | 3D, 4A | Ability mode precedence |
| `frontend/.../hooks/useSignalRHandlers.ts` | 4B, 4C | State invalidation, resume |
| `frontend/.../components/game/PlayingHud.tsx` | 2B, 2C, 3* | Conditional card rendering |
| `frontend/.../components/game/PlayerHUD.tsx` | 2B, 2D, 3* | Button state derivation |
| `frontend/.../components/game/AbilityInfoSheet.tsx` | 2B | Rename key |
| `frontend/.../App.tsx` | 1C, 2B | Camera ref, rename |
| `frontend/.../i18n/en.ts` | 2B | Translation key rename |
| `frontend/.../i18n/nl.ts` | 2B | Translation key rename |
