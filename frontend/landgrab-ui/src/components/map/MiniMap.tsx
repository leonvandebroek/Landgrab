import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HexCell, AllianceDto } from '../../types/game';
import { renderMiniMap } from '../../utils/miniMapRenderer';
import { roomHexToLatLng } from './HexMath';

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
const PADDING = 12;

export function MiniMap({
  grid,
  myUserId,
  alliances,
  mapLat,
  mapLng,
  tileSizeMeters,
  mainMapBounds,
  onNavigate,
}: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(() => window.innerWidth >= 480);

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

    renderMiniMap(ctx, CSS_W, CSS_H, {
      grid,
      viewportBounds: mainMapBounds,
      myUserId,
      hqHexes,
    });
  }, [grid, mainMapBounds, visible, myUserId, hqHexes]);

  // ── Click-to-navigate: reverse-map canvas pixel → hex (q,r) → lat/lng ──
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onNavigate) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      // CSS-pixel click position (matches the CSS_W × CSS_H render space)
      const clickX = ((e.clientX - rect.left) / rect.width) * CSS_W;
      const clickY = ((e.clientY - rect.top) / rect.height) * CSS_H;

      // Reconstruct the same bounding-box & scale used by renderMiniMap
      const cells = Object.values(grid);
      if (cells.length === 0) return;

      const sqrt3 = Math.sqrt(3);
      let minPx = Infinity, maxPx = -Infinity;
      let minPy = Infinity, maxPy = -Infinity;

      for (const cell of cells) {
        const px = cell.q * 1.5;
        const py = (cell.r + cell.q * 0.5) * sqrt3;
        if (px < minPx) minPx = px;
        if (px > maxPx) maxPx = px;
        if (py < minPy) minPy = py;
        if (py > maxPy) maxPy = py;
      }

      const rangeX = maxPx - minPx || 1;
      const rangeY = maxPy - minPy || 1;
      const availW = CSS_W - PADDING * 2;
      const availH = CSS_H - PADDING * 2;
      const scale = Math.min(availW / rangeX, availH / rangeY);
      const offsetX = (CSS_W - rangeX * scale) / 2;
      const offsetY = (CSS_H - rangeY * scale) / 2;

      // Reverse: canvas pixel → axial-pixel → hex q,r
      const hexPx = (clickX - offsetX) / scale + minPx;
      const hexPy = maxPy - (clickY - offsetY) / scale;
      const q = hexPx / 1.5;
      const r = hexPy / sqrt3 - q * 0.5;
      const roundedQ = Math.round(q);
      const roundedR = Math.round(r);

      const [lat, lng] = roomHexToLatLng(roundedQ, roundedR, mapLat, mapLng, tileSizeMeters);
      onNavigate(lat, lng);
    },
    [onNavigate, grid, mapLat, mapLng, tileSizeMeters],
  );

  if (!visible) {
    return (
      <button
        className="mini-map-toggle mini-map-toggle-collapsed"
        onClick={() => setVisible(true)}
        title={t('game.miniMap.toggle' as never)}
        aria-label={t('game.miniMap.toggle' as never)}
      >
        🗺️
      </button>
    );
  }

  return (
    <div className="mini-map-container">
      <button
        className="mini-map-toggle"
        onClick={() => setVisible(false)}
        title={t('game.miniMap.toggle' as never)}
        aria-label={t('game.miniMap.toggle' as never)}
      >
        ✕
      </button>
      <canvas
        ref={canvasRef}
        style={{ width: CSS_W, height: CSS_H }}
        onClick={handleCanvasClick}
      />
    </div>
  );
}
