---
name: landgrab-host-and-start
description: 'Host a Landgrab game: create session, register/login, create room, configure via setup wizard, and start the game'
---

# Host and Start a Landgrab Game

This skill drives the complete host-side workflow from browser session creation through game start. Every step uses the real frontend UI and verifies the result through observable state before advancing.

## When to use this skill

Use this skill when the playtester needs to:

- Create a new game room as the host player
- Walk through the 5-step setup wizard (Location → Teams → Rules → Dynamics → Review)
- Start the game so that guests can begin playing

## Prerequisites

- Backend running at `http://localhost:5001`
- Frontend running at `http://localhost:5173`
- A browser session created for the host player (via `session_create` MCP tool or Playwright)

## Preferred MCP shortcuts

When the goal is to reach a valid multiplayer game quickly, prefer these tools before falling back to manual wizard clicks:

- `room_wait_until_joinable` — verify the host room code and lobby readiness
- `room_configure_defaults` — apply a fast preset, centered area, alliances, and review-step progression
- `room_set_rules` / `room_set_dynamics` — adjust rules and dynamics without hunting for individual controls
- `room_assign_players` — configure alliances and optionally pin specific sessions to alliances
- `state_wait_for` — wait for wizard step, player count, or phase changes after each host action

## Workflow

### Step 1 — Register or log in the host

1. Navigate to the frontend at `http://localhost:5173`.
2. If the host user does not exist, switch to the Sign-Up tab (`data-testid="auth-sign-up-tab"`).
   - Fill username (`data-testid="auth-username-input"`), email (`data-testid="auth-email-input"`), and password (`data-testid="auth-password-input"`, min 8 characters).
   - Click submit (`data-testid="auth-submit-btn"`).
3. If the host user already exists, use the Sign-In tab (`data-testid="auth-sign-in-tab"`).
   - Fill username or email (`data-testid="auth-username-input"`) and password (`data-testid="auth-password-input"`).
   - Click submit (`data-testid="auth-submit-btn"`).
4. **Verify**: The lobby screen appears with `data-testid="lobby-entry"` visible.

### Step 2 — Create the room

1. Click the create room button (`data-testid="lobby-create-room-btn"`).
2. Wait for the `RoomCreated` SignalR event or the setup wizard to appear (`data-testid="setup-wizard"`).
3. Read and record the room code from `data-testid="wizard-room-code"`.
4. **Verify**: The wizard is visible and the room code is a 6-character string.
5. **Evidence**: Screenshot the wizard with the room code.

Fast path: after room creation, prefer `room_wait_until_joinable` to confirm the session is ready and the room code is stable.

### Step 3 — Setup Wizard: Location (Step 0)

1. The location step retrieves GPS or uses debug GPS.
2. Enable the debug GPS panel (`data-testid="debug-gps-toggle"`) if it is available.
3. The wizard auto-advances to Step 1 when the location is set.
4. If location does not resolve automatically, use the debug GPS panel (`data-testid="debug-gps-panel"`) to step into a valid hex.
5. **Verify**: Wizard advances past the location step.

Fast path: `room_configure_defaults` will set a map location, centered area, master tile, and push the wizard forward for deterministic local playtests.

### Step 4 — Setup Wizard: Teams (Step 1)

1. Configure alliances and assign players to them.
2. If only testing with 2 players, use the default alliance setup or distribute players.
3. Wait for all players to have joined before advancing (guest join happens via the `landgrab-join-and-sync` skill).
4. Click the next button (`data-testid="wizard-next-btn"`) when all players are assigned.
5. **Verify**: At least 2 players are assigned to alliances and the wizard advances.
6. **Evidence**: Screenshot the teams configuration.

### Step 5 — Setup Wizard: Rules (Step 2)

1. Optionally adjust rules via the UI:
   - Tile size: `data-testid="rules-tile-size-input"`
   - Allow self-claim: `data-testid="rules-allow-self-claim-toggle"`
   - Win condition value: `data-testid="rules-win-condition-input"` + `data-testid="rules-win-condition-apply-btn"`
   - Host GPS bypass: `data-testid="rules-host-gps-bypass-toggle"`
   - Max footprint: `data-testid="rules-max-footprint-input"` + `data-testid="rules-max-footprint-apply-btn"`
2. For default playtests, accept the defaults and click next (`data-testid="wizard-next-btn"`).
3. **Verify**: Wizard advances to dynamics step.

Fast path: use `room_set_rules` for tile size, claim mode, host GPS bypass, win condition, and footprint updates.

### Step 6 — Setup Wizard: Dynamics (Step 3)

1. Select a copresence preset or leave the default.
2. Optionally toggle feature flags (terrain, fog of war, supply lines, etc.).
3. Click next (`data-testid="wizard-next-btn"`).
4. **Verify**: Wizard advances to the review step.

Fast path: use `room_set_dynamics` for preset toggles and live-compatible dynamics payloads.

### Step 7 — Setup Wizard: Review and Start (Step 4)

1. Review the game configuration summary shown on the review step.
2. Configure the game area (centered, pattern, or custom) if needed.
3. Assign starting tiles if required by the test scenario.
4. Click the start game button (`data-testid="wizard-start-game-btn"`).
5. Wait for the `GameStarted` SignalR event or the game phase to transition to `Playing`.
6. **Verify**: The game view is visible and the phase is `Playing`.
7. **Evidence**: Screenshot the game-started state.

Recommended verification after each host-side action:

- `state_wait_for` with `currentWizardStep`, `minPlayers`, or `phase`
- `state_last_events` to inspect `RoomCreated`, `PlayerJoined`, `GameStarted`, or `StateUpdated`
- `evidence_checkpoint` at room-created and game-started transitions

## Key SignalR Methods

| Direction | Method | Purpose |
|-----------|--------|---------|
| Invoke | `CreateRoom()` | Create a new game room |
| Invoke | `SetMapLocation(lat, lng)` | Set game center |
| Invoke | `ConfigureAlliances(names[])` | Set alliance list |
| Invoke | `DistributePlayers()` | Auto-assign players |
| Invoke | `StartGame()` | Transition to Playing |
| Event | `RoomCreated(code, state)` | Room created confirmation |
| Event | `GameStarted(state)` | Game phase transition |
| Event | `StateUpdated(state)` | General state update |

## Success Criteria

- Room code is captured and valid (6 characters).
- All wizard steps are completed without errors.
- Game phase transitions from `Lobby` to `Playing`.
- At least 2 players are in the game when it starts.
- Screenshots captured at: room created, teams configured, game started.

## Failure Handling

- If any wizard step fails to advance, capture a screenshot and report the blocking condition.
- If `StartGame` fails, check that all prerequisites are met (players ≥ 2, alliances assigned, location set, master tile assigned).
- If auth fails, check for field errors displayed under the input fields.
- Never proceed past a failed step — stop, collect evidence, and report.
