import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDynamics, HexCell, Player } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';
import { getTileActionDisabledReasonText } from './tileInteraction';
import type { TileAction, TileActionType } from './tileInteraction';
import { useGameplayStore } from '../../stores/gameplayStore';
import { useSecondTick } from '../../hooks/useSecondTick';
import { AbilityInfoSheet } from './AbilityInfoSheet';
import { GameIcon } from '../common/GameIcon';

/* ═══════════════════════════════════════════════════════════════════════
   PlayerHUD — Unified bottom-of-screen HUD
   ═══════════════════════════════════════════════════════════════════════
   Merges ActionDock (tile context + actions) and AbilityBar (beacon,
   commando) into one persistent bar. One-handed, thumb-friendly,
   designed for players walking around.
   ═══════════════════════════════════════════════════════════════════════ */

interface PlayerHUDProps {
  actions: TileAction[];
  onAction: (actionType: TileActionType) => void;
  currentHex: [number, number] | null;
  targetCell: HexCell | undefined;
  carriedTroops: number;
  playerColor: string;
  hasLocation: boolean;
  myUserId?: string;
  myAllianceId?: string;
  myAllianceName?: string;
  player?: Player;
  dynamics?: GameDynamics;
  onActivateBeacon: () => void;
  onDeactivateBeacon: () => void;
  onActivateTacticalStrike: () => void;
  onActivateReinforce: () => void;
  onActivateEmergencyRepair: () => void;
  onStartDemolish: () => void;
}

interface AbilityButtonConfig {
  key: string;
  icon: GameIconName;
  title: string;
  description: string;
  shortDescription?: string;
  status: string;
  className: string;
  stateTone?: 'standby' | 'active' | 'cooldown' | 'targeting' | 'inProgress';
  accentClassName?: string;
  disabled?: boolean;
  onClick?: () => void;
  role?: AbilityRole;
  abilityKey?: string;
}

type AbilityRole = 'Commander' | 'Scout' | 'Engineer';

const ROLE_ACCENT_CLASSES: Record<AbilityRole, string> = {
  Commander: 'player-hud__ability--commander',
  Scout: 'player-hud__ability--scout',
  Engineer: 'player-hud__ability--engineer',
};

const PLAYER_HUD_TOKEN_STYLES = `
  .player-hud {
    --relation-own: rgba(46, 204, 113, 0.25);
    --relation-team: rgba(52, 152, 219, 0.25);
    --relation-enemy: rgba(231, 76, 60, 0.25);
    --relation-neutral: rgba(177, 204, 220, 0.12);
    --role-commander-accent: rgba(246, 196, 83, 0.82);
    --role-scout-accent: rgba(107, 197, 255, 0.78);
    --role-engineer-accent: rgba(255, 179, 102, 0.8);
    --owner-color-fallback: rgba(177, 204, 220, 0.5);
  }

  .player-hud--own {
    --dock-accent: var(--relation-own);
  }

  .player-hud--team {
    --dock-accent: var(--relation-team);
  }

  .player-hud--enemy {
    --dock-accent: var(--relation-enemy);
  }

  .player-hud--neutral {
    --dock-accent: var(--relation-neutral);
  }

  .player-hud__ability--commander .player-hud__ability-icon {
    --ability-accent: var(--role-commander-accent);
  }

  .player-hud__ability--scout .player-hud__ability-icon {
    --ability-accent: var(--role-scout-accent);
  }

  .player-hud__ability--engineer .player-hud__ability-icon {
    --ability-accent: var(--role-engineer-accent);
  }

  .player-hud__owner-dot--fallback {
    background: var(--owner-color-fallback);
  }
`;

type HexRelation = 'own' | 'team' | 'enemy' | 'neutral';

function getHexRelation(
  cell: HexCell | undefined,
  myUserId?: string,
  myAllianceId?: string,
): HexRelation {
  if (!cell || !cell.ownerId) return 'neutral';
  if (myAllianceId && cell.ownerAllianceId === myAllianceId) return 'team';
  if (cell.ownerId === myUserId) return 'own';
  return 'enemy';
}

const DEMOLISH_DURATION_MS = 2 * 60 * 1000;

function formatTimeRemaining(until: string | undefined): string | null {
  if (!until) return null;

  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatDurationRemaining(startedAt: string | undefined, durationMs: number): string | null {
  if (!startedAt) {
    return null;
  }

  const startTime = new Date(startedAt).getTime();

  if (Number.isNaN(startTime)) {
    return null;
  }

  return formatTimeRemaining(new Date(startTime + durationMs).toISOString());
}

export function PlayerHUD({
  actions,
  onAction,
  currentHex,
  targetCell,
  carriedTroops,
  playerColor,
  hasLocation,
  myUserId,
  myAllianceId,
  myAllianceName,
  player,
  dynamics,
  onActivateBeacon,
  onDeactivateBeacon,
  onActivateTacticalStrike,
  onActivateReinforce,
  onActivateEmergencyRepair,
  onStartDemolish,
}: PlayerHUDProps) {
  const { t } = useTranslation();
  const commandoTargetingMode = useGameplayStore((state) => state.commandoTargetingMode);
  const setCommandoTargetingMode = useGameplayStore((state) => state.setCommandoTargetingMode);
  const [, setTick] = useState(0);
  const [infoSheet, setInfoSheet] = useState<{ role: AbilityRole; abilityKey: string } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const showBeacon = Boolean(dynamics?.beaconEnabled);
  const rolesEnabled = Boolean(dynamics?.playerRolesEnabled);
  const tacticalStrikeTime = formatTimeRemaining(player?.tacticalStrikeExpiry);
  const tacticalStrikeCooldownTime = formatTimeRemaining(player?.tacticalStrikeCooldownUntil);
  const rallyPointCooldownTime = formatTimeRemaining(player?.rallyPointCooldownUntil);
  const commandoCooldownTime = formatTimeRemaining(player?.commandoRaidCooldownUntil);
  const sabotageCooldownTime = formatTimeRemaining(player?.sabotageCooldownUntil);
  const demolishProgressTime = formatDurationRemaining(player?.demolishStartedAt, DEMOLISH_DURATION_MS);
  const demolishCooldownTime = formatTimeRemaining(player?.demolishCooldownUntil);
  const hasActiveCountdown = [
    tacticalStrikeTime,
    tacticalStrikeCooldownTime,
    rallyPointCooldownTime,
    commandoCooldownTime,
    sabotageCooldownTime,
    demolishProgressTime,
    demolishCooldownTime,
  ].some((value) => value !== null);

  useSecondTick(() => {
    if (!hasActiveCountdown) {
      return;
    }

    setTick((tick) => tick + 1);
  });

  const hasActions = actions.length > 0;
  const firstDisabledAction = actions.find((action) => !action.enabled && action.disabledReason);
  const disabledReasonText = getTileActionDisabledReasonText(
    t,
    firstDisabledAction?.disabledReason,
    firstDisabledAction?.disabledReasonParams,
  );
  const emptyReason: 'noLocation' | 'outsideGrid' | 'noActions' = !hasLocation
    ? 'noLocation'
    : !currentHex
      ? 'outsideGrid'
      : 'noActions';

  const relation = getHexRelation(targetCell, myUserId, myAllianceId);

  const formatStatus = (statusKey: 'activate' | 'active' | 'cooldown' | 'inProgress', time?: string | null): string => {
    const label = t(`roles.status.${statusKey}` as never);
    return time ? `${label} (${time})` : label;
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => clearLongPressTimer, []);

  const handleAbilityPointerDown = (ability: AbilityButtonConfig) => {
    if (!ability.role || !ability.abilityKey) {
      return;
    }

    const { role, abilityKey } = ability;

    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setInfoSheet({ role, abilityKey });
    }, 500);
  };

  const handleAbilityPointerEnd = () => {
    clearLongPressTimer();
  };

  const handleAbilityClick = (ability: AbilityButtonConfig) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (ability.disabled || !ability.onClick) {
      return;
    }

    ability.onClick();
  };

  const abilityButtons: AbilityButtonConfig[] = [];

  if (rolesEnabled && player?.role === 'Commander') {
    const tacticalStrikeActive = Boolean(player.tacticalStrikeActive && tacticalStrikeTime);
    const tacticalStrikeOnCooldown = !tacticalStrikeActive && tacticalStrikeCooldownTime !== null;

    abilityButtons.push({
      key: 'tactical-strike',
      icon: 'lightning',
      title: t('roles.Commander.abilities.tacticalStrike.title' as never),
      description: t('roles.Commander.abilities.tacticalStrike.description' as never),
      shortDescription: t('roles.Commander.abilities.tacticalStrike.shortDesc' as never),
      status: tacticalStrikeActive
        ? formatStatus('active', tacticalStrikeTime)
        : tacticalStrikeOnCooldown
          ? formatStatus('cooldown', tacticalStrikeCooldownTime)
          : formatStatus('activate'),
      className: `player-hud__ability ${tacticalStrikeActive ? 'player-hud__ability--active ability-btn-active' : ''} ${tacticalStrikeOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
      stateTone: tacticalStrikeActive ? 'active' : tacticalStrikeOnCooldown ? 'cooldown' : 'standby',
      accentClassName: ROLE_ACCENT_CLASSES.Commander,
      disabled: tacticalStrikeActive || tacticalStrikeOnCooldown,
      onClick: tacticalStrikeActive || tacticalStrikeOnCooldown ? undefined : onActivateTacticalStrike,
      role: 'Commander',
      abilityKey: 'tacticalStrike',
    });

    const rallyActive = Boolean(player.rallyPointActive);
    const rallyOnCooldown = !rallyActive && rallyPointCooldownTime !== null;

    abilityButtons.push({
      key: 'rally-point',
      icon: 'rallyTroops',
      title: t('roles.Commander.abilities.reinforce.title' as never),
      description: t('roles.Commander.abilities.reinforce.description' as never),
      shortDescription: t('roles.Commander.abilities.reinforce.shortDesc' as never),
      status: rallyActive
        ? formatStatus('active', formatTimeRemaining(player.rallyPointDeadline))
        : rallyOnCooldown
          ? formatStatus('cooldown', rallyPointCooldownTime)
          : formatStatus('activate'),
      className: `player-hud__ability ${rallyActive ? 'player-hud__ability--active ability-btn-active' : ''} ${rallyOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
      stateTone: rallyActive ? 'active' : rallyOnCooldown ? 'cooldown' : 'standby',
      accentClassName: ROLE_ACCENT_CLASSES.Commander,
      disabled: rallyActive || rallyOnCooldown,
      onClick: rallyActive || rallyOnCooldown ? undefined : onActivateReinforce,
      role: 'Commander',
      abilityKey: 'reinforce',
    });

    const commandoOnCooldown = commandoCooldownTime !== null;

    if (commandoTargetingMode) {
      abilityButtons.push({
        key: 'commando-targeting',
        icon: 'archeryTarget',
        title: t('roles.Commander.abilities.commandoRaid.title' as never),
        description: t('roles.Commander.abilities.commandoRaid.description' as never),
        shortDescription: t('roles.Commander.abilities.commandoRaid.shortDesc' as never),
        status: t('phase6.commandoSelectTarget' as never),
        className: 'player-hud__ability player-hud__ability--targeting',
        stateTone: 'targeting',
        accentClassName: ROLE_ACCENT_CLASSES.Commander,
        onClick: () => setCommandoTargetingMode(false),
        role: 'Commander',
        abilityKey: 'commandoRaid',
      });
    } else {
      abilityButtons.push({
        key: 'commando-raid',
        icon: 'archeryTarget',
        title: t('roles.Commander.abilities.commandoRaid.title' as never),
        description: t('roles.Commander.abilities.commandoRaid.description' as never),
        shortDescription: t('roles.Commander.abilities.commandoRaid.shortDesc' as never),
        status: commandoOnCooldown
          ? formatStatus('cooldown', commandoCooldownTime)
          : formatStatus('activate'),
        className: `player-hud__ability ${commandoOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
        stateTone: commandoOnCooldown ? 'cooldown' : 'standby',
        accentClassName: ROLE_ACCENT_CLASSES.Commander,
        disabled: commandoOnCooldown,
        onClick: commandoOnCooldown ? undefined : () => setCommandoTargetingMode(true),
        role: 'Commander',
        abilityKey: 'commandoRaid',
      });
    }
  }

  if (rolesEnabled && player?.role === 'Engineer') {
    const demolishInProgress = Boolean(player.demolishActive && demolishProgressTime);
    const demolishOnCooldown = !demolishInProgress && demolishCooldownTime !== null;
    const sabotageActive = Boolean(player.sabotageActive);
    const sabotageOnCooldown = !sabotageActive && sabotageCooldownTime !== null;

    abilityButtons.push({
      key: 'sabotage',
      icon: 'wrench',
      title: t('roles.Engineer.abilities.emergencyRepair.title' as never),
      description: t('roles.Engineer.abilities.emergencyRepair.description' as never),
      shortDescription: t('roles.Engineer.abilities.emergencyRepair.shortDesc' as never),
      status: sabotageActive
        ? formatStatus('inProgress')
        : sabotageOnCooldown
          ? formatStatus('cooldown', sabotageCooldownTime)
          : formatStatus('activate'),
      className: `player-hud__ability ${sabotageActive ? 'player-hud__ability--active ability-btn-active' : ''} ${sabotageOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
      stateTone: sabotageActive ? 'inProgress' : sabotageOnCooldown ? 'cooldown' : 'standby',
      accentClassName: ROLE_ACCENT_CLASSES.Engineer,
      disabled: sabotageActive || sabotageOnCooldown,
      onClick: sabotageActive || sabotageOnCooldown ? undefined : onActivateEmergencyRepair,
      role: 'Engineer',
      abilityKey: 'emergencyRepair',
    });

    abilityButtons.push({
      key: 'demolish',
      icon: 'gearHammer',
      title: t('roles.Engineer.abilities.demolish.title' as never),
      description: t('roles.Engineer.abilities.demolish.description' as never),
      shortDescription: t('roles.Engineer.abilities.demolish.shortDesc' as never),
      status: demolishInProgress
        ? formatStatus('inProgress', demolishProgressTime)
        : demolishOnCooldown
          ? formatStatus('cooldown', demolishCooldownTime)
          : formatStatus('activate'),
      className: `player-hud__ability ${demolishInProgress ? 'player-hud__ability--active ability-btn-active' : ''} ${demolishOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
      stateTone: demolishInProgress ? 'inProgress' : demolishOnCooldown ? 'cooldown' : 'standby',
      accentClassName: ROLE_ACCENT_CLASSES.Engineer,
      disabled: demolishInProgress || demolishOnCooldown,
      onClick: demolishInProgress || demolishOnCooldown ? undefined : onStartDemolish,
      role: 'Engineer',
      abilityKey: 'demolish',
    });
  }

  if (showBeacon && player) {
    abilityButtons.push({
      key: 'beacon',
      icon: 'radioTower',
      title: t('phase5.beacon' as never),
      description: t('phase5.beaconDesc' as never),
      status: player.isBeacon ? formatStatus('active') : formatStatus('activate'),
      className: `player-hud__ability ${player.isBeacon ? 'player-hud__ability--active ability-btn-active' : ''}`,
      stateTone: player.isBeacon ? 'active' : 'standby',
      onClick: player.isBeacon ? onDeactivateBeacon : onActivateBeacon,
    });
  }

  const hasAbilities = abilityButtons.length > 0;

  return (
    <>
      <style>{PLAYER_HUD_TOKEN_STYLES}</style>
      <div
        className={`player-hud ${hasActions ? 'player-hud--active' : 'player-hud--idle'} player-hud--${relation}`}
      >
        {(hasActions || currentHex) && (
          <div className="player-hud__readout-rail">
            <div className="player-hud__context">
              {carriedTroops > 0 && (
                <span
                  className="player-hud__carried player-hud__carried--cartridge"
                  style={{ '--player-color': playerColor } as React.CSSProperties}
                >
                  <GameIcon name="chest" size="sm" />
                  <span className="player-hud__carried-label">{t('game.carriedTroops')}</span>
                  <span className="player-hud__carried-count">{carriedTroops}</span>
                </span>
              )}

              <div className="player-hud__context-group player-hud__context-group--readout">
                <span className={`player-hud__relation player-hud__relation--${relation}`}>
                  {t(`game.dock.relation.${relation}`)}
                </span>

                {relation === 'team' && myAllianceName && (
                  <span className="player-hud__owner-readout">
                    <span className="player-hud__owner">
                      <span
                        className={`player-hud__owner-dot ${targetCell?.ownerColor ? '' : 'player-hud__owner-dot--fallback'}`}
                        style={targetCell?.ownerColor ? { background: targetCell.ownerColor } : undefined}
                      />
                      {myAllianceName}
                      {targetCell?.ownerName && (
                        <span className="player-hud__claimer">{targetCell.ownerName}</span>
                      )}
                    </span>
                  </span>
                )}

                {relation === 'enemy' && targetCell?.ownerName && (
                  <span className="player-hud__owner-readout">
                    <span className="player-hud__owner">
                      <span
                        className={`player-hud__owner-dot ${targetCell.ownerColor ? '' : 'player-hud__owner-dot--fallback'}`}
                        style={targetCell.ownerColor ? { background: targetCell.ownerColor } : undefined}
                      />
                      {targetCell.ownerName}
                    </span>
                  </span>
                )}

                {targetCell && targetCell.troops > 0 && (
                  <span className="player-hud__troops player-hud__troops--scanner"><GameIcon name="contested" size="sm" /> {targetCell.troops}</span>
                )}
              </div>

              <div className="player-hud__context-group player-hud__context-group--status">
                {targetCell?.isFortified && (
                  <span className="player-hud__badge" title={t('phase3.fortifiedDesc' as never)}><GameIcon name="shield" size="sm" /></span>
                )}
                {targetCell?.isFort && (
                  <span className="player-hud__badge" title={t('game.dock.fort' as never)}><GameIcon name="fort" size="sm" /></span>
                )}
                {(relation === 'own' || relation === 'team') && targetCell?.ownerId && (
                  <span className="player-hud__badge player-hud__badge--boost" title={t('game.tileInfo.presenceBoost' as never)}>
                    <GameIcon name="rallyTroops" size="sm" /> 3×
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {hasActions && (
          <div className="player-hud__primary-row player-hud__tile-actions">
            {actions.map((action, index) => (
              <button
                key={action.type}
                className={`player-hud__btn player-hud__btn--${action.tone}`}
                disabled={!action.enabled}
                onClick={() => onAction(action.type)}
                style={{ animationDelay: `${index * 40}ms` } as React.CSSProperties}
                aria-label={t(action.label as never)}
              >
                <span className="player-hud__btn-icon" aria-hidden>
                  <GameIcon name={action.icon} />
                </span>
                <span className="player-hud__btn-label">
                  {t(action.label as never)}
                </span>
                {!action.enabled && <span className="player-hud__btn-locked" aria-hidden><GameIcon name="shield" size="sm" /></span>}
              </button>
            ))}
          </div>
        )}

        {hasActions && disabledReasonText && (
          <div className="player-hud__disabled-reason">
            {disabledReasonText}
          </div>
        )}

        {hasAbilities && (
          <div className="player-hud__modules-row player-hud__abilities">
            {abilityButtons.map((ability) => (
              <button
                key={ability.key}
                type="button"
                className={`${ability.className} ${ability.accentClassName ?? ''}`.trim()}
                disabled={ability.disabled}
                onClick={() => handleAbilityClick(ability)}
                onPointerDown={() => handleAbilityPointerDown(ability)}
                onPointerUp={handleAbilityPointerEnd}
                onPointerCancel={handleAbilityPointerEnd}
                onPointerLeave={handleAbilityPointerEnd}
                title={ability.description}
              >
                <span className="player-hud__ability-main">
                  <span className="player-hud__ability-title-group">
                    <span className="player-hud__ability-icon">
                      <GameIcon name={ability.icon} />
                    </span>
                    <span className="player-hud__ability-copy">
                      <span className="player-hud__ability-label">{ability.title}</span>
                      {ability.role && <span className="player-hud__ability-module-label">{ability.role}</span>}
                    </span>
                  </span>
                  <span className={`player-hud__countdown player-hud__ability-state player-hud__ability-state--${ability.stateTone ?? 'standby'}`}>{ability.status}</span>
                </span>
                {ability.shortDescription && (
                  <span className="ability-subtitle player-hud__ability-subtitle">{ability.shortDescription}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {infoSheet && (
          <AbilityInfoSheet
            role={infoSheet.role}
            abilityKey={infoSheet.abilityKey}
            onClose={() => setInfoSheet(null)}
          />
        )}

        {!hasActions && !hasAbilities && (
          <div className="player-hud__empty">
            {emptyReason === 'noLocation' && (
              <>
                <span className="player-hud__empty-icon"><GameIcon name="pin" /></span>
                <span>{t('game.dock.noLocation')}</span>
              </>
            )}
            {emptyReason === 'outsideGrid' && (
              <>
                <span className="player-hud__empty-icon"><GameIcon name="treasureMap" /></span>
                <span>{t('game.dock.outsideGrid')}</span>
              </>
            )}
            {emptyReason === 'noActions' && (
              <>
                <span className="player-hud__empty-icon"><GameIcon name="flag" /></span>
                <span>{t('game.dock.noActions')}</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
