import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useHexGeometries } from '../../../hooks/useHexGeometries';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { usePlayerLayerStore } from '../../../stores/playerLayerStore';
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
  const players = usePlayerLayerStore((state) => state.players);
  const myUserId = usePlayerLayerStore((state) => state.myUserId);
  const tileKeys = useMemo(() => grid ? Object.keys(grid) : [], [grid]);

  const selectedSelectionType = useMemo<'none' | 'selectedFriendly' | 'selectedHostile'>(() => {
    if (!selectedHexKey || !grid) {
      return 'none';
    }

    const selectedCell = grid[selectedHexKey];
    const currentPlayer = players.find((player) => player.id === myUserId);

    if (!selectedCell?.ownerId || !currentPlayer) {
      return 'none';
    }

    if (selectedCell.ownerId === myUserId) {
      return 'selectedFriendly';
    }

    if (
      selectedCell.ownerAllianceId
      && currentPlayer.allianceId
      && selectedCell.ownerAllianceId === currentPlayer.allianceId
    ) {
      return 'selectedFriendly';
    }

    return 'selectedHostile';
  }, [grid, myUserId, players, selectedHexKey]);

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

    map.on('zoomend moveend viewreset rotate', handleUpdate);

    return () => {
      window.cancelAnimationFrame(frameId);
      overlayRef.current = null;
      overlay.remove();
      map.off('zoomend moveend viewreset rotate', handleUpdate);
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

  const visibleTileKeys = useMemo(() => {
    if (!mapBounds) {
      return tileKeys;
    }

    const bufferX = (mapBounds.maxX - mapBounds.minX) * 0.15;
    const bufferY = (mapBounds.maxY - mapBounds.minY) * 0.15;
    const minX = mapBounds.minX - bufferX;
    const maxX = mapBounds.maxX + bufferX;
    const minY = mapBounds.minY - bufferY;
    const maxY = mapBounds.maxY + bufferY;

    return tileKeys.filter((key) => {
      const geo = hexGeometries[key];
      if (!geo) {
        return false;
      }
      const [cx, cy] = geo.center;
      return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
    });
  }, [tileKeys, hexGeometries, mapBounds]);

  if (!svgRoot) {
    return null;
  }

  return createPortal(
    <>
      <g data-zoom-level={zoomCategory}>
        {showWorldDimMask ? (
          <WorldDimMask tileKeys={tileKeys} hexGeometries={hexGeometries} />
        ) : null}
        {visibleTileKeys.map((hexId) => {
          const geometry = hexGeometries[hexId];

          if (!geometry) {
            return null;
          }

          return (
            <HexTile
              key={hexId}
              hexId={hexId}
              geometry={geometry}
              isCurrent={hexId === currentHexKey}
              isSelected={hexId === selectedHexKey}
              onHexClick={handleHexClick}
            />
          );
        })}
      </g>
      <g className="hex-highlights" pointerEvents="none">
        {selectedHexKey && hexGeometries[selectedHexKey] && selectedHexKey !== currentHexKey ? (
          <polygon
            className={[
              'hex-selected-overlay',
              selectedSelectionType === 'selectedFriendly' ? 'hex-selection-friendly' : '',
              selectedSelectionType === 'selectedHostile' ? 'hex-selection-hostile' : '',
            ].filter(Boolean).join(' ')}
            data-hex-id={selectedHexKey}
            points={hexGeometries[selectedHexKey].points}
            fill="rgba(255,255,255,0.04)"
            stroke="#ffffff"
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
            fill="rgba(0,255,170,0.06)"
            stroke="#00ffaa"
            strokeWidth={2}
            strokeLinecap="round"
            pointerEvents="none"
          />
        ) : null}
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

  // Expand bounds to cover the full viewport at any rotation angle.
  // When the map rotates, the axis-aligned pixel bounds don't cover the
  // corners of the rotated view. Expanding by (diagonal - side) / 2
  // ensures the mask outer rectangle covers everything at any bearing.
  const width = max.x - min.x;
  const height = max.y - min.y;
  const diagonal = Math.sqrt(width * width + height * height);
  const expandX = (diagonal - width) / 2;
  const expandY = (diagonal - height) / 2;

  return {
    minX: min.x - expandX,
    minY: min.y - expandY,
    maxX: max.x + expandX,
    maxY: max.y + expandY,
  };
}
