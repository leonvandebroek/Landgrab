import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface Props {
  enabled: boolean;
  liveLocation: LocationPoint | null;
  simulatedLocation: LocationPoint | null;
  mapCenter: LocationPoint | null;
  currentHex: [number, number] | null;
  canStepByHex: boolean;
  onApply: (lat: number, lng: number) => void;
  onDisable: () => void;
  onStepByHex: (dq: number, dr: number) => LocationPoint | null;
}

const HEX_STEP_DIRECTIONS = [
  { key: 'north', dq: 0, dr: 1 },
  { key: 'west', dq: -1, dr: 0 },
  { key: 'east', dq: 1, dr: 0 },
  { key: 'south', dq: 0, dr: -1 }
] as const;

export function DebugLocationPanel({
  enabled,
  liveLocation,
  simulatedLocation,
  mapCenter,
  currentHex,
  canStepByHex,
  onApply,
  onDisable,
  onStepByHex
}: Props) {
  const { t } = useTranslation();
  const [latDraft, setLatDraft] = useState(() => formatCoordinate(simulatedLocation?.lat ?? liveLocation?.lat ?? mapCenter?.lat));
  const [lngDraft, setLngDraft] = useState(() => formatCoordinate(simulatedLocation?.lng ?? liveLocation?.lng ?? mapCenter?.lng));
  const [localError, setLocalError] = useState('');

  const statusText = useMemo(() => {
    const source = enabled ? simulatedLocation : liveLocation;
    if (!source) {
      return enabled
        ? t('debugGps.statusMissing')
        : t('debugGps.statusWaitingForLiveGps');
    }

    return enabled
      ? t('debugGps.statusSimulated', {
        lat: formatCoordinate(source.lat),
        lon: formatCoordinate(source.lng)
      })
      : t('debugGps.statusLive', {
        lat: formatCoordinate(source.lat),
        lon: formatCoordinate(source.lng)
      });
  }, [enabled, liveLocation, simulatedLocation, t]);

  function applyManualLocation() {
    const parsedLat = Number.parseFloat(latDraft);
    const parsedLng = Number.parseFloat(lngDraft);

    if (
      !Number.isFinite(parsedLat)
      || !Number.isFinite(parsedLng)
      || parsedLat < -90
      || parsedLat > 90
      || parsedLng < -180
      || parsedLng > 180
    ) {
      setLocalError(t('debugGps.invalidCoordinates'));
      return;
    }

    setLocalError('');
    onApply(parsedLat, parsedLng);
  }

  function applyPreset(point: LocationPoint | null) {
    if (!point) {
      return;
    }

    setLocalError('');
    setLatDraft(formatCoordinate(point.lat));
    setLngDraft(formatCoordinate(point.lng));
    onApply(point.lat, point.lng);
  }

  function stepByHex(dq: number, dr: number) {
    const nextLocation = onStepByHex(dq, dr);
    if (!nextLocation) {
      return;
    }

    setLatDraft(formatCoordinate(nextLocation.lat));
    setLngDraft(formatCoordinate(nextLocation.lng));
  }

  return (
    <aside className={`debug-gps-panel${enabled ? ' is-active' : ''}`} aria-labelledby="debug-gps-title">
      <div className="debug-gps-header">
        <div>
          <h4 id="debug-gps-title">{t('debugGps.title')}</h4>
          <p className="debug-gps-note">{t('debugGps.testOnly')}</p>
        </div>
        <span className={`debug-gps-badge${enabled ? ' is-active' : ''}`}>
          {enabled ? t('debugGps.modeActive') : t('debugGps.modeInactive')}
        </span>
      </div>

      <p className="debug-gps-status">{statusText}</p>
      {currentHex && (
        <p className="debug-gps-status">
          {t('debugGps.currentHex', { q: currentHex[0], r: currentHex[1] })}
        </p>
      )}

      <div className="debug-gps-coordinate-grid">
        <input
          type="number"
          value={latDraft}
          onChange={event => setLatDraft(event.target.value)}
          placeholder={t('debugGps.latitudePlaceholder')}
          step="0.0001"
        />
        <input
          type="number"
          value={lngDraft}
          onChange={event => setLngDraft(event.target.value)}
          placeholder={t('debugGps.longitudePlaceholder')}
          step="0.0001"
        />
      </div>

      {localError && <p className="error-msg">{localError}</p>}

      <div className="debug-gps-actions">
        <button
          type="button"
          className="btn-ghost small"
          onClick={() => applyPreset(liveLocation)}
          disabled={!liveLocation}
          title={!liveLocation ? t('debugGps.disabledReason.liveMissing') : undefined}
        >
          {t('debugGps.useLiveGps')}
        </button>
        <button
          type="button"
          className="btn-ghost small"
          onClick={() => applyPreset(mapCenter)}
          disabled={!mapCenter}
          title={!mapCenter ? t('debugGps.disabledReason.mapCenterMissing') : undefined}
        >
          {t('debugGps.useMapCenter')}
        </button>
        <button type="button" className="btn-secondary" onClick={applyManualLocation}>
          {enabled ? t('debugGps.updateLocation') : t('debugGps.enableLocation')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onDisable}
          disabled={!enabled}
          title={!enabled ? t('debugGps.disabledReason.alreadyLive') : undefined}
        >
          {t('debugGps.disable')}
        </button>
      </div>

      <div className="debug-gps-step-block">
        <div className="debug-gps-step-header">
          <strong>{t('debugGps.stepByHex')}</strong>
          <span>{t('debugGps.stepByHexNote')}</span>
        </div>

        <div className="debug-gps-step-grid">
          <span className="debug-gps-step-spacer" />
          <button
            type="button"
            className="btn-ghost small"
            onClick={() => stepByHex(HEX_STEP_DIRECTIONS[0].dq, HEX_STEP_DIRECTIONS[0].dr)}
            disabled={!canStepByHex}
            title={!canStepByHex ? t('debugGps.disabledReason.stepUnavailable') : undefined}
          >
            {t('debugGps.stepNorth')}
          </button>
          <span className="debug-gps-step-spacer" />
          <button
            type="button"
            className="btn-ghost small"
            onClick={() => stepByHex(HEX_STEP_DIRECTIONS[1].dq, HEX_STEP_DIRECTIONS[1].dr)}
            disabled={!canStepByHex}
            title={!canStepByHex ? t('debugGps.disabledReason.stepUnavailable') : undefined}
          >
            {t('debugGps.stepWest')}
          </button>
          <span className="debug-gps-step-center">{t('debugGps.stepCenter')}</span>
          <button
            type="button"
            className="btn-ghost small"
            onClick={() => stepByHex(HEX_STEP_DIRECTIONS[2].dq, HEX_STEP_DIRECTIONS[2].dr)}
            disabled={!canStepByHex}
            title={!canStepByHex ? t('debugGps.disabledReason.stepUnavailable') : undefined}
          >
            {t('debugGps.stepEast')}
          </button>
          <span className="debug-gps-step-spacer" />
          <button
            type="button"
            className="btn-ghost small"
            onClick={() => stepByHex(HEX_STEP_DIRECTIONS[3].dq, HEX_STEP_DIRECTIONS[3].dr)}
            disabled={!canStepByHex}
            title={!canStepByHex ? t('debugGps.disabledReason.stepUnavailable') : undefined}
          >
            {t('debugGps.stepSouth')}
          </button>
          <span className="debug-gps-step-spacer" />
        </div>
        {!canStepByHex && <p className="section-note">{t('debugGps.disabledReason.stepUnavailable')}</p>}
      </div>
    </aside>
  );
}

function formatCoordinate(value: number | undefined): string {
  return typeof value === 'number' ? value.toFixed(6) : '';
}
