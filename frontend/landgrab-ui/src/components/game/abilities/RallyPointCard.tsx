import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useDeviceMotion } from '../../../hooks/useDeviceMotion';

interface RallyPointCardProps {
  myUserId: string;
  currentHex: [number, number] | null;
  onActivateRallyPoint: () => Promise<boolean> | void;
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
  onActivateRallyPoint,
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

  const { pitch, supported, permissionState, requestPermission } = useDeviceMotion(true);
  const [holdProgress, setHoldProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

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

    const succeeded = await Promise.resolve(onActivateRallyPoint());
    if (succeeded === false) {
      return;
    }

    activateAbility();
  };

  useEffect(() => {
    if (isRallyActive || !isFriendlyHex) {
      if (holdProgress !== 0) {
        setHoldProgress(0);
      }
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    
    if (pitch !== null && pitch >= 60) {
      if (timerRef.current === null) {
        timerRef.current = window.setInterval(() => {
          setHoldProgress(prev => {
            if (prev >= 2000) {
              window.clearInterval(timerRef.current!);
              timerRef.current = null;
              void handleActivate();
              return 2000;
            }
            return prev + 100;
          });
        }, 100);
      }
    } else {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (holdProgress !== 0) {
        setHoldProgress(0);
      }
    }
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch, isRallyActive, isFriendlyHex, holdProgress]);

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
        <div className="ability-card__stack">
          {permissionState === 'prompt' && (
            <button
              type="button"
              className="ability-card__secondary-btn"
              onClick={() => void requestPermission()}
            >
              Grant Motion Access
            </button>
          )}
          {supported ? (
            <div className="ability-card__pitch-indicator">
              <p className="ability-card__status-copy">
                {pitch !== null && pitch >= 60 
                  ? <strong>Holding steady… {(holdProgress / 1000).toFixed(1)}s / 2.0s</strong>
                  : "Raise your device to signal the rally"}
              </p>
              <div className="ability-card__progress-container">
                <progress value={holdProgress} max={2000} className="ability-card__progress-bar" />
              </div>
              <button
                type="button"
                className="ability-card__secondary-btn"
                onClick={() => void handleActivate()}
                disabled={!isFriendlyHex}
              >
                Tap to override
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ability-card__primary-btn"
              onClick={() => void handleActivate()}
              disabled={!isFriendlyHex}
            >
              Tap to activate
            </button>
          )}
        </div>
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
            {!isFriendlyHex ? (
              <p className="ability-card__warning">{t('abilities.rallyPoint.invalidHexHint' as never)}</p>
            ) : (
              <p>Raise your device (≥ 60°) to signal a rally point to your team.</p>
            )}
          </div>
        )}
      </div>
    </AbilityCard>
  );
}