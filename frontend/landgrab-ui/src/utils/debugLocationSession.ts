import type { DebugLocationPoint } from '../stores/uiStore';

const DEBUG_LOCATION_STORAGE_PREFIX = 'landgrab_debug_location';

interface StoredDebugLocation {
  lat: number;
  lng: number;
}

function getDebugLocationStorageKey(roomCode: string): string {
  return `${DEBUG_LOCATION_STORAGE_PREFIX}_${roomCode.trim().toUpperCase()}`;
}

export function readPersistedDebugLocation(roomCode: string | null | undefined): DebugLocationPoint | null {
  if (typeof window === 'undefined' || !roomCode) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(getDebugLocationStorageKey(roomCode));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredDebugLocation> | null;
    if (
      parsed == null
      || typeof parsed.lat !== 'number'
      || !Number.isFinite(parsed.lat)
      || typeof parsed.lng !== 'number'
      || !Number.isFinite(parsed.lng)
    ) {
      return null;
    }

    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

export function persistDebugLocation(roomCode: string | null | undefined, location: DebugLocationPoint): void {
  if (typeof window === 'undefined' || !roomCode) {
    return;
  }

  window.sessionStorage.setItem(
    getDebugLocationStorageKey(roomCode),
    JSON.stringify(location),
  );
}

export function clearPersistedDebugLocation(roomCode: string | null | undefined): void {
  if (typeof window === 'undefined' || !roomCode) {
    return;
  }

  window.sessionStorage.removeItem(getDebugLocationStorageKey(roomCode));
}
