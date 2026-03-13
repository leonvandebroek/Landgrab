import type { TerrainType } from '../types/game';

export const terrainFillColors: Record<TerrainType, string> = {
  None: 'transparent',
  Water: '#3b82f6',
  Building: '#6b7280',
  Road: '#d4a373',
  Path: '#c2b280',
  Forest: '#166534',
  Park: '#4ade80',
  Hills: '#a16207',
  Steep: '#78350f',
};

export const terrainFillOpacity: Record<TerrainType, number> = {
  None: 0,
  Water: 0.45,
  Building: 0.35,
  Road: 0.2,
  Path: 0.15,
  Forest: 0.4,
  Park: 0.25,
  Hills: 0.3,
  Steep: 0.4,
};

export function terrainDefendBonus(terrainType: TerrainType | undefined, terrainEnabled: boolean | undefined): number {
  if (!terrainEnabled || !terrainType) return 0;
  switch (terrainType) {
    case 'Building': case 'Hills': return 1;
    case 'Steep': return 2;
    default: return 0;
  }
}
