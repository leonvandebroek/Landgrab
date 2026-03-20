import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';

export function MapLegend() {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem('landgrab_legend_seen') !== 'true';
    } catch {
      return true;
    }
  });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded && panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [isExpanded]);

  return (
    <div className="map-legend">
      {isExpanded && (
        <div
          ref={panelRef}
          className="map-legend-panel"
        >
          <div className="map-legend-header">
            <h3>{t('mapLegend.title' as never)}</h3>
            <button 
              className="map-legend-close"
              onClick={() => { try { localStorage.setItem('landgrab_legend_seen', 'true'); } catch { /* ignore */ } setIsExpanded(false); }}
              aria-label={t('mapLegend.collapseLegend' as never)}
            >
              ✕
            </button>
          </div>
          
          <div className="map-legend-content">
            {/* Territory States */}
            <div className="legend-row">
              <span className="legend-swatch your-territory"></span>
              <span>{t('mapLegend.yourTerritory' as never)}</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch enemy-territory"></span>
              <span>{t('mapLegend.enemyTerritory' as never)}</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch neutral-territory"></span>
              <span>{t('mapLegend.neutral' as never)}</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch current-location"></span>
              <span>{t('mapLegend.youAreHere' as never)}</span>
            </div>
            <div className="legend-row">
              <span className="legend-swatch contested-border"></span>
              <span>{t('mapLegend.contested' as never)}</span>
            </div>

            <div className="legend-divider"></div>

            {/* Icons & Special Hexes */}
            <div className="legend-row">
               <div className="legend-badge-example">5</div>
               <span>{t('mapLegend.troops' as never)}</span>
            </div>
            <div className="legend-row">
               <span className="legend-icon-wrapper master">
                 <GameIcon name="master" size="sm" />
               </span>
               <span>{t('mapLegend.masterTile' as never)}</span>
            </div>
            <div className="legend-row">
               <span className="legend-icon-wrapper hq">
                 <GameIcon name="hq" size="sm" />
               </span>
               <span>{t('mapLegend.hqHex' as never)}</span>
            </div>
            <div className="legend-row">
               <span className="legend-icon-wrapper fort">
                 <GameIcon name="fort" size="sm" />
               </span>
               <span>{t('mapLegend.fort' as never)}</span>
            </div>

          </div>
        </div>
      )}

      <button
        className={`map-control-fab map-legend-trigger ${isExpanded ? 'active' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? t('mapLegend.collapseLegend' as never) : t('mapLegend.expandLegend' as never)}
      >
        <span style={{ fontSize: '1.2rem' }}>🗺️</span>
      </button>
    </div>
  );
}
