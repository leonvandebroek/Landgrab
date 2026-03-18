import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { usePlayerLayerStore } from '../../../stores/playerLayerStore';
import type { Player } from '../../../types/game';
import { ReactSvgOverlay } from '../ReactSvgOverlay';

interface PlayerLayerProps {
  map: L.Map;
}

interface ProjectedPlayer {
  player: Player;
  point: L.Point;
  color: string;
  label: string;
  emoji: string | null;
  initials: string;
  isCurrentUser: boolean;
  width: number;
}

interface ProjectedBeacon {
  key: string;
  point: L.Point;
  color: string;
  label: string;
}

const DEFAULT_PLAYER_COLOR = '#4f8cff';
const OVERLAY_PANE = 'overlayPane';
const PLAYER_PANE = 'game-map-player-pane';
const PLAYER_MARKER_HEIGHT = 40;
const PLAYER_MARKER_MIN_WIDTH = 96;
const PLAYER_MARKER_MAX_WIDTH = 200;

function PlayerLayerComponent({ map }: PlayerLayerProps) {
  const [svgRoot, setSvgRoot] = useState<SVGGElement | null>(null);
  const [projectionTick, setProjectionTick] = useState(0);
  const players = usePlayerLayerStore((state) => state.players);
  const myUserId = usePlayerLayerStore((state) => state.myUserId);

  useEffect(() => {
    const pane = map.getPane(PLAYER_PANE) ? PLAYER_PANE : OVERLAY_PANE;
    const overlay = new ReactSvgOverlay({ pane });
    overlay.addTo(map);
    overlay.getSvg().style.pointerEvents = 'none';
    overlay.getContainer().style.pointerEvents = 'none';
    const frameId = window.requestAnimationFrame(() => {
      setSvgRoot(overlay.getContainer());
      setProjectionTick((tick) => tick + 1);
    });

    const handleProjectionChange = () => {
      setProjectionTick((tick) => tick + 1);
    };

    map.on('zoomend moveend viewreset', handleProjectionChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      overlay.remove();
      map.off('zoomend moveend viewreset', handleProjectionChange);
    };
  }, [map]);

  const projectedPlayers = useMemo<ProjectedPlayer[]>(() => {
    void projectionTick;

    const sortedPlayers = [...players].sort((left, right) => {
      const leftPriority = left.id === myUserId ? 1 : 0;
      const rightPriority = right.id === myUserId ? 1 : 0;
      return leftPriority - rightPriority;
    });

    return sortedPlayers.flatMap((player) => {
      const location = getValidLocation(player.currentLat, player.currentLng);
      if (!location) {
        return [];
      }

      const point = map.latLngToLayerPoint(L.latLng(location[0], location[1]));
      const emoji = normalizeEmoji(player.emoji);
      const label = player.id === myUserId ? `${player.name} (You)` : player.name;

      return [{
        player,
        point,
        color: player.allianceColor ?? player.color ?? DEFAULT_PLAYER_COLOR,
        label,
        emoji,
        initials: getPlayerInitials(player.name),
        isCurrentUser: player.id === myUserId,
        width: getPlayerMarkerWidth(label, Boolean(emoji), Boolean(player.isBeacon)),
      }];
    });
  }, [map, myUserId, players, projectionTick]);

  const projectedBeacons = useMemo<ProjectedBeacon[]>(() => {
    void projectionTick;

    return players.flatMap((player) => {
      if (!player.isBeacon) {
        return [];
      }

      const location = getValidLocation(player.beaconLat, player.beaconLng);
      if (!location) {
        return [];
      }

      return [{
        key: `${player.id}-beacon`,
        point: map.latLngToLayerPoint(L.latLng(location[0], location[1])),
        color: player.allianceColor ?? player.color ?? DEFAULT_PLAYER_COLOR,
        label: `${player.name} beacon`,
      }];
    });
  }, [map, players, projectionTick]);

  if (!svgRoot) {
    return null;
  }

  return createPortal(
    <g className="player-layer" pointerEvents="none">
      {projectedBeacons.map((beacon) => (
        <g key={beacon.key} className="player-layer__beacon" pointerEvents="none">
          <circle
            cx={beacon.point.x}
            cy={beacon.point.y}
            r={18}
            fill={beacon.color}
            fillOpacity={0.08}
            stroke={beacon.color}
            strokeOpacity={0.72}
            strokeDasharray="8 4"
            strokeWidth={2}
          />
          <circle
            cx={beacon.point.x}
            cy={beacon.point.y}
            r={10}
            fill={beacon.color}
            fillOpacity={0.18}
            stroke="#ffffff"
            strokeOpacity={0.95}
            strokeWidth={2}
          />
          <foreignObject
            x={beacon.point.x - 12}
            y={beacon.point.y - 12}
            width={24}
            height={24}
            pointerEvents="none"
          >
            <div
              aria-label={beacon.label}
              style={{
                alignItems: 'center',
                color: '#ffffff',
                display: 'flex',
                fontSize: 14,
                fontWeight: 700,
                height: '100%',
                justifyContent: 'center',
                lineHeight: 1,
                textShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
                width: '100%',
              }}
            >
              📡
            </div>
          </foreignObject>
        </g>
      ))}

      {projectedPlayers.map((projectedPlayer) => {
        const markerX = projectedPlayer.point.x - projectedPlayer.width / 2;
        const markerY = projectedPlayer.point.y - PLAYER_MARKER_HEIGHT / 2;
        const labelColor = projectedPlayer.isCurrentUser ? 'rgba(255, 255, 255, 0.98)' : 'rgba(240, 247, 255, 0.96)';
        const markerBackground = projectedPlayer.isCurrentUser
          ? 'rgba(12, 24, 44, 0.96)'
          : 'rgba(10, 18, 32, 0.92)';
        const markerBorder = projectedPlayer.isCurrentUser
          ? `2px solid ${projectedPlayer.color}`
          : '1px solid rgba(255, 255, 255, 0.18)';
        const markerShadow = projectedPlayer.isCurrentUser
          ? `0 8px 22px rgba(0, 0, 0, 0.42), 0 0 0 3px ${withAlpha(projectedPlayer.color, 0.22)}`
          : '0 6px 18px rgba(0, 0, 0, 0.34)';

        return (
          <foreignObject
            key={projectedPlayer.player.id}
            x={markerX}
            y={markerY}
            width={projectedPlayer.width}
            height={PLAYER_MARKER_HEIGHT}
            pointerEvents="none"
          >
            <div
              style={{
                alignItems: 'center',
                background: markerBackground,
                border: markerBorder,
                borderRadius: 999,
                boxShadow: markerShadow,
                color: labelColor,
                display: 'flex',
                gap: 8,
                height: '100%',
                padding: '0 12px 0 8px',
                width: '100%',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  alignItems: 'center',
                  background: projectedPlayer.color,
                  border: '2px solid rgba(255, 255, 255, 0.95)',
                  borderRadius: '50%',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.28)',
                  color: '#ffffff',
                  display: 'flex',
                  flex: '0 0 auto',
                  fontSize: projectedPlayer.emoji ? 15 : 12,
                  fontWeight: 800,
                  height: 24,
                  justifyContent: 'center',
                  lineHeight: 1,
                  marginTop: 6,
                  width: 24,
                }}
              >
                {projectedPlayer.emoji ?? projectedPlayer.initials}
              </div>
              <div
                style={{
                  display: 'flex',
                  flex: '1 1 auto',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: projectedPlayer.isCurrentUser ? 800 : 700,
                    lineHeight: 1.1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {projectedPlayer.label}
                </div>
              </div>
              {projectedPlayer.player.isBeacon && getValidLocation(projectedPlayer.player.beaconLat, projectedPlayer.player.beaconLng) ? (
                <div
                  aria-label="Beacon enabled"
                  style={{
                    alignItems: 'center',
                    background: withAlpha(projectedPlayer.color, 0.18),
                    border: `1px solid ${withAlpha(projectedPlayer.color, 0.35)}`,
                    borderRadius: 999,
                    color: '#ffffff',
                    display: 'flex',
                    flex: '0 0 auto',
                    fontSize: 12,
                    height: 20,
                    justifyContent: 'center',
                    marginTop: 8,
                    width: 20,
                  }}
                >
                  📡
                </div>
              ) : null}
            </div>
          </foreignObject>
        );
      })}
    </g>,
    svgRoot,
  );
}

function getValidLocation(lat?: number | null, lng?: number | null): [number, number] | null {
  if (lat == null || lng == null || lat === 0 || lng === 0) {
    return null;
  }

  return [lat, lng];
}

function normalizeEmoji(emoji?: string): string | null {
  const trimmedEmoji = emoji?.trim();
  return trimmedEmoji ? trimmedEmoji : null;
}

function getPlayerMarkerWidth(label: string, hasEmoji: boolean, hasBeacon: boolean): number {
  const textWidth = label.length * 7;
  const iconWidth = hasEmoji ? 28 : 26;
  const beaconWidth = hasBeacon ? 24 : 0;
  const width = textWidth + iconWidth + beaconWidth + 34;

  return Math.max(PLAYER_MARKER_MIN_WIDTH, Math.min(PLAYER_MARKER_MAX_WIDTH, width));
}

function getPlayerInitials(name: string): string {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return '?';
  }

  const parts = trimmedName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

function withAlpha(color: string, alpha: number): string {
  const sanitizedColor = color.trim();

  if (sanitizedColor.startsWith('#')) {
    const hex = sanitizedColor.slice(1);
    const expandedHex = hex.length === 3
      ? hex.split('').map((value) => `${value}${value}`).join('')
      : hex;

    if (expandedHex.length === 6) {
      const red = Number.parseInt(expandedHex.slice(0, 2), 16);
      const green = Number.parseInt(expandedHex.slice(2, 4), 16);
      const blue = Number.parseInt(expandedHex.slice(4, 6), 16);

      if (Number.isFinite(red) && Number.isFinite(green) && Number.isFinite(blue)) {
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
      }
    }
  }

  return sanitizedColor;
}

export const PlayerLayer = memo(PlayerLayerComponent);
