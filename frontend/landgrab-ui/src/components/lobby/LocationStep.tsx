import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LocationPoint {
    lat: number;
    lng: number;
}

interface Props {
    currentLocation: LocationPoint | null;
    locationLoading: boolean;
    locationError: string | null;
    mapLat: number | null;
    mapLng: number | null;
    onSetMapLocation: (lat: number, lng: number) => void;
}

export function LocationStep({
    currentLocation,
    locationLoading,
    locationError,
    mapLat,
    mapLng,
    onSetMapLocation,
}: Props) {
    const { t } = useTranslation();
    const [showManual, setShowManual] = useState(false);
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');

    const isLocationSet = mapLat != null && mapLng != null;

    const useGps = () => {
        if (currentLocation) {
            onSetMapLocation(currentLocation.lat, currentLocation.lng);
        }
    };

    const applyManual = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            onSetMapLocation(lat, lng);
        }
    };

    return (
        <div className="wizard-step wizard-step-location">
            <div className="wizard-step-header">
                <h2>{t('wizard.locationTitle')}</h2>
                <p className="wizard-step-desc">{t('wizard.locationDesc')}</p>
            </div>

            <div className="wizard-step-body">
                <button
                    type="button"
                    className="btn-primary big wizard-gps-button"
                    onClick={useGps}
                    disabled={!currentLocation || locationLoading}
                >
                    {locationLoading ? t('lobby.locating') : t('wizard.locationGpsButton')}
                </button>

                {!currentLocation && !locationLoading && (
                    <p className="wizard-hint">{locationError ?? t('lobby.disabledReason.gpsUnavailable')}</p>
                )}

                {!isLocationSet && (
                    <p className="wizard-hint">{t('wizard.locationGpsHint')}</p>
                )}

                {isLocationSet && (
                    <div className="wizard-success-chip">
                        {t('wizard.locationSet', { lat: mapLat.toFixed(5), lon: mapLng.toFixed(5) })}
                    </div>
                )}

                <button
                    type="button"
                    className="btn-ghost small"
                    onClick={() => setShowManual(v => !v)}
                >
                    {showManual ? t('wizard.locationManualHide') : t('wizard.locationManualToggle')}
                </button>

                {showManual && (
                    <div className="wizard-manual-location">
                        <input
                            type="number"
                            value={manualLat}
                            onChange={e => setManualLat(e.target.value)}
                            placeholder={t('lobby.latitude')}
                            step="0.0001"
                        />
                        <input
                            type="number"
                            value={manualLng}
                            onChange={e => setManualLng(e.target.value)}
                            placeholder={t('lobby.longitude')}
                            step="0.0001"
                        />
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={applyManual}
                            disabled={!Number.isFinite(Number(manualLat)) || !Number.isFinite(Number(manualLng)) || manualLat === '' || manualLng === ''}
                        >
                            {t('lobby.applyManual')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
