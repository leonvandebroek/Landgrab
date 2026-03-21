import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';

interface DemolishCardProps {
  myUserId: string;
  currentHex: [number, number] | null;
  onStartDemolish: () => Promise<boolean> | void;
  onCancelDemolish: () => Promise<boolean> | void;
}

export function DemolishCard({
  myUserId,
  currentHex,
  onStartDemolish,
  onCancelDemolish,
}: DemolishCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const setAbilityMode = useGameplayStore((store) => store.setAbilityMode);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const currentHexKey = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
  const currentHexCell = currentHexKey ? gameState?.grid[currentHexKey] ?? null : null;
  const isFriendlyHex = Boolean(
    currentHexCell
    && player
    && (
      currentHexCell.ownerId === player.id
      || (player.allianceId && currentHexCell.ownerAllianceId === player.allianceId)
    ),
  );
  const isCurrentHexValid = Boolean(
    currentHexCell
    && currentHexCell.isFort
    && currentHexCell.ownerId
    && !isFriendlyHex,
  );

  const demolishProgress = player?.demolishApproachDirectionsMade?.length ?? 0;
  const isMissionInProgress = Boolean(player?.demolishTargetKey) || abilityUi.mode === 'inProgress';
  const currentHexLabel = currentHex ? `${currentHex[0]}, ${currentHex[1]}` : '—';

  const handleBackToHud = () => {
    if (isMissionInProgress) {
      hideAbilityCard();
      return;
    }

    exitAbilityMode();
  };

  const handleStart = async () => {
    if (!isCurrentHexValid) {
      return;
    }

    const succeeded = await Promise.resolve(onStartDemolish());
    if (succeeded === false) {
      return;
    }

    setAbilityMode('inProgress');
  };

  const handleAbort = async () => {
    const succeeded = await Promise.resolve(onCancelDemolish());
    if (succeeded === false) {
      return;
    }

    exitAbilityMode();
  };

  return (
    <AbilityCard
      title={t('abilities.demolish.title' as never)}
      icon={<GameIcon name="hammerDrop" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isMissionInProgress ? 'ability-card__status-pill--hostile' : ''}`}>
            <GameIcon name="hammerDrop" size="sm" />
            <span>
              {isMissionInProgress
                ? t('abilities.demolish.inProgress' as never)
                : t('abilities.demolish.targeting' as never)}
            </span>
          </div>

          <p className="ability-card__status-copy">
            {isMissionInProgress
              ? t('abilities.demolish.progressSummary' as never)
              : t('abilities.demolish.targetingSummary' as never)}
          </p>

          <div className="ability-card__meta-row">
            <span className="ability-card__meta-label">
              {isMissionInProgress
                ? t('abilities.demolish.progressLabel' as never)
                : t('abilities.demolish.currentHexLabel' as never)}
            </span>
            <span className="ability-card__meta-value">
              {isMissionInProgress ? `${demolishProgress}/3` : currentHexLabel}
            </span>
          </div>

          {!isMissionInProgress && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.demolish.validityLabel' as never)}</span>
              <span className="ability-card__meta-value">
                {isCurrentHexValid
                  ? t('abilities.demolish.validState' as never)
                  : t('abilities.demolish.invalidState' as never)}
              </span>
            </div>
          )}
        </>
      )}
      footerContent={!isMissionInProgress ? (
        <button
          type="button"
          className="ability-card__primary-btn ability-card__primary-btn--hostile"
          onClick={() => {
            void handleStart();
          }}
          disabled={!isCurrentHexValid}
        >
          {t('abilities.demolish.start' as never)}
        </button>
      ) : undefined}
      onBackToHud={handleBackToHud}
      showAbort={isMissionInProgress}
      onAbort={() => {
        void handleAbort();
      }}
    >
      <div className="ability-card__stack">
        {isMissionInProgress ? (
          <div className="ability-card__copy">
            <ul className="ability-card__detail-list">
              <li>{t('abilities.demolish.approachHint' as never)}</li>
              <li>{t('abilities.demolish.backHint' as never)}</li>
            </ul>
          </div>
        ) : (
          <div className="ability-card__copy">
            {!isCurrentHexValid && (
              <p className="ability-card__warning">{t('abilities.demolish.invalidHexHint' as never)}</p>
            )}
          </div>
        )}
      </div>
    </AbilityCard>
  );
}