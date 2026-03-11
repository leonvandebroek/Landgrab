import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import i18n from '../../i18n';
import type { GlobalHex } from '../../types/game';
import { hexToLatLng } from '../map/HexMath';

interface Props {
  hexes: GlobalHex[];
  myUserId: string;
  onAttack: (fromQ: number, fromR: number, toQ: number, toR: number) => void;
}

const ZOOM = 13;

export function GlobalMap({ hexes, myUserId, onAttack }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectedRef = useRef<[number, number] | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoom: ZOOM });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00a9 OpenStreetMap contributors'
    }).addTo(map);
    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || hexes.length === 0) return;

    // Center on player's first hex
    const myHex = hexes.find(h => h.ownerUserId === myUserId);
    if (myHex) {
      const [lat, lng] = hexToLatLng(myHex.q, myHex.r);
      map.setView([lat, lng], ZOOM);
    }
  }, [hexes, myUserId]);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    // Clear previous markers before redrawing
    layerGroup.clearLayers();

    // For the global map, use L.circleMarker per hex (simpler, more performant at scale)
    hexes.forEach(h => {
      const [lat, lng] = hexToLatLng(h.q, h.r);
      const isMine = h.ownerUserId === myUserId;
      const color = isMine ? '#2ecc71' : (h.ownerUserId ? '#e74c3c' : '#95a5a6');

      L.circleMarker([lat, lng], {
        radius: 8,
        color: '#fff',
        fillColor: color,
        fillOpacity: 0.8,
        weight: 1
      })
        .bindTooltip(`${h.owner?.username ?? i18n.t('map.unclaimed')} | \u2694\ufe0f ${h.troops}`)
        .on('click', () => {
          if (!isMine && selectedRef.current) {
            const [fq, fr] = selectedRef.current;
            onAttack(fq, fr, h.q, h.r);
            selectedRef.current = null;
          } else if (isMine) {
            selectedRef.current = [h.q, h.r];
          }
        })
        .addTo(layerGroup);
    });
  }, [hexes, myUserId, onAttack]);

  return <div ref={containerRef} className="leaflet-map global-map" />;
}
