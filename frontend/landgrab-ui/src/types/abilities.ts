export type AbilityKey =
  | 'beacon'
  | 'shareIntel'
  | 'tacticalStrike'
  | 'rallyPoint'
  | 'commandoRaid'
  | 'fortConstruction'
  | 'sabotage'
  | 'demolish'
  | 'intercept';

export type AbilityMode = 'idle' | 'targeting' | 'confirming' | 'active' | 'inProgress';

export type MapFocusPreset = 'none' | 'player' | 'strategicTargeting' | 'localTracking';

export interface AbilityUiState {
  activeAbility: AbilityKey | null;
  mode: AbilityMode;
  cardVisible: boolean;
  targetHexKey: string | null;
  pendingTargetHexKey: string | null;
  validTargetHexKeys: string[];
  mapFocusPreset: MapFocusPreset;
}

export type AbilityButtonState = 'ready' | 'targeting' | 'active' | 'inProgress' | 'cooldown' | 'blocked';
