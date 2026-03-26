import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';
import type { AbilityCardProps } from '../../../types/abilities';

export function BeaconCard({ myUserId, invoke }: AbilityCardProps) {
  const { t } = useTranslation();
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const { heading } = useDeviceOrientation(abilityUi.mode === 'targeting' || abilityUi.mode === 'active');

  const [isSharing, setIsSharing] = useState(false);
  const [shareCount, setShareCount] = useState<number | null>(null);

  const isBeaconLive = Boolean(player?.isBeacon) || abilityUi.mode === 'active';
  const isScout = player?.role === 'Scout';

  const handleBackToHud = () => {
    if (isBeaconLive) {
      hideAbilityCard();
      return;
    }
    exitAbilityMode();
  };

  const handleActivate = async () => {
    if (!invoke) return;
    const activeHeading = heading ?? 0;
    activateAbility();
    const succeeded = await invoke<boolean>('ActivateBeacon', activeHeading);
    if (succeeded === false) {
      exitAbilityMode();
    }
  };

  const handleDeactivate = async () => {
    if (!invoke) return;
    const succeeded = await invoke<boolean>('DeactivateBeacon');
    if (succeeded === false) return;
    exitAbilityMode();
  };

  const handleShareIntel = async () => {
    if (!invoke) return;
    setIsSharing(true);
    const count = (await invoke<number>('ShareBeaconIntel')) ?? 0;
    setShareCount(count);
    setIsSharing(false);
    setTimeout(() => setShareCount(null), 3000);
  };

  return (
    <AbilityCard
      title={t('abilities.beacon.title' as never)}
      icon={<GameIcon name="radioTower" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isBeaconLive ? 'ability-card__status-pill--live' : ''}`}>
            <GameIcon name="radioTower" size="sm" />
            <span>
              {isBeaconLive
                ? t('abilities.beacon.live' as never)
                : t('abilities.beacon.ready' as never)}
            </span>
          </div>

          <p className="ability-card__status-copy">
            {isBeaconLive
              ? t('abilities.beacon.activeSummary' as never)
              : t('abilities.beacon.inactiveSummary' as never)}
          </p>
        </>
      )}
      footerContent={isBeaconLive ? (
        <div className="ability-card__footer-row">
          {isScout ? (
            <span
              className="ability-card__status-pill"
              title={t('abilities.beacon.alwaysActive' as never)}
            >
              {t('abilities.beacon.alwaysActive' as never)}
            </span>
          ) : (
            <button
              type="button"
              className="ability-card__secondary-btn ability-card__secondary-btn--danger"
              onClick={() => { void handleDeactivate(); }}
            >
              {t('abilities.beacon.deactivate' as never)}
            </button>
          )}
          <button
            type="button"
            className="ability-card__primary-btn"
            disabled={isSharing}
            onClick={() => { void handleShareIntel(); }}
          >
            {t('abilities.beacon.shareIntel' as never)}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => { void handleActivate(); }}
        >
          {t('abilities.beacon.activate' as never)}
        </button>
      )}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        {!isBeaconLive && (
          <div className="ability-card__sensor-status ability-card__sensor-status--panel">
            <span className="ability-card__sensor-label">
              Current Heading
            </span>
            <strong className="ability-card__sensor-value">
              {heading !== null ? `${Math.round(heading)}°` : 'Searching...'}
            </strong>
          </div>
        )}
        <div className="ability-card__copy">
          <ul className="ability-card__detail-list">
            <li>{t('abilities.beacon.effect' as never)}</li>
            <li>{t('abilities.beacon.rangeInfo' as never)}</li>
            <li>{t('abilities.beacon.sectorExplanation' as never)}</li>
          </ul>
        </div>
        {isBeaconLive && shareCount !== null && (
          <p className="ability-card__feedback">
            {shareCount > 0
              ? t('abilities.beacon.shareIntelDone' as never, { count: shareCount })
              : t('abilities.beacon.shareIntelNone' as never)}
          </p>
        )}
      </div>
    </AbilityCard>
  );
}
