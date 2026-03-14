import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDynamics, HexCell, Player } from '../../types/game';
import type { TileAction, TileActionType } from './tileInteraction';
import { terrainDefendBonus } from '../../utils/terrainColors';

/* ═══════════════════════════════════════════════════════════════════════
   PlayerHUD — Unified bottom-of-screen HUD
   ═══════════════════════════════════════════════════════════════════════
   Merges ActionDock (tile context + actions) and AbilityBar (beacon,
   stealth, commando) into one persistent bar. One-handed, thumb-friendly,
   designed for players walking around.
   ═══════════════════════════════════════════════════════════════════════ */

interface PlayerHUDProps {
  // Tile action props (from ActionDock)
  actions: TileAction[];
  onAction: (actionType: TileActionType) => void;
  currentHex: [number, number] | null;
  targetCell: HexCell | undefined;
  carriedTroops: number;
  playerColor: string;
  hasLocation: boolean;
  myUserId?: string;
  myAllianceId?: string;
  // Ability props (from AbilityBar)
  player?: Player;
  dynamics?: GameDynamics;
  onActivateBeacon: () => void;
  onDeactivateBeacon: () => void;
  onActivateStealth: () => void;
  commandoTargetingMode: boolean;
  onStartCommandoTargeting: () => void;
  onCancelCommandoTargeting: () => void;
}

type HexRelation = 'own' | 'allied' | 'enemy' | 'neutral';

function getHexRelation(
  cell: HexCell | undefined,
  myUserId?: string,
  myAllianceId?: string,
): HexRelation {
  if (!cell || !cell.ownerId) return 'neutral';
  if (cell.ownerId === myUserId) return 'own';
  if (myAllianceId && cell.ownerAllianceId === myAllianceId) return 'allied';
  return 'enemy';
}

const RELATION_ACCENT: Record<HexRelation, string> = {
  own: 'rgba(46, 204, 113, 0.6)',
  allied: 'rgba(52, 152, 219, 0.5)',
  enemy: 'rgba(231, 76, 60, 0.6)',
  neutral: 'rgba(149, 165, 166, 0.3)',
};

const TERRAIN_ICONS: Record<string, string> = {
  Water: '🌊', Building: '🏢', Road: '═', Path: '···',
  Forest: '🌿', Park: '🌳', Hills: '⛰️', Steep: '🏔️',
};

function formatCountdown(isoDate: string | undefined): string | null {
  if (!isoDate) return null;
  const remaining = new Date(isoDate).getTime() - Date.now();
  if (remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  player,
  dynamics,
  onActivateBeacon,
  onDeactivateBeacon,
  onActivateStealth,
  commandoTargetingMode,
  onStartCommandoTargeting,
  onCancelCommandoTargeting,
}: PlayerHUDProps) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);

  // Ability state
  const modes = dynamics?.activeCopresenceModes ?? [];
  const showBeacon = modes.includes('Beacon');
  const showStealth = modes.includes('Stealth');
  const showCommando = modes.includes('CommandoRaid');
  const hasAbilities = showBeacon || showStealth || showCommando;

  const hasActiveCountdown = Boolean(
    player && (player.stealthUntil || player.stealthCooldownUntil || player.commandoDeadline || player.commandoCooldownUntil)
  );

  useEffect(() => {
    if (!hasActiveCountdown) return;
    const interval = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [hasActiveCountdown]);

  // Tile state
  const hasActions = actions.length > 0;
  const emptyReason: 'noLocation' | 'outsideGrid' | 'noActions' = !hasLocation
    ? 'noLocation'
    : !currentHex
      ? 'outsideGrid'
      : 'noActions';

  const relation = getHexRelation(targetCell, myUserId, myAllianceId);
  const accentColor = RELATION_ACCENT[relation];

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
      {/* ── Context strip (visible when on a hex) ── */}
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

          {targetCell?.ownerName && relation !== 'own' && (
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
            <span className="player-hud__terrain">
              {terrainIcon && <span aria-hidden>{terrainIcon}</span>}
              {terrainLabel}
              {defendBonus > 0 && (
                <span className="player-hud__defend-bonus">+{defendBonus}🛡</span>
              )}
            </span>
          )}

          {targetCell?.isFortified && (
            <span className="player-hud__badge" title={t('game.dock.fortified')}>🛡️</span>
          )}
          {targetCell?.isFort && (
            <span className="player-hud__badge" title={t('game.dock.fort')}>🏰</span>
          )}
        </div>
      )}

      {/* ── Tile actions (big buttons — primary interaction) ── */}
      {hasActions && (
        <div className="player-hud__tile-actions">
          {actions.map((action, i) => (
            <button
              key={action.type}
              className={`player-hud__btn player-hud__btn--${action.tone}`}
              disabled={!action.enabled}
              onClick={() => onAction(action.type)}
              style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
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

      {/* ── Disabled reason ── */}
      {hasActions && actions.some((a) => !a.enabled && a.disabledReason) && (
        <div className="player-hud__disabled-reason">
          {t(actions.find((a) => !a.enabled && a.disabledReason)!.disabledReason! as never)}
        </div>
      )}

      {/* ── Ability bar (secondary row) ── */}
      {hasAbilities && (
        <div className="player-hud__abilities">
          {showBeacon && player && (
            <button
              type="button"
              className={`player-hud__ability ${player.isBeacon ? 'player-hud__ability--active' : ''}`}
              onClick={player.isBeacon ? onDeactivateBeacon : onActivateBeacon}
            >
              <span className="player-hud__ability-icon">📡</span>
              <span className="player-hud__ability-label">
                {player.isBeacon ? t('phase5.beaconDeactivate' as never) : t('phase5.beaconActivate' as never)}
              </span>
            </button>
          )}

          {showStealth && player && (() => {
            const activeTime = formatCountdown(player.stealthUntil);
            const cooldownTime = formatCountdown(player.stealthCooldownUntil);
            const isActive = activeTime !== null;
            const isOnCooldown = !isActive && cooldownTime !== null;

            return (
              <button
                type="button"
                className={`player-hud__ability ${isActive ? 'player-hud__ability--active' : ''} ${isOnCooldown ? 'player-hud__ability--cooldown' : ''}`}
                onClick={!isActive && !isOnCooldown ? onActivateStealth : undefined}
                disabled={isActive || isOnCooldown}
              >
                <span className="player-hud__ability-icon">👻</span>
                <span className="player-hud__ability-label">
                  {isActive
                    ? t('phase6.stealthActive' as never, { time: activeTime })
                    : isOnCooldown
                      ? t('phase6.stealthCooldown' as never)
                      : t('phase6.stealthActivate' as never)}
                </span>
                {isOnCooldown && cooldownTime && (
                  <span className="player-hud__countdown">{cooldownTime}</span>
                )}
              </button>
            );
          })()}

          {showCommando && player && (() => {
            const deadlineTime = formatCountdown(player.commandoDeadline);
            const cooldownTime = formatCountdown(player.commandoCooldownUntil);
            const isActive = player.isCommandoActive && deadlineTime !== null;
            const isOnCooldown = !isActive && cooldownTime !== null;

            if (commandoTargetingMode) {
              return (
                <button
                  type="button"
                  className="player-hud__ability player-hud__ability--targeting"
                  onClick={onCancelCommandoTargeting}
                >
                  <span className="player-hud__ability-icon">🎯</span>
                  <span className="player-hud__ability-label">{t('phase6.commandoSelectTarget' as never)}</span>
                </button>
              );
            }

            return (
              <button
                type="button"
                className={`player-hud__ability ${isActive ? 'player-hud__ability--active' : ''} ${isOnCooldown ? 'player-hud__ability--cooldown' : ''}`}
                onClick={!isActive && !isOnCooldown ? onStartCommandoTargeting : undefined}
                disabled={isActive || isOnCooldown}
              >
                <span className="player-hud__ability-icon">⚔️</span>
                <span className="player-hud__ability-label">
                  {isActive
                    ? t('phase6.commandoActive' as never, { time: deadlineTime })
                    : isOnCooldown
                      ? t('phase6.commandoCooldown' as never)
                      : t('phase6.commandoActivate' as never)}
                </span>
                {isOnCooldown && cooldownTime && (
                  <span className="player-hud__countdown">{cooldownTime}</span>
                )}
              </button>
            );
          })()}
        </div>
      )}

      {/* ── Empty state ── */}
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
