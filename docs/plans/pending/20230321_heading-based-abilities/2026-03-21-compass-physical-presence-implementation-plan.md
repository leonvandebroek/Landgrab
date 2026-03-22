# Compass-Enhanced Physical Presence Abilities — Implementation Plan

**Date:** 2026-03-21
**Spec:** `docs/plans/2026-03-21-compass-physical-presence-abilities.md`
**Branch:** `feature/physical-presence-mechanics`

---

## Summary

This plan implements compass and motion-sensor-enhanced abilities across both backend and frontend. The work is organized into **7 phases** with careful attention to dependencies. Phase 1 (shared infrastructure) must land first because every subsequent phase depends on heading propagation, bearing math, and sensor hooks. After that, Phases 2–6 can be partially parallelized: Beacon (Phase 2) and Rally Point (Phase 5) have no mutual dependency; Commando Raid (Phase 3) and Tactical Strike (Phase 4) share the same pointing pattern and should be done together; Demolish (Phase 6) is independent once heading plumbing exists; Scout Intercept (Phase 7) benefits from all prior shared work.

---

## Phase 1: Shared Heading Infrastructure

**Goal:** Establish the heading data channel end-to-end — from device sensor → frontend → SignalR → backend model → snapshot → sanitization — and add the bearing math utilities all abilities will share.

### Step 1.1 — Backend: `PlayerDto` model additions

**What:** Add new fields to `PlayerDto` in `GameState.cs` that are required across **all** compass abilities. This is the foundation every later step writes or reads from.

| New field | Type | Purpose |
|---|---|---|
| `CurrentHeading` | `double?` | Shared heading channel |
| `BeaconHeading` | `double?` | Frozen beacon direction |
| `DemolishFacingLockStartAt` | `DateTime?` | 5s demolish hold timer |
| `DemolishFacingHexKey` | `string?` | Which adjacent hex the current hold belongs to |
| `TacticalStrikeTargetQ` | `int?` | Targeted hex for directed Tactical Strike |
| `TacticalStrikeTargetR` | `int?` | Same |
| `InterceptLockStartAt` | `DateTime?` | 5s intercept lock timer |
| `InterceptTargetId` | `string?` | Tracked engineer for intercept |
| `SabotageAlertNearby` | `bool` | Scout-only ambient alert |
| `SabotageBlockedTiles` | `Dictionary<string, DateTime>` | Per-tile intercept penalty |

**Files modified:** [backend/Landgrab.Api/Models/GameState.cs](backend/Landgrab.Api/Models/GameState.cs)

**Also add to `GameDynamics`:**
| New field | Type | Default | Purpose |
|---|---|---|---|
| `BeaconSectorAngle` | `int` | `45` | Configurable sector width in degrees |

**Dependencies:** None — this is the first step.
**Agent:** Expert .NET

### Step 1.2 — Backend: `GameStateCommon.SnapshotState` update

**What:** Include all new `PlayerDto` fields in the snapshot copy constructor so state replication and persistence don't lose them.

**Files modified:** [backend/Landgrab.Api/Services/GameStateCommon.cs](backend/Landgrab.Api/Services/GameStateCommon.cs)

**Dependencies:** Step 1.1
**Agent:** Expert .NET

### Step 1.3 — Backend: `ClonePlayer` + `SanitizeHostilePlayer` in both visibility services

**What:** Update `ClonePlayer` and `SanitizeHostilePlayer` in both `VisibilityBroadcastHelper.cs` and `VisibilityService.cs` to:
- **Clone** the new fields (including deep-copying `SabotageBlockedTiles`).
- **Sanitize**: strip `CurrentHeading`, `BeaconHeading`, `InterceptLockStartAt`, `InterceptTargetId`, `SabotageAlertNearby`, `SabotageBlockedTiles`, `DemolishFacingLockStartAt`, `DemolishFacingHexKey`, `TacticalStrikeTargetQ/R` from hostile player views. Enemies must never receive these.

**Files modified:**
- [backend/Landgrab.Api/Services/VisibilityBroadcastHelper.cs](backend/Landgrab.Api/Services/VisibilityBroadcastHelper.cs)
- [backend/Landgrab.Api/Services/VisibilityService.cs](backend/Landgrab.Api/Services/VisibilityService.cs)

**Dependencies:** Step 1.1
**Agent:** Expert .NET

### Step 1.4 — Backend: `HexService` bearing helpers

**What:** Add two new static methods to `HexService`:
- `BearingDegrees(double lat1, double lng1, double lat2, double lng2)` — returns 0–360° bearing (north=0, clockwise).
- `HeadingDiff(double a, double b)` — returns absolute angular difference 0–180°.

These will be used by Beacon sector computation, Commando Raid/Tactical Strike adjacent hex resolution, Demolish facing validation, and Scout Intercept facing checks.

**Files modified:** [backend/Landgrab.Api/Services/HexService.cs](backend/Landgrab.Api/Services/HexService.cs)

**Dependencies:** None
**Agent:** Expert .NET

### Step 1.5 — Backend: `UpdatePlayerLocation` gains `heading` parameter

**What:** Thread an optional `double? heading` parameter through the entire location update pipeline:
1. `GameHub.Gameplay.cs` → `UpdatePlayerLocation(double lat, double lng, double? heading)` (hub method signature change — the old 2-parameter call still works since heading is nullable/optional)
2. `GameService.UpdatePlayerLocation` → pass heading through
3. `GameplayService.UpdatePlayerLocation` → persist `player.CurrentHeading = heading`; keep `BeaconLat/Lng` sync logic; keep existing `UpdateFortConstructionProgress`, `UpdateSabotageProgress`, `UpdateDemolishProgress` calls (demolish will be rewritten in Phase 6)

**Files modified:**
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs) (line ~276)
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs) (facade)
- [backend/Landgrab.Api/Services/GameplayService.cs](backend/Landgrab.Api/Services/GameplayService.cs) (signature + `CurrentHeading` persist)

**Dependencies:** Steps 1.1, 1.4
**Agent:** Expert .NET

### Step 1.6 — Frontend: `useDeviceOrientation` hook

**What:** Create a new `useDeviceOrientation.ts` hook that **wraps** the existing `useCompassHeading.ts` functionality. The existing hook already handles:
- `DeviceOrientationEvent` listening
- iOS `requestPermission()` gate
- `webkitCompassHeading` / alpha fallback
- EMA smoothing (0.7/0.3)
- Visibility-change pausing

The new hook should re-export the same interface (`heading`, `supported`, `permissionState`, `requestPermission`) but be the canonical import for ability code. The existing `useCompassHeading` can remain for map rotation in `GameMap.tsx` or be refactored to delegate to the new hook.

**Files created:** `frontend/landgrab-ui/src/hooks/useDeviceOrientation.ts`
**Files potentially modified:** `frontend/landgrab-ui/src/hooks/useCompassHeading.ts` (if refactored to share internals)

**Dependencies:** None
**Agent:** Expert React Frontend Engineer

### Step 1.7 — Frontend: `useDeviceMotion` hook (for Rally Point)

**What:** Create a new `useDeviceMotion.ts` hook that:
- Listens to `DeviceMotionEvent` for accelerometer data
- Gates on iOS `DeviceMotionEvent.requestPermission()` when present
- Derives device pitch from acceleration values (using `accelerationIncludingGravity`)
- Returns `{ pitch: number | null, supported: boolean, permissionState, requestPermission }`
- Handles visibility-change pause/resume

**Files created:** `frontend/landgrab-ui/src/hooks/useDeviceMotion.ts`

**Dependencies:** None
**Agent:** Expert React Frontend Engineer

### Step 1.8 — Frontend: Pass heading in `UpdatePlayerLocation` invoke

**What:** Modify the location broadcast in `useGameActionsGameplay.ts` (line ~145) to include heading as a third argument when available. The current call is:
```ts
invoke('UpdatePlayerLocation', pendingLocation.lat, pendingLocation.lng)
```
This needs to become:
```ts
invoke('UpdatePlayerLocation', pendingLocation.lat, pendingLocation.lng, heading ?? null)
```
The heading value should come from the `useDeviceOrientation` hook (or from debug overrides). This means the heading must be threaded into `useGameActionsGameplay` either via options or from a store the hook can read.

**Files modified:** [frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts](frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts)
**Files potentially modified:** Components that wire `useGameActionsGameplay` (e.g., `GameView.tsx`, `App.tsx`) to pass heading through

**Dependencies:** Steps 1.5, 1.6
**Agent:** Expert React Frontend Engineer

### Step 1.9 — Frontend: `Player` type additions

**What:** Add new optional fields to the `Player` interface in `types/game.ts` to match backend `PlayerDto` additions:
- `currentHeading?: number | null`
- `beaconHeading?: number | null`
- `demolishFacingLockStartAt?: string | null`
- `demolishFacingHexKey?: string | null`
- `tacticalStrikeTargetQ?: number | null`
- `tacticalStrikeTargetR?: number | null`
- `interceptLockStartAt?: string | null`
- `interceptTargetId?: string | null`
- `sabotageAlertNearby?: boolean`
- `sabotageBlockedTiles?: Record<string, string>`

Add `beaconSectorAngle?: number` to `GameDynamics`.

**Files modified:** [frontend/landgrab-ui/src/types/game.ts](frontend/landgrab-ui/src/types/game.ts)

**Dependencies:** Step 1.1 (must match backend)
**Agent:** Expert React Frontend Engineer

### Step 1.10 — Frontend: Debug sensor panel

**What:** Create a `DebugSensorPanel` component (sibling to `DebugLocationPanel`) that provides:
- Manual heading slider (0–360°) for compass abilities
- Manual pitch slider / toggle for Rally Point
- Visible only in debug-GPS mode (reuse existing `isDebugMode` gating)
- Override heading/pitch values consumed by `useDeviceOrientation` and `useDeviceMotion`

This is **critical** for desktop testing and MCP-driven automated playtesting.

**Files created:** `frontend/landgrab-ui/src/components/game/DebugSensorPanel.tsx`
**Files modified:** `frontend/landgrab-ui/src/App.tsx` (wire the panel)

**Dependencies:** Steps 1.6, 1.7
**Agent:** Expert React Frontend Engineer

### Step 1.11 — Backend: Unit tests for bearing helpers

**What:** Add unit tests for `BearingDegrees` and `HeadingDiff` in `HexService` covering:
- Cardinal directions (N/S/E/W)
- Wrap-around cases (e.g., 350° vs 10° → diff = 20°)
- Identical points (bearing = 0 or indeterminate)
- Antipodal heading comparison (diff = 180°)

**Files created:** `backend/Landgrab.Tests/Services/HexServiceBearingTests.cs`

**Dependencies:** Step 1.4
**Agent:** Expert .NET

---

## Phase 2: Beacon — Directed Sector Reveal

**Goal:** Replace the current 2-hex circular Beacon reveal with a 4-hex directed sector based on heading captured at activation time. The beacon position remains mobile (follows Scout), but direction is frozen.

### Step 2.1 — Backend: `ActivateBeacon` accepts heading

**What:** Modify `AbilityService.ActivateBeacon` to:
- Accept a `double heading` parameter (required — no heading = error)
- Store `player.BeaconHeading = heading` alongside existing `BeaconLat/Lng`

Update the call chain:
- `GameService.ActivateBeacon(roomCode, userId, heading)`
- `GameHub.Gameplay.cs` → `ActivateBeacon(double heading)` hub method

**Files modified:**
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs) (`ActivateBeacon`)
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs) (facade)
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs)

**Dependencies:** Phase 1 (Steps 1.1, 1.2, 1.3, 1.5)
**Agent:** Expert .NET

### Step 2.2 — Backend: `DeactivateBeacon` clears heading

**What:** Ensure `DeactivateBeacon` also clears `player.BeaconHeading = null` alongside existing `IsBeacon = false`, `BeaconLat = null`, `BeaconLng = null`.

**Files modified:** [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs) (`DeactivateBeacon`)

**Dependencies:** Step 1.1
**Agent:** Expert .NET

### Step 2.3 — Backend: Sector reveal calculation in `VisibilityService`

**What:** Replace the current `AddRadiusKeys(state, visibleHexKeys, beaconHex.q, beaconHex.r, BeaconRevealRadius)` call (circular 2-hex radius) with a new sector-based reveal:

1. Compute the beacon's hex position from `BeaconLat/Lng` (already done).
2. For each hex within range 4, compute the bearing from the beacon hex center to the candidate hex center using `HexService.BearingDegrees`.
3. Include the hex if `HeadingDiff(beaconHeading, candidateBearing) <= sectorAngle/2`.
4. Use `state.Dynamics.BeaconSectorAngle` (default 45°) for the sector width.

Extract this into a helper method (e.g., `AddSectorKeys`) to keep the main visibility computation clean.

**Files modified:** [backend/Landgrab.Api/Services/VisibilityService.cs](backend/Landgrab.Api/Services/VisibilityService.cs)

**Dependencies:** Steps 1.4, 2.1
**Agent:** Expert .NET

### Step 2.4 — Frontend: `BeaconCard` heading capture + invoke

**What:** Update the Beacon UX flow:
1. Wire `useDeviceOrientation` into the BeaconCard (or its parent).
2. Show a live heading readout on the card before activation.
3. On activate, capture current heading and pass it to `handleActivateBeacon(heading)`.
4. Update `useGameActionsAbilities.ts` → `handleActivateBeacon(heading: number)` → `invoke('ActivateBeacon', heading)`.
5. Add explanation text that reactivation is required to rotate the cone.

**Files modified:**
- [frontend/landgrab-ui/src/components/game/abilities/BeaconCard.tsx](frontend/landgrab-ui/src/components/game/abilities/BeaconCard.tsx)
- [frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts](frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts) (signature change)
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx) (pass heading)

**Dependencies:** Steps 1.6, 2.1
**Agent:** Expert React Frontend Engineer

### Step 2.5 — Frontend: Beacon sector map visualization

**What:** Update `AbilityOverlayLayer.tsx` to render the Beacon footprint as a wedge/sector shape on the map instead of a circle, for the owning alliance's view. This requires:
1. Reading `myPlayer.beaconHeading` from state.
2. Computing the sector polygon (center point + arc points).
3. Rendering a filled wedge overlay using the canvas layer.

**Files modified:** [frontend/landgrab-ui/src/components/map/layers/AbilityOverlayLayer.tsx](frontend/landgrab-ui/src/components/map/layers/AbilityOverlayLayer.tsx)

**Dependencies:** Steps 1.9, 2.1
**Agent:** Expert React Frontend Engineer

### Step 2.6 — Frontend: Beacon i18n

**What:** Add/update i18n keys for the directed beacon:
- `abilities.beacon.headingRequired` — "Point your device in the direction you want to reveal"
- `abilities.beacon.headingUnavailable` — "Compass not available on this device"
- `abilities.beacon.sectorExplanation` — "Reveals a 4-hex sector in the direction you're facing"
- `abilities.beacon.reactivateToRotate` — "Deactivate and reactivate to change direction"

**Files modified:**
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts)

**Dependencies:** None
**Agent:** Lingo.dev Localization Agent

### Step 2.7 — Backend: Beacon unit tests

**What:** Test:
- Activation with heading stores `BeaconHeading`
- Deactivation clears `BeaconHeading`
- Sector reveal includes hexes within the cone and excludes those outside
- Edge cases: heading near 0°/360° wrap-around

**Files modified:** [backend/Landgrab.Tests/Services/AbilityServiceTests.cs](backend/Landgrab.Tests/Services/AbilityServiceTests.cs), or new focused test file

**Dependencies:** Steps 2.1, 2.3
**Agent:** Expert .NET

---

## Phase 3: Commando Raid — Point + Resolve + Confirm

**Goal:** Replace map-tap targeting for Commando Raid with a compass-pointing live-resolve + confirm flow. Commander stands adjacent to target, points device, backend resolves which hex, Commander confirms.

### Step 3.1 — Backend: `ResolveRaidTarget` hub method + service

**What:** Implement the live target resolution endpoint:

1. **Hub method:** `ResolveRaidTarget(double heading)` in `GameHub.Gameplay.cs` — returns `HexCoordinateDto?` (not a broadcast; returns directly to caller).
2. **Service method:** `ResolveRaidTarget(roomCode, userId, heading)` in `AbilityService`:
   - Validate Commander role, playing phase, valid position
   - Get Commander's current hex
   - For each of the 6 adjacent hexes, compute the bearing from Commander's `CurrentLat/Lng` to the adjacent hex center using `HexService.BearingDegrees` + `HexService.HexToLatLng`
   - Find the adjacent hex with minimum `HeadingDiff(heading, bearing)`
   - If that minimum diff ≤ 30°, return `{ targetQ, targetR }`; else return null
3. **Facade:** Forward in `GameService`.

**Files modified:**
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs) (new method)
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs) (new method)
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs) (facade)

**Dependencies:** Phase 1 (Steps 1.1, 1.4, 1.5)
**Agent:** Expert .NET

### Step 3.2 — Frontend: Commando Raid live pointing flow

**What:** Rewrite the `CommandoRaidCard` interaction model:
1. Wire `useDeviceOrientation` for live heading.
2. While the card is in targeting mode, poll `ResolveRaidTarget(heading)` via SignalR invoke (throttled, ~500ms).
3. Display the resolved target hex as a commander-local highlight.
4. Add a **Lock Target** button that calls existing `handleActivateCommandoRaid(targetQ, targetR)`.
5. If heading is unavailable (desktop), fall back to existing map-tap targeting.

**Files modified:**
- [frontend/landgrab-ui/src/components/game/abilities/CommandoRaidCard.tsx](frontend/landgrab-ui/src/components/game/abilities/CommandoRaidCard.tsx)
- [frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts](frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts) (add `resolveRaidTarget(heading)`)

**Dependencies:** Steps 1.6, 3.1
**Agent:** Expert React Frontend Engineer

### Step 3.3 — Backend: Commando Raid adjacency validation

**What:** Add an adjacency check to `ActivateCommandoRaid`: Commander must be in a hex adjacent to the target (`HexDistance == 1`). Currently the method only checks that the target hex exists in the grid.

**Files modified:** [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs) (`ActivateCommandoRaid`)

**Dependencies:** Step 1.4
**Agent:** Expert .NET

### Step 3.4 — Frontend: Remove map-tap targeting path for Commando Raid

**What:** In `useGameActionsGameplay.ts`, remove or gate the map-tap-based targeting that currently feeds hex selection into the Commando Raid flow. The pointing flow replaces this entirely on mobile; keep map-tap as desktop fallback only.

**Files modified:** [frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts](frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts)

**Dependencies:** Step 3.2
**Agent:** Expert React Frontend Engineer

### Step 3.5 — Frontend: Commando Raid i18n

**What:** Add i18n keys:
- `abilities.commandoRaid.pointToTarget` — "Point your device at the target hex"
- `abilities.commandoRaid.lockTarget` — "Lock Target"
- `abilities.commandoRaid.noTargetResolved` — "No valid target in that direction"
- `abilities.commandoRaid.mustBeAdjacent` — "Move to an adjacent hex first"

**Files modified:**
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts)

**Dependencies:** None
**Agent:** Lingo.dev Localization Agent

### Step 3.6 — Backend: Unit tests for Commando Raid resolver

**What:** Test:
- Adjacent hex selection via heading (6 directions, ~60° apart)
- Returns null when heading difference > 30°
- Returns null when Commander is not adjacent
- Respects existing raid rules (cooldown, one-per-alliance, HQ density gate)

**Files created/modified:** `backend/Landgrab.Tests/Services/AbilityServiceTests.cs` or dedicated test file

**Dependencies:** Steps 3.1, 3.3
**Agent:** Expert .NET

---

## Phase 4: Tactical Strike — Hex-Targeted Directed Buff

**Goal:** Change Tactical Strike from a generic combat bonus to a hex-targeted buff using the same point + confirm pattern. The bonus only applies when attacking the specific targeted hex.

### Step 4.1 — Backend: `ResolveTacticalStrikeTarget` hub method + service

**What:** Mirror the Commando Raid resolver pattern:
1. **Hub method:** `ResolveTacticalStrikeTarget(double heading)` → returns `HexCoordinateDto?`
2. **Service:** Same adjacent-hex resolution logic, but the Commander can target hexes within distance 0 or 1 (current hex or adjacent).
3. Return resolved target or null.

**Files modified:**
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs)
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs)
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs)

**Dependencies:** Phase 1 (Steps 1.1, 1.4, 1.5)
**Agent:** Expert .NET

### Step 4.2 — Backend: `ActivateTacticalStrike` accepts target coordinates

**What:** Change `ActivateTacticalStrike(roomCode, userId)` to `ActivateTacticalStrike(roomCode, userId, int targetQ, int targetR)`:
- Validate target is within distance 1
- Store `player.TacticalStrikeTargetQ = targetQ`, `player.TacticalStrikeTargetR = targetR`
- Keep existing duration/cooldown logic

Update the call chain: Hub → GameService → AbilityService.

**Files modified:**
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs)
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs)
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs)

**Dependencies:** Step 1.1
**Agent:** Expert .NET

### Step 4.3 — Backend: Combat bonus requires target match

**What:** Modify `CalculateCombatStats` in `GameplayService.cs` (line ~457) so that the Tactical Strike bonus only applies when:
- `player.TacticalStrikeActive == true`
- `player.TacticalStrikeTargetQ == q && player.TacticalStrikeTargetR == r`
- The Commander is the attacker

Also update the post-combat consumption: clear `TacticalStrikeTargetQ/R` when the strike is consumed on attack, and on expiry in the expiry tick logic (line ~1283).

**Files modified:** [backend/Landgrab.Api/Services/GameplayService.cs](backend/Landgrab.Api/Services/GameplayService.cs) (multiple locations)

**Dependencies:** Steps 1.1, 4.2
**Agent:** Expert .NET

### Step 4.4 — Frontend: Tactical Strike pointing flow + "Use Current Hex" button

**What:** Rewrite `TacticalStrikeCard`:
1. Wire `useDeviceOrientation` for live heading.
2. Poll `ResolveTacticalStrikeTarget(heading)` while targeting.
3. Show resolved target highlight.
4. Add **Lock Target** confirm button.
5. Add **Use Current Hex** button (enabled when the Commander's current hex is a valid target).
6. Update `handleActivateTacticalStrike(targetQ, targetR)` in `useGameActionsAbilities.ts`.
7. If heading unavailable, fall back to map-tap.

**Files modified:**
- [frontend/landgrab-ui/src/components/game/abilities/TacticalStrikeCard.tsx](frontend/landgrab-ui/src/components/game/abilities/TacticalStrikeCard.tsx)
- [frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts](frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts)

**Dependencies:** Steps 1.6, 4.1, 4.2
**Agent:** Expert React Frontend Engineer

### Step 4.5 — Frontend: Tactical Strike i18n

**What:** Add/update i18n keys:
- `abilities.tacticalStrike.pointToTarget` — "Point at the hex you want to buff"
- `abilities.tacticalStrike.useCurrentHex` — "Use Current Hex"
- `abilities.tacticalStrike.lockTarget` — "Lock Target"
- `abilities.tacticalStrike.targetedAt` — "Active on ({{q}}, {{r}})"
- `abilities.tacticalStrike.attackToConsume` — "Attack that hex to use the strike bonus"

**Files modified:**
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts)

**Dependencies:** None
**Agent:** Lingo.dev Localization Agent

### Step 4.6 — Backend: Unit tests for Tactical Strike

**What:** Test:
- Activation stores target coordinates
- Combat bonus applies only when attacking the targeted hex
- Combat bonus does NOT apply on a different hex
- Target fields cleared on consumption
- Target fields cleared on expiry

**Files modified:** `backend/Landgrab.Tests/Services/AbilityServiceTests.cs`, `backend/Landgrab.Tests/Services/GameplayServiceTests.cs`

**Dependencies:** Steps 4.2, 4.3
**Agent:** Expert .NET

---

## Phase 5: Rally Point — Pitch Gesture Gate

**Goal:** Add a frontend-only physical gesture gate: Commander raises device (pitch ≥ 60°) for 2 continuous seconds before the existing backend activation fires.

### Step 5.1 — Frontend: Rally Point pitch gesture in `RallyPointCard`

**What:** Update `RallyPointCard`:
1. Wire `useDeviceMotion` for pitch sensing.
2. On card open, start monitoring pitch.
3. Show a 2-second progress arc/indicator when pitch ≥ 60°.
4. If pitch drops below 60° before 2s, reset the timer.
5. On successful 2s hold, trigger existing `handleActivateReinforce()`.
6. iOS permission prompt if needed.
7. If pitch unavailable (desktop/debug), show a **Skip Gesture** button or use debug pitch slider.

**Files modified:**
- [frontend/landgrab-ui/src/components/game/abilities/RallyPointCard.tsx](frontend/landgrab-ui/src/components/game/abilities/RallyPointCard.tsx)

**Dependencies:** Step 1.7
**Agent:** Expert React Frontend Engineer

### Step 5.2 — Backend: Rename `ActivateReinforce` → `ActivateRallyPoint` (optional)

**What:** Rename the hub method from `ActivateReinforce` to `ActivateRallyPoint` for naming consistency. Keep `ActivateReinforce` as a temporary alias if needed for backward compatibility.

**Files modified:**
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs)
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs)
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs)

**Dependencies:** None
**Agent:** Expert .NET

### Step 5.3 — Frontend: Rally Point i18n

**What:** Add i18n keys:
- `abilities.rallyPoint.raiseDevice` — "Raise your device to signal the rally"
- `abilities.rallyPoint.holdSteady` — "Hold steady… {{seconds}}s"
- `abilities.rallyPoint.gestureComplete` — "Rally signal sent!"
- `abilities.rallyPoint.motionUnavailable` — "Motion sensor unavailable — tap to activate"
- `abilities.rallyPoint.permissionRequired` — "Motion permission required"

**Files modified:**
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts)

**Dependencies:** None
**Agent:** Lingo.dev Localization Agent

---

## Phase 6: Demolish — Facing Lock Rewrite

**Goal:** Replace the current walk-entry tracking (enter fort hex from adjacent) with heading-based facing locks: stand in adjacent hex, face the fort for 5 continuous seconds, complete from 3 different adjacent positions.

### Step 6.1 — Backend: Rewrite `UpdateDemolishProgress`

**What:** Replace the current `UpdateDemolishProgress` logic (currently: detect walk-into-target from a tracked `PreviousHexKey`) with the new facing-lock model:

1. Check if player is in an adjacent hex to the demolish target.
2. Check if player is facing the fort center within 20° tolerance using `HexService.BearingDegrees` and `HeadingDiff`.
3. If in the right position and facing correctly:
   - If `DemolishFacingHexKey` matches current adjacent hex and `DemolishFacingLockStartAt` is set → check if 5 seconds have elapsed.
   - If 5s completed → add current adjacent hex to `DemolishApproachDirectionsMade`, reset lock fields.
   - If `DemolishFacingHexKey` doesn't match → start new lock (set `DemolishFacingLockStartAt = UtcNow`, `DemolishFacingHexKey = currentAdjacentKey`).
4. If NOT in position or NOT facing → reset `DemolishFacingLockStartAt` and `DemolishFacingHexKey` to null.
5. After 3 completed positions → demolish the fort (same completion logic as current).

The `PreviousHexKey` field is no longer needed for demolish (it may still be used elsewhere — verify before removing).

**Files modified:** [backend/Landgrab.Api/Services/GameplayService.cs](backend/Landgrab.Api/Services/GameplayService.cs) (`UpdateDemolishProgress`, line ~1108)

**Dependencies:** Phase 1 (Steps 1.1, 1.4, 1.5)
**Agent:** Expert .NET

### Step 6.2 — Frontend: Demolish card live hold progress

**What:** Update `DemolishCard` to:
1. Show the current facing-lock hold progress (derived from `demolishFacingLockStartAt` vs current time).
2. Show which adjacent position is currently being held.
3. Continue showing overall completed approaches out of 3 (existing `demolishApproachDirectionsMade.length`).
4. Wire `useDeviceOrientation` for heading display (informational — the actual validation is backend-side).

**Files modified:**
- [frontend/landgrab-ui/src/components/game/abilities/DemolishCard.tsx](frontend/landgrab-ui/src/components/game/abilities/DemolishCard.tsx)

**Dependencies:** Steps 1.6, 1.9, 6.1
**Agent:** Expert React Frontend Engineer

### Step 6.3 — Frontend: Demolish i18n

**What:** Add/update i18n keys:
- `abilities.demolish.faceTheFort` — "Face the fort and hold for 5 seconds"
- `abilities.demolish.holdProgress` — "Holding… {{seconds}}s / 5s"
- `abilities.demolish.positionComplete` — "Position {{n}}/3 complete!"
- `abilities.demolish.facingBroken` — "Facing lock lost — hold steady"

**Files modified:**
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts)

**Dependencies:** None
**Agent:** Lingo.dev Localization Agent

### Step 6.4 — Backend: Unit tests for Demolish facing lock

**What:** Test:
- Lock starts when adjacent + facing correct direction
- Lock resets when facing breaks
- Lock resets when player moves to different adjacent hex (new `DemolishFacingHexKey`)
- 5s completion adds to approach list
- 3 completed approaches completes demolish
- Invalid target (lost fort, became friendly) clears state

**Files modified:** `backend/Landgrab.Tests/Services/GameplayServiceTests.cs` or new file

**Dependencies:** Step 6.1
**Agent:** Expert .NET

---

## Phase 7: Scout Intercept

**Goal:** Implement the full Scout Intercept ability — ambient alert, active lock flow, and sabotage-blocked-tiles penalty.

### Step 7.1 — Backend: Ambient alert computation in `UpdatePlayerLocation`

**What:** Add `SabotageAlertNearby` computation for Scout players in `UpdatePlayerLocation`:
- For each scout, check if any enemy player has an active `SabotageTargetQ/R` within 3 hexes of the scout's current position.
- Set `player.SabotageAlertNearby = true/false`.

**Files modified:** [backend/Landgrab.Api/Services/GameplayService.cs](backend/Landgrab.Api/Services/GameplayService.cs) (`UpdatePlayerLocation`)

**Dependencies:** Phase 1 (Step 1.1)
**Agent:** Expert .NET

### Step 7.2 — Backend: `AttemptIntercept` hub method + service

**What:** Implement the 500ms-polled intercept check:

1. **Hub method:** `AttemptIntercept(double heading)` → returns intercept status object `{ status: "locking" | "broken" | "success" | "noTarget", seconds?: double }`.
2. **Service:** `AttemptIntercept(roomCode, scoutId, heading)` in `AbilityService`:
   - Find the tracked engineer (`InterceptTargetId`) or auto-acquire the nearest sabotaging engineer in the same hex.
   - Validate 3 conditions:
     a. Same hex as engineer
     b. Scout facing engineer ≤ 20°
     c. Engineer NOT facing scout > 90°
   - If all pass: start/continue lock timer
   - If any fail: reset lock
   - If 5s complete: clear engineer's sabotage + add blocked tile + log event
3. **Facade** in `GameService`.

**Files modified:**
- [backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs](backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs) (new method)
- [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs)
- [backend/Landgrab.Api/Services/GameService.cs](backend/Landgrab.Api/Services/GameService.cs)

**Dependencies:** Phase 1 (Steps 1.1, 1.4, 1.5)
**Agent:** Expert .NET

### Step 7.3 — Backend: Sabotage blocked-tile guard

**What:** Add a guard in `ActivateSabotage` that checks `player.SabotageBlockedTiles` before allowing activation:
```
if SabotageBlockedTiles["q,r"] > UtcNow → reject with time remaining
```

**Files modified:** [backend/Landgrab.Api/Services/AbilityService.cs](backend/Landgrab.Api/Services/AbilityService.cs) (`ActivateSabotage`)

**Dependencies:** Step 1.1
**Agent:** Expert .NET

### Step 7.4 — Frontend: `InterceptCard` component

**What:** Create a new ability card for Scout:
- Compass heading readout (live)
- Circular 5-second progress arc
- Status messages: locking, broken, success, no target
- iOS permission prompt
- Scout-accent visual styling

**Files created:** `frontend/landgrab-ui/src/components/game/abilities/InterceptCard.tsx`

**Dependencies:** Steps 1.6, 7.2
**Agent:** Expert React Frontend Engineer

### Step 7.5 — Frontend: Wire InterceptCard into PlayingHud

**What:**
- Show ambient pulse badge on Scout HUD when `myPlayer.sabotageAlertNearby === true`.
- Wire `InterceptCard` into `PlayingHud.tsx` for Scout role.
- Add `attemptIntercept(heading)` action to `useGameActionsAbilities.ts`.

**Files modified:**
- [frontend/landgrab-ui/src/components/game/PlayingHud.tsx](frontend/landgrab-ui/src/components/game/PlayingHud.tsx)
- [frontend/landgrab-ui/src/components/game/PlayerHUD.tsx](frontend/landgrab-ui/src/components/game/PlayerHUD.tsx)
- [frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts](frontend/landgrab-ui/src/hooks/useGameActionsAbilities.ts)

**Dependencies:** Steps 7.4, 1.9
**Agent:** Expert React Frontend Engineer

### Step 7.6 — Frontend: Role modal + ability info updates

**What:**
- Add Intercept to Scout's `ROLE_ABILITIES` in `roleModalUtils.ts`: `{ key: 'intercept', icon: 'binoculars', type: 'active' }`.
- Add Intercept entry in `AbilityInfoSheet.tsx`.

**Files modified:**
- `frontend/landgrab-ui/src/components/lobby/roleModalUtils.ts`
- `frontend/landgrab-ui/src/components/game/AbilityInfoSheet.tsx`

**Dependencies:** Step 7.4
**Agent:** Expert React Frontend Engineer

### Step 7.7 — Frontend: Intercept i18n

**What:** Add the full set of intercept i18n keys as specified in the spec:
- `abilities.intercept.title`, `description`, `shortDesc`, `locking`, `lockBroken`, `success`, `alertNearby`, `noTarget`, `blockedFeedback`

**Files modified:**
- [frontend/landgrab-ui/src/i18n/en.ts](frontend/landgrab-ui/src/i18n/en.ts)
- [frontend/landgrab-ui/src/i18n/nl.ts](frontend/landgrab-ui/src/i18n/nl.ts)

**Dependencies:** None
**Agent:** Lingo.dev Localization Agent

### Step 7.8 — Backend: Unit tests for Scout Intercept

**What:** Test:
- Ambient alert triggers within 3 hexes of active sabotage
- Lock progression when all 3 conditions met
- Lock breaks when engineer faces scout
- Lock breaks when scout leaves hex
- 5s completion clears sabotage + adds blocked tile
- Blocked tile prevents re-sabotage
- Blocked tile expires after 5 minutes

**Files created:** `backend/Landgrab.Tests/Services/InterceptTests.cs`

**Dependencies:** Steps 7.1, 7.2, 7.3
**Agent:** Expert .NET

---

## Edge Cases To Handle

### Across all compass abilities
1. **Heading unavailable**: Frontend must always offer a fallback (debug slider on desktop, error message on unsupported mobile). Backend methods with heading parameter should reject `null` heading where required (Beacon activate, resolve methods).
2. **Stale `CurrentHeading`**: If the player stops sending location updates, `CurrentHeading` goes stale. The backend should NOT rely on `CurrentHeading` for time-sensitive checks beyond what `UpdatePlayerLocation` freshly sets — intercept and demolish currently get heading via their own polling methods.
3. **iOS permission denial**: `useDeviceOrientation`/`useDeviceMotion` must handle `'denied'` gracefully — show explanatory text, disable heading-dependent features, fall back to map-tap where possible.
4. **Concurrent ability conflicts**: A player can only have one active ability mode at a time. The existing `abilityUi` store already enforces this.
5. **Room disconnect/reconnect**: On `StateUpdated` after reconnect, `useSignalRHandlers.ts` must derive ability UI state from the new `PlayerDto` fields (`BeaconHeading`, `TacticalStrikeTargetQ/R`, `DemolishFacingLockStartAt`, etc.).

### Beacon-specific
6. **Beacon heading near 0°/360° boundary**: `HeadingDiff` must handle wrap-around correctly (tested in Step 1.11).
7. **Beacon sector partially off-grid**: Some hexes within the sector region may not exist in the grid. Only reveal hexes that are present in `state.Grid`.

### Commando Raid / Tactical Strike
8. **Commander moves between resolve and confirm**: The `ActivateCommandoRaid`/`ActivateTacticalStrike` must re-validate adjacency at confirm time, not trust the earlier resolve result.
9. **Tactical Strike on current hex**: Cannot be resolved via heading alone — requires the "Use Current Hex" button.

### Rally Point
10. **Device flat on table during gesture**: Pitch = 0° — gesture doesn't progress.
11. **Accidental pitch activation**: 2-second sustained hold + 60° threshold makes accidental activation unlikely.

### Demolish
12. **5-second timer straddles `UpdatePlayerLocation` interval**: The 500ms hub throttle means ~10 location updates across a 5s window. Timer must use `DateTime.UtcNow` comparison, not count updates.
13. **Player teleports (debug GPS)**: Moving to a new hex resets `DemolishFacingHexKey`, preventing exploits.

### Scout Intercept
14. **No engineer in range**: `AttemptIntercept` returns `"noTarget"` — card shows appropriate message.
15. **Engineer moves away during lock**: 500ms polling cycle detects hex change → lock resets.
16. **Multiple engineers in same hex**: The spec doesn't explicitly handle this — recommend tracking one specific engineer via `InterceptTargetId` and auto-acquiring the nearest one.

---

## Open Questions

1. **Should `useCompassHeading.ts` be refactored or left as-is?** It currently serves map rotation in `GameMap.tsx`. Options: (a) rename to `useDeviceOrientation` and update all imports, (b) keep both and have `useDeviceOrientation` wrap it, (c) extract shared core logic. Recommendation: option (b) for minimal risk.

2. **Desktop fallback for Commando Raid / Tactical Strike**: The spec says pointing replaces map-tap "entirely", but desktop/automated testing has no compass. Recommend keeping map-tap as a fallback when `useDeviceOrientation.supported === false`.

3. **`AttemptIntercept` return type**: The spec doesn't define the return DTO. Recommend a small response type: `{ status: string, seconds: double?, targetPlayerId: string? }` — returned directly to caller, not broadcast.

4. **`PreviousHexKey` field removal**: Currently used by `UpdateDemolishProgress` for walk-entry detection. After the facing-lock rewrite, check if any other code depends on it before removing from `PlayerDto`.

---

## Parallelization Matrix

| Phase | Can start after | Can run in parallel with |
|---|---|---|
| **1 (Infrastructure)** | — | Steps 1.4, 1.6, 1.7, 1.9 can run in parallel |
| **2 (Beacon)** | Phase 1 | Phases 3, 4, 5, 6, 7 |
| **3 (Commando Raid)** | Phase 1 | Phases 2, 4 (partially), 5, 6, 7 |
| **4 (Tactical Strike)** | Phase 1 | Phases 2, 3 (partially), 5, 6, 7 |
| **5 (Rally Point)** | Step 1.7 only | All other phases |
| **6 (Demolish)** | Phase 1 | Phases 2, 3, 4, 5, 7 |
| **7 (Intercept)** | Phase 1 | Phases 2, 3, 4, 5, 6 |

All i18n steps (2.6, 3.5, 4.5, 5.3, 6.3, 7.7) have no code dependencies and can be done at any time.

All backend unit test steps can run immediately after their corresponding implementation steps.
