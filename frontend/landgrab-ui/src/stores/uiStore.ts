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

export interface MapCameraController {
  setView: (lat: number, lng: number, zoom?: number) => void;
  fitBounds: (bounds: [number, number][], paddingPx?: number) => void;
  getZoom: () => number;
}

interface UiStore {
  view: AppView;
  error: string;
  zoomLevel: number;
  hudBottomPx: number;
  hasAcknowledgedRules: boolean;
  showDebugTools: boolean;
  debugLocationEnabled: boolean;
  debugLocation: DebugLocationPoint | null;
  debugHeading: number | null;
  debugPitch: number | null;
  mainMapBounds: MainMapBounds | null;
  selectedHexScreenPos: ScreenPosition | null;
  mapCameraController: MapCameraController | null;
  setView: (view: AppView) => void;
  setError: (error: string) => void;
  clearError: () => void;
  setZoomLevel: (zoomLevel: number) => void;
  setHudBottomPx: (px: number) => void;
  setHasAcknowledgedRules: (ack: boolean) => void;
  setShowDebugTools: (show: boolean) => void;
  setDebugLocationEnabled: (enabled: boolean) => void;
  setDebugLocation: (loc: DebugLocationPoint | null) => void;
  setDebugHeading: (heading: number | null) => void;
  setDebugPitch: (pitch: number | null) => void;
  setMainMapBounds: (bounds: MainMapBounds | null) => void;
  setSelectedHexScreenPos: (pos: ScreenPosition | null) => void;
  setMapCameraController: (controller: MapCameraController | null) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  view: 'lobby',
  error: '',
  zoomLevel: 17,
  hudBottomPx: 0,
  hasAcknowledgedRules: false,
  showDebugTools: false,
  debugLocationEnabled: false,
  debugLocation: null,
  debugHeading: null,
  debugPitch: null,
  mainMapBounds: null,
  selectedHexScreenPos: null,
  mapCameraController: null,
  setView: (view) => set({ view }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: '' }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setHudBottomPx: (hudBottomPx) => set({ hudBottomPx }),
  setHasAcknowledgedRules: (hasAcknowledgedRules) => set({ hasAcknowledgedRules }),
  setShowDebugTools: (showDebugTools) => set({ showDebugTools }),
  setDebugLocationEnabled: (debugLocationEnabled) => set({ debugLocationEnabled }),
  setDebugLocation: (debugLocation) => set({ debugLocation }),
  setDebugHeading: (debugHeading) => set({ debugHeading }),
  setDebugPitch: (debugPitch) => set({ debugPitch }),
  setMainMapBounds: (mainMapBounds) => set({ mainMapBounds }),
  setSelectedHexScreenPos: (selectedHexScreenPos) => set({ selectedHexScreenPos }),
  setMapCameraController: (mapCameraController) => set({ mapCameraController }),
}));
