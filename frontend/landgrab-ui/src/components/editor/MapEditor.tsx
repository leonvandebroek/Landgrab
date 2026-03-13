import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HexCoordinate } from '../../types/game';
import {
  latLngToRoomHex,
  roomHexCornerLatLngs,
  hexKey,
} from '../map/HexMath';
import { createPdokBaseLayers } from '../map/pdokLayers';

// ── Constants ────────────────────────────────────────────────────────
const DEFAULT_CENTER: L.LatLngExpression = [52.09, 5.12]; // Netherlands
const DEFAULT_ZOOM = 16;
const HEX_SELECTED_COLOR = '#3498db';
const HEX_SELECTED_OPACITY = 0.45;
const HEX_HOVER_COLOR = '#5dade2';
const HEX_HOVER_OPACITY = 0.35;

type EditorMode = 'draw' | 'navigate';

// ── Handle (imperative API) ──────────────────────────────────────────
export interface MapEditorHandle {
  flyTo(lat: number, lng: number): void;
}

// ── Props ────────────────────────────────────────────────────────────
interface MapEditorProps {
  coordinates: HexCoordinate[];
  onCoordinatesChange: (coords: HexCoordinate[]) => void;
  tileSizeMeters: number;
  centerLat: number | null;
  centerLng: number | null;
  onCenterChange: (lat: number, lng: number) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function toKeySet(coords: HexCoordinate[]): Set<string> {
  return new Set(coords.map((c) => hexKey(c.q, c.r)));
}

function toCoordArray(keys: Set<string>): HexCoordinate[] {
  return Array.from(keys).map((k) => {
    const [q, r] = k.split(',').map(Number);
    return { q, r };
  });
}

function getHexPolygonLatLngs(
  q: number,
  r: number,
  mapLat: number,
  mapLng: number,
  tileSizeMeters: number
): L.LatLngExpression[] {
  return roomHexCornerLatLngs(q, r, mapLat, mapLng, tileSizeMeters).map(
    ([lat, lng]) => [lat, lng] as L.LatLngExpression
  );
}

// ── Component ────────────────────────────────────────────────────────
export const MapEditor = forwardRef<MapEditorHandle, MapEditorProps>(function MapEditor({
  coordinates,
  onCoordinatesChange,
  tileSizeMeters,
  centerLat,
  centerLng,
  onCenterChange,
}: MapEditorProps, ref) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hexLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const hoverLayerRef = useRef<L.LayerGroup>(L.layerGroup());
  const lastHoverKeyRef = useRef<string>('');

  // Mode: draw vs navigate
  const [mode, setMode] = useState<EditorMode>('navigate');
  const modeRef = useRef<EditorMode>('navigate');

  // Selected hexes as a Set<"q,r">
  const [selected, setSelected] = useState<Set<string>>(() => toKeySet(coordinates));
  const selectedRef = useRef<Set<string>>(toKeySet(coordinates));

  // Paint state for drag-drawing
  const paintState = useRef({
    active: false,
    adding: true,
    lastKey: '',
    pointerId: -1,
  });

  // Map center (origin for hex calculations)
  const mapCenter = useRef<{ lat: number; lng: number }>({
    lat: centerLat ?? (DEFAULT_CENTER as number[])[0],
    lng: centerLng ?? (DEFAULT_CENTER as number[])[1],
  });

  // Keep tileSizeMeters in a ref for non-React handlers
  const tileSizeRef = useRef(tileSizeMeters);
  useEffect(() => {
    tileSizeRef.current = tileSizeMeters;
    // Polygon corners change when tile size changes, so reset the hover cache
    lastHoverKeyRef.current = '';
  }, [tileSizeMeters]);

  // Keep mode ref in sync
  useEffect(() => {
    modeRef.current = mode;
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;

    if (mode === 'navigate') {
      map.dragging.enable();
      el.classList.remove('draw-mode');
    } else {
      map.dragging.disable();
      el.classList.add('draw-mode');
    }
  }, [mode]);

  // ── Sync parent coords → internal Set when parent pushes new coordinates ──
  const [prevCoordinates, setPrevCoordinates] = useState(coordinates);
  if (coordinates !== prevCoordinates) {
    setPrevCoordinates(coordinates);
    const newSet = toKeySet(coordinates);
    setSelected(newSet);
    selectedRef.current = newSet;
  }

  // ── Notify parent whenever internal selection changes ──
  const onChangeRef = useRef(onCoordinatesChange);
  useEffect(() => {
    onChangeRef.current = onCoordinatesChange;
  }, [onCoordinatesChange]);
  const prevSerializedRef = useRef('');

  useEffect(() => {
    const serialized = Array.from(selected).sort().join('|');
    if (serialized === prevSerializedRef.current) return;
    prevSerializedRef.current = serialized;
    onChangeRef.current(toCoordArray(selected));
  }, [selected]);

  // ── Render hex polygons on the Leaflet map ──
  const renderHexes = useCallback(() => {
    const layer = hexLayerRef.current;
    layer.clearLayers();
    const center = mapCenter.current;
    const tileSize = tileSizeRef.current;
    const sel = selectedRef.current;

    sel.forEach((key) => {
      const [q, r] = key.split(',').map(Number);
      const corners = getHexPolygonLatLngs(q, r, center.lat, center.lng, tileSize);
      L.polygon(corners, {
        color: HEX_SELECTED_COLOR,
        weight: 2,
        fillColor: HEX_SELECTED_COLOR,
        fillOpacity: HEX_SELECTED_OPACITY,
        interactive: false,
      }).addTo(layer);
    });
  }, []);

  // ── Determine hex under a lat/lng point ──
  const getHexAtLatLng = useCallback((lat: number, lng: number): string => {
    const center = mapCenter.current;
    const [q, r] = latLngToRoomHex(lat, lng, center.lat, center.lng, tileSizeRef.current);
    return hexKey(q, r);
  }, []);

  // ── Toggle a hex on/off ──
  const toggleHex = useCallback((key: string, forceAdd?: boolean) => {
    setSelected((prev) => {
      const adding = forceAdd !== undefined ? forceAdd : !prev.has(key);
      if (adding && prev.has(key)) return prev;
      if (!adding && !prev.has(key)) return prev;

      const next = new Set(prev);
      if (adding) next.add(key);
      else next.delete(key);
      selectedRef.current = next;
      return next;
    });
  }, []);

  // ── Show hover hex preview ──
  const showHoverHex = useCallback((lat: number, lng: number) => {
    const center = mapCenter.current;
    const tileSize = tileSizeRef.current;
    const [q, r] = latLngToRoomHex(lat, lng, center.lat, center.lng, tileSize);
    const key = hexKey(q, r);

    // Skip re-render if the pointer is still within the same hex
    if (key === lastHoverKeyRef.current) return;
    lastHoverKeyRef.current = key;

    const hover = hoverLayerRef.current;
    hover.clearLayers();
    const corners = getHexPolygonLatLngs(q, r, center.lat, center.lng, tileSize);
    L.polygon(corners, {
      color: HEX_HOVER_COLOR,
      weight: 2,
      fillColor: HEX_HOVER_COLOR,
      fillOpacity: HEX_HOVER_OPACITY,
      interactive: false,
      dashArray: '6 4',
    }).addTo(hover);
  }, []);

  // ── Initialize Leaflet map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCenter: L.LatLngExpression =
      centerLat != null && centerLng != null
        ? [centerLat, centerLng]
        : DEFAULT_CENTER;

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
      attributionControl: true,
    });

    // Add tile layers
    const baseLayers = createPdokBaseLayers();
    baseLayers.brtStandard.addTo(map);

    const osmLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }
    );

    const layerControl = L.control.layers(
      {
        [i18n.t('map.layerBrtStandard')]: baseLayers.brtStandard,
        [i18n.t('map.layerBrtGray')]: baseLayers.brtGray,
        [i18n.t('map.layerTopo')]: baseLayers.top25,
        [i18n.t('map.layerOsm')]: osmLayer,
      },
      {},
      { position: 'topright' }
    );
    layerControl.addTo(map);

    // Add hex layers
    hexLayerRef.current.addTo(map);
    hoverLayerRef.current.addTo(map);

    // Disable double-click zoom (interferes with fast drawing)
    map.doubleClickZoom.disable();

    mapRef.current = map;

    // If no center was provided, set it from the map's current center
    if (centerLat == null || centerLng == null) {
      const c = map.getCenter();
      mapCenter.current = { lat: c.lat, lng: c.lng };
      onCenterChange(c.lat, c.lng);
    }

    // ── Pointer interaction handlers ──

    const latLngFromEvent = (e: PointerEvent): L.LatLng | null => {
      const rect = containerRef.current!.getBoundingClientRect();
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
      return map.containerPointToLatLng(point);
    };

    const mapContainer = map.getContainer();

    const onPointerDown = (e: PointerEvent) => {
      if (modeRef.current !== 'draw') return;
      if (e.button !== 0) return;

      const latLng = latLngFromEvent(e);
      if (!latLng) return;

      const key = getHexAtLatLng(latLng.lat, latLng.lng);
      const adding = !selectedRef.current.has(key);

      paintState.current = {
        active: true,
        adding,
        lastKey: key,
        pointerId: e.pointerId,
      };

      mapContainer.setPointerCapture(e.pointerId);
      toggleHex(key, adding);
      e.preventDefault();
      e.stopPropagation();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (modeRef.current !== 'draw') return;

      const latLng = latLngFromEvent(e);
      if (!latLng) return;

      // Show hover preview
      showHoverHex(latLng.lat, latLng.lng);

      // Paint if active
      const ps = paintState.current;
      if (!ps.active || e.pointerId !== ps.pointerId) return;

      const key = getHexAtLatLng(latLng.lat, latLng.lng);
      if (key === ps.lastKey) return;
      ps.lastKey = key;
      toggleHex(key, ps.adding);
    };

    const onPointerUp = (e: PointerEvent) => {
      const ps = paintState.current;
      if (ps.active && e.pointerId === ps.pointerId) {
        ps.active = false;
        ps.pointerId = -1;
        try {
          mapContainer.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    };

    const onPointerLeave = () => {
      hoverLayerRef.current.clearLayers();
      lastHoverKeyRef.current = '';
    };

    const onContextMenu = (e: Event) => {
      e.preventDefault();
    };

    mapContainer.addEventListener('pointerdown', onPointerDown);
    mapContainer.addEventListener('pointermove', onPointerMove);
    mapContainer.addEventListener('pointerup', onPointerUp);
    mapContainer.addEventListener('pointercancel', onPointerUp);
    mapContainer.addEventListener('pointerleave', onPointerLeave);
    mapContainer.addEventListener('contextmenu', onContextMenu);

    // Initial render of hexes
    renderHexes();

    return () => {
      mapContainer.removeEventListener('pointerdown', onPointerDown);
      mapContainer.removeEventListener('pointermove', onPointerMove);
      mapContainer.removeEventListener('pointerup', onPointerUp);
      mapContainer.removeEventListener('pointercancel', onPointerUp);
      mapContainer.removeEventListener('pointerleave', onPointerLeave);
      mapContainer.removeEventListener('contextmenu', onContextMenu);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Re-render hexes when selection or tile size changes ──
  useEffect(() => {
    renderHexes();
  }, [selected, tileSizeMeters, renderHexes]);

  // ── Fly to a location (called from toolbar search) ──
  const flyTo = useCallback((lat: number, lng: number) => {
    mapCenter.current = { lat, lng };
    onCenterChange(lat, lng);
    mapRef.current?.flyTo([lat, lng], DEFAULT_ZOOM, { duration: 1.2 });

    // Clear existing hexes and hover cache since the center (origin) changed
    setSelected(new Set());
    selectedRef.current = new Set();
    hoverLayerRef.current.clearLayers();
    lastHoverKeyRef.current = '';
  }, [onCenterChange]);

  // Expose flyTo imperatively via a typed ref
  useImperativeHandle(ref, () => ({ flyTo }), [flyTo]);

  // ── Mode toggle handler ──
  const handleModeToggle = useCallback((newMode: EditorMode) => {
    setMode(newMode);
    // Clear hover when switching to navigate
    if (newMode === 'navigate') {
      hoverLayerRef.current.clearLayers();
      lastHoverKeyRef.current = '';
    }
  }, []);

  // ── Keyboard shortcut: press E to toggle draw, press N for navigate ──
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'e' || e.key === 'E') {
        handleModeToggle('draw');
      } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
        handleModeToggle('navigate');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleModeToggle]);

  const drawHint = mode === 'draw'
    ? t('mapEditor.drawHintDraw')
    : t('mapEditor.drawHintNavigate');

  return (
    <div className="map-editor-canvas map-editor-canvas--leaflet">
      <div ref={containerRef} className="map-editor-leaflet-container" />

      <div className="map-editor-draw-hint">{drawHint}</div>

      {/* Mode toggle */}
      <div className="map-editor-mode-toggle">
        <button
          type="button"
          className={`map-editor-mode-btn ${mode === 'navigate' ? 'map-editor-mode-btn--active' : ''}`}
          onClick={() => handleModeToggle('navigate')}
        >
          <span className="map-editor-mode-icon">&#9995;</span> {t('mapEditor.modeNavigate')}
        </button>
        <button
          type="button"
          className={`map-editor-mode-btn ${mode === 'draw' ? 'map-editor-mode-btn--active' : ''}`}
          onClick={() => handleModeToggle('draw')}
        >
          <span className="map-editor-mode-icon">&#9998;</span> {t('mapEditor.modeDraw')}
        </button>
      </div>
    </div>
  );
});
