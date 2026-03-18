# Landgrab Agent Playtester

An automated playtesting stack that enables AI agents to play Landgrab through real browser sessions, providing evidence-based feedback on gameplay, UX, and multiplayer interactions.

## Architecture

```text
┌──────────────────────────────┐
│   GitHub Copilot Agent       │  .github/agents/landgrab-playtester.agent.md
│   + Skills definitions       │  .github/skills/landgrab-*/SKILL.md
└──────────┬───────────────────┘
           │ MCP protocol (stdio)
┌──────────▼───────────────────┐
│   MCP Server                 │  tools/landgrab-agent-mcp/
│   ├─ Session management      │  session_create / session_destroy
│   ├─ Auth tools              │  auth_register / auth_login
│   ├─ Room tools              │  room_create / room_join / room_start / room_set_* / scenario_create_*
│   ├─ Gameplay tools          │  player_* / map_* / state_* / assert_*
│   └─ Evidence tools          │  evidence_screenshot / evidence_aria_snapshot / evidence_checkpoint / network_requests
└──────────┬───────────────────┘
           │ Playwright browser automation
┌──────────▼───────────────────┐
│   Landgrab Frontend          │  data-testid selectors for automation
│   (React + Vite)             │  Debug GPS panel for movement
└──────────┬───────────────────┘
           │ SignalR WebSocket
┌──────────▼───────────────────┐
│   Landgrab Backend           │  Existing hub methods (unchanged)
│   (ASP.NET Core)             │  No backend modifications needed
└──────────────────────────────┘
```

## Components

### 1. Frontend Automation Affordances

Stable `data-testid` attributes added to key UI elements:

- **Auth**: `auth-sign-in-tab`, `auth-sign-up-tab`, `auth-username-input`, `auth-email-input`, `auth-password-input`, `auth-submit-btn`
- **Lobby**: `lobby-create-room-btn`, `lobby-join-code-input`, `lobby-join-btn`, `lobby-room-code`
- **Wizard**: `setup-wizard`, `wizard-room-code`, `wizard-step-content`, `wizard-next-btn`, `wizard-back-btn`
- **Debug GPS**: `debug-gps-panel`, `debug-gps-toggle`, `debug-gps-step-north/south/east/west`

### 2. Playwright Harness

Located in `frontend/landgrab-ui/e2e/`:

- **fixtures.ts** — Custom test fixtures with `host` and `guest` player sessions
- **helpers/** — Reusable helper functions (auth, room, debug-gps, player-pool)
- **\*.gameplay.spec.ts** — Multiplayer gameplay test specs

### 3. MCP Server

Located in `tools/landgrab-agent-mcp/`:

- **Session tools** — Browser lifecycle management (create, destroy, list)
- **Auth tools** — Register/login via API or UI
- **Room & scenario tools** — Create, join, configure, assign, and start games quickly
- **Movement & gameplay tools** — Debug GPS, hex selection, claim/attack/pickup/reclaim, map helpers
- **State & assertion tools** — Rich frontend snapshots, event waits, sync/hex/player assertions
- **Evidence tools** — Screenshots, ARIA snapshots, checkpoints, console/network deltas, state snapshots

### 4. Copilot Agent & Skills

- **Agent**: `.github/agents/landgrab-playtester.agent.md`
- **Skills**:
  - `landgrab-host-and-start` — Host a game session through the setup wizard
  - `landgrab-join-and-sync` — Join a room as a guest player
  - `landgrab-playturn` — Execute gameplay turns (move, claim, attack)
  - `landgrab-ux-review` — Collect UX evidence and generate reports

## Quick Start

### Prerequisites

- Node.js 20+
- Backend running at `localhost:5001`
- Frontend dev server at `localhost:5173`

### Install & Build

```bash
# MCP Server
cd tools/landgrab-agent-mcp
npm install
npx tsc --noEmit  # Type-check

# Playwright (if not installed)
cd frontend/landgrab-ui
npx playwright install chromium
```

### Run Gameplay Tests

```bash
cd frontend/landgrab-ui
npx playwright test --project=gameplay
```

### Use with Copilot Agent

The `landgrab-playtester` agent is available in GitHub Copilot. It uses the MCP server to drive browser sessions and provides evidence-based feedback.

## MCP Tools Reference

| Tool | Description |
|------|-------------|
| `session_create` | Create a new browser session |
| `session_destroy` | Close a browser session |
| `session_list` | List active sessions |
| `session_destroy_all` | Close all sessions |
| `auth_register` | Register user via API |
| `auth_login` | Login user via API |
| `auth_register_ui` | Register through browser UI |
| `room_create` | Create a game room |
| `room_join` | Join a room by code |
| `room_wizard_next` | Advance setup wizard |
| `room_start` | Start the game |
| `room_wait_until_joinable` | Wait for host room readiness and a stable room code |
| `room_set_rules` | Update tile size, claim mode, win condition, footprint, or host GPS bypass |
| `room_set_dynamics` | Update lobby or live dynamics payload |
| `room_assign_players` | Configure alliances and assign player sessions |
| `room_configure_defaults` | Apply a fast deterministic host setup preset |
| `scenario_create_2p_game` | Bootstrap a full 2-player game |
| `scenario_create_n_player_game` | Bootstrap a full N-player game |
| `player_enable_debug_gps` | Enable debug GPS panel |
| `player_step_hex` | Move one hex step |
| `player_move_steps` | Move multiple hex steps |
| `player_select_hex` | Select a target hex through the real UI state |
| `player_claim_hex` | Claim or reinforce a hex |
| `player_attack_hex` | Attack a hex with preview-aware flow |
| `player_pickup_troops` | Pick up troops from a hex |
| `player_reclaim_hex` | Deploy troops back onto a hex using current follow-up flow |
| `map_center_on_player` | Recenter map on current player |
| `map_pan_to_hex` | Pan map to a target hex |
| `map_get_visible_hexes` | Return hexes in the visible viewport |
| `map_select_hex_near_player` | Select a relative hex based on current player position |
| `state_game_snapshot` | Return the rich frontend bridge snapshot |
| `state_hex_snapshot` | Return state and actions for a specific hex |
| `state_player_snapshot` | Return state for self or a named player |
| `state_wait_for` | Wait for phase, player, hex, connection, or wizard conditions |
| `state_wait_for_event` | Wait for a matching frontend bridge event |
| `state_last_events` | Inspect recent frontend bridge events |
| `assert_sessions_in_sync` | Compare multiple sessions for sync |
| `assert_hex_state` | Assert expected state for a hex |
| `assert_player_state` | Assert expected state for a player |
| `evidence_screenshot` | Capture screenshot to file |
| `evidence_screenshot_base64` | Capture screenshot as base64 |
| `evidence_aria_snapshot` | Capture a Playwright ARIA snapshot for the page or a selector |
| `evidence_console_errors` | Get console errors |
| `evidence_console_all` | Get all console output |
| `evidence_console_delta` | Get console entries after a cursor |
| `network_requests` | Inspect failed or slow network traffic |
| `evidence_checkpoint` | Capture screenshot, ARIA, console, network, and state in one step |
| `evidence_compare_sessions` | Capture aligned evidence for multiple sessions |
| `evidence_summary` | Generate evidence markdown |
| `state_snapshot` | Get visible game state |

## Design Principles

1. **Production safety** — No changes to live gameplay rules, hub contracts, or player flows
2. **Browser-driven** — All actions go through the real UI, never bypassing SignalR
3. **Evidence-based** — Every observation backed by screenshots, console logs, or state snapshots
4. **Scalable** — Player pool supports N players, not just hardcoded host/guest
5. **Passive metadata** — Automation hooks use `data-testid` attributes and debug-gated features only
