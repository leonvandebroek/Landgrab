import L from 'leaflet';
import i18n from '../../../i18n';
import type { GameState } from '../../../types/game';
import type { MapLayerPreferences } from '../../../types/mapLayerPreferences';
import {
  DEFAULT_PLAYER_PREFS,
  MARKER_SIZE_MULTIPLIER,
  type PlayerDisplayPreferences,
} from '../../../types/playerPreferences';
import { roomHexToLatLng } from '../../map/HexMath';
import { escapeHtml } from './HexTooltip';

const DEFAULT_PLAYER_MARKER_COLOR = '#4f8cff';

interface RenderPlayerMarkersOptions {
  currentLocation: { lat: number; lng: number } | null;
  currentZoom: number;
  layerGroup: L.LayerGroup;
  layerPrefs: MapLayerPreferences;
  myUserId: string;
  playerDisplayPrefs?: PlayerDisplayPreferences;
  state: GameState;
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

export function renderPlayerMarkers({
  currentLocation,
  currentZoom,
  layerGroup,
  layerPrefs,
  myUserId,
  playerDisplayPrefs,
  state,
}: RenderPlayerMarkersOptions): void {
  const shouldShowPlayerMarkers = layerPrefs.playerMarkers;
  const shouldShowPlayerRadius = layerPrefs.playerRadius;

  if (!shouldShowPlayerMarkers && !shouldShowPlayerRadius) {
    return;
  }

  const effectivePlayerDisplayPrefs = playerDisplayPrefs ?? DEFAULT_PLAYER_PREFS;
  const playerMarkerSizeMultiplier = MARKER_SIZE_MULTIPLIER[effectivePlayerDisplayPrefs.markerSize] ?? 1;
  const markerZoomScale = getMarkerZoomScale(currentZoom);
  const myPlayer = state.players.find(player => player.id === myUserId);

  for (const player of state.players) {
    if (player.currentLat == null || player.currentLng == null) {
      continue;
    }

    const markerColor = player.allianceColor ?? player.color ?? DEFAULT_PLAYER_MARKER_COLOR;

    if (shouldShowPlayerMarkers) {
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
        className: 'player-location-label',
      });

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

    if (shouldShowPlayerRadius && player.id === myUserId) {
      L.circleMarker([player.currentLat, player.currentLng], {
        radius: 20 * markerZoomScale,
        color: markerColor,
        weight: 2,
        fillColor: markerColor,
        fillOpacity: 0.1,
        interactive: false,
        className: 'player-pulse-ring',
      }).addTo(layerGroup);

      if (currentLocation) {
        L.circle([currentLocation.lat, currentLocation.lng], {
          radius: state.tileSizeMeters * 1.2,
          color: markerColor,
          weight: 1.5,
          dashArray: '6 4',
          fillColor: markerColor,
          fillOpacity: 0.04,
          interactive: false,
          className: 'claim-radius-ring',
        }).addTo(layerGroup);
      }
    }

    if (shouldShowPlayerRadius && player.isBeacon && player.beaconLat != null && player.beaconLng != null) {
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
  }

  if (shouldShowPlayerMarkers && myPlayer?.isCommandoActive && myPlayer.commandoTargetQ != null && myPlayer.commandoTargetR != null) {
    const [targetLat, targetLng] = roomHexToLatLng(
      myPlayer.commandoTargetQ,
      myPlayer.commandoTargetR,
      state.mapLat!,
      state.mapLng!,
      state.tileSizeMeters,
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
      fillOpacity: 0.95,
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
