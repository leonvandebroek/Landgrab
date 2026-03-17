import type { TerrainType } from '../types/game';
import type { GameIconName } from './gameIcons';

export const terrainIcons: Record<TerrainType, GameIconName | ''> = {
  None: '',
  Water: 'waves',
  Building: 'house',
  Road: 'road',
  Path: 'trail',
  Forest: 'forest',
  Park: 'pineTree',
  Hills: 'hills',
  Steep: 'mountain'
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
