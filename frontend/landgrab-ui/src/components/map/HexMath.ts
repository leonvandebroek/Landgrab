/**
 * Flat-top hexagon math using axial (q, r) coordinates.
 */

export const HEX_DIRS: [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]
];

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexNeighbors(q: number, r: number): [number, number][] {
  return HEX_DIRS.map(([dq, dr]) => [q + dq, r + dr] as [number, number]);
}

export function hexAreAdjacent(q1: number, r1: number, q2: number, r2: number): boolean {
  return hexNeighbors(q1, r1).some(([q, r]) => q === q2 && r === r2);
}

/**
 * Flat-top hex → pixel center.
 * @param size  pixel radius of one hex (center to corner)
 */
export function hexToPixel(q: number, r: number, size: number): [number, number] {
  return [
    size * (3 / 2) * q,
    size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  ];
}

/**
 * Returns SVG polygon points string for a flat-top hex centered at (cx, cy).
 */
export function hexCornerPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i;
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}

/**
 * Pixel → nearest hex (axial), flat-top layout.
 */
export function pixelToHex(px: number, py: number, size: number): [number, number] {
  const q = (2 / 3) * px / size;
  const r = (-1 / 3 * px + Math.sqrt(3) / 3 * py) / size;
  return hexRound(q, r);
}

export function hexRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

/**
 * Generate all hex coordinates within axial radius from origin.
 */
export function hexSpiral(radius: number): [number, number][] {
  const result: [number, number][] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) result.push([q, r]);
  }
  return result;
}
