import { create } from 'zustand';
import type { Player } from '../types/game';

interface PlayerLayerStore {
  players: Player[];
  myUserId: string;
  currentLocation: { lat: number; lng: number } | null;

  setPlayers: (players: Player[]) => void;
  setMyUserId: (id: string) => void;
  setCurrentLocation: (loc: { lat: number; lng: number } | null) => void;
}

export const usePlayerLayerStore = create<PlayerLayerStore>((set) => ({
  players: [],
  myUserId: '',
  currentLocation: null,

  setPlayers: (players) => set({ players }),
  setMyUserId: (id) => set({ myUserId: id }),
  setCurrentLocation: (loc) => set({ currentLocation: loc }),
}));
