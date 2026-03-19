import type { TFunction } from 'i18next';
import type { GameState, Player } from '../../types/game';
import { hexKey, hexNeighbors } from '../map/HexMath';
import type { GameIconName } from '../../utils/gameIcons';

export type MapInteractionTone = 'info' | 'success' | 'error';

export interface MapInteractionFeedback {
  tone: MapInteractionTone;
  message: string;
  targetHex?: [number, number] | null;
}

/* ── Explicit tile-action types (used by TileActionPanel) ── */

export type TileActionType = 'claim' | 'claimAlliance' | 'claimSelf' | 'attack' | 'reinforce' | 'pickup';

export interface TileAction {
  type: TileActionType;
  label: string;   // i18n key
  icon: GameIconName;
  tone: 'primary' | 'danger' | 'neutral' | 'info';
  enabled: boolean;
  disabledReason?: string; // i18n key
  disabledReasonParams?: Record<string, unknown>;
}

export function getTileActionDisabledReasonText(
  t: TFunction,
  disabledReason?: string,
  params?: Record<string, unknown>,
): string | null {
  if (!disabledReason) {
    return null;
  }

  if (disabledReason === 'guidance.adjacencyRequired') {
    return t('guidance.adjacencyRequired' as never, {
      defaultValue: t('rules.claiming.adjacencyRequired' as never),
    });
  }

  return t(disabledReason as never, params);
}

/**
 * Returns the set of explicit actions available for a tile the player is
 * standing on.  Returns an empty array when no panel should be shown
 * (e.g. player is on a different hex, or target is the master tile).
 */
export function getTileActions({
  state,
  player,
  targetHex,
  targetCell,
  currentHex,
  isHostBypass,
}: {
  state: GameState;
  player: Player | null;
  targetHex: [number, number] | null;
  targetCell?: GameState['grid'][string];
  currentHex: [number, number] | null;
  isHostBypass?: boolean;
}): TileAction[] {
  if (!targetHex || !targetCell || !player || !currentHex) return [];

  // Player must be standing on the target hex (unless host GPS bypass is active)
  if (!isHostBypass && (currentHex[0] !== targetHex[0] || currentHex[1] !== targetHex[1])) return [];

  // No actions on the master tile
  if (targetCell.isMasterTile) return [];

  const carriedTroops = player.carriedTroops ?? 0;
  const isOwnHex = targetCell.ownerId === player.id;
  const isAlliedHex = Boolean(
    player.allianceId && targetCell.ownerAllianceId === player.allianceId && !isOwnHex
  );
  const isNeutral = !targetCell.ownerId;
  const isEnemy = !isNeutral && !isOwnHex && !isAlliedHex;

  const actions: TileAction[] = [];

  /* ── Neutral tile ── */
  if (isNeutral) {
    let claimEnabled = true;
    let disabledReason: string | undefined;

    if (state.claimMode === 'PresenceWithTroop') {
      claimEnabled = carriedTroops > 0;
      disabledReason = claimEnabled ? undefined : 'game.tileAction.neutralNeedsTroop';
    } else if (state.claimMode === 'AdjacencyRequired') {
      disabledReason = getAdjacencyDisabledReason(state.grid, targetHex, player);
      claimEnabled = !disabledReason;
    }
    // else PresenceOnly – always allowed

    if (player.allianceId) {
      actions.push({
        type: 'claimAlliance',
        label: 'game.tileAction.claimAllianceBtn',
        icon: 'fort',
        tone: 'primary',
        enabled: claimEnabled,
        disabledReason,
      });
    } else {
      actions.push({
        type: 'claim',
        label: 'game.tileAction.claimBtn',
        icon: 'flag',
        tone: 'primary',
        enabled: claimEnabled,
        disabledReason,
      });
    }

    return actions;
  }

  /* ── Enemy tile ── */
  if (isEnemy) {
    const defenderBonusVal = 0;
    const fortBonus = state.dynamics?.playerRolesEnabled && targetCell.isFort ? 1 : 0;
    const effectiveAttack = carriedTroops;
    const effectiveDefence = targetCell.troops + defenderBonusVal + fortBonus;
    const canAttack = effectiveAttack > effectiveDefence;
    actions.push({
      type: 'attack',
      label: 'game.tileAction.attackBtn',
      icon: 'contested',
      tone: 'danger',
      enabled: canAttack,
      disabledReason: canAttack ? undefined : 'game.tileAction.enemyAttackBlocked',
      disabledReasonParams: canAttack ? undefined : { count: effectiveDefence },
    });
    return actions;
  }

  /* ── Own tile ── */
  if (isOwnHex) {
    if (carriedTroops > 0) {
      actions.push({
        type: 'reinforce',
        label: 'game.tileAction.reinforceBtn',
        icon: 'shield',
        tone: 'info',
        enabled: true,
      });
    }
    if (targetCell.troops > 0) {
      actions.push({
        type: 'pickup',
        label: 'game.tileAction.pickupBtn',
        icon: 'helmet',
        tone: 'info',
        enabled: true,
      });
    }
    return actions;
  }

  /* ── Allied tile ── */
  if (isAlliedHex) {
    if (carriedTroops > 0) {
      actions.push({
        type: 'reinforce',
        label: 'game.tileAction.reinforceBtn',
        icon: 'shield',
        tone: 'info',
        enabled: true,
      });
    }
    if (targetCell.troops > 0) {
      actions.push({
        type: 'pickup',
        label: 'game.tileAction.pickupBtn',
        icon: 'helmet',
        tone: 'info',
        enabled: true,
      });
    }
    return actions;
  }

  return [];
}

interface TileInteractionStatus {
  action: 'none' | 'pickup' | 'place';
  tone: Exclude<MapInteractionTone, 'success'>;
  message: string;
  placeOutcome?: 'claim' | 'reinforce' | 'capture';
}

export function getTileInteractionStatus({
  state,
  player,
  targetHex,
  targetCell,
  currentHex,
  t,
  isHostBypass,
}: {
  state: GameState;
  player: Player | null;
  targetHex: [number, number] | null;
  targetCell?: GameState['grid'][string];
  currentHex: [number, number] | null;
  t: TFunction;
  isHostBypass?: boolean;
}): TileInteractionStatus {
  if (!targetHex || !targetCell) {
    return {
      action: 'none',
      tone: 'error',
      message: t('game.mapFeedback.invalidHex')
    };
  }

  if (!currentHex) {
    return {
      action: 'none',
      tone: 'error',
      message: t('game.mapFeedback.locationRequired')
    };
  }

  // Skip position check when host GPS bypass is active
  if (!isHostBypass && (currentHex[0] !== targetHex[0] || currentHex[1] !== targetHex[1])) {
    return {
      action: 'none',
      tone: 'info',
      message: t('game.tileAction.moveToSelected', { q: targetHex[0], r: targetHex[1] })
    };
  }

  if (!player) {
    return {
      action: 'none',
      tone: 'info',
      message: t('game.tapTilePrompt')
    };
  }

  if (targetCell.isMasterTile) {
    return {
      action: 'none',
      tone: 'info',
      message: t('game.tileAction.masterTile')
    };
  }

  const carriedTroops = player.carriedTroops ?? 0;
  const isOwnHex = targetCell.ownerId === player.id;
  const isAlliedHex = Boolean(player.allianceId && targetCell.ownerAllianceId === player.allianceId);

  if (isOwnHex) {
    if (carriedTroops > 0) {
      return {
        action: 'place',
        tone: 'info',
        message: t('game.tileAction.reinforceSelf', { count: carriedTroops }),
        placeOutcome: 'reinforce'
      };
    }

    if (targetCell.troops > 0) {
      return {
        action: 'pickup',
        tone: 'info',
        message: t('game.tileAction.pickupReady', { count: targetCell.troops })
      };
    }

    return {
      action: 'none',
      tone: 'error',
      message: t('game.tileAction.friendlyEmpty')
    };
  }

  if (isAlliedHex) {
    if (carriedTroops > 0) {
      return {
        action: 'place',
        tone: 'info',
        message: t('game.tileAction.reinforceAlly', { count: carriedTroops }),
        placeOutcome: 'reinforce'
      };
    }

    return {
      action: 'none',
      tone: 'error',
      message: t('game.tileAction.alliedNeedsTroops')
    };
  }

  if (!targetCell.ownerId) {
    if (state.claimMode === 'PresenceWithTroop') {
      return carriedTroops > 0
        ? {
          action: 'place',
          tone: 'info',
          message: t('game.tileAction.neutralClaimWithTroop'),
          placeOutcome: 'claim'
        }
        : {
          action: 'none',
          tone: 'error',
          message: t('game.tileAction.neutralNeedsTroop')
        };
    }

    const adjacencyDisabledReason = state.claimMode === 'AdjacencyRequired'
      ? getAdjacencyDisabledReason(state.grid, targetHex, player)
      : undefined;

    if (adjacencyDisabledReason) {
      return {
        action: 'none',
        tone: 'error',
        message: getTileActionDisabledReasonText(t, adjacencyDisabledReason) ?? t('game.tileAction.neutralNeedsAdjacency')
      };
    }

    return {
      action: 'place',
      tone: 'info',
      message: t('game.tileAction.neutralClaimPresence'),
      placeOutcome: 'claim'
    };
  }

  const defenderBonusVal = 0;
  const fortBonus = state.dynamics?.playerRolesEnabled && targetCell.isFort ? 1 : 0;
  const effectiveAttack = carriedTroops;
  const effectiveDefence = targetCell.troops + defenderBonusVal + fortBonus;

  if (effectiveAttack <= effectiveDefence) {
    return {
      action: 'none',
      tone: 'error',
      message: t('game.tileAction.enemyAttackBlocked', { count: effectiveDefence })
    };
  }

  return {
    action: 'place',
    tone: 'info',
    message: t('game.tileAction.enemyAttackReady', {
      name: targetCell.ownerName ?? t('game.unknown')
    }),
    placeOutcome: 'capture'
  };
}

function isAdjacentToOwnedTerritory(
  grid: GameState['grid'],
  targetHex: [number, number],
  player: Player
): boolean {
  return hexNeighbors(targetHex[0], targetHex[1]).some(([q, r]) => {
    const neighbor = grid[hexKey(q, r)];
    if (!neighbor) {
      return false;
    }

    return neighbor.ownerId === player.id
      || Boolean(player.allianceId && neighbor.ownerAllianceId === player.allianceId);
  });
}

function hasOwnedTerritory(
  grid: GameState['grid'],
  player: Player,
): boolean {
  return Object.values(grid).some((cell) => (
    cell.ownerId === player.id
    || Boolean(player.allianceId && cell.ownerAllianceId === player.allianceId)
  ));
}

function getAdjacencyDisabledReason(
  grid: GameState['grid'],
  targetHex: [number, number],
  player: Player,
): string | undefined {
  if (isAdjacentToOwnedTerritory(grid, targetHex, player)) {
    return undefined;
  }

  return hasOwnedTerritory(grid, player)
    ? 'guidance.adjacencyRequired'
    : 'guidance.noFrontierYet';
}
