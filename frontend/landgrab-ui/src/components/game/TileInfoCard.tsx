import { useTranslation } from 'react-i18next';
import type { HexCell } from '../../types/game';
import { terrainDefendBonus } from '../../utils/terrainColors';
import { terrainIcons } from '../../utils/terrainIcons';
import { GameIcon } from '../common/GameIcon';

interface TileInfoCardProps {
  targetCell: HexCell | undefined;
  targetHex: [number, number];
  onDismiss: () => void;
}

export function TileInfoCard({ targetCell, targetHex, onDismiss }: TileInfoCardProps) {
  const { t } = useTranslation();

  if (!targetCell) return null;

  const terrainType = targetCell.terrainType;
  const terrainLabel = terrainType && terrainType !== 'None' ? t(`terrain.${terrainType}` as never) : null;
  const terrainIconName = terrainType && terrainType !== 'None' ? terrainIcons[terrainType] : '';
  const defendBonus = terrainDefendBonus(terrainType, true);
  const hasOwner = !!targetCell.ownerId;

  return (
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
                className="tile-info-card__color-dot"
                style={{ background: targetCell.ownerColor ?? '#888' }}
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

        {terrainLabel && (
          <div className="tile-info-card__row">
            <span className="tile-info-card__label">{t('game.tileInfo.terrain')}</span>
            <span className="tile-info-card__value">
              {terrainIconName && <GameIcon name={terrainIconName} size="sm" />} {terrainLabel}
              {defendBonus > 0 && <span className="tile-info-card__bonus"> +{defendBonus}<GameIcon name="shield" size="sm" /></span>}
            </span>
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
      </div>
    </div>
  );
}
