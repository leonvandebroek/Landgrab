import { create } from 'zustand';
import type { Player } from '../types/game';

function hasPlayerChanged(prev: Player, next: Player): boolean {
  const keys = Object.keys(next) as (keyof Player)[];
  for (const key of keys) {
    if (prev[key] !== next[key]) {
      return true;
    }
  }
  return Object.keys(prev).length !== keys.length;
}

function normalizePlayers(prev: Player[], next: Player[]): Player[] {
  if (prev.length !== next.length) {
    return next;
  }

  let anyChanged = false;
  const result = next.map((nextPlayer, i) => {
    const prevPlayer = prev[i];
    if (prevPlayer && prevPlayer.id === nextPlayer.id && !hasPlayerChanged(prevPlayer, nextPlayer)) {
      return prevPlayer;
    }
    anyChanged = true;
    return nextPlayer;
  });

  return anyChanged ? result : prev;
}

interface PlayerLayerStore {
  players: Player[];
  myUserId: string;
  currentLocation: { lat: number; lng: number } | null;

  setPlayers: (players: Player[]) => void;
  setMyUserId: (id: string) => void;
  setCurrentLocation: (loc: { lat: number; lng: number } | null) => void;
}

export const usePlayerLayerStore = create<PlayerLayerStore>((set, get) => ({
  players: [],
  myUserId: '',
  currentLocation: null,

  setPlayers: (players) => {
    const normalized = normalizePlayers(get().players, players);
    if (normalized !== get().players) {
      set({ players: normalized });
    }
  },
  setMyUserId: (id) => set({ myUserId: id }),
  setCurrentLocation: (loc) => set({ currentLocation: loc }),
}));
