---
name: landgrab-playturn
description: 'Execute gameplay turns: move via debug GPS, claim hexes, attack enemies, pick up troops, and verify state through SignalR updates'
---

# Play a Turn in Landgrab

This skill drives deterministic turn execution during the Playing phase. All movement uses the debug GPS panel. All game actions go through SignalR invocations. Every action is verified through state updates before advancing.

## When to use this skill

Use this skill when the playtester needs to:

- Move a player to a specific hex using debug GPS
- Claim an unowned or alliance hex
- Attack an enemy-owned hex
- Pick up troops from a tile
- Verify that state updates are received and reflected in the UI
- Execute a scripted sequence of turns across multiple players

## Prerequisites

- The game is in the `Playing` phase (use `landgrab-host-and-start` first).
- All players have active browser sessions.
- The debug GPS panel is available and enabled (`data-testid="debug-gps-toggle"`).
- The player has troops to spend (check `carriedTroops` in state).

## Workflow

### Step 1 — Get the current state

1. Observe the current game state from the UI or capture a state snapshot.
2. Identify the active player, their current hex position, carried troops, and owned tiles.
3. Identify the target hex for the next action.
4. **Verify**: The game phase is `Playing` and the player has a valid position on the grid.

### Step 2 — Move via debug GPS

1. Locate the debug GPS panel (`data-testid="debug-gps-panel"`).
2. Ensure debug GPS is enabled (`data-testid="debug-gps-toggle"` is active).
3. Use the directional step buttons to move toward the target hex:
   - North: `data-testid="debug-gps-step-north"` (dq=0, dr=+1)
   - South: `data-testid="debug-gps-step-south"` (dq=0, dr=-1)
   - East: `data-testid="debug-gps-step-east"` (dq=+1, dr=0)
   - West: `data-testid="debug-gps-step-west"` (dq=-1, dr=0)
4. Each click moves the player one hex in the given direction.
5. The frontend sends `UpdatePlayerLocation(lat, lng)` after each step.
6. **Verify**: The player's position on the hex map updates after each step.
7. **Evidence**: Screenshot the player's position after movement.

### Step 3 — Claim a hex

To claim an unowned tile or reinforce an owned tile:

1. Click the target hex on the map to select it.
2. The action panel shows available actions based on tile ownership and player state.
3. For an unowned tile: select the Claim action.
   - Invokes `PlaceTroops(q, r, lat, lng, null, false)`.
4. For an already-owned tile: select the Reinforce action.
   - Invokes `PlaceTroops(q, r, lat, lng, null, false)`.
5. For claiming for yourself in alliance mode: select Claim Self.
   - Invokes `PlaceTroops(q, r, lat, lng, null, true)`.
6. Wait for the `StateUpdated` event confirming the tile ownership change.
7. **Verify**: The hex color/ownership changes in the UI and `carriedTroops` decreases by 1.
8. **Evidence**: Screenshot the claimed hex.

### Step 4 — Attack an enemy hex

To attack a hex owned by another player or alliance:

1. Click the enemy hex on the map to select it.
2. The action panel shows the Attack action with troop counts.
3. Choose the number of troops to attack with (up to available carried troops).
4. Confirm the attack.
   - Invokes `PlaceTroops(q, r, lat, lng, attackCount, false)`.
5. Wait for the `CombatResult` SignalR event: `{q, r, winnerId, winnerName}`.
6. If the attacker wins:
   - The hex ownership transfers.
   - Optionally reclaim via `ReClaimHex(q, r, mode)`.
7. If the defender wins:
   - The hex remains with the defender.
   - The attacker loses the committed troops.
8. **Verify**: The `CombatResult` event is received and the hex state matches the outcome.
9. **Evidence**: Screenshot the combat result and updated hex state.

### Step 5 — Pick up troops

To collect troops from a tile:

1. Click the target hex to select it.
2. The action panel shows the Pickup action if troops are available on the tile.
3. Choose the number of troops to pick up.
   - Invokes `PickUpTroops(q, r, count, lat, lng)`.
4. Wait for the `StateUpdated` event confirming the pickup.
5. **Verify**: `carriedTroops` increases and the tile's troop count decreases.
6. **Evidence**: Screenshot after pickup.

### Step 6 — Verify state synchronization

After each action, verify that all player sessions reflect the same state:

1. Check the acting player's UI for the expected state change.
2. Check at least one other player's session to confirm the broadcast was received.
3. Compare hex ownership, troop counts, and player positions across sessions.
4. **Verify**: All sessions show consistent state for the affected hexes.
5. **Evidence**: Side-by-side screenshots from multiple player sessions.

## Key SignalR Methods

| Direction | Method | Purpose |
|-----------|--------|---------|
| Invoke | `UpdatePlayerLocation(lat, lng)` | Broadcast location (sent by debug GPS) |
| Invoke | `PlaceTroops(q, r, lat, lng, attackCount, claimForSelf)` | Claim, reinforce, or attack |
| Invoke | `PickUpTroops(q, r, count, lat, lng)` | Pick up troops from tile |
| Invoke | `ReClaimHex(q, r, mode)` | Reclaim hex after combat loss |
| Event | `StateUpdated(state)` | State change broadcast |
| Event | `CombatResult(result)` | Combat outcome: winnerId, winnerName |
| Event | `TileLost(data)` | Notification that a tile was captured |
| Event | `Error(message)` | Action error from the hub |

## Hex Grid Reference

- Hex keys use the format `"q,r"` (e.g., `"3,-2"`).
- The grid uses axial coordinates with flat-top orientation.
- `gameState.grid` is a `Record<string, HexCell>` keyed by `"q,r"`.
- Debug GPS steps move one hex at a time in cardinal directions.

## Scripted Multi-Player Turn Sequence

For a deterministic playtest with 2 players:

1. **Player A** moves to hex `(1,0)` via debug GPS → claims it.
2. **Player B** moves to hex `(-1,0)` via debug GPS → claims it.
3. **Player A** moves to hex `(2,0)` → claims it.
4. **Player B** moves to hex `(0,0)` → claims it (if unowned) or attacks it.
5. Verify state after each action from both sessions.
6. Continue until the test scenario is complete.

Adapt the sequence based on the specific test scenario requested.

## Success Criteria

- All movements via debug GPS produce observable position changes.
- Claims transfer tile ownership and decrease carried troops.
- Attacks produce `CombatResult` events with deterministic outcomes.
- Pickups increase carried troops and decrease tile troop counts.
- State is synchronized across all player sessions after each action.
- No console errors during gameplay actions.

## Failure Handling

- If a claim is rejected, check claim mode rules (PresenceOnly, PresenceWithTroop, AdjacencyRequired) and whether the player has troops.
- If an attack fails, check that the target hex is enemy-owned and the player has sufficient troops.
- If debug GPS steps do not update position, check that the toggle is enabled and the game phase is `Playing`.
- If state desynchronization is detected, capture evidence from all sessions and report the mismatch.
- If a `TileLost` event fires unexpectedly, capture the event data and hex state as evidence.
