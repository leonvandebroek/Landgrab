# Compass-Enhanced Physical Presence Abilities — Combined Spec

**Date:** 2026-03-21
**Status:** Design / pre-implementation
**Branch:** `feature/physical-presence-mechanics`

---

## Purpose

This document combines the newly locked compass- and motion-based ability
decisions into one implementation-ready spec. It is meant to sit on top of the
existing physical-presence work and clarify where the new sensor-driven rules
**override** earlier drafts.

It consolidates:

- the already-defined Scout Intercept design,
- Beacon's move from a circular reveal to a directed reveal sector,
- Commander pointing flows for Commando Raid and Tactical Strike,
- Rally Point's pitch-based activation gesture,
- Demolish's move from walk-entry tracking to heading lock tracking.

---

## Relationship to earlier docs

This spec intentionally supersedes parts of earlier plans where the newer compass decisions conflict with them.

### Earlier decisions that still stand

- Physical presence remains the core design principle.
- Backend stays the source of truth.
- Fort construction and sabotage continue using transient player-owned progress state.
- Commando Raid still resolves as a room-visible timed objective once confirmed.
- Rally Point still resolves into troop reinforcement at the marked hex.
- Scout Intercept remains a stealth counter to active sabotage.

### Earlier decisions overridden by this spec

- **Beacon** no longer uses a simple 2-hex circular footprint; it becomes a **4-hex directed sector** based on heading captured at activation.
- **Commando Raid** no longer starts from map-tap targeting; it becomes a **point + live resolve + confirm** flow.
- **Tactical Strike** is no longer a generic timed combat bonus; it becomes a **hex-targeted buff** aimed at one specific hex.
- **Demolish** no longer progresses by entering and leaving the fort hex from multiple directions; it now progresses by **holding facing locks from 3 adjacent positions**.
- **Rally Point** gains a **frontend physical gesture gate** using device pitch before the normal activation is sent.

---

## Decisions locked

### Shared infrastructure

- New `CurrentHeading` on `PlayerDto` for all players.
- New `BearingDegrees(...)` + `HeadingDiff(...)` helpers in `HexService`.
- iOS `DeviceOrientationEvent.requestPermission()` gate in a `useDeviceOrientation` hook.
- iOS `DeviceMotionEvent.requestPermission()` gate in a `useDeviceMotion` hook for Rally Point pitch sensing.

### Locked: Beacon (Scout)

- Arc width: configurable via new `GameDynamics.BeaconSectorAngle` field (`int`, degrees, default `45`).
- Replace the old 2-hex circle with a **4-hex directed sector** centered on the Scout's heading at activation time.
- No heading polling after activation; heading is captured once and stored as `BeaconHeading` on `PlayerDto`.
- Existing `ActivateBeacon` gains a `double heading` parameter.

### Locked: Commando Raid (Commander)

- Commander must be in an **adjacent hex** to the target (`HexDistance == 1`).
- Pointing replaces map-tap targeting entirely.
- Frontend polls heading; backend resolves the closest adjacent target hex and returns `{ targetQ, targetR }` for a commander-local live highlight.
- Commander confirms with a **Lock Target** button.
- New hub method: `ResolveRaidTarget(double heading)`.
- Existing `ActivateCommandoRaid(int targetQ, int targetR)` remains the final confirm call.

### Locked: Tactical Strike (Commander)

- Tactical Strike becomes **hex-targeted**, not a general combat bonus.
- Uses the same point + confirm flow as Commando Raid.
- Commander must be within 1 hex of the target: either **inside the target hex** or **adjacent**.
- New hub method: `ResolveTacticalStrikeTarget(double heading)` for live resolution.
- `ActivateTacticalStrike` gains `int targetQ, int targetR` parameters.
- The strike bonus applies only when the Commander attacks that specific hex.

### Locked: Rally Point (Commander)

- Gesture: accelerometer pitch `>= 60°` upward, sustained for `2 seconds`.
- Player taps the card first, then raises the device to complete activation.
- Uses `DeviceMotionEvent` / pitch sensing, not compass heading.
- No new backend fields are required beyond the existing Rally Point state.

### Locked: Demolish (Engineer)

- Walk-entry tracking is replaced by: stand in an **adjacent hex** and face the fort for `5` continuous seconds.
- Progress requires completing this facing lock from **3 different adjacent positions**.
- `UpdateDemolishProgress` receives heading-derived state and applies the 5-second hold check per position.
- New `PlayerDto` field: `DemolishFacingLockStartAt` (`DateTime?`).
- Existing `DemolishApproachDirectionsMade` remains and continues to track which adjacent positions have been completed.

### Locked: Scout Intercept (Scout)

- Already fully specified in `docs/plans/2026-03-21-scout-intercept-ability.md`.
- Included verbatim in the appendix of this combined document.

---

## Shared architecture

### Core data model additions

The locked decisions imply the following model changes.

#### Definitely required

| Area | Field | Why |
|---|---|---|
| `PlayerDto` | `CurrentHeading: double?` | Shared heading channel for compass-based abilities |
| `PlayerDto` | `BeaconHeading: double?` | Beacon sector direction is frozen at activation |
| `PlayerDto` | `InterceptLockStartAt: DateTime?` | Existing intercept lock timer |
| `PlayerDto` | `InterceptTargetId: string?` | Existing intercept tracked engineer |
| `PlayerDto` | `SabotageAlertNearby: bool` | Existing scout-only ambient intercept alert |
| `PlayerDto` | `SabotageBlockedTiles: Dictionary<string, DateTime>` | Existing intercept penalty state |
| `PlayerDto` | `DemolishFacingLockStartAt: DateTime?` | Tracks current 5-second demolish facing hold |
| `GameDynamics` | `BeaconSectorAngle: int` | Configurable sector width |

#### Necessary refinements not explicitly listed above

These are not contradictions; they are extra fields needed to make the locked decisions work cleanly.

| Area | Field | Why |
|---|---|---|
| `PlayerDto` | `DemolishFacingHexKey: string?` | Prevents the same 5-second timer from carrying across adjacent positions |
| `PlayerDto` | `TacticalStrikeTargetQ: int?` | Makes Tactical Strike truly target-specific |
| `PlayerDto` | `TacticalStrikeTargetR: int?` | Same as above |

Without `DemolishFacingHexKey`, the backend cannot safely tell whether the
current hold timer belongs to the current adjacent position or a previous one.
Without `TacticalStrikeTargetQ/R`, the current `TacticalStrikeActive` boolean
remains a global buff instead of a targeted one.

### Heading propagation

`UpdatePlayerLocation` is the natural place to carry heading because the game already uses it as the per-player real-time position update path.

**New signature:**

```csharp
UpdatePlayerLocation(double lat, double lng, double? heading)
```

**Responsibilities:**

- persist `CurrentHeading`,
- continue updating `CurrentLat/Lng` and `CurrentHexQ/R`,
- keep `BeaconLat/Lng` in sync for active beacons,
- invalidate or reset any heading-driven locks that are no longer valid,
- compute scout-only ambient signals like `SabotageAlertNearby`.

### Bearing helpers

`HexService` should own shared bearing math so Beacon, Commando Raid, Tactical Strike, Demolish, and Intercept all use the same implementation and tolerance rules.

Required helpers:

- `BearingDegrees(lat1, lng1, lat2, lng2)`
- `HeadingDiff(a, b)`

### Sensor hooks

The frontend already contains `src/hooks/useCompassHeading.ts`, which covers most of the compass permission and heading smoothing logic.

Refinement for implementation:

- either **rename / evolve** `useCompassHeading.ts` into `useDeviceOrientation.ts`,
- or wrap it behind a new `useDeviceOrientation.ts` so the combined feature work does not duplicate permission handling.

A separate `useDeviceMotion.ts` hook should handle pitch detection for Rally Point.

### Privacy / hostile-view filtering

All heading- and intent-related fields must be treated like other hidden tactical state. Hostile viewers should not receive:

- `CurrentHeading`
- `BeaconHeading`
- `InterceptLockStartAt`
- `InterceptTargetId`
- `SabotageAlertNearby`
- `SabotageBlockedTiles`
- `DemolishFacingLockStartAt`
- `DemolishFacingHexKey`
- `TacticalStrikeTargetQ/R`

That means both `VisibilityBroadcastHelper.SanitizeHostilePlayer(...)` and `VisibilityService.SanitizeHostilePlayer(...)` must be updated.

### Desktop / automated playtesting support

Compass and motion APIs are unreliable or unavailable in desktop browsers, including automated browser sessions.

This spec therefore treats a **debug sensor panel** as part of the overall plan, not as an afterthought.

Recommended debug additions:

- extend `DebugLocationPanel` or add a sibling debug panel,
- manual heading slider for compass abilities,
- manual pitch slider / toggle for Rally Point,
- dev-only or debug-GPS-only visibility.

This is especially important for MCP-driven playtesting.

---

## Ability evaluations and refined rules

## Beacon evaluation (Scout)

### Beacon design intent

Beacon should reward physical presence and orientation, not remote planning.
The Scout should have to point the beacon cone deliberately, but should not
have to keep holding the phone in one direction forever once it is active.

### Beacon rules

1. Scout activates Beacon while standing in the world as normal.
2. Frontend captures the current heading once.
3. Backend stores:
   - `IsBeacon = true`
   - `BeaconLat` / `BeaconLng` from the player's current location
   - `BeaconHeading` from the activation heading
4. Beacon footprint becomes a **4-hex sector** centered on the Scout's **current position** using the **stored activation heading**.
5. While Beacon remains active, `BeaconLat` / `BeaconLng` continue to follow the Scout through `UpdatePlayerLocation`, but `BeaconHeading` remains frozen.
6. To repoint the cone, the Scout must deactivate and reactivate Beacon.

### Why this refinement is important

This resolves the ambiguity between:

- the **older addendum**, which made Beacon mobile, and
- the **new compass decision**, which freezes heading at activation.

The clean combined interpretation is:

> **mobile center, frozen direction**

That preserves physical movement while still making the compass choice meaningful.

### Sector resolution

- Range: 4 hexes.
- Width: `GameDynamics.BeaconSectorAngle`, default `45°`.
- Source position: the Scout's live `BeaconLat/Lng`.
- Source direction: `BeaconHeading` captured at activation.

### Visibility implication

Earlier visibility docs already state that hostile players should not receive the exact Beacon footprint. That doctrine should continue here:

- enemies may observe the Scout,
- enemies may know a reveal source exists if visibility rules allow it,
- enemies should **not** receive the exact sector angle or the exact hidden reveal polygon.

### Beacon backend surface

- `Models/GameState.cs`
  - add `BeaconHeading`
  - add `BeaconSectorAngle` in `GameDynamics`
- `Services/AbilityService.cs`
  - change `ActivateBeacon(string roomCode, string userId)` to accept `heading`
  - store `BeaconHeading`
- `Services/GameplayService.cs`
  - keep updating `BeaconLat/Lng` while `IsBeacon`
- visibility services
  - change reveal footprint computation from radius/circle logic to sector logic
- `Services/GameStateCommon.cs`
  - copy the new fields in snapshotting

### Beacon frontend surface

- replace or wrap `useCompassHeading` with `useDeviceOrientation`
- `useGameActionsAbilities.ts`
  - `handleActivateBeacon(heading)`
- HUD / ability card UI
  - show live heading before activation
  - explain that reactivation is required to rotate the cone
- map rendering
  - allied Beacon footprint should render as a wedge/sector rather than a circle

---

## Commando Raid evaluation (Commander)

### Commando Raid design intent

Commando Raid should feel like a real-world directed assault: the Commander stands next to the objective, physically points at it, and commits the team.

### Commando Raid rules

1. Commander opens Commando Raid targeting mode.
2. Frontend polls heading while the card is open.
3. Backend `ResolveRaidTarget(double heading)`:
   - derives the Commander's current hex,
   - evaluates the 6 adjacent hexes,
   - resolves the adjacent hex whose center bearing is closest to the current heading,
   - returns `{ targetQ, targetR }` when the heading is close enough,
   - otherwise returns `null`.
4. Frontend shows a commander-local live highlight only.
5. Commander presses **Lock Target**.
6. Frontend calls existing `ActivateCommandoRaid(targetQ, targetR)`.
7. Once confirmed, the existing active-raid room broadcast behavior continues unchanged.

### Recommended angular rule

Because adjacent hex directions are naturally spaced at 60°, the cleanest resolution rule is:

- pick the closest adjacent hex,
- require heading difference `<= 30°`,
- return `null` if all candidate bearings are further away.

This avoids jittery "why did it target the wrong hex?" behavior.

### Range and eligibility

- Commander must be adjacent: `HexDistance == 1`.
- Existing Commando Raid target rules still apply after resolution:
  - valid target hex,
  - cooldown rules,
  - one active raid per alliance,
  - HQ raid density gate.

### Why this is a good fit for the current codebase

The current implementation already separates:

- **activation** (`ActivateCommandoRaid`) from
- **raid resolution at deadline** (`ResolveExpiredCommandoRaids`).

This new design only changes **how the target is chosen**, not how the raid itself resolves once started.

### Commando Raid backend surface

- `Hubs/GameHub.Gameplay.cs`
  - add `ResolveRaidTarget(double heading)`
- `Services/GameService.cs`
  - forward the new resolver
- `Services/AbilityService.cs`
  - implement resolver
  - keep `ActivateCommandoRaid(targetQ, targetR)` as final confirm
- `Services/HexService.cs`
  - bearing helpers used for adjacent hex resolution

### Commando Raid frontend surface

- `useDeviceOrientation`
- `useGameActionsAbilities.ts`
  - add `resolveRaidTarget(heading)`
- Commander Commando Raid card / HUD flow
  - live local highlight
  - lock button
- `useGameActionsGameplay.ts`
  - remove map-tap targeting path for Commando Raid

---

## Tactical Strike evaluation (Commander)

### Tactical Strike design intent

Tactical Strike should become a directed front-line leadership tool instead of a generic timed power-up.

### Tactical Strike rules

1. Commander opens Tactical Strike targeting mode.
2. Frontend polls heading and calls `ResolveTacticalStrikeTarget(double heading)`.
3. Backend resolves a target among valid hexes within distance 1.
4. Commander confirms.
5. Backend stores:
   - `TacticalStrikeActive = true`
   - `TacticalStrikeExpiry = now + duration`
   - `TacticalStrikeCooldownUntil = now + cooldown`
   - `TacticalStrikeTargetQ/R = chosen target`
6. Tactical Strike bonus applies **only** when the Commander attacks that exact target hex.
7. On a qualifying attack, consume the strike.
8. If unused by expiry, clear active state and target.

### Critical implementation refinement

The locked decision says Tactical Strike can target a hex that is either:

- the **current hex**, or
- an **adjacent hex**.

Heading alone cannot express **the hex the player is currently standing in**.

So the combined spec adds one small UX rule:

> Tactical Strike targeting must support a secondary **Use Current Hex** action whenever the current hex is a valid target.

That preserves the point + confirm pattern for adjacent targets without making current-hex targeting impossible.

### Combat integration

Current combat calculation treats `TacticalStrikeActive` as a broad bonus. That must change.

A Tactical Strike bonus is active only when all of the following are true:

- `player.TacticalStrikeActive == true`
- `player.TacticalStrikeTargetQ == q`
- `player.TacticalStrikeTargetR == r`
- Commander is the attacker for that combat

### Duration model

Unless explicitly changed later, keep the existing Tactical Strike timing semantics:

- still time-limited,
- still cooldown-limited,
- but now scoped to a target hex.

### Tactical Strike backend surface

- `Models/GameState.cs`
  - add `TacticalStrikeTargetQ/R`
- `Services/AbilityService.cs`
  - add `ResolveTacticalStrikeTarget(double heading)`
  - change `ActivateTacticalStrike(...)` signature to accept target coordinates
- `Services/GameplayService.cs`
  - update combat bonus calculation to require target match
  - clear target fields on use or expiry
- `Services/GameStateCommon.cs`
  - snapshot target fields
- visibility services
  - strip target fields from hostile views

### Tactical Strike frontend surface

- `useDeviceOrientation`
- Tactical Strike card
  - live highlight
  - lock button
  - **Use Current Hex** button when applicable
- `useGameActionsAbilities.ts`
  - `resolveTacticalStrikeTarget(heading)`
  - `handleActivateTacticalStrike(targetQ, targetR)`
- `useGameActionsGameplay.ts`
  - remove any old generic activation-only path

---

## Rally Point evaluation (Commander)

### Rally Point design intent

Rally Point should feel like a physical call-to-arms: the Commander raises the device like a signal flare, then the backend starts the existing rally objective.

### Rally Point rules

1. Commander opens Rally Point card.
2. Frontend requests motion permission when required.
3. Frontend watches pitch.
4. When pitch is `>= 60°` upward for 2 continuous seconds, activation completes locally.
5. Frontend then invokes the existing backend activation.
6. Backend Rally Point behavior stays otherwise unchanged.

### Evaluation

This is the cleanest of the compass-enhanced scenarios because it is almost entirely a **frontend gesture gate**. The existing backend Rally Point state already models:

- active/inactive,
- deadline,
- cooldown,
- rally hex.

So the core logic does not need a structural redesign.

### Naming cleanup refinement

The current backend/hub method is still named `ActivateReinforce`, even though the feature is already Rally Point in gameplay language.

Recommended cleanup:

- rename hub/service method to `ActivateRallyPoint`,
- keep `ActivateReinforce` as a temporary alias only if needed for compatibility.

### Rally Point frontend surface

- new `hooks/useDeviceMotion.ts`
- Rally Point card with local 2-second progress feedback
- iOS permission UI for `DeviceMotionEvent.requestPermission()`
- optional debug pitch controls for desktop testing

### Rally Point backend surface

- optionally rename `ActivateReinforce` to `ActivateRallyPoint`
- otherwise no model changes required

---

## Demolish evaluation (Engineer)

### Demolish design intent

Demolish should become a deliberate breach action: the Engineer positions outside the fort, aims at it, holds the angle, then repositions and repeats from other sides.

### Demolish rules

1. Engineer starts a demolish mission on a specific hostile fort.
2. Target fort remains stored in `DemolishTargetKey`.
3. While the mission is active, each `UpdatePlayerLocation(..., heading)` evaluates progress.
4. A demolish step counts when all of the following are true continuously for 5 seconds:
   - Engineer is in a hex adjacent to the target fort,
   - that adjacent hex has not already been completed,
   - Engineer is facing the fort within tolerance,
   - target is still a hostile fort.
5. On successful hold completion:
   - add that adjacent hex key to `DemolishApproachDirectionsMade`
   - reset current hold tracking
6. After 3 distinct completed adjacent positions:
   - set `targetCell.IsFort = false`
   - apply cooldown
   - clear demolish state

### Target acquisition refinement

Unlike Commando Raid and Tactical Strike, Demolish does **not** need heading-based target selection.

Recommended approach:

- keep explicit target selection via the selected fort / active selected hex / card context,
- use heading only for **progress validation**, not for **choosing which fort** is being targeted.

This avoids needless ambiguity when multiple forts or structures are nearby.

### Necessary extra field

The locked decision lists `DemolishFacingLockStartAt`, but one more transient field is needed for correctness:

- `DemolishFacingHexKey`

This ensures a 4.8-second lock from one adjacent side does not accidentally become a 5.0-second completion on a different adjacent side after the Engineer steps over.

### Recommended tolerance

Use the same scout-facing tolerance family as Intercept for consistency:

- `HeadingDiff(engineerHeading, bearing(engineer -> fortCenter)) <= 20°`

### Counter-play refinement

The previous demolish model included a rule that the entry hex must have no enemy player present.

Recommended decision for the combined spec:

- **drop that old rule by default**.

Reason:

- the new 5-second exposed facing hold already creates vulnerability,
- keeping both restrictions may over-constrain the Engineer,
- the rule can be reintroduced later if demolish proves too safe in playtests.

### Demolish backend surface

- `Models/GameState.cs`
  - add `DemolishFacingLockStartAt`
  - add `DemolishFacingHexKey`
- `Services/GameplayService.cs`
  - update `UpdatePlayerLocation` to consume heading
  - replace current demolish entry logic in `UpdateDemolishProgress`
- `Services/GameStateCommon.cs`
  - snapshot the new demolish lock fields
- visibility services
  - sanitize the new demolish lock fields for hostile viewers

### Demolish frontend surface

- `useDeviceOrientation`
- Demolish card / HUD
  - show current hold progress for the active side
  - still show overall completed approaches out of 3
- map overlays
  - keep existing total progress ring semantics, but add live hold feedback in the card

---

## Scout Intercept evaluation (Scout)

Scout Intercept is already fully specified and remains unchanged by the other compass scenarios.

The only combined-spec note is that it shares the same heading infrastructure and therefore benefits from the same:

- `CurrentHeading` propagation,
- bearing helpers,
- sensor permissions,
- debug heading tooling,
- hostile-state sanitization.

Its full verbatim text is included in the appendix below.

---

## Cross-cutting frontend plan

### Frontend files likely to change

- `frontend/landgrab-ui/src/types/game.ts`
- `frontend/landgrab-ui/src/hooks/useCompassHeading.ts` or new `useDeviceOrientation.ts`
- new `frontend/landgrab-ui/src/hooks/useDeviceMotion.ts`
- `frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts`
- `frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts`
- `frontend/landgrab-ui/src/components/game/PlayerHUD.tsx`
- `frontend/landgrab-ui/src/components/game/PlayingHud.tsx`
- `frontend/landgrab-ui/src/components/game/AbilityInfoSheet.tsx`
- `frontend/landgrab-ui/src/components/lobby/roleModalUtils.ts`
- ability cards for Beacon / Commando Raid / Tactical Strike / Rally Point / Demolish / Intercept
- `frontend/landgrab-ui/src/components/game/DebugLocationPanel.tsx` or a sibling debug sensor panel
- `frontend/landgrab-ui/src/i18n/en.ts`
- `frontend/landgrab-ui/src/i18n/nl.ts`

### Frontend interaction model

- **Compass-driven abilities**
  - live heading readout
  - clear permission prompt when needed
  - clear fallback text when sensor unavailable
  - optional debug override on desktop
- **Live resolver abilities**
  - Commando Raid
  - Tactical Strike
- **Hold-lock abilities**
  - Demolish
  - Intercept
- **Motion-gesture ability**
  - Rally Point

---

## Cross-cutting backend plan

### Backend files likely to change

- `backend/Landgrab.Api/Models/GameState.cs`
- `backend/Landgrab.Api/Services/HexService.cs`
- `backend/Landgrab.Api/Services/GameplayService.cs`
- `backend/Landgrab.Api/Services/AbilityService.cs`
- `backend/Landgrab.Api/Services/GameService.cs`
- `backend/Landgrab.Api/Services/GameStateCommon.cs`
- `backend/Landgrab.Api/Services/VisibilityBroadcastHelper.cs`
- `backend/Landgrab.Api/Services/VisibilityService.cs`
- `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`

### New backend methods implied by this spec

- `ResolveRaidTarget(roomCode, userId, heading)`
- `ResolveTacticalStrikeTarget(roomCode, userId, heading)`
- `AttemptIntercept(roomCode, userId, heading)`

### Existing backend methods with signature changes

- `UpdatePlayerLocation(roomCode, userId, lat, lng, heading?)`
- `ActivateBeacon(roomCode, userId, heading)`
- `ActivateTacticalStrike(roomCode, userId, targetQ, targetR)`

### Existing backend methods with logic changes only

- `UpdateDemolishProgress(...)`
- `ActivateSabotage(...)` for intercept-block checks
- combat bonus calculation in `GameplayService` for targeted Tactical Strike

---

## Recommended implementation order

1. **Shared heading plumbing**
   - `CurrentHeading`
   - `UpdatePlayerLocation(..., heading?)`
   - `HexService` bearing helpers
   - snapshot / sanitize updates
2. **Sensor hooks + debug panel**
   - `useDeviceOrientation`
   - `useDeviceMotion`
   - desktop debug controls
3. **Beacon sector**
   - `BeaconHeading`
   - `BeaconSectorAngle`
   - sector reveal calculation
4. **Commander pointing flows**
   - Commando Raid resolver + UI
   - Tactical Strike resolver + target storage + current-hex UX
5. **Rally Point motion gate**
6. **Demolish facing-lock rewrite**
7. **Scout Intercept integration**
   - easiest to land after shared heading infrastructure and demolish lock patterns exist
8. **Playtesting + tuning**
   - tolerance tuning
   - debug tooling validation
   - iOS permission UX validation

---

## Open questions resolved by this combined spec

| Question | Resolution |
|---|---|
| Does Beacon stay mobile or become fixed? | **Mobile center, frozen heading** |
| Can heading alone support Tactical Strike on the current hex? | **No; add a Use Current Hex action** |
| Should Demolish use heading to choose a fort target? | **No; keep explicit target selection, use heading only for progress** |
| Is debug sensor tooling optional? | **No; treat it as required for desktop and automated playtesting** |

---

## Appendix — Scout Intercept spec (verbatim)

<!-- markdownlint-disable MD013 MD024 MD025 MD040 -->

The following section is reproduced verbatim from `docs/plans/2026-03-21-scout-intercept-ability.md`.

---

# Scout Intercept Ability — Feature Design

**Date:** 2026-03-21
**Status:** Design / pre-implementation
**Branch:** feature/physical-presence-mechanics

---

## Overview

A new active ability for the **Scout** role. The Scout can physically move close to an actively-sabotaging Engineer, point their device at them for 5 uninterrupted seconds, and interrupt the sabotage. The Engineer is penalised with a 5-minute block on re-sabotaging that specific tile.

The ability is designed around stealth — the Scout must remain undetected. If the Engineer turns to face the Scout during the 5-second window, the lock breaks and must restart.

> **Narrative:** *"I crept up behind their Engineer while they were circling the tile. Held my compass on them for five seconds without them noticing. Mission disrupted."*

---

## Ability Summary

| Property | Value |
|---|---|
| Role | Scout (active) |
| Ability key | `intercept` |
| Range | Same hex (~25m, default `TileSizeMeters`) |
| Lock duration | 5 continuous seconds |
| Penalty on success | Engineer loses active sabotage + 5-min block on that tile |
| Penalty on failure | None — lock resets to 0, scout can retry |
| Cooldown | None (each attempt requires re-locking from scratch) |

---

## Ambient Alert — Phase 1

Before the Scout is in range to intercept, a softer signal warns them that a saboteur is nearby.

When any enemy player has an active sabotage target within 3 hexes of the Scout's current position, `SabotageAlertNearby` is computed server-side during `UpdatePlayerLocation` and the Scout's HUD shows a pulsing indicator:

> *"🔍 Suspicious activity detected nearby"*

**Alert range:** 3 hexes (~75m). Deliberately wider than intercept range — the Scout gets the signal before they are close enough to act, giving them time to navigate to the target.

**Visibility:** Only shown to the Scout themselves. Not revealed to enemies. No enemy position is disclosed — only that *something* is happening nearby.

---

## Active Intercept — Phase 2

### Activation

The Scout taps the alert or opens the `InterceptCard` from the HUD. The frontend begins reading `DeviceOrientationEvent` to get the device's absolute compass heading (0–360°, north = 0).

The Scout physically moves to the same hex as the Engineer and physically turns to face them.

### Server-side polling

The frontend calls `AttemptIntercept(double scoutHeading)` approximately every 500ms while the card is open. The backend evaluates three simultaneous conditions on each call:

| # | Condition | Rule |
|---|---|---|
| 1 | **Same hex** | `scout.CurrentHexQ == engineer.CurrentHexQ && scout.CurrentHexR == engineer.CurrentHexR` |
| 2 | **Scout facing engineer** | `‖normalise(scoutHeading − bearing(scout→engineer))‖ ≤ 20°` |
| 3 | **Engineer NOT facing scout** | `‖normalise(engineerHeading − bearing(engineer→scout))‖ > 90°` (engineer's back is turned) |

If all three pass → increment the lock timer from `InterceptLockStartAt`. If any fail → reset `InterceptLockStartAt` to null.

**Angular tolerance:** ±20° for the Scout (accounts for phone compass drift). >90° dead-zone for the Engineer (requires their back to be genuinely turned, not just side-on).

### Lock completion

After 5 continuous seconds with all three conditions satisfied:

1. Engineer's `SabotageTargetQ/R` cleared, `SabotagePerimeterVisited` cleared
2. `engineer.SabotageBlockedTiles["q,r"] = UtcNow + 5 minutes` — per-tile block (keyed `"q,r"` matching the rest of the grid)
3. Event log entry broadcast to room: `SabotageIntercepted`
4. Scout's `InterceptLockStartAt` and `InterceptTargetId` cleared

---

## Bearing Logic

### BearingDegrees — new `HexService` static helper

```csharp
/// <summary>Returns bearing in degrees 0–360 (north = 0, clockwise).</summary>
public static double BearingDegrees(double lat1, double lng1, double lat2, double lng2)
{
    var φ1 = lat1 * Math.PI / 180;
    var φ2 = lat2 * Math.PI / 180;
    var Δλ = (lng2 - lng1) * Math.PI / 180;
    var y = Math.Sin(Δλ) * Math.Cos(φ2);
    var x = Math.Cos(φ1) * Math.Sin(φ2) - Math.Sin(φ1) * Math.Cos(φ2) * Math.Cos(Δλ);
    return (Math.Atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/// <summary>Returns the absolute angular difference between two headings, normalised to 0–180°.</summary>
private static double HeadingDiff(double a, double b)
{
    var diff = Math.Abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
}
```text

### Range check

Range is expressed in hex coordinates for consistency with the rest of the engine:

```csharp
// Same hex = HexDistance of 0
var inRange = scout.CurrentHexQ == engineer.CurrentHexQ
           && scout.CurrentHexR == engineer.CurrentHexR;
```

The ambient alert uses a 3-hex distance check against the *sabotage target hex* (not the engineer's current position) so the Scout gets a heads-up whenever active sabotage is happening nearby, regardless of where the Engineer is currently walking.

---

## Sabotage Per-Tile Block

A new field on `PlayerDto`:

```csharp
// Keyed "q,r" — matches the grid key format used everywhere else
public Dictionary<string, DateTime> SabotageBlockedTiles { get; set; } = new();
```

`ActivateSabotage` acquires an additional guard:

```csharp
var key = HexService.Key(currentCell.Q, currentCell.R);
if (player.SabotageBlockedTiles.TryGetValue(key, out var blockedUntil)
    && blockedUntil > DateTime.UtcNow)
{
    var remaining = Math.Ceiling((blockedUntil - DateTime.UtcNow).TotalMinutes);
    return (null, $"You were intercepted here recently. Try again in {remaining} min.");
}
```

Expired entries do not need active cleanup — the guard simply ignores them.

---

## New `PlayerDto` Fields

```csharp
// --- All players ---

/// <summary>Device compass heading (degrees 0-360, north = 0). Null if DeviceOrientationEvent unavailable.</summary>
public double? CurrentHeading { get; set; }

// --- Scout ---

/// <summary>When the 5-second intercept lock started. Reset to null if any condition breaks.</summary>
public DateTime? InterceptLockStartAt { get; set; }

/// <summary>Id of the engineer the scout is currently locking onto.</summary>
public string? InterceptTargetId { get; set; }

/// <summary>Computed on UpdatePlayerLocation: true if any active sabotage target is within 3 hexes.
/// Stripped from hostile views — enemies never see this.</summary>
public bool SabotageAlertNearby { get; set; }

// --- Engineer ---

/// <summary>Per-tile intercept penalty. Key = "q,r". Value = blocked until this UTC time.</summary>
public Dictionary<string, DateTime> SabotageBlockedTiles { get; set; } = new();
```

All five additions are stripped in `SanitizeHostilePlayer` in both `VisibilityBroadcastHelper` and `VisibilityService` — enemies never receive these values.

---

## Full Backend Change Surface

| File | Change |
|---|---|
| `Models/GameState.cs` → `PlayerDto` | Add 5 new fields listed above |
| `Services/HexService.cs` | Add `BearingDegrees(lat1, lng1, lat2, lng2)` and `HeadingDiff(a, b)` static helpers |
| `Services/GameplayService.cs` → `UpdatePlayerLocation` | Accept `double? heading`; persist to `player.CurrentHeading`; compute `SabotageAlertNearby` for scouts (3-hex range to any active sabotage target in `state.Players`); expire stale `InterceptLockStartAt` if the tracked engineer has left the scout's hex |
| `Services/AbilityService.cs` | New `AttemptIntercept(roomCode, scoutId, heading)` — three-condition check, 5-sec lock tracking, trigger on completion |
| `Services/AbilityService.cs` → `ActivateSabotage` | Guard: reject if `SabotageBlockedTiles["q,r"] > UtcNow` |
| `Services/GameStateCommon.cs` → `SnapshotState` | Copy all five new `PlayerDto` fields including `SabotageBlockedTiles` dictionary |
| `Services/GameService.cs` | Forward `AttemptIntercept` to `AbilityService` |
| `Services/VisibilityBroadcastHelper.cs` | Strip new fields in `SanitizeHostilePlayer` |
| `Services/VisibilityService.cs` | Strip new fields in `SanitizeHostilePlayer` |
| `Hubs/GameHub.Gameplay.cs` | Extend `UpdatePlayerLocation(lat, lng, heading?)` signature; add `AttemptIntercept(double heading)` hub method |
| Event log types | `SabotageIntercepted` (broadcast to room), optionally `SabotageInterceptFailed` |

---

## Full Frontend Change Surface

| File | Change |
|---|---|
| New `hooks/useDeviceOrientation.ts` | `DeviceOrientationEvent` watcher; iOS `requestPermission()` gate on first use; returns `{ heading: number \| null, permissionState: 'granted' \| 'denied' \| 'prompt' }` |
| Existing location/SignalR wiring | Pass `heading` alongside `lat/lng` in the `UpdatePlayerLocation` invoke; expose `attemptIntercept(heading)` action |
| New `components/game/abilities/InterceptCard.tsx` | Scout-accent border; compass heading readout; circular 5s progress arc (resets on `status: "broken"` response); iOS permission prompt if heading is null |
| `components/game/PlayingHud.tsx` | Ambient pulse badge when `myPlayer.sabotageAlertNearby === true`; wire `InterceptCard` for Scout role alongside existing cards |
| `components/lobby/roleModalUtils.ts` | Add `{ key: 'intercept', icon: 'binoculars', type: 'active' }` to Scout `ROLE_ABILITIES` |
| `components/game/AbilityInfoSheet.tsx` | Add `intercept: { icon: 'binoculars', type: 'active' }` to Scout entry |
| `i18n/en.ts` | Add `roles.Scout.abilities.intercept.*` keys (see below) |
| `i18n/nl.ts` | Dutch translations for same keys |

### i18n keys (`en.ts`)

```ts
// Under roles.Scout.abilities:
intercept: {
  title: 'Intercept',
  description:
    'Stand in the same hex as an actively-sabotaging enemy and keep your compass pointed at their back for 5 uninterrupted seconds to disrupt their sabotage.',
  shortDesc: 'Expose a nearby saboteur',
  locking: 'Locking on… {{seconds}}s',
  lockBroken: 'Lock broken — they turned around',
  success: 'Intercept complete! Sabotage disrupted.',
  alertNearby: 'Suspicious activity detected nearby',
  noTarget: 'No active sabotage detected in range',
  blockedFeedback: 'Sabotage blocked on this tile for {{minutes}} min',
},
```

---

## UX Scenario Walkthrough

```
[Engineer activates Sabotage on enemy hex (3,-1)]
  → Event log broadcast: "Alice is sabotaging (3,-1)! Defend it!"
  → Engineer begins walking the perimeter hexes

[Scout moves nearby — active sabotage target within 3 hexes]
  → SabotageAlertNearby = true (server-computed, scout's view only)
  → Scout's HUD: pulsing badge "🔍 Suspicious activity detected nearby"

[Scout approaches and enters the same hex as the Engineer]
  → Scout opens InterceptCard
  → Frontend starts calling AttemptIntercept(heading) every 500ms
  → Compass heading shown live on card

[Scout physically turns to face the engineer's back]
  ✓ Same hex
  ✓ Scout heading within ±20° of bearing(scout→engineer)
  ✓ Engineer heading >90° away from bearing(engineer→scout)
  → Progress arc starts: 1s…

[At 3.2s — Engineer glances over shoulder]
  ✗ Condition 3 fails: engineer is now facing the scout
  → Card shows: "Lock broken — they turned around"
  → Arc resets to 0

[Engineer turns back to face the sabotage target]
  → All three conditions pass again
  → Arc restarts from 0

[5 continuous seconds achieved]
  → Card shows: "Intercept complete! Sabotage disrupted."
  → Engineer: SabotageTargetQ/R and SabotagePerimeterVisited cleared
  → Engineer: SabotageBlockedTiles["3,-1"] = now + 5 min
  → Room event log: "Bob (Scout) intercepted an engineer near hex (3,-1)!"
  → Engineer HUD: "Your sabotage was intercepted. Blocked on this tile for 5 minutes."
```

---

## Open Questions

1. **Should the ambient alert reveal the *direction* of the sabotage, or only its existence?**
   A directional arrow on the HUD would help scouts navigate — but also short-circuits too much of the physical search. Current proposal: existence only, no direction.

2. **Should there be an intercept cooldown per scout?**
   Current proposal: none. The 5-second unbroken lock and same-hex requirement are already sufficient friction. Adding a cooldown penalises scouts who tried and failed through no fault of their own (noisy compass, engineer coincidentally turned).

3. **Engineer counter-play — active warning?**
   The engineer could receive a subtle signal ("you feel watched") if a scout has been in the same hex for >2s without completing the lock. Adds tension but tips off the engineer more than the stealth mechanic intends. Deferred — revisit after playtesting.

4. **Debug / playtesting mode?**
   `DeviceOrientationEvent` is unavailable in desktop browsers. A debug intercept panel (similar to `DebugLocationPanel`) with a manual heading slider would be needed for automated playtesting via the MCP server.

<!-- markdownlint-enable MD013 MD024 MD025 MD040 -->
