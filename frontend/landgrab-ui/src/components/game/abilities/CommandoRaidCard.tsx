import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';

interface CommandoRaidCardProps {
  myUserId: string;
  onActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<boolean> | void;
  onResolveRaidTarget?: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
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

export function CommandoRaidCard({
  myUserId,
  onActivateCommandoRaid,
  onResolveRaidTarget,
}: CommandoRaidCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  // We no longer rely on hex clicks for commando raid
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const { heading } = useDeviceOrientation(abilityUi.mode === 'targeting');
  const [resolvedTarget, setResolvedTarget] = useState<[number, number] | null>(null);

  useEffect(() => {
    let handle = -1;
    if (abilityUi.mode === 'targeting' && !player?.commandoRaidCooldownUntil && onResolveRaidTarget) {
      handle = window.setInterval(() => {
        const h = heading ?? 0;
        void onResolveRaidTarget(h).then(res => {
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
  }, [abilityUi.mode, heading, onResolveRaidTarget, player?.commandoRaidCooldownUntil]);

  const selectedTargetHexKey = resolvedTarget ? `${resolvedTarget[0]},${resolvedTarget[1]}` : null;
  const selectedTarget = resolvedTarget;
  const selectedCell = selectedTargetHexKey && gameState
    ? gameState.grid[selectedTargetHexKey] ?? null
    : null;
  const targetAlliance = selectedTarget && gameState
    ? gameState.alliances.find((alliance) => alliance.hqHexQ === selectedTarget[0] && alliance.hqHexR === selectedTarget[1]) ?? null
    : null;

  const activeRaid = useMemo(() => {
    if (!gameState || !player) {
      return null;
    }

    return gameState.activeRaids?.find((raid) => (
      raid.initiatorPlayerId === player.id
      || (player.allianceId ? raid.initiatorAllianceId === player.allianceId : false)
    )) ?? null;
  }, [gameState, player]);

  const raidCountdown = formatTimeRemaining(activeRaid?.deadline);
  const cooldownCountdown = formatTimeRemaining(player?.commandoRaidCooldownUntil);
  const isRaidActive = Boolean(activeRaid) || abilityUi.mode === 'active';
  const isTargeting = !isRaidActive && abilityUi.mode === 'targeting' && !cooldownCountdown;
  const activeTarget = activeRaid
    ? [activeRaid.targetQ, activeRaid.targetR] as [number, number]
    : selectedTarget;
  const activeTargetLabel = activeTarget ? `${activeTarget[0]}, ${activeTarget[1]}` : '—';
  const activeTargetCell = activeTarget && gameState
    ? gameState.grid[`${activeTarget[0]},${activeTarget[1]}`] ?? null
    : null;
  const activeTargetAlliance = activeTarget && gameState
    ? gameState.alliances.find((alliance) => alliance.hqHexQ === activeTarget[0] && alliance.hqHexR === activeTarget[1]) ?? null
    : null;

  const handleBackToHud = () => {
    if (isRaidActive || cooldownCountdown) {
      hideAbilityCard();
      return;
    }

    exitAbilityMode();
  };

  const handleLaunchRaid = async () => {
    if (!selectedTarget) {
      return;
    }

    const succeeded = await Promise.resolve(onActivateCommandoRaid(selectedTarget[0], selectedTarget[1]));
    if (succeeded === false) {
      return;
    }

    activateAbility();
  };

  return (
    <AbilityCard
      title={t('abilities.commandoRaid.title' as never)}
      icon={<GameIcon name="archeryTarget" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isRaidActive ? 'ability-card__status-pill--armed' : ''}`}>
            <GameIcon name="archeryTarget" size="sm" />
            <span>
              {isTargeting
                ? t('abilities.commandoRaid.targeting' as never)
                : isRaidActive
                  ? t('abilities.commandoRaid.active' as never)
                  : cooldownCountdown
                    ? t('abilities.commandoRaid.cooldown' as never)
                    : t('abilities.commandoRaid.targeting' as never)}
            </span>
          </div>

          <p className="ability-card__status-copy">
            {isTargeting
              ? (selectedTarget ? 'Target acquired.' : 'Point your device to find a target')
              : activeRaid
                ? t('abilities.commandoRaid.activeSummary' as never)
                : t('abilities.commandoRaid.cooldownSummary' as never)}
          </p>

          {(isTargeting || isRaidActive || cooldownCountdown) && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.targetLabel' as never)}</span>
              <span className="ability-card__meta-value">{selectedTarget ? activeTargetLabel : 'No target in direction'}</span>
            </div>
          )}

          {(isTargeting || isRaidActive || cooldownCountdown) && selectedTarget && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.ownerLabel' as never)}</span>
              <span className="ability-card__meta-value">
                {(isTargeting ? selectedCell : activeTargetCell)?.ownerName
                  ?? (isTargeting ? selectedCell : activeTargetCell)?.lastKnownOwnerName
                  ?? t('abilities.commandoRaid.unclaimedOwner' as never)}
              </span>
            </div>
          )}

          {isTargeting && targetAlliance && selectedTarget && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.hqBadgeLabel' as never)}</span>
              <span className="ability-card__meta-value">{targetAlliance.name}</span>
            </div>
          )}

          {isRaidActive && activeTargetAlliance && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.hqBadgeLabel' as never)}</span>
              <span className="ability-card__meta-value">{activeTargetAlliance.name}</span>
            </div>
          )}

          {(raidCountdown || cooldownCountdown) && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">
                {activeRaid
                  ? t('abilities.commandoRaid.deadlineLabel' as never)
                  : t('abilities.commandoRaid.cooldownLabel' as never)}
              </span>
              <span className="ability-card__meta-value">{raidCountdown ?? cooldownCountdown}</span>
            </div>
          )}
        </>
      )}
      footerContent={isTargeting ? (
        <>
          <button
            type="button"
            className="ability-card__primary-btn"
            onClick={() => {
              void handleLaunchRaid();
            }}
            disabled={!selectedTarget}
          >
            Lock Target
          </button>
        </>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        {isTargeting ? (
          <div className="ability-card__copy">
            <ul className="ability-card__detail-list">
              <li>{t('abilities.commandoRaid.ruleAnyHex' as never)}</li>
              <li>{t('abilities.commandoRaid.ruleAlliance' as never)}</li>
              <li>{t('abilities.commandoRaid.ruleHq' as never)}</li>
            </ul>
            {targetAlliance && (
              <p className="ability-card__warning">{t('abilities.commandoRaid.hqTarget' as never, { name: targetAlliance.name })}</p>
            )}
          </div>
        ) : (
          <div className="ability-card__copy">
            <ul className="ability-card__detail-list">
              <li>{t('abilities.commandoRaid.backHint' as never)}</li>
              {activeRaid?.isHQRaid && <li>{t('abilities.commandoRaid.hqActiveHint' as never)}</li>}
            </ul>
          </div>
        )}
      </div>
    </AbilityCard>
  );
}