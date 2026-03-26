# 3D View Integration Analysis — LandGrab

**Date:** 2026-03-22
**Status:** Research / pre-design
**Context:** Mapping findings from a 3D look-around + hex-map scanning research spike onto the actual LandGrab codebase and architecture.

---

## Purpose

This document reconciles the output of a comprehensive open-source 3D rendering research effort with the real LandGrab tech stack, identifies where assumptions diverge, and proposes three concrete integration strategies with a clear recommendation.

The goal is to give players an alternative **3D scan view** of the game area — a secondary perspective that makes physical presence feel immersive, not just functional.

---

## Research summary

The research investigated three topics and how they combine:

1. **3D look-around view** — street-level or near-ground perspective of a real-world map using free/open-source tools.
2. **3D hex-map scanning** — rendering a 3D hexagonal territory grid that players "scan" by physically looking around with their device.
3. **Combining both** — architectural patterns for fusing a real-world 3D map with a hex-grid game overlay in a single React app.

### Key findings from the research

| Area | Finding |
|------|---------|
| Map renderer | MapLibre GL JS v5.21+ has native 3D terrain (via `raster-dem`) and 3D building extrusion (`fill-extrusion`). Max pitch is 85°. |
| Free terrain tiles | AWS Terrain Tiles (Terrarium encoding) — global coverage, zero cost, no auth. Alternative: Protomaps Mapterhorn (PMTiles, self-hostable). |
| Free vector tiles | OpenFreeMap (`tiles.openfreemap.org/planet`) — unlimited, OpenMapTiles schema. |
| Hex spatial index | Uber H3 (`h3-js` v4.4.0) — hierarchical hex grid, resolution 9 ≈ city block (~400 m edge). |
| Hex rendering on map | deck.gl `H3HexagonLayer` — purpose-built, instanced rendering, extrusion, per-hex colors, picking. Renders inside MapLibre's WebGL context in interleaved mode. |
| 3D React integration | React Three Fiber v9.5 (`@react-three/fiber`) + `@react-three/drei` for helpers. `react-three-map` bridges R3F into MapLibre's GL context. |
| Device orientation | `DeviceOrientationEvent` API — `alpha` (heading), `beta` (pitch), `gamma` (roll). iOS 13+ requires explicit `requestPermission()` from a user gesture. |
| State management | Zustand as single source of truth across map and 3D renderers. |
| WebGL context limits | Mobile Safari limits active WebGL contexts aggressively. Sharing a single context via MapLibre's `CustomLayerInterface` or deck.gl interleaved mode is critical. |
| Street-level imagery | Mapillary (free, MIT) and Panoramax (CC-BY-SA 4.0, European coverage). |
| Future AR | `@react-three/xr` v6 for WebXR on Android Chrome. iOS Safari has zero WebXR support — AR.js location-based mode or Variant Launch polyfill are workarounds. |

### Recommended research stack (pre-mapping)

| Layer | Library | License |
|-------|---------|---------|
| Map renderer | MapLibre GL JS 5.21.0 | BSD-3 |
| React map bindings | react-map-gl/maplibre | MIT |
| Hex territory overlay | deck.gl H3HexagonLayer 9.2.x | MIT |
| 3D scan scene | React Three Fiber 9.5.0 | MIT |
| R3F ↔ MapLibre bridge | react-three-map | MIT |
| R3F helpers | @react-three/drei | MIT |
| Hex spatial index | h3-js 4.4.0 | Apache-2.0 |
| PostGIS hex extension | h3-pg 4.2.3 | Apache-2.0 |
| State management | Zustand 5.x | MIT |
| Mode transitions | Motion (Framer Motion) | MIT |
| Terrain tiles | AWS Open Data Terrarium | Free |
| Vector tiles | OpenFreeMap | Free |
| Street imagery (optional) | MapillaryJS 4.1.2 | MIT |
| Future AR | @react-three/xr 6.x | MIT |

---

## Gap analysis: research assumptions vs. actual codebase

The research was conducted against the earlier LandGrab implementation plan document, which specified MapLibre GL JS, PostGIS + H3, and Martin tile server. The actual codebase diverges in several ways that matter for a 3D integration.

| Aspect | Research assumed | Actual codebase | Impact |
|--------|-----------------|-----------------|--------|
| Map renderer | MapLibre GL JS (WebGL, vector tiles) | Leaflet.js + PDOK TOP25raster WMS | deck.gl interleaved mode and `react-three-map` require MapLibre's GL context — neither drops into Leaflet |
| Hex system | Uber H3 hexagonal spatial index | Custom axial `(q, r)` coordinates via `HexService` | deck.gl `H3HexagonLayer` won't work; hex rendering must consume `(q, r)` data |
| Hex rendering | Vector tile layers or deck.gl | Canvas-based Leaflet custom layers + SVG overlays | The entire render spine (`GameOverlayLayer → HexTile → tricorderTileState → TroopBadge`) is Leaflet-bound |
| Database | PostgreSQL + PostGIS + h3-pg extension | PostgreSQL 16 + EF Core 8 (Npgsql), no PostGIS | H3 spatial queries not available server-side |
| State management | Zustand | Zustand (`gameStore`, `gameplayStore`, `effectsStore`, `uiStore`) | **Aligns perfectly** — no changes needed |
| Device orientation | Not yet built | `useCompassHeading.ts` exists; full `useDeviceOrientation` + `useDeviceMotion` hooks are designed and spec'd | **Strong alignment** — compass infrastructure is already planned for ability system |
| Terrain data | AWS Terrain Tiles for MapLibre `raster-dem` | No terrain elevation in current stack | Terrain would need to be fetched separately for any 3D view |
| Tile interaction | Click/tap via deck.gl picking or R3F raycasting | `tileInteraction.ts` via Leaflet event system | 3D view needs its own interaction model |

### What aligns well

- **Zustand** as the shared state layer between 2D map and 3D scene — already in place.
- **Device orientation hooks** — `useCompassHeading.ts` already exists, and `useDeviceOrientation.ts` + `useDeviceMotion.ts` are fully spec'd in the compass abilities plan. These feed both ability mechanics and 3D camera control.
- **`DebugSensorPanel`** — already planned for compass ability testing; doubles as desktop fallback for 3D scan mode.
- **Code splitting pattern** — `GameMap`, `PlayingHud`, `GameLobby` are already lazy-loaded. A 3D scan scene fits the same pattern.
- **React Three Fiber** — works independently of the map library. R3F + drei is viable regardless of whether the base map is Leaflet or MapLibre.
- **InstancedMesh rendering** for hex prisms — the research's approach (one draw call for all hexes, per-instance color/transform) applies directly to the `(q, r)` grid data.

### What does not align

- **deck.gl + MapLibre interleaved rendering** — the flagship integration pattern from the research requires MapLibre's WebGL context. Not available with Leaflet.
- **`react-three-map`** — same issue; bridges R3F into MapLibre specifically.
- **H3HexagonLayer** — requires H3 cell indices, not `(q, r)` axial coordinates.
- **3D terrain in the map view** — MapLibre's `raster-dem` source has no Leaflet equivalent.
- **85° pitch near-ground perspective** — Leaflet has no 3D pitch/bearing controls.

---

## Integration strategies

### Strategy A — Leaflet stays, R3F overlays

**Disruption level:** Low
**Approach:** Keep Leaflet as the primary 2D map. Add a React Three Fiber `<Canvas>` as a transparent overlay that renders 3D hex prisms when the player enters scan mode. The existing render spine continues to own the 2D map view.

**How it works:**

1. Player taps a scan button.
2. Leaflet map dims (opacity transition).
3. R3F `<Canvas>` with `background: transparent` and `gl: { alpha: true }` slides in on top.
4. R3F scene renders hex prisms extruded from the existing `(q, r)` grid data, colored by ownership.
5. Device orientation (from the planned `useDeviceOrientation` hook) drives the Three.js camera.
6. The existing `gameStore` and `gameplayStore` Zustand stores feed both renderers.

**Files impacted:**

| File | Change |
|------|--------|
| `components/game/ScanView.tsx` | New — lazy-loaded R3F scene component |
| `components/game/ScanHexGrid.tsx` | New — InstancedMesh hex prism renderer consuming `gameStore.gameState.grid` |
| `hooks/useDeviceOrientation.ts` | Already planned — feeds both abilities and 3D camera |
| `components/game/DebugSensorPanel.tsx` | Already planned — heading/pitch sliders for desktop fallback |
| `stores/uiStore.ts` | Add `viewMode: 'map' | 'scan'` |
| `components/GameView.tsx` | Mount scan view conditionally based on `viewMode` |
| `components/game/PlayingHud.tsx` | Add scan mode toggle button |

**Pros:**

- Zero changes to the map rendering spine (`GameOverlayLayer → HexTile → tricorderTileState → TroopBadge`).
- Zero impact on the tricorder map v2 work, enemy visibility code mapping, or any in-progress ability plans.
- Leaflet uses raster tiles (no WebGL context), so R3F's WebGL context is the only one — no mobile context limit issues.
- Can be built and shipped independently of all other frontend work.

**Cons:**

- Two separate visual worlds with no spatial continuity (no smooth zoom from 2D map into 3D).
- No real-world terrain elevation or 3D buildings in the scan view.
- Hex interaction in 3D needs its own raycasting logic separate from `tileInteraction.ts`.

**Effort:** Medium.

---

### Strategy B — Migrate map to MapLibre, unlock full 3D

**Disruption level:** High
**Approach:** Replace Leaflet with MapLibre GL JS as the primary map renderer. This unlocks native 3D terrain, 3D building extrusion, and the shared-WebGL-context architecture from the research.

**What changes:**

| Current | After migration |
|---------|-----------------|
| `GameMap.tsx` with Leaflet | `GameMap.tsx` with `react-map-gl/maplibre` |
| Canvas/SVG hex layers | deck.gl `GeoJsonLayer` with extrusion or `react-three-map` R3F components |
| PDOK WMS raster tiles | PDOK BRT Achtergrondkaart vector tiles or OpenFreeMap vector tiles |
| `L.svgOverlay` hex rendering | MapLibre `fill-extrusion` layer or deck.gl polygon layer |
| `L.circleMarker` for global map | MapLibre circle layer or deck.gl `ScatterplotLayer` |
| No terrain | AWS Terrarium `raster-dem` source → `map.setTerrain()` |
| No pitch/bearing | MapLibre `maxPitch: 85`, bearing from device orientation |

**What stays the same:**

- `tricorderTileState.ts` derivation logic — pure data, renderer-agnostic.
- All Zustand stores and their contracts.
- All hooks (`useSignalR`, `useSignalRHandlers`, `useGameActions` hierarchy).
- All backend code — zero backend changes.
- The compass abilities implementation plan — `useDeviceOrientation` feeds MapLibre's camera the same way.
- The `(q, r)` hex coordinate system and `HexService` math — deck.gl can render arbitrary GeoJSON polygons, so H3 adoption is not required.

**Leaflet-specific code requiring reimplementation:**

- `components/map/GameMap.tsx` — full rewrite
- `components/map/layers/GameOverlayLayer.tsx` — rewrite as deck.gl or MapLibre layers
- `components/map/HexTile.tsx` — rewrite (possibly as deck.gl sublayer or R3F component)
- `components/map/layers/PlayerLayer.tsx` — rewrite as MapLibre marker layer
- `components/map/layers/EffectsLayer.tsx` — rewrite
- `components/map/WorldDimMask.tsx` — rewrite as MapLibre layer
- `components/map/HexTooltipOverlay.tsx` — rewrite
- `components/map/TroopBadge.tsx` — rewrite or adapt for deck.gl rendering
- `components/game/map/hexRendering.ts` — adapt for MapLibre/deck.gl styling model
- `components/map/HexMath.ts` — `(q, r)` ↔ pixel math changes for MapLibre's coordinate system

**Pros:**

- Single WebGL context for map + hex overlay + 3D scene.
- Native 3D terrain with real elevation.
- 85° pitch + device orientation = convincing near-ground perspective without leaving the map.
- deck.gl `GeoJsonLayer` renders `(q, r)` hex polygons with extrusion, per-hex colors, and picking — no H3 adoption needed.
- Long-term foundation for AR integration via `react-three-map` + `@react-three/xr`.

**Cons:**

- Significant frontend rework — every Leaflet-specific component needs reimplementation.
- Risk of introducing regressions in hex interaction, tooltip behavior, and visual state.
- PDOK vector tile compatibility needs verification (PDOK serves Mapbox Vector Tiles for their BRT Achtergrondkaart, but schema and styling differ from OpenMapTiles).

**Effort:** High. Likely a multi-week initiative on its own.

---

### Strategy C — Standalone R3F scan scene (recommended for now)

**Disruption level:** Very low
**Approach:** Build the 3D hex scan view as a completely standalone React Three Fiber scene that does not touch the map. When a player activates scan mode, the map hides and a full-screen R3F scene renders the hex battlefield in 3D.

**How it works:**

1. Player activates scan mode (button in `PlayingHud`, or potentially gated as a Scout ability).
2. Leaflet map hides via CSS (`opacity: 0`, `pointer-events: none`) — **not** unmounted.
3. R3F `<Canvas>` renders full-screen with a hex-prism grid.
4. Grid data sourced from `gameStore.gameState.grid` — same data, different visual.
5. Device orientation from `useDeviceOrientation` drives camera rotation.
6. Device pitch from `useDeviceMotion` optionally controls camera tilt.
7. Tap on hex prism → raycasted `instanceId` → mapped to `(q, r)` → game action via `useGameActions`.
8. Player exits scan mode → R3F canvas hides → Leaflet map restores.

**Hex geometry conversion:**

The existing `HexMath.ts` provides `(q, r)` → pixel coordinates. For R3F, convert to 3D world positions:

```typescript
// Flat-top hex: same math as HexMath, but Y-up in Three.js
function hexToWorld(q: number, r: number, size: number): [number, number, number] {
  const x = size * 1.5 * q;
  const z = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
  return [x, 0, z]; // y = 0 (ground plane), or terrain elevation if available
}
```

**Hex prism rendering (InstancedMesh):**

```tsx
// Pseudocode — single draw call for all hexes
const hexGeometry = new CylinderGeometry(hexRadius, hexRadius, 1, 6);
const count = Object.keys(grid).length;

// In useFrame:
Object.values(grid).forEach((cell, i) => {
  const [x, , z] = hexToWorld(cell.q, cell.r, tileSize);
  tempObject.position.set(x, cell.troops * 0.1, z); // height = troop count
  tempObject.updateMatrix();
  meshRef.current.setMatrixAt(i, tempObject.matrix);
  meshRef.current.setColorAt(i, ownerColor(cell));
});
meshRef.current.instanceMatrix.needsUpdate = true;
```

**Files impacted:**

| File | Change | Notes |
|------|--------|-------|
| `components/game/ScanView.tsx` | **New** | Lazy-loaded R3F scene, full-screen |
| `components/game/scan/HexPrismGrid.tsx` | **New** | InstancedMesh hex rendering from `gameStore` grid |
| `components/game/scan/ScanCamera.tsx` | **New** | Device orientation-driven camera controller |
| `components/game/scan/ScanHUD.tsx` | **New** | Minimal overlay UI (exit button, hex info on tap) |
| `hooks/useDeviceOrientation.ts` | Already planned | Feeds camera rotation |
| `hooks/useDeviceMotion.ts` | Already planned | Feeds camera tilt (optional) |
| `components/game/DebugSensorPanel.tsx` | Already planned | Desktop fallback for heading/pitch |
| `stores/uiStore.ts` | Minor addition | `viewMode: 'map' \| 'scan'` state |
| `stores/gameplayStore.ts` | Minor addition | `scanSelectedHexKey: string \| null` |
| `components/game/PlayingHud.tsx` | Minor addition | Scan mode toggle button |
| `components/GameView.tsx` | Minor addition | Conditional rendering of `ScanView` |
| `App.tsx` | No change | Existing lazy-loading pattern handles code splitting |

**Synergy with compass abilities plan:**

| Compass abilities work | Reused by 3D scan mode |
|------------------------|------------------------|
| `useDeviceOrientation` hook (Step 1.6) | Camera heading control |
| `useDeviceMotion` hook (Step 1.7) | Camera pitch control |
| `DebugSensorPanel` (Step 1.10) | Desktop heading/pitch override |
| `CurrentHeading` propagation (Step 1.5) | Player facing indicator in 3D scene |
| Heading through `UpdatePlayerLocation` (Step 1.8) | Scan mode can update heading while active |
| `BeaconHeading` + sector visualization (Phase 2) | Render beacon sector as 3D wedge in scan view |

**Pros:**

- Zero disruption to the existing map rendering spine.
- Zero impact on tricorder map v2 work, enemy visibility, or in-progress ability plans.
- Piggybacks on compass sensor infrastructure already being built.
- Can be built, tested, and shipped independently.
- Natural fit for the scouting theme — physical scan mechanic.
- Code-split as a lazy chunk, so zero bundle impact when not used.
- Single WebGL context (Leaflet is raster, no GL).

**Cons:**

- No real-world terrain or buildings — stylized game view only.
- No spatial continuity between 2D map and 3D scene (they are separate worlds).
- Hex interaction needs separate raycasting logic (R3F `onClick` with `instanceId`).

**Effort:** Low-to-medium. ~1-2 weeks for a functional prototype, assuming compass hooks are already landed.

---

## Recommendation

**Ship Strategy C now. Plan Strategy B as a future milestone.**

### Why Strategy C first

1. **It piggybacks on work already in flight.** The `useDeviceOrientation` hook, `DebugSensorPanel`, and heading propagation through `UpdatePlayerLocation` are all being built for compass abilities. The 3D scan mode is just another consumer of that sensor data.

2. **It fits the target audience.** A scout holding up their phone to scan the hex battlefield in 3D is exactly the kind of physical engagement that scouting groups and 7–18 year olds respond to. It could even be gated as a Scout role ability for added thematic coherence.

3. **It doesn't block anything.** The tricorder tile state system, enemy visibility tiers, ability UX flows — all continue on the Leaflet map. The 3D view is purely additive.

4. **It validates the rendering approach.** Building a standalone R3F hex scene proves out InstancedMesh performance, device orientation camera control, and Zustand-driven rendering — all of which transfer directly to a future MapLibre-integrated build.

### Why Strategy B later

MapLibre migration is the right long-term direction for several reasons:

- Native 3D terrain with real elevation data.
- Single shared WebGL context for map + overlays + 3D content.
- 85° pitch for near-ground perspective without leaving the map view.
- deck.gl integration for high-performance hex rendering.
- Foundation for WebXR/AR integration.

But it's a substantial rewrite of the frontend map stack. It should be a dedicated initiative, not bundled with the 3D scan feature.

### Suggested implementation order

1. **Land compass abilities Phase 1** (shared heading infrastructure) — this is a prerequisite.
2. **Build Strategy C scan mode** — standalone R3F scene, device orientation camera, hex prism grid.
3. **Playtest and iterate** on the scan mode UX with real users.
4. **Plan MapLibre migration** (Strategy B) as a separate workstream when the 3D direction is validated.

---

## Technical notes from the research

### Mobile performance budget

Target 30 fps sustained on mid-range 2023 Android devices.

- Cap `devicePixelRatio` at `Math.min(window.devicePixelRatio, 2)`.
- Use `InstancedMesh` for all hex rendering — one draw call for the entire grid.
- Use drei's `<PerformanceMonitor>` and `<AdaptiveDpr>` for automatic quality scaling.
- Pause device orientation listeners when not in scan mode (battery).
- For an Alliances game (217 hexes), InstancedMesh handles this trivially. For Free-for-All (potentially thousands of hexes), LOD and frustum culling become important.

### Mode transition pattern

Never unmount the Leaflet map or the R3F canvas between mode switches — reconstruction is expensive and causes flicker. Instead:

- Keep both mounted.
- Use CSS `opacity` + `pointer-events` to swap visibility.
- Use Motion (Framer Motion) `AnimatePresence` for smooth crossfade transitions.

### WebGL context safety

Leaflet with WMS raster tiles does **not** use a WebGL context. This means the R3F canvas is the only WebGL context in Strategy C — no mobile context limit issues.

If the codebase ever adds `leaflet-maplibre-gl` or another GL-based Leaflet plugin, this assumption breaks and context management becomes critical.

### Free terrain data for future use

| Source | Encoding | Coverage | Cost | Notes |
|--------|----------|----------|------|-------|
| AWS Terrain Tiles | Terrarium PNG | Global, ~30 m | Free (Open Data) | No auth, no rate limits |
| Protomaps Mapterhorn | PMTiles | Global | Free (self-host) | Single-file archive, any static storage |
| SRTM via OpenTopography | GeoTIFF | Global, 30 m | Free (NASA) | Requires processing for web use |

### Street-level imagery (optional, future)

| Service | License | Coverage | Notes |
|---------|---------|----------|-------|
| Mapillary | MIT (viewer), CC-BY-SA (images) | Global, crowdsourced | Strong urban, sparse rural. Free since Meta acquisition. |
| Panoramax | CC-BY-SA 4.0 | European focus | 74M+ images, federated, backed by French IGN and OSM France. |

### Future AR path

The R3F scan scene built in Strategy C is AR-ready in architecture:

- `@react-three/xr` v6 wraps the R3F scene for WebXR `immersive-ar` on Android Chrome.
- iOS Safari has zero WebXR support as of March 2026. Workarounds: AR.js location-based mode (`getUserMedia` + `DeviceOrientation`) or Variant Launch polyfill (native AR tracking via iOS App Clips, free).
- H3 hex positions can translate to real-world GPS coordinates for geo-anchored AR content.

---

## Appendix: npm packages referenced

All packages below are free and open-source.

| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| `@react-three/fiber` | 9.5.0+ | React renderer for Three.js | MIT |
| `@react-three/drei` | latest | R3F helpers (Instances, AdaptiveDpr, PerformanceMonitor) | MIT |
| `three` | r169+ | 3D rendering engine | MIT |
| `framer-motion` | latest | Mode transition animations | MIT |
| `maplibre-gl` | 5.21.0+ | Future map renderer (Strategy B) | BSD-3 |
| `react-map-gl` | latest | React bindings for MapLibre (Strategy B) | MIT |
| `deck.gl` | 9.2+ | High-performance data visualization layers (Strategy B) | MIT |
| `h3-js` | 4.4.0 | Hexagonal spatial index (not needed for Strategy C) | Apache-2.0 |
| `react-three-map` | latest | R3F inside MapLibre GL context (Strategy B) | MIT |
| `@react-three/xr` | 6.x | WebXR integration (future AR) | MIT |
