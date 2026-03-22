# PlayerHUD Ability UX Plan

**Date:** 2026-03-20  
**Branch:** `feature/physical-presence-mechanics`

This document consolidates the mobile-first UX decisions for player-role abilities exposed through `PlayerHUD`.

It is intended to guide implementation of:

- role ability activation flows
- map targeting behavior
- bottom-panel replacement behavior during ability mode
- progress and status presentation for ongoing missions
- passive role feedback that should remain visible without desktop-only debug UI

## Goal

Design the best possible UX for role abilities on **mobile devices**, where players interact while moving outdoors.

The desktop `TileInfoCard` should **not** be the primary interaction model for gameplay abilities.
It may remain useful for testing, inspection, and debugging, but real players need direct,
thumb-friendly flows anchored in `PlayerHUD` and the map itself.

## Core principles

1. **Mobile-first** — interactions must work while walking, under time pressure, and with one hand.
2. **Map-first** — when a task is spatial, the map should teach the task directly.
3. **Single focus area** — avoid stacking multiple large bottom surfaces that reduce visible map area.
4. **Explicit state** — players should always know whether an ability is ready, targeting, active, in progress, or cooling down.
5. **Always escapable** — players must be able to back out of the UX mode without getting trapped.
6. **No hidden rules** — if movement, range, target eligibility, or progress matters, the UI should show it plainly.

## Shared interaction model

All active abilities should use a common bottom-panel state machine.

### Bottom panel modes

- `default` — normal `PlayerHUD`
- `targeting` — player is selecting a tile or target
- `confirming` — player selected a target and must confirm
- `active` — ability is live and ongoing
- `inProgress` — movement-based mission is underway
- `cooldown` — ability is unavailable and showing remaining time

### Ability button states

Each button in `PlayerHUD` should visually support:

- **Ready**
- **Targeting**
- **Active**
- **In Progress**
- **Cooldown**
- **Blocked**

Blocked state should include a plain-language reason when relevant.

## Ability card vs PlayerHUD

### Decision

When a player enters an ability flow, the **ability card should replace the `PlayerHUD` in the same bottom panel region**, rather than stacking above it.

### Why

On mobile, vertical screen space is too valuable to reserve for both:

- the normal `PlayerHUD`
- and a second full-height ability card above it

Replacing the HUD during ability mode:

- preserves more map visibility
- creates a clearer sense of task focus
- prevents bottom-of-screen UI clutter
- keeps all gameplay interaction in one predictable region

### Required escape behavior

The replacement card must always provide an explicit way to return to the normal HUD.

Use two distinct concepts where appropriate:

- **Back to HUD** — exit the UI mode and restore the normal `PlayerHUD`
- **Abort Mission** — actually cancel the gameplay mission, only when game rules allow it

These must not be conflated into one ambiguous control.

### Recommended controls

- Primary header action: **Back** or **Back to HUD**
- Secondary destructive action when mechanically valid: **Abort Mission** / **Cancel Mission**
- Optional convenience behavior: tapping the active ability button again reopens the mission card

## Shared map behavior

### If an ability needs target selection

When entering targeting mode:

1. bottom panel switches from `PlayerHUD` to ability card
2. map recenters or reframes appropriately
3. zoom level adjusts to match the selection radius or task scale
4. valid targets are highlighted
5. invalid targets are dimmed or visibly locked
6. the card shows a single, clear instruction and a cancel/back action

### If an ability requires movement

The map should provide the task structure directly using overlays such as:

- target hex highlight
- radius ring
- perimeter segments
- approach wedges
- visited/unvisited side markers
- directional guidance toward remaining objectives

## Implementation contract

This section is the handoff contract for implementation. It resolves the remaining behavior ambiguities.

### Canonical ability UI state

Ability mode should not be implemented as a growing pile of booleans.

Use a single `AbilityUiState` object in `gameplayStore`, for example:

- `activeAbility: AbilityKey | null`
- `mode: 'idle' | 'targeting' | 'confirming' | 'active' | 'inProgress'`
- `cardVisible: boolean`
- `targetHexKey: string | null`
- `pendingTargetHexKey: string | null`
- `validTargetHexKeys: string[]`
- `mapFocusPreset: 'none' | 'player' | 'strategicTargeting' | 'localTracking'`

All ability-card rendering, map overlays, and button state should derive from this object.

### Back to HUD vs Abort Mission

These are different actions and must stay different in implementation.

#### Rule A — pre-activation flows

For `targeting` and `confirming` modes:

- `Back to HUD` exits the ability mode
- clears temporary target selection
- removes temporary targeting overlays
- restores the normal `PlayerHUD`

#### Rule B — post-activation flows

For `active` and `inProgress` modes:

- `Back to HUD` only hides the ability card
- the mission or ability remains active
- compact progress/status remains visible on the relevant ability button
- tapping the active ability button reopens the card

### Full abort behavior

The implementation should fully support mission cancellation where it is product-correct, and explicitly not support it where the ability represents a committed public action or consumed buff.

#### Aborts to implement

Implement explicit backend + hub + frontend cancel flows for:

- `Fort Construction`
- `Sabotage`
- `Demolish`

Recommended backend additions:

- `CancelFortConstruction(roomCode, userId)`
- `CancelSabotage(roomCode, userId)`
- `CancelDemolish(roomCode, userId)`

These should:

- clear the player tracking fields
- append a cancellation event log entry
- broadcast updated state

#### Aborts not supported by design

Do **not** support mission abort after activation for:

- `Tactical Strike` — once armed, it is a committed buff until consumed or expired
- `Rally Point` — once activated, it is a public team objective until expiry
- `Commando Raid` — once launched, it is a public team objective until resolution
- `Beacon` — this is not an abort case; it is a simple activate/deactivate toggle

### Ability mode precedence over tile interactions

When ability mode is active, it must take precedence over standard tile interactions.

#### During `targeting` and `confirming`

- normal tile-action buttons are suppressed
- map taps are interpreted through the active ability only
- standard tile feedback is replaced by ability-specific targeting feedback

#### During `active` and `inProgress`

- normal tile actions may still be available if gameplay rules allow them
- the ability card may be hidden and reopened independently
- the active ability button remains the entry point back into the mission card

### Camera control contract

The current codebase has a basic imperative map navigation hook through `mapNavigateRef`, but ability flows need a slightly richer camera contract.

Implement a typed imperative map controller for gameplay, for example:

- `focusPlayer(zoom?: number)`
- `focusHex(q: number, r: number, zoom?: number)`
- `fitHexes(hexes: Array<[number, number]>, paddingPx?: number)`

Recommended presets:

- `strategicTargeting`
- `localTracking`
- `currentHexCommit`

Do not scatter raw zoom literals across multiple components.

## Backend-derived activation and target validity matrix

The table below reflects the **current codebase rules** from `AbilityService`, `GameplayService`, and the hub methods.

| Ability | How selection works in current code | Valid target / activation context | Invalid target behavior | Physical presence required at selection? |
|---|---|---|---|---|
| `Beacon` | No tile selection | Player must be in gameplay, beacon enabled, have location, and be Scout when roles are enabled | Button disabled or error if no location / wrong role / beacon disabled | **Yes, location is required**, but no tile target is selected |
| `Tactical Strike` | No tile selection | Commander only, gameplay only, roles enabled, not on cooldown | Disabled or error on cooldown / wrong role / wrong phase | **No** |
| `Rally Point` | Activate on **current hex only** | Commander only; current hex must be friendly; requires current location/current hex | Disabled or error if not on a friendly hex | **Yes** — player must currently be on the rally hex |
| `Commando Raid` | Remote map target selection | Any valid grid hex currently passes backend validation; HQ allowed only after 40% claimed gate; one active raid per alliance; cooldown applies | Invalid for off-grid target, cooldown, duplicate active raid, wrong role, HQ before gate | **No** |
| `Fort Construction` | Activate on **current hex only** | Engineer only; current hex must be owned by the player, not already a fort, and player must not already be constructing | Invalid if current hex is not own hex or already a fort | **Yes** — player must currently stand on the fort target hex |
| `Sabotage` | Activate on **current hex only** | Engineer only; current hex must be enemy-owned and not friendly; cooldown applies | Invalid if current hex is neutral or friendly, or on cooldown | **Yes** — player must currently stand on the sabotage target hex |
| `Demolish` | Activate on **current hex only** | Engineer only; current hex must be an enemy fort; cooldown applies | Invalid if current hex is not a fort or is friendly | **Yes** — player must currently stand on the enemy fort hex |

### Important alignment note

Only `Commando Raid` is currently a true remote target-selection ability in the backend.

`Fort Construction`, `Sabotage`, and `Demolish` are all
**current-hex activation abilities** today.
If product direction changes and these should support remote pre-selection,
backend APIs and validation rules must change as part of the implementation.

## Backend changes required for a high-quality implementation

Backend changes are justified here and should not be avoided if the goal is a complete,
clean implementation instead of a UI-only patch.

### Must-have backend changes

#### 1. Add explicit cancel endpoints for engineer missions

To match the UX contract, add service + hub methods for:

- `CancelFortConstruction`
- `CancelSabotage`
- `CancelDemolish`

These should:

- validate that the player actually has that mission in progress
- clear the relevant tracking fields
- append event-log entries
- queue persistence and broadcast updated state

This avoids forcing the frontend to rely on indirect cancellation by moving onto an invalid hex
or waiting for state changes.

#### 2. Standardize ability-specific hub method naming

The backend currently exposes `ActivateEmergencyRepair`, but product language and UX use
`Sabotage`.

Recommended change:

- rename the service/hub/frontend invocation path to `ActivateSabotage`
- keep a temporary compatibility shim only if needed during migration

This reduces implementation confusion and keeps telemetry, event logs, and UI language aligned.

#### 3. Add explicit cancellation/availability event logging where missing

The ability flows rely heavily on state-driven UI. Event logs should cleanly reflect:

- mission started
- mission cancelled
- mission completed
- mission invalidated by state changes

Most of this already exists for engineer flows, but explicit cancel APIs should append
purpose-specific log entries as well.

### Recommended backend improvements

#### 4. Add shared ability validation helpers

Several ability rules are currently embedded directly inside service methods.

Create reusable validators for:

- current-hex requirement
- friendly/enemy ownership requirement
- enemy fort requirement
- cooldown availability
- gameplay phase / role enablement

This will make frontend behavior easier to mirror and future backend changes safer.

#### 5. Add structured ability availability payloads if UX needs exact disable reasons

If the implementation wants perfect button-state reasons without duplicating rules in React,
consider exposing derived ability availability in player state or a small derived DTO.

Example fields:

- `isAvailable`
- `blockedReason`
- `requiresCurrentHex`
- `currentHexValid`

This is optional, but it is the cleanest long-term approach if ability logic continues growing.

### Optional backend expansion if product wants remote engineer targeting

If product decides Engineer abilities should support remote pre-selection from the map,
the backend must change deliberately rather than forcing the frontend to fake it.

That would require:

- new method signatures carrying target coordinates for fort/sabotage/demolish start actions
- validation of target eligibility against the selected hex rather than the current hex
- clear rules for whether physical presence is required at selection time,
   completion time, or both
- updated event log messages and state tracking semantics

My recommendation is:

- keep `Rally Point`, `Fort Construction`, `Sabotage`, and `Demolish` as
   **current-hex activation** abilities
- keep `Commando Raid` as the primary **remote targeting** ability

That split matches the current backend model, fits the physical-presence design,
and keeps the UX mentally consistent.

## Commander abilities

### Tactical Strike

**Interaction type:** instant activation with meaningful commitment

#### Tactical Strike UX

This should not be a blind one-tap trigger. It needs a short confirm flow to prevent accidental activation.

#### Tactical Strike flow

1. Tap `Tactical Strike`
2. Bottom panel switches to an ability card with:
   - title
   - one-sentence effect summary
   - reminder that the next eligible attack uses it
   - **Arm Strike** CTA
   - **Back to HUD**
3. After confirmation, the ability enters an **Armed** state
4. UI returns to normal HUD or stays briefly expanded before the player returns manually
5. The button shows an armed/active state until consumed by the next valid attack

#### Tactical Strike map UX

No target selection is required.

While armed:

- keep the button visibly armed
- optionally emphasize eligible enemy targets nearby
- show clear feedback if the player taps an invalid attack target

### Rally Point

**Interaction type:** current-position activation with timed team convergence

#### Rally Point UX

This is a current-location mission. It should feel like planting a rally objective.

#### Rally Point flow

1. Tap `Rally Point`
2. Bottom panel switches to a confirm card:
   - “Start Rally Point here?”
   - short explanation of ally arrival reward
   - **Start Rally**
   - **Back to HUD**
3. On activation, the card becomes a live status card:
   - countdown
   - current rally hex
   - ally arrivals
   - troops earned so far
4. Player can return to normal HUD while the rally remains active
5. Re-tapping the active ability button reopens the rally card

#### Rally Point map UX

- highlight rally hex strongly
- pulse or animate a rally marker
- optionally give allied players directional guidance toward the rally

### Commando Raid

**Interaction type:** strategic map target selection + mission launch

#### Commando Raid UX

This should be the clearest and most deliberate targeting experience.

#### Commando Raid flow

1. Tap `Commando Raid`
2. Bottom panel switches to targeting card
3. Map zooms/reframes to a strategic level appropriate for raid target selection
4. Valid raid targets glow; invalid targets dim or show lock state
5. Card shows:
   - “Select raid target”
   - target rules
   - **Back to HUD**
6. Player taps a valid target hex
7. Bottom panel moves to confirm state:
   - selected target summary
   - target owner / HQ badge when relevant
   - **Launch Raid**
   - **Back**
8. Once launched, the button becomes cooldown and the active raid state is shown via mission card and map marker

#### Commando Raid map UX

- strong target marker
- countdown ring
- HQ styling when applicable
- target visible to all relevant players once raid starts

## Scout ability

### Beacon / Forward Observer

**Interaction type:** immediate toggle with persistent live aura

#### Beacon UX

This should be the simplest ability in the game.

#### Beacon flow

1. Tap `Beacon`
2. Beacon activates immediately
3. Button becomes active/pressed
4. Bottom panel may briefly switch to a compact active card showing:
   - “Beacon live”
   - reveal purpose
   - **Turn Off**
   - **Back to HUD**
5. Returning to the normal HUD is fine; the active button remains visible and can reopen the card

#### Beacon map UX

- reveal ring centered on the moving Scout marker
- ring follows the Scout live
- language should emphasize that this is a moving observer effect, not a planted static object

## Engineer abilities

### Fort Construction

**Interaction type:** guided current-hex activation + perimeter traversal mission

#### Fort Construction UX

This is a spatial mission and needs dedicated map guidance.

The current backend does **not** support remote target selection for fort construction.
The user must physically stand on the hex they want to fortify, then activate the ability.

#### Fort Construction flow

1. Tap `Fort Construction`
2. Bottom panel becomes validation/guidance card:
   - “Stand on one of your own non-fort hexes”
   - “When you are on a valid hex, start fort construction”
   - **Back to HUD**
3. Map zooms to a local tactical level where the current hex and neighboring perimeter are easy to read
4. If the current hex is valid, the card shows a primary CTA: **Start Fort Construction**
5. Once activated, the bottom panel becomes mission-progress card:
   - target summary
   - progress `visited / 6`
   - simple instruction
   - **Back to HUD**
   - **Abort Mission**
6. As the player moves, progress updates live

#### Fort Construction map UX

- target hex highlighted at center
- six neighboring hexes shown as a visible perimeter ring
- visited segments fill in
- remaining segments stay highlighted
- optional hinting toward remaining unvisited sides

### Sabotage

**Interaction type:** guided current-hex activation + perimeter disruption mission

#### Sabotage UX

Sabotage is a local enemy mission and should mirror fort construction, but with hostile styling.

The current backend does **not** support remote target selection for sabotage.
The user must physically stand on the enemy hex they want to sabotage, then activate the ability.

#### Sabotage flow

1. Tap `Sabotage`
2. Bottom panel enters validation/guidance state
3. Map zooms to local tactical range
4. Enemy-owned hexes can be highlighted as candidate objectives, but activation occurs only from the current hex
5. If the current hex is a valid enemy hex, the card shows **Start Sabotage**
6. Bottom panel becomes mission-progress card with:
   - target summary
   - progress `visited / 3`
   - instruction to visit different neighboring hexes
   - **Back to HUD**
   - **Abort Mission**

#### Sabotage map UX

- enemy target marker
- six neighboring hexes visualized around it
- visited sides fill with sabotage color
- each successful side visit triggers visible and haptic feedback

### Demolish

**Interaction type:** guided current-hex activation + multi-direction breach mission

#### Demolish UX

This is the most mechanically complex Engineer ability, so the UI must explain it while the player uses it.

The current backend does **not** support remote fort selection for demolish.
The user must physically stand inside the enemy fort hex to start demolish.

#### Demolish flow

1. Tap `Demolish`
2. Bottom panel enters validation/guidance mode
3. Enemy forts can be highlighted on the map as candidate objectives, but activation occurs only from the current hex
4. If the current hex is a valid enemy fort, the card shows **Start Demolish**
5. Bottom panel becomes mission card with:
   - progress `approaches / 3`
   - short rule reminder
   - **Back to HUD**
   - **Abort Mission**
6. Progress updates whenever the player successfully enters from a new valid approach direction

#### Demolish map UX

- fort hex shown as the center target
- six approach wedges around it
- completed approach directions stay filled
- blocked directions can show warning treatment if an enemy occupies the approach hex and that matters for validity

## Which abilities need full target-selection UX?

These require the strongest bottom-panel replacement + map targeting flow:

- `Commando Raid`

## Which abilities need guided current-hex validation UX?

These should open an ability card that validates the player's **current hex** and then starts the mission from there:

- `Rally Point`
- `Fort Construction`
- `Sabotage`
- `Demolish`

## Which abilities need short confirm UX?

These benefit from a brief confirm card before activation:

- `Tactical Strike`
- `Rally Point`

## Which ability can remain a simple toggle?

- `Beacon`

## Passive ability UX that still needs feedback

The active/button-driven ability set is covered by the flows above, but passive role effects still need lightweight mobile UX.

These do **not** need mission cards; they need discoverability and trigger feedback.

### Passive effects needing feedback treatment

- Commander physical-presence combat bonus
- Scout extended vision / wider visibility effect
- Scout first-visit troop bonus
- any Engineer passive fort/sabotage-related state feedback not already visible through mission progress

### Recommended passive UX patterns

Use small, lightweight feedback instead of large panels:

- short toasts
- haptic confirmation
- temporary status chips
- combat preview badges
- map pulses or brief overlay flashes
- passive effect indicators in HUD or combat preview surfaces

### Best implementation approach for passive feedback

Use a centralized passive-feedback mapper in the frontend rather than ad-hoc toasts from many components.

Recommended approach:

1. derive passive feedback from a combination of:
   - incoming `GameEventLogEntry` items
   - combat preview state
   - combat result state
   - relevant player state transitions in SignalR handlers
2. route those through one lightweight feedback service that can emit:
   - toast
   - haptic pulse
   - temporary HUD chip
   - map pulse / overlay flash

Recommended surfacing per passive:

- **Commander presence combat bonus** — show in combat preview and combat result surfaces as an explicit bonus badge
- **Scout first-visit bonus** — toast + haptic + brief map pulse on the beneficiary hex
- **Scout extended vision** — persistent lightweight HUD/map indicator rather than repeated toasts
- **Engineer passive progress-related state** — map overlay first, HUD chip second, toast only on completion/cancellation

## Important naming cleanup

Frontend naming should remain aligned with current mechanics to avoid UX confusion.

Examples to clean or keep consistent:

- `emergencyRepair` should be presented as **Sabotage** in player-facing UX
- older role metadata or copy referring to removed or superseded role behavior should be updated

## Recommended reusable implementation primitives

### Ability mode state

A dedicated store or UI state for the current ability mode:

- `idle`
- `targeting`
- `confirming`
- `active`
- `inProgress`
- `cooldown`

### Ability card

A reusable bottom-panel replacement surface that can show:

- title
- instruction
- progress
- target summary
- primary CTA
- back/close action
- optional abort action

### Ability target overlay

Reusable map overlay primitives for:

- valid target highlighting
- invalid target dimming
- target markers
- perimeter segments
- approach wedges
- mission progress visuals

## Final UX recommendation

The best mobile experience is:

- `PlayerHUD` in normal play
- a bottom ability card that **replaces** `PlayerHUD` during ability mode
- explicit **Back to HUD** behavior
- separate **Abort Mission** only when gameplay rules allow cancellation
- active progress visible both in the reopened mission card and in compact button state when the player returns to the HUD

This keeps the UI map-first, readable while moving, and consistent across all player roles.
