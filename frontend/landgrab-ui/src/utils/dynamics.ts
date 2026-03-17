import type { GameDynamics } from '../types/game';

export const FEATURE_KEYS = [
  'terrain', 'playerRoles', 'fogOfWar', 'beaconEnabled', 'supplyLines', 'hq',
  'tileDecayEnabled', 'timedEscalation', 'underdogPact',
] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];

/** Maps a feature toggle key to its corresponding GameDynamics boolean field. */
export const featureField = (key: FeatureKey): keyof GameDynamics =>
  key.endsWith('Enabled') ? key as keyof GameDynamics : `${key}Enabled` as keyof GameDynamics;
