# Physical Presence Game Dynamics Design

**Date:** 2026-03-17
**Context:** Landgrab is used by a scout leader running Friday evening games in the forest with 15–40 scouts divided into platoons of 4–7. The game must be playable in 1–8 hours. Every meaningful action requires physically walking to a hex.

---

## Core Design Principle

> A scout must physically stand in a hex to interact with it. The game should reward movement, coordination, and physical presence — not remote digital manipulation.

The backend already enforces `IsPlayerInHex` for `PickUpTroops` and `PlaceTroops`. This design extends that principle to all remaining mechanics and removes anything that has no physical-world analogue.

---

## Changes

### Remove

| Mechanic | Reason |
|---|---|
| `ReClaimHex` (all modes: Alliance, Self, Abandon) | No physical meaning. A scout doesn't reassign tile ownership or voluntarily abandon territory from a phone. |
| `AllowSelfClaim` / `claimForSelf` flag | The self-vs-alliance color distinction doesn't exist in the physical world. Everything you claim is for your platoon. |
| `SupplyLinesEnabled` | Pure board game abstraction (Risk/Axis & Allies supply chains). No physical analogue in a forest. |
| `ShieldWall` ability (Defender role) | Rewards passive standing. A Defender who plants themselves for 5 minutes is boring. Defender's value comes from active co-presence through the Rally mechanic. |
| `RushHour` host event | A digital scoring multiplier with no physical-world meaning. |

### Change

**Default `ClaimMode` → `PresenceOnly`**
The previous default was `AdjacencyRequired`, which is a board game rule: you can only claim tiles adjacent to your existing territory. In a forest, scouts spread out and claim territory wherever they walk. `PresenceOnly` is the correct default. `AdjacencyRequired` and `PresenceWithTroop` remain available as optional configurations.

**Always claim for alliance**
Remove the `claimForSelf` concept. When a scout claims a tile, it belongs to their platoon (alliance). Personal color vs alliance color is a digital distinction that adds confusion with no gameplay value.

---

## Redesigned Mechanics

### Beacon → Scout Role Ability (Forward Observer)

**Was:** A standalone ability that extended alliance claim range by 2 hexes under `AdjacencyRequired` mode. Became meaningless when `AdjacencyRequired` is no longer the default.

**Now:** The Scout role's signature ability. When activated, the Scout becomes a **Forward Observer** — fog-of-war is lifted for all alliance members within a hex radius around the Scout's position. Allies can see enemy positions in that area on their map.

- Scout must physically stay within 1 hex of activation point, or the beacon auto-deactivates
- Pairs naturally with `FogOfWarEnabled` — without fog, there is no beacon value
- Physical narrative: "Leon, go ahead and get to the ridge — activate your beacon so we can see who's in the valley"

**Role mapping:** Scout role → Beacon ability (replaces CommandoRaid, which moves to Commander)

---

### CommandoRaid → Commander Role Ability (Presence Battle)

**Was:** A Scout ability. Mark a neutral hex within 3 hexes, physically walk there within 5 minutes, claim it bypassing adjacency. The only benefit was bypassing adjacency — irrelevant with `PresenceOnly` as default.

**Now:** A Commander-ordered operation. Pure physical presence battle — no dice, no troop cost.

**How it works:**
1. A **Commander** activates CommandoRaid on any hex (enemy-owned or neutral)
2. **Both teams immediately see the target hex highlighted** and a 5-minute countdown on their maps
3. All players race to the target hex
4. When the timer expires, the side with **more players physically present in the hex** wins:
   - **Attackers win:** Tile is captured AND **all troops on the tile transfer to the attacker** as spoils
   - **Tie or defenders win:** Raid fails, tile stays with current owner
5. Cooldown applies after use

**Why this works physically:**
- Heavily reinforced enemy tiles become the highest-value raid targets (more troops = bigger prize)
- Defenders must decide: rush back to protect their strongest tile, or hold their current positions
- Creates real running, coordination, and shouting in the forest
- "Their HQ has 8 troops — if we get 4 people there before them we win everything"

**Physical narrative:** Commander calls the raid, platoon converges from multiple directions, enemy scrambles to intercept.

**Role mapping:** CommandoRaid moves from Scout → Commander (alongside TacticalStrike and Reinforce)

---

## Role Ability Summary (Updated)

| Role | Active Abilities | Passive |
|---|---|---|
| **Commander** | TacticalStrike (+combat bonus window), Reinforce (+3 troops on current hex), CommandoRaid (presence battle) | — |
| **Scout** | Beacon (Forward Observer, lifts fog for allies) | +2 troops on first visit to a hex |
| **Defender** | — | Co-presence Rally bonus (+1 defense when 2+ allies in hex) |
| **Engineer** | EmergencyRepair (+3 troops on current hex), Demolish (destroy enemy fort from within) | Fort construction after 10 min in same hex |

---

## What Stays

| Mechanic | Why |
|---|---|
| `FogOfWarEnabled` | Forces scouts to physically explore — you only know what you've walked to |
| `CombatPreview` | Scouts can assess the strength of a position before committing to an attack |
| Terrain bonuses (Building, Hills, Steep) | Real OSM terrain types, directly meaningful in a forest |
| HQ mechanics + `HQAutoAssign` | Physical anchor for each platoon's territory |
| `TileDecayEnabled` (Shepherd) | Tiles unvisited for 3+ minutes decay — rewards active patrolling |
| `TerrainEnabled` | Terrain types from OpenStreetMap apply to forest/outdoor environments |
| `UnderdogPactEnabled` | Auto-balance for when one alliance dominates |
| `TimedEscalationEnabled` | Accelerates endgame — good for time-bounded scout sessions |
| `PresenceBonus`, `PresenceBattle`, `Ambush`, `Toll`, `Rally`, `Drain` | All require physical co-presence — core to the scout experience |

---

## Game Setup Flow (Scout Context)

1. Leader arrives at forest, opens Landgrab, creates room
2. Sets map location (current GPS position)
3. Configures: `ClaimMode = PresenceOnly`, `FogOfWarEnabled = true`, `PlayerRolesEnabled = true`, `HQEnabled = true`, `HQAutoAssign = true`
4. Scouts join by room code
5. System auto-assigns platoons → alliances, auto-assigns roles within each platoon
6. Host starts game
7. Scouts scatter into the forest

---

## Open Questions

- **Defender role active ability:** ShieldWall is removed. Defender currently has no active ability, relying only on co-presence Rally. Consider adding a movement-rewarding active ability in a future design iteration.
- **CommandoRaid minimum attacker count:** Should the raid require a minimum of 2 attackers present (to enforce the "commando team" narrative), or is 1 attacker with more presence than defenders sufficient?
