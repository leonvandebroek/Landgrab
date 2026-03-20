import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { usePlayerLayerStore } from '../../../stores/playerLayerStore';
import type { Player } from '../../../types/game';
import type { MapLayerPreferences } from '../../../types/mapLayerPreferences';
import { ReactSvgOverlay } from '../ReactSvgOverlay';
import { useGameStore } from '../../../stores/gameStore';
import { latLngToRoomHex, hexKey as computeHexKey } from '../HexMath';

interface PlayerLayerProps {
  map: L.Map;
  layerPreferences?: MapLayerPreferences;
}

interface ProjectedPlayer {
  player: Player;
  point: L.Point;
  color: string;
  label: string;
  isCurrentUser: boolean;
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

function getOrbitalOffset(
  index: number,
  total: number,
  hexRadius: number = 18,
): { dx: number; dy: number } {
  if (hexRadius < 12) return { dx: 0, dy: 0 };
  if (total === 1) return { dx: 0, dy: 18 };
  if (total === 2) {
    return index === 0 ? { dx: -10, dy: 14 } : { dx: 10, dy: 14 };
  }
  if (total <= 4) {
    const offsets: Array<{ dx: number; dy: number }> = [
      { dx: -12, dy: -12 },
      { dx: 12, dy: -12 },
      { dx: -12, dy: 12 },
      { dx: 12, dy: 12 },
    ];
    return offsets[index] ?? { dx: 0, dy: 14 };
  }
  return { dx: 0, dy: 14 };
}

function PlayerLayerComponent({ map, layerPreferences }: PlayerLayerProps) {
  const [svgRoot, setSvgRoot] = useState<SVGGElement | null>(null);
  const [projectionTick, setProjectionTick] = useState(0);
  const players = usePlayerLayerStore((state) => state.players);
  const myUserId = usePlayerLayerStore((state) => state.myUserId);
  const gameState = useGameStore((state) => state.gameState);

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
      const label = player.id === myUserId ? `${player.name} (You)` : player.name;

      return [{
        player,
        point,
        color: player.allianceColor ?? player.color ?? DEFAULT_PLAYER_COLOR,
        label,
        isCurrentUser: player.id === myUserId,
      }];
    });
  }, [map, myUserId, players, projectionTick]);

  const hexGroups = useMemo(() => {
    const groups = new Map<string, number[]>();
    
    projectedPlayers.forEach((p, i) => {
      let key = `fallback-${p.point.x.toFixed(0)}-${p.point.y.toFixed(0)}`;
      
      if (gameState?.mapLat != null && gameState?.mapLng != null && gameState?.tileSizeMeters != null) {
         if (p.player.currentLat && p.player.currentLng) {
            const [q, r] = latLngToRoomHex(p.player.currentLat, p.player.currentLng, gameState.mapLat, gameState.mapLng, gameState.tileSizeMeters);
            key = computeHexKey(q, r);
         }
      } else {
         for (const [existingKey, indices] of groups.entries()) {
            if (existingKey.startsWith('fallback-')) {
               const rep = projectedPlayers[indices[0]];
               if (Math.hypot(rep.point.x - p.point.x, rep.point.y - p.point.y) < 20) {
                 key = existingKey;
                 break;
               }
            }
         }
      }
      
      const list = groups.get(key) || [];
      list.push(i);
      groups.set(key, list);
    });
    
    return groups;
  }, [projectedPlayers, gameState]);

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

  if (layerPreferences?.playerMarkers === false) {
    return createPortal(<g className="player-layer" pointerEvents="none" />, svgRoot);
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
          <text
            x={beacon.point.x}
            y={beacon.point.y + 6}
            fontSize="16"
            fontWeight="bold"
            fill="#ffffff"
            textAnchor="middle"
            aria-label={beacon.label}
          >
            📡
          </text>
        </g>
      ))}

      {projectedPlayers.map((projectedPlayer, playerIndex) => {
        let groupSize = 1;
        let groupIndex = 0;
        
        for (const [, indices] of hexGroups.entries()) {
           if (indices.includes(playerIndex)) {
              groupSize = indices.length;
              groupIndex = indices.indexOf(playerIndex);
              break;
           }
        }
        
        if (groupSize >= 5 && groupIndex !== 0) {
           return null;
        }

        const { dx, dy } = getOrbitalOffset(groupIndex, groupSize);

        const markerX = projectedPlayer.point.x;
        const markerY = projectedPlayer.point.y;
        const baseColor = projectedPlayer.color || '#00f3ff';
        const reticleColor = projectedPlayer.isCurrentUser ? '#ffffff' : baseColor;

        let labelText = '';
        if (groupSize >= 5 && groupIndex === 0) {
           labelText = `[${groupSize}]`;
        } else {
           labelText = projectedPlayer.player.name.trim().substring(0, 4).toUpperCase();
        }
        const labelWidth = labelText.length * 5 + 4;

        return (
          <g
            key={projectedPlayer.player.id ?? projectedPlayer.player.name}
            className="player-marker-reticle tricorder-chevron-marker"
            transform={`translate(${markerX + dx}, ${markerY + dy})`}
            pointerEvents="none"
          >
            <path d="M -7 -3 L 0 4 L 7 -3" fill="none" stroke="#000000" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M -7 -3 L 0 4 L 7 -3" fill="none" stroke={reticleColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            
            {projectedPlayer.isCurrentUser && (
              <path d="M -11 -6 L 0 6 L 11 -6" fill="none" stroke={reticleColor} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
            )}
            
            <line x1="7" y1="-3" x2="16" y2="-10" stroke={reticleColor} strokeWidth={1} opacity={0.7} />
            <rect x="16" y="-18" width={labelWidth} height="10" rx="1" fill="rgba(0,0,0,0.75)" />
            <text x="18" y="-10" fontFamily="'Share Tech Mono', ui-monospace, monospace" fontSize="8" fill={reticleColor} letterSpacing="0.04em">
              {labelText}
            </text>
          </g>
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

export const PlayerLayer = memo(PlayerLayerComponent);
