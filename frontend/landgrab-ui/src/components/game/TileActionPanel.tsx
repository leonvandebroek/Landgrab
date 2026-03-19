import { useTranslation } from 'react-i18next';
import type { HexCell, Player } from '../../types/game';
import { getTileActionDisabledReasonText } from './tileInteraction';
import type { TileAction, TileActionType } from './tileInteraction';
import { GameIcon } from '../common/GameIcon';

interface TileActionPanelProps {
  actions: TileAction[];
  targetCell: HexCell | undefined;
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
  player,
  onAction,
  onDismiss,
}: TileActionPanelProps) {
  const { t } = useTranslation();
  const firstDisabledAction = actions.find((action) => !action.enabled && action.disabledReason);
  const disabledReasonText = getTileActionDisabledReasonText(t, firstDisabledAction?.disabledReason);

  if (actions.length === 0) return null;

  const carriedTroops = player?.carriedTroops ?? 0;

  return (
    <div className="glass-panel tile-action-panel">
      <div className="tile-action-panel__header">
        <div className="tile-action-panel__info">
          {targetCell?.ownerName && (
            <span className="tile-action-panel__meta">
              {t('game.tileAction.owner')}: {' '}
              <strong style={{ color: targetCell.ownerColor ?? 'inherit' }}>
                {targetCell.ownerName}
              </strong>
            </span>
          )}
          {targetCell && (
            <span className="tile-action-panel__meta">
              {t('game.tileAction.tileTroops')}: <strong>{targetCell.troops}</strong>
            </span>
          )}
          {targetCell?.isFortified && (
            <span className="tile-action-panel__meta--muted">
              <GameIcon name="shield" size="sm" /> {t('phase3.fortified')}
            </span>
          )}
          {targetCell?.isFort && (
            <span className="tile-action-panel__meta--muted">
              <GameIcon name="fort" size="sm" /> {t('phase4.fort')}
            </span>
          )}
        </div>

        <div className="tile-action-panel__right">
          <span className="tile-action-panel__meta">
            {t('game.tileAction.carrying')}: <strong>{carriedTroops}</strong>
          </span>
          <button
            className="tile-action-panel__close"
            onClick={onDismiss}
            aria-label={t('common.close' as never)}
            type="button"
          >
            ×
          </button>
        </div>
      </div>

      <div className="tile-action-panel__actions">
        {actions.map((action) => (
          <button
            key={action.type}
            className={`hud-btn ${action.tone}`}
            disabled={!action.enabled}
            onClick={() => onAction(action.type)}
            style={{
              backgroundColor: action.enabled ? toneColors[action.tone] : undefined,
            }}
          >
            <span><GameIcon name={action.icon} /></span>
            <span>{t(action.label as never)}</span>
          </button>
        ))}
      </div>

      {disabledReasonText && (
        <div className="tile-action-panel__reason">
          {disabledReasonText}
        </div>
      )}
    </div>
  );
}
