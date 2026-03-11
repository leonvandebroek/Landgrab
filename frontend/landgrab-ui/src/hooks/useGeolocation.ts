import { useEffect, useState } from 'react';

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
    supported ? null : 'Geolocation is not supported by your browser.'
  );

  useEffect(() => {
    if (!enabled || !supported) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      position => {
        setPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setError(null);
      },
      error => {
        setError(error.message || 'Location access was denied.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, supported]);

  return {
    lat: position.lat,
    lng: position.lng,
    error,
    loading: enabled && supported && position.lat == null && position.lng == null && error == null
  };
}
