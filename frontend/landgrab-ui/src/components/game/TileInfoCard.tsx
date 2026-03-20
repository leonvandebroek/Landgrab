import { useTranslation } from 'react-i18next';
import type { HexCell } from '../../types/game';
import { GameIcon } from '../common/GameIcon';

const TILE_OWNER_FALLBACK_COLOR = 'rgba(177, 204, 220, 0.5)';
const TILE_VALUE_POSITIVE_COLOR = 'rgba(46, 204, 113, 0.85)';
const TILE_INFO_CARD_TOKEN_STYLES = `
  .tile-info-card__color-dot--fallback {
    background: ${TILE_OWNER_FALLBACK_COLOR};
  }

  .tile-info-card__value--positive {
    color: ${TILE_VALUE_POSITIVE_COLOR};
  }
`;

interface TileInfoCardProps {
  targetCell: HexCell | undefined;
  targetHex: [number, number];
  onDismiss: () => void;
  isPresenceBoosted?: boolean;
}

export function TileInfoCard({ targetCell, targetHex, onDismiss, isPresenceBoosted }: TileInfoCardProps) {
  const { t } = useTranslation();

  if (!targetCell) return null;

  const hasOwner = !!targetCell.ownerId;

  return (
    <>
      <style>{TILE_INFO_CARD_TOKEN_STYLES}</style>
      <div className="tile-info-card" style={{ pointerEvents: 'auto' }}>
        <div className="tile-info-card__header">
          <span className="tile-info-card__coords">
            ⬡ {targetHex[0]}, {targetHex[1]}
          </span>
          <button
            type="button"
            className="tile-info-card__close"
            onClick={onDismiss}
            aria-label={t('game.close')}
          >
            ×
          </button>
        </div>

        <div className="tile-info-card__body">
          {hasOwner && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__label">{t('game.tileInfo.owner')}</span>
              <span className="tile-info-card__value">
                <span
                  className={`tile-info-card__color-dot ${targetCell.ownerColor ? '' : 'tile-info-card__color-dot--fallback'}`}
                  style={targetCell.ownerColor ? { background: targetCell.ownerColor } : undefined}
                />
                {targetCell.ownerName ?? t('game.unknown')}
              </span>
            </div>
          )}

          {targetCell.troops > 0 && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__label">{t('game.tileInfo.troops')}</span>
              <span className="tile-info-card__value"><GameIcon name="contested" size="sm" /> {targetCell.troops}</span>
            </div>
          )}

          {targetCell.isFortified && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__label">{t('game.tileInfo.status')}</span>
              <span className="tile-info-card__value"><GameIcon name="shield" size="sm" /> {t('game.dock.fortified')}</span>
            </div>
          )}

          {targetCell.isFort && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__label">{t('game.tileInfo.status')}</span>
              <span className="tile-info-card__value"><GameIcon name="fort" size="sm" /> {t('game.dock.fort')}</span>
            </div>
          )}

          {targetCell.isMasterTile && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__value tile-info-card__master">
                <GameIcon name="crown" size="sm" /> {t('game.tileAction.masterTile')}
              </span>
            </div>
          )}

          {!hasOwner && !targetCell.isMasterTile && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__value tile-info-card__neutral">
                {t('game.tileInfo.unclaimed')}
              </span>
            </div>
          )}

          {isPresenceBoosted && (
            <div className="tile-info-card__row">
              <span className="tile-info-card__value tile-info-card__value--positive">
                <GameIcon name="rallyTroops" size="sm" /> {t('game.tileInfo.presenceBoost' as never)}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
