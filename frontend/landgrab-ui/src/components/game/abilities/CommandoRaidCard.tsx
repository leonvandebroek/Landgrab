import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';

interface CommandoRaidCardProps {
  myUserId: string;
  onActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<boolean> | void;
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

function parseHexKey(hexKey: string | null): [number, number] | null {
  if (!hexKey) {
    return null;
  }

  const [q, r] = hexKey.split(',').map(Number);
  if (Number.isNaN(q) || Number.isNaN(r)) {
    return null;
  }

  return [q, r];
}

export function CommandoRaidCard({
  myUserId,
  onActivateCommandoRaid,
}: CommandoRaidCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const selectedHexKey = useGameplayStore((store) => store.selectedHexKey);
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const enterAbilityMode = useGameplayStore((store) => store.enterAbilityMode);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const selectedTargetHexKey = abilityUi.pendingTargetHexKey ?? abilityUi.targetHexKey ?? selectedHexKey;
  const selectedTarget = parseHexKey(selectedTargetHexKey);
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
  const isConfirmingSelection = !isRaidActive
    && Boolean(selectedTargetHexKey)
    && (abilityUi.mode === 'confirming' || abilityUi.mode === 'targeting');
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

  const handleBackToTargeting = () => {
    enterAbilityMode('commandoRaid', 'targeting', abilityUi.mapFocusPreset || 'strategicTargeting');
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
              {isConfirmingSelection
                ? t('abilities.commandoRaid.confirming' as never)
                : isRaidActive
                  ? t('abilities.commandoRaid.active' as never)
                  : cooldownCountdown
                    ? t('abilities.commandoRaid.cooldown' as never)
                    : t('abilities.commandoRaid.targeting' as never)}
            </span>
          </div>

          <p className="ability-card__status-copy">
            {abilityUi.mode === 'targeting' && !isRaidActive && !cooldownCountdown
              ? t('abilities.commandoRaid.targetingSummary' as never)
              : isConfirmingSelection
                ? t('abilities.commandoRaid.confirmSummary' as never)
                : activeRaid
                  ? t('abilities.commandoRaid.activeSummary' as never)
                  : t('abilities.commandoRaid.cooldownSummary' as never)}
          </p>

          {(isConfirmingSelection || isRaidActive || cooldownCountdown) && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.targetLabel' as never)}</span>
              <span className="ability-card__meta-value">{activeTargetLabel}</span>
            </div>
          )}

          {(isConfirmingSelection || isRaidActive || cooldownCountdown) && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.ownerLabel' as never)}</span>
              <span className="ability-card__meta-value">
                {(isConfirmingSelection ? selectedCell : activeTargetCell)?.ownerName
                  ?? (isConfirmingSelection ? selectedCell : activeTargetCell)?.lastKnownOwnerName
                  ?? t('abilities.commandoRaid.unclaimedOwner' as never)}
              </span>
            </div>
          )}

          {isConfirmingSelection && targetAlliance && (
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
      footerContent={isConfirmingSelection ? (
        <>
          <button
            type="button"
            className="ability-card__primary-btn"
            onClick={() => {
              void handleLaunchRaid();
            }}
            disabled={!selectedTarget}
          >
            {t('abilities.commandoRaid.launch' as never)}
          </button>

          <button
            type="button"
            className="ability-card__secondary-btn"
            onClick={handleBackToTargeting}
          >
            {t('abilities.commandoRaid.backToTargeting' as never)}
          </button>
        </>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        {abilityUi.mode === 'targeting' && !isRaidActive && !cooldownCountdown ? (
          <div className="ability-card__copy">
            <ul className="ability-card__detail-list">
              <li>{t('abilities.commandoRaid.ruleAnyHex' as never)}</li>
              <li>{t('abilities.commandoRaid.ruleAlliance' as never)}</li>
              <li>{t('abilities.commandoRaid.ruleHq' as never)}</li>
            </ul>
          </div>
        ) : isConfirmingSelection ? (
          <div className="ability-card__copy">
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