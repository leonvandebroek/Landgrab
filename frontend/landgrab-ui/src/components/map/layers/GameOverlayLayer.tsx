import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useHexGeometries } from '../../../hooks/useHexGeometries';
import { useGameStore } from '../../../stores/gameStore';
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
    if (!layerPreferences.terrainIcons) {
      hiddenClasses.push('hide-terrain-icons');
    }
    if (!layerPreferences.buildingIcons) {
      hiddenClasses.push('hide-building-icons');
    }
    if (!layerPreferences.borderEffects) {
      hiddenClasses.push('hide-border-effects');
    }

    return hiddenClasses.join(' ');
  }, [
    layerPreferences.borderEffects,
    layerPreferences.buildingIcons,
    layerPreferences.terrainIcons,
    layerPreferences.troopBadges,
  ]);

  useEffect(() => {
    const pane = map.getPane(HEX_PANE) ? HEX_PANE : OVERLAY_PANE;
    const overlay = new ReactSvgOverlay({ pane, className: overlayClassName });
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
  }, [map, overlayClassName]);

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
            onHexClick={handleHexClick}
          />
        );
      })}
    </g>,
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
