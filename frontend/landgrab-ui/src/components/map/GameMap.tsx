import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GameState, HexCell } from '../../types/game';
import { DEFAULT_MAP_LAYER_PREFS, type MapLayerPreferences } from '../../types/mapLayerPreferences';
import type { PlayerDisplayPreferences } from '../../types/playerPreferences';
import { latLngToRoomHex, roomHexCornerLatLngs, roomHexToLatLng } from './HexMath';
import { createPdokBaseLayers, MAP_MAX_ZOOM } from './pdokLayers';
import { getTimePeriod } from '../../utils/timeOfDay';
import { showTroopAnimations } from '../../utils/zoomThresholds';
import { injectTerrainPatternSVG } from './TerrainPatternDefs';
import { useGridDiff } from '../../hooks/useGridDiff';
import { renderTroopAnimations } from './TroopAnimationLayer';
import { TroopSplashLayer } from './TroopSplashLayer';
import { MapLayerToggle, renderHexGridLayers, renderPlayerMarkers, TimeOverlay } from '../game/map';

interface LocationPoint {
  lat: number;
  lng: number;
}

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
const SHOW_HEX_DEBUG_OVERLAY = import.meta.env.DEV;
const HEX_LAYER_PANE = 'game-map-hex-pane';
const PLAYER_LAYER_PANE = 'game-map-player-pane';
type BasemapLayer = L.TileLayer | L.TileLayer.WMS;

function formatDebugCoordinate(value: number | null | undefined): string {
  return Number.isFinite(value ?? Number.NaN) ? Number(value).toFixed(6) : '—';
}

function formatDebugHex(hex: [number, number] | null): string {
  return hex ? `(${hex[0]}, ${hex[1]})` : '—';
}

function applyLayerPane(layerGroup: L.LayerGroup, paneName: string) {
  const layers = [...layerGroup.getLayers()];

  for (const layer of layers) {
    if (!(layer instanceof L.Marker || layer instanceof L.Path)) {
      continue;
    }

    if (layer.options.pane === paneName) {
      continue;
    }

    layerGroup.removeLayer(layer);
    layer.options.pane = paneName;
    layerGroup.addLayer(layer);
  }
}

export function GameMap({
  state,
  myUserId,
  currentLocation,
  onHexClick,
  selectedHex = null,
  constrainViewportToGrid = false,
  gridOverride,
  inactiveHexKeys = [],
  playerDisplayPrefs,
  onBoundsChange,
  onHexScreenPosition,
  navigateRef,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_MAP_ZOOM);
  const [timePeriod, setTimePeriod] = useState(getTimePeriod);
  const [mapOverlayTick, setMapOverlayTick] = useState(0);
  const [layerPrefs, setLayerPrefs] = useState<MapLayerPreferences>(() => ({ ...DEFAULT_MAP_LAYER_PREFS }));
  const [basemapError, setBasemapError] = useState(false);
  const [basemapDismissed, setBasemapDismissed] = useState(false);
  const basemapErrorRef = useRef(false);
  const basemapDismissedRef = useRef(false);
  const followedLocationKeyRef = useRef('');
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const playerLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const animLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const baseLayerControlRef = useRef<L.Control.Layers | null>(null);
  const activeBaseLayerRef = useRef<BasemapLayer | null>(null);
  const basemapLayersRef = useRef<BasemapLayer[]>([]);
  const geometryKeyRef = useRef('');
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const prevGridRef = useRef<Record<string, HexCell>>({});
  const onHexClickRef = useRef(onHexClick);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  useEffect(() => {
    onHexClickRef.current = onHexClick;
  });

  const troopMovements = useGridDiff(state.grid);
  const initialCenterRef = useRef<[number, number]>(
    state.mapLat != null && state.mapLng != null ? [state.mapLat, state.mapLng] : FALLBACK_CENTER
  );

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
    () => state.players.find(player => player.id === myUserId) ?? null,
    [myUserId, state.players],
  );

  const renderedGrid = gridOverride ?? state.grid;
  const hasPendingMapOverlays = useMemo(
    () => Object.values(renderedGrid).some(cell => Boolean(cell.engineerBuiltAt) && !cell.isFort)
      || state.players.some(player => Boolean(player.demolishActive && player.demolishStartedAt)),
    [renderedGrid, state.players],
  );
  const inactiveHexKeySet = useMemo(() => new Set(inactiveHexKeys), [inactiveHexKeys]);
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

  function handleZoomToLocation() {
    const map = mapRef.current;
    if (map && currentLocation) {
      map.setView([currentLocation.lat, currentLocation.lng], Math.max(map.getZoom(), 17));
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      maxZoom: MAP_MAX_ZOOM,
      maxBoundsViscosity: constrainViewportToGrid ? 1 : undefined,
      zoom: DEFAULT_MAP_ZOOM,
      zoomControl: false,
    });

    const hexPane = map.createPane(HEX_LAYER_PANE);
    hexPane.style.zIndex = '450';

    const playerPane = map.createPane(PLAYER_LAYER_PANE);
    playerPane.style.zIndex = '650';

    const { brtStandard, brtGray, top25 } = createPdokBaseLayers();
    const basemapLayers: BasemapLayer[] = [top25, brtStandard, brtGray];
    basemapLayersRef.current = basemapLayers;
    top25.addTo(map);
    activeBaseLayerRef.current = top25;

    const basemapResetTimeoutId = basemapErrorRef.current || basemapDismissedRef.current
      ? window.setTimeout(() => {
        applyBasemapError(false);
        applyBasemapDismissed(false);
      }, 0)
      : null;

    const basemapEntries = [
      { key: t('map.layerTopo'), label: 'topo', layer: top25 },
      { key: t('map.layerStandard'), label: 'standard', layer: brtStandard },
      { key: t('map.layerGray'), label: 'gray', layer: brtGray },
    ] as const;

    const tileErrorHandlers = basemapEntries.map(({ label, layer }) => {
      const handleTileError = (event: L.TileErrorEvent) => {
        if (!map.hasLayer(layer)) {
          return;
        }

        console.warn('[GameMap] basemap tile failed to load', {
          coords: event.coords,
          layer: label,
          src: event.tile.getAttribute('src'),
        });
        applyBasemapError(true);
        applyBasemapDismissed(false);
      };

      layer.on('tileerror', handleTileError);
      return { handleTileError, layer };
    });

    const loadHandlers = basemapEntries.map(({ label, layer }) => {
      const handleLoad = () => {
        if (!map.hasLayer(layer)) {
          return;
        }

        console.info('[GameMap] basemap tiles loaded', { layer: label });
        applyBasemapError(false);
      };

      layer.on('load', handleLoad);
      return { handleLoad, layer };
    });

    const handleBaseLayerChange = (event: L.LayersControlEvent) => {
      activeBaseLayerRef.current = event.layer as BasemapLayer;
      applyBasemapError(false);
      applyBasemapDismissed(false);
    };
    map.on('baselayerchange', handleBaseLayerChange);

    baseLayerControlRef.current = L.control.layers({
      [t('map.layerTopo')]: top25,
      [t('map.layerStandard')]: brtStandard,
      [t('map.layerGray')]: brtGray,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    playerLayerGroupRef.current = L.layerGroup().addTo(map);
    animLayerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setMapInstance(map);

    if (navigateRef) {
      navigateRef.current = (lat: number, lng: number) => map.setView([lat, lng]);
    }

    setTimeout(() => {
      if (containerRef.current) {
        injectTerrainPatternSVG(containerRef.current);
      }
    }, 100);

    map.getContainer().addEventListener('pointerdown', (event: PointerEvent) => {
      pointerDownRef.current = { x: event.clientX, y: event.clientY };
    }, { passive: true });

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
      basemapLayersRef.current = [];
      map.stop();
      map.off();
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
      layerGroupRef.current = null;
      playerLayerGroupRef.current = null;
      animLayerGroupRef.current = null;
      geometryKeyRef.current = '';
      if (navigateRef) {
        navigateRef.current = null;
      }
    };
  }, [applyBasemapDismissed, applyBasemapError, constrainViewportToGrid, navigateRef, t]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const handleZoomEnd = () => {
      setCurrentZoom(map.getZoom());
    };

    handleZoomEnd();
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, []);

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
    if (!onHexScreenPosition || !map) {
      return;
    }
    if (!selectedHex || state.mapLat == null || state.mapLng == null) {
      onHexScreenPosition(null);
      return;
    }

    const [lat, lng] = roomHexToLatLng(
      selectedHex[0],
      selectedHex[1],
      state.mapLat,
      state.mapLng,
      state.tileSizeMeters,
    );
    const point = map.latLngToContainerPoint([lat, lng]);
    const rect = map.getContainer().getBoundingClientRect();
    onHexScreenPosition({ x: rect.left + point.x, y: rect.top + point.y });
  }, [selectedHex, state.mapLat, state.mapLng, state.tileSizeMeters, onHexScreenPosition]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setTimePeriod(getTimePeriod()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!hasPendingMapOverlays) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setMapOverlayTick(tick => tick + 1);
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [hasPendingMapOverlays]);

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
    map.panTo([currentLocation.lat, currentLocation.lng], {
      animate: true,
      duration: 0.8,
      easeLinearity: 0.25,
    });
  }, [currentLocation, isFollowingMe]);

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
      .flatMap(cell => roomHexCornerLatLngs(cell.q, cell.r, state.mapLat!, state.mapLng!, state.tileSizeMeters))
      .map(([lat, lng]) => L.latLng(lat, lng));

    if (points.length === 0) {
      map.setView([state.mapLat, state.mapLng], DEFAULT_MAP_ZOOM, { animate: false });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: GRID_FIT_PADDING, animate: false });

    if (!constrainViewportToGrid) {
      return;
    }

    map.setMinZoom(map.getZoom());
    map.setMaxBounds(bounds.pad(0.05));
  }, [constrainViewportToGrid, renderedGrid, state.mapLat, state.mapLng, state.tileSizeMeters]);

  useEffect(() => {
    const layerGroup = layerGroupRef.current;
    if (!layerGroup || state.mapLat == null || state.mapLng == null) {
      return;
    }

    renderHexGridLayers({
      currentHex,
      currentZoom,
      inactiveHexKeySet,
      layerGroup,
      layerPrefs,
      myUserId,
      onHexClickRef,
      pointerDownRef,
      prevGridRef,
      renderedGrid,
      selectedHex,
      state: {
        alliances: state.alliances,
        dynamics: state.dynamics,
        mapLat: state.mapLat,
        mapLng: state.mapLng,
        players: state.players,
        tileSizeMeters: state.tileSizeMeters,
      } as GameState,
    });

    applyLayerPane(layerGroup, HEX_LAYER_PANE);
  }, [
    currentHex,
    currentZoom,
    inactiveHexKeySet,
    layerPrefs,
    mapOverlayTick,
    myUserId,
    renderedGrid,
    selectedHex,
    state.alliances,
    state.dynamics,
    state.mapLat,
    state.mapLng,
    state.players,
    state.tileSizeMeters,
  ]);

  useEffect(() => {
    const playerLayerGroup = playerLayerGroupRef.current;
    if (!playerLayerGroup) {
      return;
    }

    playerLayerGroup.clearLayers();

    if (state.mapLat == null || state.mapLng == null) {
      return;
    }

    renderPlayerMarkers({
      currentLocation,
      currentZoom,
      layerGroup: playerLayerGroup,
      layerPrefs,
      myUserId,
      playerDisplayPrefs,
      state,
    });

    applyLayerPane(playerLayerGroup, PLAYER_LAYER_PANE);
  }, [
    currentLocation,
    currentZoom,
    layerPrefs,
    myUserId,
    playerDisplayPrefs,
    state,
    state.mapLat,
    state.mapLng,
    state.players,
    state.tileSizeMeters,
  ]);

  useEffect(() => {
    const layerGroup = animLayerGroupRef.current;
    if (!layerGroup || state.mapLat == null || state.mapLng == null) {
      return;
    }
    if (troopMovements.length === 0 || !showTroopAnimations(currentZoom)) {
      layerGroup.clearLayers();
      return;
    }

    renderTroopAnimations(troopMovements, layerGroup, state.mapLat, state.mapLng, state.tileSizeMeters, layerPrefs);
  }, [troopMovements, state.mapLat, state.mapLng, state.tileSizeMeters, currentZoom, layerPrefs]);

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
    basemapLayersRef.current.forEach(baseLayer => {
      if (baseLayer === layer) {
        baseLayer.redraw();
      }
    });
  }

  return (
    <div className={`game-map-container time-${timePeriod}`}>
      <div ref={containerRef} className="leaflet-map" />
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
      {SHOW_HEX_DEBUG_OVERLAY && (
        <aside className="game-map-dev-overlay" aria-live="polite">
          <strong>Hex debug</strong>
          <span>
            Raw lat/lng: {currentLocation
              ? `${formatDebugCoordinate(currentLocation.lat)}, ${formatDebugCoordinate(currentLocation.lng)}`
              : '—'}
          </span>
          <span>Detected (Q, R): {formatDebugHex(currentHex)}</span>
          <span>
            Game state lat/lng: {formatDebugCoordinate(myPlayer?.currentLat)}, {formatDebugCoordinate(myPlayer?.currentLng)}
          </span>
        </aside>
      )}
      <div className="game-map-controls" role="group" aria-label={t('game.mapControlsLabel')}>
        <button
          type="button"
          className={`map-control-fab${isFollowingMe ? ' is-active' : ''}`}
          onClick={() => setIsFollowingMe(enabled => !enabled)}
          title={isFollowingMe ? t('game.disableFollowMe') : t('game.enableFollowMe')}
          aria-label={isFollowingMe ? t('game.disableFollowMe') : t('game.enableFollowMe')}
          disabled={!currentLocation}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
        </button>
        <button
          type="button"
          className="map-control-fab"
          onClick={handleZoomToLocation}
          title={t('game.zoomToLocation')}
          aria-label={t('game.zoomToLocation')}
          disabled={!currentLocation}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"></path></svg>
        </button>
      </div>
      <MapLayerToggle prefs={layerPrefs} onPrefsChange={setLayerPrefs} />
    </div>
  );
}
