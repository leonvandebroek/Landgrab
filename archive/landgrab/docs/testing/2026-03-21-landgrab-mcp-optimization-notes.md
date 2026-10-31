# Landgrab MCP optimization notes — 2026-03-21

## Scope

This document captures issues observed while using the Landgrab MCP/browser
playtesting stack for live visible ability validation. These are not
theoretical concerns; they are concrete friction points encountered during
real multiplayer testing on 2026-03-21.

## Highest-priority issues

### 1. Session creation and immediate auth calls are race-prone

#### 1.1 Observed behavior

- Fresh browser sessions were created successfully.
- Immediate auth calls in the same parallel batch failed with `Session "..." not found`.

#### 1.2 Why this matters

- It makes orchestration brittle when creating multiple sessions quickly.
- It encourages retry logic in the caller for something that should ideally
  be atomic or explicitly stateful.

#### 1.3 Optimization ideas

- Make session creation return only after the session is fully registered and
  ready for follow-up MCP actions.
- Or add a small explicit `wait_until_ready(sessionId)` helper.
- Or return a `ready: true/false` plus a recommended follow-up wait token.

### 2. Injected-state scenarios are unreliable for fresh visible sessions

#### 2.1 Observed behavior

- Multiple `scenario_inject_state` attempts timed out.
- Last bridge snapshots often showed:
  - `connected: true`
  - `view: "lobby"`
  - `roomCode: null`
  - `gameState: null`
  - sometimes `auth.token: ""`
- At least one failed injection still created a valid recent-room entry that
  could be reopened manually later.
- That means the backend mutation can succeed while the frontend recovery step
  still fails from the tool's perspective.
- After the MCP upgrade, failure reporting is much better: enum-shape mistakes
  fail fast with a concrete backend error, and staged output clearly shows
  whether backend injection succeeded before frontend resume failed.

#### 2.2 Why this matters

- Injected-state scenarios are the fastest path to deterministic gameplay
  validation.
- When injection is unreliable, complex tests (especially Engineer abilities)
  become much slower and more manual.

#### 2.3 Optimization ideas

- Add more detailed injection progress reporting: backend state injected,
  frontend resume triggered, frontend room hydrated, playing phase reached.
- Surface the exact failing stage instead of only a final timeout snapshot.
- Add a recovery mode that reloads or navigates the frontend automatically
  after backend injection if the bridge remains in lobby state.
- Consider treating "backend room created but frontend resume incomplete" as a
  separate partial-success state rather than a generic timeout.

### 3. Bridge auth state is hard to trust during injected flows

#### 3.1 Observed behavior

- Some failing injection attempts showed a valid username/userId but an empty `auth.token` in the bridge snapshot.
- In recovered sessions, player state could contain valid `currentLat` and
  `currentLng` while the frontend bridge still reported `currentLocation: null`
  and `currentHex: null`.
- This creates ambiguity about whether the problem is frontend auth hydration,
  session storage, backend auth, or resume logic.

#### 3.2 Why this matters

- It is hard to know whether to debug auth, game injection, or frontend resume.
- It wastes time during playtesting because the next recovery step is unclear.

#### 3.3 Optimization ideas

- Expose an explicit MCP auth health check per session.
- Differentiate between browser-side auth state, backend-side auth validity,
  and bridge-side auth visibility.
- Include auth diagnostics automatically in injection failures.
- Add explicit diagnostics for location hydration too, because auth may be fine
  while the frontend still cannot derive a playable current hex.

### 4. Native `<select>` manipulation is awkward through the current session toolset

#### 4.1 Observed behavior

- The roles step uses native select dropdowns.
- Clicking and sending arrow keys is possible, but confirming whether the
  selected option actually changed is difficult.
- `get_text` is lossy for selected option state, and raw HTML does not expose
  the live selected value clearly enough for quick verification.

#### 4.2 Why this matters

- Role assignment is central to deterministic gameplay tests.
- If role selection is awkward, ability validation slows down significantly.

#### 4.3 Optimization ideas

- Add a dedicated `select_option` MCP helper for named sessions.
- Or add a `get_form_state` or `get_input_value` helper that can read the
  current selected value of form controls.
- Or expose a room-level role assignment helper if role testing is a
  first-class scenario.

### 5. Visible-but-unclickable elements need frequent forced clicks

#### 5.1 Observed behavior

- The Sabotage primary CTA was visible and enabled, but normal click failed because the element was reported as outside the viewport.
- A forced click succeeded immediately.

#### 5.2 Why this matters

- This creates false negatives during UI validation.
- It also makes it harder to tell whether the issue is real UX breakage or
  MCP/browser interaction geometry.

#### 5.3 Optimization ideas

- Improve click helpers to auto-scroll/auto-center actionable controls more aggressively before failing.
- Include the element bounding box and viewport box in click failure diagnostics.
- Consider a `smart_click` mode that tries normal click, scroll, center, then
  force-click with clear reporting.

### 5.1b A note from this playtest

- `Start Sabotage` succeeded only after a forced click, even though the button
  was visibly rendered and enabled in the live UI.

### 5.2 A note from the mobile Demolish retest

- After fixing injected player hex initialization and server-backed current-hex
  fallback in the app, the mobile `Slopen` flow started working again.
- The remaining friction is now mostly orchestration:
  - automatic resume into injected rooms still times out,
  - manual join or recent-room reopen is still the more reliable recovery path.

## Medium-priority issues

### 6. Error reporting is still too final-state oriented

#### 6.1 Observed behavior

- Several failures produce only the final snapshot after timeout.
- The final snapshot is useful, but it hides the path taken to failure.

#### 6.2 Optimization ideas

- Return a stage timeline for multi-step MCP flows.
- Include timestamps for backend mutation, navigation, resume, and state hydration checkpoints.

### 7. Existing-session recovery is underpowered

#### 7.1 Observed behavior

- When a session becomes stale or visually stuck in lobby state, there is no
  obvious high-level MCP recovery helper.
- The caller ends up working around this with alternative sessions or manual fallbacks.

#### 7.2 Optimization ideas

- Add `recover_session(sessionId)` that can reload, rehydrate auth, and wait for bridge readiness.
- Add `reopen_last_room(sessionId)` when recent-room state is available.
- If a room is recoverable from the recent-room list, the tool could offer to
  reopen it automatically after a failed injection instead of leaving the
  caller to discover that path manually.

### 7.1b Reusing an already-playing session is still a bad fit for reinjection

- Injecting a new scenario into sessions that were already inside another match
  left the visible clients stuck on the previous room state.
- Fresh sessions plus manual room join worked much more reliably.
- A high-level `reset_to_entry_lobby(sessionId)` helper would make this much
  easier to automate safely.

### 8. Deterministic gameplay setup is too dependent on UI randomness

#### 8.1 Observed behavior

- Role randomization was used to get certain role combinations in visible tests.
- This is workable, but not ideal for repeatable validation.

#### 8.2 Optimization ideas

- Add MCP support for setting roles directly in lobby state.
- Or add a scenario helper that creates a room with explicit roles while preserving a visible browser flow.

## Low-priority but useful improvements

### 9. Better form-control introspection

Useful additions:

- `get_input_value(sessionId, selector)`
- `get_select_value(sessionId, selector)`
- `get_checkbox_state(sessionId, selector)`

### 10. Better actionability diagnostics

Useful additions when clicks fail:

- viewport dimensions
- element bounding box
- overlay/interceptor information
- whether auto-scroll occurred

## Practical takeaway from this playtest

The MCP stack is already good enough for visible multiplayer validation,
especially for movement, map interaction, and event-state observation. The
biggest gains now are in:

1. deterministic setup reliability,
2. better staged diagnostics for injection failures,
3. stronger form-control helpers,
4. better session recovery.

One positive note: the upgraded MCP already improved diagnosis substantially.
The remaining problems are now much easier to isolate because backend-injection
success and frontend-resume failure are separated clearly in the staged output.

These would disproportionately improve complex ability testing and reduce time lost to orchestration/debug friction.
