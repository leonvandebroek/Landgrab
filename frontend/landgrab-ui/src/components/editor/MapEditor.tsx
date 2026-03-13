import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { HexCoordinate } from '../../types/game';
import {
  hexToPixel,
  hexCornerPoints,
  hexSpiral,
  hexKey,
} from '../map/HexMath';

// ── Constants ────────────────────────────────────────────────────────
const GRID_RADIUS = 12;
const HEX_SIZE = 30; // visual render size in SVG units
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.0;

// ── Props ────────────────────────────────────────────────────────────
interface MapEditorProps {
  coordinates: HexCoordinate[];
  onCoordinatesChange: (coords: HexCoordinate[]) => void;
  tileSizeMeters: number;
}

// ── Types ────────────────────────────────────────────────────────────
interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HexDatum {
  key: string;
  points: string;
}

function toCoordArray(keys: Set<string>): HexCoordinate[] {
  return Array.from(keys).map((k) => {
    const [q, r] = k.split(',').map(Number);
    return { q, r };
  });
}

function toKeySet(coords: HexCoordinate[]): Set<string> {
  return new Set(coords.map((c) => hexKey(c.q, c.r)));
}

// ── Component ────────────────────────────────────────────────────────
export function MapEditor({
  coordinates,
  onCoordinatesChange,
}: MapEditorProps) {
  // Pre-compute every hex position in the spiral grid (stable across renders)
  const gridHexes = useMemo(() => hexSpiral(GRID_RADIUS), []);

  const hexData: HexDatum[] = useMemo(
    () =>
      gridHexes.map(([q, r]) => {
        const [cx, cy] = hexToPixel(q, r, HEX_SIZE);
        return { key: hexKey(q, r), points: hexCornerPoints(cx, cy, HEX_SIZE) };
      }),
    [gridHexes],
  );

  // Default viewBox computed from grid bounds
  const defaultVB = useMemo<ViewBox>(() => {
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    for (const [q, r] of gridHexes) {
      const [x, y] = hexToPixel(q, r, HEX_SIZE);
      if (x - HEX_SIZE < minX) minX = x - HEX_SIZE;
      if (x + HEX_SIZE > maxX) maxX = x + HEX_SIZE;
      if (y - HEX_SIZE < minY) minY = y - HEX_SIZE;
      if (y + HEX_SIZE > maxY) maxY = y + HEX_SIZE;
    }
    const pad = HEX_SIZE * 2;
    return {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + 2 * pad,
      height: maxY - minY + 2 * pad,
    };
  }, [gridHexes]);

  // ── State ────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(() => toKeySet(coordinates));
  const [viewBox, setViewBox] = useState<ViewBox>(defaultVB);

  // Keep ref in sync so non-React event handlers see the latest value
  const viewBoxRef = useRef<ViewBox>(defaultVB);
  useEffect(() => {
    viewBoxRef.current = viewBox;
  }, [viewBox]);

  // ── Refs for DOM elements ────────────────────────
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Interaction refs (mutated during drag, no re-renders) ──
  const paintState = useRef({ active: false, adding: true, lastKey: '' });
  const panState = useRef({
    active: false,
    startX: 0,
    startY: 0,
    vbX: 0,
    vbY: 0,
    vbW: 0,
    vbH: 0,
  });

  // ── Sync parent coords → internal Set when parent pushes new coordinates
  //    (e.g. load a different template, or clear all)
  //    Uses React's recommended "adjusting state during render" pattern
  //    instead of useEffect to avoid cascading renders.
  const [prevCoordinates, setPrevCoordinates] = useState(coordinates);
  if (coordinates !== prevCoordinates) {
    setPrevCoordinates(coordinates);
    setSelected(toKeySet(coordinates));
  }

  // ── Notify parent whenever internal selection changes ──────
  const onChangeRef = useRef(onCoordinatesChange);
  useEffect(() => {
    onChangeRef.current = onCoordinatesChange;
  }, [onCoordinatesChange]);
  const prevSerializedRef = useRef('');

  useEffect(() => {
    const serialized = Array.from(selected).sort().join('|');
    if (serialized === prevSerializedRef.current) return;
    prevSerializedRef.current = serialized;
    onChangeRef.current(toCoordArray(selected));
  }, [selected]);

  // ── Global mouse listeners (pan drag + release) ────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panState.current.active || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const { startX, startY, vbX, vbY, vbW, vbH } = panState.current;
      const dx = (e.clientX - startX) * (vbW / rect.width);
      const dy = (e.clientY - startY) * (vbH / rect.height);
      setViewBox((prev) => ({ ...prev, x: vbX - dx, y: vbY - dy }));
    };

    const onUp = () => {
      paintState.current.active = false;
      panState.current.active = false;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      paintState.current.active = false;
      panState.current.active = false;
    };
  }, []);

  // ── Non-passive wheel handler for zoom ─────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg || paintState.current.active) return;

      const rect = svg.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;

      setViewBox((prev) => {
        const nw = prev.width * factor;
        const nh = prev.height * factor;
        if (nw < defaultVB.width * MIN_ZOOM || nw > defaultVB.width * MAX_ZOOM)
          return prev;
        return {
          x: prev.x + (prev.width - nw) * mx,
          y: prev.y + (prev.height - nh) * my,
          width: nw,
          height: nh,
        };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [defaultVB]);

  // ── Hex interaction: mousedown starts paint ────────────────
  const onHexDown = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected((prev) => {
      const adding = !prev.has(key);
      paintState.current = { active: true, adding, lastKey: key };
      const next = new Set(prev);
      if (adding) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // ── Hex interaction: mouseenter continues paint ────────────
  const onHexEnter = useCallback((key: string) => {
    const ps = paintState.current;
    if (!ps.active || key === ps.lastKey) return;
    ps.lastKey = key;
    setSelected((prev) => {
      // Skip no-op to avoid unnecessary renders
      if (ps.adding && prev.has(key)) return prev;
      if (!ps.adding && !prev.has(key)) return prev;
      const next = new Set(prev);
      if (ps.adding) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  // ── SVG background mousedown starts pan ────────────────────
  const onBgDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('.map-editor-hex')) return;
    e.preventDefault();
    const vb = viewBoxRef.current;
    panState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      vbX: vb.x,
      vbY: vb.y,
      vbW: vb.width,
      vbH: vb.height,
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────
  const vbStr = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

  return (
    <div ref={containerRef} className="map-editor-canvas">
      <svg
        ref={svgRef}
        viewBox={vbStr}
        className="map-editor-svg"
        onMouseDown={onBgDown}
      >
        {hexData.map((h) => (
          <polygon
            key={h.key}
            points={h.points}
            className={`map-editor-hex ${
              selected.has(h.key)
                ? 'map-editor-hex--selected'
                : 'map-editor-hex--empty'
            }`}
            onMouseDown={(e) => onHexDown(h.key, e)}
            onMouseEnter={() => onHexEnter(h.key)}
          />
        ))}
      </svg>
    </div>
  );
}

