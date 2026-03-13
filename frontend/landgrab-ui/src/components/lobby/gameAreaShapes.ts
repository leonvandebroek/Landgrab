import type { GameAreaPattern, HexCoordinate } from '../../types/game';
import { hexKey, hexSpiral } from '../map/HexMath';

export const DRAWING_GRID_RADIUS = 10;
export const DEFAULT_GAME_AREA_RADIUS = 8;
export const MAX_GAME_AREA_FOOTPRINT_METERS = 1000;
const SQRT_3 = 1.7320508075688772;

export const GAME_AREA_PATTERNS: GameAreaPattern[] = [
    'WideFront',
    'TallFront',
    'Crossroads',
    'Starburst',
];

export function buildCenteredGameArea(): HexCoordinate[] {
    return hexSpiral(DEFAULT_GAME_AREA_RADIUS).map(([q, r]) => ({ q, r }));
}

export function buildPatternGameArea(pattern: GameAreaPattern): HexCoordinate[] {
    return buildCenteredGameArea().filter(({ q, r }) => {
        const s = -q - r;
        const radius = hexDistance(q, r);

        switch (pattern) {
            case 'WideFront':
                return Math.abs(q) <= 8 && Math.abs(r) <= 4 && Math.abs(s) <= 8;
            case 'TallFront':
                return Math.abs(q) <= 4 && Math.abs(r) <= 8 && Math.abs(s) <= 8;
            case 'Crossroads':
                return radius <= 4 || Math.abs(q) <= 1 || Math.abs(r) <= 1 || Math.abs(s) <= 1;
            case 'Starburst':
                return radius <= 5 || (radius <= DEFAULT_GAME_AREA_RADIUS && (q === 0 || r === 0 || s === 0));
            default:
                return true;
        }
    });
}

export function buildDrawingCanvas(): HexCoordinate[] {
    return hexSpiral(DRAWING_GRID_RADIUS).map(([q, r]) => ({ q, r }));
}

export function toHexKeySet(cells: HexCoordinate[]): Set<string> {
    return new Set(cells.map(cell => hexKey(cell.q, cell.r)));
}

export function isConnectedArea(cells: HexCoordinate[]): boolean {
    const keys = toHexKeySet(cells);
    if (keys.size <= 1) {
        return true;
    }

    const byKey = new Map(cells.map(cell => [hexKey(cell.q, cell.r), cell]));
    const start = cells[0];
    const queue: HexCoordinate[] = [start];
    const visited = new Set<string>([hexKey(start.q, start.r)]);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors: HexCoordinate[] = [
            { q: current.q + 1, r: current.r },
            { q: current.q + 1, r: current.r - 1 },
            { q: current.q, r: current.r - 1 },
            { q: current.q - 1, r: current.r },
            { q: current.q - 1, r: current.r + 1 },
            { q: current.q, r: current.r + 1 },
        ];

        for (const neighbor of neighbors) {
            const key = hexKey(neighbor.q, neighbor.r);
            if (!keys.has(key) || visited.has(key) || !byKey.has(key)) {
                continue;
            }

            visited.add(key);
            queue.push(byKey.get(key)!);
        }
    }

    return visited.size === keys.size;
}

export function getAreaFootprintMetrics(cells: HexCoordinate[], tileSizeMeters: number): {
    widthMeters: number;
    heightMeters: number;
    maxDimensionMeters: number;
} {
    if (cells.length === 0 || tileSizeMeters <= 0) {
        return { widthMeters: 0, heightMeters: 0, maxDimensionMeters: 0 };
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const cell of cells) {
        const centerX = tileSizeMeters * 1.5 * cell.q;
        const centerY = tileSizeMeters * SQRT_3 * (cell.r + cell.q / 2);
        minX = Math.min(minX, centerX - tileSizeMeters);
        maxX = Math.max(maxX, centerX + tileSizeMeters);
        minY = Math.min(minY, centerY - tileSizeMeters);
        maxY = Math.max(maxY, centerY + tileSizeMeters);
    }

    const widthMeters = maxX - minX;
    const heightMeters = maxY - minY;
    return {
        widthMeters,
        heightMeters,
        maxDimensionMeters: Math.max(widthMeters, heightMeters),
    };
}

export function getMaxTileSizeForArea(cells: HexCoordinate[]): number {
    const unitMetrics = getAreaFootprintMetrics(cells, 1);
    if (unitMetrics.maxDimensionMeters <= 0) {
        return MAX_GAME_AREA_FOOTPRINT_METERS;
    }

    return Math.max(15, Math.floor(MAX_GAME_AREA_FOOTPRINT_METERS / unitMetrics.maxDimensionMeters));
}

function hexDistance(q: number, r: number): number {
    return Math.max(Math.abs(q), Math.max(Math.abs(r), Math.abs(-q - r)));
}