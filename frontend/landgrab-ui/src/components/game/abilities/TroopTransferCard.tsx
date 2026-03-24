import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';
import { useSecondTick } from '../../../hooks/useSecondTick';

interface TroopTransferCardProps {
  myUserId: string;
  onResolveTroopTransferTarget: (heading: number) => Promise<{ recipientId: string; recipientName: string } | null>;
  onInitiateTroopTransfer: (amount: number, recipientId: string) => Promise<{ transferId: string } | null>;
}

function formatTimeRemaining(until: string | undefined, now: number): string | null {
  if (!until) return null;
  const remaining = new Date(until).getTime() - now;
  if (remaining <= 0) return null;
  const seconds = Math.ceil(remaining / 1000);
  return String(seconds);
}

export function TroopTransferCard({
  myUserId,
  onResolveTroopTransferTarget,
  onInitiateTroopTransfer,
}: TroopTransferCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const { heading } = useDeviceOrientation(abilityUi.mode !== 'active');
  const [resolvedRecipient, setResolvedRecipient] = useState<{ recipientId: string; recipientName: string } | null>(null);
  const [transferAmount, setTransferAmount] = useState(1);
  const [now, setNow] = useState(() => Date.now());

  useSecondTick(() => {
    setNow(Date.now());
  });

  const isActive = abilityUi.mode === 'active';
  const cooldownCountdown = formatTimeRemaining(player?.troopTransferCooldownUntil, now);

  const activeTransfer = gameState?.activeTroopTransfers?.find(
    (transfer) => transfer.initiatorId === myUserId,
  ) ?? null;
  const expiresCountdown = activeTransfer ? formatTimeRemaining(activeTransfer.expiresAt, now) : null;

  const maxTroops = player?.carriedTroops ?? 0;
  const displayedTransferAmount = maxTroops > 0 ? Math.min(transferAmount, maxTroops) : transferAmount;

  useEffect(() => {
    if (isActive || cooldownCountdown) {
      return undefined;
    }

    const handle = window.setInterval(() => {
      const nextHeading = heading ?? 0;
      void onResolveTroopTransferTarget(nextHeading).then((result) => {
        setResolvedRecipient(result);
      });
    }, 500);

    return () => window.clearInterval(handle);
  }, [isActive, cooldownCountdown, heading, onResolveTroopTransferTarget]);

  const handleBackToHud = useCallback(() => {
    if (isActive || cooldownCountdown) {
      hideAbilityCard();
      return;
    }
    exitAbilityMode();
  }, [isActive, cooldownCountdown, hideAbilityCard, exitAbilityMode]);

  const handleSend = useCallback(async () => {
    if (!resolvedRecipient || displayedTransferAmount < 1) return;
    const result = await onInitiateTroopTransfer(displayedTransferAmount, resolvedRecipient.recipientId);
    if (!result) return;
    activateAbility();
  }, [resolvedRecipient, displayedTransferAmount, onInitiateTroopTransfer, activateAbility]);

  const canSend = Boolean(resolvedRecipient) && displayedTransferAmount >= 1 && maxTroops > 0;

  return (
    <AbilityCard
      title={t('abilities.troopTransfer.title' as never)}
      icon={<GameIcon name="helmet" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isActive ? 'ability-card__status-pill--armed' : ''}`}>
            <GameIcon name="helmet" size="sm" />
            <span>
              {isActive
                ? t('abilities.troopTransfer.active' as never)
                : cooldownCountdown
                  ? t('abilities.troopTransfer.cooldown' as never)
                  : t('abilities.troopTransfer.targeting' as never)}
            </span>
          </div>

          {!isActive && !cooldownCountdown && (
            <>
              <div className="ability-card__meta-row">
                <span className="ability-card__meta-label">{t('abilities.troopTransfer.recipientLabel' as never)}</span>
                <span className="ability-card__meta-value">
                  {resolvedRecipient
                    ? resolvedRecipient.recipientName
                    : t('abilities.troopTransfer.noAllyInDirection' as never)}
                </span>
              </div>
              <div className="ability-card__meta-row">
                <span className="ability-card__meta-label">{t('abilities.troopTransfer.amountLabel' as never)}</span>
                <span className="ability-card__meta-value">
                  <button
                    type="button"
                    className="ability-card__stepper-btn"
                    onClick={() => setTransferAmount((value) => Math.max(1, Math.min(displayedTransferAmount, value) - 1))}
                    disabled={displayedTransferAmount <= 1}
                  >−</button>
                  <span className="ability-card__stepper-value">{displayedTransferAmount}</span>
                  <button
                    type="button"
                    className="ability-card__stepper-btn"
                    onClick={() => setTransferAmount((value) => Math.min(maxTroops, Math.max(displayedTransferAmount, value) + 1))}
                    disabled={displayedTransferAmount >= maxTroops}
                  >+</button>
                </span>
              </div>
            </>
          )}

          {isActive && activeTransfer && (
            <>
              <p className="ability-card__status-copy">
                {t('abilities.troopTransfer.waitingForResponse' as never, { name: activeTransfer.recipientName })}
              </p>
              {expiresCountdown && (
                <div className="ability-card__meta-row">
                  <span className="ability-card__meta-label">{t('abilities.troopTransfer.expiresIn' as never, { seconds: expiresCountdown })}</span>
                </div>
              )}
            </>
          )}

          {cooldownCountdown && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.troopTransfer.cooldownLabel' as never)}</span>
              <span className="ability-card__meta-value">{cooldownCountdown}s</span>
            </div>
          )}
        </>
      )}
      footerContent={!isActive && !cooldownCountdown ? (
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => { void handleSend(); }}
          disabled={!canSend}
        >
          {t('abilities.troopTransfer.confirm' as never)}
        </button>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        <div className="ability-card__copy">
          {!isActive && !cooldownCountdown && (
            <p className="ability-card__status-copy">
              {maxTroops === 0
                ? t('abilities.troopTransfer.notEnoughTroops' as never)
                : t('abilities.troopTransfer.pointAtAlly' as never)}
            </p>
          )}
        </div>
      </div>
    </AbilityCard>
  );
}
