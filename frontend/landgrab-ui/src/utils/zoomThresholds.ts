/**
 * Zoom-level detail tiers for the game map.
 *
 * Different information density is shown at different zoom levels:
 *   - strategic  (< 14): coloured blobs only, no text or overlays
 *   - tactical   (14–15): troop counts, borders, basic interaction
 *   - detailed   (≥ 16): terrain icons, tooltips, all overlays
 */

export type ZoomDetailLevel = 'strategic' | 'tactical' | 'detailed';

/** Map a Leaflet zoom value to its detail tier. */
export function getDetailLevel(zoom: number): ZoomDetailLevel {
  if (zoom < 14) return 'strategic';
  if (zoom < 16) return 'tactical';
  return 'detailed';
}

// ── Individual feature-flag functions ──────────────────────────────────

/** Show troop-count badges on hexes (tactical+). */
export function showTroopBadges(zoom: number): boolean {
  return zoom >= 14;
}

/** Show terrain-type icons (emoji). Matches TERRAIN_ICON_MIN_ZOOM = 15. */
export function showTerrainIcons(zoom: number): boolean {
  return zoom >= 15;
}

/** Show coloured border effects between territories. */
export function showBorderEffects(zoom: number): boolean {
  return zoom >= 13;
}

/** Show player name labels on territory blobs. */
export function showPlayerNames(zoom: number): boolean {
  return zoom >= 15;
}

/** Show building/road/path icons on hex tiles. Only at detailed zoom to reduce noise. */
export function showBuildingIcons(zoom: number): boolean {
  return zoom >= 16;
}

/** Show hover/tap tooltips on hex tiles. */
export function showHexTooltips(zoom: number): boolean {
  return zoom >= 14;
}

/** Show supply-line overlays between owned hexes. */
export function showSupplyLines(zoom: number): boolean {
  return zoom >= 12;
}

/** Show animated contest effects on disputed hexes. */
export function showContestEffects(zoom: number): boolean {
  return zoom >= 14;
}

/** Show troop movement animations. */
export function showTroopAnimations(zoom: number): boolean {
  return zoom >= 14;
}
