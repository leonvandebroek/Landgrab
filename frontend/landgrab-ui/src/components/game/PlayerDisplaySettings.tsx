import { useTranslation } from 'react-i18next';
import type { PlayerDisplayPreferences, MarkerStyle, MarkerSize } from '../../types/playerPreferences';
import { MARKER_SIZE_MULTIPLIER } from '../../types/playerPreferences';

interface PlayerDisplaySettingsProps {
  prefs: PlayerDisplayPreferences;
  onPrefsChange: (prefs: PlayerDisplayPreferences) => void;
  playerColor: string; // The current player's color, for preview rendering
  playerName: string;  // The current player's display name
}

export function PlayerDisplaySettings({
  prefs,
  onPrefsChange,
  playerColor,
  playerName
}: PlayerDisplaySettingsProps) {
  const { t } = useTranslation();

  const handleStyleChange = (style: MarkerStyle) => {
    onPrefsChange({ ...prefs, markerStyle: style });
  };

  const handleSizeChange = (size: MarkerSize) => {
    onPrefsChange({ ...prefs, markerSize: size });
  };

  const handleToggleName = () => {
    onPrefsChange({ ...prefs, showNameLabel: !prefs.showNameLabel });
  };

  const sizeMultiplier = MARKER_SIZE_MULTIPLIER[prefs.markerSize] || 1;
  const baseSize = 32; // Base size in pixels for preview
  const previewSize = baseSize * sizeMultiplier;

  return (
    <div className="display-settings-container">
      {/* Live Preview Section */}
      <div className="display-settings-preview-area">
        <span className="display-settings-preview-label">{t('settings.display.preview')}</span>
        <div className="display-settings-preview-canvas">
          <div className="display-settings-preview-marker" style={{ width: previewSize, height: previewSize }}>
            {prefs.markerStyle === 'dot' && (
              <div className="marker-dot" style={{ backgroundColor: playerColor }} />
            )}
            {prefs.markerStyle === 'pin' && (
              <svg viewBox="0 0 24 24" fill={playerColor} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            )}
            {prefs.markerStyle === 'avatar' && (
              <div className="marker-avatar" style={{ backgroundColor: playerColor, fontSize: `${previewSize * 0.5}px` }}>
                {playerName.charAt(0).toUpperCase()}
              </div>
            )}
            {prefs.markerStyle === 'flag' && (
              <svg viewBox="0 0 24 24" fill={playerColor} xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}>
                <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
              </svg>
            )}
            
            {prefs.showNameLabel && (
              <div className="display-settings-preview-name" style={{ color: playerColor }}>
                {playerName}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="display-settings-divider" />

      {/* Marker Style Picker */}
      <div className="display-settings-section">
        <h4>{t('settings.display.markerStyle')}</h4>
        <div className="display-settings-grid">
          {(['dot', 'pin', 'avatar', 'flag'] as MarkerStyle[]).map((style) => (
            <button
              key={style}
              className={`display-settings-option ${prefs.markerStyle === style ? 'active' : ''}`}
              onClick={() => handleStyleChange(style)}
              aria-label={t(`settings.display.style${style.charAt(0).toUpperCase() + style.slice(1)}` as never)}
            >
              <div className="display-settings-option-icon" style={{ color: playerColor }}>
                {style === 'dot' && <div className="marker-dot-small" style={{ backgroundColor: playerColor }} />}
                {style === 'pin' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill={playerColor}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                )}
                {style === 'avatar' && <div className="marker-avatar-small" style={{ backgroundColor: playerColor }}>{playerName.charAt(0).toUpperCase()}</div>}
                {style === 'flag' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill={playerColor}>
                    <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/>
                  </svg>
                )}
              </div>
              <span>{t(`settings.display.style${style.charAt(0).toUpperCase() + style.slice(1)}` as never)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="display-settings-divider" />

      {/* Marker Size */}
      <div className="display-settings-section">
        <h4>{t('settings.display.markerSize')}</h4>
        <div className="display-settings-row">
          {(['small', 'medium', 'large'] as MarkerSize[]).map((size) => (
            <button
              key={size}
              className={`display-settings-toggle ${prefs.markerStyle === 'flag' && size === 'medium' ? '' : ''} ${prefs.markerSize === size ? 'active' : ''}`}
              onClick={() => handleSizeChange(size)}
            >
              <div className="display-settings-size-icon" style={{ transform: `scale(${MARKER_SIZE_MULTIPLIER[size] * 0.8})`, backgroundColor: playerColor }} />
              <span>{t(`settings.display.size${size.charAt(0).toUpperCase() + size.slice(1)}` as never)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="display-settings-divider" />

      {/* Show Name Labels */}
      <div className="display-settings-section flex-row-between">
        <h4>{t('settings.display.showNameLabel')}</h4>
        <label className="display-settings-switch">
          <input
            type="checkbox"
            checked={prefs.showNameLabel}
            onChange={handleToggleName}
            aria-label={t('settings.display.showNameLabel')}
            title={t('settings.display.showNameLabel')}
          />
          <span className="display-settings-slider round"></span>
        </label>
      </div>
    </div>
  );
}
