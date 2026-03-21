import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';

interface BeaconCardProps {
  myUserId: string;
  onActivateBeacon: () => Promise<boolean> | void;
  onDeactivateBeacon: () => Promise<boolean> | void;
}

export function BeaconCard({
  myUserId,
  onActivateBeacon,
  onDeactivateBeacon,
}: BeaconCardProps) {
  const { t } = useTranslation();
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const isBeaconLive = Boolean(player?.isBeacon) || abilityUi.mode === 'active';

  const handleBackToHud = () => {
    if (isBeaconLive) {
      hideAbilityCard();
      return;
    }

    exitAbilityMode();
  };

  const handleActivate = async () => {
    const succeeded = await Promise.resolve(onActivateBeacon());
    if (succeeded === false) {
      return;
    }

    activateAbility();
  };

  const handleDeactivate = async () => {
    const succeeded = await Promise.resolve(onDeactivateBeacon());
    if (succeeded === false) {
      return;
    }

    exitAbilityMode();
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
        <button
          type="button"
          className="ability-card__secondary-btn ability-card__secondary-btn--danger"
          onClick={() => {
            void handleDeactivate();
          }}
        >
          {t('abilities.beacon.deactivate' as never)}
        </button>
      ) : (
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => {
            void handleActivate();
          }}
        >
          {t('abilities.beacon.activate' as never)}
        </button>
      )}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        <div className="ability-card__copy">
          <ul className="ability-card__detail-list">
            <li>{t('abilities.beacon.effect' as never)}</li>
            <li>{t('abilities.beacon.rangeInfo' as never)}</li>
          </ul>
        </div>
      </div>
    </AbilityCard>
  );
}
