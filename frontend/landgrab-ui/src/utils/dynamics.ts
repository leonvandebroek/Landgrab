import type { CopresenceMode, GameDynamics } from '../types/game';

export const DYNAMICS_PRESETS = [
  'Klassiek', 'Territorium', 'Formatie', 'Aangepast',
] as const;

export type DynamicsPreset = typeof DYNAMICS_PRESETS[number];

/** Maps each named preset to its copresence modes (mirrors backend CopresencePresets). */
export const PRESET_MODES = {
  Klassiek: [],
  Territorium: ['Shepherd', 'Drain'],
  Formatie: ['FrontLine', 'Rally'],
  Aangepast: [],
} satisfies Record<DynamicsPreset, CopresenceMode[]>;

export const COPRESENCE_MODES = [
  'Standoff', 'PresenceBonus', 'Rally', 'Drain',
  'Beacon', 'FrontLine', 'Shepherd', 'CommandoRaid',
] as const;

export const FEATURE_KEYS = [
  'terrain', 'playerRoles', 'fogOfWar', 'supplyLines', 'hq',
  'timedEscalation', 'underdogPact',
] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];

/** Maps a feature key to its corresponding GameDynamics boolean field. */
export const featureField = (key: FeatureKey): keyof GameDynamics =>
  `${key}Enabled` as keyof GameDynamics;
