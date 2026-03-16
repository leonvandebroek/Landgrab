import { useTranslation } from 'react-i18next';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface Props {
  enabled: boolean;
  canStepByHex: boolean;
  mapCenter: LocationPoint | null;
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
  canStepByHex,
  mapCenter,
  onApply,
  onDisable,
  onStepByHex
}: Props) {
  const { t } = useTranslation();

  function handleToggle() {
    if (enabled) {
      onDisable();
    } else if (mapCenter) {
      onApply(mapCenter.lat, mapCenter.lng);
    }
  }

  return (
    <aside
      className={`debug-gps-panel compact${enabled ? ' is-active' : ''}`}
      data-testid="debug-gps-panel"
      aria-labelledby="debug-gps-title"
    >
      <button
        type="button"
        className={`btn-secondary small${enabled ? ' is-active' : ''}`}
        data-testid="debug-gps-toggle"
        onClick={handleToggle}
        disabled={!enabled && !mapCenter}
      >
        {enabled ? t('debugGps.disable') : t('debugGps.enableLocation')}
      </button>

      <div className="debug-gps-step-grid compact">
        <span className="debug-gps-step-spacer" />
        <button
          type="button"
          className="btn-ghost small"
          data-testid="debug-gps-step-north"
          onClick={() => onStepByHex(HEX_STEP_DIRECTIONS[0].dq, HEX_STEP_DIRECTIONS[0].dr)}
          disabled={!canStepByHex}
        >
          {t('debugGps.stepNorth')}
        </button>
        <span className="debug-gps-step-spacer" />
        <button
          type="button"
          className="btn-ghost small"
          data-testid="debug-gps-step-west"
          onClick={() => onStepByHex(HEX_STEP_DIRECTIONS[1].dq, HEX_STEP_DIRECTIONS[1].dr)}
          disabled={!canStepByHex}
        >
          {t('debugGps.stepWest')}
        </button>
        <span className="debug-gps-step-center">{t('debugGps.stepCenter')}</span>
        <button
          type="button"
          className="btn-ghost small"
          data-testid="debug-gps-step-east"
          onClick={() => onStepByHex(HEX_STEP_DIRECTIONS[2].dq, HEX_STEP_DIRECTIONS[2].dr)}
          disabled={!canStepByHex}
        >
          {t('debugGps.stepEast')}
        </button>
        <span className="debug-gps-step-spacer" />
        <button
          type="button"
          className="btn-ghost small"
          data-testid="debug-gps-step-south"
          onClick={() => onStepByHex(HEX_STEP_DIRECTIONS[3].dq, HEX_STEP_DIRECTIONS[3].dr)}
          disabled={!canStepByHex}
        >
          {t('debugGps.stepSouth')}
        </button>
        <span className="debug-gps-step-spacer" />
      </div>
    </aside>
  );
}
