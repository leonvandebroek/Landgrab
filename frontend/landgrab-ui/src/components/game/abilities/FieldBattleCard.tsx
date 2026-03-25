import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import type { Player } from '../../../types/game';
import type { AbilityCardProps } from '../../../types/abilities';

function formatSecondsLeft(until: string | undefined): string | null {
  if (!until) return null;
  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return null;
  return String(Math.ceil(remaining / 1000));
}

export function FieldBattleCard({ myUserId, invoke }: AbilityCardProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((store) => store.gameState);
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const abilityUi = useGameplayStore((store) => store.abilityUi);
  const activateAbility = useGameplayStore((store) => store.activateAbility);
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  const isActive = abilityUi.mode === 'active';
  const cooldownCountdown = formatSecondsLeft(player?.fieldBattleCooldownUntil);

  const activeBattle = useMemo(() => {
    if (!gameState) return null;
    return gameState.activeFieldBattles?.find((battle) => battle.initiatorId === myUserId) ?? null;
  }, [gameState, myUserId]);

  const joinDeadlineCountdown = activeBattle ? formatSecondsLeft(activeBattle.joinDeadline) : null;

  const currentHexKey = player?.currentHexQ != null && player?.currentHexR != null
    ? `${player.currentHexQ},${player.currentHexR}`
    : null;
  const currentCell = currentHexKey && gameState ? gameState.grid[currentHexKey] ?? null : null;

  const { isEligible, reason, enemiesOnTile } = useMemo<{
    isEligible: boolean;
    reason: 'noLocation' | 'notNeutral' | 'noTroops' | 'noEnemies' | 'enemiesNoTroops' | null;
    enemiesOnTile: Player[];
  }>(() => {
    if (!player || !gameState || !currentCell) {
      return { isEligible: false, reason: 'noLocation', enemiesOnTile: [] };
    }
    if (currentCell.ownerId != null) {
      return { isEligible: false, reason: 'notNeutral', enemiesOnTile: [] };
    }
    if ((player.carriedTroops ?? 0) === 0) {
      return { isEligible: false, reason: 'noTroops', enemiesOnTile: [] };
    }
    const enemiesHere = gameState.players.filter(
      (candidate) => candidate.id !== myUserId
        && candidate.currentHexQ === player.currentHexQ
        && candidate.currentHexR === player.currentHexR
        && candidate.allianceId !== player.allianceId,
    );
    if (enemiesHere.length === 0) {
      return { isEligible: false, reason: 'noEnemies', enemiesOnTile: [] };
    }
    const enemiesWithTroops = enemiesHere.filter((candidate) => (candidate.carriedTroops ?? 0) > 0);
    if (enemiesWithTroops.length === 0) {
      return { isEligible: false, reason: 'enemiesNoTroops', enemiesOnTile: enemiesHere };
    }
    return { isEligible: true, reason: null, enemiesOnTile: enemiesHere };
  }, [player, gameState, currentCell, myUserId]);

  const handleBackToHud = () => {
    if (isActive || cooldownCountdown) {
      hideAbilityCard();
      return;
    }
    exitAbilityMode();
  };

  const handleInitiate = async () => {
    if (!invoke) return;
    const result = await invoke<{ battleId: string }>('InitiateFieldBattle');
    if (!result) return;
    activateAbility();
  };

  return (
    <AbilityCard
      title={t('abilities.fieldBattle.title' as never)}
      icon={<GameIcon name="contested" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${isActive ? 'ability-card__status-pill--armed' : ''}`}>
            <GameIcon name="contested" size="sm" />
            <span>
              {isActive
                ? t('abilities.fieldBattle.active' as never)
                : cooldownCountdown
                  ? t('abilities.fieldBattle.cooldown' as never)
                  : t('abilities.fieldBattle.confirming' as never)}
            </span>
          </div>

          {!isActive && !cooldownCountdown && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.fieldBattle.eligibilityLabel' as never)}</span>
              <span className="ability-card__meta-value">
                {isEligible
                  ? t('abilities.fieldBattle.eligible' as never)
                  : reason === 'notNeutral'
                    ? t('abilities.fieldBattle.notNeutral' as never)
                    : reason === 'noEnemies'
                      ? t('abilities.fieldBattle.noEnemies' as never)
                      : reason === 'enemiesNoTroops'
                        ? t('abilities.fieldBattle.enemiesNoTroops' as never)
                        : t('abilities.fieldBattle.noTroops' as never)}
              </span>
            </div>
          )}

          {enemiesOnTile.length > 0 && !isActive && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.fieldBattle.enemyListTitle' as never)}</span>
              <span className="ability-card__meta-value">{enemiesOnTile.map((enemy) => enemy.name).join(', ')}</span>
            </div>
          )}

          {isActive && activeBattle && (
            <>
              <p className="ability-card__status-copy">
                {t('abilities.fieldBattle.waitingForJoin' as never)}
              </p>
              {joinDeadlineCountdown && (
                <div className="ability-card__meta-row">
                  <span className="ability-card__meta-label">{t('abilities.fieldBattle.joinWindowLabel' as never)}</span>
                  <span className="ability-card__meta-value">{t('abilities.fieldBattle.joinsIn' as never, { seconds: joinDeadlineCountdown })}</span>
                </div>
              )}
            </>
          )}

          {cooldownCountdown && (
            <div className="ability-card__meta-row">
              <span className="ability-card__meta-label">{t('abilities.fieldBattle.cooldown' as never)}</span>
              <span className="ability-card__meta-value">{cooldownCountdown}s</span>
            </div>
          )}
        </>
      )}
      footerContent={!isActive && !cooldownCountdown ? (
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => { void handleInitiate(); }}
          disabled={!isEligible}
        >
          {t('abilities.fieldBattle.confirmCta' as never)}
        </button>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        <div className="ability-card__copy">
          <p className="ability-card__hint">{t('abilities.fieldBattle.cooldownHint' as never)}</p>
        </div>
      </div>
    </AbilityCard>
  );
}
