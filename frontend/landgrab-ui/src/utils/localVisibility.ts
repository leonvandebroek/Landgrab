import type { HexCell } from '../types/game';

/**
 * Hex neighbor offsets for flat-top orientation.
 * Use these to find the 6 adjacent hexes.
 */
const HEX_NEIGHBOR_OFFSETS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

/**
 * Computes hex distance between two axial coordinates using the formula:
 * distance = (|dq| + |dr| + |dq+dr|) / 2
 */
function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q1 - q2;
  const dr = r1 - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/**
 * Determines if a hex should be locally visible based on:
 * - Allied player positions (radius 1)
 * - Alliance territory ownership
 * - Hostile hexes adjacent to alliance-owned territory
 * - Beacon cone (already computed)
 *
 * This mirrors the backend's ComputeVisibleHexKeys logic.
 */
export function isLocallyVisible(
  hexKey: string,
  alliedPlayerHexKeys: ReadonlySet<string>,
  allianceOwnedHexKeys: ReadonlySet<string>,
  grid: Record<string, HexCell>,
  beaconConeHexKeys?: ReadonlySet<string>,
): boolean {
  // Parse hex coordinates
  const parts = hexKey.split(',');
  const q = parseInt(parts[0], 10);
  const r = parseInt(parts[1], 10);

  if (isNaN(q) || isNaN(r)) {
    return false;
  }

  // Check if in beacon cone
  if (beaconConeHexKeys?.has(hexKey)) {
    return true;
  }

  // Check if owned by alliance
  if (allianceOwnedHexKeys.has(hexKey)) {
    return true;
  }

  // Check if within radius 1 of any allied player
  for (const playerHexKey of alliedPlayerHexKeys) {
    const playerParts = playerHexKey.split(',');
    const pq = parseInt(playerParts[0], 10);
    const pr = parseInt(playerParts[1], 10);

    if (!isNaN(pq) && !isNaN(pr) && hexDistance(q, r, pq, pr) <= 1) {
      return true;
    }
  }

  // Check if this is a hostile hex adjacent to alliance-owned territory
  const cell = grid[hexKey];
  if (cell?.ownerId && !allianceOwnedHexKeys.has(hexKey)) {
    // This hex is owned by someone (hostile)
    // Check if any of its neighbors are alliance-owned
    for (const [dq, dr] of HEX_NEIGHBOR_OFFSETS) {
      const neighborKey = `${q + dq},${r + dr}`;
      if (allianceOwnedHexKeys.has(neighborKey)) {
        return true;
      }
    }
  }

  return false;
}
