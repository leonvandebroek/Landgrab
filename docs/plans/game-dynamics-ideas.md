# Game Dynamics Ideas

This document captures game mechanics and mission ideas discussed for Landgrab, intended as input for future implementation planning.

**Context:** The game is played by a scout troop of 12–30 players split across 2 or 4 alliances,
in a real-world outdoor setting over 2–4 hours. Players physically move through the terrain.
The game is real-time (not turn-based).

---

## 1. Terrain Types Based on Real-World Map Data

Each hex's terrain type is derived from its real-world location at game start. Since
`HexService.HexToLatLng()` already converts any `(q, r)` to a `(lat, lng)`, this is a single API
call per game (at game start) that enriches each hex with a `TerrainType`.

### Data Sources

| Source | Method | Cost |
|--------|--------|------|
| OpenStreetMap Overpass API | One bounding-box query for all hex features (`highway`, `natural`, `building`, `landuse`, `leisure`) | Free, no API key |
| OpenTopoData (SRTM) | Batch height query per hex centre coordinate | Free, no API key |

### Terrain Types and Effects

Priority order when multiple OSM tags overlap:

| Priority | Terrain | Detection | Game Effect |
|----------|---------|-----------|-------------|
| 1 | **Water** | `natural=water`, `waterway=*` | Impassable — acts as a barrier |
| 2 | **Building / Fort** | `building=*` | +1 defence die; troop regeneration bonus |
| 3 | **Road** | `highway=residential/primary/...` | +1 movement speed bonus |
| 4 | **Path** | `highway=path/footway/cycleway` | Minor movement bonus |
| 5 | **Forest** | `natural=wood`, `landuse=forest` | Attacker rolls blind (troop count hidden) |
| 6 | **Park / Grassland** | `leisure=park`, `landuse=grass` | Neutral |
| 7 | **Hills** | Relative elevation 5–20 m above neighbours | Defender +1 die |
| 8 | **Steep / Dike** | Relative elevation > 20 m above neighbours | Defender +2 dice |

Relative elevation (difference with neighbouring hexes) is more meaningful than absolute altitude — a dike in Zeeland is as impactful as a mountain in the Alps.

### Example (Vondelpark, Amsterdam)

```text
[ Road  ][ Path  ][ Park  ]
[ Park  ][ Water ][ Park  ]
[ Forest][ Park  ][ Bldg. ]
```

- The pond becomes an impassable barrier shaping all routes
- The museum building is a permanent fort
- The tree rows provide stealth cover

### Implementation Notes

- `HexCell` gets a `TerrainType` enum field
- Terrain is fetched once at `StartGame()` and stored; no runtime API calls
- A single Overpass query covers the full grid bounding box
- For the FFA global map (1 hex ≈ 1 km²), terrain can be stored permanently alongside the `GlobalHex` row in PostgreSQL

---

## 2. Player Roles Within an Alliance

Each player chooses a role at game start, visible to their own team. Roles create specialisation and
encourage coordination.

| Role | Limit | Effect |
|------|-------|--------|
| **Commander** | 1 per team | While physically present at an attack: +1 die for the whole team in that hex |
| **Scout / Verkenner** | Unlimited | Sees troop counts of enemy hexes within radius 3 (breaks fog of war) |
| **Defender** | Unlimited | Hexes where this player is physically present regenerate troops 2× faster |
| **Saboteur** | Unlimited | Can drain enemy hexes slowly without triggering a formal attack |
| **Engineer** | Unlimited | Can build fortifications on own hexes (+1 permanent defence bonus) after staying 10 min |

---

## 3. Headquarters (HQ) Mechanic

Each alliance designates one hex as their HQ at game start.

- If the HQ is captured: the owning team **cannot claim new hexes for 5 minutes** and must recapture it first
- The HQ location can optionally be hidden from enemies at the start (discovered by scouting)
- Creates a clear strategic objective beyond pure territory count

---

## 4. Presence-Based Mechanics

Physical location of players directly affects game state.

### 4a. Occupation Requires Presence

A hex left unoccupied (no team member physically present) slowly loses troops — desertion after
~10 minutes. Forces teams to garrison key positions rather than abandoning them.

### 4b. Troop Transport

Troops can be moved between hexes, but only by physically walking the route. Reinforcements cost
real travel time. (`CarriedTroops` already exists in the model.)

### 4c. Sabotage

A player physically standing on an enemy hex (without attacking) causes slow troop drain as long as
they remain. Forces the defender to chase them away.

### 4d. Coordinated Group Attack (Charge)

If 3 or more team members are simultaneously in adjacent hexes during an attack: **mass charge** —
+2 dice for the attacker. Rewards planned coordinated movement.

### 4e. Physically-Gated Attacks

A hex can only be attacked if at least 1 team member is physically in an adjacent hex. Prevents
remote play from a safe position.

---

## 5. Fog of War

Players only see hexes adjacent to their own or allied hexes. The rest of the map is hidden.

- Scouts with the Verkenner role can extend visibility range
- Espionage missions (see below) temporarily reveal enemy troop counts
- Implemented by sending a **per-player filtered grid snapshot** from `GetStateSnapshot()`

---

## 6. Supply Lines

A hex not **connected** (via a contiguous chain of own hexes) to the team's starting position is
considered isolated:

- Isolated hexes do not regenerate troops
- Isolated hexes defend with −1 die
- Encourages coherent territory growth rather than random grabbing
- Uses existing `HexService` graph logic

---

## 7. Timed Escalation

Every 30 minutes, the troop regeneration rate increases for everyone. The early game is slow and
strategic; the final hour sees mass movements and rapid shifts. Creates a natural climax.

---

## 8. Underdog Pact (Anti-Snowball)

If one alliance controls more than 60% of the map, the remaining alliances automatically gain a
temporary joint bonus (e.g. +1 die on all attacks against the dominant team) until the balance is
restored. Keeps all teams engaged until the end.

---

## 9. Neutral NPC Hexes

Some hexes (typically buildings detected from OSM) start with a small number of neutral defenders
(no owner). Both teams can see them. Capturing one costs effort but grants a permanent bonus. Creates
early-game race objectives.

---

## 10. Timed Random Events

Every ~30 minutes a random event triggers, announced 2 minutes in advance:

| Event | Effect |
|-------|--------|
| **Calamity** | A random hex loses all troops |
| **Epidemic** | The team with the most hexes loses 2 troops on a random hex |
| **Diplomatic Opening** | All active ceasefires are extended by 5 minutes |
| **Bonus Troops** | Every team receives +2 troops to place freely |
| **Rush Hour** | For 5 minutes, every claimed hex counts double for the final score |

---

## 11. Mission System

A layered mission system running on top of the core territory game.

### Mission Layers

| Layer | Frequency | Visibility |
|-------|-----------|------------|
| **Main objective** | Entire game | Both teams (e.g. "most territory after 3 hours") |
| **Interim mission** | Every 30–45 min | Both teams simultaneously — a race |
| **Secret team mission** | Every 60 min | Own team only |
| **Personal mission** | Once per player | That player only |

---

### Territorial Missions

- **Hold the Hill** — Claim and hold a specific hex (e.g. highest elevation point) for 10 consecutive
  minutes. Reward: +5 troops for the whole team.
- **Divide and Conquer** — Ensure no enemy hex connects the left and right halves of the map.
  Reward: all enemy hexes on the smaller half lose 1 troop.
- **Encirclement** — Surround an enemy hex completely with own hexes. That hex falls automatically
  without combat.

---

### Reconnaissance Missions

- **Espionage** — A Scout physically enters an enemy hex with no enemy present and stays 60 seconds.
  Reward: team sees all enemy troop counts for 5 minutes.
- **Find the HQ** — The enemy HQ is hidden at game start. First team to physically locate it gains a
  persistent attack bonus against that hex.

---

### Time-Bound Missions

- **Flag Planting** — A neutral hex becomes "the flag". First team to claim it and hold it for
  15 minutes wins a major bonus (e.g. doubled troop regeneration for 10 minutes).
- **Last Defender** — After 3 hours, one random own hex is designated the "crown jewel". Holding it
  through the final 20 minutes grants a score bonus.
- **Rush Hour** *(also a random event)* — For 5 minutes, claimed hexes count double. Announced
  2 minutes ahead.

---

### Role / Skill Missions

- **Convoy** — A designated "courier" player must physically walk from hex A to hex B escorted by
  their team. Reward on arrival: a large troop package. The enemy tries to block the route.
- **Eliminate the Commander** — Capture the hex where the enemy Commander is standing. Reward: that
  player loses their Commander role for 15 minutes.
- **Build the Fort** — An Engineer must remain uninterrupted on the same hex for 10 minutes to
  convert it into a permanent fort.

---

### Social / Scout-Culture Missions

- **Double Agent** — One player is secretly designated a "traitor" at game start. They are on team A
  but may once, without penalty, surrender one own hex to team B. No one knows who it is until it
  happens.
- **Parley** — Both teams must send a negotiator to a central neutral hex. If both arrive
  simultaneously: 5-minute ceasefire that benefits both (e.g. +2 troops on all border hexes).
- **Rumour Mill** — The app shows one team a piece of intelligence that is sometimes true, sometimes
  false (e.g. "Enemy is advancing north"). Keeps decision-making uncertain and fun.

---

### Personal Mission Examples

Small individual objectives visible only to that player:

- "Spend the next 20 minutes only in forest hexes"
- "Be the first player on team to capture a building hex"
- "Shadow the enemy Commander for 5 minutes without being in combat"
- "Escort a teammate carrying troops across 3 hexes"

---

## Implementation Priority (Suggested)

| Feature | Strategic Impact | Implementation Size |
|---------|-----------------|---------------------|
| Terrain types (OSM + topo) | High | Medium |
| HQ mechanic | High | Small |
| Player roles | High | Medium |
| Fog of war | High | Medium |
| Mission system (interim + team) | High | Large |
| Presence-based troop decay | High | Medium |
| Supply lines | High | Medium–Large |
| Timed escalation | Medium | Small |
| Timed random events | Medium | Small |
| Underdog pact | Medium | Small |
| Neutral NPC hexes | Medium | Small |
| Group charge bonus | Medium | Small |
| Personal missions | High (experience) | Large |
