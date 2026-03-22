# Tricorder Enemy Visibility Specification

## Purpose

This document defines the desired final visibility model for what players should and should not be able to see about enemy alliances on the tricorder map.

It describes the intended end-state after implementation.

This is not a rollout plan, phased roadmap, or prioritization document. It is the target gameplay and UI specification.

## Core design goal

The tricorder should give players useful battlefield intelligence without giving them a referee-level omniscient map.

Enemy information should follow three principles:

1. Persistent world facts may become memory.
2. Live tactical facts require current visibility.
3. Private enemy state remains secret.

The chosen doctrine for this system is Proposal A: **Hard Fog, Earned Intel**.

That means:

- hard fog by default for hostile tactical information,
- optional short-lived sighting memory as a host-configurable room rule,
- dedicated intel or tracker mechanics for preserving or sharing enemy sightings,
- Beacon or Forward Observer remains a live reveal mechanic only,
- enemy memory is mostly per-player unless explicit sharing mechanics distribute it.

The map should feel like a field instrument, not a shared admin dashboard.

## Visibility model

Enemy information is governed by three visibility tiers.

### Visible now

A hostile hex, structure, player, or tactical event is currently inside the viewer's active vision.

Examples of active vision sources include:

- the viewer's own position,
- allied player positions,
- allied reveal abilities such as Forward Observer or Beacon,
- any future explicit reveal mechanics.

When enemy information is visible now, the viewer sees current live truth.

### Seen before

A hostile hex or object has been discovered previously, but is not currently inside active vision.

This tier represents memory, not live truth.

By default, remembered hostile information belongs to the individual player who discovered it. It becomes alliance-shared only through explicit intel-sharing or tracking mechanics.

### Unseen

A hostile hex or object has never been discovered, or is fully outside known or revealed space.

This tier represents fog or unknown space.

No actionable enemy intelligence should be exposed here beyond basic map geometry.

## Global rules

### Rule A — live truth requires visibility

The tricorder may only display current hostile tactical truth when the relevant enemy information is presently visible.

This applies especially to:

- troop strength,
- moving players,
- active tactical operations,
- temporary status effects,
- short-duration structure or ability progress.

### Rule B — memory is allowed, but must read as memory

Previously discovered enemy territory may remain on the map, but it must be visually distinct from live visible truth.

Remembered information should feel muted, stale, lower-confidence, and not immediately actionable unless re-confirmed.

### Rule C — unknown should stay unknown

When the player has not earned the information, the tricorder must not invent certainty.

If exact hostile strength, activity, or presence is not known, the display should show nothing, a generic unknown state, or an uncertainty marker such as `?`.

### Rule D — enemy secrecy matters more than UI convenience

The system must not leak hidden hostile information through badges, overlays, player markers, tooltips, info cards, event summaries, or stored hidden fields on the client.

### Rule E — allies always keep full allied truth

This document applies to hostile intel.

A player should continue to receive full relevant truth for:

- their own player state,
- allied territory,
- allied structures,
- allied players,
- allied tactical actions.

### Rule F — host observer mode is the exception

Host observer or referee-style modes may remain omniscient.

That exception must be explicit and separate from player visibility rules.

### Rule G — baseline sightings do not linger by default

Enemy player sightings should not, by default, leave a persistent last-known marker once ordinary visibility is lost.

If the game allows lingering sighting markers, that should happen only through:

- a host-configurable short-lived room rule, or
- a dedicated recon, intel, or tracker mechanic.

### Rule H — Beacon does not create baseline tracking memory

Beacon or Forward Observer may reveal current hostile space while active, but it does not, by itself, create persistent hostile tracking memory.

## Locked implementation decisions

The following decisions are considered fixed for implementation unless this
spec is revised later.

### Visibility math is hex-radius based

Current hostile visibility is determined by the union of:

- the viewer's current hex,
- allied player visibility footprints,
- active allied reveal sources.

This model does not assume terrain-based line-of-sight blocking or other
occlusion rules.

### Stale troop memory is enabled by default

If a hostile tile is visible and the viewer learns its troop count, the viewer
retains the exact last-seen troop number as remembered intel when that tile
leaves visibility.

That remembered troop value must:

- be styled as stale,
- be visually distinct from live truth,
- remain per-player unless explicitly shared,
- and be replaced only by a newer confirmed observation or an explicit shared
  update.

### Host sighting memory is default-off and player-only

The optional host sighting-memory rule is disabled by default.

If enabled, it applies only to hostile player sightings, not to troop counts,
tile operations, beacon state, or other tactical overlays.

When enabled, it must:

- preserve a stale last-known hostile player marker for a short configured
  duration,
- refresh that duration on renewed sighting,
- remain per-player unless an explicit sharing mechanic distributes it.

### Tracker and intel mechanics preserve memory, not live truth

Dedicated tracker or intel-sharing mechanics may preserve or distribute:

- hostile player last-known sightings,
- remembered ownership,
- remembered major structures,
- remembered stale troop counts.

They must not expose:

- hidden live hostile positions,
- hidden active operations,
- hidden live troop truth,
- hidden beacon activity state.

### Enemy beacon radius is not disclosed

Enemies may see a visible hostile beacon or reveal source marker when it is in
current vision.

Enemies should not see the exact reveal radius for that hostile source.

When the source leaves vision, only the last known beacon location may remain
as remembered intel.

### Memory ownership and sharing lifecycle are explicit

Hostile memory is created per-player by default.

When one player re-confirms hostile intel, that refresh applies only to that
player's remembered view unless an explicit sharing mechanic propagates it.

Shared hostile memory is a copied remembered record, not a live alliance-wide
subscription to hidden enemy truth.

### Hidden hostile events are suppressed

The baseline event system should not emit hostile notifications for actions in
hidden space.

Enemy event feedback is allowed only when:

- the event occurs in currently visible space, or
- the event directly and visibly affects the viewer or allied visible assets.

## Desired information policy by category

### Territory ownership

#### Territory ownership while visible now

The viewer should see exact hostile owner or alliance identity, current hostile territory color, and whether the tile is hostile, neutral, allied, or self-owned.

#### Territory ownership when seen before

The viewer should see last known hostile owner or alliance, last known hostile territory color, and a muted memory presentation.

#### Territory ownership when unseen

The viewer should see no enemy ownership certainty, or only a fogged or unknown tile state.

#### Territory ownership interpretation

Ownership is the most acceptable enemy fact to preserve as stale memory. It helps players remember battlefield shape without giving away full live tactical state.

### Troop counts and strength

#### Troop counts while visible now

The viewer should see the exact current troop count when the hostile tile is truly visible, plus any normal structure-modified presentation.

#### Troop counts when seen before

The viewer may see the exact last-seen troop number, but it must be clearly marked as stale or remembered and visually distinct from live visible strength.

#### Troop counts when unseen

The viewer should see no troop information at all.

#### Troop count interpretation

Exact hostile strength as current truth is live tactical information and must not remain globally known once visibility is lost.

If last-seen troop memory is retained, it must read unambiguously as remembered intel rather than live truth.

### Major structures

This includes HQ, Fort, Master tile, and any future major static landmark.

#### Major structures while visible now

The viewer should see exact structure type, exact current structure marker or glyph, and any currently visible structure-related tactical state that is relevant.

#### Major structures when seen before

The viewer may continue to see the last known major structure identity and a muted or remembered structure glyph.

#### Major structures when unseen

The viewer should see no structure certainty, or a fully hidden or fogged state.

#### Major structure interpretation

Large strategic landmarks may persist in memory after discovery. They must not automatically reveal the current tactical state around them.

### Enemy player positions

#### Enemy players while visible now

The viewer should see live enemy player marker positions and any styling normally used for visible players.

#### Enemy players when seen before

The viewer should see no retained live player marker by default.

A stale last-known marker may exist only if:

- the room enables short-lived sighting memory, or
- a dedicated intel or tracker mechanic preserves the sighting.

#### Enemy players when unseen

The viewer should see no enemy player markers.

#### Enemy player interpretation

Enemy player location is among the most sensitive tactical information in the game. It should disappear as soon as the player is no longer visible.

If short-lived sighting memory exists, it must read as uncertain, stale, and not equivalent to live tracking.

### Beacon and reveal sources

#### Reveal sources while visible now

The viewer should see the enemy beacon or reveal source if it is currently
observable and its active local visual representation.

The viewer should not see the exact reveal radius for a hostile reveal source.

#### Reveal sources when seen before

The viewer may remember the last known beacon location only.

The viewer should not retain:

- live beacon state,
- remembered reveal radius,
- certainty that the beacon is still active.

#### Reveal sources when unseen

The viewer should see no beacon information.

#### Reveal source interpretation

Reveal sources are active tactical assets, not stable world facts. Their active reveal state should not remain globally known after visibility is lost.

Remembering only the last seen location is acceptable as stale battlefield knowledge.

### Tactical operations and temporary actions

This includes Commando Raid targets, sabotage, demolish, build progress, rally objectives, and other temporary tactical effects.

#### Tactical operations while visible now

The viewer should see live tactical overlays, progress indicators, urgency halos, and relevant icons and warning states.

#### Tactical operations when seen before

The viewer should not retain live tactical overlays, remembered progress rings, or inferred continuation of the action.

#### Tactical operations when unseen

The viewer should see nothing about the tactical operation.

#### Tactical operations interpretation

Temporary hostile tactical actions are live battlefield intelligence and must require current vision. The tricorder must not preserve these as stale certainty.

### Contested and frontline states

#### Frontline state while visible now

The viewer should see live contested edges, visible frontline indicators, and any conflict intensity or directional cues that apply locally.

#### Frontline state when seen before

The viewer may see at most a faint remembered frontier hint, but never a live contested indicator represented as current truth.

#### Frontline state when unseen

The viewer should see no frontline or contested-state intel.

#### Frontline interpretation

Frontline memory can help orientation, but current conflict state must remain tied to visibility.

### Temporary status effects on hostile tiles

This includes sabotage active or regeneration blocked, temporary corruption-like state, and short-duration tactical disablement.

#### Tile effects while visible now

The viewer should see the exact active hostile tile status if visible.

#### Tile effects when seen before

The viewer should not retain certainty that the effect remains active.

#### Tile effects when unseen

The viewer should see no hostile temporary status information.

#### Tile effect interpretation

Short-lived hostile tile effects are tactical live truth, not memory.

### Enemy cooldowns, roles, and private capability state

This includes private cooldown timers, hostile ability readiness, hostile role internals not manifested on the map, and hidden tactical resource state.

#### Private hostile capability while visible now

The viewer should generally not see this information directly unless it has an explicit, intended, visible manifestation in the world.

#### Private hostile capability when seen before

The viewer should see nothing.

#### Private hostile capability when unseen

The viewer should see nothing.

#### Private hostile capability interpretation

Private hostile state remains private unless it materializes into a visible world effect.

### Event log and notification visibility

#### Event log while visible now

If an enemy event is intentionally public because it happened in visible space, the viewer may receive local visible event feedback and tactically justified notifications.

#### Event log when seen before or unseen

The viewer should not receive globally revealing enemy notifications such as
exact hostile action targets outside visibility, exact hostile structure
progress outside visibility, or hidden hostile troop or movement details.

#### Event log interpretation

The event log must not become a side-channel that defeats fog-of-war.

### Info cards, tooltips, and hover surfaces

#### Detail surfaces while visible now

Info cards and tooltips may show the same live hostile truth the map is allowed to show.

#### Detail surfaces when seen before

Info cards and tooltips may show remembered ownership, remembered landmark information, and remembered troop counts where allowed, but tactical details must remain hidden or uncertain.

#### Detail surfaces when unseen

Info cards and tooltips should not reveal hidden hostile data.

#### Detail surface interpretation

A tile must not be fogged on the map but fully explained in a tooltip. No backdoor omniscience.

### Minimap and alternate map surfaces

The same hostile visibility policy must apply consistently to the main tricorder map, minimaps, overlays, summaries, and alternate tactical surfaces.

No secondary surface may be more omniscient than the main player map unless it is an explicit observer or admin feature.

## Visual language requirements

### Live visible hostile intel

Hostile intel that is currently visible should read as strong contrast, current color, active overlays where appropriate, and exact badges and glyphs.

### Remembered hostile intel

Remembered hostile intel should read as muted or desaturated, lower-confidence, not immediately actionable, and visually distinct from live visible truth.

### Hidden hostile space

Hidden hostile space should read as obscured, minimal, detail-free, and clearly not trustworthy as tactical knowledge.

### Unknown is not zero

When hostile data is hidden, the UI must not imply zero troops, no structure, no activity, or safety. Unknown should be communicated as unknown.

## Summary rules by state

- Ownership: visible now exact, seen before last known, unseen hidden or unknown.
- Troops: visible now exact, seen before exact last-seen with stale styling, unseen hidden.
- Major structures: visible now exact, seen before remembered, unseen hidden.
- Enemy players: visible now live marker, seen before hidden by default and only preserved via room rule or tracker mechanic, unseen hidden.
- Beacon or reveal source: visible now visible, seen before last known location only, unseen hidden.
- Raids, sabotage, demolish, build, rally, or tactical progress: visible now exact live overlays, seen before hidden, unseen hidden.
- Contested or frontline state: visible now live, seen before optional faint memory only, unseen hidden.
- Enemy private role or cooldown state: hidden unless materially manifested.

## Final end-state statement

In the intended finished tricorder system:

- players keep full truth about themselves and allies,
- players get full truth about enemies only when those enemies are currently visible,
- players retain limited remembered knowledge of discovered hostile territory, landmarks, last-seen troop counts, and last seen beacon locations where allowed,
- enemy player sightings do not linger by default after ordinary visibility is lost,
- optional short-lived sighting memory is a room-level rule rather than a baseline assumption,
- dedicated intel or tracker mechanics may preserve or share enemy sightings,
- hostile memory is mostly per-player unless explicit sharing mechanics distribute that knowledge,
- all other hostile tactical information returns to uncertainty when line-of-sight or reveal is lost.

The final experience should support physical-world play by making the map tactically useful, readable outdoors, strategically uncertain, and fair to both alliances.
