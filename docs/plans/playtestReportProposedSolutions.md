# Landgrab Playtest Report — Proposed Solutions

This document responds to the issues identified in `PLAYTEST_REPORT.md` with proposed product, UX, and technical solutions. It is intended as a refinement draft, not a final implementation plan.

---

## Goals

1. Make every player able to start contributing immediately.
2. Align visual map position, game logic, and player expectations.
3. Remove setup ambiguity and stale-state confusion.
4. Explain core gameplay clearly enough that players do not need outside help.
5. Improve log quality so it supports play rather than exposing internal developer concepts.
6. Keep fixes incremental where possible, while clearly identifying structural bugs that need deeper work.

---

## Recommended priority order

### P0 — Must fix before broader playtesting

- BUG-01: Non-host alliance members receive 0 troops and 0 starting tiles
- BUG-02: Visual player position vs. game hex position mismatch
- BUG-03: Guest wizard does not notify guests when host advances steps
- UX-01: GPS denied with no clear fallback guidance
- UX-02: Adjacency error message is confusing and unhelpful
- UX-03 / UX-04: Core claiming and troop mechanics are not explained

### P1 — High-value improvements for comprehension and trust

- BUG-04: False “waiting for more players” messaging
- BUG-10: Map tiles not loading
- UX-07: Win condition wording ambiguity
- UX-08 / UX-09 / UX-10 / UX-11: Activity Feed quality and usefulness
- UX-12: Name labels off by default
- UX-14: Persistent GPS denied banner during gameplay
- CI-01 / CI-03: Claiming path and alliance/personal meaning

### P2 — Polish, consistency, and terminology cleanup

- BUG-06, BUG-07, BUG-09
- UX-05, UX-06, UX-13, UX-15, UX-16, UX-17, UX-18, UX-19, UX-20, UX-21
- CI-02, CI-04, CI-05

---

## Root-cause themes

Several issues cluster around a few broader problems:

1. **Alliance spawning model is under-specified**
   - Team-based setup currently appears to allocate one alliance start, but player-level gameplay still assumes each player can independently act.

2. **Location-to-hex mapping lacks trustworthiness**
   - The rendered map and game logic disagree, which breaks the core premise of the game.

3. **The setup flow is host-driven but guest feedback is too passive**
   - Guests do not get explicit transition feedback when the host advances configuration.

4. **The game teaches too little, too late, and too vaguely**
   - Claiming, troops, adjacency, alliance vs personal play, and observer mode are all underexplained.

5. **The Activity Feed mixes internal telemetry with player-facing messaging**
   - It is neither a clean debug log nor a clear player event narrative.

6. **Debug/dev affordances are leaking into the player experience**
   - Developer tools and debug-adjacent concepts are visible in ways that reduce trust.

---

## Proposed solutions by issue

## Bugs

### BUG-01 — Non-host alliance members receive 0 troops and 0 starting tiles

**Problem summary**
Only the first player in an alliance appears to get a meaningful playable start. Additional alliance members can become permanently non-playable.

**Proposed solution**
Redesign alliance starts so every player gets an active starting state, even in alliance mode.

**Recommended product decision**
Use **one starting tile per alliance**, and make it work properly while counting territory toward the alliance total.

**Why this is the best fix**
- Every player can act immediately.
- It avoids “spectator teammate” failure states.
- It keeps alliance play collaborative without making one player the only active agent.

**Implementation options**

**Preferred**
- When the game starts in alliance mode:
  - assign one valid starting tile per alliance
  - seed each player with starting troops
  - mark all claimed tiles as contributing to the alliance score

**Alternative**
- Keep one alliance HQ/start tile, but also spawn every alliance member with:
  - a personal adjacent starting tile, or
  - carried troops plus immediate claim rights on adjacent alliance territory

**Additional safeguards**
- Add a start-time validation rule:
  - if any player would begin with 0 troops and no legal first move, block game start and show host an error
- Add a regression test:
  - 2+ players in the same alliance each have at least one playable initial action

**UI copy change**
- Replace vague setup summaries with player-safe language such as:
  - “Each player will start with a deployable position for their team.”

---

### BUG-02 — Visual player position vs. game hex position mismatch

**Problem summary**
The rendered player marker appears to be on one tile while the game logic says the player is on another tile or on neutral ground.

**Proposed solution**
Make the game’s authoritative current hex visible, and ensure both map rendering and game logic use the same coordinate source and snapping rules.

**Recommended technical approach**
1. Define a single authoritative conversion path from lat/lng to current hex.
2. Use that same result for:
   - HUD current tile state
   - claim/attack eligibility
   - player marker highlight or active-tile outline
3. Add visual confirmation of the *actual* detected hex.

**Concrete fixes**
- Draw a highlighted “current detected hex” outline under the player.
- Snap the player’s gameplay marker or active footprint display to that detected hex when appropriate.
- Instrument a debug overlay in non-production that shows:
  - raw lat/lng
  - detected `(q, r)`
  - rendered center tile `(q, r)`
- Audit map math around:
  - hex center conversion
  - tile size scaling
  - flat-top axial projection
  - marker placement offsets

**UX mitigation even before full fix**
- Show a compact status line:
  - “Current hex: Neutral / Red Team / Blue Team”
  - and optionally the current detected tile outline
- That reduces “I’m clearly standing there!” frustration.

**Testing**
- Add automated cases verifying:
  - known lat/lng test positions map to the expected hex
  - marker location and logical tile owner agree

---

### BUG-03 — Guest wizard does not notify guests when host advances steps

**Problem summary**
Guests remain on stale content with no active transition feedback.

**Proposed solution**
Make step transitions explicit, synchronized, and visible for guests.

**Recommended UX behavior**
When host advances:
- guest wizard auto-updates to the new step
- show a brief notification banner or animated transition
- replace passive old text with new actionable text

**Suggested UI patterns**
- Toast/banner:
  - “The host moved to Team Setup.”
  - “The host is reviewing the battlefield. You can now confirm your role.”
- Step header always shows current host-selected phase.
- Optional pulse on the enabled CTA when the guest can now act.

**Technical direction**
- Ensure step state is part of the synchronized room state, not just host-local UI state.
- Use the same synchronized source for host and guest rendering.

---

### BUG-04 — “Waiting for more players to join...” shown with 3 players

**Problem summary**
The conditional logic for readiness messaging is incorrect or stale.

**Proposed solution**
Replace simplistic player-count messaging with actual readiness-state messaging.

**Recommended logic**
Instead of “waiting for more players,” derive status from:
- connected player count
- minimum required player count
- whether all currently present players are assigned/ready

**Better message examples**
- “3 players connected. You can continue setup.”
- “Waiting for 1 player to choose a team.”
- “All connected players are ready for the next step.”

---

### BUG-06 — Dutch preset names shown in English-language UI

**Problem summary**
Preset names are not localized consistently.

**Proposed solution**
Move preset names fully into translation resources.

**Implementation direction**
- Treat preset IDs as stable internal keys.
- Render translated labels from `i18n` instead of server-provided display strings.
- Keep the backend authoritative for preset definitions, but not for user-visible locale-specific labels.

**Example**
- Internal key: `classic`
- UI label: `Classic` / `Klassiek`

---

### BUG-07 — Double dice emoji on “Distribute Players Randomly”

**Proposed solution**
Remove duplicated icon source and standardize button icon composition.

**Implementation note**
- Likely one emoji is embedded in the label string and another in the button template.
- Prefer icon + label structure instead of icon text baked into translation strings.

---

### BUG-08 — Tile gain/loss inconsistency without visible explanation

**Problem summary**
Territory counts change without corresponding player-facing event explanation.

**Proposed solution**
Log all territory ownership changes with player-safe reasons.

**Required event coverage**
- claim by player
- alliance claim
- attack capture
- reclaim/self-claim/abandon
- any automatic state transition that can affect tile ownership

**Player-facing event examples**
- “Blue Team claimed a tile near City Centre.”
- “Alex captured a Red Team tile.”
- “Red Team lost control of a tile after combat.”

**Important**
If territory can change due to hidden/system logic, that system must still emit a concise player-facing explanation.

---

### BUG-09 — “configured 1 alliances” grammar error

**Proposed solution**
Pluralize activity feed messages correctly with i18n plural rules.

---

### BUG-10 — Map tiles not loading

**Problem summary**
The geographic base map failed entirely, reducing the game to floating hexes on gray.

**Proposed solution**
Treat base-map availability as a first-class resilience concern.

**Technical fixes**
- Detect tile provider failures explicitly.
- Show a user-facing fallback state:
  - “Map background unavailable. You can still play on the grid.”
- Consider configurable fallback providers or a neutral offline basemap.
- Instrument tile load failures in diagnostics.

**UX improvement**
If the basemap fails, replace dead gray silence with:
- a clear banner
- a toggle to continue on tactical grid only

---

## UX / UI issues

### UX-01 — GPS denied with no clear fallback guidance

**Proposed solution**
Turn the location step into a guided choice, not an error trap.

**Recommended UX**
When geolocation is denied, show a structured card:
- “Location access was denied.”
- Primary recovery action: `Enter coordinates manually`
- Secondary actions:
  - `Try again`
  - `Use selected city / search location` (future)

**Important**
Do not rely on a subtle inline text link as the only fallback.

---

### UX-02 — Adjacency error message is confusing and unhelpful

**Proposed solution**
Combine message clarity with directional guidance and map highlighting.

**Recommended improvements**
- Highlight nearest legal claim edge on the map.
- Show direction and distance hint, e.g.:
  - “Move 2 tiles east to reach your team’s frontier.”
- Use different messaging for structurally blocked states:
  - if player has no legal actions because of a bug or setup state, say that clearly
  - do not show a normal adjacency hint if the player can never satisfy it

**For BUG-01-linked cases**
- If player has no valid starting state, show:
  - “You have not received a playable start position yet.”
  - and prompt host/system recovery, not walking advice

---

### UX-03 / UX-04 — “How to Play” and “Game Rules” are redundant, contradictory, and incomplete

**Proposed solution**
Merge them into a single layered onboarding structure.

**Recommended information architecture**
1. **Quick Start**
   - what to do in your first minute
2. **Core Rules**
   - adjacency
   - alliance/personal claiming
   - troops and combat
3. **Advanced Systems**
   - presets
   - dynamics
   - observer mode

**Quick Start should explicitly explain**
- Walk onto or near a valid frontier tile.
- Use `Alliance` or `Personal` to claim.
- Troops generate over time and can be picked up/carried.
- You attack by moving into enemy-adjacent action range and spending troops.

**Remove contradiction**
Never imply that simply stepping onto a neutral tile always claims it if buttons and adjacency rules actually govern claiming.

---

### UX-04 — No onboarding for core troop mechanics

**Proposed solution**
Add troop mechanics to first-run onboarding, help, and contextual HUD hints.

**Must explain**
- what troops are
- how they regenerate
- what “carried troops” are
- how to pick up and drop troops
- the difference between tile troops and carried troops

**Suggested lightweight onboarding**
A dismissible first-game checklist:
- “Troops build up over time on your controlled territory.”
- “Pick up troops from your current tile to carry them.”
- “Spend carried troops to claim, reinforce, or attack.”

---

### UX-05 — “Copresence mechanics / modes” unexplained jargon

**Proposed solution**
Rename or explain the term in plain language.

**Preferred wording**
- Replace “copresence mechanics” with something player-readable like:
  - `shared tile mechanics`
  - `close-range encounter rules`
  - `extra team interaction rules`

**If the term stays**
- add a one-line explanation directly below the heading

---

### UX-06 — Tile size configuration is ambiguous

**Proposed solution**
Clarify what the unit means in real-world terms.

**Recommended copy**
- “Tile size: approximately 25 meters across”
- add a short note explaining gameplay impact:
  - smaller tiles = finer map control
  - larger tiles = faster area coverage

---

### UX-07 — Win condition ambiguity for alliance play

**User clarification incorporated**
Use: **“The first team to control 60% of the map wins!”**

**Proposed solution**
Make all alliance-mode win text team-scoped, never player-scoped.

**Recommended changes**
- Setup text:
  - “The first team to control 60% of the map wins!”
- In-game progress indicators should show alliance totals clearly.
- If there is already a victory screen, make it explicit in UX flow and feed/logging.

---

### UX-08 / UX-09 / UX-10 / UX-11 — Activity Feed consistency and usefulness

**Problem summary**
The Activity Feed naming is inconsistent, content is partly developer-facing, and live gameplay events are missing.

**Proposed solution**
Redefine the feed as a player-facing narrative log.

**Recommended naming**
Pick one term and use it everywhere. Best option:
- `Activity Feed`

**Rules for feed content**
- No raw axial coordinates unless in a debug/admin context.
- No internal jargon like “master tile” unless translated into player language.
- No repeated spam events without deduplication.
- Include actual gameplay events, not just setup.

**Terminology replacements**
- `master tile` → something player-facing like `central objective` or whatever the intended concept is
- `player mode` → `returned from observer mode`

**Feed event categories to support**
- players joined / teams configured
- game started
- tile claimed
- tile reinforced
- combat won/lost
- major objectives triggered
- victory reached

**Spam prevention**
- deduplicate repeated host mode toggles
- collapse repetitive system events when appropriate

---

### UX-12 — Name labels off by default

**Proposed solution**
Turn player name labels on by default in multiplayer.

**Alternative**
Use smart defaults:
- on by default for small matches
- optionally adaptive at higher player counts

---

### UX-13 — Game Rules splash screen shown to host on start

**Proposed solution**
Treat host and returning players differently.

**Recommended logic**
- Show the rules gate to first-time or unacknowledged players.
- Skip or minimize it for the host who just configured the match.
- Offer a `View Rules` link instead of forced interruption.

---

### UX-14 — Persistent GPS denied banner during gameplay

**Proposed solution**
Make error banners state-aware and dismissible.

**Recommended behavior**
- If debug GPS or a valid manual location fallback is active, retire the original geolocation-denied banner.
- Replace with at most a subtle informational chip if needed.
- Allow dismissing persistent top-of-screen errors that no longer matter.

---

### UX-15 — “Use centered field” unexplained

**Proposed solution**
Rename and explain the action.

**Suggested label**
- `Center the play area`

**Suggested help text**
- “Rebuild the game area around the selected central location.”

---

### UX-16 — “Footprint 743m” vs “1km max” confusing

**Proposed solution**
Label both metrics clearly and explain the relationship.

**Suggested wording**
- `Current play area footprint: 743 m`
- `Maximum allowed footprint: 1 km`

---

### UX-17 — “Hide developer tools” visible to all users

**Proposed solution**
Hide developer tooling completely in production-facing UX.

**Recommended rule**
- Do not render this for normal users.
- Restrict to development/test builds or explicitly enabled debug flags.

---

### UX-18 — “YOUR TILE × 1” notation is cryptic

**Proposed solution**
Replace compressed notation with plain language.

**Better examples**
- `Current tile: 1 troop available`
- `Picking up from your tile: 1 troop`

---

### UX-19 — Multiple troop counters visible simultaneously

**Proposed solution**
Label troop contexts consistently.

**Recommended terminology**
- `Carried troops`
- `Troops on this tile`
- `Team total troops` or `Total deployed troops` if relevant

**Design direction**
Use the same icon family with distinct labels so players learn the model instead of guessing.

---

### UX-20 — Same-team players look identical

**Proposed solution**
Keep alliance color, but differentiate players within the team.

**Options**
- same base hue, different accent ring/icon
- player initials on markers
- subtle secondary shade differences

---

### UX-21 — “Switch to Observer” unexplained

**Proposed solution**
Add a short explanation and reversibility note.

**Suggested helper text**
- “Observer mode lets you watch the match without normal player interaction. You can switch back later.”

---

## Confusing interactions

### CI-01 — Claiming buttons lock without showing a path to unlock

**Proposed solution**
Show legal frontiers and path guidance directly on the map.

**Recommended additions**
- highlight nearest valid claim hex or frontier edge
- directional hint
- contextual explanation if the player is blocked for systemic reasons

---

### CI-02 — “Ignore” button purpose unclear

**Proposed solution**
Rename and explain it.

**Better labels**
- `Skip`
- `Not now`

**Tooltip/helper**
- “Dismiss this tile action and continue moving.”

---

### CI-03 — Alliance vs Personal territory distinction unexplained

**Proposed solution**
Explain the consequence at the point of choice.

**Suggested helper copy**
- `Alliance` — “Adds this tile to your team’s shared territory.”
- `Personal` — “Claims this tile under your own control.”

If the mechanical distinction is not meaningful enough, consider simplifying and removing the choice.

---

### CI-04 — No visual feedback when troops are regenerating

**Proposed solution**
Add subtle regeneration feedback.

**Examples**
- pulse animation when troop count increases
- small “+1” float on tile or HUD
- periodic hint in first game only

---

### CI-05 — Minimap too small to be actionable

**Proposed solution**
Either make it useful or demote it.

**Preferred improvements**
- allow expand/fullscreen
- allow tap-to-center navigation if accurate enough
- increase readability of icons and distances

If not improved soon, treat it as decorative and reduce emphasis.

---

## What players cannot understand without external help — proposed onboarding fixes

### 1. How to claim a tile
**Fix**
- Add quick-start instructions tied to the actual button flow.
- First valid claim opportunity should trigger a contextual hint.

### 2. What troops are
**Fix**
- Add a troop primer in onboarding and the rules/help view.
- Label all troop counters consistently.

### 3. Difference between Alliance and Personal claiming
**Fix**
- Explain at the decision point.
- Consider simplifying if the distinction is too subtle.

### 4. What copresence means
**Fix**
- Rename or define inline with plain language.

### 5. Where to walk for the first claim
**Fix**
- Highlight legal frontier tiles.
- Provide nearest valid direction/distance guidance.

### 6. Why buttons are locked
**Fix**
- Replace generic locked states with specific reasons.
- Differentiate temporary conditions from impossible/bug conditions.

### 7. What the “master tile” is
**Fix**
- Replace internal terminology in player-facing spaces.
- If the concept matters, explain it in the rules.

### 8. What observer mode does
**Fix**
- Add a confirmation/tooltip explaining reversibility and consequences.

### 9. Exact alliance win condition
**Fix**
- Always say “team” in alliance mode.
- Show team progress clearly in-game.

### 10. Why a teammate has 0 lands
**Fix**
- Fix BUG-01 structurally.
- Add a start-state validation so the game cannot begin in that broken configuration.

---

## Proposed implementation waves

## Wave 1 — Structural playability fixes

- Fix alliance player spawn/playability model
- Fix GPS/hex mapping mismatch
- Sync host step changes to guests clearly
- Correct readiness messaging

## Wave 2 — Core comprehension and onboarding

- Merge/rewrite help/rules content
- Add troop, claim, adjacency, and alliance/personal explanations
- Improve locked-state guidance and frontier highlighting
- Fix persistent GPS error handling

## Wave 3 — Activity Feed and terminology cleanup

- Standardize naming
- Remove internal jargon from player-facing logs
- Add live gameplay events
- Fix pluralization and duplicate spam

## Wave 4 — Polish and trust improvements

- Localize preset names
- Improve minimap usefulness
- Clarify review-step controls and measurements
- Improve player identity markers and observer wording
- Hide debug/developer-only controls in production

---

## Suggested product decisions that need explicit confirmation

1. **Alliance spawn model**
   - Confirmed: one shared alliance-owned start area per alliance, no personal tiles in alliance mode, guaranteed first-action playability for every alliance member

2. **Alliance vs Personal territory**
   - Confirmed: no personal territory in alliance mode; the Alliance/Personal choice should be hidden or removed when in alliance mode

3. **Activity Feed identity**
   - Recommended single name: `Activity Feed`

4. **Copresence terminology**
   - Keep and explain, or replace with a clearer player-facing term

5. **Minimap role**
   - Make interactive/useful, or reduce emphasis until it is

---

## Success criteria after fixes

A first-time player should be able to:

1. Join a room and understand what stage the host is on.
2. Recover from denied geolocation without confusion.
3. Start the match with a playable state.
4. Understand how to claim the first tile.
5. Understand what troops are and how they are used.
6. Trust that the tile they visually stand on matches the game logic.
7. Read the Activity Feed without seeing developer/internal jargon.
8. Understand the alliance win condition in one sentence.

---

## Recommended next step

Convert this document into a tracked remediation plan with columns such as:
- issue id
- proposed fix
- product decision needed
- technical complexity
- risk
- priority
- target milestone

That would make refinement much easier than discussing the raw report issue-by-issue.
