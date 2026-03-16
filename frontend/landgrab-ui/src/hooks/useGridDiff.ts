import { useEffect, useRef, useState } from 'react';
import type { HexCell } from '../types/game';

export interface TroopMovement {
  fromHex: string;
  toHex: string;
  count: number;
  type: 'transfer' | 'attack';
  teamColor: string;
}

const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const MAX_MOVEMENTS = 10;
const CLEAR_DELAY_MS = 1500;

function toKey(q: number, r: number): string {
  return `${q},${r}`;
}

function parseKey(key: string): [number, number] {
  const sep = key.indexOf(',');
  return [Number(key.slice(0, sep)), Number(key.slice(sep + 1))];
}

/** Quick sample-based check to avoid diffing an unchanged grid. */
function hasGridChanged(
  prev: Record<string, HexCell>,
  next: Record<string, HexCell>,
): boolean {
  const nextKeys = Object.keys(next);
  const prevLen = Object.keys(prev).length;
  if (prevLen !== nextKeys.length) return true;

  // Sample first, middle, and last keys
  const indices = [
    0,
    Math.floor(nextKeys.length / 2),
    nextKeys.length - 1,
  ];
  for (const i of indices) {
    const key = nextKeys[i];
    if (key === undefined) continue;
    const p = prev[key];
    const n = next[key];
    if (!p || !n) return true;
    if (p.troops !== n.troops || p.ownerId !== n.ownerId) return true;
  }
  return false;
}

/**
 * Detects troop movements between grid state updates by diffing hex cells.
 * Returns up to 10 active movements that auto-clear after 1500ms.
 */
export function useGridDiff(grid: Record<string, HexCell>): TroopMovement[] {
  const prevGridRef = useRef<Record<string, HexCell>>({});
  const [movements, setMovements] = useState<TroopMovement[]>([]);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevGridRef.current;
    let movementUpdateTimeoutId: number | null = null;

    // First render or empty grid — just store and skip
    if (Object.keys(prev).length === 0 || Object.keys(grid).length === 0) {
      prevGridRef.current = { ...grid };
      return;
    }

    // Skip diff when grid hasn't meaningfully changed
    if (!hasGridChanged(prev, grid)) {
      prevGridRef.current = { ...grid };
      return;
    }

    const detected: TroopMovement[] = [];

    for (const key of Object.keys(grid)) {
      const curr = grid[key];
      const old = prev[key];
      if (!curr || !old) continue;

      // Attack: hex changed owner
      if (curr.ownerId && old.ownerId && curr.ownerId !== old.ownerId) {
        const [q, r] = parseKey(key);
        for (const [dq, dr] of NEIGHBOR_OFFSETS) {
          const nk = toKey(q + dq, r + dr);
          const nCurr = grid[nk];
          const nOld = prev[nk];
          if (
            nCurr &&
            nOld &&
            nCurr.ownerId === curr.ownerId &&
            nOld.troops > nCurr.troops
          ) {
            detected.push({
              fromHex: nk,
              toHex: key,
              count: nOld.troops - nCurr.troops,
              type: 'attack',
              teamColor: curr.ownerColor ?? '#ffffff',
            });
            break;
          }
        }
        continue;
      }

      // Transfer: same owner, gained troops from adjacent same-owner hex
      if (
        curr.ownerId &&
        curr.ownerId === old.ownerId &&
        curr.troops > old.troops
      ) {
        const gained = curr.troops - old.troops;
        const [q, r] = parseKey(key);
        for (const [dq, dr] of NEIGHBOR_OFFSETS) {
          const nk = toKey(q + dq, r + dr);
          const nCurr = grid[nk];
          const nOld = prev[nk];
          if (
            nCurr &&
            nOld &&
            nCurr.ownerId === curr.ownerId &&
            nOld.ownerId === curr.ownerId &&
            nOld.troops > nCurr.troops
          ) {
            detected.push({
              fromHex: nk,
              toHex: key,
              count: gained,
              type: 'transfer',
              teamColor: curr.ownerColor ?? '#ffffff',
            });
            break;
          }
        }
      }
    }

    if (detected.length > 0) {
      // Merge with existing, keep only newest MAX_MOVEMENTS
      movementUpdateTimeoutId = window.setTimeout(() => {
        setMovements((prev) => [...prev, ...detected].slice(-MAX_MOVEMENTS));
      }, 0);

      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        setMovements([]);
        clearTimerRef.current = null;
      }, CLEAR_DELAY_MS);
    }

    prevGridRef.current = { ...grid };
    return () => {
      if (movementUpdateTimeoutId !== null) {
        window.clearTimeout(movementUpdateTimeoutId);
      }
    };
  }, [grid]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  return movements;
}
