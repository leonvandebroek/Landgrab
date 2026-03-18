# Landgrab Agent Playtester

An automated playtesting stack that enables AI agents to play Landgrab through real browser sessions, providing evidence-based feedback on gameplay, UX, and multiplayer interactions.

## Architecture

```
┌──────────────────────────────┐
│   GitHub Copilot Agent       │  .github/agents/landgrab-playtester.agent.md
│   + Skills definitions       │  .github/skills/landgrab-*/SKILL.md
└──────────┬───────────────────┘
           │ MCP protocol (stdio)
┌──────────▼───────────────────┐
│   MCP Server                 │  tools/landgrab-agent-mcp/
│   ├─ Session management      │  session_create / session_destroy
│   ├─ Auth tools              │  auth_register / auth_login
│   ├─ Room tools              │  room_create / room_join / room_start
│   ├─ Movement tools          │  player_step_hex / player_move_steps
│   └─ Evidence tools          │  evidence_screenshot / evidence_aria_snapshot / state_snapshot
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
- **Room tools** — Create, join, configure, and start games
- **Movement tools** — Debug GPS hex stepping
- **Evidence tools** — Screenshots, ARIA snapshots, console capture, state snapshots

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
| `player_enable_debug_gps` | Enable debug GPS panel |
| `player_step_hex` | Move one hex step |
| `player_move_steps` | Move multiple hex steps |
| `evidence_screenshot` | Capture screenshot to file |
| `evidence_screenshot_base64` | Capture screenshot as base64 |
| `evidence_aria_snapshot` | Capture a Playwright ARIA snapshot for the page or a selector |
| `evidence_console_errors` | Get console errors |
| `evidence_console_all` | Get all console output |
| `evidence_summary` | Generate evidence markdown |
| `state_snapshot` | Get visible game state |

## Design Principles

1. **Production safety** — No changes to live gameplay rules, hub contracts, or player flows
2. **Browser-driven** — All actions go through the real UI, never bypassing SignalR
3. **Evidence-based** — Every observation backed by screenshots, console logs, or state snapshots
4. **Scalable** — Player pool supports N players, not just hardcoded host/guest
5. **Passive metadata** — Automation hooks use `data-testid` attributes and debug-gated features only
