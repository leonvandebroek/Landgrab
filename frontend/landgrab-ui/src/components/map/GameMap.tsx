import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
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
  const [layerPrefs, setLayerPrefs] = useState<MapLayerPreferences>(() => ({ ...DEFAULT_MAP_LAYER_PREFS }));
  const followedLocationKeyRef = useRef('');
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const animLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const baseLayerControlRef = useRef<L.Control.Layers | null>(null);
  const geometryKeyRef = useRef('');
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const prevGridRef = useRef<Record<string, HexCell>>({});
  const onHexClickRef = useRef(onHexClick);

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

  const renderedGrid = gridOverride ?? state.grid;
  const inactiveHexKeySet = useMemo(() => new Set(inactiveHexKeys), [inactiveHexKeys]);

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

    const { brtStandard, brtGray, top25 } = createPdokBaseLayers();
    top25.addTo(map);
    baseLayerControlRef.current = L.control.layers({
      [t('map.layerTopo')]: top25,
      [t('map.layerStandard')]: brtStandard,
      [t('map.layerGray')]: brtGray,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    animLayerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

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
      baseLayerControlRef.current?.remove();
      baseLayerControlRef.current = null;
      map.stop();
      map.off();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      animLayerGroupRef.current = null;
      geometryKeyRef.current = '';
      if (navigateRef) {
        navigateRef.current = null;
      }
    };
  }, [constrainViewportToGrid, navigateRef, t]);

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
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup || state.mapLat == null || state.mapLng == null) {
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
      state,
    });

    renderPlayerMarkers({
      currentLocation,
      currentZoom,
      layerGroup,
      layerPrefs,
      myUserId,
      playerDisplayPrefs,
      state,
    });
  }, [currentHex, currentLocation, currentZoom, inactiveHexKeySet, layerPrefs, myUserId, playerDisplayPrefs, renderedGrid, selectedHex, state]);

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

  return (
    <div className={`game-map-container time-${timePeriod}`}>
      <div ref={containerRef} className="leaflet-map" />
      {layerPrefs.timeOverlay && <TimeOverlay timePeriod={timePeriod} />}
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

