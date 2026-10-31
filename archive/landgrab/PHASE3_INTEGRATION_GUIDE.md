# Phase 3 MapOrchestrator + gridDiff + SignalR Integration Guide

## 1. GAME STATE TYPES
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/types/game.ts`

### GameState Interface (Lines 179-216)
```typescript
interface GameState {
  roomCode: string;
  phase: GamePhase; // 'Lobby' | 'Playing' | 'GameOver'
  gameMode: GameMode; // 'Alliances' | 'FreeForAll'
  players: Player[];
  alliances: AllianceDto[];
  eventLog?: GameEventLogEntry[] | null;
  grid: Record<string, HexCell>;  // KEY: "${q},${r}"
  mapLat: number | null;
  mapLng: number | null;
  hasMapLocation: boolean;
  gridRadius: number;
  gameAreaMode: GameAreaMode;
  gameAreaPattern: GameAreaPattern | null;
  tileSizeMeters: number;
  claimMode: ClaimMode;
  dynamics: GameDynamics;
  winConditionType: WinConditionType;
  winnerId?: string;
  isPaused?: boolean;
  activeRaids?: ActiveCommandoRaid[];
  contestedEdges?: ContestedEdgeDto[] | null;
  supplyEdges?: SupplyEdgeDto[] | null;
  disconnectedHexKeys?: string[] | null;
}
```

### HexCell Interface (Lines 83-100)
```typescript
interface HexCell {
  q: number;
  r: number;
  ownerId?: string;
  ownerAllianceId?: string;
  ownerName?: string;
  ownerColor?: string;
  troops: number;
  isMasterTile: boolean;
  terrainType?: TerrainType;
  // Phase 3: Rally
  isFortified?: boolean;
  // Phase 3: Shepherd
  lastVisitedAt?: string;
  // Phase 4: Engineer
  engineerBuiltAt?: string;
  isFort?: boolean;
}
```

### Player Interface (Lines 102-146)
**Key Properties for Phase 3:**
```typescript
interface Player {
  id: string;
  name: string;
  color: string;
  allianceId?: string;
  carriedTroops: number;
  carriedTroopsSourceQ?: number | null;
  carriedTroopsSourceR?: number | null;
  currentLat?: number | null;
  currentLng?: number | null;
  currentHexQ?: number | null;
  currentHexR?: number | null;
  isHost: boolean;
  isConnected: boolean;
  territoryCount: number;
  role?: PlayerRole; // 'Commander' | 'Scout' | 'Engineer'
  // Commander abilities
  rallyPointActive?: boolean;
  rallyPointDeadline?: string;
  rallyPointQ?: number;
  rallyPointR?: number;
}
```

---

## 2. TILE OVERLAY STORE
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/stores/tileOverlayStore.ts` (65 lines)

### TileState Type (Lines 4-20)
```typescript
interface TileState {
  q: number;
  r: number;
  ownerId?: string;
  ownerAllianceId?: string;
  ownerName?: string;
  ownerColor?: string;
  troops: number;
  isMasterTile: boolean;
  terrainType?: TerrainType;
  isFortified?: boolean;
  isFort?: boolean;
  engineerBuiltAt?: string;
  lastVisitedAt?: string;
  isInactive: boolean;
  hasActiveRaid: boolean;
}
```

### Store Actions
```typescript
interface TileOverlayStore {
  tiles: Record<string, TileState>;
  masterTileKey: string | null;
  alliances: AllianceDto[];
  dynamics: GameDynamics | null;
  selectedHexKey: string | null;
  currentHexKey: string | null;

  updateTiles: (changes: Record<string, TileState>) => void;
  removeTiles: (keys: string[]) => void;
  setFullGrid: (tiles: Record<string, TileState>, alliances, dynamics) => void;
  setSelectedHexKey: (key: string | null) => void;
  setCurrentHexKey: (key: string | null) => void;
}
```

**GOTCHA:** Keys are formatted as `"${q},${r}"` (e.g., "5,-3"). Master tile is identified via `isMasterTile` flag.

---

## 3. EFFECTS STORE
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/stores/effectsStore.ts` (35 lines)

### TroopMovement Type (Lines 4-10)
```typescript
interface TroopMovement {
  fromHex: string;     // "${q},${r}"
  toHex: string;       // "${q},${r}"
  count: number;
  type: 'transfer' | 'attack';
  teamColor: string;   // e.g., player.ownerColor
}
```

### Store Interface
```typescript
interface EffectsStore {
  contestedEdges: ContestedEdgeDto[];
  supplyEdges: SupplyEdgeDto[];
  disconnectedHexKeys: Set<string>;
  troopMovements: TroopMovement[];

  setEffects: (effects: { contestedEdges, supplyEdges, disconnectedHexKeys }) => void;
  setTroopMovements: (movements: TroopMovement[]) => void;
}
```

**USAGE:** Call `useEffectsStore.getState().setTroopMovements(detected)` when useGridDiff detects movements.

---

## 4. PLAYER LAYER STORE
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/stores/playerLayerStore.ts` (23 lines)

### Store Interface
```typescript
interface PlayerLayerStore {
  players: Player[];
  myUserId: string;
  currentLocation: { lat: number; lng: number } | null;

  setPlayers: (players: Player[]) => void;
  setMyUserId: (id: string) => void;
  setCurrentLocation: (loc: { lat: number; lng: number } | null) => void;
}
```

**MINIMAL ACTIONS:** Layer store is simple; most player logic lives in gameStore.

---

## 5. useGridDiff HOOK
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useGridDiff.ts` (179 lines)

### Algorithm Summary
- **Input:** `grid: Record<string, HexCell>` (keyed by "${q},${r}")
- **Output:** `TroopMovement[]` (array of detected movements)
- **Max movements:** 10 (keeps only latest via `.slice(-MAX_MOVEMENTS)`)
- **Auto-clear:** 1500ms after last detection

### Key Logic Pattern (Lines 84-147)
1. **Skip optimization:** `hasGridChanged()` does sampled check (first, middle, last keys)
2. **Attack detection:** Loop hex keys, check if `ownerId` changed + adjacent friendly hex lost troops
3. **Transfer detection:** Loop hex keys, check if same-owner hex gained troops from adjacent friendly
4. **Neighbor offsets:** 6-direction hex grid (see NEIGHBOR_OFFSETS array, lines 12-19)

### Critical Code Section (Lines 86-115)
```typescript
// ATTACK: hex changed owner
if (curr.ownerId && old.ownerId && curr.ownerId !== old.ownerId) {
  const [q, r] = parseKey(key);
  for (const [dq, dr] of NEIGHBOR_OFFSETS) {
    const nk = toKey(q + dq, r + dr);
    const nCurr = grid[nk];
    const nOld = prev[nk];
    if (nCurr && nOld && nCurr.ownerId === curr.ownerId && nOld.troops > nCurr.troops) {
      detected.push({
        fromHex: nk,
        toHex: key,
        count: nOld.troops - nCurr.troops,
        type: 'attack',
        teamColor: curr.ownerColor ?? '#ffffff',
      });
      break;  // IMPORTANT: Only first neighbor match
    }
  }
  continue;
}

// TRANSFER: same owner, gained troops
if (curr.ownerId && curr.ownerId === old.ownerId && curr.troops > old.troops) {
  const gained = curr.troops - old.troops;
  const [q, r] = parseKey(key);
  for (const [dq, dr] of NEIGHBOR_OFFSETS) {
    const nk = toKey(q + dq, r + dr);
    const nCurr = grid[nk];
    const nOld = prev[nk];
    if (nCurr && nOld && nCurr.ownerId === curr.ownerId && nOld.ownerId === curr.ownerId && nOld.troops > nCurr.troops) {
      detected.push({
        fromHex: nk,
        toHex: key,
        count: gained,
        type: 'transfer',
        teamColor: curr.ownerColor ?? '#ffffff',
      });
      break;  // IMPORTANT: Only first neighbor match
    }
  }
}
```

### GOTCHA #1
- **Loop only checks first matching neighbor.** If multiple adjacent friendly hexes lost troops, only the first match is credited.
- **Transfers accumulate:** All gained troops attributed to single fromHex neighbor.

### GOTCHA #2
- **useRef + setTimeout chain:** Merges detected movements into state via `setTimeout(..., 0)`, then auto-clears after CLEAR_DELAY_MS.
- Must maintain both `prevGridRef` and `clearTimerRef` to avoid memory leaks on unmount.

### GOTCHA #3
- **First render is skipped:** Empty previous grid = no detection. Only diffs from second update onwards.
- Useful for avoiding spurious movements on initial load.

---

## 6. useSignalRHandlers HOOK
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts` (401 lines)

### Input Interface (Lines 20-28)
```typescript
interface UseSignalRHandlersOptions {
  getInvoke: () => SignalRInvoke | null;
  saveSession: (roomCode: string) => void;
  resolveResumeFromState: (state: GameState) => boolean;
  resolveResumeFromError: (message: string) => boolean;
  savedSessionRef: MutableRefObject<SavedSession | null>;
  t: TFunction;  // i18next
  playSound: (name: SoundName) => void;
}
```

### Returned GameEvents (Lines 156-399)
```typescript
interface GameEvents {
  onRoomCreated?: (code: string, state: GameState) => void;
  onPlayerJoined?: (state: GameState) => void;
  onGameStarted?: (state: GameState) => void;
  onStateUpdated?: (state: GameState) => void;      // MAIN: grid updates
  onPlayersMoved?: (players: Player[]) => void;
  onCombatResult?: (result: CombatResult) => void;
  onNeutralClaimResult?: (result: NeutralClaimResult) => void;
  onDrainTick?: (data: {...}) => void;
  onDynamicsChanged?: (dynamics: GameDynamics) => void;
  onGameOver?: (data: {...}) => void;
  onTileLost?: (data: {...}) => void;
  onError?: (message: string) => void;
  onReconnected?: () => void;
  onHostMessage?: (data: {...}) => void;
  onTemplateSaved?: (data: {...}) => void;
}
```

### Key Handler: onStateUpdated (Lines 204-274)
**This is where grid diff logic hooks in.**
```typescript
onStateUpdated: (state) => {
  const normalizedState = normalizeGameState(state, gameState);
  const gameplayState = useGameplayStore.getState();
  
  // Check if prompts should auto-clear
  const shouldClearPickup = shouldClearPickupPrompt(...);
  const shouldClearAttack = shouldClearAttackPrompt(...);
  // ... (more prompt checks)

  // Update stores
  resolveResumeFromState(normalizedState);
  useGameStore.getState().setGameState(normalizedState);
  
  // Clear prompts if needed
  if (shouldClearPickup) gameplayState.setPickupPrompt(null);
  if (shouldClearAttack) gameplayState.setAttackPrompt(null);
  // ...

  // Update view based on phase
  if (normalizedState.phase === 'Playing') useUiStore.getState().setView('game');
  // ...

  // Show toasts for event log entries
  const prevLog = gameState?.eventLog ?? [];
  const newLog = normalizedState.eventLog ?? [];
  if (newLog.length > prevLog.length) {
    const newEntries = newLog.slice(prevLog.length);
    // Push event log toasts
  }
}
```

### GOTCHA #1
- **normalizeGameState() is called on every update.** Ensures consistency with previous state.
- Must preserve this call in any orchestrator layer.

### GOTCHA #2
- **Event log handled here:** New entries trigger info ledge toasts. Phase 3 events must extend GameEventLogEntry type.

### GOTCHA #3
- **Prompt auto-clear logic:** shouldClearPickupPrompt, shouldClearAttackPrompt, etc. prevent stale UI.
- New ability prompts need similar helper functions (e.g., `shouldClearRallyPointPrompt`).

### Dependencies (Line 399)
```typescript
[gameState, getInvoke, playSound, resolveResumeFromError, resolveResumeFromState, saveSession, savedSessionRef, t]
```
All must be provided or memoized to avoid infinite re-renders.

---

## 7. useSignalR HOOK
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useSignalR.ts` (100+ lines)

### Summary
- **Manages hub connection lifecycle:** connect, reconnect, disconnect.
- **Uses auto-reconnect backoff:** AUTO_RECONNECT_DELAYS array.
- **Manual reconnect on failure:** MANUAL_RECONNECT_DELAY_MS (15s), max 40 attempts.
- **Registers GameEvents handlers on connection:** `connection.on('EventName', handler)`.

### Key Props
```typescript
function useSignalR(token: string | null, events: GameEvents)
// Returns: { connection, connected, reconnecting }
```

### Integration Pattern
1. **App.tsx** creates GameEvents handlers via `useSignalRHandlers()`.
2. **App.tsx** passes events to `useSignalR()`.
3. On connection, `useSignalR` registers all handlers with the hub.
4. Server sends grid updates → `onStateUpdated` → handlers update stores.

---

## 8. NO EXISTING useMapOrchestrator

**Finding:** No `useMapOrchestrator` hook exists. Orchestration currently happens in:
1. **App.tsx** (top-level coordinator)
2. **GameView.tsx** (game-phase presenter)
3. **Individual hooks** (useGameActions, useGameActionsGameplay, etc.)

### Current Pattern (GameView.tsx Lines 75-150)
```typescript
/**
 * Renders the full in-game UI for `view === 'game'`.
 * Reads gameState, selectedHexKey, combatPreview, combatResult from Zustand stores.
 * Delegates everything else through props to keep App as a thin orchestrator.
 */
export function GameView({
  userId,
  currentLocation,
  currentHex,
  actions,  // GameViewActions from App
}: GameViewProps) {
  const gameState = useGameStore(state => state.gameState);
  const selectedHexKey = useTileOverlayStore(state => state.selectedHexKey);
  const combatPreview = useGameplayStore(state => state.combatPreview);
  // ... more store reads
  
  // If no gameState, return null (guards against render before load)
  if (!gameState) return null;
  
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CombatModal ... />
      <CombatPreviewModal ... />
      <GameMap ... />
      <PlayingHud ... />
      {/* ... modals and UI */}
    </Suspense>
  );
}
```

### Implication for Phase 3
- **No explicit orchestrator hook exists yet.** You'll need to create `useMapOrchestrator.ts`.
- Should house Phase 3-specific logic:
  - Troop movement detection (via useGridDiff)
  - Rally point visualization
  - Fortification UI updates
  - Shepherd beacon tracking

---

## IMPLEMENTATION ROADMAP

### Step 1: Create useMapOrchestrator Hook
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`

```typescript
import { useEffect, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useTileOverlayStore } from '../stores/tileOverlayStore';
import { useEffectsStore } from '../stores/effectsStore';
import { useGridDiff } from './useGridDiff';

interface UseMapOrchestratorOptions {
  // Phase 3: Rally
  onRallyPointUpdated?: (q: number, r: number) => void;
  // Phase 3: Shepherd
  onLastVisitedUpdated?: () => void;
  // Animations/effects
  onTroopMovementDetected?: (movement: TroopMovement) => void;
}

export function useMapOrchestrator(options?: UseMapOrchestratorOptions) {
  const gameState = useGameStore(state => state.gameState);
  const { tiles } = useTileOverlayStore();
  const { setTroopMovements } = useEffectsStore();
  
  // Detect troop movements
  const grid = useMemo(() => {
    if (!gameState) return {};
    return gameState.grid;
  }, [gameState?.grid]);
  
  const troopMovements = useGridDiff(grid);
  
  // Sync detected movements to effects store
  useEffect(() => {
    setTroopMovements(troopMovements);
    troopMovements.forEach(m => options?.onTroopMovementDetected?.(m));
  }, [troopMovements, setTroopMovements, options]);
  
  // Phase 3: Rally point tracking
  useEffect(() => {
    // Listen for rallyPointActive changes on current player
    // Update UI when rally point Q/R changes
  }, [gameState?.players]);
  
  // Phase 3: Shepherd tracking
  useEffect(() => {
    // Listen for lastVisitedAt changes
    // Update tile overlay visual states
  }, [gameState?.grid]);
}
```

### Step 2: Hook into useSignalRHandlers
**Modify:** `onStateUpdated` in useSignalRHandlers to trigger MapOrchestrator side effects.
- After `useGameStore.getState().setGameState(normalizedState)`, the orchestrator's useGridDiff will auto-detect.
- No changes needed; useEffect dependency on gameState.grid handles it.

### Step 3: Update TileOverlayStore for Phase 3 Visuals
**Add to tileOverlayStore.ts:**
```typescript
interface TileOverlayStore {
  // ... existing
  rallyPointHexKey: string | null;
  setRallyPointHexKey: (key: string | null) => void;
  
  shepherdBeaconHexKeys: Set<string>;
  setShepherdBeaconHexKeys: (keys: Set<string>) => void;
}
```

### Step 4: Extend useGameActionsGameplay for Phase 3
**File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts`

Add signalR invoke calls for:
- `ActivateRallyPoint(q, r)`
- `DeactivateRallyPoint()`
- `CheckBeaconStatus()` (Shepherd)

---

## GOTCHAS & WARNINGS

### 1. HexCell Key Format
- Always `"${q},${r}"` (e.g., `"5,-3"`).
- parseKey() and toKey() helpers already exist in useGridDiff.ts.
- Replicate or import these for consistency.

### 2. useGridDiff Timing
- **First render skipped:** No movements detected on initial load.
- **Auto-clear timeout:** Movements disappear 1500ms after last detection.
- Design UI animations to complete within this window.

### 3. SignalR Event Log
- **New events must extend GameEventLogEntry** with type, message, and optional timestamps.
- **Toasts appear in onStateUpdated**, not in event-specific handlers.
- Phase 3 events: `RallyPointActivated`, `RallyPointResolved`, `ShepherdBeaconTracked`.

### 4. normalizeGameState() Requirement
- Always call this in state update handlers to ensure UI consistency.
- Handles timestamp normalization, player list alignment, grid normalization.
- Check gameHelpers.ts for implementation details.

### 5. Store Coupling
- **gameStore** holds GameState (canonical source).
- **tileOverlayStore** holds TileState (derived display state).
- **effectsStore** holds visual effects (TroopMovement, ContestedEdges).
- Update order: gameStore → tileOverlayStore → effectsStore.

### 6. Testing useGridDiff
- Create mock grid with 2 versions: prev and next.
- Verify attack detection: ownerId change + adjacent friendly loses troops.
- Verify transfer detection: same owner, gained troops from adjacent friendly.
- Verify auto-clear timer doesn't leak on unmount.

---

## FILE SUMMARY TABLE

| File | Purpose | Key Exports | Lines |
|------|---------|-------------|-------|
| game.ts | Type definitions | GameState, HexCell, Player, etc. | 355 |
| tileOverlayStore.ts | Tile display state | TileState, useTileOverlayStore | 65 |
| effectsStore.ts | Visual effects state | TroopMovement, useEffectsStore | 35 |
| playerLayerStore.ts | Player display state | PlayerLayerStore, usePlayerLayerStore | 23 |
| useGridDiff.ts | Movement detection | useGridDiff hook | 179 |
| useSignalRHandlers.ts | SignalR event handlers | GameEvents, useSignalRHandlers | 401 |
| useSignalR.ts | Hub connection lifecycle | useSignalR hook | 100+ |

---

## RECOMMENDED READING ORDER

1. **types/game.ts** — Understand data shapes
2. **stores/effectsStore.ts** — Simplest store to understand pattern
3. **stores/tileOverlayStore.ts** — Main tile display logic
4. **hooks/useGridDiff.ts** — Core movement detection (PORT THIS EXACTLY)
5. **hooks/useSignalRHandlers.ts** — Where updates flow from server
6. **hooks/useSignalR.ts** — Connection management
7. **GameView.tsx** — See orchestration pattern
