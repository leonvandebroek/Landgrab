# SignalR Hub Reference

All real-time game communication goes through the SignalR hub at `/hub/game`.

The hub uses JSON serialization with **string enums** (`GamePhase`, `GameMode` are sent as `"Lobby"`, `"Reinforce"`, etc. — not integers).

---

## Connecting

```typescript
import * as signalR from '@microsoft/signalr';

const connection = new signalR.HubConnectionBuilder()
  .withUrl('/hub/game', {
    accessTokenFactory: () => localStorage.getItem('token') ?? '',
  })
  .withAutomaticReconnect()
  .build();

await connection.start();
```

Authentication is via the `?access_token=<jwt>` query string, which is extracted by the `OnMessageReceived` event in `Program.cs`.

---

## Client → Server (Invoke Methods)

All methods are called via `connection.invoke(methodName, ...args)`. They all return `void` (errors are sent back via the `Error` event).

### Alliances Game

| Method | Parameters | Description |
|--------|-----------|-------------|
| `CreateRoom` | — | Create a new room. Caller becomes host. |
| `JoinRoom` | `roomCode: string` | Join an existing room by its 6-character code. |
| `SetAlliance` | `allianceName: string` | Set (or create) your alliance within the current room. Max 4 alliances per game. |
| `SetMapLocation` | `lat: number, lng: number` | Host only. Set the real-world anchor for the hex grid. |
| `StartGame` | — | Host only. Transition from Lobby → Reinforce phase. |
| `PlaceReinforcement` | `q: number, r: number` | Place one troop on a hex. Rules vary by turn number — see [game-rules.md](game-rules.md). |
| `RollDice` | — | Roll 2d6 to determine moves for the Claim/Attack phase. |
| `ClaimHex` | `q: number, r: number` | Claim an empty, adjacent hex. Costs 1 move. |
| `AttackHex` | `fromQ: number, fromR: number, toQ: number, toR: number` | Attack an enemy or neutral hex. Costs 1 move. Triggers `CombatResult`. |
| `EndTurn` | — | End your turn, pass play to the next player. |

### Global Map (FFA)

| Method | Parameters | Description |
|--------|-----------|-------------|
| `JoinGlobalMap` | — | Join the global FFA map. Drops player near their persisted location. |
| `LoadGlobalMap` | `lat: number, lng: number` | Load hexes visible near a geographic location. |
| `AttackGlobalHex` | `fromQ: number, fromR: number, toQ: number, toR: number` | Attack a global FFA hex from an adjacent owned hex. |

---

## Server → Client (Events)

Register listeners via `connection.on(eventName, handler)`.

### `RoomCreated`

Sent only to the room creator immediately after `CreateRoom`.

```typescript
connection.on('RoomCreated', (roomCode: string) => {
  // e.g. "A3BC7X"
});
```

---

### `PlayerJoined`

Broadcast to all room members when a new player joins.

```typescript
connection.on('PlayerJoined', (state: GameState) => {
  // full game state with new player added
});
```

---

### `GameStarted`

Broadcast to all room members when the host starts the game.

```typescript
connection.on('GameStarted', (state: GameState) => {
  // phase is now "Reinforce"
});
```

---

### `StateUpdated`

The primary event. Broadcast to all room members after every game action.

```typescript
connection.on('StateUpdated', (state: GameState) => {
  setGameState(state);
  clearError();
});
```

---

### `CombatResult`

Sent after `AttackHex` resolves. Contains dice rolls, losses, and the new game state.

```typescript
connection.on('CombatResult', (result: CombatResult) => {
  setCombatResult(result);
  setGameState(result.newState);
  clearError();
});
```

---

### `GameOver`

Broadcast when a win condition is met.

```typescript
connection.on('GameOver', (state: GameState) => {
  // state.phase === "GameOver"
  // state.winnerId / state.winnerName are set
  // state.isAllianceVictory indicates whether an alliance won
});
```

---

### `GlobalHexUpdated`

Sent after a global FFA hex changes ownership.

```typescript
connection.on('GlobalHexUpdated', (hex: GlobalHex) => {
  // update the single hex in local state
});
```

---

### `GlobalMapLoaded`

Response to `LoadGlobalMap`. Sends all visible hexes near the requested location.

```typescript
connection.on('GlobalMapLoaded', (hexes: GlobalHex[]) => {
  // replace or merge into local hex map
});
```

---

### `Error`

Sent to the calling client when a hub method fails validation.

```typescript
connection.on('Error', (message: string) => {
  setError(message);   // display to user
});
```

---

## TypeScript Types

```typescript
// From src/types/game.ts

type GamePhase = 'Lobby' | 'Reinforce' | 'Roll' | 'Claim' | 'GameOver';
type GameMode  = 'Alliances' | 'FreeForAll';

interface GameState {
  roomCode: string;
  phase: GamePhase;
  mode: GameMode;
  players: PlayerDto[];
  alliances: AllianceDto[];
  grid: Record<string, HexCell>;   // keyed by "q,r"
  currentPlayerId: string;
  movesRemaining: number;
  lastDiceRoll: number[];
  mapLat: number | null;
  mapLng: number | null;
  gridRadius: number;              // default 8 → 217 hexes
  turnNumber: number;
  winnerId: string | null;
  winnerName: string | null;
  isAllianceVictory: boolean;
}

interface PlayerDto {
  id: string;
  name: string;
  color: string;
  allianceId: string | null;
  allianceName: string | null;
  allianceColor: string | null;
  troopsToPlace: number;
  territoryCount: number;
  isHost: boolean;
  isConnected: boolean;
}

interface AllianceDto {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
  territoryCount: number;
}

interface HexCell {
  q: number;
  r: number;
  ownerId: string | null;
  ownerAllianceId: string | null;
  ownerName: string | null;
  ownerColor: string | null;
  troops: number;
}

interface CombatResult {
  attackDice: number[];
  defendDice: number[];
  attackerWon: boolean;
  hexCaptured: boolean;
  attackerLost: number;
  defenderLost: number;
  newState: GameState;
}

interface GlobalHex {
  q: number;
  r: number;
  ownerUserId: string | null;
  ownerAllianceId: string | null;
  troops: number;
  lastCaptured: string | null;
  attackCooldownUntil: string | null;
  owner: { username: string } | null;
  ownerAlliance: { name: string; tag: string } | null;
}
```

---

## Stale Closure Pattern

The `useSignalR` hook avoids stale closures by storing all event handlers in a `useRef` (`eventsRef`) that is updated on every render. Listeners always call through the ref:

```typescript
// Inside useSignalR — listeners never capture stale state
connection.on('StateUpdated', (...args) => eventsRef.current.onStateUpdated?.(...args));
```

When adding new hub events, follow this same pattern.
