import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// One way to read GPS for the browser and for the iPhone/Android app. In the app the native plugin is used: it asks
// for the location permission with the app's own text (Info.plist / AndroidManifest.xml) instead of the web view's
// extra "localhost would like to use your location" prompt, and keeps working when the web view throttles timers.

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface GeoError {
  code: number;
  message: string;
}

export interface GeoOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

const native = () => Capacitor.isNativePlatform();

export function isGeolocationSupported(): boolean {
  return native() || (typeof navigator !== 'undefined' && 'geolocation' in navigator);
}

function toGeoError(err: unknown): GeoError {
  if (err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'number') {
    const e = err as { code: number; message?: string };
    return { code: e.code, message: e.message ?? '' };
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  // The native plugin reports a refused permission as a message, not as code 1 (PERMISSION_DENIED).
  return { code: /denied|permission/i.test(message) ? 1 : 2, message };
}

/** Starts watching the position; returns a function that stops it. */
export function watchPosition(
  onPosition: (coords: GeoCoords) => void,
  onError: (error: GeoError) => void,
  options: GeoOptions,
): () => void {
  if (native()) {
    let stopped = false;
    let id: string | null = null;
    Geolocation.watchPosition(options, (position, err) => {
      if (stopped) return;
      if (err || !position) onError(toGeoError(err));
      else onPosition(position.coords);
    }).then((watchId) => {
      id = watchId;
      if (stopped) void Geolocation.clearWatch({ id: watchId });
    }).catch((err) => { if (!stopped) onError(toGeoError(err)); });
    return () => {
      stopped = true;
      if (id) void Geolocation.clearWatch({ id });
    };
  }
  const watchId = navigator.geolocation.watchPosition(
    (pos) => onPosition(pos.coords),
    (err) => onError({ code: err.code, message: err.message }),
    options,
  );
  return () => navigator.geolocation.clearWatch(watchId);
}

export function getCurrentPosition(
  onPosition: (coords: GeoCoords) => void,
  onError: (error: GeoError) => void,
  options: GeoOptions,
): void {
  if (native()) {
    Geolocation.getCurrentPosition(options)
      .then((pos) => onPosition(pos.coords))
      .catch((err) => onError(toGeoError(err)));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => onPosition(pos.coords),
    (err) => onError({ code: err.code, message: err.message }),
    options,
  );
}
