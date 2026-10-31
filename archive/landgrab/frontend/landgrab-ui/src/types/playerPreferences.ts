export type MarkerStyle = 'dot' | 'pin' | 'avatar' | 'flag';
export type MarkerSize = 'small' | 'medium' | 'large';

export interface PlayerDisplayPreferences {
  markerStyle: MarkerStyle;
  markerSize: MarkerSize;
  showNameLabel: boolean;
}

export const DEFAULT_PLAYER_PREFS: PlayerDisplayPreferences = {
  markerStyle: 'dot',
  markerSize: 'medium',
  showNameLabel: false
};

export const MARKER_SIZE_MULTIPLIER: Record<MarkerSize, number> = {
  small: 0.7,
  medium: 1.0,
  large: 1.5
};

export const STORAGE_KEY = 'lg-player-display-prefs';
