import type { TerrainType } from '../types/game';

export const terrainIcons: Record<TerrainType, string> = {
  None: '',
  Water: '🌊',
  Building: '🏢',
  Road: '═',
  Path: '···',
  Forest: '🌲',
  Park: '🌿',
  Hills: '⛰',
  Steep: '🏔'
};

export const terrainLabels: Record<TerrainType, string> = {
  None: '',
  Water: 'Wa',
  Building: 'Bu',
  Road: 'Rd',
  Path: 'Pa',
  Forest: 'Fo',
  Park: 'Pk',
  Hills: 'Hi',
  Steep: 'St'
};
