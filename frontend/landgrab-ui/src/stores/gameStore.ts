import { create } from 'zustand';
import type { GameState, RoomSummary } from '../types/game';

const SESSION_STORAGE_KEY = 'landgrab_session';

export interface SavedSession {
  roomCode: string;
  userId: string;
}

interface GameStore {
  gameState: GameState | null;
  savedSession: SavedSession | null;
  myRooms: RoomSummary[];
  autoResuming: boolean;
  setGameState: (state: GameState | null) => void;
  updateGameState: (updater: (prev: GameState | null) => GameState | null) => void;
  setSavedSession: (session: SavedSession | null) => void;
  setMyRooms: (rooms: RoomSummary[]) => void;
  setAutoResuming: (resuming: boolean) => void;
  saveSession: (roomCode: string, userId: string) => void;
  clearSession: () => void;
  loadSession: () => SavedSession | null;
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
  savedSession: readSavedSession(),
  myRooms: [],
  autoResuming: false,
  setGameState: (gameState) => set({ gameState }),
  updateGameState: (updater) => set((state) => ({ gameState: updater(state.gameState) })),
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
    set({ savedSession: null });
  },
  loadSession: () => {
    const savedSession = readSavedSession();
    set({ savedSession });
    return savedSession;
  },
}));
