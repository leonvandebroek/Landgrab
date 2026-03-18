# Layered Map Architecture Refactor

## Context

LandGrab becomes sluggish during long game sessions with many troops on the map, and battery drain on mobile is excessive. The root cause is monolithic map rendering: `renderHexGridLayers()` in `HexGridLayer.ts:93` calls `layerGroup.clearLayers()` then recreates ALL Leaflet elements for ALL hexes on ANY state change. With 100-225 hexes each creating ~11 Leaflet elements, this means 1100-2475 DOM elements destroyed and recreated whenever anything changes (GPS tick, hex selection, troop movement, overlay tick, etc.).

Additionally, derived state (contested edges, supply network) is recomputed on every render cycle client-side, and the single `gameStore` Zustand store causes all map consumers to re-render on any state change.

This refactor decomposes the monolithic map into independent rendering layers with separate update cycles, moves to React components for hex tiles, creates layer-based Zustand stores, and moves derived state computation to the server.

---

## Phase 1: Layer-Based Zustand Stores

Split the monolithic `gameStore` into layer-specific stores so each layer subscribes only to its own data.

### New stores to create in `frontend/landgrab-ui/src/stores/`:

**1. `tileOverlayStore.ts`** — Game Overlay Layer state
```ts
interface TileOverlayStore {
  tiles: Record<string, TileState>;           // Per-hex rendering state keyed by "q,r"
  masterTileKey: string | null;
  alliances: AllianceDto[];
  dynamics: GameDynamics;
  activeRaidHexKeys: Set<string>;

  // Actions
  updateTiles: (changes: Record<string, TileState>) => void;
  setFullGrid: (grid: Record<string, HexCell>, alliances: AllianceDto[], dynamics: GameDynamics, raids: ActiveCommandoRaid[]) => void;
}
```

**2. `effectsStore.ts`** — Effects Layer state (contested edges, supply lines, fog)
```ts
interface EffectsStore {
  contestedEdges: ContestedEdgeDto[];         // Server-computed
  supplyEdges: SupplyEdgeDto[];               // Server-computed
  disconnectedHexKeys: Set<string>;           // Server-computed
  fogHiddenHexKeys: Set<string>;

  // Actions
  setEffects: (effects: EffectsPayload) => void;
}
```

**3. `playerLayerStore.ts`** — Player Layer state
```ts
interface PlayerLayerStore {
  players: Player[];
  myUserId: string;

  // Actions
  setPlayers: (players: Player[]) => void;
  setMyUserId: (id: string) => void;
}
```

### Modify existing stores:
- **`gameStore.ts`** — Keep for session management (`savedSession`, `myRooms`, `autoResuming`) and the full `GameState` for non-map consumers (lobby, HUD, game-over screen). The map layers will NOT subscribe to `gameStore.gameState` directly.
- **`gameplayStore.ts`** — Keep as-is for UI interaction state (selectedHex, prompts)
- **`notificationStore.ts`** / **`infoLedgeStore.ts`** — Keep as-is (already separate)

### Files to create:
- `frontend/landgrab-ui/src/stores/tileOverlayStore.ts`
- `frontend/landgrab-ui/src/stores/effectsStore.ts`
- `frontend/landgrab-ui/src/stores/playerLayerStore.ts`

### Files to modify:
- `frontend/landgrab-ui/src/stores/index.ts` — Add new store exports

---

## Phase 2: Server-Side Derived State

Move `findContestedEdges()` and `computeSupplyNetwork()` to the server so the client receives pre-computed data.

### Backend changes:

**1. Add derived state to GameState DTO**

Modify `backend/Landgrab.Api/Models/GameState.cs`:
```csharp
// Add to GameState class:
public List<ContestedEdgeDto>? ContestedEdges { get; set; }
public List<SupplyEdgeDto>? SupplyEdges { get; set; }
public List<string>? DisconnectedHexKeys { get; set; }
```

Create `backend/Landgrab.Api/Models/DerivedMapState.cs`:
```csharp
public class ContestedEdgeDto
{
    public string HexKeyA { get; set; }    // "q,r"
    public string HexKeyB { get; set; }    // "q,r"
    public int NeighborIndex { get; set; }  // 0-5, which edge
    public string TeamAColor { get; set; }
    public string TeamBColor { get; set; }
    public double Intensity { get; set; }
}

public class SupplyEdgeDto
{
    public string FromKey { get; set; }
    public string ToKey { get; set; }
    public string TeamColor { get; set; }
}
```

**2. Create `backend/Landgrab.Api/Services/DerivedMapStateService.cs`**

Port the logic from:
- `frontend/landgrab-ui/src/utils/contestedEdges.ts` → `ComputeContestedEdges()`
- `frontend/landgrab-ui/src/utils/supplyNetwork.ts` → `ComputeSupplyNetwork()`

These are pure functions over `Dictionary<string, HexCell>` and `List<AllianceDto>`. No coordinate geometry needed server-side — just hex keys and neighbor indices (the client maps indices to screen coordinates).

**3. Call derived state computation before broadcast**

Modify `GameHub.cs` `BroadcastState()` to call `DerivedMapStateService` and attach results to the GameState before sending. Only compute when `state.Phase == GamePhase.Playing`.

### Frontend changes:

**Add types to `frontend/landgrab-ui/src/types/game.ts`:**
```ts
export interface ContestedEdgeDto {
  hexKeyA: string;
  hexKeyB: string;
  neighborIndex: number;
  teamAColor: string;
  teamBColor: string;
  intensity: number;
}

export interface SupplyEdgeDto {
  fromKey: string;
  toKey: string;
  teamColor: string;
}
```

Add `contestedEdges`, `supplyEdges`, `disconnectedHexKeys` to `GameState` interface.

### Files to create:
- `backend/Landgrab.Api/Models/DerivedMapState.cs`
- `backend/Landgrab.Api/Services/DerivedMapStateService.cs`

### Files to modify:
- `backend/Landgrab.Api/Models/GameState.cs` — Add derived state fields
- `backend/Landgrab.Api/Hubs/GameHub.cs` — Call derived state computation in `BroadcastState()`
- `backend/Landgrab.Api/Program.cs` — Register `DerivedMapStateService` as singleton
- `frontend/landgrab-ui/src/types/game.ts` — Add DTO types

---

## Phase 3: MapOrchestrator & SignalR Update Routing

Create a `MapOrchestrator` component that routes incoming SignalR state updates to the correct layer stores, replacing the current pattern where `useSignalRHandlers` dumps everything into `gameStore.setGameState()`.

### Create `frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`

This hook intercepts `StateUpdated` events and dispatches to layer stores:

```ts
function useMapOrchestrator() {
  // Called from useSignalRHandlers.onStateUpdated AFTER setting gameStore

  function dispatchStateToLayers(state: GameState, previousState: GameState | null) {
    // 1. Diff grid → only update changed tiles in tileOverlayStore
    const changedTiles = diffGrid(previousState?.grid, state.grid);
    if (changedTiles) {
      tileOverlayStore.updateTiles(changedTiles);
    }

    // 2. Update effects store with server-computed derived state
    effectsStore.setEffects({
      contestedEdges: state.contestedEdges ?? [],
      supplyEdges: state.supplyEdges ?? [],
      disconnectedHexKeys: new Set(state.disconnectedHexKeys ?? []),
    });

    // 3. Update player layer store
    playerLayerStore.setPlayers(state.players);
  }
}
```

### Modify `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`

In `onStateUpdated`: after calling `gameStore.setGameState()`, also call `dispatchStateToLayers()` to route data to layer stores.

In `onPlayersMoved`: update `playerLayerStore.setPlayers(players)` directly — this no longer triggers tile re-renders.

### Grid diffing utility

Create `frontend/landgrab-ui/src/utils/gridDiff.ts`:
```ts
// Compare previous and next grid, return only changed hex cells
export function diffGrid(
  prev: Record<string, HexCell> | undefined,
  next: Record<string, HexCell>
): Record<string, HexCell> | null
```

Reuse the sampling approach from `useGridDiff.ts:34-57` (`hasGridChanged`) for the fast path, then do a full diff only when changes are detected.

### Files to create:
- `frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`
- `frontend/landgrab-ui/src/utils/gridDiff.ts`

### Files to modify:
- `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts` — Integrate orchestrator dispatch

---

## Phase 4: React Hex Tile Components

Replace the imperative Leaflet rendering (`L.polygon`, `L.marker`, etc.) with React components rendered into Leaflet panes via React portals.

### Approach: React Portals into Leaflet Panes

Instead of using `react-leaflet` (which would be a large dependency), use React portals to render React components into Leaflet's custom panes. Each hex tile gets a positioned `<div>` container placed at the hex's screen position using Leaflet's `map.latLngToLayerPoint()`.

### Create `frontend/landgrab-ui/src/components/map/HexTile.tsx`

Individual React component per hex that subscribes to its own slice of `tileOverlayStore`:

```tsx
const HexTile = memo(function HexTile({ hexId, geometry }: { hexId: string; geometry: HexGeometry }) {
  const tile = useTileOverlayStore(state => state.tiles[hexId]);
  // ... render hex polygon as SVG, troop badge, building icons, etc.
  // Uses CSS containment: contain: layout paint
});
```

Key design decisions:
- Each `HexTile` renders as an **SVG polygon** (not a Leaflet polygon) positioned absolutely within the Leaflet pane
- The hex geometry (corner positions in pixel space) is computed once on mount and updated only on zoom/pan
- Troop badges, terrain icons, building icons are all children of the HexTile component
- `React.memo` + per-tile Zustand selector ensures only changed tiles re-render
- CSS `contain: layout paint` on every tile container

### Create `frontend/landgrab-ui/src/components/map/layers/`

**`GameOverlayLayer.tsx`** — Renders all HexTile components
```tsx
function GameOverlayLayer({ map }: { map: L.Map }) {
  const tileKeys = useTileOverlayStore(state => Object.keys(state.tiles));
  // Render HexTile for each key via React portal into HEX_LAYER_PANE
  // Manages position updates on zoom/pan via map events
}
```

**`EffectsLayer.tsx`** — Renders contested edges, supply lines
```tsx
function EffectsLayer({ map }: { map: L.Map }) {
  const contestedEdges = useEffectsStore(state => state.contestedEdges);
  const supplyEdges = useEffectsStore(state => state.supplyEdges);
  // Render polylines as SVG paths in a separate pane
}
```

**`PlayerLayer.tsx`** — Renders player markers (refactor from `PlayerMarkerLayer.tsx`)
```tsx
function PlayerLayer({ map }: { map: L.Map }) {
  const players = usePlayerLayerStore(state => state.players);
  // Render player markers as React components
  // Only re-renders when players array changes (GPS updates)
}
```

### Modify `frontend/landgrab-ui/src/components/map/GameMap.tsx`

Replace the three `useEffect` blocks that call `renderHexGridLayers()`, `renderPlayerMarkers()`, and `renderTroopAnimations()` with the new React layer components:

```tsx
return (
  <div className="game-map-container">
    <div ref={containerRef} className="leaflet-map" />
    {mapInstance && (
      <>
        <GameOverlayLayer map={mapInstance} />
        <EffectsLayer map={mapInstance} />
        <PlayerLayer map={mapInstance} />
      </>
    )}
    <TroopSplashLayer ... />
    ...
  </div>
);
```

Remove:
- The `useEffect` at lines 453-497 (hex grid rendering)
- The `useEffect` at lines 499-533 (player marker rendering)
- The `useEffect` at lines 535-546 (troop animation rendering)
- The `layerGroupRef`, `playerLayerGroupRef`, `animLayerGroupRef` refs
- The `prevGridRef` ref (diffing moves to orchestrator)

### Reuse existing utilities:
- `hexRendering.ts` — Reuse `getHexFillStyle`, `getHexBorderStyle`, `getHexPolygonClassName`, `getTroopBadgeDescriptor`, `getHexOwnerColor`, etc. These are pure functions that work with any rendering approach.
- `HexMath.ts` — Reuse `roomHexCornerLatLngs`, `roomHexToLatLng`, `latLngToRoomHex`
- `HexTooltip.ts` — Adapt for React (return JSX instead of HTML string)
- `zoomThresholds.ts` — Reuse all threshold functions
- `terrainIcons.ts`, `gameIcons.ts` — Reuse as-is

### Files to create:
- `frontend/landgrab-ui/src/components/map/HexTile.tsx`
- `frontend/landgrab-ui/src/components/map/layers/GameOverlayLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/EffectsLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/index.ts`

### Files to modify:
- `frontend/landgrab-ui/src/components/map/GameMap.tsx` — Replace imperative rendering with React layers
- `frontend/landgrab-ui/src/components/game/map/HexTooltip.ts` — Adapt to return JSX

### Files to eventually remove (after migration complete):
- `frontend/landgrab-ui/src/components/game/map/HexGridLayer.ts` — Replaced by GameOverlayLayer + HexTile
- `frontend/landgrab-ui/src/components/game/map/PlayerMarkerLayer.tsx` — Replaced by PlayerLayer
- `frontend/landgrab-ui/src/components/map/TroopAnimationLayer.ts` — Integrate into EffectsLayer
- `frontend/landgrab-ui/src/utils/contestedEdges.ts` — Moved to server
- `frontend/landgrab-ui/src/utils/supplyNetwork.ts` — Moved to server

---

## Phase 5: CSS Containment & Animation Optimization

### Add CSS containment to all tile elements

In the hex tile CSS (likely in a CSS file alongside the components):
```css
.hex-tile-container {
  contain: layout paint;
  will-change: auto; /* NOT transform — only set during animation */
}

.hex-tile-container.is-animating {
  will-change: transform, opacity;
}
```

### Animation strategy
- Static tiles render as plain `<div>` / `<svg>` — no animation library overhead
- Only promote to animated state (`will-change: transform`) when a tile is actively animating (capture pulse, troop change)
- Auto-demote back to static after animation completes
- Use `transform` and `opacity` only for GPU-composited animations

### Files to modify:
- CSS files for hex tiles (created in Phase 4)

---

## Phase 6: Troop Animation Integration

Refactor the existing `useGridDiff` hook and `TroopAnimationLayer` to work with the new layer architecture.

### Modify `useGridDiff.ts`
- Instead of diffing against a ref of the previous grid, diff against the `tileOverlayStore` state
- Emit movement events that the EffectsLayer can consume

### Integrate into EffectsLayer
- `TroopAnimationLayer` logic moves into `EffectsLayer.tsx` as troop movement arrows are visual effects
- `TroopSplashLayer` stays as-is (it's already a separate React component using DOM positioning)

### Files to modify:
- `frontend/landgrab-ui/src/hooks/useGridDiff.ts`
- `frontend/landgrab-ui/src/components/map/layers/EffectsLayer.tsx`

---

## Phase 7: Cleanup & mapOverlayTick Removal

### Remove mapOverlayTick polling

Currently, `mapOverlayTick` increments every 1 second to animate fort build progress and demolish progress rings. This triggers a FULL grid re-render every second.

Replace with:
- CSS animations for progress rings (rotate/fill based on CSS custom properties set once)
- Each `HexTile` computes its own progress using `requestAnimationFrame` or CSS `@keyframes`
- No React re-render needed for progress animation

### Remove dead code
- Remove old imperative rendering functions that are no longer called
- Remove client-side `contestedEdges.ts` and `supplyNetwork.ts` (replaced by server)
- Clean up unused imports in GameMap.tsx

### Files to modify:
- `frontend/landgrab-ui/src/components/map/GameMap.tsx` — Remove mapOverlayTick state and interval
- Various CSS files — Add keyframe animations for progress rings

---

## Implementation Order

Execute phases in this order, each building on the previous:

1. **Phase 2** (Server-side derived state) — Can be done independently, no frontend rendering changes
2. **Phase 1** (Layer stores) — Create stores, wire up
3. **Phase 3** (MapOrchestrator) — Route SignalR updates to new stores
4. **Phase 4** (React hex tiles) — The main rendering refactor
5. **Phase 5** (CSS containment) — Quick CSS additions
6. **Phase 6** (Troop animations) — Integrate with new layers
7. **Phase 7** (Cleanup) — Remove old code, fix mapOverlayTick

Each phase should result in a working app — never a broken intermediate state.

---

## Key Files Summary

### Backend — Create:
- `backend/Landgrab.Api/Models/DerivedMapState.cs`
- `backend/Landgrab.Api/Services/DerivedMapStateService.cs`

### Backend — Modify:
- `backend/Landgrab.Api/Models/GameState.cs`
- `backend/Landgrab.Api/Hubs/GameHub.cs`
- `backend/Landgrab.Api/Program.cs`

### Frontend — Create:
- `frontend/landgrab-ui/src/stores/tileOverlayStore.ts`
- `frontend/landgrab-ui/src/stores/effectsStore.ts`
- `frontend/landgrab-ui/src/stores/playerLayerStore.ts`
- `frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`
- `frontend/landgrab-ui/src/utils/gridDiff.ts`
- `frontend/landgrab-ui/src/components/map/HexTile.tsx`
- `frontend/landgrab-ui/src/components/map/layers/GameOverlayLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/EffectsLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/index.ts`

### Frontend — Modify:
- `frontend/landgrab-ui/src/stores/index.ts`
- `frontend/landgrab-ui/src/types/game.ts`
- `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`
- `frontend/landgrab-ui/src/hooks/useGridDiff.ts`
- `frontend/landgrab-ui/src/components/map/GameMap.tsx` (major refactor)
- `frontend/landgrab-ui/src/components/game/map/HexTooltip.ts`

### Frontend — Remove (after migration):
- `frontend/landgrab-ui/src/components/game/map/HexGridLayer.ts`
- `frontend/landgrab-ui/src/components/game/map/PlayerMarkerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/TroopAnimationLayer.ts`
- `frontend/landgrab-ui/src/utils/contestedEdges.ts`
- `frontend/landgrab-ui/src/utils/supplyNetwork.ts`

---

## Verification

### Build verification
```bash
cd frontend/landgrab-ui && npm run build && npm run lint
cd backend/Landgrab.Tests && dotnet test
```

### Functional testing
1. Create a room, set up a game with 2+ alliances, start the game
2. Verify hex grid renders correctly with all visual elements (troop badges, terrain icons, fort icons, building icons)
3. Claim hexes — verify only the claimed hex re-renders (use React DevTools Profiler)
4. Move troops — verify troop animation arrows display, source/dest tiles update
5. Verify contested edges appear between enemy territories
6. Verify supply lines appear from HQ to connected hexes
7. Verify fog of war hides unrevealed hexes
8. Verify player markers update on GPS movement without triggering hex re-renders
9. Verify selectedHex highlight works
10. Verify map layer toggle (all 12 preferences) still functions
11. Verify `mapOverlayTick` is gone — fort/demolish progress animates via CSS

### Performance testing
1. Start a game with max hexes (gridRadius=8, ~225 hexes)
2. Open browser DevTools Performance tab
3. Trigger a single hex claim — verify render time < 16ms (single hex + effects, not full grid)
4. Trigger GPS update — verify no hex layer re-renders (only player layer)
5. Monitor memory — verify no Leaflet layer leaks from old clear/recreate pattern
6. Test on mobile — verify reduced battery drain over 10-minute session compared to current
