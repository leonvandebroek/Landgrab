import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { useEffectsStore } from '../../stores/effectsStore';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores/gameplayStore';
import type { HexCell } from '../../types/game';
import { iconHtml } from '../../utils/gameIcons';
import { terrainIcons } from '../../utils/terrainIcons';

interface HexTooltipOverlayProps {
  map: L.Map;
}

interface TooltipPosition {
  x: number;
  y: number;
}

const HEX_LAYER_PANE = 'game-map-hex-pane';
const OVERLAY_PANE = 'overlayPane';

export function HexTooltipOverlay({ map }: HexTooltipOverlayProps) {
  const { t } = useTranslation();
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const cell = useGameStore(useCallback(
    (state) => {
      const grid = state.gridOverride ?? state.gameState?.grid;
      return hoveredHex ? grid?.[hoveredHex] ?? null : null;
    },
    [hoveredHex],
  ));
  const currentHexKey = useGameplayStore((state) => state.currentHexKey);
  const isContested = useEffectsStore(useCallback(
    (state) => {
      if (!hoveredHex) {
        return false;
      }

      return state.contestedEdges.some((edge) => edge.hexKeyA === hoveredHex || edge.hexKeyB === hoveredHex);
    },
    [hoveredHex],
  ));

  useEffect(() => {
    const eventRoot = map.getPane(HEX_LAYER_PANE) ?? map.getPane(OVERLAY_PANE);
    if (!eventRoot) {
      return;
    }

    const handlePointerMove = (event: MouseEvent) => {
      const hexElement = findHexElement(event.target);
      if (!hexElement) {
        setHoveredHex(null);
        setPosition(null);
        return;
      }

      const hexId = hexElement.getAttribute('data-hex-id');
      if (!hexId) {
        setHoveredHex(null);
        setPosition(null);
        return;
      }

      const containerPoint = map.mouseEventToContainerPoint(event);
      setHoveredHex(hexId);
      setPosition({ x: containerPoint.x, y: containerPoint.y });
    };

    const handlePointerLeave = () => {
      setHoveredHex(null);
      setPosition(null);
    };

    eventRoot.addEventListener('mousemove', handlePointerMove);
    eventRoot.addEventListener('mouseleave', handlePointerLeave);

    return () => {
      eventRoot.removeEventListener('mousemove', handlePointerMove);
      eventRoot.removeEventListener('mouseleave', handlePointerLeave);
    };
  }, [map]);

  const currentHex = useMemo(() => parseHexKey(currentHexKey), [currentHexKey]);

  if (!cell || !position) {
    return null;
  }

  return createPortal(
    <div
      className="hex-tooltip-card"
      style={{
        left: position.x,
        pointerEvents: 'none',
        position: 'absolute',
        top: position.y,
        transform: 'translate(-50%, calc(-100% - 12px))',
        zIndex: 800,
      }}
    >
      <TooltipCard cell={cell} currentHex={currentHex} isContested={isContested} t={t} />
    </div>,
    map.getContainer(),
  );
}

interface TooltipCardProps {
  cell: HexCell;
  currentHex: [number, number] | null;
  isContested: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}

function TooltipCard({ cell, currentHex, isContested, t }: TooltipCardProps) {
  const translate = t as unknown as (key: string, options?: { defaultValue?: string }) => string;
  const terrainType = cell.terrainType ?? 'None';
  const terrainIconName = terrainType !== 'None' ? terrainIcons[terrainType] : '';
  const distance = currentHex ? getHexDistance([cell.q, cell.r], currentHex) : null;
  const ownerColor = cell.ownerColor ?? 'transparent';

  return (
    <div className="tooltip-card">
      <div className="tooltip-header">
        <span className="tooltip-terrain-icon">
          {terrainIconName ? <IconMarkup markup={iconHtml(terrainIconName, 'sm')} /> : null}
          {terrainType !== 'None' ? ` ${translate(`terrain.${terrainType}`)}` : ''}
        </span>
      </div>
      <div className="tooltip-owner">
        <span className="tooltip-owner-swatch" style={{ background: ownerColor }} />
        <span>
          {cell.ownerName ?? translate('map.unclaimed')}
          {cell.isMasterTile ? <> <IconMarkup markup={iconHtml('crown', 'sm')} /></> : null}
        </span>
      </div>
      <div className="tooltip-stat">
        <span className="tooltip-stat-icon"><IconMarkup markup={iconHtml('contested', 'sm')} /></span>
        {cell.troops}
      </div>
      {cell.isFort ? (
        <div className="tooltip-stat">
          <span className="tooltip-stat-icon"><IconMarkup markup={iconHtml('fort', 'sm')} /></span>
          {translate('map.fort', { defaultValue: 'Fort' })}
        </div>
      ) : null}
      {isContested ? (
        <div className="tooltip-stat">
          <span className="tooltip-stat-icon"><IconMarkup markup={iconHtml('contested', 'sm')} /></span>
          {translate('map.contestedLabel', { defaultValue: 'Contested' })} - {translate('map.contestedDescription', { defaultValue: 'borders enemy territory' })}
        </div>
      ) : null}
      {distance != null ? (
        <div className="tooltip-distance">{distance} hex{distance !== 1 ? 'es' : ''}</div>
      ) : null}
    </div>
  );
}

function IconMarkup({ markup }: { markup: string }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

function findHexElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest('[data-hex-id]');
}

function parseHexKey(hexKey: string | null): [number, number] | null {
  if (!hexKey) {
    return null;
  }

  const delimiter = hexKey.includes(',') ? ',' : ':';
  const [qText, rText] = hexKey.split(delimiter);
  const q = Number(qText);
  const r = Number(rText);

  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    return null;
  }

  return [q, r];
}

function getHexDistance(a: [number, number], b: [number, number]): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs((a[0] + a[1]) - (b[0] + b[1])),
  );
}
