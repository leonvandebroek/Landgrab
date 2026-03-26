import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [panelHost, setPanelHost] = useState<HTMLElement | null>(null);

  const rootRef = useCallback((node: HTMLDivElement | null) => {
    const host = node?.closest('.game-map-container');
    const nextPanelHost = host instanceof HTMLElement ? host : null;
    setPanelHost(nextPanelHost);
  }, []);

  useEffect(() => {
    if (isExpanded && panelRef.current) {
      panelRef.current.scrollTop = 0;
    }
  }, [isExpanded]);

  const legendPanel = isExpanded ? (
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
          <span className="legend-swatch frontier-border"></span>
          <span>{t('mapLegend.frontier' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch contested-tile"></span>
          <span>{t('mapLegend.contestedTile' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch contested-border"></span>
          <span>{t('mapLegend.contested' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch selection-friendly"></span>
          <span>{t('mapLegend.selectionFriendly' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch selection-hostile"></span>
          <span>{t('mapLegend.selectionHostile' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch rally-objective">
            <GameIcon name="rallyTroops" size="sm" />
          </span>
          <span>{t('mapLegend.rallyObjective' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch sabotage-ring">
            <GameIcon name="lightning" size="sm" />
          </span>
          <span>{t('mapLegend.sabotageRing' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch demolish-ring">
            <GameIcon name="hammerDrop" size="sm" />
          </span>
          <span>{t('mapLegend.demolishRing' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch build-ring"></span>
          <span>{t('mapLegend.buildRing' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch regen-blocked">
            <GameIcon name="hourglass" size="sm" />
          </span>
          <span>{t('mapLegend.regenBlocked' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-chip-example legend-chip-example--reachable">✓</span>
          <span>{t('mapLegend.chipReachable' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-chip-example legend-chip-example--unreachable">!</span>
          <span>{t('mapLegend.chipUnreachable' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-chip-example legend-chip-example--copresence">3/3</span>
          <span>{t('mapLegend.chipCopresence' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-chip-example legend-chip-example--presence-boost">↑</span>
          <span>{t('mapLegend.presenceBoost' as never)}</span>
        </div>
        <div className="legend-row">
          <span className="legend-swatch beacon-radius">
            <GameIcon name="radioTower" size="sm" />
          </span>
          <span>{t('mapLegend.beaconRadius' as never)}</span>
        </div>

        <div className="legend-divider"></div>

        {/* Icons & Special Hexes */}
        <div className="legend-row">
           <div className="legend-badge-example">5</div>
           <span>{t('mapLegend.troops' as never)}</span>
        </div>
        <div className="legend-row">
           <span className="legend-icon-wrapper master">
             <GameIcon name="crown" size="sm" />
           </span>
          <span>{t('mapLegend.glyphMaster' as never)}</span>
        </div>
        <div className="legend-row">
           <span className="legend-icon-wrapper hq">
             <GameIcon name="hq" size="sm" />
           </span>
          <span>{t('mapLegend.glyphHq' as never)}</span>
        </div>
        <div className="legend-row">
           <span className="legend-icon-wrapper fort">
             <GameIcon name="fort" size="sm" />
           </span>
          <span>{t('mapLegend.glyphFort' as never)}</span>
        </div>

      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="map-legend">
      {panelHost && legendPanel ? createPortal(legendPanel, panelHost) : legendPanel}
      <button
        type="button"
        className={`map-control-fab map-legend-trigger ${isExpanded ? 'active is-active' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? t('mapLegend.collapseLegend' as never) : t('mapLegend.expandLegend' as never)}
        title={isExpanded ? t('mapLegend.collapseLegend' as never) : t('mapLegend.expandLegend' as never)}
      >
        <span className="map-legend-trigger__icon">🗺️</span>
      </button>
    </div>
  );
}
