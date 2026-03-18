# Zustand Store Shapes - Complete TypeScript Definitions

## Overview

This document contains **100% explicit definitions** extracted from:
- ✅ `/plans/layered-map-refactor.md` (design specification)
- ✅ `/backend/Landgrab.Api/Models/DerivedMapState.cs` (C# DTOs)
- ✅ `/frontend/landgrab-ui/src/hooks/useGridDiff.ts` (existing implementation)
- ✅ `/frontend/landgrab-ui/src/utils/supplyNetwork.ts` (existing client logic)
- ✅ `/frontend/landgrab-ui/src/types/game.ts` (type definitions)

---

## 1. TileState

**Status:** ✅ EXPLICIT (fully documented in plan)  
**Location:** To be created at `frontend/landgrab-ui/src/stores/tileOverlayStore.ts`  
**Keyed by:** `"q,r"` string format

```typescript
export interface TileState {
  // Core hex data (from HexCell)
  q: number;
  r: number;
  ownerId?: string;
  ownerAllianceId?: string;
  ownerName?: string;
  ownerColor?: string;
  troops: number;
  isMasterTile: boolean;
  
  // Terrain & Features
  terrainType?: 'None' | 'Water' | 'Building' | 'Road' | 'Path' 
             | 'Forest' | 'Park' | 'Hills' | 'Steep';
  isFortified?: boolean;        // Phase 3: Rally
  isFort?: boolean;             // Phase 4: Engineer
  engineerBuiltAt?: string;
  lastVisitedAt?: string;       // Phase 3: Shepherd
  
  // Derived rendering flags (set by orchestrator)
  isInactive: boolean;          // Mapped from server's inactiveHexKeys
  hasActiveRaid: boolean;       // Mapped from GameState.activeRaids
}
```

---

## 2. TroopMovement

**Status:** ✅ EXPLICIT (already implemented)  
**Location:** `frontend/landgrab-ui/src/hooks/useGridDiff.ts:4-10`  
**Lifetime:** Auto-clears after 1500ms  
**Detection:** Grid diffing algorithm

```typescript
export interface TroopMovement {
  fromHex: string;              // Hex key "q,r"
  toHex: string;                // Hex key "q,r"
  count: number;                // Number of troops moved
  type: 'transfer' | 'attack';  // transfer = same owner, attack = owner changed
  teamColor: string;            // Hex color #RRGGBB
}
```

---

## 3. ContestedEdgeDto

**Status:** ✅ EXPLICIT (backend implemented, frontend planned)  
**Backend:** `backend/Landgrab.Api/Models/DerivedMapState.cs:3-11`  
**Frontend:** Plan doc specifies TypeScript shape  
**Computation:** Server-side via `ComputeContestedEdges()`

### TypeScript Frontend

```typescript
export interface ContestedEdgeDto {
  hexKeyA: string;          // First hex "q,r"
  hexKeyB: string;          // Second hex "q,r"
  neighborIndex: number;    // 0-5: which edge
                            //   0 = right
                            //   1 = bottom-right
                            //   2 = bottom-left
                            //   3 = left
                            //   4 = top-left
                            //   5 = top-right
  teamAColor: string;       // Hex color of team A
  teamBColor: string;       // Hex color of team B
  intensity: number;        // 0.0-1.0, visual intensity
}
```

---

## 4. SupplyEdgeDto

**Status:** ✅ EXPLICIT (backend implemented, frontend planned)  
**Backend:** `backend/Landgrab.Api/Models/DerivedMapState.cs:13-18`  
**Frontend:** Plan doc specifies TypeScript shape  
**Computation:** Server-side via `ComputeSupplyNetwork()` BFS from HQ

### TypeScript Frontend

```typescript
export interface SupplyEdgeDto {
  fromKey: string;          // Source hex "q,r"
  toKey: string;            // Adjacent hex "q,r"
  teamColor: string;        // Hex color of alliance
}
```

---

## 5. Store Interfaces

### TileOverlayStore

**Status:** ✅ EXPLICIT (fully documented in plan)  
**Location:** To be created at `frontend/landgrab-ui/src/stores/tileOverlayStore.ts`  
**Purpose:** Game Overlay Layer - hex tile rendering state

```typescript
export interface TileOverlayStore {
  // Data
  tiles: Record<string, TileState>;         // Record<"q,r", TileState>
  masterTileKey: string | null;             // Master tile hex key
  alliances: AllianceDto[];                 // Alliance metadata
  dynamics: GameDynamics;                   // Game rules configuration
  
  // Selection & hover state
  selectedHexKey: string | null;            // User-selected hex (from gameplayStore)
  currentHexKey: string | null;             // Mouse hover hex
  
  // Actions
  updateTiles: (changes: Record<string, TileState>) => void;
  removeTiles: (keys: string[]) => void;
  setFullGrid: (
    tiles: Record<string, TileState>,
    alliances: AllianceDto[],
    dynamics: GameDynamics
  ) => void;
  setSelectedHexKey: (key: string | null) => void;
  setCurrentHexKey: (key: string | null) => void;
}
```

**Component Subscription Pattern (optimized):**
```typescript
const tile = useTileOverlayStore(state => state.tiles[hexId]);
const isSelected = useTileOverlayStore(state => state.selectedHexKey === hexId);
const isCurrent = useTileOverlayStore(state => state.currentHexKey === hexId);
```

**Effect:** Only 4 tiles (old selected, new selected, old current, new current) re-render on selection change.

---

### EffectsStore

**Status:** ✅ EXPLICIT (fully documented in plan)  
**Location:** To be created at `frontend/landgrab-ui/src/stores/effectsStore.ts`  
**Purpose:** Effects Layer - visual effects and animations

```typescript
export interface EffectsStore {
  // Server-computed (filtered by fog-of-war)
  contestedEdges: ContestedEdgeDto[];       // Contested boundary edges
  supplyEdges: SupplyEdgeDto[];             // Supply line edges
  disconnectedHexKeys: Set<string>;         // Unreachable hex keys
  
  // Client-computed (grid diffing)
  troopMovements: TroopMovement[];          // Troop movement animations
  
  // Actions
  setEffects: (effects: {
    contestedEdges: ContestedEdgeDto[];
    supplyEdges: SupplyEdgeDto[];
    disconnectedHexKeys: Set<string>;
  }) => void;
  setTroopMovements: (movements: TroopMovement[]) => void;
}
```

**Data Flow:**
1. Server computes `ContestedEdgeDto[]` and `SupplyEdgeDto[]`
2. Sends in `GameState.contestedEdges`, `GameState.supplyEdges`, `GameState.disconnectedHexKeys`
3. MapOrchestrator calls `effectsStore.setEffects()`
4. Grid changes trigger `detectTroopMovements()` → `setTroopMovements()`
5. EffectsLayer component subscribes and renders

---

### PlayerLayerStore

**Status:** ✅ EXPLICIT store, ⚠️ INFERRED Player shape  
**Location:** To be created at `frontend/landgrab-ui/src/stores/playerLayerStore.ts`  
**Purpose:** Player Layer - active player positions

```typescript
export interface PlayerLayerStore {
  players: Player[];                                      // Active players
  myUserId: string;                                       // Current user ID
  currentLocation: { lat: number; lng: number } | null;  // My GPS location
  
  // Actions
  setPlayers: (players: Player[]) => void;
  setMyUserId: (id: string) => void;
  setCurrentLocation: (loc: { lat: number; lng: number } | null) => void;
}
```

**Player Interface (INFERRED from GameState context):**
```typescript
// ⚠️ Not explicitly defined in plan doc, inferred from GameState.players
export interface Player {
  id: string;
  name: string;
  allianceId?: string;
  role?: 'None' | 'Commander' | 'Scout' | 'Engineer';
  lat?: number;
  lng?: number;
  isReady?: boolean;
}
```

---

## 6. Extended GameState

**Status:** ✅ EXPLICIT (plan specifies additions)  
**Location:** `frontend/landgrab-ui/src/types/game.ts`  
**Changes:** Add 3 new optional fields for derived state

```typescript
export interface GameState {
  // ... existing fields ...
  
  // New fields: Server-computed derived state
  contestedEdges?: ContestedEdgeDto[] | null;
  supplyEdges?: SupplyEdgeDto[] | null;
  disconnectedHexKeys?: string[] | null;  // Serialized; reconstructed as Set on frontend
}
```

---

## 7. Supporting Types

### From `frontend/landgrab-ui/src/utils/supplyNetwork.ts`

```typescript
export interface SupplyEdge {
  fromKey: string;
  toKey: string;
  fromCenter: [number, number];  // [lat, lng] computed from hex coordinates
  toCenter: [number, number];    // [lat, lng] computed from hex coordinates
  teamColor: string;
}

export interface SupplyNetworkResult {
  connectedHexes: Set<string>;
  disconnectedHexes: Set<string>;
  supplyEdges: SupplyEdge[];
}
```

---

## Implementation Checklist

### Phase 1: Type Definitions
- [ ] Create/export `TileState` interface in `frontend/landgrab-ui/src/stores/tileOverlayStore.ts`
- [ ] Export `ContestedEdgeDto` and `SupplyEdgeDto` from `frontend/landgrab-ui/src/types/game.ts`
- [ ] Move/re-export `TroopMovement` from `useGridDiff.ts` to `types/game.ts`
- [ ] Verify/clarify `Player` interface in `types/game.ts`
- [ ] Extend `GameState` with `contestedEdges?`, `supplyEdges?`, `disconnectedHexKeys?`

### Phase 2: Create Stores
- [ ] Create `tileOverlayStore.ts` implementing `TileOverlayStore` interface
- [ ] Create `effectsStore.ts` implementing `EffectsStore` interface
- [ ] Create `playerLayerStore.ts` implementing `PlayerLayerStore` interface

### Phase 3: Extract Utilities
- [ ] Extract `detectTroopMovements()` pure function to `utils/gridDiff.ts`
- [ ] Create `hooks/useMapOrchestrator.ts` to route SignalR updates to stores

### Phase 4: Update Consumers
- [ ] Migrate `selectedHex` from `gameplayStore` to `tileOverlayStore`
- [ ] Update component subscriptions to use layer stores instead of `gameStore`
- [ ] Remove deprecated store properties from `gameplayStore`

### Phase 5: Backend Verification
- [ ] Verify `DerivedMapStateService.cs` computes contested edges and supply network
- [ ] Verify `GameState.cs` includes `ContestedEdges`, `SupplyEdges`, `DisconnectedHexKeys`
- [ ] Verify `GameStateService.cs` applies fog-of-war filtering to derived state

---

## Key Design Patterns

### Subscription Optimization

Use precise selectors to minimize component re-renders:

```typescript
// ✅ GOOD: Only re-renders when this specific hex's data changes
const tile = useTileOverlayStore(state => state.tiles[hexId]);

// ✅ GOOD: Only re-renders this hex when selection changes to/from it
const isSelected = useTileOverlayStore(state => state.selectedHexKey === hexId);

// ❌ BAD: Would cause all tiles to re-render on any store change
const allTiles = useTileOverlayStore(state => state.tiles);
```

### Hex Key Format

All hex identifiers use `"q,r"` string format:
- `q`: cube coordinate (horizontal)
- `r`: cube coordinate (vertical)
- Example: `"10,5"`, `"0,0"`, `"-3,8"`

### Set Serialization

Server sends `disconnectedHexKeys` as `string[]` in JSON. Frontend reconstructs:

```typescript
const set = new Set(state.disconnectedHexKeys ?? []);
```

---

## Sources & References

| Item | Source File | Lines |
|------|-------------|-------|
| TileState | plans/layered-map-refactor.md | Section 1 |
| TroopMovement | useGridDiff.ts | 4-10 |
| ContestedEdgeDto (C#) | DerivedMapState.cs | 3-11 |
| SupplyEdgeDto (C#) | DerivedMapState.cs | 13-18 |
| TileOverlayStore | plans/layered-map-refactor.md | Section 1 |
| EffectsStore | plans/layered-map-refactor.md | Section 2 |
| PlayerLayerStore | plans/layered-map-refactor.md | Section 3 |
| SupplyEdge | supplyNetwork.ts | 4-10 |
| HexCell | types/game.ts | ~83+ |
| GameState | types/game.ts | ~103+ |

---

**Last Updated:** From document at `/plans/layered-map-refactor.md`  
**Status:** Ready for implementation phase
