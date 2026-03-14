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
 * Scale a player's base colour by troop intensity.
 *
 * - troops = 0  → very pale (low saturation, lightness pushed toward 75%)
 * - troops ≥ maxTroops → full saturation at the base colour's lightness
 *
 * Intensity curve: `min(1, 0.3 + 0.7 * (troops / maxTroops))`
 */
export function scaleTroopColor(
  baseColor: string,
  troops: number,
  maxTroops: number = 30,
): string {
  const clampedTroops = Math.max(0, troops);
  const safeDivisor = Math.max(1, maxTroops);

  const intensity = Math.min(1, 0.3 + 0.7 * (clampedTroops / safeDivisor));
  const { h, s, l } = hexToHSL(baseColor);

  // Saturation scales linearly with intensity
  const adjustedS = s * intensity;
  // Lightness lerps from 75% (pale) at low intensity → base lightness at full
  const adjustedL = l + (75 - l) * (1 - intensity);

  return hslToCSS(h, adjustedS, adjustedL);
}

/**
 * Determine fill opacity for a hex tile based on troop count and ownership.
 *
 * - Not owned → fixed neutral opacity (0.28)
 * - Owned → lerp from 0.45 (1 troop) to 0.92 (30+ troops)
 */
export function scaleTroopOpacity(troops: number, isOwned: boolean): number {
  if (!isOwned) return 0.28;
  return Math.min(0.92, 0.45 + 0.47 * Math.min(1, troops / 30));
}
