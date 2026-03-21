import type { AbilityKey, AbilityMode, MapFocusPreset } from '../types/abilities';
import type { GameState, Player } from '../types/game';

export interface DerivedAbilityUiState {
  ability: AbilityKey;
  mode: AbilityMode;
  focusPreset: MapFocusPreset;
}

export function deriveAbilityUiFromPlayer(
  player: Player,
  gameState?: Pick<GameState, 'activeRaids'>,
): DerivedAbilityUiState | null {
  if (player.fortTargetQ != null) {
    return {
      ability: 'fortConstruction',
      mode: 'inProgress',
      focusPreset: 'localTracking',
    };
  }

  if (player.sabotageTargetQ != null) {
    return {
      ability: 'sabotage',
      mode: 'inProgress',
      focusPreset: 'localTracking',
    };
  }

  if (player.demolishTargetKey) {
    return {
      ability: 'demolish',
      mode: 'inProgress',
      focusPreset: 'localTracking',
    };
  }

  const hasActiveCommandoRaid = gameState?.activeRaids?.some((raid) => (
    raid.initiatorPlayerId === player.id
    || (player.allianceId ? raid.initiatorAllianceId === player.allianceId : false)
  )) ?? false;

  if (hasActiveCommandoRaid) {
    return {
      ability: 'commandoRaid',
      mode: 'active',
      focusPreset: 'strategicTargeting',
    };
  }

  if (player.isBeacon) {
    return {
      ability: 'beacon',
      mode: 'active',
      focusPreset: 'none',
    };
  }

  if (player.tacticalStrikeActive) {
    return {
      ability: 'tacticalStrike',
      mode: 'active',
      focusPreset: 'none',
    };
  }

  if (player.rallyPointQ != null && player.rallyPointR != null) {
    return {
      ability: 'rallyPoint',
      mode: 'active',
      focusPreset: 'none',
    };
  }

  return null;
}