# Layered Map Architecture Refactor

## Context

LandGrab becomes sluggish during long game sessions with many troops on the map, and battery drain on mobile is excessive. The root cause is monolithic map rendering: `renderHexGridLayers()` in `HexGridLayer.ts:93` calls `layerGroup.clearLayers()` then recreates ALL Leaflet elements for ALL hexes on ANY state change. With 100-225 hexes each creating ~11 Leaflet elements, this means 1100-2475 DOM elements destroyed and recreated whenever anything changes (GPS tick, hex selection, troop movement, overlay tick, etc.).

Additionally, derived state (contested edges, supply network) is recomputed on every render cycle client-side, and the single `gameStore` Zustand store causes all map consumers to re-render on any state change.

This refactor decomposes the monolithic map into independent rendering layers with separate update cycles, moves to React components for hex tiles, creates layer-based Zustand stores, and moves derived state computation to the server.

### Design Decisions

- **Rendering**: Single Leaflet-managed SVG overlay per layer. React renders hex tiles as `<g>` groups within a shared SVG. Leaflet handles all coordinate transforms — no manual pixel repositioning on zoom/pan. HTML content (troop badges, tooltips) uses `<foreignObject>`.
- **Global toggles (zoom thresholds, layer preferences, selectedHex/currentHex)**: Handled via CSS classes on the SVG overlay container. Individual children show/hide based on parent CSS class. Tiles don't re-render for visibility toggles — CSS handles it. Only `selectedHex`/`currentHex` changes re-render the 2 affected tiles (old + new).
- **Stores**: Full layer-based Zustand stores (tileOverlayStore, effectsStore, playerLayerStore).
- **Derived state**: Contested edges and supply network computed server-side, included in GameState DTO.

---

## Phase 1: Layer-Based Zustand Stores

Split the monolithic `gameStore` into layer-specific stores so each layer subscribes only to its own data.

### New stores to create in `frontend/landgrab-ui/src/stores/`:

**1. `tileOverlayStore.ts`** — Game Overlay Layer state
```ts
interface TileState {
  // Core hex data (from HexCell)
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
  // Derived rendering flags (set by orchestrator)
  isInactive: boolean;
  hasActiveRaid: boolean;
}

interface TileOverlayStore {
  tiles: Record<string, TileState>;           // Per-hex rendering state keyed by "q,r"
  masterTileKey: string | null;
  alliances: AllianceDto[];
  dynamics: GameDynamics;
  // Selection state (only old + new tile re-render on change)
  selectedHexKey: string | null;
  currentHexKey: string | null;

  // Actions
  updateTiles: (changes: Record<string, TileState>) => void;
  removeTiles: (keys: string[]) => void;
  setFullGrid: (tiles: Record<string, TileState>, alliances: AllianceDto[], dynamics: GameDynamics) => void;
  setSelectedHexKey: (key: string | null) => void;
  setCurrentHexKey: (key: string | null) => void;
}
```

Individual `HexTile` components subscribe via:
```ts
const tile = useTileOverlayStore(state => state.tiles[hexId]);
const isSelected = useTileOverlayStore(state => state.selectedHexKey === hexId);
const isCurrent = useTileOverlayStore(state => state.currentHexKey === hexId);
```
Each selector returns a stable value — `tile` only changes when that hex's data changes, `isSelected`/`isCurrent` only change for the old and new selection (2 tiles re-render, not 200).

**2. `effectsStore.ts`** — Effects Layer state (contested edges, supply lines, fog)
```ts
interface EffectsStore {
  contestedEdges: ContestedEdgeDto[];         // Server-computed
  supplyEdges: SupplyEdgeDto[];               // Server-computed
  disconnectedHexKeys: Set<string>;           // Server-computed
  troopMovements: TroopMovement[];            // From grid diffing

  // Actions
  setEffects: (effects: { contestedEdges: ContestedEdgeDto[]; supplyEdges: SupplyEdgeDto[]; disconnectedHexKeys: Set<string> }) => void;
  setTroopMovements: (movements: TroopMovement[]) => void;
}
```

**3. `playerLayerStore.ts`** — Player Layer state
```ts
interface PlayerLayerStore {
  players: Player[];
  myUserId: string;
  currentLocation: { lat: number; lng: number } | null;

  // Actions
  setPlayers: (players: Player[]) => void;
  setMyUserId: (id: string) => void;
  setCurrentLocation: (loc: { lat: number; lng: number } | null) => void;
}
```

### Modify existing stores:
- **`gameStore.ts`** — Keep for session management (`savedSession`, `myRooms`, `autoResuming`) and the full `GameState` for non-map consumers (lobby, HUD, game-over screen, ReviewStep). The map layers will NOT subscribe to `gameStore.gameState` directly.
- **`gameplayStore.ts`** — Keep for UI interaction state (prompts, combatResult, commandoTargetingMode). Remove `selectedHex` — it moves to `tileOverlayStore.selectedHexKey` since it's now a map rendering concern. Add a derived getter or keep a mirror for non-map consumers.
- **`notificationStore.ts`** / **`infoLedgeStore.ts`** — Keep as-is (already separate)

### Files to create:
- `frontend/landgrab-ui/src/stores/tileOverlayStore.ts`
- `frontend/landgrab-ui/src/stores/effectsStore.ts`
- `frontend/landgrab-ui/src/stores/playerLayerStore.ts`

### Files to modify:
- `frontend/landgrab-ui/src/stores/index.ts` — Add new store exports
- `frontend/landgrab-ui/src/stores/gameplayStore.ts` — Remove `selectedHex`/`selectedHexKey`, add redirect or keep in sync

---

## Phase 2: Server-Side Derived State

Move `findContestedEdges()` and `computeSupplyNetwork()` to the server so the client receives pre-computed data.

### Backend changes:

**1. Create `backend/Landgrab.Api/Models/DerivedMapState.cs`**

```csharp
public class ContestedEdgeDto
{
    public string HexKeyA { get; set; } = "";    // "q,r"
    public string HexKeyB { get; set; } = "";    // "q,r"
    public int NeighborIndex { get; set; }        // 0-5, which shared edge
    public string TeamAColor { get; set; } = "";
    public string TeamBColor { get; set; } = "";
    public double Intensity { get; set; }         // minTroops/maxTroops ratio
}

public class SupplyEdgeDto
{
    public string FromKey { get; set; } = "";     // "q,r"
    public string ToKey { get; set; } = "";       // "q,r"
    public string TeamColor { get; set; } = "";
}
```

**2. Add derived state fields to `backend/Landgrab.Api/Models/GameState.cs`**

```csharp
// Add to GameState class:
public List<ContestedEdgeDto>? ContestedEdges { get; set; }
public List<SupplyEdgeDto>? SupplyEdges { get; set; }
public List<string>? DisconnectedHexKeys { get; set; }
```

**3. Create `backend/Landgrab.Api/Services/DerivedMapStateService.cs`**

Port the logic from the client-side utilities. These are pure functions over `Dictionary<string, HexCell>` and `List<AllianceDto>`:

| Client source | Server method | Logic |
|---|---|---|
| `contestedEdges.ts:27-77` `findContestedEdges()` | `ComputeContestedEdges()` | Iterate owned cells, check 6 neighbors for different owner/alliance. No geometry — just hex keys + neighbor index (0-5). Client maps index to screen edge coords. |
| `supplyNetwork.ts:20-91` `computeSupplyNetwork()` | `ComputeSupplyNetwork()` | BFS from HQ hex per alliance. Return connected edges and disconnected hex keys. |

The neighbor offset array `[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]]` is used in both — matches `HexService.cs` `Neighbors()` method. Reuse `HexService.Neighbors()`.

**4. Call in `BroadcastState()`**

Modify `GameHub.cs:84` `BroadcastState()`:
```csharp
// Before sending, compute derived state (only during Playing phase)
if (state.Phase == GamePhase.Playing)
{
    derivedMapStateService.ComputeAndAttach(state);
}
```

This runs once per broadcast, not once per client. For fog-of-war per-player snapshots, the derived state should be computed on the full state first, then the per-player snapshot filters it as needed (contested edges between visible hexes only).

**5. Register service**

`backend/Landgrab.Api/Program.cs`: Register `DerivedMapStateService` as singleton (stateless, thread-safe pure functions).

### Frontend changes:

Add to `frontend/landgrab-ui/src/types/game.ts`:
```ts
export interface ContestedEdgeDto {
  hexKeyA: string;
  hexKeyB: string;
  neighborIndex: number;  // 0-5 maps to HEX_NEIGHBOR_OFFSETS / SHARED_EDGE_CORNERS
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

Add to `GameState` interface:
```ts
contestedEdges?: ContestedEdgeDto[] | null;
supplyEdges?: SupplyEdgeDto[] | null;
disconnectedHexKeys?: string[] | null;
```

### Files to create:
- `backend/Landgrab.Api/Models/DerivedMapState.cs`
- `backend/Landgrab.Api/Services/DerivedMapStateService.cs`

### Files to modify:
- `backend/Landgrab.Api/Models/GameState.cs` — Add derived state fields
- `backend/Landgrab.Api/Hubs/GameHub.cs` — Call derived state computation in `BroadcastState()`
- `backend/Landgrab.Api/Program.cs` — Register `DerivedMapStateService`
- `frontend/landgrab-ui/src/types/game.ts` — Add DTO types, extend GameState

---

## Phase 3: MapOrchestrator & SignalR Update Routing

Create a `useMapOrchestrator` hook that routes incoming SignalR state updates to the correct layer stores.

### Create `frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`

```ts
export function useMapOrchestrator() {
  // Returns dispatch function to be called from useSignalRHandlers

  function dispatchStateToLayers(state: GameState, previousState: GameState | null) {
    // 1. Diff grid → only update changed tiles in tileOverlayStore
    const { changed, removed } = diffGrid(previousState?.grid, state.grid);
    const tileStore = useTileOverlayStore.getState();
    if (Object.keys(changed).length > 0) {
      tileStore.updateTiles(toTileStates(changed, state));
    }
    if (removed.length > 0) {
      tileStore.removeTiles(removed);
    }
    // Always update alliances/dynamics (cheap reference check)
    tileStore.setFullGrid(/* only if grid shape changed */)

    // 2. Update effects store with server-computed derived state
    useEffectsStore.getState().setEffects({
      contestedEdges: state.contestedEdges ?? [],
      supplyEdges: state.supplyEdges ?? [],
      disconnectedHexKeys: new Set(state.disconnectedHexKeys ?? []),
    });

    // 3. Update player layer store (only if players changed)
    usePlayerLayerStore.getState().setPlayers(state.players);

    // 4. Compute troop movements from diff (replaces useGridDiff)
    const movements = detectTroopMovements(previousState?.grid, state.grid);
    if (movements.length > 0) {
      useEffectsStore.getState().setTroopMovements(movements);
    }
  }

  function dispatchPlayersOnly(players: Player[]) {
    // Called from onPlayersMoved — only touches player layer, no tile re-renders
    usePlayerLayerStore.getState().setPlayers(players);
  }

  return { dispatchStateToLayers, dispatchPlayersOnly };
}
```

### Handling gridOverride and inactiveHexKeys (ReviewStep support)

The `ReviewStep` component passes `gridOverride` and `inactiveHexKeys` to `GameMap` for the lobby preview. The orchestrator needs to handle this:

- `GameMap` accepts optional `gridOverride` and `inactiveHexKeys` props
- When present, `GameMap` calls `tileOverlayStore.setFullGrid()` directly from a `useEffect` watching these props (bypassing the SignalR dispatch path)
- `inactiveHexKeys` maps to `TileState.isInactive` per tile

### Create `frontend/landgrab-ui/src/utils/gridDiff.ts`

```ts
interface GridDiffResult {
  changed: Record<string, HexCell>;  // New or modified cells
  removed: string[];                  // Keys that no longer exist
}

export function diffGrid(
  prev: Record<string, HexCell> | undefined,
  next: Record<string, HexCell>
): GridDiffResult
```

Per-cell comparison checks: `ownerId`, `ownerAllianceId`, `ownerColor`, `troops`, `isFort`, `isFortified`, `engineerBuiltAt`, `isMasterTile`, `terrainType`, `lastVisitedAt`. If any field differs, the cell is "changed".

Also extracts troop movement detection logic from the existing `useGridDiff.ts:84-147` into a separate pure function `detectTroopMovements()`.

### Modify `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`

In `onStateUpdated` (line 201): after calling `gameStore.setGameState()`, also call `dispatchStateToLayers()`.

In `onPlayersMoved` (line 271): call `dispatchPlayersOnly(players)` in addition to updating gameStore.

### Wiring selectedHex and currentHex

- `onHexClick` callback (from `useGameActionsGameplay`) calls `tileOverlayStore.setSelectedHexKey(key)` instead of (or in addition to) `gameplayStore.setSelectedHex()`
- `currentHex` computation stays in `GameMap.tsx` but writes to `tileOverlayStore.setCurrentHexKey(key)` via a `useEffect`

### Files to create:
- `frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`
- `frontend/landgrab-ui/src/utils/gridDiff.ts`

### Files to modify:
- `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts` — Integrate orchestrator dispatch
- `frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts` — Update selectedHex wiring
- `frontend/landgrab-ui/src/components/map/GameMap.tsx` — Write currentHex to tileOverlayStore

---

## Phase 4: React Hex Tile Components via Leaflet SVG Overlay

Replace the imperative Leaflet rendering with React components rendered inside Leaflet's SVG coordinate system.

### Approach: Single SVG Overlay per Layer

Each layer renders a single `<svg>` element that Leaflet positions and transforms. React manages the content inside via a portal. Leaflet handles all zoom/pan coordinate transforms automatically — no manual `latLngToContainerPoint()` repositioning.

**How it works:**
1. Create a custom Leaflet layer class (`ReactSvgOverlay`) that creates an `<svg>` element in a specific pane
2. Leaflet manages the SVG's `viewBox` and CSS `transform` on zoom/pan
3. React renders into a `<g>` root element inside this SVG via `createPortal()`
4. Hex corner coordinates are projected to Leaflet's layer point space (`map.latLngToLayerPoint()`) **once** on initialization and on `zoomend` events — not on every pan
5. HTML content (troop badges, terrain icons) uses `<foreignObject>` inside SVG

### Create `frontend/landgrab-ui/src/components/map/ReactSvgOverlay.ts`

Custom Leaflet layer class:
```ts
class ReactSvgOverlay extends L.Layer {
  private _svg: SVGSVGElement;
  private _rootG: SVGGElement;

  onAdd(map: L.Map): this {
    // Create SVG element in the target pane
    // Set up viewBox matching map's pixel bounds
    // Listen to 'zoom viewreset' to update viewBox
    return this;
  }

  getContainer(): SVGGElement {
    return this._rootG;  // React renders into this <g>
  }

  onRemove(): this { /* cleanup */ }
}
```

### Create `frontend/landgrab-ui/src/components/map/HexTile.tsx`

Individual React component per hex:

```tsx
const HexTile = memo(function HexTile({ hexId }: { hexId: string }) {
  const tile = useTileOverlayStore(state => state.tiles[hexId]);
  const isSelected = useTileOverlayStore(state => state.selectedHexKey === hexId);
  const isCurrent = useTileOverlayStore(state => state.currentHexKey === hexId);
  const dynamics = useTileOverlayStore(state => state.dynamics);

  if (!tile) return null;

  // Reuse existing pure functions from hexRendering.ts
  const { fillColor, fillOpacity } = getHexFillStyle({ cell: tile, ... });
  const { borderColor, borderWeight, borderOpacity, dashArray } = getHexBorderStyle({ ... });
  const className = getHexPolygonClassName({ ... });

  return (
    <g className="hex-tile" data-hex={hexId}>
      {/* Base polygon — SVG path using pre-computed points */}
      <polygon
        points={pointsAttr}
        className={className}
        fill={fillColor}
        fillOpacity={fillOpacity}
        stroke={borderColor}
        strokeWidth={borderWeight}
        strokeOpacity={borderOpacity}
        strokeDasharray={dashArray}
        style={{
          '--hex-owner-color': ownerColor,
          '--hex-player-highlight-color': highlightColor,
        }}
        onClick={handleClick}
      />

      {/* Troop badge — HTML via foreignObject (zoom-gated by CSS) */}
      {tile.troops > 0 && (
        <foreignObject className="hex-fo-badge" x={cx - bs/2} y={cy - bs/2} width={bs} height={bs}>
          <div className={badgeClass} style={badgeStyle}
               dangerouslySetInnerHTML={{ __html: badgeHtml }} />
        </foreignObject>
      )}

      {/* Terrain icon (zoom-gated by CSS) */}
      {terrainIcon && (
        <foreignObject className="hex-fo-terrain" x={cx - 11} y={cy - 7} width={22} height={22}>
          <div className="hex-terrain-icon" dangerouslySetInnerHTML={{ __html: terrainIcon }} />
        </foreignObject>
      )}

      {/* Selection overlay (only renders for selected/current tiles) */}
      {isSelected && <polygon points={pointsAttr} className="hex-selection-overlay" ... />}
      {isCurrent && <polygon points={pointsAttr} className="hex-current-overlay" ... />}

      {/* Fort icon, building icons, raid overlay, progress rings — conditional */}
      ...
    </g>
  );
});
```

**Key: Per-tile selector isolation.** Each `HexTile` subscribes to `state.tiles[hexId]` — a stable reference that only changes when THAT hex's data changes. When hex "4,7" gets captured, only the `HexTile` for "4,7" re-renders.

### CSS-Level Zoom Thresholds and Layer Preferences

Apply data attributes and classes to the SVG overlay container. Individual child elements use CSS to show/hide based on these:

```tsx
// In GameOverlayLayer, update on zoom change:
<svg
  data-zoom-level={getZoomLevel(currentZoom)}
  className={buildLayerClasses(layerPrefs)}
>
```

```css
/* Troop badges: only visible at zoom >= 14 (tactical+) */
[data-zoom-level="strategic"] .hex-fo-badge { display: none; }

/* Terrain icons: only visible at zoom >= 15 */
[data-zoom-level="strategic"] .hex-fo-terrain,
[data-zoom-level="tactical"] .hex-fo-terrain { display: none; }

/* Layer preference toggles */
.hex-overlay-svg:not(.show-troop-badges) .hex-fo-badge { display: none; }
.hex-overlay-svg:not(.show-terrain-icons) .hex-fo-terrain { display: none; }
.hex-overlay-svg:not(.show-border-effects) .hex-tile.is-frontier { /* disable glow */ }
```

**Zoom level mapping** (from `zoomThresholds.ts`):
- `"strategic"`: zoom < 14
- `"tactical"`: zoom 14-15
- `"detailed"`: zoom >= 16

This means zoom changes and layer toggle changes trigger **zero React re-renders** — only a CSS class change on the SVG container, and the browser's CSS engine handles visibility.

### Create `frontend/landgrab-ui/src/components/map/layers/`

**`GameOverlayLayer.tsx`** — Renders all HexTile components
```tsx
function GameOverlayLayer({ map, layerPrefs }: { map: L.Map; layerPrefs: MapLayerPreferences }) {
  const svgOverlayRef = useRef<ReactSvgOverlay | null>(null);
  const [svgRoot, setSvgRoot] = useState<SVGGElement | null>(null);
  const [currentZoom, setCurrentZoom] = useState(map.getZoom());
  const tileKeys = useTileOverlayStore(state => Object.keys(state.tiles));

  // Initialize Leaflet SVG overlay layer
  useEffect(() => {
    const overlay = new ReactSvgOverlay({ pane: HEX_LAYER_PANE });
    overlay.addTo(map);
    setSvgRoot(overlay.getContainer());
    svgOverlayRef.current = overlay;
    return () => { overlay.remove(); };
  }, [map]);

  // Track zoom for CSS data attribute
  useEffect(() => {
    const handler = () => setCurrentZoom(map.getZoom());
    map.on('zoomend', handler);
    return () => { map.off('zoomend', handler); };
  }, [map]);

  if (!svgRoot) return null;

  // Compute hex geometry in Leaflet layer point space
  const hexGeometries = useHexGeometries(map, tileKeys); // memoized, recalculates on zoom

  return createPortal(
    <g
      data-zoom-level={getZoomLevel(currentZoom)}
      className={buildLayerClasses(layerPrefs)}
    >
      {/* World dim mask — static, only changes when grid shape changes */}
      {layerPrefs.worldDimMask && <WorldDimMask tileKeys={tileKeys} map={map} />}

      {/* Hex tiles */}
      {tileKeys.map(key => (
        <HexTile key={key} hexId={key} geometry={hexGeometries[key]} />
      ))}
    </g>,
    svgRoot
  );
}
```

**`EffectsLayer.tsx`** — Renders contested edges, supply lines, troop animations
```tsx
function EffectsLayer({ map, layerPrefs }: Props) {
  const contestedEdges = useEffectsStore(state => state.contestedEdges);
  const supplyEdges = useEffectsStore(state => state.supplyEdges);
  const troopMovements = useEffectsStore(state => state.troopMovements);

  // Render into its own ReactSvgOverlay (separate pane, z-index between hex and player)
  // Contested edges: SVG <line> elements using hex corner coords from neighborIndex
  // Supply lines: SVG <line> with stroke-dasharray, <polygon> arrow markers
  // Troop animations: SVG <line> with CSS animation (replacing TroopAnimationLayer.ts)

  return createPortal(<g>...</g>, svgRoot);
}
```

**`PlayerLayer.tsx`** — Renders player markers
```tsx
function PlayerLayer({ map, layerPrefs, playerDisplayPrefs }: Props) {
  const players = usePlayerLayerStore(state => state.players);
  const myUserId = usePlayerLayerStore(state => state.myUserId);

  // Uses its own ReactSvgOverlay in PLAYER_LAYER_PANE (z-index 650)
  // Player markers as <foreignObject> containing styled divs
  // Beacon markers, radius indicators as SVG circles
  // Only re-renders when players array changes

  return createPortal(<g>...</g>, svgRoot);
}
```

### WorldDimMask Component

Currently in `HexGridLayer.ts:549-581`. Convert to a React SVG component:

```tsx
const WorldDimMask = memo(function WorldDimMask({ tileKeys, map }: Props) {
  // Renders a multi-ring polygon: world bounds as outer ring, each hex as a hole
  // Only re-renders when tileKeys change (grid shape change — rare)
  // Uses Leaflet layer points for coordinates, same as HexTile
});
```

### Hex Geometry Management

Create `frontend/landgrab-ui/src/hooks/useHexGeometries.ts`:

```ts
// Computes pixel coordinates for all hex corners in Leaflet's layer point space
// Recalculates on zoom change (not pan — layer points are zoom-relative)
// Returns Record<string, { points: string; center: [number, number] }>
export function useHexGeometries(map: L.Map, tileKeys: string[]): Record<string, HexPixelGeometry>
```

Uses `roomHexCornerLatLngs()` from `HexMath.ts` to get lat/lng corners, then `map.latLngToLayerPoint()` to convert to pixel space. Memoized by zoom level and tile key set.

### Modify `frontend/landgrab-ui/src/components/map/GameMap.tsx`

Replace the three `useEffect` rendering blocks with declarative React layers:

```tsx
return (
  <div className={`game-map-container time-${timePeriod}`}>
    <div ref={containerRef} className="leaflet-map" />
    {mapInstance && (
      <>
        <GameOverlayLayer map={mapInstance} layerPrefs={layerPrefs} />
        <EffectsLayer map={mapInstance} layerPrefs={layerPrefs} />
        <PlayerLayer map={mapInstance} layerPrefs={layerPrefs} playerDisplayPrefs={playerDisplayPrefs} />
      </>
    )}
    <TroopSplashLayer ... />
    {layerPrefs.timeOverlay && <TimeOverlay timePeriod={timePeriod} />}
    {/* basemap error banner, debug overlay, controls, MapLayerToggle — unchanged */}
  </div>
);
```

**Remove from GameMap.tsx:**
- The `useEffect` at lines 453-497 (hex grid rendering)
- The `useEffect` at lines 499-533 (player marker rendering)
- The `useEffect` at lines 535-546 (troop animation rendering)
- `layerGroupRef`, `playerLayerGroupRef`, `animLayerGroupRef` refs
- `prevGridRef` (diffing moves to orchestrator)
- `mapOverlayTick` state and its 1-second interval (Phase 7)

**Keep in GameMap.tsx:**
- Map initialization `useEffect` (lines 170-302) — creates L.Map, basemap layers, panes
- Zoom tracking, bounds change, grid fitting, follow-me logic
- `currentHex` computation (writes result to `tileOverlayStore.setCurrentHexKey()`)
- `gridOverride`/`inactiveHexKeys` handling for ReviewStep

### Reuse existing utilities:
- `hexRendering.ts` — All pure functions: `getHexFillStyle`, `getHexBorderStyle`, `getHexPolygonClassName`, `getTroopBadgeDescriptor`, `getHexOwnerColor`, `getHexTerritoryStatus`, `isFogHiddenHex`, `shouldRenderTerrainIcon`, `shouldHideTroopCountInForest`. These work with any rendering approach.
- `HexMath.ts` — `roomHexCornerLatLngs`, `roomHexToLatLng`, `latLngToRoomHex`
- `HexTooltip.ts` — Adapt to return JSX instead of HTML string (for use in SVG `<foreignObject>` tooltip)
- `zoomThresholds.ts` — Reuse threshold functions for the zoom level classifier
- `terrainIcons.ts`, `gameIcons.ts` — Reuse as-is (HTML strings used in `dangerouslySetInnerHTML`)
- `hexColorUtils.ts` — Reuse `hexToHSL`, `scaleTroopColor`, `scaleTroopOpacity`

### Files to create:
- `frontend/landgrab-ui/src/components/map/ReactSvgOverlay.ts`
- `frontend/landgrab-ui/src/components/map/HexTile.tsx`
- `frontend/landgrab-ui/src/components/map/WorldDimMask.tsx`
- `frontend/landgrab-ui/src/components/map/layers/GameOverlayLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/EffectsLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/index.ts`
- `frontend/landgrab-ui/src/hooks/useHexGeometries.ts`

### Files to modify:
- `frontend/landgrab-ui/src/components/map/GameMap.tsx` — Replace imperative rendering with React layers
- `frontend/landgrab-ui/src/components/game/map/HexTooltip.ts` — Return JSX instead of HTML string
- `frontend/landgrab-ui/src/styles/index.css` — Add zoom-level CSS rules, foreignObject styling

### Files to eventually remove (after migration complete):
- `frontend/landgrab-ui/src/components/game/map/HexGridLayer.ts`
- `frontend/landgrab-ui/src/components/game/map/PlayerMarkerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/TroopAnimationLayer.ts`
- `frontend/landgrab-ui/src/utils/contestedEdges.ts` — Moved to server
- `frontend/landgrab-ui/src/utils/supplyNetwork.ts` — Moved to server

---

## Phase 5: CSS Containment & Animation Optimization

### CSS zoom-level rules

```css
/* Strategic zoom (< 14): only colored polygons */
[data-zoom-level="strategic"] .hex-fo-badge,
[data-zoom-level="strategic"] .hex-fo-terrain,
[data-zoom-level="strategic"] .hex-fo-building { display: none; }

/* Tactical zoom (14-15): add badges, contest indicators */
[data-zoom-level="tactical"] .hex-fo-terrain,
[data-zoom-level="tactical"] .hex-fo-building { display: none; }

/* Detailed zoom (16+): everything visible */
```

### CSS layer preference rules

```css
.hex-overlay-svg:not(.show-troop-badges) .hex-fo-badge { display: none; }
.hex-overlay-svg:not(.show-terrain-icons) .hex-fo-terrain { display: none; }
.hex-overlay-svg:not(.show-building-icons) .hex-fo-building { display: none; }
.hex-overlay-svg:not(.show-border-effects) .is-frontier { filter: none; }
.hex-overlay-svg:not(.show-fog-of-war) .hex-fog-hidden { opacity: 1; }
/* etc. for all 12 preferences */
```

### Animation strategy

- Existing CSS animations (`border-pulse`, `current-player-hex-pulse`, `is-just-claimed`, `is-revealing`) in `index.css` continue to work since they target CSS classes which the React HexTile applies
- `will-change: transform` only on tiles with active CSS animations
- Fort build progress and demolish progress rings use CSS `@keyframes` driven by `--progress` custom property set once (not every second)

### Files to modify:
- `frontend/landgrab-ui/src/styles/index.css` — Add zoom-level and layer-preference CSS rules

---

## Phase 6: Troop Animation Integration

### Move troop movement detection into the orchestrator

Currently `useGridDiff.ts` detects troop movements by diffing grid state. This logic moves to `gridDiff.ts` as a pure function `detectTroopMovements()`, called from the MapOrchestrator in Phase 3.

Results are stored in `effectsStore.troopMovements` and consumed by `EffectsLayer`.

### EffectsLayer renders troop animations

Replace `TroopAnimationLayer.ts` (imperative `L.polyline` + `L.marker`) with SVG elements in the EffectsLayer:

```tsx
{troopMovements.map(movement => (
  <line
    key={`${movement.fromHex}-${movement.toHex}`}
    className={`troop-flow-${movement.type}`}
    x1={from.x} y1={from.y}
    x2={to.x} y2={to.y}
    stroke={movement.teamColor}
    strokeDasharray="8 4"
  />
))}
```

Existing CSS animations for `troop-flow-transfer` and `troop-flow-attack` continue to work.

`TroopSplashLayer` stays as-is — it's already a separate React component.

### Files to modify:
- `frontend/landgrab-ui/src/hooks/useGridDiff.ts` — Extract `detectTroopMovements` to `gridDiff.ts`, deprecate hook
- `frontend/landgrab-ui/src/components/map/layers/EffectsLayer.tsx` — Render troop movement SVG lines

---

## Phase 7: Cleanup & mapOverlayTick Removal

### Remove mapOverlayTick

Currently increments every 1 second to animate fort build and demolish progress rings, triggering a FULL grid re-render every second.

Replace with CSS-only progress animations:
- Set `--build-started-at` as a CSS custom property on the `HexTile` `<g>` element when `engineerBuiltAt` is set
- Use CSS `@keyframes` that animate a `conic-gradient` or `stroke-dashoffset` over 10 minutes (fort build) / 2 minutes (demolish)
- Progress ring appearance is driven entirely by CSS — no React re-render, no JavaScript timer

### Remove dead code
- Delete `frontend/landgrab-ui/src/components/game/map/HexGridLayer.ts`
- Delete `frontend/landgrab-ui/src/components/game/map/PlayerMarkerLayer.tsx`
- Delete `frontend/landgrab-ui/src/components/map/TroopAnimationLayer.ts`
- Delete `frontend/landgrab-ui/src/utils/contestedEdges.ts`
- Delete `frontend/landgrab-ui/src/utils/supplyNetwork.ts`
- Remove `applyLayerPane()` from GameMap.tsx
- Clean up barrel exports in `frontend/landgrab-ui/src/components/game/map/index.ts`

### Files to modify:
- `frontend/landgrab-ui/src/components/map/GameMap.tsx` — Remove mapOverlayTick, hasPendingMapOverlays, related state
- `frontend/landgrab-ui/src/styles/index.css` — Add CSS-only progress ring animations
- `frontend/landgrab-ui/src/components/game/map/index.ts` — Remove old exports

---

## Implementation Order

Execute phases in this order, each building on the previous:

1. **Phase 2** (Server-side derived state) — Can be done independently, no frontend rendering changes. After this phase, the server sends contested edges and supply network data but the frontend ignores the new fields until Phase 3.
2. **Phase 1** (Layer stores) — Create new Zustand stores. The old rendering code still works — stores exist but aren't consumed by the map yet.
3. **Phase 3** (MapOrchestrator) — Route SignalR updates to new stores. Old rendering code now reads from gameStore (unchanged) while new stores are being populated in parallel.
4. **Phase 4** (React hex tiles) — The main rendering refactor. Swap old imperative rendering for new React layers reading from new stores. This is the biggest phase.
5. **Phase 5** (CSS containment) — CSS-only changes, no functional risk.
6. **Phase 6** (Troop animations) — Integrate with EffectsLayer.
7. **Phase 7** (Cleanup) — Remove old code, mapOverlayTick, dead files.

Each phase results in a working app. Phases 1-3 can coexist with the old rendering code (stores populated but not consumed by the map until Phase 4).

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
- `frontend/landgrab-ui/src/hooks/useHexGeometries.ts`
- `frontend/landgrab-ui/src/utils/gridDiff.ts`
- `frontend/landgrab-ui/src/components/map/ReactSvgOverlay.ts`
- `frontend/landgrab-ui/src/components/map/HexTile.tsx`
- `frontend/landgrab-ui/src/components/map/WorldDimMask.tsx`
- `frontend/landgrab-ui/src/components/map/layers/GameOverlayLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/EffectsLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/layers/index.ts`

### Frontend — Modify:
- `frontend/landgrab-ui/src/stores/index.ts`
- `frontend/landgrab-ui/src/stores/gameplayStore.ts` — selectedHex migration
- `frontend/landgrab-ui/src/types/game.ts`
- `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`
- `frontend/landgrab-ui/src/hooks/useGameActionsGameplay.ts` — selectedHex wiring
- `frontend/landgrab-ui/src/components/map/GameMap.tsx` (major refactor)
- `frontend/landgrab-ui/src/components/game/map/HexTooltip.ts`
- `frontend/landgrab-ui/src/styles/index.css`

### Frontend — Remove (Phase 7):
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
9. Verify selectedHex highlight works (only 2 tiles re-render: old + new selection)
10. Verify currentHex highlight works (GPS position indicator)
11. Verify map layer toggle (all 12 preferences) still functions — CSS-only, no re-renders
12. Verify zoom threshold visibility (zoom in/out — badges appear/disappear via CSS)
13. Verify fort/demolish progress animates without JavaScript timer
14. Verify ReviewStep preview mode (gridOverride, inactiveHexKeys) still works
15. Verify WorldDimMask (dark overlay outside grid) renders correctly
16. Verify hex click interaction, tooltips, drag-detection
17. Verify constrainViewportToGrid (can't pan/zoom outside grid)

### Performance testing
1. Start a game with max hexes (gridRadius=8, ~225 hexes)
2. Open browser DevTools Performance tab
3. Trigger a single hex claim — verify render time < 16ms (single hex + effects, not full grid)
4. Trigger GPS update — verify no hex layer re-renders (only player layer)
5. Toggle selectedHex — verify exactly 2 HexTile re-renders (old + new)
6. Toggle a layer preference — verify 0 React re-renders (CSS-only)
7. Cross a zoom threshold — verify 0 React re-renders (CSS-only)
8. Monitor memory — verify stable memory (no Leaflet layer leaks from old clear/recreate pattern)
9. Test on mobile — verify reduced battery drain over 10-minute session
