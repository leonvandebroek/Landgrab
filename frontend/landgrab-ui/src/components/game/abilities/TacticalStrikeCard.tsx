import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';
import type { AbilityCardProps } from '../../../types/abilities';

function formatTimeRemaining(until: string | undefined): string | null {
  if (!until) return null;
  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function TacticalStrikeCard({ myUserId, invoke }: AbilityCardProps) {
  const { t } = useTranslation();
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

  useEffect(() => {
    if (isArmed || !invoke) return undefined;

    const handle = window.setInterval(() => {
      const nextHeading = heading ?? 0;
      void invoke<{ targetQ: number; targetR: number } | null>('ResolveTacticalStrikeTarget', nextHeading)
        .then((result) => {
          setResolvedTarget(result ? [result.targetQ, result.targetR] : null);
        });
    }, 500);

    return () => window.clearInterval(handle);
  }, [isArmed, heading, invoke]);

  const handleBackToHud = () => {
    if (isArmed) {
      hideAbilityCard();
      return;
    }
    exitAbilityMode();
  };

  const handleArmStrike = async (targetQ: number, targetR: number) => {
    if (!invoke) return;
    const succeeded = await invoke<boolean>('ActivateTacticalStrike', targetQ, targetR);
    if (succeeded === false) return;
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
