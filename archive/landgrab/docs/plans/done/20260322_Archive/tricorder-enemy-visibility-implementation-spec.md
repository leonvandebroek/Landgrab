# Tricorder Enemy Visibility Implementation Specification

## Purpose

This document defines the technical implementation target for the enemy visibility system described in `tricorder-enemy-visibility-spec.md`.

It translates the desired gameplay end-state into:

- backend responsibilities,
- frontend responsibilities,
- data-shape requirements,
- filtering rules,
- rendering rules,
- consistency rules across all UI surfaces.

This is not a phased rollout plan. It describes the intended implementation end-state.

## Relationship to the gameplay spec

The companion document `tricorder-enemy-visibility-spec.md` defines what enemy players should and should not see.

This document defines how the system should enforce and render that model.

If the two documents ever appear to conflict:

- the gameplay spec defines the intended player experience,
- this implementation spec defines the correct system behavior needed to realize it.

## Primary architectural rule

Enemy visibility must be enforced server-side first.

The client must not receive hidden hostile information and then merely choose not to render it.

The chosen doctrine is Proposal A: **Hard Fog, Earned Intel**.

That means:

- hard fog by default for hostile tactical information,
- optional host-configured short-lived sighting memory,
- explicit intel or tracker mechanics for preserving or sharing sightings,
- Beacon or Forward Observer treated as a live reveal mechanic rather than a tracking-memory mechanic.

### Security requirement

The system must not rely on frontend-only hiding for any hostile information that is meant to be secret.

That means:

- no full omniscient `GameState` sent to ordinary players,
- no hidden enemy troop counts preserved in client state when not visible,
- no hidden enemy player coordinates preserved in client state when not visible,
- no hidden tactical arrays or timers sent to the client unless the viewer is allowed to know them.

### Explicit exception

Host observer, admin, or referee modes may receive omniscient state by explicit design.

## Required visibility model in code

Every viewer must receive a viewer-specific state projection.

The system must stop treating a room state snapshot as a universal payload for all participants during active gameplay.

### Required concepts

The implementation must introduce a viewer-aware visibility layer that can answer, for any viewer and any enemy datum:

- is this currently visible?
- is this remembered?
- is this hidden?
- is any remembered hostile player sighting preserved only because of a room rule or a tracker mechanic?

### Required tiers in code

At minimum, the implementation must support these logical tiers:

- `visible`,
- `remembered`,
- `hidden`.

The exact enum or string names may differ, but the behavior must match these three categories.

In addition, the implementation must distinguish between:

- ordinary visibility,
- optional host-configured sighting memory,
- deliberate intel or tracker-based sight preservation.

## Locked implementation decisions

The following decisions are fixed enough to guide implementation directly.

### Visibility calculation model

Current visibility should be calculated as the union of:

- the viewer's own visible footprint,
- allied player visible footprints,
- active allied reveal-source footprints.

This implementation does not require terrain-based line-of-sight blocking or
occlusion logic.

### Room rule for hostile sighting memory

The room should expose a host-configurable setting equivalent to
`enemySightingMemorySeconds`.

Its behavior is:

- default value `0`, meaning disabled,
- any positive value preserves a stale hostile player sighting marker for that
  many seconds after visibility is lost,
- it applies only to hostile player sightings,
- it refreshes on renewed sighting,
- it remains per-player unless explicit sharing mechanics propagate it.

### Stale troop memory behavior

Remembered hostile troop counts are enabled by default once a hostile tile has
been directly observed.

The remembered value is the exact last-seen troop count, projected as stale
memory rather than live truth.

This remembered value should be updated only by:

- a newer direct observation,
- or an explicit shared intel update.

### Tracker and intel-sharing contract

Dedicated tracker or intel-sharing mechanics may preserve or distribute:

- last-known hostile player sightings,
- remembered ownership,
- remembered major structures,
- remembered stale troop counts.

They must not project hidden live truth. In particular, they must not expose:

- hidden current hostile positions,
- hidden current troop totals beyond remembered values,
- hidden active beacon state,
- hidden tactical operations in progress.

### Enemy beacon disclosure contract

For hostile viewers, a visible beacon or reveal source may be rendered as a
source marker only.

The hostile payload should not include an exact beacon reveal radius.

When the beacon is no longer visible, only the last known beacon location may
remain in remembered state.

### Memory ownership lifecycle

Hostile remembered information should be stored per-player by default.

When a player re-observes hostile intel, only that player's remembered record
is refreshed unless an explicit sharing mechanic copies the refreshed memory to
other recipients.

Sharing hostile intel copies remembered data; it does not create a hidden live
subscription to future enemy state changes.

### Event filtering contract

Hidden hostile events should be suppressed in the baseline event feed.

Enemy event feedback may be emitted only when:

- the event occurred in currently visible space,
- or the event directly and visibly affected the viewer or allied visible
  assets.

The baseline implementation should prefer suppression over vague hidden-space
alerts, because vague alerts still risk becoming side channels.

## Required backend responsibilities

### Viewer-aware snapshot generation

The backend must generate a state snapshot specifically for the viewing player.

It must build state based on:

- viewer user id,
- viewer alliance id,
- viewer current position,
- allied visible and reveal sources,
- host observer status,
- remembered hostile knowledge rules,
- host-configured sighting-memory rules,
- explicit intel-sharing or tracker effects.

The architecture should include a concept equivalent to:

- `BuildStateForViewer(...)`,
- `BuildVisibilityProjection(...)`,
- `ApplyFogOfWarToState(...)`,
- `GetHexVisibilityTier(...)`.

### Hex-level visibility classification

For each hostile hex, the backend must determine a visibility classification for the current viewer.

Classification should be based on:

- viewer location,
- allied player locations,
- allied reveal abilities and reveal radii,
- any future explicit reveal mechanics,
- whether the hex has been discovered previously by the viewer,
- whether any explicit intel-sharing mechanic has propagated that memory to allies.

Each hostile hex must be classified as one of:

- `visible`,
- `remembered`,
- `hidden`.

### Hostile data filtering before transport

Filtering must happen before data is sent over SignalR.

If hostile data is hidden for a viewer, it must not be present in the viewer payload in usable form.

Depending on the field, the backend may:

- omit it,
- null it,
- replace it with a remembered value,
- replace it with an unknown value,
- emit a derived visibility-safe representation.

The backend must not:

- send the live hostile value and rely on the client to ignore it,
- preserve hidden enemy coordinates or troop counts in the normal client payload,
- leak hidden hostile data through alternate collections or nested objects.

### Memory handling

Remembered hostile knowledge must be an explicit system concept, not an accidental side effect.

When a hostile hex leaves visibility, the backend must be able to project remembered information such as:

- last known owner or alliance,
- last known structure landmark,
- remembered territory coloration,
- last known troop count where stale troop memory is allowed,
- last known beacon location where beacon location memory is allowed.

Remembered hostile information should be per-player by default.

Alliance-wide hostile memory should only be produced when an explicit intel-sharing or tracking mechanic authorizes it.

Remembered data must never be indistinguishable from live visible truth.

### Tactical secrecy enforcement

The backend must treat tactical enemy information as visibility-gated live truth.

This includes at minimum:

- exact troop counts,
- enemy player positions,
- enemy beacon positions and active reveal state,
- raid targets,
- sabotage, build, or demolish progress,
- temporary tile status effects,
- active tactical urgency states.

Ordinary visibility loss must not, by default, preserve hostile player markers as if they were still live.

If hostile tactical state is not currently visible, it must not be sent as live truth and must not be reconstructable by the client from other fields.

### Event and notification filtering

Visibility filtering must also apply to non-map channels.

Notifications, event log entries, and side messages must not reveal hidden hostile information outside allowed visibility.

Examples of forbidden leakage include:

- exact hostile action target outside visible space,
- exact hostile sabotage completion on unseen tile,
- precise hostile troop movement outside visibility,
- hidden enemy ability activation details with location context.

If the game supports host-configured short-lived sighting memory or explicit intel-sharing abilities, events may surface those outcomes only in ways consistent with the same rules.

## Required frontend responsibilities

### Render only visibility-safe state

The frontend must assume the backend payload is already filtered for hostile secrecy.

The frontend is responsible for presentation fidelity, not hostile secrecy enforcement.

It must correctly render `visible`, `remembered`, and `hidden` distinctions without depending on hidden hostile truth being locally available.

### Distinct rendering for the three visibility tiers

Visible hostile information should render as:

- live,
- strong contrast,
- current overlays,
- exact badges and glyphs,
- exact player markers where allowed.

Remembered hostile information should render as:

- muted or desaturated,
- visually lower-confidence,
- no live tactical overlays,
- stale troop truth where remembered troop counts are allowed,
- no live enemy movement.

By default, remembered hostile player sightings should not render at all unless a room rule or dedicated intel or tracker mechanic has explicitly preserved them.

Hidden hostile information should render as:

- obscured, fogged, or unknown,
- minimal,
- non-tactical,
- non-misleading.

### Unknown must be visually explicit

If a hostile value is hidden, the UI must not silently convert it into a false concrete value.

Hidden hostile information must display as one of:

- absent,
- unknown,
- explicitly remembered.

If stale troop memory is shown, it must be unmistakably styled as last-known rather than live.

### Surface consistency

All surfaces that can expose enemy map information must obey the same visibility rules.

This includes at least:

- main map tiles,
- troop badges,
- structure glyphs,
- player markers,
- tile overlays,
- progress rings,
- tile info cards,
- tooltips,
- minimap,
- alternate tactical views,
- event feed or local action feedback if hostile data is involved.

No secondary UI surface may reveal hostile data that the main map is not allowed to reveal.

## Required data-shape behavior

### Hex data

The outgoing hex representation for a viewer must support the ability to distinguish:

- live visible enemy data,
- remembered enemy data,
- hidden enemy data.

A tile renderer must be able to know not only the current tile content, but also whether that content is live, remembered, or hidden.

Acceptable approaches include:

- explicit visibility fields on hexes such as `visibilityTier`, `isRemembered`, or `isHidden`,
- an explicit projected tile DTO such as `ProjectedHexCell` or `ViewerHexState`,
- a separate visibility projection map such as `hexVisibility`, `rememberedHexes`, or `visibleHexes`.

### Player data

Enemy player records must be visibility-filtered.

For hostile players:

- when visible: include location and marker-relevant information,
- when not visible: do not expose live position,
- when ordinary visibility is lost: do not preserve a stale marker unless a room rule or explicit intel or tracker mechanic authorizes it.

If a sighting-memory rule or explicit tracker mechanic is active, the payload may include a deliberately projected stale-sighting representation, but not a hidden live position masquerading as memory.

### Tactical collections

Collections such as raids, contested edges, and other tactical arrays must also be filtered by visibility.

Even if hex payloads are filtered correctly, tactical arrays must not reintroduce secret hostile knowledge.

## Field-level policy

| Data category | Visible | Remembered | Hidden | Implementation rule |
|---|---|---|---|---|
| Hostile ownership | exact | last known | hidden or unknown | persistent world fact may become memory, per-player by default |
| Hostile troop count | exact | exact last-seen with stale styling | omitted | current truth requires visibility; stale memory must read as remembered |
| Major hostile structures | exact | remembered | hidden | landmark memory allowed |
| Enemy player location | exact | omitted by default; stale marker only via room rule or tracker mechanic | omitted | mobile enemy intel must not persist as baseline memory |
| Enemy beacon or reveal source | exact if observable | last known location only | omitted | active reveal state requires visibility; location memory may persist |
| Hostile raid or progress state | exact | omitted | omitted | temporary tactical state requires visibility |
| Hostile temporary tile effects | exact | omitted | omitted | short-lived tactical state requires visibility |
| Hostile private cooldown or role internals | hidden unless world-manifested | hidden | hidden | private hostile state remains secret |
| Contested or frontline indicators | live | optional faint remembered hint | hidden | remembered frontier hints must not read as live |
| Event or notification hostile details | visibility-safe only | visibility-safe only | visibility-safe only | no side-channel leakage |

## Required component behavior on the frontend

### Hex tile rendering

The tile renderer must be able to render hostile tiles differently depending on visible, remembered, and hidden state.

It must not assume that every hostile tile has live troop truth or live structure truth.

### Troop badge rendering

The troop badge system must support:

- exact numeric troop display for visible hostile tiles,
- exact last-seen numeric troop display with stale styling for remembered hostile tiles when troop memory is allowed,
- no badge for hidden hostile tiles.

### Player layer rendering

The player marker layer must:

- render visible hostile players,
- hide non-visible hostile players by default,
- avoid preserving stale live enemy marker positions by default.

If room-configured sighting memory or an explicit intel or tracker mechanic applies, the layer may render a distinct stale-sighting marker that is visually different from a live enemy marker.

### Tactical overlay rendering

Overlays such as raid markers, contested state, sabotage, build, or demolish rings, and urgency halos must render only when the hostile information is allowed to be known.

### Info-card and tooltip rendering

Detail surfaces must respect the same rules as the tile itself.

If a tile is remembered or hidden, the info card must not recover live hostile truth from another field.

## Observer-mode behavior

Observer mode must be an explicitly different visibility regime.

When a viewer is in observer mode:

- omniscient state may be allowed,
- all tiles may be visible,
- hostile tactical truth may be fully available.

This behavior must not bleed into normal player visibility.

## Required implementation invariants

The finished system must satisfy all of the following:

1. A player from Alliance A does not automatically receive the same gameplay payload as a player from Alliance B.
2. Hidden hostile troop counts are not present in ordinary player payloads.
3. Hidden hostile player coordinates are not present in ordinary player payloads.
4. Hidden hostile tactical operations are not recoverable through alternate arrays or logs.
5. Remembered hostile information is visually distinct from current visible truth.
6. Hidden hostile information does not become visible through tooltips, info cards, minimaps, or alternate surfaces.
7. Host observer omniscience remains an explicit exception, not the default room-state behavior.
8. Enemy player sightings do not linger by default unless a room rule or explicit intel or tracker mechanic preserves them.
9. Beacon or Forward Observer remains a live reveal mechanic and is not treated as baseline hostile tracking memory.
10. Alliance-wide hostile memory is not automatic; it requires explicit sharing mechanics.

## Final implementation statement

In the intended final implementation:

- the backend builds visibility-aware viewer-specific gameplay state,
- the frontend renders hostile intel according to `visible`, `remembered`, and `hidden` tiers,
- remembered hostile knowledge is preserved only for allowed persistent world facts and explicitly allowed stale-memory categories,
- enemy player sightings do not persist by default after ordinary visibility is lost,
- host-configured short-lived sighting memory and dedicated intel or tracker mechanics are the only normal exceptions,
- Beacon or Forward Observer provides live reveal but does not itself create baseline tracking memory,
- hostile memory remains mostly per-player unless explicit sharing mechanics propagate it,
- all live hostile tactical truth remains gated by current visibility.

The result should be a tricorder system that is secure against accidental
hostile intel leakage, faithful to the intended gameplay design, consistent
across all UI surfaces, and tactically readable without becoming omniscient.
