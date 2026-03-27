import { create } from 'zustand';
import { hasHexChanged } from '../utils/gridDiff';
import { clearLocalHexSightings } from '../utils/localVisibility';
import type { GameState, HexCell, RoomSummary } from '../types/game';

const SESSION_STORAGE_KEY = 'landgrab_session';

export interface SavedSession {
  roomCode: string;
  userId: string;
}

interface GameStore {
  gameState: GameState | null;
  gridOverride: Record<string, HexCell> | null;
  savedSession: SavedSession | null;
  myRooms: RoomSummary[];
  autoResuming: boolean;
  setGameState: (state: GameState | null) => void;
  updateGameState: (updater: (prev: GameState | null) => GameState | null) => void;
  setGridOverride: (grid: Record<string, HexCell> | null) => void;
  setSavedSession: (session: SavedSession | null) => void;
  setMyRooms: (rooms: RoomSummary[]) => void;
  setAutoResuming: (resuming: boolean) => void;
  saveSession: (roomCode: string, userId: string) => void;
  clearSession: () => void;
  loadSession: () => SavedSession | null;
}

function normalizeGrid(
  previousGrid: Record<string, HexCell> | undefined,
  nextGrid: Record<string, HexCell>,
): Record<string, HexCell> {
  if (!previousGrid) return nextGrid;

  const prevKeys = Object.keys(previousGrid);
  const nextKeys = Object.keys(nextGrid);

  let allSame = prevKeys.length === nextKeys.length;
  const result: Record<string, HexCell> = {};

  for (const key of nextKeys) {
    const prev = previousGrid[key];
    const next = nextGrid[key];
    if (prev && !hasHexChanged(prev, next)) {
      result[key] = prev;
    } else {
      result[key] = next;
      allSame = false;
    }
  }

  if (allSame) {
    for (const key of prevKeys) {
      if (!(key in nextGrid)) {
        allSame = false;
        break;
      }
    }
  }

  return allSame ? previousGrid : result;
}

function normalizeSavedSession(session: Partial<SavedSession> | null | undefined): SavedSession | null {
  if (
    !session?.roomCode
    || typeof session.roomCode !== 'string'
    || !session.userId
    || typeof session.userId !== 'string'
  ) {
    return null;
  }

  const roomCode = session.roomCode.trim().toUpperCase();
  const userId = session.userId.trim();
  return roomCode && userId ? { roomCode, userId } : null;
}

function readSavedSession(): SavedSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SavedSession> | null;
    return normalizeSavedSession(parsed);
  } catch {
    return null;
  }
}

function persistSavedSession(session: SavedSession | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export const useGameStore = create<GameStore>()((set) => ({
  gameState: null,
  gridOverride: null,
  savedSession: readSavedSession(),
  myRooms: [],
  autoResuming: false,
  setGameState: (gameState) => set((current) => {
    if (!gameState) {
      return { gameState: null };
    }

    const previousGrid = current.gameState?.grid;
    const normalizedGrid = previousGrid && gameState.grid
      ? normalizeGrid(previousGrid, gameState.grid)
      : gameState.grid;

    return {
      gameState: normalizedGrid === gameState.grid
        ? gameState
        : { ...gameState, grid: normalizedGrid },
    };
  }),
  updateGameState: (updater) => set((current) => {
    const updated = updater(current.gameState);

    if (!updated || updated === current.gameState) {
      return {};
    }

    const previousGrid = current.gameState?.grid;
    const normalizedGrid = previousGrid && updated.grid
      ? normalizeGrid(previousGrid, updated.grid)
      : updated.grid;

    return {
      gameState: normalizedGrid === updated.grid
        ? updated
        : { ...updated, grid: normalizedGrid },
    };
  }),
  setGridOverride: (grid) => set((current) => {
    if (grid === null) {
      return { gridOverride: null };
    }

    const normalized = current.gridOverride
      ? normalizeGrid(current.gridOverride, grid)
      : grid;

    return {
      gridOverride: normalized,
    };
  }),
  setSavedSession: (session) => {
    const normalizedSession = normalizeSavedSession(session);
    persistSavedSession(normalizedSession);
    set({ savedSession: normalizedSession });
  },
  setMyRooms: (myRooms) => set({ myRooms }),
  setAutoResuming: (autoResuming) => set({ autoResuming }),
  saveSession: (roomCode, userId) => {
    const nextSession = normalizeSavedSession({ roomCode, userId });
    if (!nextSession) {
      return;
    }

    persistSavedSession(nextSession);
    set({ savedSession: nextSession });
  },
  clearSession: () => {
    persistSavedSession(null);
    clearLocalHexSightings();
    set({ savedSession: null });
  },
  loadSession: () => {
    const savedSession = readSavedSession();
    set({ savedSession });
    return savedSession;
  },
}));
