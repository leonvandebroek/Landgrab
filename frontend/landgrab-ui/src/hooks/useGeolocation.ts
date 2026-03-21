import { useEffect, useRef, useState } from 'react';
import i18n from '../i18n';
import { haversineDistanceM } from '../utils/geo';

interface GeoState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

const MIN_UPDATE_INTERVAL_MS = 500;
const MIN_DISTANCE_METRES = 1.5;

export function useGeolocation(enabled = true): GeoState {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [position, setPosition] = useState<{ lat: number | null; lng: number | null }>({
    lat: null,
    lng: null
  });
  const [error, setError] = useState<string | null>(
    supported ? null : i18n.t('errors.geolocationNotSupported')
  );

  const lastUpdateRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  useEffect(() => {
    if (!enabled || !supported) {
      return;
    }

    let watchId = -1;

    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const now = performance.now();
          const last = lastUpdateRef.current;

          if (last) {
            const elapsed = now - last.time;
            if (elapsed < MIN_UPDATE_INTERVAL_MS) {
              return;
            }

            const distance = haversineDistanceM(last.lat, last.lng, lat, lng);
            if (distance < MIN_DISTANCE_METRES) {
              return;
            }
          }

          lastUpdateRef.current = { lat, lng, time: now };
          setPosition({ lat, lng });
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
