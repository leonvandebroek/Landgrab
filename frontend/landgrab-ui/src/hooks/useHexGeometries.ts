import { useMemo } from 'react';
import L from 'leaflet';
import { roomHexCornerLatLngs, roomHexToLatLng } from '../components/map/HexMath';

export interface HexPixelGeometry {
  points: string;
  center: [number, number];
}

export function useHexGeometries(
  map: L.Map | null,
  tileKeys: string[],
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number,
  zoom: number,
): Record<string, HexPixelGeometry> {
  return useMemo(() => {
    void zoom;

    if (!map) {
      return {};
    }

    const geometries: Record<string, HexPixelGeometry> = {};

    for (const tileKey of tileKeys) {
      const parsed = parseHexKey(tileKey);
      if (!parsed) {
        continue;
      }

      const [q, r] = parsed;
      const corners = roomHexCornerLatLngs(q, r, mapLat, mapLng, tileSizeMeters)
        .map(([lat, lng]) => map.latLngToLayerPoint([lat, lng]))
        .map((point) => `${point.x},${point.y}`)
        .join(' ');
      const centerLatLng = roomHexToLatLng(q, r, mapLat, mapLng, tileSizeMeters);
      const centerPoint = map.latLngToLayerPoint(centerLatLng);

      geometries[tileKey] = {
        points: corners,
        center: [centerPoint.x, centerPoint.y],
      };
    }

    return geometries;
  }, [map, mapLat, mapLng, tileKeys, tileSizeMeters, zoom]);
}

function parseHexKey(tileKey: string): [number, number] | null {
  const delimiter = tileKey.includes(',') ? ',' : ':';
  const [qText, rText] = tileKey.split(delimiter);
  const q = Number(qText);
  const r = Number(rText);

  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    return null;
  }

  return [q, r];
}
