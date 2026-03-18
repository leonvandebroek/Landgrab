import type { TroopMovement } from '../stores/effectsStore';
import type { HexCell } from '../types/game';

const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function toHexKey(q: number, r: number): string {
  return `${q},${r}`;
}

function parseHexKey(key: string): [number, number] {
  const separatorIndex = key.indexOf(',');
  return [Number(key.slice(0, separatorIndex)), Number(key.slice(separatorIndex + 1))];
}

export function hasHexChanged(previousCell: HexCell, nextCell: HexCell): boolean {
  return previousCell.ownerId !== nextCell.ownerId
    || previousCell.ownerAllianceId !== nextCell.ownerAllianceId
    || previousCell.ownerColor !== nextCell.ownerColor
    || previousCell.troops !== nextCell.troops
    || previousCell.isFort !== nextCell.isFort
    || previousCell.isFortified !== nextCell.isFortified
    || previousCell.engineerBuiltAt !== nextCell.engineerBuiltAt
    || previousCell.isMasterTile !== nextCell.isMasterTile
    || previousCell.terrainType !== nextCell.terrainType
    || previousCell.lastVisitedAt !== nextCell.lastVisitedAt;
}

/**
 * Detect troop movement animations by comparing two grid snapshots.
 */
export function detectTroopMovements(
  previousGrid: Record<string, HexCell> | undefined | null,
  nextGrid: Record<string, HexCell>,
): TroopMovement[] {
  if (!previousGrid) {
    return [];
  }

  const detected: TroopMovement[] = [];

  for (const key of Object.keys(nextGrid)) {
    const currentCell = nextGrid[key];
    const previousCell = previousGrid[key];

    if (!currentCell || !previousCell) {
      continue;
    }

    if (currentCell.ownerId && previousCell.ownerId && currentCell.ownerId !== previousCell.ownerId) {
      const [q, r] = parseHexKey(key);

      for (const [dq, dr] of NEIGHBOR_OFFSETS) {
        const neighborKey = toHexKey(q + dq, r + dr);
        const nextNeighbor = nextGrid[neighborKey];
        const previousNeighbor = previousGrid[neighborKey];

        if (
          nextNeighbor
          && previousNeighbor
          && nextNeighbor.ownerId === currentCell.ownerId
          && previousNeighbor.ownerId === currentCell.ownerId
          && previousNeighbor.troops > nextNeighbor.troops
        ) {
          detected.push({
            fromHex: neighborKey,
            toHex: key,
            count: previousNeighbor.troops - nextNeighbor.troops,
            type: 'attack',
            teamColor: currentCell.ownerColor ?? '#ffffff',
          });
          break;
        }
      }

      continue;
    }

    if (
      currentCell.ownerId
      && currentCell.ownerId === previousCell.ownerId
      && currentCell.troops > previousCell.troops
    ) {
      const gainedTroops = currentCell.troops - previousCell.troops;
      const [q, r] = parseHexKey(key);

      for (const [dq, dr] of NEIGHBOR_OFFSETS) {
        const neighborKey = toHexKey(q + dq, r + dr);
        const nextNeighbor = nextGrid[neighborKey];
        const previousNeighbor = previousGrid[neighborKey];

        if (
          nextNeighbor
          && previousNeighbor
          && nextNeighbor.ownerId === currentCell.ownerId
          && previousNeighbor.ownerId === currentCell.ownerId
          && previousNeighbor.troops > nextNeighbor.troops
        ) {
          detected.push({
            fromHex: neighborKey,
            toHex: key,
            count: gainedTroops,
            type: 'transfer',
            teamColor: currentCell.ownerColor ?? '#ffffff',
          });
          break;
        }
      }
    }
  }

  return detected;
}
