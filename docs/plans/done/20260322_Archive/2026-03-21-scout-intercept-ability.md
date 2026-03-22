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
```

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
