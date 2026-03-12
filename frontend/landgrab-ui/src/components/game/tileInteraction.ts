import type { TFunction } from 'i18next';
import type { GameState, Player } from '../../types/game';
import { hexKey, hexNeighbors } from '../map/HexMath';

export type MapInteractionTone = 'info' | 'success' | 'error';

export interface MapInteractionFeedback {
  tone: MapInteractionTone;
  message: string;
  targetHex?: [number, number] | null;
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

  if (carriedTroops <= targetCell.troops) {
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
