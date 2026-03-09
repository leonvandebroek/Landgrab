import { useState } from 'react';

interface GeoState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(): GeoState & { request: () => void } {
  const [state, setState] = useState<GeoState>({
    lat: null, lng: null, error: null, loading: false
  });

  const request = () => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: 'Geolocation not supported by your browser.' }));
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      pos => setState({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        error: null,
        loading: false
      }),
      err => setState({
        lat: null, lng: null,
        error: err.message || 'Location access denied.',
        loading: false
      }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return { ...state, request };
}
