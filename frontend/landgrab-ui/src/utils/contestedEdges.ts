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

      // Shared corners: for neighbor at offset index i, shared corners are at i and (i+1)%6
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 6];

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
