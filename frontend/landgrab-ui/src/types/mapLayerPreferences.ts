import type { GameIconName } from '../utils/gameIcons';

export interface MapLayerPreferences {
  borderEffects: boolean;
  contestedEdges: boolean;
  playerMarkers: boolean;
  playerRadius: boolean;
  timeOverlay: boolean;
  troopAnimations: boolean;
  troopBadges: boolean;
  worldDimMask: boolean;
}

export const DEFAULT_MAP_LAYER_PREFS: MapLayerPreferences = {
  borderEffects: true,
  contestedEdges: true,
  playerMarkers: true,
  playerRadius: true,
  timeOverlay: true,
  troopAnimations: true,
  troopBadges: true,
  worldDimMask: true,
};

export interface LayerGroup {
  key: string;
  icon: GameIconName | string;
  layers: (keyof MapLayerPreferences)[];
}

export const LAYER_GROUPS: LayerGroup[] = [
  {
    key: 'territory',
    icon: '⬢',
    layers: ['borderEffects', 'contestedEdges'],
  },
  {
    key: 'units',
    icon: 'helmet',
    layers: ['troopBadges', 'troopAnimations'],
  },
  {
    key: 'players',
    icon: 'rallyTroops',
    layers: ['playerMarkers', 'playerRadius'],
  },
  {
    key: 'overlays',
    icon: 'fog',
    layers: ['worldDimMask', 'timeOverlay'],
  },
];
