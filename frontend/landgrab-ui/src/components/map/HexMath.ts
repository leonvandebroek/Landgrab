const METERS_PER_DEG_LAT = 111_320;

export const HEX_DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1]
];

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexNeighbors(q: number, r: number): [number, number][] {
  return HEX_DIRS.map(([dq, dr]) => [q + dq, r + dr] as [number, number]);
}

export function hexAreAdjacent(q1: number, r1: number, q2: number, r2: number): boolean {
  return hexNeighbors(q1, r1).some(([q, r]) => q === q2 && r === r2);
}

export function hexToPixel(q: number, r: number, size: number): [number, number] {
  return [
    size * (3 / 2) * q,
    size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r)
  ];
}

export function hexCornerPoints(cx: number, cy: number, size: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
  }).join(' ');
}

export function pixelToHex(px: number, py: number, size: number): [number, number] {
  const q = ((2 / 3) * px) / size;
  const r = ((-1 / 3) * px + (Math.sqrt(3) / 3) * py) / size;
  return hexRound(q, r);
}

export function hexRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let roundedQ = Math.round(q);
  let roundedR = Math.round(r);
  const roundedS = Math.round(s);
  const deltaQ = Math.abs(roundedQ - q);
  const deltaR = Math.abs(roundedR - r);
  const deltaS = Math.abs(roundedS - s);

  if (deltaQ > deltaR && deltaQ > deltaS) roundedQ = -roundedR - roundedS;
  else if (deltaR > deltaS) roundedR = -roundedQ - roundedS;

  return [roundedQ, roundedR];
}

export function hexToLatLng(q: number, r: number): [number, number] {
  const kmPerDegLat = 111.32;
  const x = (3 / 2) * q;
  const y = Math.sqrt(3) * (r + q / 2);
  const lat = Math.max(-85, Math.min(85, y / kmPerDegLat));
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lng = cosLat > 1e-10 ? Math.max(-180, Math.min(180, x / (kmPerDegLat * cosLat))) : 0;
  return [lat, lng];
}

export function roomHexToLatLng(
  q: number,
  r: number,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number
): [number, number] {
  const xMeters = tileSizeMeters * 1.5 * q;
  const yMeters = tileSizeMeters * Math.sqrt(3) * (r + q / 2);
  const lat = mapLat + yMeters / METERS_PER_DEG_LAT;
  const cosLat = Math.cos((mapLat * Math.PI) / 180);
  const lng = mapLng + xMeters / (METERS_PER_DEG_LAT * Math.max(Math.abs(cosLat), 1e-9));
  return [lat, lng];
}

export function latLngToRoomHex(
  lat: number,
  lng: number,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number
): [number, number] {
  const yMeters = (lat - mapLat) * METERS_PER_DEG_LAT;
  const cosLat = Math.cos((mapLat * Math.PI) / 180);
  const xMeters = (lng - mapLng) * METERS_PER_DEG_LAT * Math.max(Math.abs(cosLat), 1e-9);
  const q = ((2 / 3) * xMeters) / tileSizeMeters;
  const r = ((-1 / 3) * xMeters + (Math.sqrt(3) / 3) * yMeters) / tileSizeMeters;
  return hexRound(q, r);
}

export function roomHexCornerLatLngs(
  q: number,
  r: number,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number
): [number, number][] {
  const [centerLat, centerLng] = roomHexToLatLng(q, r, mapLat, mapLng, tileSizeMeters);
  const cosLat = Math.cos((centerLat * Math.PI) / 180);

  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    const xMeters = tileSizeMeters * Math.cos(angle);
    const yMeters = tileSizeMeters * Math.sin(angle);
    const lat = centerLat + yMeters / METERS_PER_DEG_LAT;
    const lng = centerLng + xMeters / (METERS_PER_DEG_LAT * Math.max(Math.abs(cosLat), 1e-9));
    return [lat, lng] as [number, number];
  });
}

export function hexSpiral(radius: number): [number, number][] {
  const result: [number, number][] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) result.push([q, r]);
  }
  return result;
}
