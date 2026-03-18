import { memo, useMemo } from 'react';
import type { HexPixelGeometry } from '../../hooks/useHexGeometries';

interface WorldDimMaskProps {
  tileKeys: string[];
  hexGeometries: Record<string, HexPixelGeometry>;
  mapBounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export const WorldDimMask = memo(function WorldDimMask({
  tileKeys,
  hexGeometries,
  mapBounds,
}: WorldDimMaskProps) {
  const path = useMemo(() => {
    const segments = [
      `M ${mapBounds.minX} ${mapBounds.minY}`,
      `L ${mapBounds.maxX} ${mapBounds.minY}`,
      `L ${mapBounds.maxX} ${mapBounds.maxY}`,
      `L ${mapBounds.minX} ${mapBounds.maxY}`,
      'Z',
    ];

    for (const tileKey of tileKeys) {
      const geometry = hexGeometries[tileKey];
      if (!geometry) {
        continue;
      }

      const points = parsePointList(geometry.points);
      if (points.length === 0) {
        continue;
      }

      const [firstPoint, ...restPoints] = points;
      segments.push(`M ${firstPoint[0]} ${firstPoint[1]}`);
      for (const [x, y] of restPoints) {
        segments.push(`L ${x} ${y}`);
      }
      segments.push('Z');
    }

    return segments.join(' ');
  }, [hexGeometries, mapBounds.maxX, mapBounds.maxY, mapBounds.minX, mapBounds.minY, tileKeys]);

  return (
    <path
      className="grid-dim-mask"
      d={path}
      fill="#ffffff" 
      fillOpacity={0.7}
      fillRule="evenodd"
      pointerEvents="none"
    />
  );
});

function parsePointList(points: string): Array<[number, number]> {
  return points
    .trim()
    .split(/\s+/)
    .map((point) => point.split(','))
    .map(([xText, yText]) => [Number(xText), Number(yText)] as [number, number])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
}
