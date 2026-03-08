import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GlobalHex } from '../../types/game';
import { hexToPixel } from '../map/HexMath';

interface Props {
  hexes: GlobalHex[];
  myUserId: string;
  onAttack: (fromQ: number, fromR: number, toQ: number, toR: number) => void;
}

const HEX_SIZE = 18;
const ZOOM = 13;

export function GlobalMap({ hexes, myUserId, onAttack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectedRef = useRef<[number, number] | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoom: ZOOM });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || hexes.length === 0) return;

    // Center on player's first hex
    const myHex = hexes.find(h => h.ownerUserId === myUserId);
    if (myHex) {
      const [px, py] = hexToPixel(myHex.q, myHex.r, HEX_SIZE * 1000);
      map.setView([py / 111320, px / (111320 * Math.cos(py / 111320 * Math.PI / 180))], ZOOM);
    }
  }, [hexes, myUserId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Draw hexes as SVG overlay — simplified for global view
    // Each hex covers ~1km, so we map hex pixel coords to lat/lng
    const svgBounds: L.LatLngBounds[] = [];
    hexes.forEach(h => {
      const [px, py] = hexToPixel(h.q, h.r, HEX_SIZE);
      const lat = py / 1000;
      const lng = px / 1000;
      svgBounds.push(L.latLngBounds([lat - 0.005, lng - 0.005], [lat + 0.005, lng + 0.005]));
    });

    // For the global map, use L.circleMarker per hex (simpler, more performant at scale)
    hexes.forEach(h => {
      const [px, py] = hexToPixel(h.q, h.r, 1);
      const lat = py / 10;
      const lng = px / 10;
      const isMine = h.ownerUserId === myUserId;
      const color = isMine ? '#2ecc71' : (h.ownerUserId ? '#e74c3c' : '#95a5a6');

      L.circleMarker([lat, lng], {
        radius: 8,
        color: '#fff',
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1
      })
        .bindTooltip(`${h.owner?.username ?? 'Unclaimed'} | ⚔️ ${h.troops}`)
        .on('click', () => {
          if (!isMine && selectedRef.current) {
            const [fq, fr] = selectedRef.current;
            onAttack(fq, fr, h.q, h.r);
            selectedRef.current = null;
          } else if (isMine) {
            selectedRef.current = [h.q, h.r];
          }
        })
        .addTo(map);
    });
  }, [hexes, myUserId, onAttack]);

  return <div ref={containerRef} className="leaflet-map global-map" />;
}
