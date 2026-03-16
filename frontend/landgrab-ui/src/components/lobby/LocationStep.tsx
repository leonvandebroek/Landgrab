import { useCallback, useMemo, useState } from 'react';
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
    const [retryLocationError, setRetryLocationError] = useState<string | null>(null);
    const [retryingGps, setRetryingGps] = useState(false);

    const isLocationSet = mapLat != null && mapLng != null;
    const effectiveLocationError = retryLocationError ?? locationError;
    const showGpsDeniedCard = !isLocationSet && Boolean(effectiveLocationError);

    const applyGpsLocation = useCallback(() => {
        if (!currentLocation) {
            return;
        }

        setRetryLocationError(null);
        onSetMapLocation(currentLocation.lat, currentLocation.lng);
    }, [currentLocation, onSetMapLocation]);

    const retryGeolocation = useCallback(() => {
        if (currentLocation) {
            applyGpsLocation();
            return;
        }

        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            setRetryLocationError(locationError ?? t('lobby.disabledReason.gpsUnavailable'));
            return;
        }

        setRetryingGps(true);
        setRetryLocationError(null);

        navigator.geolocation.getCurrentPosition(
            position => {
                setRetryingGps(false);
                onSetMapLocation(position.coords.latitude, position.coords.longitude);
            },
            error => {
                setRetryingGps(false);
                const nextError = error.message || locationError || t('lobby.disabledReason.gpsUnavailable');
                console.error('Geolocation retry failed.', {
                    code: error.code,
                    message: error.message,
                });
                setRetryLocationError(nextError);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            },
        );
    }, [currentLocation, locationError, onSetMapLocation, t, applyGpsLocation]);

    const gpsDeniedCardStyle = useMemo(() => ({
        background: 'var(--surface-alt, #2a2a2a)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '12px',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.75rem',
    }), []);

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
                    onClick={applyGpsLocation}
                    disabled={!currentLocation || locationLoading || retryingGps}
                >
                    {locationLoading || retryingGps ? t('lobby.locating') : t('wizard.locationGpsButton')}
                </button>

                {showGpsDeniedCard && !showManual && (
                    <div style={gpsDeniedCardStyle} role="alert" data-testid="location-gps-denied-card">
                        <div>
                            <h3 style={{ margin: 0 }}>{t('wizard.gpsDeniedTitle')}</h3>
                            {effectiveLocationError && (
                                <p className="wizard-step-desc" style={{ marginTop: '0.5rem' }}>
                                    {effectiveLocationError}
                                </p>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => setShowManual(true)}
                            >
                                {t('wizard.gpsDeniedEnterManually')}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={retryGeolocation}
                                disabled={locationLoading || retryingGps}
                            >
                                {locationLoading || retryingGps ? t('lobby.locating') : t('wizard.gpsDeniedTryAgain')}
                            </button>
                        </div>
                    </div>
                )}

                {!showGpsDeniedCard && !currentLocation && !locationLoading && (
                    <p className="wizard-hint">{t('lobby.disabledReason.gpsUnavailable')}</p>
                )}

                {!isLocationSet && !showGpsDeniedCard && (
                    <p className="wizard-hint">{t('wizard.locationGpsHint')}</p>
                )}

                {isLocationSet && (
                    <div className="wizard-success-chip">
                        {t('wizard.locationSet', { lat: mapLat.toFixed(5), lon: mapLng.toFixed(5) })}
                    </div>
                )}

                {!showGpsDeniedCard && (
                    <button
                        type="button"
                        className="btn-ghost small"
                        data-testid="location-manual-toggle"
                        onClick={() => setShowManual(v => !v)}
                    >
                        {showManual ? t('wizard.locationManualHide') : t('wizard.locationManualToggle')}
                    </button>
                )}

                {showManual && (
                    <div className="wizard-manual-location" data-testid="location-manual-form">
                        <input
                            type="number"
                            data-testid="location-manual-lat"
                            value={manualLat}
                            onChange={e => setManualLat(e.target.value)}
                            placeholder={t('lobby.latitude')}
                            step="0.0001"
                        />
                        <input
                            type="number"
                            data-testid="location-manual-lng"
                            value={manualLng}
                            onChange={e => setManualLng(e.target.value)}
                            placeholder={t('lobby.longitude')}
                            step="0.0001"
                        />
                        <button
                            type="button"
                            data-testid="location-manual-apply"
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
