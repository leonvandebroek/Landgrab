import { useTranslation } from 'react-i18next';
import type { HexCell, Player } from '../../types/game';
import type { TileAction, TileActionType } from './tileInteraction';
import { terrainDefendBonus } from '../../utils/terrainColors';

interface TileActionPanelProps {
  actions: TileAction[];
  targetCell: HexCell | undefined;
  targetHex: [number, number];
  player: Player | null;
  onAction: (actionType: TileActionType) => void;
  onDismiss: () => void;
}

const toneColors: Record<TileAction['tone'], string> = {
  primary: 'var(--primary, #3498db)',
  danger: 'var(--danger, #e74c3c)',
  info: 'var(--info, #2ecc71)',
  neutral: 'var(--muted, #95a5a6)',
};

export function TileActionPanel({
  actions,
  targetCell,
  targetHex,
  player,
  onAction,
  onDismiss,
}: TileActionPanelProps) {
  const { t } = useTranslation();

  if (actions.length === 0) return null;

  const carriedTroops = player?.carriedTroops ?? 0;

  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        width: '100%',
        pointerEvents: 'auto',
        padding: '0.75rem',
      }}
    >
      {/* ── Tile info header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            {t('game.tileAction.tileCoords', { q: targetHex[0], r: targetHex[1] })}
          </span>
          {targetCell?.ownerName && (
            <span style={{ fontSize: '0.8rem' }}>
              {t('game.tileAction.owner')}: {' '}
              <strong style={{ color: targetCell.ownerColor ?? 'inherit' }}>
                {targetCell.ownerName}
              </strong>
            </span>
          )}
          {targetCell && (
            <span style={{ fontSize: '0.8rem' }}>
              {t('game.tileAction.tileTroops')}: <strong>{targetCell.troops}</strong>
            </span>
          )}
          {targetCell?.terrainType && targetCell.terrainType !== 'None' && (
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
              🏔️ {t(`terrain.${targetCell.terrainType}` as never)}
              {terrainDefendBonus(targetCell.terrainType, true) > 0 && (
                <> ({t('terrain.defendBonus', { bonus: terrainDefendBonus(targetCell.terrainType, true) })})</>
              )}
            </span>
          )}
        </div>

        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          <span style={{ fontSize: '0.8rem' }}>
            {t('game.tileAction.carrying')}: <strong>{carriedTroops}</strong>
          </span>
          <button
            className="hud-btn-flat"
            onClick={onDismiss}
            style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', alignSelf: 'flex-end' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {actions.map((action) => {
          const isIgnore = action.type === 'ignore';

          return (
            <button
              key={action.type}
              className={`hud-btn ${action.tone}`}
              disabled={!action.enabled}
              onClick={() => onAction(action.type)}
              style={{
                minHeight: isIgnore ? '36px' : '48px',
                fontSize: isIgnore ? '0.85rem' : '1rem',
                opacity: action.enabled ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                width: '100%',
                backgroundColor: action.enabled ? toneColors[action.tone] : undefined,
                cursor: action.enabled ? 'pointer' : 'not-allowed',
              }}
            >
              <span>{action.icon}</span>
              <span>{t(action.label as never)}</span>
            </button>
          );
        })}
      </div>

      {/* ── Disabled reason (show for first disabled action) ── */}
      {actions.some((a) => !a.enabled && a.disabledReason) && (
        <div style={{ fontSize: '0.75rem', opacity: 0.7, textAlign: 'center' }}>
          {t(actions.find((a) => !a.enabled && a.disabledReason)!.disabledReason! as never)}
        </div>
      )}
    </div>
  );
}
