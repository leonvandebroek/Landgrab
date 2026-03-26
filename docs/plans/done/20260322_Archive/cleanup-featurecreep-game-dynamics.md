# Cleaning up the game dynamics feature-creep

This document inventories the current optional gameplay systems that have accumulated around the core Landgrab loop.

The goal is to separate:

- the mechanics that make the game clearer and stronger,
- from the mechanics that add novelty but also complexity, overlap, maintenance cost, or partial implementations.

This inventory is based on the current code in the backend and frontend, not on older design notes alone.

## All available features before cleanup

### Named presets

These presets are server-defined bundles of copresence modes.

- `Klassiek` — no copresence mechanics
- `Territorium` — `Shepherd`, `Drain`
- `Formatie` — `FrontLine`, `Rally`
- `Logistiek` — `Shepherd`, `Relay`, `FrontLine`
- `Infiltratie` — `Stealth`, `CommandoRaid`, `Scout`
- `Chaos` — `JagerProoi`, `Duel`, `PresenceBonus`
- `Tolweg` — `Beacon`, `Toll`, `Drain`
- `Aangepast` — custom host-selected combination

### Copresence modes

These are the main "extra mechanics" layer and the biggest source of feature-creep.

- `Standoff` — hostile presence blocks tile actions
- `PresenceBattle` — hostile presence gradually contests and can capture a tile
- `PresenceBonus` — physical presence grants an attack bonus
- `Ambush` — hostile presence interrupts troop pickup and causes troop loss
- `Toll` — entering an enemy tile with its owner present costs carried troops
- `Duel` — hostile copresence can trigger a duel challenge
- `Rally` — 2+ allied players on a tile fortify it for defence
- `Drain` — hostile presence blocks regeneration on a tile
- `Stealth` — temporary invisibility, broken by hostile copresence
- `Hostage` — detain an enemy player in the same tile
- `Scout` — first-time visits to hexes grant bonus troops
- `Beacon` — extend allied claim range from a marked position
- `FrontLine` — allied presence in adjacent tiles boosts attack
- `Relay` — intended remote support/reinforcement mechanic; currently not really implemented
- `JagerProoi` — hunter/prey minigame with rotating prey target and rewards
- `Shepherd` — owned tiles decay if not revisited often enough
- `CommandoRaid` — timed distant neutral capture that bypasses normal adjacency

### Feature toggles

These are broader optional systems beyond copresence.

- `TerrainEnabled` — terrain affects defence, movement, and some regen behavior
- `PlayerRolesEnabled` — enables role assignment with role-specific powers
- `FogOfWarEnabled` — each player sees a filtered view of the map
- `SupplyLinesEnabled` — disconnected territory stops regenerating
- `HQEnabled` — alliances can have capturable headquarters with a claim-freeze penalty
- `TimedEscalationEnabled` — regen scales upward over time
- `UnderdogPactEnabled` — attacks on dominant teams get a comeback bonus
- `NeutralNPCEnabled` — some tiles start as neutral NPC-held tiles
- `RandomEventsEnabled` — periodic global events can affect the board
- `MissionSystemEnabled` — rotating objectives grant rewards

### Player roles

Only active when `PlayerRolesEnabled` is turned on.

- `Commander` — grants an attack bonus when present
- `Scout` — first visits grant bonus troops to the nearest owned tile
- `Defender` — boosts regeneration when physically present on owned territory
- `Saboteur` — drains enemy tiles while standing on them
- `Engineer` — can build permanent forts by holding position long enough

### Abilities exposed through the dynamics system

These are effectively active powers even though they are wired through copresence or role-related systems.

- `Beacon` activation
- `Stealth` activation
- `CommandoRaid` activation
- `Hostage` detention action

### Random event types

If random events stay enabled, the currently supported event set is:

- `Calamity` — a random owned tile loses all troops
- `Epidemic` — the leading alliance loses troops on a random tile
- `BonusTroops` — teams receive bonus troops
- `RushHour` — claimed tiles temporarily count double, though the current implementation is rough

### Mission templates

If the mission system stays enabled, the currently defined objectives include:

- Main mission: `Hold the Hill`
- Team missions:
  - `Divide and Conquer`
  - `Encirclement`
  - `Territory Rush`
- Personal missions:
  - `Scout Patrol`
  - `Frontline Fighter`
  - `Fortifier`
- Interim missions:
  - `Flag Planting`
  - `Last Defender`

### Notable maturity / cleanup notes

- `Relay` is present in presets and UI, but not meaningfully implemented in gameplay
- `NeutralNPC` is lightweight and mostly seeds NPC-owned tiles rather than creating a real faction
- `MissionSystem` works, but some objective progress is approximate rather than deeply tracked
- `RushHour` exists, but its duration/behavior is rough compared to the wording shown to players
- Several systems overlap conceptually:
  - `Scout` mode vs `Scout` role
  - `Beacon`, `CommandoRaid`, and `Stealth` as active powers inside the broader dynamics menu
  - `Duel`, `Hostage`, and `JagerProoi` as encounter-based subgames layered on top of the main territory game

## To keep

These are the strongest candidates to keep because they add strategic depth without radically fragmenting the ruleset.

### Keep as default candidates

- `Klassiek` preset
- `Formatie` preset
- `TerrainEnabled`
- `FogOfWarEnabled`
- `SupplyLinesEnabled`
- `HQEnabled`
- `Rally`
- `FrontLine`
- `Shepherd`
- `Beacon`
- `TimedEscalationEnabled`
- `UnderdogPactEnabled`


- `PlayerRolesEnabled`
- Roles:
  - `Commander`
  - `Defender`
  - `Engineer`
- `Scout` mode or `Scout` role, but preferably not both in their current overlapping form
- `CommandoRaid`
- `Drain`

### Why these are the best keep candidates

- They reinforce the core game of territory pressure, positioning, and map control
- They are easier to explain than the more exotic encounter systems
- They create meaningful tradeoffs without introducing entirely separate subgames
- Most of them are implemented solidly enough to justify keeping

## To remove

These are the strongest candidates to remove first because they are incomplete, overlapping, difficult to explain, or feel like separate game modes bolted onto the main one.

### Remove first

- `Relay`
- `NeutralNPCEnabled`
- `Duel`
- `Hostage`
- `JagerProoi`
- `RandomEventsEnabled`
- `MissionSystemEnabled`

### Remove unless there is a strong product reason to keep them

- `Chaos` preset
- `Logistiek` preset
- `Tolweg` preset
- `PresenceBattle`
- `Ambush`
- `Toll`
- `Stealth`
- `Scout` mode or `Scout` role, if we do not consolidate them into one concept
- `Saboteur`

### Why these are the best removal candidates

- Some are only partially implemented or feel unfinished (`Relay`, `NeutralNPC`, parts of missions / rush-hour behavior)
- Some add large explanation cost for relatively niche payoff (`Duel`, `Hostage`, `JagerProoi`)
- Some create redundant or overlapping systems (`Scout` in two places, several active powers hidden inside the dynamics layer)
- Some push the game away from readable territory strategy and toward "what weird exception is active right now?"

### Sensible first cleanup pass

If the goal is to simplify without flattening the game, a pragmatic first pass would be:

1. Remove `Relay`
2. Remove `NeutralNPCEnabled`
3. Remove `Duel`
4. Remove `Hostage`
5. Remove `JagerProoi`
6. Remove `RandomEventsEnabled`
7. Remove `MissionSystemEnabled`
8. Consolidate the duplicate `Scout` concepts into one mechanic or remove one of them
9. Re-evaluate whether active powers (`Beacon`, `Stealth`, `CommandoRaid`) belong in the same system at all

That would leave a much cleaner strategy layer built around:

- terrain,
- fog of war,
- supply lines,
- HQ pressure,
- adjacency manipulation,
- and formation play.









