import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GameState, HexCell } from '../../types/game';
import {
  DEFAULT_PLAYER_PREFS,
  MARKER_SIZE_MULTIPLIER,
  type PlayerDisplayPreferences,
} from '../../types/playerPreferences';
import { latLngToRoomHex, roomHexCornerLatLngs, roomHexToLatLng } from './HexMath';
import { createPdokBaseLayers, MAP_MAX_ZOOM } from './pdokLayers';
import { terrainFillColors, terrainFillOpacity } from '../../utils/terrainColors';
import { terrainIcons } from '../../utils/terrainIcons';

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
}

const FALLBACK_CENTER: [number, number] = [51.505, -0.09];
const GRID_FIT_PADDING = L.point(24, 24);
const DEFAULT_MAP_ZOOM = 16;
const TERRAIN_ICON_MIN_ZOOM = 15;
const DEFAULT_PLAYER_MARKER_COLOR = '#4f8cff';

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
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [isFollowingMe, setIsFollowingMe] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_MAP_ZOOM);
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
      zoom: DEFAULT_MAP_ZOOM,
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
    const effectivePlayerDisplayPrefs = playerDisplayPrefs ?? DEFAULT_PLAYER_PREFS;
    const playerMarkerSizeMultiplier = MARKER_SIZE_MULTIPLIER[effectivePlayerDisplayPrefs.markerSize] ?? 1;
    const markerZoomScale = getMarkerZoomScale(currentZoom);
    const showTerrainIcons = currentZoom >= TERRAIN_ICON_MIN_ZOOM;

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
      const terrainType = cell.terrainType ?? 'None';
      const terrainIcon = terrainIcons[terrainType];

      // Phase 7: Fog of War — hidden hexes appear as dark/unknown
      const isFogHidden = state.dynamics?.fogOfWarEnabled
        && !cell.ownerId
        && !cell.isMasterTile
        && cell.troops === 0
        && !isInactive;

      // Terrain underlay
      if (state.dynamics?.terrainEnabled && terrainType !== 'None') {
        L.polygon(corners, {
          color: 'transparent',
          weight: 0,
          fillColor: terrainFillColors[terrainType],
          fillOpacity: isInactive ? 0 : terrainFillOpacity[terrainType],
          interactive: false,
        }).addTo(layerGroup);

        if (showTerrainIcons && terrainIcon && !isFogHidden && !isInactive) {
          L.marker([centerLat, centerLng], {
            icon: L.divIcon({
              className: 'hex-terrain-icon',
              html: `<span aria-hidden="true">${terrainIcon}</span>`,
              iconSize: [22, 22],
              iconAnchor: [11, 7],
            }),
            interactive: false,
            keyboard: false,
            zIndexOffset: -30,
          }).addTo(layerGroup);
        }
      }

      const fillColor = isFogHidden
        ? '#1a1a2e'
        : cell.isMasterTile
          ? hostColor
          : cell.ownerColor ?? (isInactive ? '#e5edf6' : '#9fc4e8');
      const fillOpacity = isFogHidden
        ? 0.7
        : isInactive
          ? 0.08
          : cell.isMasterTile
            ? 0.58
            : cell.ownerId
              ? (isMine ? 0.82 : 0.62)
              : 0.22;
      let borderColor = cell.ownerId
        ? '#f7fbff'
        : (isInactive
          ? 'rgba(100, 130, 170, 0.6)'
          : (isFogHidden ? '#d7e7f6' : 'rgba(30, 60, 100, 0.8)'));
      let borderWeight = cell.ownerId ? 3 : (isInactive ? 1.25 : 2.5);
      let borderOpacity = cell.ownerId || cell.isMasterTile ? 0.95 : ((isInactive || isFogHidden) ? 0.8 : 0.92);
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
      if (cell.isFortified && !isInactive) {
        borderColor = '#f39c12';
        borderWeight = Math.max(borderWeight, 3);
      }
      if (cell.isFort && !isInactive) {
        borderColor = '#8e44ad';
        borderWeight = Math.max(borderWeight, 3.5);
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
        cell.isFortified ? 'is-fortified' : '',
      ].filter(Boolean).join(' ');

      const polygon = L.polygon(corners, {
        className: classNames,
        color: borderColor,
        dashArray,
        weight: borderWeight,
        opacity: borderOpacity,
        fillColor,
        fillOpacity
      });

      polygon.bindTooltip(
        isFogHidden ? i18n.t('phase7.hiddenHex') : buildHexTooltip(cell),
        { sticky: true }
      );

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

      // Phase 10: PresenceBattle — contest progress ring
      if (cell.contestProgress != null && cell.contestProgress > 0 && !isInactive && !isFogHidden) {
        const progressRadius = state.tileSizeMeters * 0.3;
        L.circle([centerLat, centerLng], {
          radius: progressRadius,
          color: '#e74c3c',
          weight: 3,
          fillColor: '#e74c3c',
          fillOpacity: cell.contestProgress * 0.4,
          interactive: false,
        }).addTo(layerGroup);
      }

      if (!isInactive && !isFogHidden && (cell.troops > 0 || cell.isMasterTile)) {
        // Forest blind: hide enemy troop counts in forest hexes
        const isForestBlind = state.dynamics?.terrainEnabled
          && cell.terrainType === 'Forest'
          && cell.ownerId
          && cell.ownerId !== myUserId
          && !(myPlayer?.allianceId && cell.ownerAllianceId === myPlayer.allianceId);

        const troopLabel = isForestBlind ? '?' : String(cell.troops);
        const isHQ = state.alliances.some(a => a.hqHexQ === cell.q && a.hqHexR === cell.r);
        const hqPrefix = isHQ ? '🏛️ ' : '';

        L.marker([centerLat, centerLng], {
          icon: L.divIcon({
            className: 'hex-label-wrapper',
            html: `<div class="hex-label${cell.isMasterTile ? ' master' : ''}${isForestBlind ? ' forest-blind' : ''}">${cell.isMasterTile ? '👑 ' : ''}${hqPrefix}${troopLabel}</div>`
          }),
          interactive: false
        }).addTo(layerGroup);
      }
    }

    for (const player of state.players) {
      if (player.currentLat == null || player.currentLng == null) {
        continue;
      }

      const markerColor = player.allianceColor ?? player.color ?? DEFAULT_PLAYER_MARKER_COLOR;
      const { layer: marker, tooltipOffset } = createPlayerMarkerLayer({
        color: markerColor,
        lat: player.currentLat,
        lng: player.currentLng,
        markerSizeMultiplier: playerMarkerSizeMultiplier,
        markerStyle: effectivePlayerDisplayPrefs.markerStyle,
        myUserId,
        player,
        zoomScale: markerZoomScale,
      });

      marker.addTo(layerGroup);

      marker.bindTooltip(player.id === myUserId ? `${player.name}${i18n.t('map.youSuffix')}` : player.name, {
        permanent: effectivePlayerDisplayPrefs.showNameLabel,
        direction: 'top',
        offset: tooltipOffset,
        className: 'player-location-label'
      });

      // Phase 6: Prey indicator
      if (player.isPrey) {
        L.circleMarker([player.currentLat, player.currentLng], {
          radius: 12,
          color: '#e74c3c',
          weight: 2,
          dashArray: '4 4',
          fillColor: 'transparent',
          fillOpacity: 0,
          interactive: false,
        }).addTo(layerGroup);
      }

      // Phase 5: Beacon indicator
      if (player.isBeacon && player.beaconLat != null && player.beaconLng != null) {
        L.circle([player.beaconLat, player.beaconLng], {
          radius: state.tileSizeMeters * 2.5,
          color: player.allianceColor ?? player.color,
          weight: 2,
          dashArray: '8 4',
          fillColor: player.allianceColor ?? player.color,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(layerGroup);
      }

      // Phase 10: Detained (hostage) indicator
      if (player.heldByPlayerId) {
        L.circleMarker([player.currentLat, player.currentLng], {
          radius: 14,
          color: '#95a5a6',
          weight: 3,
          dashArray: '2 4',
          fillColor: 'transparent',
          fillOpacity: 0,
          interactive: false,
        }).addTo(layerGroup);
      }
    }

    // Phase 6: CommandoRaid target indicator
    if (myPlayer?.isCommandoActive && myPlayer.commandoTargetQ != null && myPlayer.commandoTargetR != null) {
      const [targetLat, targetLng] = roomHexToLatLng(
        myPlayer.commandoTargetQ, myPlayer.commandoTargetR,
        state.mapLat!, state.mapLng!, state.tileSizeMeters
      );
      L.circleMarker([targetLat, targetLng], {
        radius: 10,
        color: '#e74c3c',
        weight: 3,
        fillColor: '#e74c3c',
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(layerGroup);
    }
  }, [currentHex, currentLocation, currentZoom, inactiveHexKeySet, myUserId, playerDisplayPrefs, renderedGrid, selectedHex, state]);

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
  const fortSuffix = cell.isFort ? ` · 🏰 ${i18n.t('map.fort')}` : '';
  const npcSuffix = cell.ownerId === 'NPC' ? ` · 🤖 ${i18n.t('map.npcLabel')}` : '';
  if (cell.isMasterTile) {
    return i18n.t('map.hexTooltipMaster', { owner, count: cell.troops }) + terrainSuffix + fortSuffix + npcSuffix;
  }
  return i18n.t('map.hexTooltip', { owner, count: cell.troops }) + terrainSuffix + fortSuffix + npcSuffix;
}

interface PlayerMarkerLayerOptions {
  player: GameState['players'][number];
  myUserId: string;
  markerStyle: PlayerDisplayPreferences['markerStyle'];
  markerSizeMultiplier: number;
  zoomScale: number;
  color: string;
  lat: number;
  lng: number;
}

interface PlayerMarkerLayerResult {
  layer: L.CircleMarker | L.Marker;
  tooltipOffset: L.PointExpression;
}

function createPlayerMarkerLayer({
  player,
  myUserId,
  markerStyle,
  markerSizeMultiplier,
  zoomScale,
  color,
  lat,
  lng,
}: PlayerMarkerLayerOptions): PlayerMarkerLayerResult {
  const isCurrentPlayer = player.id === myUserId;
  const selfBoost = isCurrentPlayer ? 1.15 : 1;
  const scale = markerSizeMultiplier * zoomScale * selfBoost;

  if (markerStyle === 'pin') {
    const width = Math.round(24 * scale);
    const height = Math.round(36 * scale);
    return {
      layer: L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'player-marker-icon player-marker-pin-wrapper',
          html: buildPinMarkerHtml(color, width, height),
          iconSize: [width, height],
          iconAnchor: [Math.round(width / 2), Math.max(1, height - 2)],
          tooltipAnchor: [0, -Math.round(height * 0.72)],
        }),
        keyboard: false,
        zIndexOffset: isCurrentPlayer ? 220 : 140,
      }),
      tooltipOffset: [0, -Math.max(12, Math.round(height * 0.72))],
    };
  }

  if (markerStyle === 'avatar') {
    const size = Math.round(24 * scale);
    return {
      layer: L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'player-marker-icon player-marker-avatar-wrapper',
          html: buildAvatarMarkerHtml(color, getPlayerInitial(player.name), size),
          iconSize: [size, size],
          iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
          tooltipAnchor: [0, -Math.round(size * 0.7)],
        }),
        keyboard: false,
        zIndexOffset: isCurrentPlayer ? 220 : 140,
      }),
      tooltipOffset: [0, -Math.max(10, Math.round(size * 0.7))],
    };
  }

  if (markerStyle === 'flag') {
    const width = Math.round(20 * scale);
    const height = Math.round(28 * scale);
    return {
      layer: L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'player-marker-icon player-marker-flag-wrapper',
          html: buildFlagMarkerHtml(color, width, height),
          iconSize: [width, height],
          iconAnchor: [3, Math.max(1, height - 2)],
          tooltipAnchor: [Math.round(width * 0.35), -Math.round(height * 0.8)],
        }),
        keyboard: false,
        zIndexOffset: isCurrentPlayer ? 220 : 140,
      }),
      tooltipOffset: [Math.round(width * 0.2), -Math.max(12, Math.round(height * 0.78))],
    };
  }

  const radius = Math.max(4, Math.round((isCurrentPlayer ? 7 : 5) * markerSizeMultiplier * zoomScale));
  return {
    layer: L.circleMarker([lat, lng], {
      radius,
      color: '#ffffff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.95
    }),
    tooltipOffset: [0, -Math.max(6, radius + 2)],
  };
}

function buildPinMarkerHtml(color: string, width: number, height: number): string {
  const safeColor = escapeHtml(color);
  return `<div class="player-marker-pin"><svg width="${width}" height="${height}" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${safeColor}"/><circle cx="12" cy="12" r="5" fill="white" opacity="0.5"/></svg></div>`;
}

function buildAvatarMarkerHtml(color: string, letter: string, size: number): string {
  const safeColor = escapeHtml(color);
  const safeLetter = escapeHtml(letter);
  const fontSize = Math.round(size * 0.5);
  return `<div class="player-marker-avatar" style="width:${size}px;height:${size}px;border-radius:50%;background:${safeColor};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:${fontSize}px;border:2px solid white">${safeLetter}</div>`;
}

function buildFlagMarkerHtml(color: string, width: number, height: number): string {
  const safeColor = escapeHtml(color);
  return `<div class="player-marker-flag"><svg width="${width}" height="${height}" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="3" y1="2" x2="3" y2="26" stroke="white" stroke-width="2"/><polygon points="5,2 20,7 5,14" fill="${safeColor}"/></svg></div>`;
}

function getPlayerInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function getMarkerZoomScale(zoom: number): number {
  return Math.max(0.85, Math.min(1.2, 0.85 + (zoom - 14) * 0.08));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
