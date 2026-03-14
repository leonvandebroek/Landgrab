// Pure canvas rendering for the strategic mini-map overview.
// No React imports — consumed by the MiniMap component via useEffect.

export interface MiniMapData {
  grid: Record<string, { q: number; r: number; ownerColor?: string; ownerId?: string }>;
  viewportBounds: { north: number; south: number; east: number; west: number } | null;
  myUserId: string;
  hqHexes: Array<{ q: number; r: number; color: string }>;
}

const BG_COLOR = '#0f1923';
const NEUTRAL_COLOR = '#1a2740';
const HQ_RING_FALLBACK = '#f1c40f';
const VIEWPORT_STROKE = 'rgba(255, 255, 255, 0.55)';
const PADDING = 12;

/**
 * Render the full mini-map onto a 2-D canvas context.
 *
 * Hex positions are mapped via the standard axial layout:
 *   pixelX = q × 1.5
 *   pixelY = (r + q × 0.5) × √3
 */
export function renderMiniMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  data: MiniMapData,
): void {
  // ── Clear with dark background ──
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, height);

  const cells = Object.values(data.grid);
  if (cells.length === 0) return;

  // ── Bounding box of all hexes in axial-pixel space ──
  const sqrt3 = Math.sqrt(3);
  let minPx = Infinity, maxPx = -Infinity;
  let minPy = Infinity, maxPy = -Infinity;

  const positions = cells.map((cell) => {
    const px = cell.q * 1.5;
    const py = (cell.r + cell.q * 0.5) * sqrt3;
    if (px < minPx) minPx = px;
    if (px > maxPx) maxPx = px;
    if (py < minPy) minPy = py;
    if (py > maxPy) maxPy = py;
    return { px, py, cell };
  });

  const rangeX = maxPx - minPx || 1;
  const rangeY = maxPy - minPy || 1;
  const availW = width - PADDING * 2;
  const availH = height - PADDING * 2;
  const scale = Math.min(availW / rangeX, availH / rangeY);
  const offsetX = (width - rangeX * scale) / 2;
  const offsetY = (height - rangeY * scale) / 2;

  // Dot radius adapts to grid density, clamped 2–6 px
  const dotRadius = Math.max(2, Math.min(6, scale * 0.45));

  // Build HQ lookup for per-alliance ring colors
  const hqColorMap = new Map<string, string>();
  for (const hq of data.hqHexes) {
    hqColorMap.set(`${hq.q},${hq.r}`, hq.color);
  }

  // ── Draw hex dots ──
  for (const { px, py, cell } of positions) {
    const x = (px - minPx) * scale + offsetX;
    const y = (py - minPy) * scale + offsetY;
    const key = `${cell.q},${cell.r}`;
    const hqColor = hqColorMap.get(key);
    const r = hqColor ? dotRadius * 1.5 : dotRadius;

    // HQ gold/alliance-colored ring
    if (hqColor) {
      ctx.beginPath();
      ctx.arc(x, y, r + 2, 0, Math.PI * 2);
      ctx.strokeStyle = hqColor || HQ_RING_FALLBACK;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Hex fill dot
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = cell.ownerColor ?? NEUTRAL_COLOR;
    ctx.fill();
  }

  // ── Viewport rectangle (semi-transparent dashed border) ──
  if (data.viewportBounds) {
    const b = data.viewportBounds;
    // Map lat/lng-like viewport bounds into the same axial-pixel canvas space.
    // The viewport bounds arrive in the same coordinate space as the grid's
    // axial-pixel positions (pre-projected by the caller), so we can linearly
    // map them using the same scale/offset.
    const vLeft   = (b.west - minPx)  * scale + offsetX;
    const vRight  = (b.east - minPx)  * scale + offsetX;
    const vTop    = (b.north - minPy) * scale + offsetY;
    const vBottom = (b.south - minPy) * scale + offsetY;

    ctx.strokeStyle = VIEWPORT_STROKE;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      Math.min(vLeft, vRight),
      Math.min(vTop, vBottom),
      Math.abs(vRight - vLeft),
      Math.abs(vBottom - vTop),
    );
    ctx.setLineDash([]);
  }
}
