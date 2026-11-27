import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';
import { useSecondTick } from '../../../hooks/useSecondTick';
import type { AbilityCardProps } from '../../../types/abilities';
import { bearingDegrees, resolveTroopTransferTarget } from '../../../utils/combatCalculations';
import { haversineDistanceM } from '../../../utils/geo';
import { Icon } from '../../ui/Icon';
import { Button, Stepper, cx } from '../../ui/kit';

function secondsLeft(until: string | undefined, now: number): number | null {
  if (!until) return null;
  const remaining = new Date(until).getTime() - now;
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

const DIRECTIONS = ['north', 'northEast', 'east', 'southEast', 'south', 'southWest', 'west', 'northWest'] as const;

/** Give troops you carry to a teammate. Pointing your phone at one picks them. */
export function TroopTransferCard({ myUserId, invoke }: AbilityCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) => store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null);
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const isActive = abilityUi.mode === 'active';
  const { heading } = useDeviceOrientation(!isActive);
  const [picked, setPicked] = useState<string | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const [amount, setAmount] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);

  useSecondTick(() => setNow(Date.now()));

  const cooldown = secondsLeft(player?.troopTransferCooldownUntil, now);
  const activeTransfer = gameState?.activeTroopTransfers?.find((transfer) => transfer.initiatorId === myUserId) ?? null;
  const expires = activeTransfer ? secondsLeft(activeTransfer.expiresAt, now) : null;
  const carried = player?.carriedTroops ?? 0;
  const safeAmount = Math.max(1, Math.min(amount, Math.max(1, carried)));

  const teammates = useMemo(() => {
    if (!player || !gameState || !player.allianceId) return [];
    return gameState.players
      .filter((candidate) => candidate.id !== player.id && candidate.allianceId === player.allianceId)
      .map((candidate) => {
        const hasPositions = player.currentLat != null && player.currentLng != null && candidate.currentLat != null && candidate.currentLng != null;
        const distance = hasPositions
          ? haversineDistanceM(player.currentLat!, player.currentLng!, candidate.currentLat!, candidate.currentLng!)
          : null;
        const bearing = hasPositions
          ? bearingDegrees(player.currentLat!, player.currentLng!, candidate.currentLat!, candidate.currentLng!)
          : null;
        return { id: candidate.id, name: candidate.name, distance, bearing };
      })
      .sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE));
  }, [gameState, player]);

  // Pointing the phone at a teammate picks the same row.
  useEffect(() => {
    if (isActive || cooldown || heading == null || !player || !gameState) return undefined;
    const handle = window.setInterval(() => {
      const target = resolveTroopTransferTarget(player, gameState.players, heading);
      setPointed(target?.recipientId ?? null);
    }, 500);
    return () => window.clearInterval(handle);
  }, [cooldown, gameState, heading, isActive, player]);

  const recipientId = picked ?? pointed ?? teammates[0]?.id ?? null;
  const recipient = teammates.find((mate) => mate.id === recipientId) ?? null;

  const handleBack = useCallback(() => {
    if (isActive || cooldown) hideAbilityCard();
    else exitAbilityMode();
  }, [cooldown, exitAbilityMode, hideAbilityCard, isActive]);

  const handleSend = useCallback(async () => {
    if (!recipient || !invoke || carried < 1) return;
    setSending(true);
    try {
      const result = await invoke<{ transferId: string }>('InitiateTroopTransfer', safeAmount, recipient.id);
      if (result) activateAbility();
    } finally {
      setSending(false);
    }
  }, [activateAbility, carried, invoke, recipient, safeAmount]);

  const where = (distance: number | null, bearing: number | null) => {
    if (distance == null || bearing == null) return t('ui.abilities.troopTransfer.unknownPlace');
    const direction = t(`ui.directions.${DIRECTIONS[Math.round(((bearing % 360) + 360) % 360 / 45) % 8]}`);
    return t('ui.abilities.troopTransfer.away', { meters: Math.round(distance), direction });
  };

  const status = isActive
    ? t('ui.abilities.status.waiting')
    : cooldown
      ? t('ui.abilities.status.cooldown', { time: `${cooldown}s` })
      : t('ui.abilities.troopTransfer.youCarry', { count: carried });

  return (
    <AbilityCard
      title={t('ui.abilities.troopTransfer.title')}
      icon={<Icon name="gift" />}
      onBackToHud={handleBack}
      statusContent={<span className={cx('ability-card__status-pill', isActive && 'ability-card__status-pill--live')}>{status}</span>}
      footerContent={!isActive && !cooldown ? (
        <>
          <Button onClick={() => void handleSend()} disabled={!recipient || carried < 1 || sending} testId="transfer-send-btn">
            {recipient
              ? t('ui.abilities.troopTransfer.send', { count: safeAmount, name: recipient.name })
              : t('ui.abilities.troopTransfer.pickTeammate')}
          </Button>
          <Button variant="quiet" onClick={handleBack}>{t('ui.abilities.notNow')}</Button>
        </>
      ) : undefined}
    >
      {isActive && activeTransfer ? (
        <p className="ability-card__status-copy">
          {t('ui.abilities.troopTransfer.waitingFor', { name: activeTransfer.recipientName, seconds: expires ?? 0 })}
        </p>
      ) : cooldown ? (
        <p className="ability-card__status-copy">{t('ui.abilities.troopTransfer.cooldownHelp')}</p>
      ) : (
        <>
          <p className="ability-card__status-copy">
            {carried === 0 ? t('ui.abilities.troopTransfer.noTroops') : t('ui.abilities.troopTransfer.help')}
          </p>
          {teammates.length === 0 && <p className="lg-muted">{t('ui.abilities.troopTransfer.noTeammates')}</p>}
          <div className="lg-stack lg-stack--sm" role="radiogroup" aria-label={t('ui.abilities.troopTransfer.title')}>
            {teammates.map((mate) => (
              <button
                key={mate.id}
                type="button"
                role="radio"
                aria-checked={mate.id === recipientId}
                className={cx('lg-option', mate.id === recipientId && 'is-selected')}
                onClick={() => setPicked(mate.id)}
              >
                <span className="lg-option__radio" aria-hidden="true" />
                <span className="lg-option__copy">
                  <span className="lg-option__title">{mate.name}</span>
                  <span className="lg-option__desc">{where(mate.distance, mate.bearing)}</span>
                </span>
              </button>
            ))}
          </div>
          {teammates.length > 1 && <p className="lg-small">{t('ui.abilities.troopTransfer.pointHint')}</p>}
          {carried > 0 && (
            <Stepper
              value={safeAmount}
              min={1}
              max={carried}
              onChange={setAmount}
              decreaseLabel={t('ui.play.fewer')}
              increaseLabel={t('ui.play.more')}
              caption={t('ui.abilities.troopTransfer.ofCarried', { count: carried })}
              testId="transfer-amount"
            />
          )}
        </>
      )}
    </AbilityCard>
  );
}
