# Physical Presence Game Dynamics Design

**Date:** 2026-03-17
**Context:** Landgrab is used by a scout leader running Friday evening games in the forest with 15–40 scouts divided into platoons of 4–7. The game must be playable in 1–8 hours. Every meaningful action requires physically walking to a hex.

---

## Core Design Principle

> A scout must physically stand in a hex to interact with it. The game should reward movement, coordination, and physical presence — not remote digital manipulation.

The backend already enforces `IsPlayerInHex` for `PickUpTroops` and `PlaceTroops`. This design extends that principle to all remaining mechanics and removes anything that has no physical-world analogue.

---

## Removals

| Mechanic | Reason |
|---|---|
| `ReClaimHex` (all modes: Alliance, Self, Abandon) | No physical meaning. A scout doesn't reassign tile ownership or voluntarily abandon territory from a phone. |
| `AllowSelfClaim` / `claimForSelf` flag | The self-vs-alliance color distinction doesn't exist in the physical world. Everything you claim is for your platoon. |
| `SupplyLinesEnabled` | Pure board game abstraction. No physical analogue in a forest. |
| `ShieldWall` ability | Rewards passive standing. Removed along with the Defender role. |
| `RushHour` host event | A digital scoring multiplier with no physical-world meaning. |
| **Defender role** | Every ability the Defender had rewarded standing still. A scout who just plants themselves for 5 minutes is not playing. Role removed entirely. |

---

## Changed Defaults

**Default `ClaimMode` → `PresenceOnly`**
The previous default was `AdjacencyRequired` — a board game rule that you can only claim tiles adjacent to existing territory. In a forest, scouts spread out and claim whatever they physically reach. `PresenceOnly` is the correct default. `AdjacencyRequired` and `PresenceWithTroop` remain as optional configurations.

**Always claim for alliance**
`claimForSelf` is removed. When a scout claims a tile, it belongs to their platoon. Personal vs alliance color attribution is a digital abstraction with no gameplay value.

---

## Redesigned Mechanics

### 1. Beacon → Scout Role Ability (Forward Observer)

**Was:** A standalone ability that extended alliance claim range by 2 hexes under `AdjacencyRequired` mode. Meaningless when `AdjacencyRequired` is no longer the default.

**Now:** The Scout role's signature ability. When activated, the Scout becomes a **Forward Observer** — fog-of-war is lifted for all alliance members within a hex radius around the Scout's position. Allies can see enemy positions in that area on their map.

- Scout must stay within 1 hex of the activation point or the beacon auto-deactivates
- No Beacon value without `FogOfWarEnabled` — the two features are paired
- Narrative: "Leon, get to the ridge and activate your beacon so we can see who's in the valley"

---

### 2. CommandoRaid → Commander Role Ability (Presence Battle)

**Was:** A Scout ability. Mark a neutral hex, physically walk there within 5 minutes, claim it bypassing adjacency. Bypassing adjacency is irrelevant with `PresenceOnly` as default.

**Now:** A Commander-ordered team operation. Pure physical presence battle — no dice, no troop cost.

**How it works:**
1. A **Commander** activates CommandoRaid on any hex (enemy-owned or neutral, excluding HQs unless the 40% map density gate is open)
2. **Both teams immediately see the target hex highlighted** and a countdown (5 minutes) on their maps
3. All players race to the target hex
4. When the timer expires, the side with **more players physically present in the hex** wins, with a **minimum of 2 attackers required** to succeed:
   - **Attackers win (2+ attackers, more than defenders):** Tile is captured AND all troops on the tile transfer to the attacker as spoils
   - **Tie or defenders win:** Raid fails, tile stays with current owner

**Why it works:** Heavily reinforced enemy tiles become the highest-value targets. Defenders must decide whether to abandon their current positions and sprint back. Creates real running, shouting, and split-second decisions in the forest.

---

### 3. HQ Capture → CommandoRaid Only, Gated by Map Density

**Was:** Enemy steps onto your HQ hex, captures it through normal troop combat, and your alliance gets a 5-minute claim freeze.

**Now:** An HQ **cannot be captured through normal troop combat**. The only way to capture an enemy HQ is via a Commander's CommandoRaid ability. This makes HQ raids a deliberate, high-stakes decision — not something that happens by accident when a scout wanders onto the wrong tile.

**Gate condition:** CommandoRaid can only be targeted at an HQ once **40% or more of the total map hexes are claimed** by any team combined. This ensures the territorial game develops before the decisive blow is possible. Early game HQs are safe; mid-to-late game they become targets.

**How it works:**
1. Commander activates CommandoRaid, selects the enemy HQ as the target
2. The system checks the map density gate — if less than 40% of hexes are claimed, the raid is rejected with a clear message ("The battle hasn't reached its peak yet")
3. If the gate is open, the standard CommandoRaid presence battle begins (5-minute countdown, both teams see it, minimum 2 attackers required to win)
4. Capturing the HQ transfers all troops on it to the attacker AND applies the claim freeze to the losing alliance
5. HQ tile itself cannot be attacked through `PlaceTroops` — it is immune to normal combat

**Narrative:** HQ raids are the climactic late-game moment. Both teams know one is coming when the map fills up.

---

### 4. TacticalStrike (Commander) → Lead From the Front

**Was:** Commander activates a 5-minute combat bonus window. No physical requirement for where the Commander is. Remote activation, others do the fighting.

**Now:** The TacticalStrike combat bonus only applies when the **Commander is physically present in the hex being attacked** at the time of the attack. Commander wants the bonus → Commander walks into the fight.

- Encourages Commanders to be at the front line, not hanging back
- Cooldown unchanged

---

### 5. Commander's Reinforce → Rally Point

**Was:** Commander stands on a friendly hex, +3 troops immediately. Identical in effect to Engineer's EmergencyRepair.

**Now:** Commander activates a **Rally Point** at their current hex. A countdown marker (3 minutes) appears on all alliance members' maps showing the Commander's location. For each ally who physically arrives at the Commander's hex within the window, **+2 troops are added to that hex** (capped at 2× platoon size).

- Rewards physical team coordination and movement toward a common point
- Commander must hold position during the countdown
- Narrative: "I'm at G7, rally here — we need troops!"

---

### 6. Engineer's EmergencyRepair → Sabotage

**Was:** Engineer stands on a friendly hex, +3 troops immediately. Identical to Commander's Reinforce.

**Now:** Engineer sneaks into an **enemy hex** and activates Sabotage. The enemy hex's troop regeneration is disabled for 10 minutes. The owning player receives a notification: "Your hex at G7 is being sabotaged!"

- Engineer must remain in the enemy hex for **1 minute** to complete the sabotage
- The enemy hex displays a visible sabotage countdown timer to the owning player during the 1-minute completion window — they know it's happening and can rush back to interrupt it
- If the Engineer is pushed out before 1 minute, sabotage fails
- High risk (deep in enemy territory, exposed to Toll and Ambush), high reward (crippling a strong position long-term)
- Cooldown: 20 minutes
- Narrative: Engineer sneaking through enemy territory to weaken their strongest positions

---

### 7. Troop Regeneration → Presence-Boosted

**Was:** Passive background tick every ~30 seconds, all friendly hexes regenerate +1 troop regardless of whether any scout is there.

**Now:** Base regen is unchanged, but **hexes with a friendly player physically present regenerate at 3× speed**. Combined with the existing TileDecay mechanic (unvisited hexes decay instead of regenerating), this creates a strong physical incentive to actively patrol territory.

- Standing on your own land matters
- Abandoning territory is doubly punished: it decays AND misses the presence bonus
- Scouts must actively choose: advance into new territory or stay to boost regen on existing tiles

---

## Role Summary (Updated)

| Role | Active Abilities | Passive |
|---|---|---|
| **Commander** | TacticalStrike (combat bonus, must be in attacking hex), CommandoRaid (presence battle), Rally Point (team convergence for troops) | — |
| **Scout** | Beacon (Forward Observer, lifts fog for alliance in radius) | +2 troops on first visit to a hex |
| **Engineer** | Sabotage (disable enemy hex regen for 10 min), Demolish (destroy enemy fort from within) | Fort construction after 10 min in same hex |

---

## What Stays Unchanged

| Mechanic | Why |
|---|---|
| `FogOfWarEnabled` | Forces scouts to physically explore — you only see what you've walked to |
| `CombatPreview` | Scouts can assess a position's strength before committing |
| Terrain bonuses (Building, Hills, Steep) | Real OSM terrain, directly meaningful outdoors |
| `TileDecayEnabled` (Shepherd) | Unvisited tiles decay — rewards active patrolling |
| `TerrainEnabled` | OSM terrain types apply in forest environments |
| `UnderdogPactEnabled` | Auto-balance when one alliance dominates |
| `TimedEscalationEnabled` | Accelerates endgame — good for time-bounded scout sessions |
| `PresenceBonus`, `PresenceBattle`, `Ambush`, `Toll`, `Rally`, `Drain` | All require physical co-presence — core to the experience |
| HQ auto-assign | Physical anchor for each platoon's starting territory |

---

## Game Setup Flow (Scout Context)

1. Leader arrives at forest, creates a room, sets map location to current GPS position
2. Configures: `ClaimMode = PresenceOnly`, `FogOfWarEnabled = true`, `PlayerRolesEnabled = true`, `TileDecayEnabled = true`, `HQEnabled = true`, `HQAutoAssign = true`
3. Scouts join by room code
4. System auto-assigns platoons → alliances, auto-assigns roles within each platoon
5. Host starts game — scouts scatter into the forest

---

## Resolved Design Decisions

| Decision | Resolution |
|---|---|
| Rally Point troop cap | Scales with platoon size: maximum 2× the alliance's player count |
| Sabotage visibility | Enemy sees the sabotage countdown timer on their hex in real time |
| CommandoRaid minimum attacker count | Minimum 2 attackers must be physically present in the hex for the raid to succeed |
| HQ capture mechanic | Only capturable via CommandoRaid; immune to normal troop combat; gated behind 40% map density |
