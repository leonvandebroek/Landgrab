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

**Interaction type:** local target selection + perimeter traversal mission

#### Fort Construction UX

This is a spatial mission and needs dedicated map guidance.

#### Fort Construction flow

1. Tap `Fort Construction`
2. Bottom panel becomes targeting card:
   - “Select fort target”
   - “Choose the hex you want to encircle”
   - **Back to HUD**
3. Map zooms to a local tactical level where one hex and its six neighbors are easy to read and tap
4. Player taps a valid target hex
5. Bottom panel becomes mission-progress card:
   - target summary
   - progress `visited / 6`
   - simple instruction
   - **Back to HUD**
   - **Abort Mission** only if supported by game rules
6. As the player moves, progress updates live

#### Fort Construction map UX

- target hex highlighted at center
- six neighboring hexes shown as a visible perimeter ring
- visited segments fill in
- remaining segments stay highlighted
- optional hinting toward remaining unvisited sides

### Sabotage

**Interaction type:** enemy target selection + perimeter disruption mission

#### Sabotage UX

Sabotage is a local enemy mission and should mirror fort construction, but with hostile styling.

#### Sabotage flow

1. Tap `Sabotage`
2. Bottom panel enters targeting state
3. Map zooms to local tactical range
4. Valid enemy hexes highlight in red
5. Player taps target
6. Bottom panel becomes mission-progress card with:
   - target summary
   - progress `visited / 3`
   - instruction to visit different neighboring hexes
   - **Back to HUD**
   - abort action only if mechanically supported

#### Sabotage map UX

- enemy target marker
- six neighboring hexes visualized around it
- visited sides fill with sabotage color
- each successful side visit triggers visible and haptic feedback

### Demolish

**Interaction type:** enemy fort target selection + multi-direction breach mission

#### Demolish UX

This is the most mechanically complex Engineer ability, so the UI must explain it while the player uses it.

#### Demolish flow

1. Tap `Demolish`
2. Bottom panel enters target selection mode
3. Only valid enemy forts highlight
4. Player selects a fort
5. Bottom panel becomes mission card with:
   - progress `approaches / 3`
   - short rule reminder
   - **Back to HUD**
   - abort option only if valid in gameplay rules
6. Progress updates whenever the player successfully enters from a new valid approach direction

#### Demolish map UX

- fort hex shown as the center target
- six approach wedges around it
- completed approach directions stay filled
- blocked directions can show warning treatment if an enemy occupies the approach hex and that matters for validity

## Which abilities need full target-selection UX?

These require the strongest bottom-panel replacement + map targeting flow:

- `Commando Raid`
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
