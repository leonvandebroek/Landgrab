import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';

interface TacticalStrikeCardProps {
  myUserId: string;
  onActivateTacticalStrike: (targetQ: number, targetR: number) => Promise<boolean> | void;
  onResolveTacticalStrikeTarget?: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  currentHex: [number, number] | null;
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

export function TacticalStrikeCard({
  myUserId,
  onActivateTacticalStrike,
  onResolveTacticalStrikeTarget,
  currentHex,
}: TacticalStrikeCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const { heading } = useDeviceOrientation(!player?.tacticalStrikeActive && abilityUi.mode === 'targeting');
  const [resolvedTarget, setResolvedTarget] = useState<[number, number] | null>(null);

  const strikeCountdown = formatTimeRemaining(player?.tacticalStrikeExpiry);
  const isArmed = Boolean(player?.tacticalStrikeActive) || abilityUi.mode === 'active';

  let isCurrentHexValid = false;
  if (currentHex && gameState && player) {
    const key = `${currentHex[0]},${currentHex[1]}`;
    const cell = gameState.grid[key];
    if (cell && (cell.ownerId === undefined || cell.ownerAllianceId !== player.allianceId)) {
      isCurrentHexValid = true;
    }
  }

  useEffect(() => {
    let handle = -1;
    // For tactical strike, "ready" means we are targeting
    if (!isArmed && onResolveTacticalStrikeTarget) {
      handle = window.setInterval(() => {
        const h = heading ?? 0;
        void onResolveTacticalStrikeTarget(h).then(res => {
          if (res) {
            setResolvedTarget([res.targetQ, res.targetR]);
          } else {
            setResolvedTarget(null);
          }
        });
      }, 500);
    } else {
      setTimeout(() => { setResolvedTarget(null); }, 0);
    }
    
    return () => {
      if (handle !== -1) {
        window.clearInterval(handle);
      }
    };
  }, [isArmed, heading, onResolveTacticalStrikeTarget]);

  const handleBackToHud = () => {
    if (isArmed) {
      hideAbilityCard();
      return;
    }

    exitAbilityMode();
  };

  const handleArmStrike = async (targetQ: number, targetR: number) => {
    const succeeded = await Promise.resolve(onActivateTacticalStrike(targetQ, targetR));
    if (succeeded === false) {
      return;
    }

    activateAbility();
  };

  return (
    <AbilityCard
      title={t('abilities.tacticalStrike.title' as never)}
      icon={<GameIcon name="lightning" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isArmed ? 'ability-card__status-pill--armed' : ''}`}>
            <GameIcon name="lightning" size="sm" />
            <span>
              {isArmed
                ? t('abilities.tacticalStrike.armed' as never)
                : t('abilities.tacticalStrike.confirming' as never)}
            </span>
          </div>

          <p className="ability-card__status-copy">
            {isArmed
              ? t('abilities.tacticalStrike.armedSummary' as never)
              : (resolvedTarget ? 'Target acquired.' : 'Point your device to find a target')}
          </p>

          {!isArmed && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">Target Hex</span>
              <span className="ability-card__meta-value">
                {resolvedTarget ? `${resolvedTarget[0]}, ${resolvedTarget[1]}` : 'No target in direction'}
              </span>
            </div>
          )}

          {strikeCountdown && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.tacticalStrike.expiryLabel' as never)}</span>
              <span className="ability-card__meta-value">{strikeCountdown}</span>
            </div>
          )}
        </>
      )}
      footerContent={!isArmed ? (
        <>
          <button
            type="button"
            className="ability-card__primary-btn"
            onClick={() => {
              if (resolvedTarget) {
                void handleArmStrike(resolvedTarget[0], resolvedTarget[1]);
              }
            }}
            disabled={!resolvedTarget}
          >
            Lock Target
          </button>
          
          {isCurrentHexValid && currentHex && (
            <button
              type="button"
              className="ability-card__secondary-btn"
              onClick={() => {
                void handleArmStrike(currentHex[0], currentHex[1]);
              }}
            >
              Use Current Hex
            </button>
          )}
        </>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        {isArmed ? (
          <div className="ability-card__copy">
            <ul className="ability-card__detail-list">
              <li>{t('abilities.tacticalStrike.effect' as never)}</li>
              <li>{t('abilities.tacticalStrike.backHint' as never)}</li>
            </ul>
          </div>
        ) : (
          <div className="ability-card__copy">
            <p className="ability-card__warning">
              {t('abilities.tacticalStrike.reminder' as never)}
            </p>
            <ul className="ability-card__detail-list">
              <li>{t('abilities.tacticalStrike.effect' as never)}</li>
            </ul>
          </div>
        )}
      </div>
    </AbilityCard>
  );
}
