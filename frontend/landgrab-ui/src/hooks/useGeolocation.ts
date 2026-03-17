import { useEffect, useState } from 'react';
import i18n from '../i18n';

interface GeoState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(enabled = true): GeoState {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [position, setPosition] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null
  });
  const [error, setError] = useState<string | null>(
    supported ? null : i18n.t('errors.geolocationNotSupported')
  );

  useEffect(() => {
    if (!enabled || !supported) {
      return;
    }

    let watchId = -1;

    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        pos => {
          setPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
          setError(null);
        },
        err => {
          setError(err.message || i18n.t('errors.locationDenied'));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000
        }
      );
    };

    const stopWatch = () => {
      if (watchId !== -1) {
        navigator.geolocation.clearWatch(watchId);
        watchId = -1;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopWatch();
      } else {
        startWatch();
      }
    };

    startWatch();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopWatch();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, supported]);

  return {
    lat: position.lat,
    lng: position.lng,
    error,
    loading: enabled && supported && position.lat == null && position.lng == null && error == null
  };
}
