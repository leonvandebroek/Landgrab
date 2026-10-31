# Radar Wipe Scanning Effect — Visual Specification

**Author:** Hals (Designer/UX)  
**For:** Vermeer (Frontend Engineer)  
**Status:** Ready for implementation  
**Date:** 2026-07

---

## Overview

A classic radar-scope sweep effect emanating from the player's current GPS position. A bright arm rotates clockwise, dragging a phosphor comet tail that fades over 120°. The effect sits in a dedicated canvas layer between the hex SVG overlay and the player marker, giving the impression that the scanner is illuminating the terrain below the player's position.

---

## 1. Animation Style

### Sweep Arm
A radial line from origin to the edge of the scan radius. The leading edge is a sharp, bright stroke — no taper. The arm rotates clockwise.

### Comet Tail
An arc that fills the 120° sector immediately behind the arm. Alpha decays linearly (or with a slight ease-in curve) from full brightness at the arm to transparent at the 120° trailing edge:

```
alpha(θ) = max(0, 0.55 × (1 - θ / 120°))
```

The tail is rendered as a filled arc (canvas `arc()` sweep), not a stroke, using a `CanvasGradient` keyed to the sweep angle. Redraw the gradient each frame — it only takes ~1ms.

### Sweep Speed
| Game state | RPM | Period |
|---|---|---|
| **Normal play** | 4 RPM | 15 s / revolution |
| **Active raid on a nearby hex** | 6 RPM | 10 s / revolution |
| **Paused / spectator** | 1.5 RPM | 40 s / revolution |

Speed transitions: lerp the angular velocity over 1.5 seconds when the game state changes — no instant jumps.

### Center Origin Pulse
A soft radial glow at (cx, cy) that breathes in sync with the sweep arm passing 0° (true north). On each pass, the glow briefly flares to full intensity and decays over 2 seconds. Implemented as a `radialGradient` scaled by a `glowFactor` driven by `sin()` of elapsed time since last revolution.

---

## 2. Color Palette

All values are aligned with existing tricorder tokens.

| Element | Value | Token reference |
|---|---|---|
| **Sweep arm** | `rgba(0, 243, 255, 0.90)` | `--color-phosphor-cyan` |
| **Arm glow bloom** | `rgba(0, 243, 255, 0.30)` drawn at 3× arm width behind | — |
| **Comet tail (start, at arm)** | `rgba(0, 243, 255, 0.55)` | — |
| **Comet tail (end, 120° back)** | `rgba(0, 243, 255, 0.00)` | — |
| **Outer ring** | `rgba(120, 190, 255, 0.18)` | `--scanner-blue-faint` |
| **Origin glow (resting)** | `rgba(0, 255, 170, 0.35)` | `--status-gps` |
| **Origin glow (flare at 0°)** | `rgba(0, 255, 170, 0.75)` | `--status-gps` |
| **Scan-freshened hex tint** | not painted by radar — see note below | — |

> **Hex tint note:** The radar does _not_ paint a "fresh scan" tint on individual hexes — that would require reading hex geometry in the radar layer and coupling it too tightly to the game model. The sweep arm passing over a hex is sufficient visual feedback. If a "freshly scanned" hex highlight is ever needed, it should be a separate layer concern driven by `TricorderTileState.visibilityTier`.

### Canvas Blending Mode

Use `globalCompositeOperation = 'screen'` for the comet tail fill and arm stroke. `screen` adds light on dark backgrounds without washing out bright-color overlaid hexes, matching how the existing `mix-blend-mode: screen` is used on fort hatching and CRT glow elements.

Use `globalCompositeOperation = 'source-over'` for the outer ring (it should not glow additively — it's a subtle reference circle).

Draw order per frame:
1. Clear the entire canvas (`clearRect`)  
2. Outer ring — `source-over`, very low alpha  
3. Comet tail arc — `screen`, gradient fill  
4. Sweep arm — `screen`, bright stroke  
5. Arm bloom pass — `screen`, wide stroke at 30% alpha  
6. Origin glow — `screen`, radialGradient

---

## 3. Scale & Radius

### Scan radius
Express the radius in **map layer pixels** (not CSS pixels, not meters), so it scales naturally with zoom.

```ts
// Compute at render time
const SCAN_RADIUS_METERS = 600; // 600m real-world radius
const origin = map.latLngToLayerPoint([playerLat, playerLng]);
const edgeLatLng = computeOffsetLatLng(playerLat, playerLng, SCAN_RADIUS_METERS);
const edgePoint = map.latLngToLayerPoint(edgeLatLng);
const radiusPx = origin.distanceTo(edgePoint);
```

`computeOffsetLatLng` shifts north by `SCAN_RADIUS_METERS` using the Haversine approximation — a simple `lat += meters / 111320` is accurate enough for 600m.

**600m** is chosen because:
- At zoom 15 (tactical view), 600m ≈ 480px — fills roughly half the viewport width
- At zoom 13 (strategic view), 600m ≈ 120px — provides a tight local pulse rather than a full-screen sweep, which keeps strategic view readable
- At zoom 17 (detailed), 600m ≈ 1900px — clips naturally at the canvas edge

### Clipping
The canvas element is sized to the map container. Any arc geometry that extends beyond the canvas edge clips automatically — no explicit clipping path needed.

### Viewport scaling
Do **not** use a fixed pixel radius. Recompute from `SCAN_RADIUS_METERS` each time the map fires `zoomend` or `moveend`. Store the computed `radiusPx` in a ref and invalidate it via Leaflet's standard projection change events (same pattern as `EffectsLayer` and `GameOverlayLayer`).

---

## 4. Layering

### Pane order

| Pane | z-index | Contents |
|---|---|---|
| Basemap tiles | 200 | Leaflet tile layers |
| `overlayPane` | 400 | Leaflet default overlays |
| `game-map-hex-pane` | 450 | Hex SVG overlay (hexes, fog, contested edges) |
| **`game-map-radar-pane`** | **540** | **Radar canvas** |
| `game-map-player-pane` | 650 | Player markers |

Create the pane in `GameMap.tsx` alongside the existing hex and player pane registrations:

```ts
const radarPane = map.createPane(RADAR_LAYER_PANE); // 'game-map-radar-pane'
radarPane.style.zIndex = '540';
radarPane.style.pointerEvents = 'none';
if (rotatePane) {
  rotatePane.appendChild(radarPane);
}
```

By inserting the radar pane between hex tiles and player markers:
- The sweep passes **over** the hex overlay (fog-of-war, contested edges, tile details)
- Player position marker stays always-on-top — the "source" of the scan is always readable
- The effect reads as terrain being illuminated from above the player

### Canvas element positioning
The canvas should cover the entire map container, sized to `map.getSize()`. Reposition/resize it on `resize` events. Use `position: absolute; top: 0; left: 0` within the radar pane div.

---

## 5. Performance

### Frame loop

```ts
let lastFrameTime = 0;
const TARGET_FRAME_MS = 1000 / 30; // 30 fps cap

function tick(now: DOMHighResTimeStamp) {
  frameHandle = requestAnimationFrame(tick);
  if (now - lastFrameTime < TARGET_FRAME_MS) return;
  lastFrameTime = now;
  drawFrame(now);
}
```

**30 fps** is appropriate because:
- The sweep arm moves ~1.44°/frame at 30fps / 4 RPM — imperceptibly smooth to human eyes
- It halves GPU compositing pressure vs 60fps for a purely ambient effect
- Battery savings matter on mobile (this is a GPS game played outdoors)

### Canvas size management
Size the canvas to `devicePixelRatio × cssWidth` for crisp rendering on HiDPI screens, but clamp `devicePixelRatio` to 2 — no benefit beyond 2× for this blurry glow effect.

```ts
const dpr = Math.min(window.devicePixelRatio, 2);
canvas.width = containerWidth * dpr;
canvas.height = containerHeight * dpr;
ctx.scale(dpr, dpr);
```

### Layer projection
Convert player lat/lng to canvas coordinates each frame using `map.latLngToLayerPoint()`. This is a cheap matrix multiply — no concern.

The only expensive per-frame allocation is the `CanvasGradient` for the comet tail. Creating a new `createConicalGradient` equivalent via a `conic-gradient` fill is not supported natively in canvas. Use the wedge-fill approach:

```ts
// Fill the comet tail as a pie slice
ctx.beginPath();
ctx.moveTo(cx, cy);
ctx.arc(cx, cy, radiusPx, tailStartAngle, sweepAngle);
ctx.closePath();
// Set fill as a radial gradient from origin (0.55 alpha) to edge (0 alpha)
const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
grad.addColorStop(0, 'rgba(0, 243, 255, 0.55)');
grad.addColorStop(1, 'rgba(0, 243, 255, 0.00)');
ctx.fillStyle = grad;
ctx.fill();
```

The angular decay (brighter at arm, fading at tail) is achieved by sorting draw order: after filling the full 120° wedge, overdraw a second, narrower wedge from the arm position at higher alpha to simulate the angular falloff. Two fills of a simple arc is less overhead than computing a per-pixel angular alpha.

### Cleanup
Cancel `requestAnimationFrame` and remove the canvas from the pane on component unmount.

---

## 6. Accessibility & UX

### `prefers-reduced-motion`

The layer must check this media query on mount and skip all animation when it matches:

```ts
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) return; // don't start the RAF loop
```

Also listen for changes (rare but possible mid-session if the user changes OS settings):

```ts
const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
mql.addEventListener('change', handleMotionPrefChange);
```

### Layer toggle

Add `radarSweep: boolean` to `MapLayerPreferences` (default `true`). Wire it into the existing layer panel. The radar canvas layer should read this preference from the store and pause/resume the RAF loop accordingly.

Suggested layer panel label: **"Radar sweep"** — no i18n key listed here; Vermeer should follow the existing `t('layerPanel.*')` naming pattern.

### Opt-out persistence
The layer preference should persist with the same mechanism as other layer prefs (already handled by the existing `layerPrefs` localStorage pattern in `GameMap.tsx`).

---

## 7. CSS

The canvas element itself uses no CSS classes for visual styling — all visual logic is imperative canvas draws.

The one CSS addition needed is for the pane container:

```css
/* In index.css or overrides.css */
.leaflet-game-map-radar-pane {
  pointer-events: none;
  /* No other styles needed — zIndex is set imperatively in GameMap.tsx */
}
```

If a future "scanning…" status chip in the HUD is needed (outside scope of this spec), use these tokens:

```css
.radar-status-chip {
  font-family: var(--font-scifi-mono);
  color: var(--color-phosphor-cyan);
  text-shadow: var(--crt-glow-text-cyan);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  animation: radar-blink 1.5s ease-in-out infinite;
}

@keyframes radar-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

---

## Implementation Checklist (for Vermeer)

- [ ] Create `RadarSweepLayer.tsx` in `frontend/landgrab-ui/src/components/map/layers/`
- [ ] Register `game-map-radar-pane` at z-index 540 in `GameMap.tsx`
- [ ] Add `radarSweep: boolean` to `MapLayerPreferences` and `DEFAULT_MAP_LAYER_PREFS`
- [ ] Add layer toggle to layer panel (i18n key: `layerPanel.radarSweep`)
- [ ] Honour `prefers-reduced-motion` — no animation when set
- [ ] 30fps cap via `lastFrameTime` guard
- [ ] `devicePixelRatio` clamped to 2
- [ ] Recompute radius px on `zoomend` / `moveend`
- [ ] Cancel RAF and remove canvas on unmount
- [ ] Read player position from `usePlayerLayerStore` (already stores `currentLocation`)

---

## Open Design Questions

1. **Should the sweep origin offset slightly toward the player's heading?** (i.e. the scan leads in the direction they're moving) — Nice detail but requires heading data. Defer unless GPS heading is already available.
2. **Multiple players in same room** — Should each player see only their own radar? Yes — the effect is personal GPS feedback, not a shared game event.
3. **FFA mode** — Same spec applies. Global map uses real GPS coordinates, which map directly to Leaflet lat/lng — no changes needed.
