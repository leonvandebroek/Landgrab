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
            r={22}
            fill={beacon.color}
            fillOpacity={0.18}
            stroke={beacon.color}
            strokeOpacity={0.72}
            strokeDasharray="8 4"
            strokeWidth={3}
          />
          <circle
            cx={beacon.point.x}
            cy={beacon.point.y}
            r={12}
            fill={beacon.color}
            fillOpacity={0.45}
            stroke="#ffffff"
            strokeOpacity={0.95}
            strokeWidth={3}
          />
          <foreignObject
            x={beacon.point.x - 14}
            y={beacon.point.y - 14}
            width={28}
            height={28}
            pointerEvents="none"
          >
            <div
              aria-label={beacon.label}
              style={{
                alignItems: 'center',
                color: '#ffffff',
                display: 'flex',
                fontSize: 16,
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
        
        // Playful styling variables
        const isMe = projectedPlayer.isCurrentUser;
        const baseColor = projectedPlayer.color;
        
        // Playful Dark Arcade Pill Style
        const markerBackground = isMe
          ? `linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))` // Slate-800 to Slate-900
          : `linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9))`;

        // Colored border for pop - Thicker neon
        const markerBorder = isMe
          ? `2px solid ${baseColor}`
          : `2px solid ${withAlpha(baseColor, 0.7)}`;
          
        // Bouncy shadow + Neon Glow
        const markerShadow = isMe
          ? `0 0 15px ${withAlpha(baseColor, 0.5)}, 0 4px 8px rgba(0,0,0,0.4)`
          : `0 0 10px ${withAlpha(baseColor, 0.3)}, 0 4px 6px rgba(0,0,0,0.3)`;

        // Text styling - White for dark mode
        const labelColor = '#f1f5f9'; // Slate-100
        const labelShadow = '0 1px 2px rgba(0,0,0,0.8)';

        return (
          <foreignObject
            key={projectedPlayer.player.id}
            x={markerX}
            y={markerY}
            width={projectedPlayer.width}
            height={PLAYER_MARKER_HEIGHT}
            pointerEvents="none"
            className={isMe ? 'player-marker-me' : 'player-marker-other'}
          >
            <div
              style={{
                alignItems: 'center',
                background: markerBackground,
                border: markerBorder,
                borderRadius: '99px', // Pill shape
                boxShadow: markerShadow,
                color: labelColor,
                display: 'flex',
                gap: 8,
                height: '100%',
                padding: '0 12px 0 4px', 
                width: '100%',
                transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Avatar Circle */}
              <div
                aria-hidden="true"
                style={{
                  alignItems: 'center',
                  background: baseColor,
                  border: '2px solid white',
                  borderRadius: '50%',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  color: '#ffffff',
                  display: 'flex',
                  flex: '0 0 auto',
                  fontSize: projectedPlayer.emoji ? 16 : 13,
                  fontWeight: 700,
                  height: 32, 
                  width: 32,
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                {projectedPlayer.emoji ?? projectedPlayer.initials}
              </div>

              {/* Name & Label */}
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
                    fontWeight: isMe ? 700 : 600,
                    letterSpacing: '0.01em',
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textShadow: labelShadow,
                    whiteSpace: 'nowrap',
                    fontFamily: '"Fredoka", system-ui, sans-serif',
                  }}
                >
                  {projectedPlayer.label}
                </div>
              </div>

              {/* Beacon Icon */}
              {projectedPlayer.player.isBeacon && getValidLocation(projectedPlayer.player.beaconLat, projectedPlayer.player.beaconLng) ? (
                 <div
                  aria-label="Beacon active"
                  className="beacon-pulse-icon" // Animated via CSS
                  style={{
                    alignItems: 'center',
                    background: 'rgba(34, 197, 94, 0.2)', // Green-500 tint
                    border: '1px solid rgba(34, 197, 94, 0.5)',
                    borderRadius: '50%',
                    color: '#4ade80', // Green-400
                    display: 'flex',
                    flex: '0 0 auto',
                    fontSize: 12,
                    height: 20,
                    width: 20,
                    justifyContent: 'center',
                    marginLeft: 4,
                  }}
                >
                  📡
                </div>
              ) : null}
              
              {/* Sheen effect for premium feel */}
              <div 
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '50%',
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.07), transparent)',
                  pointerEvents: 'none',
                }}
              />
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
