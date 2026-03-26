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

  const isWaiting = isActive || activeBattle != null;

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

  const joinedEnemies = useMemo(() => {
    if (!activeBattle || !gameState) return [];
    return gameState.players.filter((p) => activeBattle.joinedEnemyIds.includes(p.id));
  }, [activeBattle, gameState]);

  const pendingEnemies = useMemo(
    () => enemiesOnTile.filter((e) => !activeBattle?.joinedEnemyIds.includes(e.id)),
    [activeBattle, enemiesOnTile],
  );

  const handleBackToHud = () => {
    if (isWaiting || cooldownCountdown) {
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

  const pillClass = isWaiting
    ? 'ability-card__status-pill--hostile'
    : !cooldownCountdown && isEligible
      ? 'ability-card__status-pill--armed'
      : '';

  return (
    <AbilityCard
      title={t('abilities.fieldBattle.title' as never)}
      icon={<GameIcon name="contested" size="sm" />}
      statusContent={(
        <>
          <div className={`ability-card__status-pill ${pillClass}`}>
            <GameIcon name="contested" size="sm" />
            <span>
              {isWaiting
                ? t('abilities.fieldBattle.active' as never)
                : cooldownCountdown
                  ? t('abilities.fieldBattle.cooldown' as never)
                  : t('abilities.fieldBattle.confirming' as never)}
            </span>
          </div>

          {isWaiting && activeBattle && (
            <>
              {joinDeadlineCountdown && (
                <div className="fb-countdown">
                  <span className="fb-countdown__number">{joinDeadlineCountdown}</span>
                  <span className="fb-countdown__label">{t('abilities.fieldBattle.joinWindowLabel' as never)}</span>
                </div>
              )}
              <p className="ability-card__status-copy">
                {t('abilities.fieldBattle.waitingForJoin' as never)}
              </p>
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
      footerContent={!isWaiting && !cooldownCountdown ? (
        <button
          type="button"
          className={`ability-card__primary-btn ${isEligible ? 'ability-card__primary-btn--hostile' : ''}`}
          onClick={() => { void handleInitiate(); }}
          disabled={!isEligible}
        >
          {t('abilities.fieldBattle.confirmCta' as never)}
        </button>
      ) : undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        {/* Pre-confirm: battle roster */}
        {!isWaiting && !cooldownCountdown && (
          <>
            {enemiesOnTile.length > 0 ? (
              <div className="fb-roster">
                <div className="fb-roster__header">
                  <GameIcon name="contested" size="sm" />
                  <span className="fb-roster__title">{t('abilities.fieldBattle.battleRosterTitle' as never)}</span>
                </div>
                <div className="fb-roster__combatants">
                  {enemiesOnTile.map((enemy) => (
                    <div key={enemy.id} className="fb-roster__combatant">
                      <span className="fb-roster__combatant-icon">
                        <GameIcon name="fist" size="sm" />
                      </span>
                      <span className="fb-roster__combatant-name">{enemy.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : reason && (
              <div className="ability-card__warning">
                {reason === 'notNeutral'
                  ? t('abilities.fieldBattle.notNeutral' as never)
                  : reason === 'noEnemies'
                    ? t('abilities.fieldBattle.noEnemies' as never)
                    : reason === 'enemiesNoTroops'
                      ? t('abilities.fieldBattle.enemiesNoTroops' as never)
                      : t('abilities.fieldBattle.noTroops' as never)}
              </div>
            )}
            <p className="ability-card__status-copy">{t('abilities.fieldBattle.cooldownHint' as never)}</p>
          </>
        )}

        {/* Waiting: roster of pending / joined enemies */}
        {isWaiting && (pendingEnemies.length > 0 || joinedEnemies.length > 0) && (
          <div className="fb-roster">
            {pendingEnemies.map((enemy) => (
              <div key={enemy.id} className="fb-roster__combatant fb-roster__combatant--pending">
                <span className="fb-roster__combatant-icon">
                  <GameIcon name="hourglass" size="sm" />
                </span>
                <span className="fb-roster__combatant-name">{enemy.name}</span>
                <span className="fb-roster__combatant-status">{t('abilities.fieldBattle.awaitingLabel' as never)}</span>
              </div>
            ))}
            {joinedEnemies.map((enemy) => (
              <div key={enemy.id} className="fb-roster__combatant fb-roster__combatant--joined">
                <span className="fb-roster__combatant-icon">
                  <GameIcon name="contested" size="sm" />
                </span>
                <span className="fb-roster__combatant-name">{enemy.name}</span>
                <span className="fb-roster__combatant-status">{t('abilities.fieldBattle.joinedStatus' as never)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Cooldown hint */}
        {(isWaiting || cooldownCountdown) && (
          <p className="ability-card__status-copy">{t('abilities.fieldBattle.cooldownHint' as never)}</p>
        )}
      </div>
    </AbilityCard>
  );
}
