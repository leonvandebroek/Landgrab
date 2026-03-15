import { create } from 'zustand';

export type AppView = 'lobby' | 'game' | 'gameover' | 'mapEditor';

export interface DebugLocationPoint {
  lat: number;
  lng: number;
}

export interface MainMapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ScreenPosition {
  x: number;
  y: number;
}

interface UiStore {
  view: AppView;
  error: string;
  hasAcknowledgedRules: boolean;
  showDebugTools: boolean;
  debugLocationEnabled: boolean;
  debugLocation: DebugLocationPoint | null;
  mainMapBounds: MainMapBounds | null;
  selectedHexScreenPos: ScreenPosition | null;
  setView: (view: AppView) => void;
  setError: (error: string) => void;
  clearError: () => void;
  setHasAcknowledgedRules: (ack: boolean) => void;
  setShowDebugTools: (show: boolean) => void;
  setDebugLocationEnabled: (enabled: boolean) => void;
  setDebugLocation: (loc: DebugLocationPoint | null) => void;
  setMainMapBounds: (bounds: MainMapBounds | null) => void;
  setSelectedHexScreenPos: (pos: ScreenPosition | null) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  view: 'lobby',
  error: '',
  hasAcknowledgedRules: false,
  showDebugTools: false,
  debugLocationEnabled: false,
  debugLocation: null,
  mainMapBounds: null,
  selectedHexScreenPos: null,
  setView: (view) => set({ view }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: '' }),
  setHasAcknowledgedRules: (hasAcknowledgedRules) => set({ hasAcknowledgedRules }),
  setShowDebugTools: (showDebugTools) => set({ showDebugTools }),
  setDebugLocationEnabled: (debugLocationEnabled) => set({ debugLocationEnabled }),
  setDebugLocation: (debugLocation) => set({ debugLocation }),
  setMainMapBounds: (mainMapBounds) => set({ mainMapBounds }),
  setSelectedHexScreenPos: (selectedHexScreenPos) => set({ selectedHexScreenPos }),
}));
