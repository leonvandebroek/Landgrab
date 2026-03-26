import type { AbilityKey, AbilityMode, MapFocusPreset } from '../types/abilities';
import type { GameState, Player } from '../types/game';

export interface DerivedAbilityUiState {
  ability: AbilityKey;
  mode: AbilityMode;
  focusPreset: MapFocusPreset;
}

export function deriveAbilityUiFromPlayer(
  player: Player,
  gameState?: Pick<GameState, 'activeRaids' | 'activeTroopTransfers' | 'activeFieldBattles'>,
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

  const hasActiveTroopTransfer = gameState?.activeTroopTransfers?.some(
    (transfer) => transfer.initiatorId === player.id,
  ) ?? false;

  if (hasActiveTroopTransfer) {
    return {
      ability: 'troopTransfer',
      mode: 'active',
      focusPreset: 'none',
    };
  }

  const hasActiveFieldBattle = gameState?.activeFieldBattles?.some(
    (battle) => battle.initiatorId === player.id && !battle.resolved,
  ) ?? false;

  if (hasActiveFieldBattle) {
    return {
      ability: 'fieldBattle',
      mode: 'active',
      focusPreset: 'none',
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
