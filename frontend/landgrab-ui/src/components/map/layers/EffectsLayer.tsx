import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useShallow } from 'zustand/react/shallow';
import { ReactSvgOverlay } from '../ReactSvgOverlay';
import { roomHexCornerLatLngs, roomHexToLatLng } from '../HexMath';
import { useEffectsStore } from '../../../stores/effectsStore';
import type { TroopMovement } from '../../../stores/effectsStore';
import type { ContestedEdgeDto } from '../../../types/game';
import type { MapLayerPreferences } from '../../../types/mapLayerPreferences';

interface EffectsLayerProps {
  map: L.Map;
  mapLat: number;
  mapLng: number;
  tileSizeMeters: number;
  layerPreferences: MapLayerPreferences;
}

interface ProjectedLine {
  key: string;
  className: string;
  stroke: string;
  opacity: number;
  strokeWidth: number;
  strokeDasharray?: string;
  style?: React.CSSProperties;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EFFECTS_PANE = 'game-map-hex-pane';
const OVERLAY_PANE = 'overlayPane';
const SHARED_EDGE_CORNERS: [number, number][] = [
  [0, 1], // Neighbor 0 (1, 0)   @ 30°  -> Edge 0-1
  [5, 0], // Neighbor 1 (1, -1)  @ 330° -> Edge 5-0
  [4, 5], // Neighbor 2 (0, -1)  @ 270° -> Edge 4-5
  [3, 4], // Neighbor 3 (-1, 0)  @ 210° -> Edge 3-4
  [2, 3], // Neighbor 4 (-1, 1)  @ 150° -> Edge 2-3
  [1, 2], // Neighbor 5 (0, 1)   @ 90°  -> Edge 1-2
];

function parseHexKey(hexKey: string): [number, number] {
  const delimiter = hexKey.includes(',') ? ',' : ':';
  const [qText, rText] = hexKey.split(delimiter);
  return [Number(qText), Number(rText)];
}

function projectCenterLine(
  map: L.Map,
  fromKey: string,
  toKey: string,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number,
): Pick<ProjectedLine, 'x1' | 'y1' | 'x2' | 'y2'> {
  const [fromQ, fromR] = parseHexKey(fromKey);
  const [toQ, toR] = parseHexKey(toKey);
  const [fromLat, fromLng] = roomHexToLatLng(fromQ, fromR, mapLat, mapLng, tileSizeMeters);
  const [toLat, toLng] = roomHexToLatLng(toQ, toR, mapLat, mapLng, tileSizeMeters);
  const fromPoint = map.latLngToLayerPoint([fromLat, fromLng]);
  const toPoint = map.latLngToLayerPoint([toLat, toLng]);

  return {
    x1: fromPoint.x,
    y1: fromPoint.y,
    x2: toPoint.x,
    y2: toPoint.y,
  };
}

function EffectsLayerComponent({
  map,
  mapLat,
  mapLng,
  tileSizeMeters,
  layerPreferences,
}: EffectsLayerProps) {
  const [svgRoot, setSvgRoot] = useState<SVGGElement | null>(null);
  const [projectionTick, setProjectionTick] = useState(0);

  const { contestedEdges, troopMovements } = useEffectsStore(
    useShallow((state) => ({
      contestedEdges: state.contestedEdges,
      troopMovements: state.troopMovements,
    })),
  );

  useEffect(() => {
    const pane = map.getPane(EFFECTS_PANE) ? EFFECTS_PANE : OVERLAY_PANE;
    const overlay = new ReactSvgOverlay({ pane });
    overlay.addTo(map);
    const frameId = window.requestAnimationFrame(() => {
      setSvgRoot(overlay.getContainer());
      setProjectionTick((tick) => tick + 1);
    });

    const handleProjectionChange = () => {
      setProjectionTick((tick) => tick + 1);
    };

    map.on('zoomend moveend viewreset rotate', handleProjectionChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      overlay.remove();
      map.off('zoomend moveend viewreset rotate', handleProjectionChange);
    };
  }, [map]);

  const contestedLines = useMemo<ProjectedLine[]>(() => {
    void projectionTick;

    return contestedEdges.flatMap((edge: ContestedEdgeDto) => {
      const [q, r] = parseHexKey(edge.hexKeyA);
      const corners = roomHexCornerLatLngs(q, r, mapLat, mapLng, tileSizeMeters);
      const cornerIndices = SHARED_EDGE_CORNERS[edge.neighborIndex];
      if (!cornerIndices) {
        return [];
      }

      const [startCornerIndex, endCornerIndex] = cornerIndices;
      const startCorner = corners[startCornerIndex];
      const endCorner = corners[endCornerIndex];
      const startPoint = map.latLngToLayerPoint([startCorner[0], startCorner[1]]);
      const endPoint = map.latLngToLayerPoint([endCorner[0], endCorner[1]]);
      return [{
        key: `${edge.hexKeyA}:${edge.hexKeyB}:${edge.neighborIndex}:heat`,
        className: 'contested-edge-heat',
        stroke: '#FF00AA',
        opacity: 0.35,
        strokeWidth: 7.5 + edge.intensity * 6,
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        style: {
          '--intensity': edge.intensity,
        } as React.CSSProperties,
      }, {
        key: `${edge.hexKeyA}:${edge.hexKeyB}:${edge.neighborIndex}:march`,
        className: 'contested-edge-march',
        stroke: '#FF00AA',
        opacity: 0.85,
        strokeWidth: 5,
        strokeDasharray: '6 6',
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
        style: {
          animationDuration: `${Math.max(0.5, 1.5 - edge.intensity)}s`,
        } as React.CSSProperties,
      }, {
        key: `${edge.hexKeyA}:${edge.hexKeyB}:${edge.neighborIndex}:spark`,
        className: 'contested-edge-spark',
        stroke: '#ffffff',
        opacity: 0.6,
        strokeWidth: 2,
        strokeDasharray: '1 12',
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
      }];
    });
  }, [contestedEdges, map, mapLat, mapLng, projectionTick, tileSizeMeters]);

  const troopMovementLines = useMemo<ProjectedLine[]>(() => {
    void projectionTick;

    return troopMovements.map((movement: TroopMovement, index: number) => ({
      key: `${movement.fromHex}:${movement.toHex}:${movement.type}:${index}`,
      className: `troop-flow troop-flow-${movement.type}`,
      stroke: movement.teamColor,
      opacity: 1.0, // Max visibility
      strokeWidth: 4, // Thicker line
      strokeDasharray: '8 6', // Longer dashes
      ...projectCenterLine(map, movement.fromHex, movement.toHex, mapLat, mapLng, tileSizeMeters),
    }));
  }, [map, mapLat, mapLng, projectionTick, tileSizeMeters, troopMovements]);

  if (!svgRoot) {
    return null;
  }

  return createPortal(
    <g className="effects-layer" pointerEvents="none">
      {layerPreferences.contestedEdges
        ? contestedLines.map((line) => (
            <line
              key={line.key}
              className={line.className}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              strokeOpacity={line.opacity}
              style={line.style}
              strokeLinecap="round"
            />
          ))
        : null}
      {layerPreferences.troopAnimations
        ? troopMovementLines.map((line) => (
            <line
              key={line.key}
              className={line.className}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={line.stroke}
              strokeWidth={line.strokeWidth}
              strokeOpacity={line.opacity}
              strokeDasharray={line.strokeDasharray}
              strokeLinecap="round"
            />
          ))
        : null}
    </g>,
    svgRoot,
  );
}

export const EffectsLayer = memo(EffectsLayerComponent);
