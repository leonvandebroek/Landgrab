# Phase 3 Quick Reference Card

## 1️⃣ TYPE IMPORTS NEEDED
```typescript
// From types/game.ts
import type {
  GameState,
  HexCell,
  Player,
  GameEventLogEntry,
  ContestedEdgeDto,
  SupplyEdgeDto,
} from '../types/game';

// From stores
import { useGameStore } from '../stores/gameStore';
import { useTileOverlayStore, type TileState } from '../stores/tileOverlayStore';
import { useEffectsStore, type TroopMovement } from '../stores/effectsStore';
import { usePlayerLayerStore } from '../stores/playerLayerStore';

// From hooks
import { useGridDiff } from './useGridDiff';
import { useSignalRHandlers } from './useSignalRHandlers';
import { useSignalR } from './useSignalR';
```

## 2️⃣ HEX COORDINATE KEY PATTERN
```typescript
// Always use "${q},${r}" format
const hexKey = `${q},${r}`;  // ✓ Correct
const hexKey = `${q}:${r}`;  // ✗ Wrong

// Parse from key
function parseKey(key: string): [number, number] {
  const sep = key.indexOf(',');
  return [Number(key.slice(0, sep)), Number(key.slice(sep + 1))];
}

// Create from coords
function toKey(q: number, r: number): string {
  return `${q},${r}`;
}
```

## 3️⃣ NEIGHBOR OFFSETS (6-HEX GRID)
```typescript
const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

// Use in loop
for (const [dq, dr] of NEIGHBOR_OFFSETS) {
  const neighborKey = toKey(q + dq, r + dr);
  const neighbor = grid[neighborKey];
  // ... check neighbor state
}
```

## 4️⃣ TROOP MOVEMENT DETECTION (useGridDiff Pattern)
```typescript
// ATTACK: Hex changed owner + adjacent friendly lost troops
if (curr.ownerId && old.ownerId && curr.ownerId !== old.ownerId) {
  for (const [dq, dr] of NEIGHBOR_OFFSETS) {
    const neighborKey = toKey(q + dq, r + dr);
    const nCurr = grid[neighborKey];
    const nOld = prev[neighborKey];
    if (nCurr && nOld && 
        nCurr.ownerId === curr.ownerId &&  // Same owner as attacker
        nOld.troops > nCurr.troops) {        // Lost troops
      movements.push({
        fromHex: neighborKey,
        toHex: key,
        count: nOld.troops - nCurr.troops,
        type: 'attack',
        teamColor: curr.ownerColor ?? '#ffffff',
      });
      break;  // ⚠️ ONLY FIRST MATCH
    }
  }
}

// TRANSFER: Same owner, gained troops from adjacent friendly
if (curr.ownerId === old.ownerId && curr.troops > old.troops) {
  const gained = curr.troops - old.troops;
  for (const [dq, dr] of NEIGHBOR_OFFSETS) {
    const neighborKey = toKey(q + dq, r + dr);
    const nCurr = grid[neighborKey];
    const nOld = prev[neighborKey];
    if (nCurr && nOld && 
        nCurr.ownerId === curr.ownerId &&     // Same owner
        nOld.ownerId === curr.ownerId &&      // Was same owner
        nOld.troops > nCurr.troops) {           // Lost troops
      movements.push({
        fromHex: neighborKey,
        toHex: key,
        count: gained,
        type: 'transfer',
        teamColor: curr.ownerColor ?? '#ffffff',
      });
      break;  // ⚠️ ONLY FIRST MATCH
    }
  }
}
```

## 5️⃣ SIGNALR HANDLER INTEGRATION
```typescript
// In useSignalRHandlers, onStateUpdated handler:
onStateUpdated: (state) => {
  const normalizedState = normalizeGameState(state, gameState);
  
  // ✓ CRITICAL: Always normalize first
  const gameplayState = useGameplayStore.getState();
  
  // Check if prompts need clearing
  const shouldClearPickup = shouldClearPickupPrompt(
    gameplayState.pickupPrompt,
    gameState,
    normalizedState
  );
  
  // Update game state (triggers useGridDiff via dependency)
  useGameStore.getState().setGameState(normalizedState);
  
  // ✓ Clear prompts based on state changes
  if (shouldClearPickup) gameplayState.setPickupPrompt(null);
  
  // Handle new event log entries
  const prevLog = gameState?.eventLog ?? [];
  const newLog = normalizedState.eventLog ?? [];
  if (newLog.length > prevLog.length) {
    const newEntries = newLog.slice(prevLog.length);
    for (const entry of newEntries) {
      // Entry.type could be 'RallyPointActivated', 'ShepherdBeaconTracked', etc.
      useInfoLedgeStore.getState().push({
        severity: 'gameEvent',
        source: 'gameToast',
        persistent: false,
        message: entry.message,
      });
    }
  }
}
```

## 6️⃣ TILE OVERLAY STORE UPDATES
```typescript
// Update tiles from new game state
const updateTilesFromGrid = (grid: Record<string, HexCell>) => {
  const changes: Record<string, TileState> = {};
  for (const [key, hexCell] of Object.entries(grid)) {
    changes[key] = {
      q: hexCell.q,
      r: hexCell.r,
      ownerId: hexCell.ownerId,
      ownerColor: hexCell.ownerColor,
      troops: hexCell.troops,
      isMasterTile: hexCell.isMasterTile,
      terrainType: hexCell.terrainType,
      // Phase 3:
      isFortified: hexCell.isFortified,
      lastVisitedAt: hexCell.lastVisitedAt,
      isInactive: false,  // Compute from game logic
      hasActiveRaid: false,  // Check activeRaids[]
    };
  }
  useTileOverlayStore.getState().updateTiles(changes);
};
```

## 7️⃣ EFFECTS STORE SYNC
```typescript
// After useGridDiff detects movements, sync to effects
const troopMovements = useGridDiff(grid);
useEffect(() => {
  useEffectsStore.getState().setTroopMovements(troopMovements);
}, [troopMovements]);

// Also sync contested/supply edges
useEffect(() => {
  if (!gameState) return;
  useEffectsStore.getState().setEffects({
    contestedEdges: gameState.contestedEdges ?? [],
    supplyEdges: gameState.supplyEdges ?? [],
    disconnectedHexKeys: new Set(gameState.disconnectedHexKeys ?? []),
  });
}, [gameState?.contestedEdges, gameState?.supplyEdges, gameState?.disconnectedHexKeys]);
```

## 8️⃣ PHASE 3 EVENT TYPES (Extend GameEventLogEntry)
```typescript
// In types/game.ts, update GameEventLogEntry type:
export interface GameEventLogEntry {
  createdAt: string;
  type: string;  // Add these values:
  // 'RallyPointActivated'
  // 'RallyPointResolved'
  // 'RallyPointExpired'
  // 'ShepherdBeaconSighted'
  // 'TilesFortified'
  message: string;
  playerId?: string;
  playerName?: string;
  q?: number;  // Hex location
  r?: number;
  // ... existing fields
}
```

## 9️⃣ USEEFFECTS CLEANUP PATTERN (useGridDiff model)
```typescript
useEffect(() => {
  // ... work
  
  return () => {
    // Cleanup timers/refs
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };
}, [dependency]);

// Always cleanup on unmount too
useEffect(() => {
  return () => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
  };
}, []);
```

## 🔟 AUTO-CLEAR PATTERN (useGridDiff model)
```typescript
const MAX_MOVEMENTS = 10;
const CLEAR_DELAY_MS = 1500;

// Keep only last N, auto-clear after delay
if (detected.length > 0) {
  // ✓ Merge with existing, keep only latest MAX_MOVEMENTS
  setMovements(prev => [...prev, ...detected].slice(-MAX_MOVEMENTS));
  
  // ✓ Clear timer on new detection
  if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
  
  // ✓ Schedule clear
  clearTimerRef.current = setTimeout(() => {
    setMovements([]);
    clearTimerRef.current = null;
  }, CLEAR_DELAY_MS);
}
```

## 1️⃣1️⃣ DEPENDENCY ARRAY GOTCHAS
```typescript
// ✗ DON'T: Object literals create new refs
useEffect(() => { ... }, [gameState.grid]);  // grid is derived, changes every update

// ✓ DO: Usememo + proper deps
const grid = useMemo(() => gameState?.grid ?? {}, [gameState]);
useEffect(() => { ... }, [grid]);

// ✓ OR: Direct destructure in effect
useEffect(() => {
  const grid = gameState?.grid;
  if (!grid) return;
  // ...
}, [gameState?.grid]);
```

## 1️⃣2️⃣ NORMALIZED STATE PATTERN
```typescript
// Always use normalizeGameState() from gameHelpers
import { normalizeGameState } from '../utils/gameHelpers';

const normalizedState = normalizeGameState(incomingState, previousGameState);
// This ensures:
// - Timestamps are consistent
// - Players list is aligned
// - Grid keys are normalized
// - No stale references
```

## 1️⃣3️⃣ STORE UPDATE ORDER
```typescript
// 1. Update game state (source of truth)
useGameStore.getState().setGameState(normalizedState);

// 2. useGridDiff auto-triggers via dependency, detects movements
// (handled by useEffect in orchestrator)

// 3. Update display layers
useEffectsStore.getState().setTroopMovements(movements);
useTileOverlayStore.getState().updateTiles(tileChanges);

// 4. Update info ledge for event log entries
useInfoLedgeStore.getState().push(entry);
```

## 1️⃣4️⃣ COMMON PITFALLS
```
❌ Using wrong hex key format (e.g., "5:3" instead of "5,3")
❌ Not cleaning up timers in useGridDiff (memory leak)
❌ Modifying grid object directly instead of spreading
❌ Not normalizing state from SignalR before storing
❌ Forgetting to add new event types to GameEventLogEntry
❌ Breaking loop iteration without checking all neighbors
❌ Using object literal in useEffect deps (always causes re-runs)
✓ Copy useGridDiff EXACTLY — don't "optimize" the diff algorithm
✓ Always spread state in Zustand: set({ ...state, changes })
✓ Test movement detection with mock grids before integration
```

---

**File Locations Summary:**
- Types: `/src/types/game.ts`
- Stores: `/src/stores/{tileOverlayStore, effectsStore, playerLayerStore, gameStore}.ts`
- Hooks: `/src/hooks/{useGridDiff, useSignalRHandlers, useSignalR}.ts`
- Components: `/src/components/{GameView, map/GameMap, game/PlayingHud}.tsx`

**Key Constants:**
- MAX_MOVEMENTS = 10
- CLEAR_DELAY_MS = 1500
- Hex key format: `"${q},${r}"`
- Neighbor count: 6 (axial coordinates)
