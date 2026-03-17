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
  isTacticalStrikeActive: boolean;
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
  const myPlayer = state.players.find((player) => player.id === myUserId);

  for (const player of state.players) {
    const isMe = player.id === myUserId;
    const effectiveLat = isMe && currentLocation ? currentLocation.lat : player.currentLat;
    const effectiveLng = isMe && currentLocation ? currentLocation.lng : player.currentLng;

    if (effectiveLat == null || effectiveLng == null) {
      continue;
    }

    const markerColor = player.allianceColor ?? player.color ?? DEFAULT_PLAYER_MARKER_COLOR;

    if (shouldShowPlayerMarkers) {
      const { layer: marker, tooltipOffset } = createPlayerMarkerLayer({
        color: markerColor,
        lat: effectiveLat,
        lng: effectiveLng,
        markerSizeMultiplier: playerMarkerSizeMultiplier,
        markerStyle: effectivePlayerDisplayPrefs.markerStyle,
        myUserId,
        isTacticalStrikeActive: Boolean(player.tacticalStrikeActive),
        player,
        zoomScale: markerZoomScale,
      });

      marker.addTo(layerGroup);

      const displayName = player.id === myUserId
        ? `${player.name}${i18n.t('map.youSuffix')}`
        : player.name;
      const tooltipContent = player.emoji?.trim()
        ? `${player.emoji.trim()} ${displayName}`
        : displayName;

      marker.bindTooltip(tooltipContent, {
        permanent: effectivePlayerDisplayPrefs.showNameLabel,
        direction: 'top',
        offset: tooltipOffset,
        className: 'player-location-label',
      });
    }

    if (shouldShowPlayerRadius && isMe) {
      L.circleMarker([effectiveLat, effectiveLng], {
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

    const shouldShowBeacon = myPlayer?.allianceId != null
      ? player.allianceId === myPlayer.allianceId
      : player.id === myUserId;

    if (shouldShowBeacon && player.isBeacon && player.beaconLat != null && player.beaconLng != null) {
      L.circle([player.beaconLat, player.beaconLng], {
        radius: state.tileSizeMeters * 2.5,
        color: player.allianceColor ?? player.color,
        weight: 2,
        dashArray: '8 4',
        fillColor: player.allianceColor ?? player.color,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(layerGroup);

      L.circleMarker([player.beaconLat, player.beaconLng], {
        radius: 16,
        color: player.allianceColor ?? player.color,
        weight: 2,
        fillColor: player.allianceColor ?? player.color,
        fillOpacity: 0.16,
        interactive: false,
        className: 'beacon-pulse-ring',
      }).addTo(layerGroup);
    }

    if (player.isCommandoActive && player.commandoTargetQ != null && player.commandoTargetR != null) {
      const [targetLat, targetLng] = roomHexToLatLng(
        player.commandoTargetQ,
        player.commandoTargetR,
        state.mapLat!,
        state.mapLng!,
        state.tileSizeMeters,
      );

      L.polyline([[effectiveLat, effectiveLng], [targetLat, targetLng]], {
        color: '#ff5a4f',
        weight: 3,
        opacity: 0.9,
        dashArray: '8 8',
        interactive: false,
        className: 'commando-raid-path',
      }).addTo(layerGroup);

      L.circleMarker([targetLat, targetLng], {
        radius: 11,
        color: '#ff5a4f',
        weight: 3,
        fillColor: '#ff5a4f',
        fillOpacity: 0.16,
        interactive: false,
        className: 'commando-target-ring',
      }).addTo(layerGroup);
    }
  }
}

function createPlayerMarkerLayer({
  player,
  myUserId,
  markerStyle,
  markerSizeMultiplier,
  zoomScale,
  color,
  isTacticalStrikeActive,
  lat,
  lng,
}: PlayerMarkerLayerOptions): PlayerMarkerLayerResult {
  const isCurrentPlayer = player.id === myUserId;
  const selfBoost = isCurrentPlayer ? 1.15 : 1;
  const scale = markerSizeMultiplier * zoomScale * selfBoost;
  const emoji = normalizeEmoji(player.emoji);
  const markerEffectClassName = isTacticalStrikeActive ? ' tactical-strike-active' : '';

  if (markerStyle === 'pin') {
    const width = Math.round(24 * scale);
    const height = Math.round(36 * scale);
    return {
      layer: L.marker([lat, lng], {
        icon: L.divIcon({
          className: `player-marker-icon player-marker-pin-wrapper${markerEffectClassName}`,
          html: buildPinMarkerHtml(color, width, height, emoji),
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
          className: `player-marker-icon player-marker-avatar-wrapper${markerEffectClassName}`,
          html: buildAvatarMarkerHtml(color, getPlayerInitial(player.name), size, emoji),
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
          className: `player-marker-icon player-marker-flag-wrapper${markerEffectClassName}`,
          html: buildFlagMarkerHtml(color, width, height, emoji),
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
  const diameter = radius * 2;

  return {
    layer: L.marker([lat, lng], {
      icon: L.divIcon({
        className: `player-marker-icon player-marker-dot-wrapper${markerEffectClassName}`,
        html: buildDotMarkerHtml(color, diameter, emoji),
        iconSize: [diameter, diameter],
        iconAnchor: [radius, radius],
        tooltipAnchor: [0, -Math.round(radius * 1.5)],
      }),
      keyboard: false,
      zIndexOffset: isCurrentPlayer ? 220 : 140,
    }),
    tooltipOffset: [0, -Math.max(6, radius + 2)],
  };
}

function buildPinMarkerHtml(color: string, width: number, height: number, emoji: string | null): string {
  const safeColor = escapeHtml(color);
  return buildMarkerWrapperHtml(
    `<div class="player-marker-pin"><svg width="${width}" height="${height}" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${safeColor}"/><circle cx="12" cy="12" r="5" fill="white" opacity="0.5"/></svg></div>`,
    buildEmojiBadgeHtml(emoji, Math.max(14, Math.round(width * 0.52)), 'right:-4px;top:-2px;'),
  );
}

function buildAvatarMarkerHtml(color: string, letter: string, size: number, emoji: string | null): string {
  const safeColor = escapeHtml(color);
  const safeLetter = escapeHtml(letter);
  const fontSize = Math.round(size * 0.5);
  return buildMarkerWrapperHtml(
    `<div class="player-marker-avatar" style="width:${size}px;height:${size}px;border-radius:50%;background:${safeColor};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:${fontSize}px;border:2px solid white">${safeLetter}</div>`,
    buildEmojiBadgeHtml(emoji, Math.max(14, Math.round(size * 0.6)), 'right:-5px;top:-5px;'),
  );
}

function buildFlagMarkerHtml(color: string, width: number, height: number, emoji: string | null): string {
  const safeColor = escapeHtml(color);
  return buildMarkerWrapperHtml(
    `<div class="player-marker-flag"><svg width="${width}" height="${height}" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><line x1="3" y1="2" x2="3" y2="26" stroke="white" stroke-width="2"/><polygon points="5,2 20,7 5,14" fill="${safeColor}"/></svg></div>`,
    buildEmojiBadgeHtml(emoji, Math.max(14, Math.round(width * 0.7)), 'right:-7px;top:-1px;'),
  );
}

function buildDotMarkerHtml(color: string, size: number, emoji: string | null): string {
  const safeColor = escapeHtml(color);
  return buildMarkerWrapperHtml(
    `<div class="player-marker-dot" style="width:${size}px;height:${size}px;border-radius:50%;background:${safeColor};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.25)"></div>`,
    buildEmojiBadgeHtml(emoji, Math.max(14, Math.round(size * 1.4)), 'right:-8px;top:-8px;'),
  );
}

function buildMarkerWrapperHtml(baseHtml: string, badgeHtml: string): string {
  return `<div style="position:relative;display:inline-flex;align-items:flex-start;justify-content:center">${baseHtml}${badgeHtml}</div>`;
}

function buildEmojiBadgeHtml(emoji: string | null, size: number, positionStyle: string): string {
  if (!emoji) {
    return '';
  }

  const safeEmoji = escapeHtml(emoji);
  return `<span aria-hidden="true" style="position:absolute;${positionStyle}display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:999px;background:rgba(255,255,255,0.95);box-shadow:0 1px 3px rgba(0,0,0,0.25);font-size:${Math.max(10, Math.round(size * 0.7))}px;line-height:1">${safeEmoji}</span>`;
}

function normalizeEmoji(emoji?: string): string | null {
  const trimmedEmoji = emoji?.trim();
  return trimmedEmoji ? trimmedEmoji : null;
}

function getPlayerInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function getMarkerZoomScale(zoom: number): number {
  return Math.max(0.85, Math.min(1.2, 0.85 + (zoom - 14) * 0.08));
}
