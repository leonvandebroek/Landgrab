import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GameState, HexCell } from '../../types/game';
import { latLngToRoomHex, roomHexCornerLatLngs, roomHexToLatLng } from './HexMath';
import { createPdokBaseLayers, MAP_MAX_ZOOM } from './pdokLayers';
import { terrainFillColors, terrainFillOpacity } from '../../utils/terrainColors';

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
}

const FALLBACK_CENTER: [number, number] = [51.505, -0.09];
const GRID_FIT_PADDING = L.point(24, 24);

export function GameMap({
  state,
  myUserId,
  currentLocation,
  onHexClick,
  selectedHex = null,
  constrainViewportToGrid = false,
  gridOverride,
  inactiveHexKeys = [],
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const followedLocationKeyRef = useRef('');
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const baseLayerControlRef = useRef<L.Control.Layers | null>(null);
  const geometryKeyRef = useRef('');
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const onHexClickRef = useRef(onHexClick);
  useEffect(() => { onHexClickRef.current = onHexClick; });

  const initialCenterRef = useRef<[number, number]>(
    state.mapLat != null && state.mapLng != null ? [state.mapLat, state.mapLng] : FALLBACK_CENTER
  );

  function handleZoomToLocation() {
    const map = mapRef.current;
    if (map && currentLocation) {
      map.setView([currentLocation.lat, currentLocation.lng], Math.max(map.getZoom(), 17));
    }
  }

  const currentHex = useMemo(() => {
    if (!currentLocation || state.mapLat == null || state.mapLng == null) {
      return null;
    }

    return latLngToRoomHex(
      currentLocation.lat,
      currentLocation.lng,
      state.mapLat,
      state.mapLng,
      state.tileSizeMeters
    );
  }, [currentLocation, state.mapLat, state.mapLng, state.tileSizeMeters]);

  const renderedGrid = gridOverride ?? state.grid;
  const inactiveHexKeySet = useMemo(() => new Set(inactiveHexKeys), [inactiveHexKeys]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      maxZoom: MAP_MAX_ZOOM,
      maxBoundsViscosity: constrainViewportToGrid ? 1 : undefined,
      zoom: 16,
      zoomControl: false
    });

    const { brtStandard, brtGray, top25 } = createPdokBaseLayers();
    top25.addTo(map);
    baseLayerControlRef.current = L.control.layers({
      [t('map.layerTopo')]: top25,
      [t('map.layerStandard')]: brtStandard,
      [t('map.layerGray')]: brtGray,
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Track pointer start to distinguish taps from pans/zooms
    map.getContainer().addEventListener('pointerdown', (e: PointerEvent) => {
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
    }, { passive: true });

    return () => {
      baseLayerControlRef.current?.remove();
      baseLayerControlRef.current = null;
      map.stop();
      map.off();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      geometryKeyRef.current = '';
    };
  }, [constrainViewportToGrid, t]);

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
      easeLinearity: 0.25
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
      map.setView([state.mapLat, state.mapLng], 16, { animate: false });
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

    layerGroup.clearLayers();

    const hostPlayer = state.players.find(player => player.isHost);
    const hostColor = hostPlayer?.allianceColor ?? hostPlayer?.color ?? '#f1c40f';
    const myPlayer = state.players.find(p => p.id === myUserId);

    for (const cell of Object.values(renderedGrid)) {
      const cellKey = `${cell.q},${cell.r}`;
      const corners = roomHexCornerLatLngs(
        cell.q,
        cell.r,
        state.mapLat,
        state.mapLng,
        state.tileSizeMeters
      );
      const [centerLat, centerLng] = roomHexToLatLng(
        cell.q,
        cell.r,
        state.mapLat,
        state.mapLng,
        state.tileSizeMeters
      );

      const isMine = cell.ownerId === myUserId;
      const isCurrentHex = currentHex?.[0] === cell.q && currentHex?.[1] === cell.r;
      const isSelected = selectedHex?.[0] === cell.q && selectedHex?.[1] === cell.r;
      const isInactive = inactiveHexKeySet.has(cellKey);

      // Terrain underlay
      if (state.dynamics?.terrainEnabled && cell.terrainType && cell.terrainType !== 'None') {
        L.polygon(corners, {
          color: 'transparent',
          weight: 0,
          fillColor: terrainFillColors[cell.terrainType],
          fillOpacity: isInactive ? 0 : terrainFillOpacity[cell.terrainType],
          interactive: false,
        }).addTo(layerGroup);
      }

      const fillColor = cell.isMasterTile
        ? hostColor
        : cell.ownerColor ?? (isInactive ? '#e5edf6' : '#9fc4e8');
      const fillOpacity = isInactive
        ? 0.08
        : cell.isMasterTile
          ? 0.58
          : cell.ownerId
            ? (isMine ? 0.82 : 0.62)
            : 0.22;
      let borderColor = cell.ownerId ? '#f7fbff' : (isInactive ? 'rgba(214, 228, 244, 0.75)' : '#d7e7f6');
      let borderWeight = cell.ownerId ? 2.25 : (isInactive ? 1.25 : 1.8);
      let dashArray: string | undefined;

      if (cell.isMasterTile) {
        borderColor = '#f1c40f';
        borderWeight = 3.25;
      }
      if (isCurrentHex) {
        borderColor = '#2ecc71';
        borderWeight = Math.max(borderWeight, 3);
      }
      if (isSelected) {
        borderColor = '#ffffff';
        borderWeight = Math.max(borderWeight, 4);
      }
      if (isInactive) {
        dashArray = '6 6';
      }

      const classNames = [
        'hex-polygon',
        cell.isMasterTile ? 'is-master' : '',
        cell.ownerId ? 'is-owned' : 'is-neutral',
        isMine ? 'is-mine' : '',
        isCurrentHex ? 'is-current' : '',
        isSelected ? 'is-selected' : '',
        isInactive ? 'is-inactive' : '',
      ].filter(Boolean).join(' ');

      const polygon = L.polygon(corners, {
        className: classNames,
        color: borderColor,
        dashArray,
        weight: borderWeight,
        opacity: cell.ownerId || cell.isMasterTile ? 0.95 : 0.80,
        fillColor,
        fillOpacity
      });

      polygon.bindTooltip(buildHexTooltip(cell), { sticky: true });

      // Only fire hex click on genuine taps (not after pan/zoom drag)
      polygon.on('click', (e: L.LeafletMouseEvent) => {
        const down = pointerDownRef.current;
        if (down) {
          const dx = e.originalEvent.clientX - down.x;
          const dy = e.originalEvent.clientY - down.y;
          if (dx * dx + dy * dy > 100) return; // 10px threshold squared
        }
        onHexClickRef.current?.(cell.q, cell.r, cell);
      });

      polygon.addTo(layerGroup);

      if (!isInactive && (cell.troops > 0 || cell.isMasterTile)) {
        // Forest blind: hide enemy troop counts in forest hexes
        const isForestBlind = state.dynamics?.terrainEnabled
          && cell.terrainType === 'Forest'
          && cell.ownerId
          && cell.ownerId !== myUserId
          && !(myPlayer?.allianceId && cell.ownerAllianceId === myPlayer.allianceId);

        const troopLabel = isForestBlind ? '?' : String(cell.troops);

        L.marker([centerLat, centerLng], {
          icon: L.divIcon({
            className: 'hex-label-wrapper',
            html: `<div class="hex-label${cell.isMasterTile ? ' master' : ''}${isForestBlind ? ' forest-blind' : ''}">${cell.isMasterTile ? '👑 ' : ''}${troopLabel}</div>`
          }),
          interactive: false
        }).addTo(layerGroup);
      }
    }

    for (const player of state.players) {
      if (player.currentLat == null || player.currentLng == null) {
        continue;
      }

      const marker = L.circleMarker([player.currentLat, player.currentLng], {
        radius: player.id === myUserId ? 7 : 5,
        color: '#ffffff',
        weight: 2,
        fillColor: player.allianceColor ?? player.color,
        fillOpacity: 0.95
      }).addTo(layerGroup);

      marker.bindTooltip(player.id === myUserId ? `${player.name}${i18n.t('map.youSuffix')}` : player.name, {
        permanent: true,
        direction: 'top',
        offset: [0, -6],
        className: 'player-location-label'
      });
    }
  }, [currentHex, currentLocation, inactiveHexKeySet, myUserId, renderedGrid, selectedHex, state]);

  return (
    <div className="game-map-container">
      <div ref={containerRef} className="leaflet-map" />
      <div className="game-map-controls" role="group" aria-label={t('game.mapControlsLabel')}>
        <button
          type="button"
          className={`map-control-fab${isFollowingMe ? ' is-active' : ''}`}
          onClick={() => setIsFollowingMe(enabled => !enabled)}
          title={isFollowingMe ? t('game.disableFollowMe') : t('game.enableFollowMe')}
          aria-label={isFollowingMe ? t('game.disableFollowMe') : t('game.enableFollowMe')}
          aria-pressed={isFollowingMe ? 'true' : 'false'}
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
    </div>
  );
}

function buildHexTooltip(cell: HexCell): string {
  const owner = cell.ownerName ?? i18n.t('map.unclaimed');
  const terrainSuffix = cell.terrainType && cell.terrainType !== 'None'
    ? ` · ${i18n.t(`terrain.${cell.terrainType}` as never)}`
    : '';
  if (cell.isMasterTile) {
    return i18n.t('map.hexTooltipMaster', { owner, count: cell.troops }) + terrainSuffix;
  }
  return i18n.t('map.hexTooltip', { owner, count: cell.troops }) + terrainSuffix;
}
