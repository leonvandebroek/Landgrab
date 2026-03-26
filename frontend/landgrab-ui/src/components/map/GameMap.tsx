import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet-rotate';
import 'leaflet/dist/leaflet.css';
import type { GameState, HexCell } from '../../types/game';
import { DEFAULT_MAP_LAYER_PREFS, type MapLayerPreferences } from '../../types/mapLayerPreferences';
import type { PlayerDisplayPreferences } from '../../types/playerPreferences';
import { useEffectsStore } from '../../stores/effectsStore';
import { usePlayerLayerStore } from '../../stores/playerLayerStore';
import { useGameStore, useGameplayStore, useUiStore } from '../../stores';
import { latLngToRoomHex, roomHexCornerLatLngs, roomHexToLatLng } from './HexMath';
import { AbilityOverlayLayer, GameOverlayLayer, EffectsLayer, PlayerLayer, RadarSweepLayer } from './layers';
import { HexTooltipOverlay } from './HexTooltipOverlay';
import { createGameBaseLayers, MAP_LOOK_TO_BASEMAP, MAP_MAX_ZOOM, type BasemapLayer, type GameBasemapDefinition, type GameBasemapId, type MapLookPreset } from './pdokLayers';
import { getTimePeriod } from '../../utils/timeOfDay';
import { TroopSplashLayer } from './TroopSplashLayer';
import { MapLayerToggle, MapLegend, TimeOverlay } from '../game/map';
import { useCompassHeading } from '../../hooks/useCompassHeading';

interface LocationPoint {
  lat: number;
  lng: number;
}

type RotatingLeafletMap = L.Map & {
  _rotatePane?: HTMLElement;
};

interface Props {
  state: GameState;
  myUserId: string;
  currentLocation: LocationPoint | null;
  onHexClick?: (q: number, r: number, cell: HexCell | undefined) => void;
  selectedHex?: [number, number] | null;
  constrainViewportToGrid?: boolean;
  gridOverride?: Record<string, HexCell>;
  inactiveHexKeys?: string[];
  playerDisplayPrefs?: PlayerDisplayPreferences;
  onBoundsChange?: (bounds: { north: number; south: number; east: number; west: number }) => void;
  onHexScreenPosition?: (pos: { x: number; y: number } | null) => void;
  navigateRef?: MutableRefObject<((lat: number, lng: number) => void) | null>;
}

const FALLBACK_CENTER: [number, number] = [51.505, -0.09];
const GRID_FIT_PADDING = L.point(24, 24);
const DEFAULT_MAP_ZOOM = 16;
const ZOOM_LEVEL_SYNC_DEBOUNCE_MS = 140;
const HEX_LAYER_PANE = 'game-map-hex-pane';
const PLAYER_LAYER_PANE = 'game-map-player-pane';
const RADAR_LAYER_PANE = 'game-map-radar-pane';
const MAP_BOUNDARY_PADDING_METERS = 500;
const MAP_LOOK_PRESETS: MapLookPreset[] = ['nightVision', 'military', 'blackWhite', 'normal'];

function formatDebugCoordinate(value: number | null | undefined): string {
  return Number.isFinite(value ?? Number.NaN) ? Number(value).toFixed(6) : '—';
}

function formatDebugHex(hex: [number, number] | null): string {
  return hex ? `(${hex[0]}, ${hex[1]})` : '—';
}

function toHexKey(hex: [number, number] | null | undefined): string | null {
  if (!hex) {
    return null;
  }

  return `${hex[0]},${hex[1]}`;
}

function parseHexKey(hexKey: string | null): [number, number] | null {
  if (!hexKey) {
    return null;
  }

  const delimiter = hexKey.includes(',') ? ',' : ':';
  const [qText, rText] = hexKey.split(delimiter);
  const q = Number(qText);
  const r = Number(rText);

  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    return null;
  }

  return [q, r];
}

function isTouchLikeDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

function padBoundsByMeters(bounds: L.LatLngBounds, meters: number): L.LatLngBounds {
  const centerLatRadians = bounds.getCenter().lat * (Math.PI / 180);
  const latPadding = meters / 111_320;
  const lngPadding = meters / Math.max(111_320 * Math.cos(centerLatRadians), 1e-6);

  return L.latLngBounds(
    [bounds.getSouth() - latPadding, bounds.getWest() - lngPadding],
    [bounds.getNorth() + latPadding, bounds.getEast() + lngPadding],
  );
}

export const GameMap = memo(function GameMap({
  state,
  myUserId,
  currentLocation,
  onHexClick,
  selectedHex = null,
  constrainViewportToGrid = false,
  gridOverride,
  inactiveHexKeys = [],
  playerDisplayPrefs: _playerDisplayPrefs,
  onBoundsChange,
  onHexScreenPosition,
  navigateRef,
}: Props) {
  const { t } = useTranslation();
  const selectedHexKey = useGameplayStore((overlayState) => overlayState.selectedHexKey);
  const mapFocusPreset = useGameplayStore((state) => state.abilityUi.mapFocusPreset);
  const setZoomLevel = useUiStore((uiState) => uiState.setZoomLevel);
  const hudBottomPx = useUiStore((uiState) => uiState.hudBottomPx);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zoomSyncTimeoutRef = useRef<number | null>(null);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_MAP_ZOOM);
  const [timePeriod, setTimePeriod] = useState(getTimePeriod);
  const [layerPrefs, setLayerPrefs] = useState<MapLayerPreferences>(() => ({ ...DEFAULT_MAP_LAYER_PREFS }));
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const [basemapDismissed, setBasemapDismissed] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [mapLookPreset, setMapLookPreset] = useState<MapLookPreset>('military');
  const basemapErrorRef = useRef(false);
  const basemapDismissedRef = useRef(false);
  const followedLocationKeyRef = useRef('');
  const currentLocationRef = useRef<LocationPoint | null>(null);
  const baseLayerControlRef = useRef<L.Control.Layers | null>(null);
  const activeBaseLayerRef = useRef<BasemapLayer | null>(null);
  const activeBasemapIdRef = useRef<GameBasemapId | null>(null);
  const basemapDefinitionsRef = useRef<GameBasemapDefinition[]>([]);
  const syncingBasemapFromPresetRef = useRef(false);
  const basemapLayersRef = useRef<BasemapLayer[]>([]);
  const geometryKeyRef = useRef('');
  const initialCenterRef = useRef<[number, number]>(
    state.mapLat != null && state.mapLng != null ? [state.mapLat, state.mapLng] : FALLBACK_CENTER,
  );
  const savedCameraStateRef = useRef<{ center: L.LatLng; zoom: number } | null>(null);
  const invalidateDebounceRef = useRef<number | null>(null);
  const repanDebounceRef = useRef<number | null>(null);
  const panToOffsetLocationRef = useRef<(lat: number, lng: number, zoom?: number, animate?: boolean) => void>(() => {});
  const [isCompassRotationEnabled, setIsCompassRotationEnabled] = useState(false);
  const [debugCompassHeading, setDebugCompassHeading] = useState<number | null>(null);
  const debugCompassHeadingRef = useRef<number | null>(null);

  const {
    heading: compassHeading,
    supported: compassSupported,
    permissionState: compassPermission,
    requestPermission: requestCompassPermission,
  } = useCompassHeading(isCompassRotationEnabled);

  const currentHex = useMemo(() => {
    if (!currentLocation || state.mapLat == null || state.mapLng == null) {
      return null;
    }

    return latLngToRoomHex(
      currentLocation.lat,
      currentLocation.lng,
      state.mapLat,
      state.mapLng,
      state.tileSizeMeters,
    );
  }, [currentLocation, state.mapLat, state.mapLng, state.tileSizeMeters]);

  const myPlayer = useMemo(
    () => state.players.find((player) => player.id === myUserId) ?? null,
    [myUserId, state.players],
  );
  const layerPanelDisclosureProps = isLayerPanelOpen
    ? { 'aria-expanded': 'true' as const }
    : { 'aria-expanded': 'false' as const };
  const currentMapLookIndex = MAP_LOOK_PRESETS.indexOf(mapLookPreset);
  const nextMapLookPreset = MAP_LOOK_PRESETS[(currentMapLookIndex + 1) % MAP_LOOK_PRESETS.length];
  const currentMapLookLabel = t(`mapLooks.${mapLookPreset}` as never);
  const nextMapLookLabel = t(`mapLooks.${nextMapLookPreset}` as never);
  const currentMapLookShortLabel = t(`mapLooks.short.${mapLookPreset}` as never);
  const renderedGrid = gridOverride ?? state.grid;
  const selectedHexFromStore = useMemo(() => parseHexKey(selectedHexKey), [selectedHexKey]);

  const applyBasemapError = useCallback((nextValue: boolean) => {
    if (basemapErrorRef.current === nextValue) {
      return;
    }

    basemapErrorRef.current = nextValue;
    setBasemapError(nextValue);
  }, []);

  const applyBasemapDismissed = useCallback((nextValue: boolean) => {
    if (basemapDismissedRef.current === nextValue) {
      return;
    }

    basemapDismissedRef.current = nextValue;
    setBasemapDismissed(nextValue);
  }, []);

  const panToOffsetLocation = useCallback((lat: number, lng: number, zoom?: number, animate = true) => {
    const map = mapRef.current;
    if (!map) return;
    const targetZoom = zoom ?? map.getZoom();
    const containerHeight = map.getSize().y;
    const offsetPxY = containerHeight * 0.12;
    const targetPoint = map.project([lat, lng], targetZoom);
    const offsetPoint = targetPoint.subtract([0, offsetPxY]);
    const offsetLatLng = map.unproject(offsetPoint, targetZoom);

    if (animate) {
      map.panTo(offsetLatLng, {
        animate: true,
        duration: 0.8,
        easeLinearity: 0.25,
      });
      // also ensure zoom is set smoothly if it's changing
      if (zoom !== undefined && zoom !== map.getZoom()) {
        map.setZoom(targetZoom, { animate: true });
      }
    } else {
      map.setView(offsetLatLng, targetZoom, { animate: false });
    }
  }, []);

  useEffect(() => {
    panToOffsetLocationRef.current = panToOffsetLocation;
  }, [panToOffsetLocation]);

  const handleHexClick = useCallback((q: number, r: number) => {
    onHexClick?.(q, r, renderedGrid[`${q},${r}`]);
  }, [onHexClick, renderedGrid]);

  const handleZoomToLocation = useCallback(() => {
    const map = mapRef.current;
    if (map && currentLocation) {
      panToOffsetLocation(currentLocation.lat, currentLocation.lng, Math.max(map.getZoom(), 17));
    }
  }, [currentLocation, panToOffsetLocation]);

  const queueZoomLevelSync = useCallback((nextZoomLevel: number) => {
    if (zoomSyncTimeoutRef.current !== null) {
      window.clearTimeout(zoomSyncTimeoutRef.current);
    }

    zoomSyncTimeoutRef.current = window.setTimeout(() => {
      setZoomLevel(nextZoomLevel);
      zoomSyncTimeoutRef.current = null;
    }, ZOOM_LEVEL_SYNC_DEBOUNCE_MS);
  }, [setZoomLevel]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map = mapRef.current;
      if (!map) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        map.zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        map.zoomOut();
      } else if (e.key === 'Home') {
        e.preventDefault();
        handleZoomToLocation();
      } else if (e.key === 'f' || e.key === 'F') {
        if (currentLocation) {
          e.preventDefault();
          setIsFollowingMe(prev => !prev);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentLocation, handleZoomToLocation, setIsFollowingMe]);

  useEffect(() => {
    debugCompassHeadingRef.current = debugCompassHeading;
  }, [debugCompassHeading]);

  // Stable ref so the Q/E handler can read the latest sensor heading without
  // re-registering the listener every time compassHeading updates (~16Hz).
  const compassHeadingRef = useRef<number | null>(null);
  useEffect(() => {
    compassHeadingRef.current = compassHeading;
  }, [compassHeading]);

  useEffect(() => {
    const wrapHeading = (value: number) => ((value % 360) + 360) % 360;

    function handleCompassDebugKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'e' || event.key === 'E') {
        const newHeading = wrapHeading((debugCompassHeadingRef.current ?? compassHeadingRef.current ?? 0) + 5);
        setDebugCompassHeading(newHeading);
        useUiStore.getState().setDebugHeading(newHeading);
      } else if (event.key === 'q' || event.key === 'Q') {
        const newHeading = wrapHeading((debugCompassHeadingRef.current ?? compassHeadingRef.current ?? 0) - 5);
        setDebugCompassHeading(newHeading);
        useUiStore.getState().setDebugHeading(newHeading);
      }
    }

    window.addEventListener('keydown', handleCompassDebugKeyDown);
    return () => {
      window.removeEventListener('keydown', handleCompassDebugKeyDown);
    };
  }, []); // stable: reads heading via refs, no closure over changing state

  useEffect(() => {
    useGameplayStore.getState().setSelectedHexKey(toHexKey(selectedHex));
  }, [selectedHex]);

  useEffect(() => {
    useGameplayStore.getState().setCurrentHexKey(toHexKey(currentHex));
  }, [currentHex]);

  useEffect(() => {
    currentLocationRef.current = currentLocation;
  }, [currentLocation]);

  useEffect(() => {
    useGameStore.getState().setGridOverride(gridOverride ?? null);
    return () => {
      useGameStore.getState().setGridOverride(null);
    };
  }, [gridOverride]);

  useEffect(() => {
    if (!gridOverride) return;
    useEffectsStore.getState().setEffects({
      contestedEdges: state.contestedEdges ?? [],
    });
  }, [gridOverride, inactiveHexKeys, state.contestedEdges]);

  useEffect(() => {
    const playerLayerStore = usePlayerLayerStore.getState();
    playerLayerStore.setPlayers(state.players ?? []);
    playerLayerStore.setMyUserId(myUserId);
    playerLayerStore.setCurrentLocation(currentLocation);
  }, [currentLocation, myUserId, state.players]);

  useLayoutEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const touchLikeDevice = isTouchLikeDevice();

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      maxZoom: MAP_MAX_ZOOM,
      maxBoundsViscosity: constrainViewportToGrid ? 1 : undefined,
      zoom: DEFAULT_MAP_ZOOM,
      zoomControl: false,
      rotate: true,
      rotateControl: false,
      bearing: 0,
      dragging: true,
      touchZoom: touchLikeDevice ? 'center' : true,
    });

    const hexPane = map.createPane(HEX_LAYER_PANE);
    hexPane.style.zIndex = '450';
    const rotatePane = (map as RotatingLeafletMap)._rotatePane;
    if (rotatePane) {
      rotatePane.appendChild(hexPane);
    }

    const playerPane = map.createPane(PLAYER_LAYER_PANE);
    playerPane.style.zIndex = '650';
    if (rotatePane) {
      rotatePane.appendChild(playerPane);
    }

    const radarPane = map.createPane(RADAR_LAYER_PANE);
    radarPane.style.zIndex = '540';
    radarPane.style.pointerEvents = 'none';
    if (rotatePane) {
      rotatePane.appendChild(radarPane);
    }

    const basemapDefinitions = createGameBaseLayers();
    const defaultBasemap = basemapDefinitions.find(({ id }) => id === 'top25') ?? basemapDefinitions[0];
    basemapDefinitionsRef.current = basemapDefinitions;
    basemapLayersRef.current = basemapDefinitions.map(({ layer }) => layer);
    defaultBasemap.layer.addTo(map);
    activeBaseLayerRef.current = defaultBasemap.layer;
    activeBasemapIdRef.current = defaultBasemap.id;

    const basemapResetTimeoutId = basemapErrorRef.current || basemapDismissedRef.current
      ? window.setTimeout(() => {
        applyBasemapError(false);
        applyBasemapDismissed(false);
      }, 0)
      : null;

    const tileErrorHandlers = basemapDefinitions.map(({ id, layer }) => {
      const handleTileError = (event: L.TileErrorEvent) => {
        if (!map.hasLayer(layer)) {
          return;
        }

        console.warn('[GameMap] basemap tile failed to load', {
          coords: event.coords,
          layer: id,
          src: event.tile.getAttribute('src'),
        });
        applyBasemapError(true);
        applyBasemapDismissed(false);
      };

      layer.on('tileerror', handleTileError);
      return { handleTileError, layer };
    });

    const loadHandlers = basemapDefinitions.map(({ id, layer }) => {
      const handleLoad = () => {
        if (!map.hasLayer(layer)) {
          return;
        }

        console.info('[GameMap] basemap tiles loaded', { layer: id });
        applyBasemapError(false);
      };

      layer.on('load', handleLoad);
      return { handleLoad, layer };
    });

    const handleBaseLayerChange = (event: L.LayersControlEvent) => {
      activeBaseLayerRef.current = event.layer as BasemapLayer;
      const nextBasemap = basemapDefinitions.find(({ layer }) => layer === event.layer);
      if (nextBasemap) {
        activeBasemapIdRef.current = nextBasemap.id;
        if (syncingBasemapFromPresetRef.current) {
          syncingBasemapFromPresetRef.current = false;
        } else {
          setMapLookPreset(nextBasemap.recommendedLook);
        }
      }
      applyBasemapError(false);
      applyBasemapDismissed(false);
    };
    map.on('baselayerchange', handleBaseLayerChange);

    baseLayerControlRef.current = L.control.layers(
      Object.fromEntries(basemapDefinitions.map(({ labelKey, layer }) => [t(labelKey as never), layer]))
    ).addTo(map);

    mapRef.current = map;
    setMapInstance(map);

    useUiStore.getState().setMapCameraController({
      setView: (lat, lng, zoom) => panToOffsetLocationRef.current(lat, lng, zoom, true),
        fitBounds: (bounds, _paddingPx) => map.fitBounds(bounds, {
          paddingTopLeft: L.point(GRID_FIT_PADDING.x, 48),
          paddingBottomRight: GRID_FIT_PADDING,
        }),
      getZoom: () => map.getZoom(),
    });

    if (navigateRef) {
        navigateRef.current = (lat: number, lng: number) => panToOffsetLocationRef.current(lat, lng);
    }

    return () => {
      if (basemapResetTimeoutId !== null) {
        window.clearTimeout(basemapResetTimeoutId);
      }
      tileErrorHandlers.forEach(({ handleTileError, layer }) => {
        layer.off('tileerror', handleTileError);
      });
      loadHandlers.forEach(({ handleLoad, layer }) => {
        layer.off('load', handleLoad);
      });
      map.off('baselayerchange', handleBaseLayerChange);
      baseLayerControlRef.current?.remove();
      baseLayerControlRef.current = null;
      activeBaseLayerRef.current = null;
      activeBasemapIdRef.current = null;
      basemapDefinitionsRef.current = [];
      syncingBasemapFromPresetRef.current = false;
      basemapLayersRef.current = [];
      map.stop();
      map.off();
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
      useUiStore.getState().setMapCameraController(null);
      geometryKeyRef.current = '';
      if (navigateRef) {
        navigateRef.current = null;
      }
    };
  }, [applyBasemapDismissed, applyBasemapError, constrainViewportToGrid, navigateRef, t]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const handleZoomEnd = () => {
      const nextZoomLevel = map.getZoom();
      setCurrentZoom(nextZoomLevel);
      queueZoomLevelSync(nextZoomLevel);
    };

    handleZoomEnd();
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, [queueZoomLevelSync]);

  useEffect(() => {
    return () => {
      if (zoomSyncTimeoutRef.current !== null) {
        window.clearTimeout(zoomSyncTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (invalidateDebounceRef.current !== null) {
        window.clearTimeout(invalidateDebounceRef.current);
      }

      invalidateDebounceRef.current = window.setTimeout(() => {
        invalidateDebounceRef.current = null;
        const map = mapRef.current;
        if (map) {
          map.invalidateSize({ pan: false });
        }

        if (repanDebounceRef.current !== null) {
          window.clearTimeout(repanDebounceRef.current);
        }

        repanDebounceRef.current = window.setTimeout(() => {
          repanDebounceRef.current = null;
          if (isFollowingMe && currentLocation) {
            followedLocationKeyRef.current = '';
            panToOffsetLocation(currentLocation.lat, currentLocation.lng);
          }
        }, 350);
      }, 150);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (invalidateDebounceRef.current !== null) {
        window.clearTimeout(invalidateDebounceRef.current);
      }
      if (repanDebounceRef.current !== null) {
        window.clearTimeout(repanDebounceRef.current);
      }
    };
  }, [hudBottomPx, isFollowingMe, currentLocation, panToOffsetLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const targetBasemapId = MAP_LOOK_TO_BASEMAP[mapLookPreset];
    if (activeBasemapIdRef.current === targetBasemapId) {
      return;
    }

    const targetBasemap = basemapDefinitionsRef.current.find(({ id }) => id === targetBasemapId);
    if (!targetBasemap) {
      return;
    }

    syncingBasemapFromPresetRef.current = true;

    if (activeBaseLayerRef.current && map.hasLayer(activeBaseLayerRef.current)) {
      map.removeLayer(activeBaseLayerRef.current);
    }

    targetBasemap.layer.addTo(map);
    activeBaseLayerRef.current = targetBasemap.layer;
    activeBasemapIdRef.current = targetBasemap.id;

    window.requestAnimationFrame(() => {
      applyBasemapError(false);
      applyBasemapDismissed(false);
    });
  }, [applyBasemapDismissed, applyBasemapError, mapLookPreset]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onBoundsChange) {
      return;
    }

    const handleMoveEnd = () => {
      const bounds = map.getBounds();
      onBoundsChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
    };

    handleMoveEnd();
    map.on('moveend', handleMoveEnd);
    return () => {
      map.off('moveend', handleMoveEnd);
    };
  }, [onBoundsChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let followToggleFrameId: number | null = null;
    const setFollowingMeDeferred = (nextValue: boolean) => {
      followToggleFrameId = window.requestAnimationFrame(() => {
        setIsFollowingMe(nextValue);
      });
    };

    if (mapFocusPreset === 'player') {
      if (!savedCameraStateRef.current) {
        savedCameraStateRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      }
      followedLocationKeyRef.current = '';
      setFollowingMeDeferred(true);
      const loc = currentLocationRef.current;
      if (loc) {
        panToOffsetLocation(loc.lat, loc.lng, undefined, true);
      }
    } else if (mapFocusPreset === 'localTracking') {
      if (!savedCameraStateRef.current) {
        savedCameraStateRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      }
      followedLocationKeyRef.current = '';
      setFollowingMeDeferred(true);
      const loc = currentLocationRef.current;
      if (loc) {
        panToOffsetLocation(loc.lat, loc.lng, 16.25, false);
      } else {
        map.setZoom(16.25, { animate: true });
      }
    } else if (mapFocusPreset === 'strategicTargeting') {
      if (!savedCameraStateRef.current) {
        savedCameraStateRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      }
      setFollowingMeDeferred(false);
      map.setZoom(13.5, { animate: true });
    } else if (!mapFocusPreset || mapFocusPreset === 'none' || mapFocusPreset === 'idle') {
      if (savedCameraStateRef.current) {
        const { center, zoom } = savedCameraStateRef.current;
        map.setView(center, zoom, { animate: true });
        savedCameraStateRef.current = null;
      }
    }

    return () => {
      if (followToggleFrameId !== null) {
        window.cancelAnimationFrame(followToggleFrameId);
      }
    };
  }, [mapFocusPreset, panToOffsetLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!onHexScreenPosition || !map) {
      return;
    }
    if (!selectedHexFromStore || state.mapLat == null || state.mapLng == null) {
      onHexScreenPosition(null);
      return;
    }

    const [lat, lng] = roomHexToLatLng(
      selectedHexFromStore[0],
      selectedHexFromStore[1],
      state.mapLat,
      state.mapLng,
      state.tileSizeMeters,
    );
    const point = map.latLngToContainerPoint([lat, lng]);
    const rect = map.getContainer().getBoundingClientRect();
    onHexScreenPosition({ x: rect.left + point.x, y: rect.top + point.y });
  }, [onHexScreenPosition, selectedHexFromStore, state.mapLat, state.mapLng, state.tileSizeMeters]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimePeriod(getTimePeriod()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      map.invalidateSize();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [state.mapLat, state.mapLng, state.masterTileQ, state.masterTileR, state.tileSizeMeters]);

  useEffect(() => {
    if (!isFollowingMe) {
      followedLocationKeyRef.current = '';
      return;
    }

    const map = mapRef.current;
    if (!map || !currentLocation) {
      return;
    }

    const locationKey = `${currentLocation.lat.toFixed(6)},${currentLocation.lng.toFixed(6)}`;
    if (followedLocationKeyRef.current === locationKey) {
      return;
    }

    followedLocationKeyRef.current = locationKey;
    panToOffsetLocation(currentLocation.lat, currentLocation.lng, undefined, true);
  }, [currentLocation, isFollowingMe, panToOffsetLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.mapLat == null || state.mapLng == null) {
      return;
    }

    const geometryKey = `${state.mapLat}:${state.mapLng}:${state.tileSizeMeters}:${Object.keys(renderedGrid).join('|')}`;
    if (geometryKeyRef.current === geometryKey) {
      return;
    }

    geometryKeyRef.current = geometryKey;

    const points = Object.values(renderedGrid)
      .flatMap((cell) => roomHexCornerLatLngs(cell.q, cell.r, state.mapLat!, state.mapLng!, state.tileSizeMeters))
      .map(([lat, lng]) => L.latLng(lat, lng));

    if (points.length === 0) {
      map.setView([state.mapLat, state.mapLng], DEFAULT_MAP_ZOOM, { animate: false });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { 
      paddingTopLeft: L.point(24, 48),
      paddingBottomRight: L.point(24, 24),
      animate: false 
    });

    if (!constrainViewportToGrid) {
      return;
    }

    map.setMinZoom(map.getZoom());
    map.setMaxBounds(padBoundsByMeters(bounds, MAP_BOUNDARY_PADDING_METERS));
  }, [constrainViewportToGrid, renderedGrid, state.mapLat, state.mapLng, state.tileSizeMeters]);

  function handleBasemapRetry() {
    const layer = activeBaseLayerRef.current;
    console.info('[GameMap] retrying basemap tiles', {
      activeLayerLoaded: Boolean(layer),
    });

    if (!layer) {
      return;
    }

    applyBasemapDismissed(false);
    applyBasemapError(false);
    basemapLayersRef.current.forEach((baseLayer) => {
      if (baseLayer === layer) {
        baseLayer.redraw();
      }
    });
  }

  const effectiveHeading = debugCompassHeading ?? compassHeading;
  const targetBearingRef = useRef<number>(0);
  const currentBearingRef = useRef<number>(0);
  const bearingRafRef = useRef<number>(0);
  // Expose lerpBearing so the heading-sync effect can restart the loop
  // after it exits on convergence, without creating a circular dependency.
  const lerpBearingRef = useRef<(() => void) | null>(null);

  // Sync target bearing from heading state into ref (must be in an effect, not render).
  // Also restarts the lerp loop if it has already exited on convergence.
  useEffect(() => {
    if (effectiveHeading !== null && isCompassRotationEnabled) {
      targetBearingRef.current = (360 - effectiveHeading) % 360;
      // Kick off a new lerp frame when the loop is idle (exited after converging).
      if (bearingRafRef.current === 0 && lerpBearingRef.current) {
        bearingRafRef.current = requestAnimationFrame(lerpBearingRef.current);
      }
    }
  }, [effectiveHeading, isCompassRotationEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    const container = map?.getContainer();

    if (!isCompassRotationEnabled) {
      // Reset to north immediately when disabled
      if (bearingRafRef.current) {
        cancelAnimationFrame(bearingRafRef.current);
        bearingRafRef.current = 0;
      }
      targetBearingRef.current = 0;
      currentBearingRef.current = 0;
      map?.setBearing(0);
      if (container) {
        container.style.setProperty('--map-bearing', '0deg');
      }
      return;
    }

    // Start lerp loop — exits on convergence; restarted by the effectiveHeading effect
    const lerpBearing = () => {
      const target = targetBearingRef.current;
      let current = currentBearingRef.current;

      // Compute shortest-path angular difference
      let diff = target - current;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      // Lerp toward target (0.25 factor per frame ≈ smooth convergence)
      if (Math.abs(diff) < 0.3) {
        // Converged — snap exactly, apply final update, then STOP the loop.
        // The effectiveHeading effect will restart it when heading changes.
        current = ((target % 360) + 360) % 360;
        currentBearingRef.current = current;
        map?.setBearing(current);
        if (container) {
          container.style.setProperty('--map-bearing', `${current}deg`);
        }
        bearingRafRef.current = 0;
        return;
      }

      current = current + diff * 0.25;

      // Normalize to 0-360
      current = ((current % 360) + 360) % 360;
      currentBearingRef.current = current;

      map?.setBearing(current);
      if (container) {
        container.style.setProperty('--map-bearing', `${current}deg`);
      }

      bearingRafRef.current = requestAnimationFrame(lerpBearing);
    };

    lerpBearingRef.current = lerpBearing;

    bearingRafRef.current = requestAnimationFrame(lerpBearing);

    return () => {
      if (bearingRafRef.current) {
        cancelAnimationFrame(bearingRafRef.current);
        bearingRafRef.current = 0;
      }
      lerpBearingRef.current = null;
    };
  }, [isCompassRotationEnabled]);

  return (
    <div className={`game-map-container time-${timePeriod} map-look--${mapLookPreset}`}>
      <div ref={containerRef} className="leaflet-map" />
      {mapInstance ? (
        <>
          <GameOverlayLayer
            map={mapInstance}
            mapLat={state.mapLat ?? 0}
            mapLng={state.mapLng ?? 0}
            tileSizeMeters={state.tileSizeMeters ?? 50}
            onHexClick={handleHexClick}
            layerPreferences={layerPrefs}
            showWorldDimMask={layerPrefs.worldDimMask}
          />
          <EffectsLayer
            map={mapInstance}
            mapLat={state.mapLat ?? 0}
            mapLng={state.mapLng ?? 0}
            tileSizeMeters={state.tileSizeMeters ?? 50}
            layerPreferences={layerPrefs}
          />
          <AbilityOverlayLayer
            map={mapInstance}
            mapLat={state.mapLat ?? 0}
            mapLng={state.mapLng ?? 0}
            tileSizeMeters={state.tileSizeMeters ?? 50}
            compassHeading={debugCompassHeading ?? compassHeading}
            isCompassRotationEnabled={isCompassRotationEnabled}
          />
          <PlayerLayer map={mapInstance} layerPreferences={layerPrefs} />
          <RadarSweepLayer
            map={mapInstance}
            isActive={state.phase === 'Playing' && currentLocation != null && layerPrefs.radarSweep}
          />
          <HexTooltipOverlay map={mapInstance} />
        </>
      ) : null}
      <TroopSplashLayer
        key={state.roomCode}
        events={state.eventLog}
        map={mapInstance}
        mapLat={state.mapLat}
        mapLng={state.mapLng}
        tileSizeMeters={state.tileSizeMeters}
      />
      {layerPrefs.timeOverlay && <TimeOverlay timePeriod={timePeriod} />}
      {basemapError && !basemapDismissed && (
        <div className="basemap-error-banner" role="status" aria-live="polite">
          <span className="basemap-error-banner__msg">{t('map.basemapUnavailable')}</span>
          <div className="basemap-error-banner__actions">
            <button
              type="button"
              className="basemap-error-banner__retry"
              onClick={handleBasemapRetry}
            >
              {t('map.basemapRetry')}
            </button>
            <button
              type="button"
              className="basemap-error-banner__dismiss"
              aria-label={t('game.close')}
              onClick={() => applyBasemapDismissed(true)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {import.meta.env.DEV && (
        <aside className="game-map-dev-overlay" aria-live="polite">
          <strong>Hex debug</strong>
          <span>
            Raw lat/lng: {currentLocation
              ? `${formatDebugCoordinate(currentLocation.lat)}, ${formatDebugCoordinate(currentLocation.lng)}`
              : '—'}
          </span>
          <span>Detected (Q, R): {formatDebugHex(currentHex)}</span>
          <span>Zoom: {currentZoom}</span>
          <span>
            Game state lat/lng: {formatDebugCoordinate(myPlayer?.currentLat)}, {formatDebugCoordinate(myPlayer?.currentLng)}
          </span>
        </aside>
      )}
      <div className="game-map-controls" role="group" aria-label={t('game.mapControlsLabel')}>
        <button
          type="button"
          className={`map-control-fab${isFollowingMe ? ' is-active' : ''}`}
          onClick={() => setIsFollowingMe((enabled) => !enabled)}
          title={isFollowingMe ? t('game.disableFollowMe') : t('game.enableFollowMe')}
          aria-label={isFollowingMe ? t('game.disableFollowMe') : t('game.enableFollowMe')}
          disabled={!currentLocation}
        >
          {/* Navigation/Compass Icon */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {isFollowingMe ? (
              <path d="M12 2L2 22l10-3 10 3L12 2z" fill="currentColor" fillOpacity="0.2" />
            ) : (
              <polygon points="3 11 22 2 13 21 11 13 3 11" />
            )}
          </svg>
        </button>
        <button
          className={`map-control-fab map-control-fab--compass${isCompassRotationEnabled ? ' is-active' : ''}`}
          disabled={!compassSupported}
          title={
            !compassSupported
              ? t('game.compassNotSupported')
              : compassPermission === 'prompt'
              ? t('game.compassPermissionNeeded')
              : isCompassRotationEnabled
              ? t('game.disableCompassRotation')
              : t('game.enableCompassRotation')
          }
          aria-label={
            !compassSupported
              ? t('game.compassNotSupported')
              : isCompassRotationEnabled
              ? t('game.disableCompassRotation')
              : t('game.enableCompassRotation')
          }
          onClick={() => {
            if (!compassSupported) return;
            if (compassPermission === 'prompt') {
              requestCompassPermission().then(() => {
                setIsCompassRotationEnabled(true);
              }).catch(() => {
                // permission denied — do nothing
              });
            } else {
              setIsCompassRotationEnabled((prev) => {
                if (prev) {
                  setDebugCompassHeading(null);
                }
                return !prev;
              });
            }
          }}
          style={{ '--compass-needle-deg': `${debugCompassHeading ?? compassHeading ?? 0}deg` } as React.CSSProperties}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <g className="compass-needle">
              {/* North needle — red */}
              <polygon points="12,4 10.5,12 12,11 13.5,12" fill="#e74c3c" stroke="none" />
              {/* South needle — white */}
              <polygon points="12,20 10.5,12 12,13 13.5,12" fill="white" stroke="none" />
            </g>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
          </svg>
        </button>
        <button
          type="button"
          className="map-control-fab locate-fab"
          data-action="locate"
          onClick={handleZoomToLocation}
          title={t('game.zoomToLocation')}
          aria-label={t('game.zoomToLocation')}
          disabled={!currentLocation}
        >
          {/* Crosshair/Focus Icon */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
        <button
          type="button"
          className={`map-control-fab${isLayerPanelOpen ? ' is-active' : ''}`}
          onClick={() => setIsLayerPanelOpen((open) => !open)}
          title={t('mapLayers.expandPanel')}
          aria-label={t('mapLayers.expandPanel')}
          {...layerPanelDisclosureProps}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18" />
            <path d="M3 12h18" />
            <path d="M3 18h18" />
            <path d="M8 3v6" />
            <path d="M16 9v6" />
            <path d="M10 15v6" />
          </svg>
        </button>
        <button
          type="button"
          className={`map-control-fab map-control-fab--map-look map-control-fab--map-look-${mapLookPreset}`}
          onClick={() => setMapLookPreset(nextMapLookPreset)}
          title={t('mapLooks.cycleButton', { current: currentMapLookLabel, next: nextMapLookLabel })}
          aria-label={t('mapLooks.cycleButton', { current: currentMapLookLabel, next: nextMapLookLabel })}
        >
          <span className="map-control-fab__stack" aria-hidden="true">
            <span className="map-control-fab__kicker">MAP</span>
            <span className="map-control-fab__value">{currentMapLookShortLabel}</span>
          </span>
        </button>
        <MapLegend />
      </div>
      <MapLayerToggle
        prefs={layerPrefs}
        onPrefsChange={setLayerPrefs}
        isOpen={isLayerPanelOpen}
        onClose={() => setIsLayerPanelOpen(false)}
      />
    </div>
  );
});
