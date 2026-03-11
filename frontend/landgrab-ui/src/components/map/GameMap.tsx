import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GameState, HexCell } from '../../types/game';
import { latLngToRoomHex, roomHexCornerLatLngs, roomHexToLatLng } from './HexMath';

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
}

const FALLBACK_CENTER: [number, number] = [51.505, -0.09];

export function GameMap({ state, myUserId, currentLocation, onHexClick, selectedHex = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const geometryKeyRef = useRef('');
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
      state.tileSizeMeters
    );
  }, [currentLocation, state.mapLat, state.mapLng, state.tileSizeMeters]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(containerRef.current, {
      center: initialCenterRef.current,
      zoom: 16,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      geometryKeyRef.current = '';
    };
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
    const map = mapRef.current;
    if (!map || state.mapLat == null || state.mapLng == null) {
      return;
    }

    const geometryKey = `${state.mapLat}:${state.mapLng}:${state.tileSizeMeters}:${state.gridRadius}`;
    if (geometryKeyRef.current === geometryKey) {
      return;
    }

    geometryKeyRef.current = geometryKey;

    const points = Object.values(state.grid)
      .flatMap(cell => roomHexCornerLatLngs(cell.q, cell.r, state.mapLat!, state.mapLng!, state.tileSizeMeters))
      .map(([lat, lng]) => L.latLng(lat, lng));

    if (points.length === 0) {
      map.setView([state.mapLat, state.mapLng], 16);
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [state.grid, state.gridRadius, state.mapLat, state.mapLng, state.tileSizeMeters]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup || state.mapLat == null || state.mapLng == null) {
      return;
    }

    layerGroup.clearLayers();

    const hostPlayer = state.players.find(player => player.isHost);
    const hostColor = hostPlayer?.allianceColor ?? hostPlayer?.color ?? '#f1c40f';

    for (const cell of Object.values(state.grid)) {
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
      const fillColor = cell.isMasterTile
        ? hostColor
        : cell.ownerColor ?? '#9fb3c8';
      const fillOpacity = cell.isMasterTile ? 0.45 : cell.ownerId ? (isMine ? 0.72 : 0.5) : 0.30;
      let borderColor = cell.ownerId ? '#dfe6e9' : '#7f8c8d';
      let borderWeight = cell.ownerId ? 1 : 1.5;

      if (cell.isMasterTile) {
        borderColor = '#f1c40f';
        borderWeight = 3;
      }
      if (isCurrentHex) {
        borderColor = '#2ecc71';
        borderWeight = Math.max(borderWeight, 3);
      }
      if (isSelected) {
        borderColor = '#ffffff';
        borderWeight = Math.max(borderWeight, 4);
      }

      const polygon = L.polygon(corners, {
        color: borderColor,
        weight: borderWeight,
        opacity: cell.ownerId || cell.isMasterTile ? 0.95 : 0.80,
        fillColor,
        fillOpacity
      });

      polygon.bindTooltip(buildHexTooltip(cell), { sticky: true });
      if (onHexClick) {
        polygon.on('click', () => onHexClick(cell.q, cell.r, cell));
      }
      polygon.addTo(layerGroup);

      if (cell.troops > 0 || cell.isMasterTile) {
        L.marker([centerLat, centerLng], {
          icon: L.divIcon({
            className: 'hex-label-wrapper',
            html: `<div class="hex-label${cell.isMasterTile ? ' master' : ''}">${cell.isMasterTile ? '👑 ' : ''}${cell.troops}</div>`
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

      marker.bindTooltip(player.id === myUserId ? `${player.name} (You)` : player.name, {
        permanent: true,
        direction: 'top',
        offset: [0, -6],
        className: 'player-location-label'
      });
    }
  }, [currentHex, currentLocation, myUserId, onHexClick, selectedHex, state]);

  return (
    <div className="game-map-container">
      <div ref={containerRef} className="leaflet-map" />
    </div>
  );
}

function buildHexTooltip(cell: HexCell): string {
  const owner = cell.ownerName ?? 'Unclaimed';
  const masterLabel = cell.isMasterTile ? ' | Master Tile' : '';
  return `${owner} | Troops: ${cell.troops}${masterLabel}`;
}
