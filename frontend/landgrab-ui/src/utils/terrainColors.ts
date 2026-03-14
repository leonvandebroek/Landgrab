import type { TerrainType } from '../types/game';

/**
 * V4 "Clean Contrast" — neutral hexes are near-transparent with subtle
 * terrain tints. The satellite map itself provides texture. Terrain
 * distinction comes primarily from ICONS, not fill colour.
 *
 * Team colours (red #ef4444 / purple #a855f7) are bold and saturated;
 * these tints are deliberately dark and muted to avoid any confusion.
 */
export const terrainFillColors: Record<TerrainType, string> = {
  None: '#3b4252',     // dark slate — generic unclaimed
  Water: '#1e3a5f',    // deep navy — reads as water, distinct from purple team
  Building: '#4a4e57', // charcoal — slight warmth
  Road: '#5c5040',     // dark khaki — warm but very dark
  Path: '#4a4640',     // dark taupe — barely there
  Forest: '#2d4a35',   // dark forest green — cool, natural
  Park: '#345a3c',     // slightly lighter forest — fresh
  Hills: '#5a4a30',    // dark amber/brown — earthy
  Steep: '#4a3a28',    // deep brown — rugged
};

/**
 * Low opacity lets the satellite base show through for neutral hexes.
 * Water is slightly higher so it's clearly distinct as impassable terrain.
 */
export const terrainFillOpacity: Record<TerrainType, number> = {
  None: 0.40,
  Water: 0.55,
  Building: 0.40,
  Road: 0.40,
  Path: 0.35,
  Forest: 0.45,
  Park: 0.42,
  Hills: 0.42,
  Steep: 0.45,
};

export function terrainDefendBonus(terrainType: TerrainType | undefined, terrainEnabled: boolean | undefined): number {
  if (!terrainEnabled || !terrainType) return 0;
  switch (terrainType) {
    case 'Building': case 'Hills': return 1;
    case 'Steep': return 2;
    default: return 0;
  }
}
