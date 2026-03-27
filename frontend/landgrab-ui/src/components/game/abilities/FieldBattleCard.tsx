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
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);
  const hideAbilityCard = useGameplayStore((store) => store.hideAbilityCard);

  // Suppress the unused-read lint warning: abilityUi is kept to re-render when mode changes
  void abilityUi;

  const cooldownCountdown = formatSecondsLeft(player?.fieldBattleCooldownUntil);

  const activeBattle = useMemo(() => {
    if (!gameState) return null;
    return gameState.activeFieldBattles?.find((battle) => battle.initiatorId === myUserId) ?? null;
  }, [gameState, myUserId]);

  // Phase A  — pre-battle: locally eligible, no battle created yet
  // Phase B-t — battle exists but no target chosen yet (isTargetSelectionPhase)
  // Phase B-w — battle exists and target is set (isWaitingForJoin)
  const isPreBattle = activeBattle == null;
  const isTargetSelectionPhase = activeBattle != null && activeBattle.targetEnemyId == null;
  const isWaitingForJoin = activeBattle != null && activeBattle.targetEnemyId != null;

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
        && (player.allianceId == null || candidate.allianceId !== player.allianceId),
    );
    if (enemiesHere.length === 0) {
      return { isEligible: false, reason: 'noEnemies', enemiesOnTile: [] };
    }
    // Enemy carriedTroops is sanitized to 0 in Alliances mode; backend validates actual counts.
    return { isEligible: true, reason: null, enemiesOnTile: enemiesHere };
  }, [player, gameState, currentCell, myUserId]);

  // When no battle exists yet, use the player's current hex so the target list is
  // populated during Phase A. Once a battle is created, use its authoritative q/r.
  const enemiesAtBattleHex = useMemo(() => {
    if (!gameState || !player) return [];
    const hexQ = activeBattle?.q ?? player.currentHexQ;
    const hexR = activeBattle?.r ?? player.currentHexR;
    if (hexQ == null || hexR == null) return [];
    return gameState.players.filter(
      (e) => e.id !== myUserId
        && e.currentHexQ === hexQ
        && e.currentHexR === hexR
        && (player.allianceId == null || e.allianceId !== player.allianceId),
    );
  }, [activeBattle, gameState, player, myUserId]);

  const validTargets = useMemo(() => {
    const fledIds = new Set(activeBattle?.fledEnemyIds ?? []);
    // Don't filter by carriedTroops — it's sanitized to 0 in Alliances mode.
    return enemiesAtBattleHex.filter((e) => !fledIds.has(e.id));
  }, [activeBattle, enemiesAtBattleHex]);

  const joinedEnemies = useMemo(() => {
    if (!activeBattle || !gameState) return [];
    return gameState.players.filter((p) => activeBattle.joinedEnemyIds.includes(p.id));
  }, [activeBattle, gameState]);

  const fledEnemies = useMemo(() => {
    if (!activeBattle || !gameState) return [];
    const fledIds = new Set(activeBattle.fledEnemyIds ?? []);
    return gameState.players.filter((p) => fledIds.has(p.id));
  }, [activeBattle, gameState]);

  const pendingEnemies = useMemo(() => {
    if (!activeBattle) return enemiesOnTile;
    const fledIds = new Set(activeBattle.fledEnemyIds ?? []);
    return enemiesAtBattleHex.filter((e) => !activeBattle.joinedEnemyIds.includes(e.id) && !fledIds.has(e.id));
  }, [activeBattle, enemiesAtBattleHex, enemiesOnTile]);

  // showTargetList is true in both Phase A (pre-battle, enemies present) and Phase B-t
  // (battle exists but no target chosen yet).
  const showTargetList = isTargetSelectionPhase || (isPreBattle && enemiesAtBattleHex.length > 0);

  const handleBackToHud = () => {
    // Keep the card hidden (not dismissed) only when a live battle is running.
    if (activeBattle != null) {
      hideAbilityCard();
      return;
    }
    exitAbilityMode();
  };

  // New single-step challenge flow:
  // • Phase A (no battle yet) → ChallengePlayer atomically creates the battle and targets the enemy.
  // • Phase B-t (battle exists, no target) → SelectFieldBattleTarget sets the target on the existing battle.
  const handleChallenge = async (enemyId: string) => {
    if (!invoke) return;
    if (activeBattle) {
      await invoke('SelectFieldBattleTarget', activeBattle.id, enemyId);
    } else {
      await invoke('ChallengePlayer', enemyId);
    }
  };

  const pillClass = isWaitingForJoin
    ? 'ability-card__status-pill--hostile'
    : showTargetList
      ? 'ability-card__status-pill--armed'
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
              {showTargetList
                ? t('abilities.fieldBattle.targetSelection.title' as never)
                : isWaitingForJoin
                  ? t('abilities.fieldBattle.active' as never)
                  : cooldownCountdown
                    ? t('abilities.fieldBattle.cooldown' as never)
                    : t('abilities.fieldBattle.confirming' as never)}
            </span>
          </div>

          {/* Subtitle shown during both Phase A and Phase B-t (target selection) */}
          {showTargetList && (
            <p className="ability-card__status-copy">
              {t('abilities.fieldBattle.targetSelection.subtitle' as never)}
            </p>
          )}

          {/* Phase B-w: countdown + waiting copy */}
          {isWaitingForJoin && activeBattle && (
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
      footerContent={undefined}
      onBackToHud={handleBackToHud}
    >
      <div className="ability-card__stack">
        {/* Phase A / Phase B-t: target list with per-enemy Challenge buttons */}
        {showTargetList && (
          <>
            {validTargets.length > 0 ? (
              <div className="fb-target-list">
                {validTargets.map((enemy) => (
                  <div key={enemy.id} className="fb-target-row">
                    <span
                      className="fb-target-row__color"
                      style={{ backgroundColor: enemy.color }}
                      aria-hidden="true"
                    />
                    <span className="fb-target-row__name">{enemy.name}</span>
                    <span className="fb-target-row__troops">{enemy.carriedTroops ?? 0}</span>
                    <button
                      type="button"
                      className="fb-target-btn"
                      onClick={() => { void handleChallenge(enemy.id); }}
                    >
                      {t('abilities.fieldBattle.targetSelection.challengeBtn' as never)}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="ability-card__warning">
                {t('abilities.fieldBattle.targetSelection.noTargets' as never)}
              </div>
            )}
            <p className="ability-card__status-copy">
              {t('abilities.fieldBattle.targetSelection.hint' as never)}
            </p>
          </>
        )}

        {/* Phase A, no valid targets: show reason */}
        {isPreBattle && !showTargetList && !cooldownCountdown && reason && (
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

        {/* Phase B-w: roster of pending / joined / fled enemies */}
        {isWaitingForJoin && (pendingEnemies.length > 0 || joinedEnemies.length > 0 || fledEnemies.length > 0) && (
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
            {fledEnemies.map((enemy) => (
              <div key={enemy.id} className="fb-roster__combatant fb-roster__combatant--fled">
                <span className="fb-roster__combatant-icon">
                  <GameIcon name="hourglass" size="sm" />
                </span>
                <span className="fb-roster__combatant-name">{enemy.name}</span>
                <span className="fb-roster__combatant-status fb-roster__fled-badge">
                  {t('abilities.fieldBattle.fled.badge' as never)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Cooldown hint shown while waiting for join window or on cooldown */}
        {(isWaitingForJoin || cooldownCountdown) && !showTargetList && (
          <p className="ability-card__status-copy">{t('abilities.fieldBattle.cooldownHint' as never)}</p>
        )}
      </div>
    </AbilityCard>
  );
}
