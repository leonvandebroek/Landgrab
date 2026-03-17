import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../../stores/gameStore';
import {
  DEFAULT_MAP_LAYER_PREFS,
  LAYER_GROUPS,
  type MapLayerPreferences,
} from '../../../types/mapLayerPreferences';

interface MapLayerToggleProps {
  prefs: MapLayerPreferences;
  onPrefsChange: (prefs: MapLayerPreferences) => void;
}

const ALL_LAYER_KEYS: (keyof MapLayerPreferences)[] = LAYER_GROUPS.flatMap((group) => group.layers);

export function MapLayerToggle({ prefs, onPrefsChange }: MapLayerToggleProps) {
  const { t } = useTranslation();
  const gameState = useGameStore((state) => state.gameState);
  const panelId = useId();
  const [isExpanded, setIsExpanded] = useState(false);

  const allEnabled = ALL_LAYER_KEYS.every((layerKey) => prefs[layerKey]);
  const hasAssignedHq = gameState?.alliances.some(
    (alliance) => alliance.memberIds.length > 0 && alliance.hqHexQ != null && alliance.hqHexR != null,
  ) ?? false;
  const showSupplyLinesWarning = Boolean(
    prefs.supplyLines
    && gameState?.dynamics?.supplyLinesEnabled
    && !hasAssignedHq,
  );
  const supplyLinesWarningText = t('mapLayers.supplyLinesMissingHq' as never, {
    defaultValue: 'Supply lines require an HQ to be assigned',
  });

  function handlePanelToggle() {
    setIsExpanded((expanded) => !expanded);
  }

  function handleLayerToggle(layerKey: keyof MapLayerPreferences) {
    onPrefsChange({
      ...prefs,
      [layerKey]: !prefs[layerKey],
    });
  }

  function handleToggleAll() {
    const nextValue = !allEnabled;
    const nextPrefs = ALL_LAYER_KEYS.reduce<MapLayerPreferences>(
      (updatedPrefs, layerKey) => {
        updatedPrefs[layerKey] = nextValue;
        return updatedPrefs;
      },
      { ...prefs },
    );

    onPrefsChange(nextPrefs);
  }

  function handleResetAll() {
    onPrefsChange({ ...DEFAULT_MAP_LAYER_PREFS });
  }

  return (
    <div className="map-layer-toggle">
      <div
        id={panelId}
        className={`map-layer-toggle-panel${isExpanded ? ' is-expanded' : ''}`}
        aria-hidden={!isExpanded}
        inert={!isExpanded}
      >
        <div className="map-layer-toggle-surface">
          <div className="map-layer-toggle-header">
            <div className="map-layer-toggle-header-copy">
              <span className="map-layer-toggle-header-icon" aria-hidden="true">
                🗺️
              </span>
              <span className="map-layer-toggle-title">{t('mapLayers.title')}</span>
            </div>
            <button
              type="button"
              className="map-layer-toggle-collapse"
              onClick={() => setIsExpanded(false)}
              aria-label={t('mapLayers.collapsePanel')}
              title={t('mapLayers.collapsePanel')}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div className="map-layer-toggle-scroll">
            <div className="map-layer-toggle-actions">
              <button
                type="button"
                className="map-layer-toggle-action"
                onClick={handleToggleAll}
              >
                {t('mapLayers.toggleAll')}
              </button>
              <button
                type="button"
                className="map-layer-toggle-action"
                onClick={handleResetAll}
              >
                {t('mapLayers.resetAll')}
              </button>
            </div>

            <div className="map-layer-toggle-groups">
              {LAYER_GROUPS.map((group) => (
                <section key={group.key} className="map-layer-toggle-group">
                  <div className="map-layer-toggle-group-header">
                    <span className="map-layer-toggle-group-icon" aria-hidden="true">
                      {group.icon}
                    </span>
                    <h3 className="map-layer-toggle-group-title">
                      {t(`mapLayers.${group.key}` as never)}
                    </h3>
                  </div>

                  <div className="map-layer-toggle-group-list">
                    {group.layers.map((layerKey) => (
                      <div key={layerKey} className="map-layer-toggle-row">
                        <span className="map-layer-toggle-label">
                          {t(`mapLayers.${layerKey}` as never)}
                          {layerKey === 'supplyLines' && showSupplyLinesWarning && (
                            <span
                              role="img"
                              aria-label={supplyLinesWarningText}
                              title={supplyLinesWarningText}
                              style={{ marginLeft: '0.45rem', fontSize: '0.85rem' }}
                            >
                              ⚠️
                            </span>
                          )}
                        </span>
                        <label className="display-settings-switch">
                          <input
                            type="checkbox"
                            checked={prefs[layerKey]}
                            onChange={() => handleLayerToggle(layerKey)}
                            aria-label={t(`mapLayers.${layerKey}` as never)}
                            title={t(`mapLayers.${layerKey}` as never)}
                          />
                          <span className="display-settings-slider round"></span>
                        </label>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={`map-control-fab map-layer-toggle-trigger${isExpanded ? ' is-active' : ''}`}
        onClick={handlePanelToggle}
        aria-controls={panelId}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? t('mapLayers.collapsePanel') : t('mapLayers.expandPanel')}
        title={isExpanded ? t('mapLayers.collapsePanel') : t('mapLayers.expandPanel')}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
          <path d="M8 3v6" />
          <path d="M16 9v6" />
          <path d="M10 15v6" />
        </svg>
      </button>
    </div>
  );
}
