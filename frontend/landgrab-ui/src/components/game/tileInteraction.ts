import type { TFunction } from 'i18next';
import type { GameState, Player } from '../../types/game';
import { hexKey, hexNeighbors } from '../map/HexMath';
import { terrainDefendBonus } from '../../utils/terrainColors';

export type MapInteractionTone = 'info' | 'success' | 'error';

export interface MapInteractionFeedback {
  tone: MapInteractionTone;
  message: string;
  targetHex?: [number, number] | null;
}

/* ── Explicit tile-action types (used by TileActionPanel) ── */

export type TileActionType = 'claim' | 'claimAlliance' | 'claimSelf' | 'attack' | 'reinforce' | 'pickup' | 'ignore';

export interface TileAction {
  type: TileActionType;
  label: string;   // i18n key
  icon: string;     // emoji
  tone: 'primary' | 'danger' | 'neutral' | 'info';
  enabled: boolean;
  disabledReason?: string; // i18n key
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
}: {
  state: GameState;
  player: Player | null;
  targetHex: [number, number] | null;
  targetCell?: GameState['grid'][string];
  currentHex: [number, number] | null;
}): TileAction[] {
  if (!targetHex || !targetCell || !player || !currentHex) return [];

  // Player must be standing on the target hex
  if (currentHex[0] !== targetHex[0] || currentHex[1] !== targetHex[1]) return [];

  // No actions on the master tile
  if (targetCell.isMasterTile) return [];

  const carriedTroops = player.carriedTroops ?? 0;
  const isOwnHex = targetCell.ownerId === player.id;
  const isAlliedHex = Boolean(
    player.allianceId && targetCell.ownerAllianceId === player.allianceId && !isOwnHex
  );
  const isNeutral = !targetCell.ownerId;
  const isEnemy = !isNeutral && !isOwnHex && !isAlliedHex;

  const ignore: TileAction = {
    type: 'ignore',
    label: 'game.tileAction.ignoreBtn',
    icon: '👋',
    tone: 'neutral',
    enabled: true,
  };

  const actions: TileAction[] = [];

  /* ── Neutral tile ── */
  if (isNeutral) {
    let claimEnabled = true;
    let disabledReason: string | undefined;

    if (state.claimMode === 'PresenceWithTroop') {
      claimEnabled = carriedTroops > 0;
      disabledReason = claimEnabled ? undefined : 'game.tileAction.neutralNeedsTroop';
    } else if (state.claimMode === 'AdjacencyRequired') {
      const adjacent = isAdjacentToOwnedTerritory(state.grid, targetHex, player);
      claimEnabled = adjacent;
      disabledReason = adjacent ? undefined : 'game.tileAction.neutralNeedsAdjacency';
    }
    // else PresenceOnly – always allowed

    if (player.allianceId) {
      actions.push({
        type: 'claimAlliance',
        label: 'game.tileAction.claimAllianceBtn',
        icon: '🏰',
        tone: 'primary',
        enabled: claimEnabled,
        disabledReason,
      });
      if (state.allowSelfClaim !== false) {
        actions.push({
          type: 'claimSelf',
          label: 'game.tileAction.claimSelfBtn',
          icon: '🏠',
          tone: 'neutral',
          enabled: claimEnabled,
          disabledReason,
        });
      }
    } else {
      actions.push({
        type: 'claim',
        label: 'game.tileAction.claimBtn',
        icon: '🏴',
        tone: 'primary',
        enabled: claimEnabled,
        disabledReason,
      });
    }

    actions.push(ignore);
    return actions;
  }

  /* ── Enemy tile ── */
  if (isEnemy) {
    const attackerBonus = state.dynamics?.activeCopresenceModes?.includes('PresenceBonus') ? 1 : 0;
    const defenderBonusVal = terrainDefendBonus(targetCell.terrainType, state.dynamics?.terrainEnabled);
    const rallyBonus = state.dynamics?.activeCopresenceModes?.includes('Rally') && targetCell.isFortified ? 1 : 0;
    const fortBonus = state.dynamics?.playerRolesEnabled && targetCell.isFort ? 1 : 0;
    const effectiveAttack = carriedTroops + attackerBonus;
    const effectiveDefence = targetCell.troops + defenderBonusVal + rallyBonus + fortBonus;
    const canAttack = effectiveAttack > effectiveDefence;
    actions.push({
      type: 'attack',
      label: 'game.tileAction.attackBtn',
      icon: '⚔️',
      tone: 'danger',
      enabled: canAttack,
      disabledReason: canAttack ? undefined : 'game.tileAction.enemyAttackBlocked',
    });
    actions.push(ignore);
    return actions;
  }

  /* ── Own tile ── */
  if (isOwnHex) {
    if (carriedTroops > 0) {
      actions.push({
        type: 'reinforce',
        label: 'game.tileAction.reinforceBtn',
        icon: '🛡️',
        tone: 'info',
        enabled: true,
      });
    }
    if (targetCell.troops > 0) {
      actions.push({
        type: 'pickup',
        label: 'game.tileAction.pickupBtn',
        icon: '📦',
        tone: 'info',
        enabled: true,
      });
    }
    actions.push(ignore);
    return actions;
  }

  /* ── Allied tile ── */
  if (isAlliedHex) {
    if (carriedTroops > 0) {
      actions.push({
        type: 'reinforce',
        label: 'game.tileAction.reinforceBtn',
        icon: '🛡️',
        tone: 'info',
        enabled: true,
      });
    }
    actions.push(ignore);
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
  t
}: {
  state: GameState;
  player: Player | null;
  targetHex: [number, number] | null;
  targetCell?: GameState['grid'][string];
  currentHex: [number, number] | null;
  t: TFunction;
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

  if (currentHex[0] !== targetHex[0] || currentHex[1] !== targetHex[1]) {
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

    if (state.claimMode === 'AdjacencyRequired' && !isAdjacentToOwnedTerritory(state.grid, targetHex, player)) {
      return {
        action: 'none',
        tone: 'error',
        message: t('game.tileAction.neutralNeedsAdjacency')
      };
    }

    return {
      action: 'place',
      tone: 'info',
      message: t('game.tileAction.neutralClaimPresence'),
      placeOutcome: 'claim'
    };
  }

  const attackerBonus = state.dynamics?.activeCopresenceModes?.includes('PresenceBonus') ? 1 : 0;
  const defenderBonusVal = terrainDefendBonus(targetCell.terrainType, state.dynamics?.terrainEnabled);
  const rallyBonus = state.dynamics?.activeCopresenceModes?.includes('Rally') && targetCell.isFortified ? 1 : 0;
  const fortBonus = state.dynamics?.playerRolesEnabled && targetCell.isFort ? 1 : 0;
  const effectiveAttack = carriedTroops + attackerBonus;
  const effectiveDefence = targetCell.troops + defenderBonusVal + rallyBonus + fortBonus;

  if (effectiveAttack <= effectiveDefence) {
    return {
      action: 'none',
      tone: 'error',
      message: t('game.tileAction.enemyAttackBlocked', { count: targetCell.troops })
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
