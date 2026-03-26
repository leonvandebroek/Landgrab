import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import {
  DEFAULT_MAP_LAYER_PREFS,
  LAYER_GROUPS,
  type LayerGroup,
  type MapLayerPreferences,
} from '../../../types/mapLayerPreferences';
import { gameIcons, type GameIconName } from '../../../utils/gameIcons';

interface MapLayerToggleProps {
  prefs: MapLayerPreferences;
  onPrefsChange: (prefs: MapLayerPreferences) => void;
  isOpen: boolean;
  onClose: () => void;
}

const ALL_LAYER_KEYS: (keyof MapLayerPreferences)[] = LAYER_GROUPS.flatMap((group) => group.layers);

function isGameIconName(icon: LayerGroup['icon']): icon is GameIconName {
  return typeof icon === 'string' && icon in gameIcons;
}

export function MapLayerToggle({ prefs, onPrefsChange, isOpen, onClose }: MapLayerToggleProps) {
  const { t } = useTranslation();

  const allEnabled = ALL_LAYER_KEYS.every((layerKey) => prefs[layerKey]);

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

  if (!isOpen) return null;

  return (
    <div
      className="map-layer-modal-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="map-layer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-layer-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="map-layer-toggle-header">
          <div className="map-layer-toggle-header-copy">
            <span className="map-layer-toggle-header-icon" aria-hidden="true">
              <GameIcon name="treasureMap" />
            </span>
            <span className="map-layer-toggle-title" id="map-layer-modal-title">
              {t('mapLayers.title')}
            </span>
          </div>
          <button
            type="button"
            className="map-layer-toggle-collapse"
            onClick={onClose}
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
                    {isGameIconName(group.icon) ? <GameIcon name={group.icon} /> : group.icon}
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
  );
}
