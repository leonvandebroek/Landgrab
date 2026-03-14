import { roomHexCornerLatLngs } from '../components/map/HexMath';
import type { HexCell } from '../types/game';

export interface ContestedEdge {
  from: [number, number];
  to: [number, number];
  teamAColor: string;
  teamBColor: string;
  intensity: number;
}

const HEX_NEIGHBOR_OFFSETS: [number, number][] = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

// For flat-top hexes (corners at 0°,60°,120°,180°,240°,300°), the shared
// edge between a cell and its neighbor at NEIGHBOR_OFFSETS[i] uses these
// corner indices.  Derived from matching each neighbor direction's angle
// to the edge whose midpoint lies along the same bearing.
const SHARED_EDGE_CORNERS: [number, number][] = [
  [0, 1],  // neighbor 0 [+1, 0]  → 30° NE edge
  [5, 0],  // neighbor 1 [+1,-1]  → 330° SE edge
  [4, 5],  // neighbor 2 [ 0,-1]  → 270° S edge
  [3, 4],  // neighbor 3 [-1, 0]  → 210° SW edge
  [2, 3],  // neighbor 4 [-1,+1]  → 150° NW edge
  [1, 2],  // neighbor 5 [ 0,+1]  → 90° N edge
];

export function findContestedEdges(
  grid: Record<string, HexCell>,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number
): ContestedEdge[] {
  const edges: ContestedEdge[] = [];
  const seen = new Set<string>();

  for (const cell of Object.values(grid)) {
    if (!cell.ownerId) continue;

    const corners = roomHexCornerLatLngs(cell.q, cell.r, mapLat, mapLng, tileSizeMeters);

    for (let i = 0; i < HEX_NEIGHBOR_OFFSETS.length; i++) {
      const [dq, dr] = HEX_NEIGHBOR_OFFSETS[i];
      const nq = cell.q + dq;
      const nr = cell.r + dr;
      const neighborKey = `${nq},${nr}`;
      const neighbor = grid[neighborKey];

      if (!neighbor?.ownerId) continue;
      if (neighbor.ownerId === cell.ownerId) continue;
      if (cell.ownerAllianceId && cell.ownerAllianceId === neighbor.ownerAllianceId) continue;

      // Deduplicate
      const cellKey = `${cell.q},${cell.r}`;
      const edgeKey = cellKey < neighborKey ? `${cellKey}-${neighborKey}` : `${neighborKey}-${cellKey}`;
      if (seen.has(edgeKey)) continue;
      seen.add(edgeKey);

      const [ci1, ci2] = SHARED_EDGE_CORNERS[i];
      const c1 = corners[ci1];
      const c2 = corners[ci2];

      const maxTroops = Math.max(cell.troops, neighbor.troops, 1);
      const minTroops = Math.min(cell.troops, neighbor.troops);
      const intensity = minTroops / maxTroops;

      edges.push({
        from: c1,
        to: c2,
        teamAColor: cell.ownerColor ?? '#ff4444',
        teamBColor: neighbor.ownerColor ?? '#4444ff',
        intensity,
      });
    }
  }

  return edges;
}
