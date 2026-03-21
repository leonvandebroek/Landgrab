import { create } from 'zustand';
import type { Player } from '../types/game';

function hasPlayerChanged(prev: Player, next: Player): boolean {
  return prev.currentLat !== next.currentLat
    || prev.currentLng !== next.currentLng
    || prev.currentHexQ !== next.currentHexQ
    || prev.currentHexR !== next.currentHexR
    || prev.currentHeading !== next.currentHeading
    || prev.carriedTroops !== next.carriedTroops
    || prev.territoryCount !== next.territoryCount
    || prev.isConnected !== next.isConnected
    || prev.allianceId !== next.allianceId
    || prev.allianceColor !== next.allianceColor
    || prev.color !== next.color
    || prev.name !== next.name
    || prev.role !== next.role
    || prev.isBeacon !== next.isBeacon
    || prev.beaconLat !== next.beaconLat
    || prev.beaconLng !== next.beaconLng
    || prev.isWinner !== next.isWinner
    || prev.rallyPointActive !== next.rallyPointActive
    || prev.tacticalStrikeActive !== next.tacticalStrikeActive;
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
