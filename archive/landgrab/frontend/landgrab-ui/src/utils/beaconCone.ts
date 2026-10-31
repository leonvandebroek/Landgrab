import type { HexCell } from '../types/game';

/**
 * Computes all hex keys within the beacon sector arc.
 *
 * Uses flat-top hex orientation with HexToLatLng formula:
 *   xMeters = 1.5 * t * q  (east positive)
 *   yMeters = √3 * t * (r + q/2)  (north positive — increasing r is north on the map)
 *
 * For every hex within beaconRange steps of the player, the actual compass bearing
 * from the player to that hex is computed. Hexes whose bearing falls within
 * [heading - sectorAngle/2, heading + sectorAngle/2] are included.
 */
export function computeBeaconCone(
  playerHexKey: string,
  headingDegrees: number,
  grid: Record<string, HexCell>,
  sectorAngle = 45,
  beaconRange = 3,
): string[] {
  const parts = playerHexKey.split(',');
  const q = parseInt(parts[0], 10);
  const r = parseInt(parts[1], 10);

  if (isNaN(q) || isNaN(r)) return [];

  const h = ((headingDegrees % 360) + 360) % 360;
  const halfSector = sectorAngle / 2;
  const result: string[] = [];

  for (let dq = -beaconRange; dq <= beaconRange; dq++) {
    for (let dr = -beaconRange; dr <= beaconRange; dr++) {
      if (dq === 0 && dr === 0) continue;

      const hexDist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
      if (hexDist > beaconRange) continue;

      // Compute geographic displacement using the same HexToLatLng convention
      const xMeters = 1.5 * dq;           // east positive
      const yMeters = Math.sqrt(3) * (dr + dq / 2); // north positive

      // Compass bearing: atan2(east, north) → degrees [0, 360)
      const bearing = ((Math.atan2(xMeters, yMeters) * 180 / Math.PI) + 360) % 360;

      // Angular difference wrapped to [0, 180]
      const angularDiff = Math.abs(((bearing - h + 540) % 360) - 180);

      if (angularDiff <= halfSector) {
        const key = `${q + dq},${r + dr}`;
        if (key in grid) {
          result.push(key);
        }
      }
    }
  }

  return result;
}
