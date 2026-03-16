import { useEffect, useMemo, useRef, useState } from 'react';
import type { HexCell, AllianceDto } from '../../types/game';
import { renderMiniMap } from '../../utils/miniMapRenderer';

interface Props {
  grid: Record<string, HexCell>;
  myUserId: string;
  alliances: AllianceDto[];
  mapLat: number;
  mapLng: number;
  tileSizeMeters: number;
  mainMapBounds: { north: number; south: number; east: number; west: number } | null;
  onNavigate?: (lat: number, lng: number) => void;
}

const CSS_W = 200;
const CSS_H = 150;

/** Convert Leaflet lat/lng bounds into the axial-pixel coordinate space used by renderMiniMap.
 *  Uses fractional (unrounded) q/r so the viewport rectangle tracks panning smoothly. */
function latLngBoundsToAxialPixel(
  bounds: { north: number; south: number; east: number; west: number },
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number,
): { north: number; south: number; east: number; west: number } {
  const sqrt3 = Math.sqrt(3);
  const METERS_PER_DEG_LAT = 111_320;
  /** Fractional axial-pixel without hexRound so the rectangle tracks smoothly. */
  const toAxial = (lat: number, lng: number) => {
    const yMeters = (lat - mapLat) * METERS_PER_DEG_LAT;
    const cosLat = Math.cos((mapLat * Math.PI) / 180);
    // clamp cosLat to avoid division-by-zero singularity near the poles
    const xMeters = (lng - mapLng) * METERS_PER_DEG_LAT * Math.max(Math.abs(cosLat), 1e-9);
    const q = ((2 / 3) * xMeters) / tileSizeMeters;
    const r = ((-1 / 3) * xMeters + (Math.sqrt(3) / 3) * yMeters) / tileSizeMeters;
    return { px: q * 1.5, py: (r + q * 0.5) * sqrt3 };
  };
  // Project all four corners to handle skewed grids
  const nw = toAxial(bounds.north, bounds.west);
  const ne = toAxial(bounds.north, bounds.east);
  const sw = toAxial(bounds.south, bounds.west);
  const se = toAxial(bounds.south, bounds.east);
  return {
    north: Math.max(nw.py, ne.py, sw.py, se.py),
    south: Math.min(nw.py, ne.py, sw.py, se.py),
    east: Math.max(nw.px, ne.px, sw.px, se.px),
    west: Math.min(nw.px, ne.px, sw.px, se.px),
  };
}

export function MiniMap({
  grid,
  myUserId,
  alliances,
  mapLat,
  mapLng,
  tileSizeMeters,
  mainMapBounds,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(() => window.innerWidth >= 480);

  useEffect(() => {
    const handleResize = () => setVisible(window.innerWidth >= 480);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Memoize HQ hexes so the useEffect dependency stays stable across renders
  const hqHexes = useMemo(
    () =>
      alliances
        .filter((a): a is AllianceDto & { hqHexQ: number; hqHexR: number } =>
          a.hqHexQ != null && a.hqHexR != null,
        )
        .map((a) => ({ q: a.hqHexQ, r: a.hqHexR, color: a.color })),
    [alliances],
  );

  // ── Render canvas on data changes ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = CSS_W * dpr;
    canvas.height = CSS_H * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Convert Leaflet lat/lng bounds to axial-pixel space expected by renderMiniMap
    const axialBounds = mainMapBounds
      ? latLngBoundsToAxialPixel(mainMapBounds, mapLat, mapLng, tileSizeMeters)
      : null;

    renderMiniMap(ctx, CSS_W, CSS_H, {
      grid,
      viewportBounds: axialBounds,
      myUserId,
      hqHexes,
    });
  }, [grid, mainMapBounds, mapLat, mapLng, tileSizeMeters, visible, myUserId, hqHexes]);

  if (!visible) {
    return null;
  }

  return (
    <div className="mini-map-container minimap--decorative" aria-hidden="true">
      <canvas
        ref={canvasRef}
        className="minimap--decorative"
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      />
    </div>
  );
}
