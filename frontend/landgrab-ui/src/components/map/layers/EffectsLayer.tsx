import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useShallow } from 'zustand/react/shallow';
import { ReactSvgOverlay } from '../ReactSvgOverlay';
import { roomHexCornerLatLngs, roomHexToLatLng } from '../HexMath';
import { useEffectsStore } from '../../../stores/effectsStore';
import type { TroopMovement } from '../../../stores/effectsStore';
import type { ContestedEdgeDto, SupplyEdgeDto } from '../../../types/game';

interface EffectsLayerProps {
  map: L.Map;
  mapLat: number;
  mapLng: number;
  tileSizeMeters: number;
}

interface ProjectedLine {
  key: string;
  className: string;
  stroke: string;
  opacity: number;
  strokeWidth: number;
  strokeDasharray?: string;
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
}: EffectsLayerProps) {
  const [svgRoot, setSvgRoot] = useState<SVGGElement | null>(null);
  const [projectionTick, setProjectionTick] = useState(0);

  const { contestedEdges, supplyEdges, troopMovements } = useEffectsStore(
    useShallow((state) => ({
      contestedEdges: state.contestedEdges,
      supplyEdges: state.supplyEdges,
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

    map.on('zoomend moveend viewreset', handleProjectionChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      overlay.remove();
      map.off('zoomend moveend viewreset', handleProjectionChange);
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
      const intensityClass = edge.intensity > 0.6 ? ' contested-edge-intense' : '';

      // Premium effect: render two lines for the "clash"
      // Dark Arcade: Red danger zone base + colored clash
      return [{
        key: `${edge.hexKeyA}:${edge.hexKeyB}:${edge.neighborIndex}:base`,
        className: `contested-edge-base${intensityClass}`,
        stroke: '#ef4444', // Red danger base
        opacity: 0.3,
        strokeWidth: 8,
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
      }, {
        key: `${edge.hexKeyA}:${edge.hexKeyB}:${edge.neighborIndex}:clash`,
        className: `contested-edge-clash${intensityClass}`,
        stroke: '#ffffff', // White clash marks for max contrast
        opacity: 0.8,
        strokeWidth: 4,
        strokeDasharray: '4 6', // Sharp dashes
        x1: startPoint.x,
        y1: startPoint.y,
        x2: endPoint.x,
        y2: endPoint.y,
      }];
    });
  }, [contestedEdges, map, mapLat, mapLng, projectionTick, tileSizeMeters]);

  const supplyLines = useMemo<ProjectedLine[]>(() => {
    void projectionTick;

    return supplyEdges.flatMap((edge: SupplyEdgeDto) => {
      const coords = projectCenterLine(map, edge.fromKey, edge.toKey, mapLat, mapLng, tileSizeMeters);
      
      // Premium effect: Base rail + flowing energy
      // Pattern: 6 dash, 12 gap = 18 total length
      // Dark Arcade: Shadow Casing + Neon Rail + White Energy
      return [{
        key: `${edge.fromKey}:${edge.toKey}:casing`,
        className: 'supply-line-casing',
        stroke: '#000000', // Deep shadow for lift
        opacity: 0.6,
        strokeWidth: 12,
        ...coords,
      }, {
        key: `${edge.fromKey}:${edge.toKey}:rail`,
        className: 'supply-line-rail',
        stroke: edge.teamColor, // Solid team color core
        opacity: 1.0,
        strokeWidth: 6,
        ...coords,
      }, {
        key: `${edge.fromKey}:${edge.toKey}:flow`,
        className: 'supply-line-flow',
        stroke: '#ffffff', // White electricity
        opacity: 0.8,
        strokeWidth: 2, 
        strokeDasharray: '4 6', 
        ...coords,
      }];
    });
  }, [map, mapLat, mapLng, projectionTick, supplyEdges, tileSizeMeters]);

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
      {supplyLines.map((line) => (
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
      ))}
      {contestedLines.map((line) => (
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
          strokeLinecap="round"
        />
      ))}
      {troopMovementLines.map((line) => (
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
      ))}
    </g>,
    svgRoot,
  );
}

export const EffectsLayer = memo(EffectsLayerComponent);
