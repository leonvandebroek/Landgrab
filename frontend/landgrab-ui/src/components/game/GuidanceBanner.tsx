import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores/gameplayStore';

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
  const selectedHexKey = useGameplayStore((state) => state.selectedHexKey);
  const selectedHexExists = useMemo(
    () => Boolean(gameState && selectedHexKey && gameState.grid[selectedHexKey]),
    [gameState, selectedHexKey]
  );
  const computedHint = useMemo(() => {
    if (!hasLocation) {
      return t('guidance.enableLocation');
    }

    if (carriedTroops > 0) {
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
  }, [carriedTroops, hasLocation, isInOwnHex, selectedHexExists, t]);
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

      hideTimeout = window.setTimeout(() => {
        setIsVisible(false);
      }, 5300);
    } else {
      showTimeout = window.setTimeout(() => {
        setIsVisible(true);
      }, 0);

      hideTimeout = window.setTimeout(() => {
        setIsVisible(false);
      }, 5000);
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
  }, [computedHint, hint]);

  return (
    <div className={`guidance-banner ${isVisible ? 'visible' : ''}`}>
      <span className="guidance-icon">💡</span>
      <span className="guidance-text">{hint}</span>
    </div>
  );
}
