import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDynamics, HexCell, Player } from '../../types/game';
import { getTileActionDisabledReasonText } from './tileInteraction';
import type { TileAction, TileActionType } from './tileInteraction';
import { useGameplayStore } from '../../stores/gameplayStore';
import { useSecondTick } from '../../hooks/useSecondTick';
import { terrainDefendBonus } from '../../utils/terrainColors';
import { AbilityInfoSheet } from './AbilityInfoSheet';

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
  onActivateShieldWall: () => void;
  onActivateEmergencyRepair: () => void;
  onStartDemolish: () => void;
}

interface AbilityButtonConfig {
  key: string;
  icon: string;
  title: string;
  description: string;
  shortDescription?: string;
  status: string;
  className: string;
  accentColor?: string;
  disabled?: boolean;
  onClick?: () => void;
  role?: AbilityRole;
  abilityKey?: string;
}

type AbilityRole = 'Commander' | 'Scout' | 'Defender' | 'Engineer';

const ROLE_ACCENT_COLORS: Record<AbilityRole, string> = {
  Commander: '#f6c453',
  Scout: '#6bc5ff',
  Defender: '#72e0b5',
  Engineer: '#ffb366',
};

type HexRelation = 'own' | 'team' | 'allied' | 'enemy' | 'neutral';

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

const RELATION_ACCENT: Record<HexRelation, string> = {
  own: 'rgba(46, 204, 113, 0.6)',
  team: 'rgba(46, 204, 113, 0.55)',
  allied: 'rgba(52, 152, 219, 0.5)',
  enemy: 'rgba(231, 76, 60, 0.6)',
  neutral: 'rgba(149, 165, 166, 0.3)',
};

const TERRAIN_ICONS: Record<string, string> = {
  Water: '🌊',
  Building: '🏢',
  Road: '═',
  Path: '···',
  Forest: '🌿',
  Park: '🌳',
  Hills: '⛰️',
  Steep: '🏔️',
};

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
  onActivateShieldWall,
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
  const reinforceCooldownTime = formatTimeRemaining(player?.reinforceCooldownUntil);
  const shieldWallTime = formatTimeRemaining(player?.shieldWallExpiry);
  const shieldWallCooldownTime = formatTimeRemaining(player?.shieldWallCooldownUntil);
  const emergencyRepairCooldownTime = formatTimeRemaining(player?.emergencyRepairCooldownUntil);
  const demolishProgressTime = formatDurationRemaining(player?.demolishStartedAt, DEMOLISH_DURATION_MS);
  const demolishCooldownTime = formatTimeRemaining(player?.demolishCooldownUntil);
  const commandoDeadlineTime = formatTimeRemaining(player?.commandoDeadline);
  const commandoCooldownTime = formatTimeRemaining(player?.commandoCooldownUntil);
  const hasActiveCountdown = [
    tacticalStrikeTime,
    tacticalStrikeCooldownTime,
    reinforceCooldownTime,
    shieldWallTime,
    shieldWallCooldownTime,
    emergencyRepairCooldownTime,
    demolishProgressTime,
    demolishCooldownTime,
    commandoDeadlineTime,
    commandoCooldownTime,
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
  const accentColor = RELATION_ACCENT[relation];

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
      icon: '⚡',
      title: t('roles.Commander.abilities.tacticalStrike.title' as never),
      description: t('roles.Commander.abilities.tacticalStrike.description' as never),
      shortDescription: t('roles.Commander.abilities.tacticalStrike.shortDesc' as never),
      status: tacticalStrikeActive
        ? formatStatus('active', tacticalStrikeTime)
        : tacticalStrikeOnCooldown
          ? formatStatus('cooldown', tacticalStrikeCooldownTime)
          : formatStatus('activate'),
      className: `player-hud__ability ${tacticalStrikeActive ? 'player-hud__ability--active ability-btn-active' : ''} ${tacticalStrikeOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
      accentColor: ROLE_ACCENT_COLORS.Commander,
      disabled: tacticalStrikeActive || tacticalStrikeOnCooldown,
      onClick: tacticalStrikeActive || tacticalStrikeOnCooldown ? undefined : onActivateTacticalStrike,
      role: 'Commander',
      abilityKey: 'tacticalStrike',
    });

    abilityButtons.push({
      key: 'reinforce',
      icon: '🔄',
      title: t('roles.Commander.abilities.reinforce.title' as never),
      description: t('roles.Commander.abilities.reinforce.description' as never),
      shortDescription: t('roles.Commander.abilities.reinforce.shortDesc' as never),
      status: reinforceCooldownTime !== null
        ? formatStatus('cooldown', reinforceCooldownTime)
        : formatStatus('activate'),
      className: `player-hud__ability ${reinforceCooldownTime !== null ? 'player-hud__ability--cooldown' : ''}`,
      accentColor: ROLE_ACCENT_COLORS.Commander,
      disabled: reinforceCooldownTime !== null,
      onClick: reinforceCooldownTime !== null ? undefined : onActivateReinforce,
      role: 'Commander',
      abilityKey: 'reinforce',
    });
  }

  if (rolesEnabled && player?.role === 'Scout') {
    const commandoActive = Boolean(player.isCommandoActive && commandoDeadlineTime);
    const commandoOnCooldown = !commandoActive && commandoCooldownTime !== null;

    if (commandoTargetingMode) {
      abilityButtons.push({
        key: 'commando-targeting',
        icon: '🎯',
        title: t('roles.Scout.abilities.commandoRaid.title' as never),
        description: t('roles.Scout.abilities.commandoRaid.description' as never),
        shortDescription: t('roles.Scout.abilities.commandoRaid.shortDesc' as never),
        status: t('phase6.commandoSelectTarget' as never),
        className: 'player-hud__ability player-hud__ability--targeting',
        accentColor: ROLE_ACCENT_COLORS.Scout,
        onClick: () => setCommandoTargetingMode(false),
        role: 'Scout',
        abilityKey: 'commandoRaid',
      });
    } else {
      abilityButtons.push({
        key: 'commando-raid',
        icon: '🎯',
        title: t('roles.Scout.abilities.commandoRaid.title' as never),
        description: t('roles.Scout.abilities.commandoRaid.description' as never),
        shortDescription: t('roles.Scout.abilities.commandoRaid.shortDesc' as never),
        status: commandoActive
          ? formatStatus('active', commandoDeadlineTime)
          : commandoOnCooldown
            ? formatStatus('cooldown', commandoCooldownTime)
            : formatStatus('activate'),
        className: `player-hud__ability ${commandoActive ? 'player-hud__ability--active ability-btn-active' : ''} ${commandoOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
        accentColor: ROLE_ACCENT_COLORS.Scout,
        disabled: commandoActive || commandoOnCooldown,
        onClick: commandoActive || commandoOnCooldown ? undefined : () => setCommandoTargetingMode(true),
        role: 'Scout',
        abilityKey: 'commandoRaid',
      });
    }
  }

  if (rolesEnabled && player?.role === 'Defender') {
    const shieldWallActive = Boolean(player.shieldWallActive && shieldWallTime);
    const shieldWallOnCooldown = !shieldWallActive && shieldWallCooldownTime !== null;

    abilityButtons.push({
      key: 'shield-wall',
      icon: '🛡️',
      title: t('roles.Defender.abilities.shieldWall.title' as never),
      description: t('roles.Defender.abilities.shieldWall.description' as never),
      shortDescription: t('roles.Defender.abilities.shieldWall.shortDesc' as never),
      status: shieldWallActive
        ? formatStatus('active', shieldWallTime)
        : shieldWallOnCooldown
          ? formatStatus('cooldown', shieldWallCooldownTime)
          : formatStatus('activate'),
      className: `player-hud__ability ${shieldWallActive ? 'player-hud__ability--active ability-btn-active' : ''} ${shieldWallOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
      accentColor: ROLE_ACCENT_COLORS.Defender,
      disabled: shieldWallActive || shieldWallOnCooldown,
      onClick: shieldWallActive || shieldWallOnCooldown ? undefined : onActivateShieldWall,
      role: 'Defender',
      abilityKey: 'shieldWall',
    });
  }

  if (rolesEnabled && player?.role === 'Engineer') {
    const demolishInProgress = Boolean(player.demolishActive && demolishProgressTime);
    const demolishOnCooldown = !demolishInProgress && demolishCooldownTime !== null;

    abilityButtons.push({
      key: 'emergency-repair',
      icon: '🔧',
      title: t('roles.Engineer.abilities.emergencyRepair.title' as never),
      description: t('roles.Engineer.abilities.emergencyRepair.description' as never),
      shortDescription: t('roles.Engineer.abilities.emergencyRepair.shortDesc' as never),
      status: emergencyRepairCooldownTime !== null
        ? formatStatus('cooldown', emergencyRepairCooldownTime)
        : formatStatus('activate'),
      className: `player-hud__ability ${emergencyRepairCooldownTime !== null ? 'player-hud__ability--cooldown' : ''}`,
      accentColor: ROLE_ACCENT_COLORS.Engineer,
      disabled: emergencyRepairCooldownTime !== null,
      onClick: emergencyRepairCooldownTime !== null ? undefined : onActivateEmergencyRepair,
      role: 'Engineer',
      abilityKey: 'emergencyRepair',
    });

    abilityButtons.push({
      key: 'demolish',
      icon: '💣',
      title: t('roles.Engineer.abilities.demolish.title' as never),
      description: t('roles.Engineer.abilities.demolish.description' as never),
      shortDescription: t('roles.Engineer.abilities.demolish.shortDesc' as never),
      status: demolishInProgress
        ? formatStatus('inProgress', demolishProgressTime)
        : demolishOnCooldown
          ? formatStatus('cooldown', demolishCooldownTime)
          : formatStatus('activate'),
      className: `player-hud__ability ${demolishInProgress ? 'player-hud__ability--active ability-btn-active' : ''} ${demolishOnCooldown ? 'player-hud__ability--cooldown' : ''}`,
      accentColor: ROLE_ACCENT_COLORS.Engineer,
      disabled: demolishInProgress || demolishOnCooldown,
      onClick: demolishInProgress || demolishOnCooldown ? undefined : onStartDemolish,
      role: 'Engineer',
      abilityKey: 'demolish',
    });
  }

  if (showBeacon && player) {
    abilityButtons.push({
      key: 'beacon',
      icon: '📡',
      title: t('phase5.beacon' as never),
      description: t('phase5.beaconDesc' as never),
      status: player.isBeacon ? formatStatus('active') : formatStatus('activate'),
      className: `player-hud__ability ${player.isBeacon ? 'player-hud__ability--active ability-btn-active' : ''}`,
      onClick: player.isBeacon ? onDeactivateBeacon : onActivateBeacon,
    });
  }

  const hasAbilities = abilityButtons.length > 0;

  const terrainType = targetCell?.terrainType;
  const terrainLabel =
    terrainType && terrainType !== 'None'
      ? t(`terrain.${terrainType}` as never)
      : null;
  const terrainIcon = terrainType ? TERRAIN_ICONS[terrainType] : null;
  const defendBonus = terrainDefendBonus(terrainType, true);

  return (
    <div
      className={`player-hud ${hasActions ? 'player-hud--active' : 'player-hud--idle'} player-hud--${relation}`}
      style={{ '--dock-accent': accentColor } as React.CSSProperties}
    >
      {(hasActions || currentHex) && (
        <div className="player-hud__context">
          {carriedTroops > 0 && (
            <span
              className="player-hud__carried"
              style={{ '--player-color': playerColor } as React.CSSProperties}
            >
              🎒 {carriedTroops}
            </span>
          )}

          <span className={`player-hud__relation player-hud__relation--${relation}`}>
            {t(`game.dock.relation.${relation}`)}
          </span>

          {relation === 'team' && myAllianceName && (
            <span className="player-hud__owner">
              <span
                className="player-hud__owner-dot"
                style={{ background: targetCell?.ownerColor ?? 'var(--muted)' }}
              />
              {myAllianceName}
              {targetCell?.ownerName && (
                <span className="player-hud__claimer">{targetCell.ownerName}</span>
              )}
            </span>
          )}

          {relation === 'enemy' && targetCell?.ownerName && (
            <span className="player-hud__owner">
              <span
                className="player-hud__owner-dot"
                style={{ background: targetCell.ownerColor ?? 'var(--muted)' }}
              />
              {targetCell.ownerName}
            </span>
          )}

          {targetCell && targetCell.troops > 0 && (
            <span className="player-hud__troops">⚔ {targetCell.troops}</span>
          )}

          {terrainLabel && (
            <span
              className="player-hud__terrain"
              title={defendBonus > 0
                ? t('game.dock.terrainDefenceBonus' as never, {
                  bonus: defendBonus,
                  terrain: terrainLabel,
                })
                : undefined}
            >
              {terrainIcon && <span aria-hidden>{terrainIcon}</span>}
              {terrainLabel}
              {defendBonus > 0 && (
                <span className="player-hud__defend-bonus">+{defendBonus}🛡</span>
              )}
            </span>
          )}

          {targetCell?.isFortified && (
            <span className="player-hud__badge" title={t('phase3.fortifiedDesc' as never)}>🛡️</span>
          )}
          {targetCell?.isFort && (
            <span className="player-hud__badge" title={t('game.dock.fort' as never)}>🏰</span>
          )}
        </div>
      )}

      {hasActions && (
        <div className="player-hud__tile-actions">
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
                {action.icon}
              </span>
              <span className="player-hud__btn-label">
                {t(action.label as never)}
              </span>
              {!action.enabled && <span className="player-hud__btn-locked" aria-hidden>🔒</span>}
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
        <div className="player-hud__abilities">
          {abilityButtons.map((ability) => (
            <button
              key={ability.key}
              type="button"
              className={ability.className}
              onClick={() => handleAbilityClick(ability)}
              onPointerDown={() => handleAbilityPointerDown(ability)}
              onPointerUp={handleAbilityPointerEnd}
              onPointerCancel={handleAbilityPointerEnd}
              onPointerLeave={handleAbilityPointerEnd}
              title={ability.description}
              aria-disabled={ability.disabled || undefined}
            >
              <span className="player-hud__ability-main">
                <span className="player-hud__ability-title-group">
                  <span
                    className="player-hud__ability-icon"
                    style={{ '--ability-accent': ability.accentColor } as React.CSSProperties}
                  >
                    {ability.icon}
                  </span>
                  <span className="player-hud__ability-label">{ability.title}</span>
                </span>
                <span className="player-hud__countdown">{ability.status}</span>
              </span>
              {ability.shortDescription && (
                <span className="ability-subtitle">{ability.shortDescription}</span>
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
              <span className="player-hud__empty-icon">📍</span>
              <span>{t('game.dock.noLocation')}</span>
            </>
          )}
          {emptyReason === 'outsideGrid' && (
            <>
              <span className="player-hud__empty-icon">🗺️</span>
              <span>{t('game.dock.outsideGrid')}</span>
            </>
          )}
          {emptyReason === 'noActions' && (
            <>
              <span className="player-hud__empty-icon">✓</span>
              <span>{t('game.dock.noActions')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
