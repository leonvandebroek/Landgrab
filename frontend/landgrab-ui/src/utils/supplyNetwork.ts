import { roomHexToLatLng } from '../components/map/HexMath';
import type { HexCell, AllianceDto } from '../types/game';

export interface SupplyEdge {
  fromKey: string;
  toKey: string;
  fromCenter: [number, number];
  toCenter: [number, number];
  teamColor: string;
}

export interface SupplyNetworkResult {
  connectedHexes: Set<string>;
  disconnectedHexes: Set<string>;
  supplyEdges: SupplyEdge[];
}

const HEX_NEIGHBOR_OFFSETS: [number, number][] = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];

export function computeSupplyNetwork(
  grid: Record<string, HexCell>,
  alliances: AllianceDto[],
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number
): SupplyNetworkResult {
  const connectedHexes = new Set<string>();
  const supplyEdges: SupplyEdge[] = [];

  for (const alliance of alliances) {
    if (alliance.hqHexQ == null || alliance.hqHexR == null) continue;

    const hqKey = `${alliance.hqHexQ},${alliance.hqHexR}`;
    const hqCell = grid[hqKey];
    // Only seed BFS from the HQ if the alliance still owns it.
    // A captured HQ keeps its coordinates but must not propagate supply.
    if (!hqCell || hqCell.ownerAllianceId !== alliance.id) continue;

    // BFS from HQ
    const visited = new Set<string>();
    const queue: string[] = [hqKey];
    visited.add(hqKey);
    connectedHexes.add(hqKey);

    while (queue.length > 0) {
      const currentKey = queue.shift()!;
      const [cq, cr] = currentKey.split(',').map(Number);

      for (const [dq, dr] of HEX_NEIGHBOR_OFFSETS) {
        const nq = cq + dq;
        const nr = cr + dr;
        const neighborKey = `${nq},${nr}`;

        if (visited.has(neighborKey)) continue;
        const neighbor = grid[neighborKey];
        if (!neighbor?.ownerId) continue;
        if (neighbor.ownerAllianceId !== alliance.id) continue;

        visited.add(neighborKey);
        connectedHexes.add(neighborKey);
        queue.push(neighborKey);

        supplyEdges.push({
          fromKey: currentKey,
          toKey: neighborKey,
          fromCenter: roomHexToLatLng(cq, cr, mapLat, mapLng, tileSizeMeters),
          toCenter: roomHexToLatLng(nq, nr, mapLat, mapLng, tileSizeMeters),
          teamColor: alliance.color,
        });
      }
    }
  }

  // Collect alliance IDs that actually have an HQ set
  const alliancesWithHQ = new Set<string>();
  for (const alliance of alliances) {
    if (alliance.hqHexQ != null && alliance.hqHexR != null) {
      alliancesWithHQ.add(alliance.id);
    }
  }

  // Find disconnected hexes — only for alliances that HAVE an HQ
  const disconnectedHexes = new Set<string>();
  for (const [key, cell] of Object.entries(grid)) {
    if (cell.ownerId && !connectedHexes.has(key) && alliancesWithHQ.has(cell.ownerAllianceId ?? '')) {
      disconnectedHexes.add(key);
    }
  }

  return { connectedHexes, disconnectedHexes, supplyEdges };
}
