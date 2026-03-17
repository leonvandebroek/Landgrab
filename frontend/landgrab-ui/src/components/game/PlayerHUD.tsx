import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameDynamics, HexCell, Player } from '../../types/game';
import { getTileActionDisabledReasonText } from './tileInteraction';
import type { TileAction, TileActionType } from './tileInteraction';
import { useGameplayStore } from '../../stores/gameplayStore';
import { useSecondTick } from '../../hooks/useSecondTick';
import { terrainDefendBonus } from '../../utils/terrainColors';

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
}

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
  myAllianceName,
  player,
  dynamics,
  onActivateBeacon,
  onDeactivateBeacon,
}: PlayerHUDProps) {
  const { t } = useTranslation();
  const commandoTargetingMode = useGameplayStore((state) => state.commandoTargetingMode);
  const setCommandoTargetingMode = useGameplayStore((state) => state.setCommandoTargetingMode);
  const [, setTick] = useState(0);

  const modes = dynamics?.activeCopresenceModes ?? [];
  const showBeacon = modes.includes('Beacon');
  const showCommando = modes.includes('CommandoRaid');
  const hasAbilities = showBeacon || showCommando;

  const hasActiveCountdown = Boolean(
    player && (player.commandoDeadline || player.commandoCooldownUntil),
  );

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
          {showBeacon && player && (
            <button
              type="button"
              className={`player-hud__ability ${player.isBeacon ? 'player-hud__ability--active' : ''}`}
              onClick={player.isBeacon ? onDeactivateBeacon : onActivateBeacon}
              title={t('dynamics.mode.Beacon.detail' as never)}
            >
              <span className="player-hud__ability-icon">📡</span>
              <span className="player-hud__ability-label">
                {player.isBeacon ? t('phase5.beaconDeactivate' as never) : t('phase5.beaconActivate' as never)}
              </span>
            </button>
          )}

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
                  onClick={() => setCommandoTargetingMode(false)}
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
                onClick={!isActive && !isOnCooldown ? () => setCommandoTargetingMode(true) : undefined}
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
