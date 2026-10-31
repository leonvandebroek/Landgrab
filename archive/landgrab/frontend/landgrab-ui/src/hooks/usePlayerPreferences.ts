import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_PLAYER_PREFS, STORAGE_KEY, type PlayerDisplayPreferences } from '../types/playerPreferences';

function loadPlayerPreferences(): PlayerDisplayPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PLAYER_PREFS;
    }

    const parsed = JSON.parse(raw) as Partial<PlayerDisplayPreferences> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return DEFAULT_PLAYER_PREFS;
    }

    return {
      ...DEFAULT_PLAYER_PREFS,
      ...parsed
    };
  } catch {
    return DEFAULT_PLAYER_PREFS;
  }
}

function savePlayerPreferences(next: PlayerDisplayPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function usePlayerPreferences() {
  const [prefs, setPrefsState] = useState<PlayerDisplayPreferences>(loadPlayerPreferences);

  const setPrefs = useCallback((next: PlayerDisplayPreferences | ((current: PlayerDisplayPreferences) => PlayerDisplayPreferences)) => {
    setPrefsState(current => {
      const resolved = typeof next === 'function' ? next(current) : next;
      const merged = {
        ...DEFAULT_PLAYER_PREFS,
        ...resolved
      };

      savePlayerPreferences(merged);
      return merged;
    });
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      setPrefsState(loadPlayerPreferences());
    };

    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return [prefs, setPrefs] as const;
}
