---
name: landgrab-join-and-sync
description: 'Join a Landgrab game as a guest: create session, register/login, enter room code, join room, verify lobby sync, and wait for game start'
---

# Join and Sync as a Guest Player

This skill drives the guest-side workflow from browser session creation through joining an existing room and waiting for the host to start the game. The guest sees a simplified 3-step wizard view.

## When to use this skill

Use this skill when the playtester needs to:

- Join an existing game room as a guest player using a room code
- Verify that the guest appears in the lobby player list
- Wait for the host to configure and start the game
- Confirm lobby synchronization across all players

## Prerequisites

- Backend running at `http://localhost:5001`
- Frontend running at `http://localhost:5173`
- A browser session created for the guest player (separate from the host session)
- The host has already created a room and has a valid 6-character room code

## Workflow

### Step 1 — Register or log in the guest

1. Navigate to the frontend at `http://localhost:5173` in the guest's browser session.
2. If the guest user does not exist, switch to the Sign-Up tab (`data-testid="auth-sign-up-tab"`).
   - Fill username (`data-testid="auth-username-input"`), email (`data-testid="auth-email-input"`), and password (`data-testid="auth-password-input"`, min 8 characters).
   - Click submit (`data-testid="auth-submit-btn"`).
3. If the guest user already exists, use the Sign-In tab (`data-testid="auth-sign-in-tab"`).
   - Fill username or email (`data-testid="auth-username-input"`) and password (`data-testid="auth-password-input"`).
   - Click submit (`data-testid="auth-submit-btn"`).
4. **Verify**: The lobby screen appears with `data-testid="lobby-entry"` visible.
5. Use a unique username and email per guest to avoid conflicts (e.g., `guest1`, `guest2`).

### Step 2 — Enter the room code and join

1. Locate the room code input (`data-testid="lobby-join-code-input"`).
2. Type the 6-character room code provided by the host.
3. Click the join button (`data-testid="lobby-join-btn"`). The button is disabled until the code is exactly 6 characters.
4. Wait for the `PlayerJoined` SignalR event or the guest wizard view to appear.
5. **Verify**: The setup wizard is visible (`data-testid="setup-wizard"`) and the room code shown in `data-testid="wizard-room-code"` matches the entered code.
6. **Evidence**: Screenshot the joined state showing the guest wizard view.

### Step 3 — Verify lobby synchronization

1. Check that the guest's player name appears in the host's lobby player list.
2. Check that the host's player name and any other guests appear in the guest's view.
3. Verify the player count matches expectations across all browser sessions.
4. **Verify**: All expected players are visible in both host and guest sessions.
5. **Evidence**: Screenshot both the host and guest views showing the synchronized player list.

### Step 4 — Wait for game configuration (guest wizard)

1. The guest sees a simplified 3-step wizard:
   - **Step 0**: Waiting for host to set location (locked).
   - **Step 1**: Teams — the guest can see alliance assignments as the host configures them.
   - **Step 2**: Review — unlocked when the host has set the master tile and the game is ready.
2. The guest cannot advance wizard steps independently; progression is driven by the host.
3. **Verify**: The guest wizard step updates as the host progresses through configuration.

### Step 5 — Wait for game start

1. Wait for the `GameStarted` SignalR event or the game phase to transition to `Playing`.
2. The game view should appear with the hex map and player state.
3. **Verify**: The game phase is `Playing` and the guest can see the game grid.
4. **Evidence**: Screenshot the game-started state from the guest's perspective.

## Key SignalR Methods

| Direction | Method | Purpose |
|-----------|--------|---------|
| Invoke | `JoinRoom(code)` | Join an existing room by code |
| Invoke | `RejoinRoom(code)` | Reconnect to a room (auto-resume) |
| Invoke | `GetMyRooms()` | Fetch recent rooms |
| Event | `PlayerJoined(state)` | Player joined confirmation with updated state |
| Event | `GameStarted(state)` | Game phase transition to Playing |
| Event | `StateUpdated(state)` | General state update |
| Event | `Error(message)` | Error from the hub (e.g., invalid room code) |

## Auto-Resume

If the guest's browser session disconnects and reconnects:

1. The frontend automatically calls `RejoinRoom(code)` using the room code stored in localStorage under the key `landgrab_session`.
2. **Verify**: The guest rejoins the correct room and sees the current game state.
3. If auto-resume fails, manually re-enter the room code and join again.

## Success Criteria

- Guest successfully authenticates (register or login).
- Guest joins the room using the correct 6-character code.
- Guest appears in the host's player list.
- Host and all other players appear in the guest's view.
- Guest wizard progresses as the host configures the game.
- Game start is received and the guest transitions to the Playing phase.
- Screenshots captured at: lobby joined, player list synchronized, game started.

## Failure Handling

- If the join button stays disabled, verify the room code is exactly 6 characters.
- If `JoinRoom` returns an error, check that the room code is valid and the room has not been destroyed.
- If the guest does not appear in the host's player list, check SignalR connection status and look for console errors.
- If the guest wizard does not update when the host progresses, check for `StateUpdated` events and SignalR connectivity.
- Never assume the join succeeded without verifying the player list — always confirm through the UI.
