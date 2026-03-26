import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import type { AbilityCardProps } from '../../../types/abilities';

export function FortConstructionCard({ myUserId, invoke }: AbilityCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const setAbilityMode = useGameplayStore((store) => store.setAbilityMode);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  // Derive currentHex from player position instead of requiring it as a prop.
  const currentHex: [number, number] | null =
    player?.currentHexQ != null && player?.currentHexR != null
      ? [player.currentHexQ, player.currentHexR]
      : null;

  const currentHexKey = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
  const currentHexCell = currentHexKey ? gameState?.grid[currentHexKey] ?? null : null;
  const isCurrentHexValid = Boolean(
    currentHexCell
    && player
    && currentHexCell.ownerId === player.id
    && !currentHexCell.isFort,
  );

  const fortProgress = player?.fortPerimeterVisited?.length ?? 0;
  const isMissionInProgress = Boolean(player?.fortTargetQ != null) || abilityUi.mode === 'inProgress';
  const currentHexLabel = currentHex ? `${currentHex[0]}, ${currentHex[1]}` : '—';

  const handleBackToHud = () => {
    if (isMissionInProgress) {
      hideAbilityCard();
      return;
    }
    exitAbilityMode();
  };

  const handleStart = async () => {
    if (!invoke || !isCurrentHexValid) return;
    const succeeded = await invoke<boolean>('StartFortConstruction');
    if (succeeded === false) return;
    setAbilityMode('inProgress');
  };

  const handleAbort = async () => {
    if (!invoke) return;
    const succeeded = await invoke<boolean>('CancelFortConstruction');
    if (succeeded === false) return;
    exitAbilityMode();
  };

  return (
    <AbilityCard
      title={t('abilities.fortConstruction.title' as never)}
      icon={<GameIcon name="fort" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isMissionInProgress ? 'ability-card__status-pill--live' : ''}`}>
            <GameIcon name="fort" size="sm" />
            <span>
              {isMissionInProgress
                ? t('abilities.fortConstruction.inProgress' as never)
                : t('abilities.fortConstruction.targeting' as never)}
            </span>
          </div>

          <p className="ability-card__status-copy">
            {isMissionInProgress
              ? t('abilities.fortConstruction.progressSummary' as never)
              : t('abilities.fortConstruction.targetingSummary' as never)}
          </p>

          <div className="ability-card__meta-row">
            <span className="ability-card__meta-label">
              {isMissionInProgress
                ? t('abilities.fortConstruction.progressLabel' as never)
                : t('abilities.fortConstruction.currentHexLabel' as never)}
            </span>
            <span className="ability-card__meta-value">
              {isMissionInProgress ? `${fortProgress}/6` : currentHexLabel}
            </span>
          </div>

          {!isMissionInProgress && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.fortConstruction.validityLabel' as never)}</span>
              <span className="ability-card__meta-value">
                {isCurrentHexValid
                  ? t('abilities.fortConstruction.validState' as never)
                  : t('abilities.fortConstruction.invalidState' as never)}
              </span>
            </div>
          )}
        </>
      )}
      footerContent={!isMissionInProgress ? (
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => { void handleStart(); }}
          disabled={!isCurrentHexValid}
        >
          {t('abilities.fortConstruction.start' as never)}
        </button>
      ) : undefined}
      onBackToHud={handleBackToHud}
      showAbort={isMissionInProgress}
      onAbort={() => { void handleAbort(); }}
    >
      <div className="ability-card__stack">
        {isMissionInProgress ? (
          <div className="ability-card__copy">
            <ul className="ability-card__detail-list">
              <li>{t('abilities.fortConstruction.perimeterHint' as never)}</li>
              <li>{t('abilities.fortConstruction.backHint' as never)}</li>
            </ul>
          </div>
        ) : (
          <div className="ability-card__copy">
            {!isCurrentHexValid && (
              <p className="ability-card__warning">{t('abilities.fortConstruction.invalidHexHint' as never)}</p>
            )}
          </div>
        )}
      </div>
    </AbilityCard>
  );
}
