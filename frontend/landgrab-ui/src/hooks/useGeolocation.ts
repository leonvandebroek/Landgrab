import { useEffect, useRef, useState } from 'react';
import i18n from '../i18n';

interface GeoState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

function hasMoved(
  prev: { lat: number; lng: number } | null,
  next: { lat: number; lng: number },
  thresholdMeters: number
): boolean {
  if (!prev) {
    return true;
  }

  const R = 6_371_000; // Earth radius in metres
  const dLat = ((next.lat - prev.lat) * Math.PI) / 180;
  const dLng = ((next.lng - prev.lng) * Math.PI) / 180;
  const avgLat = (((prev.lat + next.lat) / 2) * Math.PI) / 180;
  const dx = dLng * Math.cos(avgLat) * R;
  const dy = dLat * R;
  return Math.sqrt(dx * dx + dy * dy) > thresholdMeters;
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
  const lastEmittedRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled || !supported) {
      return;
    }

    let watchId = -1;

    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        pos => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (!hasMoved(lastEmittedRef.current, next, 5)) {
            return;
          }
          lastEmittedRef.current = next;
          setPosition(next);
          setError(null);
        },
        err => {
          setError(err.message || i18n.t('errors.locationDenied'));
        },
        {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 10000
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
