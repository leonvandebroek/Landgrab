# Tricorder Map V2 State Spec

## Purpose

This document defines a compact, field-usable tile state system for Landgrab’s physical-world map UI.

The goal is to make the map behave like a **player tricorder**, not a decorative strategy board. A player moving outdoors should be able to answer these questions in 1–3 seconds:

1. Where am I?
2. What am I targeting?
3. Can I act here right now?
4. Is this urgent?
5. Is timed progress happening here?
6. What strategic structure is this?
7. How strong is this tile?

## Core visual contract

Every tile should be read through this stable rendering pipeline:

1. **Base fill** → ownership
2. **Primary border** → current player position
3. **Secondary border** → selected target
4. **Outer halo / pulse** → urgent objective
5. **Progress ring** → timed on-site action
6. **Top glyph** → structural identity
7. **Center badge** → troop count
8. **Small chip** → reachability / special modifier

Each visual channel should have exactly one job.

## State categories

### 1. Base ownership state

- `neutral`
- `allied`
- `enemy`

**Meaning:** whose tile is this?  
**Visual channel:** fill color  
**Rule:** ownership is the stable foundation; avoid using fill for temporary mission states.

### 2. Player relation state

- `current`
- `selectedFriendly`
- `selectedHostile`
- `reachable`
- `unreachable`

**Meaning:** where am I, what am I targeting, can I act there now?  
**Visual channel:** border + small chip

### 3. Tactical urgency state

- `contested`
- `raidObjective`
- `rallyObjective`
- `presenceCritical`
- `presenceSatisfied`

**Meaning:** should I care about this right now?  
**Visual channel:** outer halo and/or compact status chip

### 4. Timed physical-progress state

- `buildProgress`
- `demolishProgress`
- `sabotageProgress`
- `regenBlocked`
- `claimFreeze`

**Meaning:** standing here or defending this tile is doing something over time.  
**Visual channel:** one shared progress-ring language + optional chip

### 5. Strategic structure state

- `hq`
- `fort`
- `master`
- `raidOnlyObjective` (semantic modifier)

**Meaning:** what durable strategic identity does this tile have?  
**Visual channel:** top glyph + subtle structure styling

### 6. Numeric strength state

- `troopsVisible`

**Meaning:** how strong is this tile?  
**Visual channel:** center badge  
**Rule:** only visible when zoom/prefs/clutter budget allow it.

## State-to-UI spec

| State | Trigger | Where shown | Visual style | Wins over | Loses to | Status |
|---|---|---|---|---|---|---|
| `neutral` | `!cell.ownerId` | tile base | muted neutral fill | nothing | almost everything | existing |
| `allied` | owned by player or alliance | tile base | allied color fill | `neutral` | current/selected/urgency/progress | existing |
| `enemy` | hostile ownership | tile base | hostile color fill | `neutral` | current/selected/urgency/progress | existing |
| `current` | player standing in tile | primary tile border | strongest bright scanner border | all other border states | nothing | existing |
| `selectedFriendly` | selected allied tile | secondary border | cyan/blue border | generic selection | `current` | existing-ish |
| `selectedHostile` | selected enemy tile | secondary border | red/amber border | generic selection | `current` | existing-ish |
| `reachable` | selected tile valid for intended action now | chip / border accent | compact green/cyan ready signal | `unreachable` | current/selected/objective | new |
| `unreachable` | selected tile not actionable yet | chip / border accent | amber move/range signal | none | current/selected/objective | new |
| `contested` | tile is frontline/contested | outer halo | subtle hazard shimmer | structure-only emphasis | raid/progress/current/selected | existing |
| `raidObjective` | active raid target | outer halo + objective glyph | loud mission pulse | `contested`, structure emphasis | `current` primary border | existing partial |
| `rallyObjective` | active rally point | outer halo + ring + glyph | convergence beacon | `contested`, structure emphasis | `current`, selected border | new |
| `presenceCritical` | more bodies needed on-site | chip | amber count like `2/3` | reachability chip | current/selected/objective | new |
| `presenceSatisfied` | copresence requirement met | chip | green `3/3` / check marker | `presenceCritical` | current/selected/objective | new |
| `buildProgress` | engineer build active | progress ring | timed ring + build icon | contested styling | current/selected/objective | existing |
| `demolishProgress` | demolish active | progress ring | same ring grammar, new color/icon | contested styling | current/selected/objective | new / scaffolded CSS only |
| `sabotageProgress` | sabotage active | progress ring | same ring grammar, red/orange sabotage ring | contested styling | current/selected/objective | new |
| `regenBlocked` | sabotaged / regen disabled | chip + subtle border texture | degraded-state indicator | structure-only emphasis | current/selected/objective/progress | new |
| `claimFreeze` | alliance claim lock active | HUD + optional tile/HQ marker | freeze chip / alert | nothing local | current/selected/objective | new |
| `hq` | tile is HQ | top glyph + subtle border trait | HQ identity | no structure | urgency/progress/current/selected | existing |
| `fort` | `cell.isFort` | top glyph | fort identity | no structure | urgency/progress/current/selected | existing |
| `master` | `cell.isMasterTile` | top glyph | master/crown identity | no structure | urgency/progress/current/selected | existing |
| `raidOnlyObjective` | special rule requires raid | chip or tooltip pill | explicit `RAID` semantic tag | none | current/selected/active raid | new |
| `visibilitySource` | active beacon / observer | player marker + radius | soft reveal field + beacon glyph | nothing | local tile states | partial |
| `revealedByObserver` | tile visible because of observer | subtle tile treatment or tooltip | faint scan texture / info chip | hidden state | local urgency/current/selected | new |
| `troopsVisible` | zoom + prefs allow troop counts | center badge | count badge/pip | no numeric state | semantic layers | existing |

## Precedence rules

### Border precedence

1. `current`
2. `selectedHostile` / `selectedFriendly`
3. structure border traits
4. contested border traits

### Halo precedence

1. `raidObjective`
2. `rallyObjective`
3. timed mission urgency if needed
4. `contested`

### Progress precedence

Only one ring per tile.

1. `sabotageProgress`
2. `demolishProgress`
3. `buildProgress`
4. rally countdown if ring-based

### Chip precedence

1. `presenceCritical` / `presenceSatisfied`
2. `reachable` / `unreachable`
3. `regenBlocked`
4. `raidOnlyObjective`

## Non-negotiable UX rules

- Current hex must never lose its primary border.
- Selection must remain legible even on urgent tiles.
- Only one animated urgency layer per tile.
- All timed mechanics should share one progress metaphor.
- Reachability must not live only in panel text.
- Temporary tactical meaning should not replace ownership fill.

## Priority rollout

### Phase A — highest field value

- `reachable`
- `unreachable`
- `rallyObjective`
- `sabotageProgress`
- `regenBlocked`

### Phase B — coordination and visibility

- `visibilitySource`
- reveal radius
- `presenceCritical`
- `presenceSatisfied`

### Phase C — rule clarity

- `raidOnlyObjective`
- `claimFreeze`
- `revealedByObserver`

## Key rationale

This state model is intentionally compact.

It makes the map feel like:

- a field instrument
- a tactical scanner
- a physical-presence navigation aid

instead of:

- a visually rich but cognitively expensive strategy board

The rule of thumb is:

**Ownership uses fill, self/target use border, urgency uses halo, timed actions use one shared progress ring, structures use top glyphs, and chips answer “can I do this / do we have enough people / is this disabled?”**
