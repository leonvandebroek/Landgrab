import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useHexGeometries } from '../../../hooks/useHexGeometries';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { ReactSvgOverlay } from '../ReactSvgOverlay';
import { HexTile } from '../HexTile';
import { WorldDimMask } from '../WorldDimMask';
import type { MapLayerPreferences } from '../../../types/mapLayerPreferences';

interface GameOverlayLayerProps {
  map: L.Map;
  mapLat: number;
  mapLng: number;
  tileSizeMeters: number;
  onHexClick?: (q: number, r: number) => void;
  layerPreferences: MapLayerPreferences;
  showWorldDimMask?: boolean;
}

const HEX_PANE = 'game-map-hex-pane';
const OVERLAY_PANE = 'overlayPane';

function GameOverlayLayerComponent({
  map,
  mapLat,
  mapLng,
  tileSizeMeters,
  onHexClick,
  layerPreferences,
  showWorldDimMask = false,
}: GameOverlayLayerProps) {
  const overlayRef = useRef<ReactSvgOverlay | null>(null);
  const [svgRoot, setSvgRoot] = useState<SVGGElement | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(() => map.getZoom());
  const [mapBounds, setMapBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(
    () => getMapBounds(map),
  );

  const grid = useGameStore((state) => state.gridOverride ?? state.gameState?.grid);
  const selectedHexKey = useGameplayStore((state) => state.selectedHexKey);
  const currentHexKey = useGameplayStore((state) => state.currentHexKey);
  const tileKeys = useMemo(() => grid ? Object.keys(grid) : [], [grid]);

  const hexGeometries = useHexGeometries(
    map,
    tileKeys,
    mapLat,
    mapLng,
    tileSizeMeters,
    zoomLevel,
  );

  const overlayClassName = useMemo(() => {
    const hiddenClasses: string[] = [];

    if (!layerPreferences.troopBadges) {
      hiddenClasses.push('hide-troop-badges');
    }
    if (!layerPreferences.borderEffects) {
      hiddenClasses.push('hide-border-effects');
    }

    return hiddenClasses.join(' ');
  }, [
    layerPreferences.borderEffects,
    layerPreferences.troopBadges,
  ]);
  const initialOverlayClassNameRef = useRef(overlayClassName);

  useEffect(() => {
    const pane = map.getPane(HEX_PANE) ? HEX_PANE : OVERLAY_PANE;
    const overlay = new ReactSvgOverlay({ pane, className: initialOverlayClassNameRef.current });
    overlayRef.current = overlay;
    overlay.addTo(map);
    const frameId = window.requestAnimationFrame(() => {
      setSvgRoot(overlay.getContainer());
      setZoomLevel(map.getZoom());
      const nextBounds = getMapBounds(map);
      if (nextBounds) {
        setMapBounds(nextBounds);
      }
    });

    const handleUpdate = () => {
      setZoomLevel(map.getZoom());
      const nextBounds = getMapBounds(map);
      if (nextBounds) {
        setMapBounds(nextBounds);
      }
    };

    map.on('zoomend moveend viewreset', handleUpdate);

    return () => {
      window.cancelAnimationFrame(frameId);
      overlayRef.current = null;
      overlay.remove();
      map.off('zoomend moveend viewreset', handleUpdate);
    };
  }, [map]);

  useEffect(() => {
    overlayRef.current?.setClassName(overlayClassName);
  }, [overlayClassName]);

  const zoomCategory = useMemo(() => {
    if (zoomLevel < 14) return 'strategic';
    if (zoomLevel < 16) return 'tactical';
    return 'detailed';
  }, [zoomLevel]);

  const handleHexClick = useCallback((q: number, r: number) => {
    onHexClick?.(q, r);
  }, [onHexClick]);

  if (!svgRoot || !mapBounds) {
    return null;
  }

  return createPortal(
    <>
      <defs>
        <pattern
          id="fort-hatch-pattern"
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
        </pattern>
      </defs>
      <g data-zoom-level={zoomCategory}>
        {showWorldDimMask ? (
          <WorldDimMask
          tileKeys={tileKeys}
          hexGeometries={hexGeometries}
          mapBounds={mapBounds}
        />
      ) : null}
      {tileKeys.map((key) => {
        const geometry = hexGeometries[key];
        if (!geometry) return null;

        return (
          <HexTile
            key={key}
            hexId={key}
            geometry={geometry}
            isCurrent={currentHexKey === key}
            isSelected={selectedHexKey === key}
            onHexClick={handleHexClick}
          />
        );
      })}
      <g className="hex-highlights" style={{ pointerEvents: 'none' }}>
        {selectedHexKey && hexGeometries[selectedHexKey] && selectedHexKey !== currentHexKey ? (
          <polygon
            className="hex-selected-overlay"
            data-hex-id={selectedHexKey}
            points={hexGeometries[selectedHexKey].points}
            fill="rgba(34, 211, 238, 0.06)"
            stroke="#22d3ee"
            strokeWidth={2}
            strokeDasharray="6 8"
            strokeLinecap="round"
            pointerEvents="none"
          />
        ) : null}
        {currentHexKey && hexGeometries[currentHexKey] ? (
          <polygon
            className="hex-active-player is-current-player-hex"
            data-hex-id={currentHexKey}
            points={hexGeometries[currentHexKey].points}
            fill="rgba(46, 204, 113, 0.08)"
            stroke="#2ecc71"
            strokeWidth={2.5}
            strokeDasharray="10 6"
            strokeLinecap="round"
            pointerEvents="none"
          />
        ) : null}
      </g>
    </g>
    </>,
    svgRoot,
  );
}

export const GameOverlayLayer = memo(GameOverlayLayerComponent);

function getMapBounds(map: L.Map): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const pixelBounds = map.getPixelBounds();
  const pixelOrigin = map.getPixelOrigin();
  const minPoint = pixelBounds.min;
  const maxPoint = pixelBounds.max;
  if (!minPoint || !maxPoint) {
    return null;
  }

  const min = minPoint.subtract(pixelOrigin);
  const max = maxPoint.subtract(pixelOrigin);

  return {
    minX: min.x,
    minY: min.y,
    maxX: max.x,
    maxY: max.y,
  };
}
