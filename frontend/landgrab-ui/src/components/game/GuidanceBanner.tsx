import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { useInfoLedgeStore } from '../../stores/infoLedgeStore';

interface GuidanceBannerStateProps {
  carriedTroops: number;
  isInOwnHex: boolean;
  hasLocation: boolean;
  currentHex: [number, number] | null;
}

export function useGuidanceBannerState({
  carriedTroops,
  isInOwnHex,
  hasLocation,
  currentHex,
}: GuidanceBannerStateProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((state) => state.gameState);
  const currentUserId = useGameStore((state) => state.savedSession?.userId);
  const hasLedgeLocationError = useInfoLedgeStore((state) => state.items.some((item) => item.source === 'locationError'));
  const isCarryingTroops = carriedTroops > 0;
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

    if (!isStandingOnUnclaimedHex) {
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
  }, [currentHexCell, currentPlayer, gameState, t]);
  const computedHint = useMemo(() => {
    if (!hasLocation && !hasLedgeLocationError) {
      return t('guidance.enableLocation');
    }

    if (!currentHex) {
      return t('game.dock.outsideGrid');
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

    return t('guidance.walkToClaim');
  }, [carriedTroops, claimModeHint, currentHex, hasLedgeLocationError, hasLocation, isCarryingTroops, isInOwnHex, t]);
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
        }, 12300);
      }
    } else {
      showTimeout = window.setTimeout(() => {
        setIsVisible(true);
      }, 0);

      if (!isCarryingTroops) {
        hideTimeout = window.setTimeout(() => {
          setIsVisible(false);
        }, 12000);
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

  return { hint, isVisible };
}
