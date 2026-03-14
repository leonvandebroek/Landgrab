import { useTranslation } from 'react-i18next';
import type { HexCell } from '../../types/game';
import type { TileAction, TileActionType } from './tileInteraction';
import { terrainDefendBonus } from '../../utils/terrainColors';

/* ═══════════════════════════════════════════════════════════════════════
   ActionDock — Persistent bottom-of-screen action bar
   ═══════════════════════════════════════════════════════════════════════
   Always visible. Auto-updates when the player walks into a new hex.
   Designed for one-handed, on-the-move use: big buttons, high contrast,
   zero-scroll layout, thumb-friendly hit targets.
   ═══════════════════════════════════════════════════════════════════════ */

interface ActionDockProps {
  actions: TileAction[];
  onAction: (actionType: TileActionType) => void;
  currentHex: [number, number] | null;
  targetCell: HexCell | undefined;
  carriedTroops: number;
  playerColor: string;
  hasLocation: boolean;
  myUserId?: string;
  myAllianceId?: string;
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

export function ActionDock({
  actions,
  onAction,
  currentHex,
  targetCell,
  carriedTroops,
  playerColor,
  hasLocation,
  myUserId,
  myAllianceId,
}: ActionDockProps) {
  const { t } = useTranslation();

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
      className={`action-dock ${hasActions ? 'action-dock--active' : 'action-dock--empty'} action-dock--${relation}`}
      style={{ '--dock-accent': accentColor } as React.CSSProperties}
    >
      {hasActions ? (
        <>
          {/* ── Carried troops pill (above dock) ── */}
          {carriedTroops > 0 && (
            <div
              className="action-dock__carried"
              style={{ '--player-color': playerColor } as React.CSSProperties}
            >
              <span className="action-dock__carried-icon">🎒</span>
              <span className="action-dock__carried-count">{carriedTroops}</span>
              <span className="action-dock__carried-label">{t('game.dock.troops')}</span>
            </div>
          )}

          {/* ── Context strip ── */}
          <div className="action-dock__context">
            {/* Hex relation badge */}
            <span className={`action-dock__relation action-dock__relation--${relation}`}>
              {t(`game.dock.relation.${relation}`)}
            </span>

            {/* Owner info (enemy/allied only) */}
            {targetCell?.ownerName && relation !== 'own' && (
              <span className="action-dock__owner">
                <span
                  className="action-dock__owner-dot"
                  style={{ background: targetCell.ownerColor ?? 'var(--muted)' }}
                />
                {targetCell.ownerName}
              </span>
            )}

            {/* Troop count (always for non-neutral) */}
            {targetCell && targetCell.troops > 0 && (
              <span className="action-dock__troops">
                ⚔ {targetCell.troops}
              </span>
            )}

            {/* Terrain pill */}
            {terrainLabel && (
              <span className="action-dock__terrain">
                {terrainIcon && <span aria-hidden>{terrainIcon}</span>}
                {terrainLabel}
                {defendBonus > 0 && (
                  <span className="action-dock__defend-bonus">
                    +{defendBonus}🛡
                  </span>
                )}
              </span>
            )}

            {/* Fortification badges */}
            {targetCell?.isFortified && (
              <span className="action-dock__badge" title={t('game.dock.fortified')}>🛡️</span>
            )}
            {targetCell?.isFort && (
              <span className="action-dock__badge" title={t('game.dock.fort')}>🏰</span>
            )}
          </div>

          {/* ── Action buttons row ── */}
          <div className="action-dock__actions">
            {actions.map((action, i) => (
              <button
                key={action.type}
                className={`action-dock__btn action-dock__btn--${action.tone}`}
                disabled={!action.enabled}
                onClick={() => onAction(action.type)}
                style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
                aria-label={t(action.label as never)}
              >
                <span className="action-dock__btn-icon" aria-hidden>
                  {action.icon}
                </span>
                <span className="action-dock__btn-label">
                  {t(action.label as never)}
                </span>
                {!action.enabled && (
                  <span className="action-dock__btn-locked" aria-hidden>🔒</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Disabled reason (first disabled action) ── */}
          {actions.some((a) => !a.enabled && a.disabledReason) && (
            <div className="action-dock__disabled-reason">
              {t(actions.find((a) => !a.enabled && a.disabledReason)!.disabledReason! as never)}
            </div>
          )}
        </>
      ) : (
        /* ── Empty states ── */
        <div className="action-dock__empty">
          {emptyReason === 'noLocation' && (
            <>
              <span className="action-dock__empty-icon">📍</span>
              <span>{t('game.dock.noLocation')}</span>
            </>
          )}
          {emptyReason === 'outsideGrid' && (
            <>
              <span className="action-dock__empty-icon">🗺️</span>
              <span>{t('game.dock.outsideGrid')}</span>
            </>
          )}
          {emptyReason === 'noActions' && (
            <>
              <span className="action-dock__empty-icon">✓</span>
              <span>{t('game.dock.noActions')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
