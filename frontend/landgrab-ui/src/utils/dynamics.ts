import type { GameDynamics } from '../types/game';

export const DYNAMICS_PRESETS = [
  'Klassiek', 'Territorium', 'Formatie', 'Logistiek',
  'Infiltratie', 'Chaos', 'Tolweg', 'Aangepast',
] as const;

export const COPRESENCE_MODES = [
  'Standoff', 'PresenceBattle', 'PresenceBonus',
  'Ambush', 'Toll', 'Duel', 'Rally', 'Drain',
  'Stealth', 'Hostage', 'Scout', 'Beacon',
  'FrontLine', 'Relay', 'JagerProoi', 'Shepherd', 'CommandoRaid',
] as const;

export const FEATURE_KEYS = [
  'terrain', 'playerRoles', 'fogOfWar', 'supplyLines', 'hq',
  'timedEscalation', 'underdogPact', 'neutralNPC', 'randomEvents', 'missionSystem',
] as const;

export type FeatureKey = typeof FEATURE_KEYS[number];

/** Maps a feature key to its corresponding GameDynamics boolean field. */
export const featureField = (key: FeatureKey): keyof GameDynamics =>
  `${key}Enabled` as keyof GameDynamics;

export const EVENT_TYPES = ['Calamity', 'Epidemic', 'BonusTroops', 'RushHour'] as const;
export type EventType = typeof EVENT_TYPES[number];
