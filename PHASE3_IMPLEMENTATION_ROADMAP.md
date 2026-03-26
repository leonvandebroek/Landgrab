# Phase 3 Implementation Roadmap

## Overview
Phase 3 integration requires:
1. **MapOrchestrator Hook** (new) — Orchestrate grid diff + SignalR updates
2. **useGridDiff Enhancement** (ported) — Already exists, use as-is
3. **SignalR Handler Updates** (extend) — Add Phase 3 event handling
4. **Type Extensions** (modify) — Add rally/fortification types
5. **Store Updates** (extend) — Add Phase 3 visual state
6. **Component Integration** (connect) — Wire orchestrator into GameView

---

## PHASE 3A: RALLY POINTS

### Types to Add (src/types/game.ts)
```typescript
// Extend Player interface (already has rallyPoint fields):
interface Player {
  // ... existing
  rallyPointActive?: boolean;
  rallyPointDeadline?: string;
  rallyPointCooldownUntil?: string;
  rallyPointQ?: number;
  rallyPointR?: number;
}

// Extend GameEventLogEntry type to include:
export type GameEventLogEntryType = 
  | 'RallyPointActivated'
  | 'RallyPointResolved'
  | 'RallyPointExpired'
  | 'RallyPointFailed'
  // ... existing types
```

### Stores to Extend (src/stores/tileOverlayStore.ts)
```typescript
interface TileOverlayStore {
  // ... existing
  rallyPointHexKey: string | null;
  rallyPointDeadline: string | null;
  setRallyPointHexKey: (key: string | null, deadline?: string) => void;
}

// Add implementation:
setRallyPointHexKey: (key, deadline) => set({ rallyPointHexKey: key, rallyPointDeadline: deadline }),
```

### Hook to Create (src/hooks/useMapOrchestrator.ts)
```typescript
import { useEffect, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useTileOverlayStore } from '../stores/tileOverlayStore';
import { useEffectsStore } from '../stores/effectsStore';
import { useGridDiff } from './useGridDiff';

interface UseMapOrchestratorOptions {
  onRallyPointActivated?: (q: number, r: number) => void;
  onRallyPointResolved?: (success: boolean) => void;
}

export function useMapOrchestrator(options?: UseMapOrchestratorOptions) {
  const gameState = useGameStore(state => state.gameState);
  const savedSession = useGameStore(state => state.savedSession);
  const { setRallyPointHexKey } = useTileOverlayStore();
  const { setTroopMovements } = useEffectsStore();

  // 1. Grid diff for troop movements
  const grid = useMemo(() => gameState?.grid ?? {}, [gameState?.grid]);
  const troopMovements = useGridDiff(grid);

  useEffect(() => {
    setTroopMovements(troopMovements);
  }, [troopMovements, setTroopMovements]);

  // 2. Track rally point state
  useEffect(() => {
    if (!gameState || !savedSession) return;

    const myPlayer = gameState.players.find(p => p.id === savedSession.userId);
    if (!myPlayer) return;

    if (myPlayer.rallyPointActive && myPlayer.rallyPointQ !== undefined && myPlayer.rallyPointR !== undefined) {
      const rallyKey = `${myPlayer.rallyPointQ},${myPlayer.rallyPointR}`;
      setRallyPointHexKey(rallyKey, myPlayer.rallyPointDeadline ?? null);
      options?.onRallyPointActivated?.(myPlayer.rallyPointQ, myPlayer.rallyPointR);
    } else {
      setRallyPointHexKey(null);
      options?.onRallyPointResolved?.(false);
    }
  }, [gameState?.players, savedSession, setRallyPointHexKey, options]);

  // 3. Listen for event log changes
  useEffect(() => {
    if (!gameState?.eventLog) return;

    // Handle new rally point events
    // Example: dispatch to options callbacks
  }, [gameState?.eventLog, options]);
}
```

### SignalR Handler Enhancement (src/hooks/useSignalRHandlers.ts)
In the `onStateUpdated` handler, add:
```typescript
// After updating game state, check for rally point resolution
const prevPlayer = gameState?.players.find(p => p.id === savedSession?.userId);
const nextPlayer = normalizedState.players.find(p => p.id === savedSession?.userId);

if (prevPlayer?.rallyPointActive && !nextPlayer?.rallyPointActive) {
  // Rally point was resolved
  const wasSuccess = nextPlayer?.rallies?.includes(/* some check */);
  
  useInfoLedgeStore.getState().push({
    severity: 'gameEvent',
    source: 'gameToast',
    persistent: false,
    message: t(wasSuccess ? 'game.rallyPointResolved' : 'game.rallyPointExpired'),
  });
}
```

### Component Integration (src/components/GameView.tsx)
```typescript
import { useMapOrchestrator } from '../hooks/useMapOrchestrator';

export function GameView({
  userId,
  currentLocation,
  // ... props
}: GameViewProps) {
  const gameState = useGameStore(state => state.gameState);
  
  // Initialize orchestrator
  useMapOrchestrator({
    onRallyPointActivated: (q, r) => {
      console.log(`Rally point set at ${q},${r}`);
    },
    onRallyPointResolved: (success) => {
      console.log(`Rally point ${success ? 'succeeded' : 'expired'}`);
    },
  });

  // ... rest of component
}
```

---

## PHASE 3B: FORTIFICATIONS

### Types to Add (src/types/game.ts)
```typescript
// HexCell already has:
interface HexCell {
  isFortified?: boolean;  // ✓ Already exists
}

// Extend GameEventLogEntry for fortification events:
type GameEventLogEntryType = 
  | 'TileFortified'
  | 'TileDeFortified'
  // ...
```

### Stores to Extend (src/stores/tileOverlayStore.ts)
```typescript
interface TileOverlayStore {
  // ... existing
  fortifiedHexKeys: Set<string>;
  setFortifiedHexKeys: (keys: Set<string>) => void;
}

// Implementation:
setFortifiedHexKeys: (keys) => set({ fortifiedHexKeys: keys }),
```

### useMapOrchestrator Enhancement
```typescript
// Add to useMapOrchestrator:
useEffect(() => {
  if (!gameState?.grid) return;

  const fortified = new Set<string>();
  for (const [key, hex] of Object.entries(gameState.grid)) {
    if (hex.isFortified) {
      fortified.add(key);
    }
  }
  useTileOverlayStore.getState().setFortifiedHexKeys(fortified);
}, [gameState?.grid]);
```

---

## PHASE 3C: SHEPHERD BEACONS

### Types to Add (src/types/game.ts)
```typescript
// Extend Player:
interface Player {
  // Phase 5: Beacon
  isBeacon?: boolean;
  beaconLat?: number;
  beaconLng?: number;
}

// Extend HexCell:
interface HexCell {
  // Phase 3: Shepherd
  lastVisitedAt?: string;  // ✓ Already exists
}

// New event type:
type GameEventLogEntryType = 
  | 'ShepherdBeaconSighted'
  | 'BeaconLocationTracked'
  // ...
```

### Stores to Extend (src/stores/playerLayerStore.ts)
```typescript
interface PlayerLayerStore {
  // ... existing
  beaconLocations: Record<string, { lat: number; lng: number }>;
  setBeaconLocations: (locations: Record<string, { lat: number; lng: number }>) => void;
}
```

### useMapOrchestrator Enhancement
```typescript
// Add to useMapOrchestrator:
useEffect(() => {
  if (!gameState?.players) return;

  const beaconLocations: Record<string, { lat: number; lng: number }> = {};
  for (const player of gameState.players) {
    if (player.isBeacon && player.beaconLat !== undefined && player.beaconLng !== undefined) {
      beaconLocations[player.id] = {
        lat: player.beaconLat,
        lng: player.beaconLng,
      };
    }
  }
  usePlayerLayerStore.getState().setBeaconLocations(beaconLocations);
}, [gameState?.players]);
```

---

## Implementation Checklist

### ✅ Step 1: Create useMapOrchestrator Hook
- [ ] Create `/src/hooks/useMapOrchestrator.ts`
- [ ] Import all necessary stores and hooks
- [ ] Implement grid diff syncing
- [ ] Add rally point tracking useEffect
- [ ] Add fortification tracking useEffect
- [ ] Add beacon location tracking useEffect
- [ ] Handle event log parsing for Phase 3 events

### ✅ Step 2: Extend Types (src/types/game.ts)
- [ ] Verify Player rally point fields (already present)
- [ ] Verify Player beacon fields (already present)
- [ ] Verify HexCell fortification/shepherd fields (already present)
- [ ] Add Phase 3 event log type unions
- [ ] Add proper interface for rally point state

### ✅ Step 3: Extend Stores
- [ ] Add rallyPointHexKey, rallyPointDeadline to TileOverlayStore
- [ ] Add fortifiedHexKeys to TileOverlayStore
- [ ] Add beaconLocations to PlayerLayerStore
- [ ] Implement setter functions for each

### ✅ Step 4: Enhance useSignalRHandlers
- [ ] Add rally point activation/expiry detection in onStateUpdated
- [ ] Add fortification event log handling
- [ ] Add beacon sighting event log handling
- [ ] Create helper functions (shouldClearRallyPrompt, etc.)

### ✅ Step 5: Wire into GameView
- [ ] Import useMapOrchestrator
- [ ] Call hook at top of GameView component
- [ ] Pass callback options (optional, for testing)
- [ ] Verify no circular dependencies

### ✅ Step 6: Update GameMap Component
- [ ] Render rally point hex visual
- [ ] Render fortified hex overlays
- [ ] Render beacon positions on map
- [ ] Animate troop movements from effectsStore

### ✅ Step 7: Test & Verify
- [ ] Unit test useGridDiff with Phase 3 troop movements
- [ ] Integration test SignalR flow → useMapOrchestrator → stores
- [ ] Visual test: rally point appears, fortifications highlight, beacons show
- [ ] Memory leak test: unmount during active effects, check cleanup

---

## Key Dependencies

### Existing (already present, use as-is):
- ✓ `useGridDiff` — Movement detection
- ✓ `useSignalR` — WebSocket connection
- ✓ `useGameStore` — Game state source
- ✓ `useTileOverlayStore` — Tile display state
- ✓ `useEffectsStore` — Visual effects
- ✓ `normalizeGameState` — State normalization
- ✓ HexCell.isFortified, HexCell.lastVisitedAt, Player.rallyPoint* — Already in types

### New (must create):
- ✗ `useMapOrchestrator` — Orchestration hook
- ✗ Fortified/beacon store fields — Store extensions
- ✗ Phase 3 event types — Type unions

---

## Common Errors to Avoid

1. **Forgetting to sync useGridDiff output to effectsStore**
   - Always: `setTroopMovements(troopMovements)` after grid diff
   
2. **Not cleaning up timers on unmount**
   - useGridDiff already does this; ensure useMapOrchestrator also cleans up

3. **Using wrong hex key format**
   - Always: `"${q},${r}"` (not `q:r` or `q_r`)

4. **Breaking the event log parsing loop**
   - Check `newLog.slice(prevLog.length)` to get only new entries
   - Don't assume all entries are Phase 3 types

5. **Missing normalize call in SignalR handler**
   - Always call: `normalizeGameState(state, gameState)` before storing

6. **Circular component dependencies**
   - GameView → useMapOrchestrator → GameView is OK
   - GameMap → useMapOrchestrator → GameView is OK
   - Avoid: Component A → Hook A → Component B → Hook B → Component A

7. **Not preserving existing behavior**
   - useGridDiff must return TroopMovement[] in exact format
   - Movement detection logic (attack vs transfer) must be identical
   - Auto-clear timeout must remain 1500ms

---

## File Checklist

```
✓ /src/types/game.ts
  - HexCell: isFortified, lastVisitedAt (✓ present)
  - Player: rallyPoint*, isBeacon, beaconLat/Lng (✓ present)
  - GameEventLogEntry: type field (needs enhancement)

✓ /src/stores/tileOverlayStore.ts
  - TileState: isFortified (✓ present)
  - Extend: rallyPointHexKey, fortifiedHexKeys

✓ /src/stores/effectsStore.ts
  - TroopMovement (✓ present, use as-is)

✓ /src/stores/playerLayerStore.ts
  - Extend: beaconLocations

✓ /src/hooks/useGridDiff.ts (✓ PRESENT, NO CHANGES)

✓ /src/hooks/useSignalRHandlers.ts
  - Extend: onStateUpdated for Phase 3 events

✗ /src/hooks/useMapOrchestrator.ts (CREATE NEW)

✓ /src/components/GameView.tsx
  - Wire: useMapOrchestrator call

✓ /src/components/map/GameMap.tsx
  - Render: rally point, fortifications, beacons
  - Animate: troop movements from effectsStore
```

---

## Testing Strategy

### Unit Tests (useGridDiff already tested, verify it still works)
```typescript
test('useGridDiff detects attack movements', () => {
  // Prev: hex A owned by blue, 10 troops; hex B owned by red, 5 troops
  // Next: hex A owned by red, 15 troops; hex B owned by red, 5 troops
  // Expected: movement { fromHex: "A", toHex: "B", count: 10, type: 'attack' }
});

test('useGridDiff detects transfer movements', () => {
  // Prev: hex A owned by blue, 10 troops; hex B owned by blue, 5 troops
  // Next: hex A owned by blue, 15 troops; hex B owned by blue, 5 troops
  // Expected: movement { fromHex: "B", toHex: "A", count: 5, type: 'transfer' }
});
```

### Integration Tests
```typescript
test('GameView + useMapOrchestrator + SignalR flow', async () => {
  // 1. Render GameView
  // 2. Simulate SignalR onStateUpdated with new grid state
  // 3. Verify troopMovements appear in effectsStore
  // 4. Verify rallyPointHexKey updates in tileOverlayStore
  // 5. Unmount, verify no memory leaks
});
```

### Visual Tests
- Rally point hex should highlight with unique color
- Fortified hexes should show shield/fort icon
- Beacon positions should show on player layer
- Troop movement arrows should animate and auto-clear after 1500ms

---

## Rollback Plan

If Phase 3 integration breaks existing functionality:

1. **Remove useMapOrchestrator call from GameView**
   - Grid diff still works independently
   - SignalR handlers still update gameStore
   - Revert to Phase 2 rendering

2. **Revert store extensions**
   - Remove rallyPointHexKey, fortifiedHexKeys, beaconLocations
   - Existing stores still functional

3. **Revert type additions**
   - Comment out Phase 3 event types
   - Keep HexCell/Player fields (optional, backwards compatible)

4. **Keep useGridDiff untouched**
   - Hook is standalone, removing orchestrator doesn't break it
   - Return to using troopMovements directly in components if needed

---

## Success Criteria

✅ All Phase 3 events appear in event log toasts
✅ Rally point hex highlights when active
✅ Fortified hexes show visual indicator
✅ Beacon positions track on map
✅ Troop movements animate correctly
✅ No memory leaks on component unmount
✅ No console errors or warnings
✅ Existing Phase 2 features still work
✅ Performance acceptable (no jank from diff)
