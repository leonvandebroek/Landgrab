import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';

interface RallyPointCardProps {
  myUserId: string;
  currentHex: [number, number] | null;
  onActivateReinforce: () => Promise<boolean> | void;
}

function formatTimeRemaining(until: string | undefined): string | null {
  if (!until) {
    return null;
  }

  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) {
    return null;
  }

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function RallyPointCard({
  myUserId,
  currentHex,
  onActivateReinforce,
}: RallyPointCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const currentHexKey = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
  const currentHexCell = currentHexKey ? gameState?.grid[currentHexKey] ?? null : null;
  const isFriendlyHex = Boolean(
    currentHexCell
    && player
    && (
      currentHexCell.ownerId === player.id
      || (
        player.allianceId
        && currentHexCell.ownerAllianceId === player.allianceId
      )
    ),
  );

  const isRallyActive = Boolean(player?.rallyPointActive) || abilityUi.mode === 'active';
  const rallyCountdown = formatTimeRemaining(player?.rallyPointDeadline);
  const rallyHexLabel = player?.rallyPointQ != null && player?.rallyPointR != null
    ? `${player.rallyPointQ}, ${player.rallyPointR}`
    : currentHex
      ? `${currentHex[0]}, ${currentHex[1]}`
      : '—';

  const currentHexLabel = currentHex ? `${currentHex[0]}, ${currentHex[1]}` : '—';
  const rallyHexCell = useMemo(() => {
    if (!gameState || player?.rallyPointQ == null || player.rallyPointR == null) {
      return null;
    }

    return gameState.grid[`${player.rallyPointQ},${player.rallyPointR}`] ?? null;
  }, [gameState, player?.rallyPointQ, player?.rallyPointR]);

  const handleBackToHud = () => {
    if (isRallyActive) {
      hideAbilityCard();
      return;
    }

    exitAbilityMode();
  };

  const handleActivate = async () => {
    if (!isFriendlyHex) {
      return;
    }

    const succeeded = await Promise.resolve(onActivateReinforce());
    if (succeeded === false) {
      return;
    }

    activateAbility();
  };

  return (
    <AbilityCard
      title={t('abilities.rallyPoint.title' as never)}
      icon={<GameIcon name="rallyTroops" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isRallyActive ? 'ability-card__status-pill--live' : ''}`}>
            <GameIcon name="rallyTroops" size="sm" />
            <span>
              {isRallyActive
                ? t('abilities.rallyPoint.active' as never)
                : t('abilities.rallyPoint.confirming' as never)}
            </span>
          </div>

          <p className="ability-card__status-copy">
            {isRallyActive
              ? t('abilities.rallyPoint.activeSummary' as never)
              : t('abilities.rallyPoint.confirmSummary' as never)}
          </p>

          <div className="ability-card__meta-row">
            <span className="ability-card__meta-label">
              {isRallyActive
                ? t('abilities.rallyPoint.rallyHexLabel' as never)
                : t('abilities.rallyPoint.currentHexLabel' as never)}
            </span>
            <span className="ability-card__meta-value">
              {isRallyActive ? rallyHexLabel : currentHexLabel}
            </span>
          </div>

          {!isRallyActive && !isFriendlyHex && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.fortConstruction.validityLabel' as never)}</span>
              <span className="ability-card__meta-value">{t('abilities.fortConstruction.invalidState' as never)}</span>
            </div>
          )}

          {isRallyActive && rallyCountdown && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.rallyPoint.deadlineLabel' as never)}</span>
              <span className="ability-card__meta-value">{rallyCountdown}</span>
            </div>
          )}

          {isRallyActive && rallyHexCell && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.rallyPoint.currentTroopsLabel' as never)}</span>
              <span className="ability-card__meta-value">{rallyHexCell.troops}</span>
            </div>
          )}
        </>
      )}
      footerContent={!isRallyActive ? (
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => {
            void handleActivate();
          }}
          disabled={!isFriendlyHex}
        >
          {t('abilities.rallyPoint.start' as never)}
        </button>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        {isRallyActive ? (
          <div className="ability-card__copy">
            <ul className="ability-card__detail-list">
              <li>{t('abilities.rallyPoint.troopsAwardHint' as never)}</li>
              <li>{t('abilities.rallyPoint.backHint' as never)}</li>
            </ul>
          </div>
        ) : (
          <div className="ability-card__copy">
            {!isFriendlyHex && (
              <p className="ability-card__warning">{t('abilities.rallyPoint.invalidHexHint' as never)}</p>
            )}
          </div>
        )}
      </div>
    </AbilityCard>
  );
}