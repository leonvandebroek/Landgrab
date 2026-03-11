# Game Rules

This document covers the Alliances (room-based) game mode. For the persistent Free-for-All (Global Map) mode, see the [FFA section](#free-for-all-global-map) at the bottom.

---

## Setup

1. A host creates a room and receives a 6-character alphanumeric code (e.g. `A3BC7X`)
2. Other players join by entering the code
3. The host optionally sets alliances (up to 4 per game; players can share an alliance)
4. The host sets a **map location** — a real-world latitude/longitude that anchors the hex grid on the map
5. The host starts the game (requires a map location to be set)

**Room constraints:** 2–4 players, up to 4 alliances. Colors are auto-assigned; players cannot choose them.

---

## Phase State Machine

```
Lobby
  │  (host clicks Start Game)
  ▼
Reinforce  ◄─────────────────────────┐
  │  (all players have placed         │
  │   their initial troops)           │
  ▼                                   │
Roll                                  │
  │  (current player rolls dice)      │
  ▼                                   │
Claim / Attack                        │
  │  (moves exhausted OR              │
  │   player ends turn)               │
  └────────── EndTurn ────────────────┘
                │
                └── (win condition met) ──► GameOver
```

---

## Phase Details

### Reinforce

Each player places **3 troops** before the game begins in earnest.

- **Turn 0 (initial placement):** You may place a troop on **any empty hex** anywhere on the grid
- **Turn 1+ (mid-game reinforcement):** You may only place a troop on a **hex you already own**
- All players take turns reinforcing; order is determined by join order
- Once every player has placed all 3 troops, the phase advances to **Roll**

### Roll

The active player rolls 2d6. The total becomes their `MovesRemaining` for this turn.

- Rolling is mandatory — you cannot skip it
- After rolling, the phase advances to **Claim / Attack**

### Claim / Attack

The active player uses their `MovesRemaining` to take hexes. Each action costs **1 move**.

**Claim (empty hex):**
- Target hex must be **empty** (no owner)
- Target hex must be **adjacent** to a hex you already own, or adjacent to an allied hex

**Attack (enemy hex):**
- Target hex must be owned by **another player** or a **different alliance**
- You cannot attack your own hexes or allied hexes
- Source hex must be adjacent to the target hex
- Triggers the [combat resolution](#combat-resolution) process

The turn ends when either:
- `MovesRemaining` reaches 0
- The player clicks **End Turn**

### GameOver

Win conditions are checked after every action:

| Condition | Result |
|-----------|--------|
| One player owns all hexes | Solo victory |
| One alliance (all members) owns all hexes | Alliance victory |

The `GameState` fields `winnerId`, `winnerName`, and `isAllianceVictory` are set and a `GameOver` event is broadcast.

---

## Combat Resolution

When a player attacks a hex:

### Attacker dice
- Base: **2d6**
- Alliance defense bonus: if the **defender** shares a border with allied hexes, defenders get a bonus die

### Defender dice
- **1d6**
- Plus bonus dice for each allied border hex (computed by `HexService.CountAllyBorderHexes`)

### Resolution
1. All dice are rolled
2. The highest attacker die is compared against the highest defender die
3. **Attacker wins** if their highest die is strictly greater than the defender's highest
4. On attacker win:
   - Attacker troop count on the source hex decreases by `attackerLost`
   - Target hex is captured: defender troops removed, attacker troops placed
   - `hexCaptured = true`
5. On defender win (attacker repelled):
   - Attacker loses troops on source hex
   - Defender loses troops on target hex
   - `hexCaptured = false`
6. Results are broadcast as a `CombatResult` event (dice arrays, troop losses, new game state)

---

## Turn Order

Turn order is determined by the order players joined the room. After a player ends their turn:

1. `CurrentPlayerIndex` advances (wraps around)
2. The new active player receives **3 troops** to reinforce
3. `TurnNumber` increments
4. Phase resets to **Reinforce** for the new player

---

## Alliance Rules

- Alliances are set in the lobby before the game starts
- Alliance members **cannot attack each other**
- Allied hexes count as "own territory" for adjacency checks when claiming new hexes
- Alliances provide a combat defense bonus (`CountAllyBorderHexes`)
- For a win condition, an entire alliance must collectively own every hex

---

## Free-for-All (Global Map)

The global map is a shared, always-on sandbox. Rules differ significantly:

- **No turns or phases** — actions are taken freely at any time
- **Starting hex:** On joining, the server finds the nearest unclaimed hex within a 5-hex radius and assigns it with 3 troops
- **Attacking:** Call `AttackGlobalHex` with adjacent `(fromQ, fromR)` and `(toQ, toR)` coordinates
- **Combat:** Simplified — attacker has advantage (d6 with advantage vs d6); attacker wins on tie
- **Cooldown:** After a *failed* attack, there is a **5-minute cooldown** before you can attack again from that hex
- **Empty hex:** Claimed directly without combat
- **Persistence:** All hex ownership survives server restarts (stored in PostgreSQL)
- **Leaderboard:** Available at `GET /api/global/leaderboard` (top 20 by hex count)
