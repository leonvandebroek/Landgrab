import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GameState, HexCell } from '../../types/game';
import {
  hexCornerPoints, hexToPixel, hexKey, hexSpiral
} from './HexMath';

interface Props {
  state: GameState;
  myUserId: string;
  onHexClick: (q: number, r: number, cell: HexCell | undefined) => void;
  selectedHex: [number, number] | null;
}

// Hex visual size in pixels at the game's reference zoom level
const HEX_SIZE = 38;
const REFERENCE_ZOOM = 16;

export function GameMap({ state, myUserId, onHexClick, selectedHex }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const svgLayerRef = useRef<SVGSVGElement | null>(null);
  const overlayRef = useRef<L.SVGOverlay | null>(null);

  // Compute the pixel bounding box of the hex grid at REFERENCE_ZOOM
  const computeSvgBounds = useCallback((map: L.Map) => {
    const radius = state.gridRadius + 2;
    const allPixels = hexSpiral(radius).flatMap(([q, r]) => {
      const [px, py] = hexToPixel(q, r, HEX_SIZE);
      return [[px - HEX_SIZE, py - HEX_SIZE], [px + HEX_SIZE, py + HEX_SIZE]];
    });
    const xs = allPixels.map(p => p[0]);
    const ys = allPixels.map(p => p[1]);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);

    // Convert grid-pixel offsets to Leaflet LatLng
    const centerPt = map.project([state.mapLat!, state.mapLng!], REFERENCE_ZOOM);
    const sw = map.unproject([centerPt.x + minX, centerPt.y + maxY], REFERENCE_ZOOM);
    const ne = map.unproject([centerPt.x + maxX, centerPt.y + minY], REFERENCE_ZOOM);
    return L.latLngBounds(sw, ne);
  }, [state.mapLat, state.mapLng, state.gridRadius]);

  // Draw all hex polygons into the SVG layer
  const drawGrid = useCallback((svg: SVGSVGElement, map: L.Map) => {
    svg.innerHTML = '';
    const bounds = overlayRef.current?.getBounds();
    if (!bounds) return;

    const sw = map.project(bounds.getSouthWest(), REFERENCE_ZOOM);
    const ne = map.project(bounds.getNorthEast(), REFERENCE_ZOOM);
    const svgW = ne.x - sw.x;
    const svgH = sw.y - ne.y;

    svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
    svg.setAttribute('width', String(svgW));
    svg.setAttribute('height', String(svgH));

    const centerPt = map.project([state.mapLat!, state.mapLng!], REFERENCE_ZOOM);
    const offX = centerPt.x - sw.x;
    const offY = centerPt.y - ne.y;

    const currentPlayer = state.players[state.currentPlayerIndex % state.players.length];

    for (const [q, r] of hexSpiral(state.gridRadius)) {
      const [px, py] = hexToPixel(q, r, HEX_SIZE);
      const cx = px + offX;
      const cy = py + offY;

      const key = hexKey(q, r);
      const cell: HexCell | undefined = state.grid[key];

      const isSelected = selectedHex?.[0] === q && selectedHex?.[1] === r;
      const isMine = cell?.ownerId === myUserId;
      const isEmpty = !cell?.ownerId;
      const isEnemy = cell?.ownerId && cell.ownerId !== myUserId;

      // Fill color
      let fill = '#e8f4f8';
      if (cell?.ownerColor) fill = cell.ownerColor + (isMine ? 'ee' : '99');
      if (isEmpty) fill = '#f0f4f8cc';

      // Glow for interactive hexes on current player's turn
      const isMyTurn = currentPlayer?.id === myUserId;
      let stroke = '#ffffff44';
      let strokeWidth = 1;
      if (isSelected) { stroke = '#ffffff'; strokeWidth = 3; }
      else if (isMyTurn && (state.phase === 'Claim' || state.phase === 'Reinforce')) {
        if (isMine) { stroke = '#ffffffaa'; strokeWidth = 2; }
        else if (isEmpty) { stroke = '#2ecc71aa'; strokeWidth = 2; }
        else if (isEnemy) { stroke = '#e74c3caa'; strokeWidth = 2; }
      }

      const points = hexCornerPoints(cx, cy, HEX_SIZE - 1);

      const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', points);
      poly.setAttribute('fill', fill);
      poly.setAttribute('stroke', stroke);
      poly.setAttribute('stroke-width', String(strokeWidth));
      poly.setAttribute('data-q', String(q));
      poly.setAttribute('data-r', String(r));
      poly.style.cursor = 'pointer';
      poly.style.transition = 'fill 0.2s';

      poly.addEventListener('click', () => onHexClick(q, r, cell));

      svg.appendChild(poly);

      // Troop count label
      if (cell?.troops && cell.troops > 0) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + 5));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '13');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', '#fff');
        text.setAttribute('pointer-events', 'none');
        text.setAttribute('style', 'text-shadow: 0 1px 2px #000;');
        text.textContent = String(cell.troops);
        svg.appendChild(text);
      }
    }
  }, [state, myUserId, selectedHex, onHexClick]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [state.mapLat ?? 51.505, state.mapLng ?? -0.09],
      zoom: REFERENCE_ZOOM,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    mapRef.current = map;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update map center when location is set
  useEffect(() => {
    if (!mapRef.current || state.mapLat === null) return;
    mapRef.current.setView([state.mapLat, state.mapLng!], REFERENCE_ZOOM);
  }, [state.mapLat, state.mapLng]);

  // Create / update SVG overlay whenever grid bounds change (map location / radius)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || state.mapLat === null) return;

    const bounds = computeSvgBounds(map);

    if (overlayRef.current) {
      overlayRef.current.setBounds(bounds);
    } else {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.overflow = 'visible';
      svgLayerRef.current = svg;

      const overlay = L.svgOverlay(svg, bounds, { interactive: true, zIndex: 400 });
      overlay.addTo(map);
      overlayRef.current = overlay;
    }
  }, [state.mapLat, state.mapLng, state.gridRadius, computeSvgBounds]);

  // Redraw SVG polygon content when game state or selection changes
  useEffect(() => {
    const map = mapRef.current;
    const svg = svgLayerRef.current;
    if (!map || !svg || Object.keys(state.grid).length === 0) return;

    drawGrid(svg, map);

    const onMove = () => drawGrid(svg, map);
    map.on('zoomend moveend', onMove);
    return () => { map.off('zoomend moveend', onMove); };
  }, [drawGrid, state.grid]);

  return (
    <div className="game-map-container">
      <div ref={containerRef} className="leaflet-map" />
    </div>
  );
}
