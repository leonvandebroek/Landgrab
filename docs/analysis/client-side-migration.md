# Client-Side Migration Analysis: Server → Frontend Operations

## Architectural Rule

> **The server resolves inter-player interactions and is responsible for gathering and distributing game state updates to all players.**

This gives a single, testable question for any hub method:

> **Does this call produce a broadcast?**
> - Yes → stays server (state mutation or inter-player coordination)
> - No, only returns info to the caller → moves to frontend

## Overview

Applying that rule to every hub method yields exactly four candidates — all "resolve" operations that return information to a single caller, produce no broadcast, and can be computed entirely from the per-viewer projected state the client already receives. Moving these eliminates one SignalR RTT per ability use and makes feedback instantaneous.

The server **still validates** every final `Activate*` / `PlaceTroops` call — moving resolution to the client does not compromise authority.

## Full Hub Method Audit

Every hub method classified against the rule:

| Method | Broadcasts? | Verdict |
|--------|------------|---------|
| `GetCombatPreview` | ❌ returns to caller only | **→ Frontend** |
| `ResolveRaidTarget` | ❌ returns to caller only | **→ Frontend** |
| `ResolveTacticalStrikeTarget` | ❌ returns to caller only | **→ Frontend** |
| `ResolveTroopTransferTarget` | ❌ returns to caller only | **→ Frontend** |
| `AttemptIntercept` | ✅ affects raider (inter-player) | Stay |
| `InitiateFieldBattle` | ✅ creates shared battle state | Stay |
| `ShareBeaconIntel` | ✅ broadcasts intel to alliance | Stay |
| Every `Activate*` / `Start*` / `Cancel*` | ✅ state mutation → broadcast | Stay |
| Every `Update*` / `PlaceTroops` / `PickUpTroops` | ✅ state mutation → broadcast | Stay |
| Every lobby `Set*` / `Configure*` / `Distribute*` | ✅ all players receive update | Stay |

These four are the **complete list**. There are no hidden candidates — the rest of the hub is entirely state mutations or cross-player coordination.

---

## Design Guardrail

This rule also prevents future drift: **any new targeting or resolution step for a new ability should be written client-side by default.** It only needs a hub method if it produces a broadcast.

---

## Methods to Move

### 1. `ResolveRaidTarget(double heading)` — ⭐ Trivial

**Current location:** `CommanderAbilityService.cs`

The server literally returns the player's own current hex (`currentHexQ`, `currentHexR`). No calculation. One round-trip to retrieve data the client already has.

**Data required (all in projected state):**

| Field | Path in `gameState` |
|-------|---------------------|
| Player role | `players[myId].role` |
| Player current hex | `players[myId].currentHexQ/R` |
| Game phase | `phase` |
| `playerRolesEnabled` | `dynamics.playerRolesEnabled` |

---

### 2. `ResolveTacticalStrikeTarget(double heading)` — ⭐⭐ Simple

**Current location:** `CommanderAbilityService.cs` → `RoleAbilityServiceBase.ResolveClosestAdjacentHex()`

Generates the 6 adjacent hexes, converts each to lat/lng, picks the one whose bearing is closest to `heading`.

**Algorithm:**
```
for each neighbor of (currentHexQ, currentHexR):
    neighborLatLng = HexToLatLng(q, r, mapLat, mapLng, tileSizeMeters)
    bearing = BearingDegrees(playerLat, playerLng, neighborLat, neighborLng)
    diff = HeadingDiff(heading, bearing)
return neighbor with smallest diff
```

**Data required (all in projected state):**

| Field | Path in `gameState` |
|-------|---------------------|
| Player lat/lng | `players[myId].currentLat/Lng` |
| Player current hex | `players[myId].currentHexQ/R` |
| Map origin | `mapLat`, `mapLng` |
| Tile size | `tileSizeMeters` |
| Grid | `grid` (keys: `"q,r"`) |

---

### 3. `ResolveTroopTransferTarget(double heading)` — ⭐⭐ Simple

**Current location:** `SharedAbilityService.cs`

Scans all players, keeps same-alliance members within 45° of `heading`, returns the closest by distance².

**Algorithm:**
```
for each player p (same alliance, has position, not self):
    bearing = BearingDegrees(myLat, myLng, p.lat, p.lng)
    diff = HeadingDiff(heading, bearing)
    if diff > 45°: skip
    score = (myLat - p.lat)² + (myLng - p.lng)²
return player with smallest score
```

**Data required (all in projected state):**

| Field | Path in `gameState` |
|-------|---------------------|
| My lat/lng | `players[myId].currentLat/Lng` |
| My alliance | `players[myId].allianceId` |
| All players | `players[]` (positions, alliance IDs) |
| Game phase | `phase` |

---

### 4. `GetCombatPreview(int q, int r, ...)` — ⭐⭐⭐ Moderate

**Current location:** `GameplayService.cs` → `CalculateCombatStats()`

Win probability is deterministic (`attackTroops / (attack + defence)`, clamped to `[0.05, 0.95]`). The random dice roll only happens in `ResolveDiceCombat()` during **actual combat resolution**, not during preview.

**Algorithm:**
```
isTacticalStrike = player.tacticalStrikeActive 
                   && tacticalStrikeTargetQ == q 
                   && tacticalStrikeTargetR == r

defenderBonuses = 0
if cell.isFortified && !isTacticalStrike: defenderBonuses += 1  // Rally
if cell.isFort && !isTacticalStrike:      defenderBonuses += 1  // Fort

attackerBonuses = 0
if playerRolesEnabled:
    commanderPresent = players.any(p => p.hexQ==q && p.hexR==r 
                                     && p.role == 'Commander' 
                                     && p.allianceId == myAllianceId)
    if commanderPresent: attackerBonuses += 1

effectiveAttack  = carriedTroops + attackerBonuses
effectiveDefence = cell.troops + defenderBonuses

if combatMode == 'Siege':
    siegeBonus = ceil(effectiveDefence * 0.25)
    effectiveDefence += siegeBonus

// Win probability
if combatMode == 'Classic':
    probability = effectiveAttack > effectiveDefence ? 1.0 : 0.0
else:
    probability = clamp(effectiveAttack / (effectiveAttack + effectiveDefence), 0.05, 0.95)
```

**Data required (all in projected state):**

| Field | Path in `gameState` |
|-------|---------------------|
| Target hex data | `grid["q,r"].troops`, `.isFort`, `.isFortified`, `.ownerName` |
| Player carried troops | `players[myId].carriedTroops` |
| Tactical strike state | `players[myId].tacticalStrikeActive`, `.tacticalStrikeTargetQ/R` |
| Player role / alliance | `players[myId].role`, `.allianceId` |
| All players | `players[]` (for commander-in-hex check) |
| Combat mode | `dynamics.combatMode` |
| `playerRolesEnabled` | `dynamics.playerRolesEnabled` |

---

## Migration Summary

| Method | Complexity | RTTs saved | Notes |
|--------|-----------|------------|-------|
| `ResolveRaidTarget` | Trivial | 1 per Commando Raid use | Just return own hex |
| `ResolveTacticalStrikeTarget` | Simple | 1 per Tactical Strike use | Bearing + adjacent hex |
| `ResolveTroopTransferTarget` | Simple | 1 per Transfer use | Bearing + player scan |
| `GetCombatPreview` | Moderate | 1 per hex hover/tap | Instant preview, no RNG |

---

## Implementation Plan

### New file: `src/utils/combatCalculations.ts`

Port these helpers from `HexService.cs` (the frontend already has `haversineDistanceM` in `utils/geo.ts`):

```typescript
// Bearing between two lat/lng points (0–360°)
function bearingDegrees(lat1, lng1, lat2, lng2): number

// Convert axial hex coordinates to lat/lng
function hexToLatLng(q, r, mapLat, mapLng, tileSizeMeters): { lat, lng }

// The 6 axial neighbor offsets (already exists in HexMath.ts — verify)
function hexNeighbors(q, r): Array<{ q, r }>

// Smallest circular angle difference between two bearings
function headingDiff(a, b): number  // result in [0, 180]
```

Then expose four functions with the same return shape as the current `invoke()` calls:

```typescript
export function resolveRaidTarget(player, state): { targetQ, targetR } | null
export function resolveTacticalStrikeTarget(player, state, heading): { targetQ, targetR } | null
export function resolveTroopTransferTarget(player, allPlayers, heading): { id, name } | null
export function calculateCombatPreview(player, targetCell, state): CombatPreviewDto
```

### Hook changes: `useGameActionsAbilities.ts`

Replace each `invoke('Resolve*', ...)` call with a synchronous local call wrapped in a resolved `Promise` to preserve the existing async API used by callers.

### Server methods

The four `Resolve*` hub methods can be **kept as no-ops** initially (for backward compatibility during rollout) and removed in a follow-up cleanup.

---

## What Does NOT Move

| Operation | Reason |
|-----------|--------|
| All `Activate*` / `PlaceTroops` / `AttackGlobalHex` | Must be server-authoritative; server validates and applies |
| Fog-of-war projection (`BuildStateForViewer`) | Server strips hostile data before sending — cannot trust client |
| `ResolveDiceCombat` (actual combat) | Uses `Random.Shared.NextDouble()` — server-authoritative RNG |
| Auth / JWT / account lockout | Must stay server |
