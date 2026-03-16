export interface MapLayerPreferences {
  borderEffects: boolean;
  buildingIcons: boolean;
  contestedEdges: boolean;
  fogOfWar: boolean;
  playerMarkers: boolean;
  playerRadius: boolean;
  supplyLines: boolean;
  terrainIcons: boolean;
  timeOverlay: boolean;
  troopAnimations: boolean;
  troopBadges: boolean;
  worldDimMask: boolean;
}

export const DEFAULT_MAP_LAYER_PREFS: MapLayerPreferences = {
  borderEffects: true,
  buildingIcons: true,
  contestedEdges: true,
  fogOfWar: true,
  playerMarkers: true,
  playerRadius: true,
  supplyLines: true,
  terrainIcons: true,
  timeOverlay: true,
  troopAnimations: true,
  troopBadges: true,
  worldDimMask: true,
};

export interface LayerGroup {
  key: string;
  icon: string;
  layers: (keyof MapLayerPreferences)[];
}

export const LAYER_GROUPS: LayerGroup[] = [
  {
    key: 'territory',
    icon: '⬢',
    layers: ['borderEffects', 'contestedEdges', 'supplyLines'],
  },
  {
    key: 'terrain',
    icon: '🌿',
    layers: ['terrainIcons', 'buildingIcons'],
  },
  {
    key: 'units',
    icon: '🪖',
    layers: ['troopBadges', 'troopAnimations'],
  },
  {
    key: 'players',
    icon: '👥',
    layers: ['playerMarkers', 'playerRadius'],
  },
  {
    key: 'overlays',
    icon: '🌫️',
    layers: ['fogOfWar', 'worldDimMask', 'timeOverlay'],
  },
];
