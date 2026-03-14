import L from 'leaflet';
import type { TroopMovement } from '../../hooks/useGridDiff';
import { roomHexToLatLng } from './HexMath';

function parseKey(key: string): [number, number] {
  const sep = key.indexOf(',');
  return [Number(key.slice(0, sep)), Number(key.slice(sep + 1))];
}

/**
 * Renders troop movement animations as Leaflet polylines and circle markers.
 * Clears the layer group first, then adds one polyline + one midpoint dot
 * per movement. All layers are non-interactive.
 */
export function renderTroopAnimations(
  movements: TroopMovement[],
  layerGroup: L.LayerGroup,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number,
): void {
  layerGroup.clearLayers();

  for (const movement of movements) {
    const [fromQ, fromR] = parseKey(movement.fromHex);
    const [toQ, toR] = parseKey(movement.toHex);

    const from = roomHexToLatLng(fromQ, fromR, mapLat, mapLng, tileSizeMeters);
    const to = roomHexToLatLng(toQ, toR, mapLat, mapLng, tileSizeMeters);

    const fromLatLng: L.LatLngExpression = [from[0], from[1]];
    const toLatLng: L.LatLngExpression = [to[0], to[1]];

    // Animated polyline between source and destination hex centers
    L.polyline([fromLatLng, toLatLng], {
      className: `troop-flow troop-flow-${movement.type}`,
      color: movement.teamColor,
      weight: 3,
      opacity: 0.8,
      dashArray: '6 6',
      interactive: false,
    }).addTo(layerGroup);

    // Small dot at the midpoint of the line
    const midLat = (from[0] + to[0]) / 2;
    const midLng = (from[1] + to[1]) / 2;

    L.circleMarker([midLat, midLng], {
      className: 'troop-dot',
      radius: 4,
      color: movement.teamColor,
      fillColor: movement.teamColor,
      fillOpacity: 0.9,
      interactive: false,
    }).addTo(layerGroup);
  }
}
