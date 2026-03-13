import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';

interface GuidanceBannerProps {
  gameState: GameState;
  selectedHexKey: string | null;
  carriedTroops: number;
  isInOwnHex: boolean;
  hasLocation: boolean;
}

export function GuidanceBanner({
  gameState,
  selectedHexKey,
  carriedTroops,
  isInOwnHex,
  hasLocation
}: GuidanceBannerProps) {
  const { t } = useTranslation();
  const selectedHexExists = useMemo(
    () => Boolean(selectedHexKey && gameState.grid[selectedHexKey]),
    [gameState.grid, selectedHexKey]
  );
  const computedHint = useMemo(() => {
    if (!hasLocation) {
      return t('guidance.noLocation' as never, { defaultValue: 'Enable location to play' });
    }

    if (carriedTroops > 0) {
      return t('guidance.deployTroops' as never, {
        defaultValue: 'You are carrying {{count}} troops — tap an enemy or neutral hex to deploy',
        count: carriedTroops,
      });
    }

    if (isInOwnHex) {
      return t('guidance.pickupHere' as never, { defaultValue: 'Tap your hex to pick up troops' });
    }

    if (!selectedHexExists) {
      return t('guidance.selectHex' as never, { defaultValue: 'Tap a hex to see what you can do' });
    }

    return t('guidance.explore' as never, { defaultValue: 'Walk to a hex to claim it' });
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
