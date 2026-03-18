import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import { hexAreAdjacent } from '../map/HexMath';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores';

interface GuidanceBannerProps {
  carriedTroops: number;
  isInOwnHex: boolean;
  hasLocation: boolean;
}

export function GuidanceBanner({
  carriedTroops,
  isInOwnHex,
  hasLocation
}: GuidanceBannerProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((state) => state.gameState);
  const currentUserId = useGameStore((state) => state.savedSession?.userId);
  const selectedHexKey = useGameplayStore((state) => state.selectedHexKey);
  const isCarryingTroops = carriedTroops > 0;
  const selectedHexCell = useMemo(
    () => (gameState && selectedHexKey ? gameState.grid[selectedHexKey] : undefined),
    [gameState, selectedHexKey]
  );
  const selectedHexExists = Boolean(selectedHexCell);
  const currentPlayer = useMemo(
    () => gameState?.players.find((player) => player.id === currentUserId) ?? null,
    [currentUserId, gameState]
  );
  const currentHexCell = useMemo(() => {
    if (!gameState || !currentPlayer || currentPlayer.currentHexQ == null || currentPlayer.currentHexR == null) {
      return undefined;
    }

    return gameState.grid[`${currentPlayer.currentHexQ},${currentPlayer.currentHexR}`];
  }, [currentPlayer, gameState]);
  const claimModeHint = useMemo(() => {
    if (!gameState || !currentPlayer || currentPlayer.currentHexQ == null || currentPlayer.currentHexR == null) {
      return null;
    }

    const isStandingOnUnclaimedHex = Boolean(currentHexCell && !currentHexCell.ownerId);
    const isSelectedUnclaimedHexNearby = Boolean(
      selectedHexCell
      && !selectedHexCell.ownerId
      && (
        (selectedHexCell.q === currentPlayer.currentHexQ && selectedHexCell.r === currentPlayer.currentHexR)
        || hexAreAdjacent(
          currentPlayer.currentHexQ,
          currentPlayer.currentHexR,
          selectedHexCell.q,
          selectedHexCell.r,
        )
      )
    );

    if (!isStandingOnUnclaimedHex && !isSelectedUnclaimedHexNearby) {
      return null;
    }

    if (gameState.claimMode === 'PresenceOnly') {
      return t('guidance.claimMode.presenceOnly' as never, {
        defaultValue: 'Walk to any hex to claim it for your team',
      });
    }

    if (gameState.claimMode === 'PresenceWithTroop') {
      return t('guidance.claimMode.presenceWithTroop' as never, {
        defaultValue: 'Walk to a hex and carry at least 1 troop to claim it',
      });
    }

    return t('guidance.claimMode.adjacencyRequired' as never, {
      defaultValue: 'You can only claim hexes that border your existing territory. Teammate beacons can extend your reach!',
    });
  }, [currentHexCell, currentPlayer, gameState, selectedHexCell, t]);
  const computedHint = useMemo(() => {
    if (!hasLocation) {
      return t('guidance.enableLocation');
    }

    if (claimModeHint) {
      return claimModeHint;
    }

    if (isCarryingTroops) {
      return t('guidance.carryingTroops', {
        count: carriedTroops,
      });
    }

    if (isInOwnHex) {
      return t('guidance.pickupTroops');
    }

    if (!selectedHexExists) {
      return t('guidance.tapHex');
    }

    return t('guidance.walkToClaim');
  }, [carriedTroops, claimModeHint, hasLocation, isCarryingTroops, isInOwnHex, selectedHexExists, t]);
  const [hint, setHint] = useState<string>(computedHint);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    let swapTimeout: number | undefined;
    let showTimeout: number | undefined;
    let hideTimeout: number | undefined;

    if (computedHint !== hint) {
      showTimeout = window.setTimeout(() => {
        setIsVisible(false);
      }, 0);

      swapTimeout = window.setTimeout(() => {
        setHint(computedHint);
        setIsVisible(true);
      }, 300);

      if (!isCarryingTroops) {
        hideTimeout = window.setTimeout(() => {
          setIsVisible(false);
        }, 5300);
      }
    } else {
      showTimeout = window.setTimeout(() => {
        setIsVisible(true);
      }, 0);

      if (!isCarryingTroops) {
        hideTimeout = window.setTimeout(() => {
          setIsVisible(false);
        }, 5000);
      }
    }

    return () => {
      if (showTimeout != null) {
        window.clearTimeout(showTimeout);
      }

      if (swapTimeout != null) {
        window.clearTimeout(swapTimeout);
      }

      if (hideTimeout != null) {
        window.clearTimeout(hideTimeout);
      }
    };
  }, [computedHint, hint, isCarryingTroops]);

  return (
    <div className={`context-item guidance-tip ${isVisible ? 'enter-active' : ''}`}>
      <span className="context-icon" aria-hidden="true"><GameIcon name="lightning" size="sm" /></span>
      <span>{hint}</span>
    </div>
  );
}
