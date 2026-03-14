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
}

const toneBg: Record<TileAction['tone'], string> = {
  primary: '#3498db',
  danger: '#e74c3c',
  info: '#2ecc71',
  neutral: '#95a5a6',
};

const toneGlow: Record<TileAction['tone'], string> = {
  primary: 'rgba(52, 152, 219, 0.35)',
  danger: 'rgba(231, 76, 60, 0.35)',
  info: 'rgba(46, 204, 113, 0.35)',
  neutral: 'rgba(149, 165, 166, 0.15)',
};

export function ActionDock({
  actions,
  onAction,
  currentHex,
  targetCell,
  carriedTroops,
  playerColor,
  hasLocation,
}: ActionDockProps) {
  const { t } = useTranslation();

  const hasActions = actions.length > 0;
  const emptyReason: 'noLocation' | 'outsideGrid' | 'noActions' = !hasLocation
    ? 'noLocation'
    : !currentHex
      ? 'outsideGrid'
      : 'noActions';

  /* ── terrain one-liner ── */
  const terrainLabel =
    targetCell?.terrainType && targetCell.terrainType !== 'None'
      ? t(`terrain.${targetCell.terrainType}` as never)
      : null;

  const defendBonus = terrainDefendBonus(
    targetCell?.terrainType,
    true, // always show if terrain exists — the game will gate elsewhere
  );

  return (
    <div
      className={`action-dock ${hasActions ? 'action-dock--active' : 'action-dock--empty'}`}
    >
      {hasActions ? (
        <>
          {/* ── Context strip ── */}
          <div className="action-dock__context">
            <span className="action-dock__hex-id">
              ⬡ {currentHex![0]},{currentHex![1]}
            </span>

            {targetCell?.ownerName ? (
              <span className="action-dock__owner">
                <span
                  className="action-dock__owner-dot"
                  style={{ background: targetCell.ownerColor ?? 'var(--muted)' }}
                />
                {targetCell.ownerName}
              </span>
            ) : (
              <span className="action-dock__owner action-dock__owner--neutral">
                {t('game.tileAction.neutral' as never)}
              </span>
            )}

            {targetCell && (
              <span className="action-dock__troops">
                ⚔ {targetCell.troops}
              </span>
            )}

            {terrainLabel && (
              <span className="action-dock__terrain">
                {terrainLabel}
                {defendBonus > 0 && (
                  <span className="action-dock__defend-bonus">+{defendBonus}</span>
                )}
              </span>
            )}

            {targetCell?.isFortified && (
              <span className="action-dock__badge">🛡️</span>
            )}
            {targetCell?.isFort && (
              <span className="action-dock__badge">🏰</span>
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
                style={{
                  '--btn-bg': toneBg[action.tone],
                  '--btn-glow': toneGlow[action.tone],
                  animationDelay: `${i * 40}ms`,
                } as React.CSSProperties}
                aria-label={t(action.label as never)}
              >
                <span className="action-dock__btn-icon" aria-hidden>
                  {action.icon}
                </span>
                <span className="action-dock__btn-label">
                  {t(action.label as never)}
                </span>
              </button>
            ))}
          </div>

          {/* ── Disabled reason (first disabled action) ── */}
          {actions.some((a) => !a.enabled && a.disabledReason) && (
            <div className="action-dock__disabled-reason">
              {t(actions.find((a) => !a.enabled && a.disabledReason)!.disabledReason! as never)}
            </div>
          )}

          {/* ── Carried troops badge ── */}
          <div
            className="action-dock__carried"
            style={{
              '--player-color': playerColor,
            } as React.CSSProperties}
          >
            🎒 {carriedTroops}
          </div>
        </>
      ) : (
        /* ── Empty states ── */
        <div className="action-dock__empty">
          {emptyReason === 'noLocation' && (
            <>
              <span className="action-dock__empty-icon">📍</span>
              <span>{t('dock.noLocation' as never)}</span>
            </>
          )}
          {emptyReason === 'outsideGrid' && (
            <>
              <span className="action-dock__empty-icon">🗺️</span>
              <span>{t('dock.outsideGrid' as never)}</span>
            </>
          )}
          {emptyReason === 'noActions' && (
            <>
              <span className="action-dock__empty-icon">✓</span>
              <span>{t('dock.noActions' as never)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
