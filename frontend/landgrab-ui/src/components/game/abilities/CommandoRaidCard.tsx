import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';

interface CommandoRaidCardProps {
  myUserId: string;
  onActivateCommandoRaid: () => Promise<boolean> | void;
}

function formatTimeRemaining(until: string | undefined): string | null {
  if (!until) return null;
  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function CommandoRaidCard({ myUserId, onActivateCommandoRaid }: CommandoRaidCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const activeRaid = useMemo(() => {
    if (!gameState || !player) return null;
    return gameState.activeRaids?.find((raid) => (
      raid.initiatorPlayerId === player.id
      || (player.allianceId ? raid.initiatorAllianceId === player.allianceId : false)
    )) ?? null;
  }, [gameState, player]);

  const raidCountdown = formatTimeRemaining(activeRaid?.deadline);
  const cooldownCountdown = formatTimeRemaining(player?.commandoRaidCooldownUntil);
  const isRaidActive = Boolean(activeRaid) || abilityUi.mode === 'active';
  const hasLocation = player?.currentHexQ != null && player?.currentHexR != null;

  const targetAlliance = activeRaid && gameState
    ? gameState.alliances.find((alliance) =>
        alliance.hqHexQ === activeRaid.targetQ && alliance.hqHexR === activeRaid.targetR,
      ) ?? null
    : null;

  const handleBackToHud = () => {
    if (isRaidActive || cooldownCountdown) {
      hideAbilityCard();
      return;
    }
    exitAbilityMode();
  };

  const handleLaunchRaid = async () => {
    const succeeded = await Promise.resolve(onActivateCommandoRaid());
    if (succeeded === false) return;
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
              {isRaidActive
                ? t('abilities.commandoRaid.active' as never)
                : cooldownCountdown
                  ? t('abilities.commandoRaid.cooldown' as never)
                  : t('abilities.commandoRaid.confirming' as never)}
            </span>
          </div>
          <p className="ability-card__status-copy">
            {isRaidActive
              ? t('abilities.commandoRaid.activeSummary' as never)
              : cooldownCountdown
                ? t('abilities.commandoRaid.cooldownSummary' as never)
                : hasLocation
                  ? t('abilities.commandoRaid.currentHexLabel' as never)
                  : t('abilities.commandoRaid.noLocation' as never)}
          </p>
          {!isRaidActive && !cooldownCountdown && hasLocation && player && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.targetLabel' as never)}</span>
              <span className="ability-card__meta-value">{player.currentHexQ}, {player.currentHexR}</span>
            </div>
          )}
          {isRaidActive && activeRaid && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.targetLabel' as never)}</span>
              <span className="ability-card__meta-value">{activeRaid.targetQ}, {activeRaid.targetR}</span>
            </div>
          )}
          {(raidCountdown || cooldownCountdown) && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">
                {activeRaid ? t('abilities.commandoRaid.deadlineLabel' as never) : t('abilities.commandoRaid.cooldownLabel' as never)}
              </span>
              <span className="ability-card__meta-value">{raidCountdown ?? cooldownCountdown}</span>
            </div>
          )}
          {isRaidActive && targetAlliance && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.commandoRaid.hqBadgeLabel' as never)}</span>
              <span className="ability-card__meta-value">{targetAlliance.name}</span>
            </div>
          )}
        </>
      )}
      footerContent={!isRaidActive && !cooldownCountdown ? (
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => { void handleLaunchRaid(); }}
          disabled={!hasLocation}
        >
          {t('abilities.commandoRaid.confirmLaunch' as never)}
        </button>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        <div className="ability-card__copy">
          {!isRaidActive && !cooldownCountdown ? (
            <ul className="ability-card__detail-list">
              <li>{t('abilities.commandoRaid.ruleAnyHex' as never)}</li>
              <li>{t('abilities.commandoRaid.ruleAlliance' as never)}</li>
              <li>{t('abilities.commandoRaid.ruleHq' as never)}</li>
            </ul>
          ) : (
            <ul className="ability-card__detail-list">
              <li>{t('abilities.commandoRaid.backHint' as never)}</li>
              {activeRaid?.isHQRaid && <li>{t('abilities.commandoRaid.hqActiveHint' as never)}</li>}
            </ul>
          )}
        </div>
      </div>
    </AbilityCard>
  );
}
