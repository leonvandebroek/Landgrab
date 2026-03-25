export type AbilityKey =
  | 'beacon'
  | 'shareIntel'
  | 'tacticalStrike'
  | 'rallyPoint'
  | 'commandoRaid'
  | 'fortConstruction'
  | 'sabotage'
  | 'demolish'
  | 'intercept'
  | 'troopTransfer'
  | 'fieldBattle';

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

/**
 * Generic invoke function injected into ability cards.
 * Matches the SignalR HubConnection.invoke signature but allows undefined return.
 */
export type InvokeFn = <T = unknown>(method: string, ...args: unknown[]) => Promise<T | undefined>;

/** Standard prop interface all ability card components must implement. */
export interface AbilityCardProps {
  /** The current user's ID — cards use this to find themselves in the player list from gameStore. */
  myUserId: string;
  /** SignalR invoke function — cards call hub methods directly with this. */
  invoke: InvokeFn | null;
}
