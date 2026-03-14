/**
 * Color manipulation utilities for hex-tile heat gradients.
 *
 * Player colours (from backend as "#rrggbb") are scaled in
 * saturation and lightness based on troop counts so the map
 * shows a visual intensity gradient.
 */

/** Parse a "#rrggbb" hex string into HSL (h 0-360, s 0-100, l 0-100). */
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** Convert HSL values to a CSS `hsl()` string. */
export function hslToCSS(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

/**
 * V4 "Clean Contrast" — Scale a player's base colour by troop intensity.
 *
 * Owned hexes are BOLD and saturated — they must clearly pop against
 * the dark, near-transparent neutral hexes.
 *
 * - troops ≈ 0  → clearly team-colored but lighter
 * - troops ≥ maxTroops → deep, rich, fully saturated
 *
 * Intensity floor is 0.60 so even fresh claims are unmistakably team-colored.
 */
export function scaleTroopColor(
  baseColor: string,
  troops: number,
  maxTroops: number = 30,
): string {
  const clampedTroops = Math.max(0, troops);
  const safeDivisor = Math.max(1, maxTroops);

  const intensity = Math.min(1, 0.60 + 0.40 * (clampedTroops / safeDivisor));
  const { h, s, l } = hexToHSL(baseColor);

  // High saturation floor — team color always clearly visible
  const adjustedS = Math.max(s * 0.70, s * intensity);
  // Lightness: low troops are slightly lighter, high troops are at base darkness
  const adjustedL = l + (48 - l) * (1 - intensity);

  return hslToCSS(h, adjustedS, adjustedL);
}

/**
 * V4 — Opacity for hex tiles.
 *
 * Neutral hexes are near-transparent (let satellite show).
 * Owned hexes are OPAQUE (bold team color overlay).
 */
export function scaleTroopOpacity(troops: number, isOwned: boolean): number {
  if (!isOwned) return 0.40;
  // Owned: 0.72 (fresh claim) → 0.92 (heavy troops)
  return Math.min(0.92, 0.72 + 0.20 * Math.min(1, troops / 30));
}
