import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { useEffectsStore } from '../../stores/effectsStore';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores/gameplayStore';
import type { HexCell } from '../../types/game';
import { iconHtml } from '../../utils/gameIcons';

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
  const isTouchDeviceRef = useRef(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const clearHoveredHex = useCallback(() => {
    setHoveredHex(null);
    setPosition(null);
  }, []);

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

    const handleTouchStart = () => {
      if (!isTouchDeviceRef.current) {
        isTouchDeviceRef.current = true;
        setIsTouchDevice(true);
      }
      clearHoveredHex();
    };

    const handlePointerMove = (event: MouseEvent) => {
      if (isTouchDeviceRef.current) {
        return;
      }

      const hexElement = findHexElement(event.target);
      if (!hexElement) {
        clearHoveredHex();
        return;
      }

      const hexId = hexElement.getAttribute('data-hex-id');
      if (!hexId) {
        clearHoveredHex();
        return;
      }

      const containerPoint = map.mouseEventToContainerPoint(event);
      setHoveredHex(hexId);
      setPosition({ x: containerPoint.x, y: containerPoint.y });
    };

    const handleTouchClick = (event: MouseEvent) => {
      if (!isTouchDeviceRef.current) {
        return;
      }

      const hexElement = findHexElement(event.target);
      if (!hexElement) {
        clearHoveredHex();
        return;
      }

      const hexId = hexElement.getAttribute('data-hex-id');
      if (!hexId) {
        clearHoveredHex();
        return;
      }

      setHoveredHex(hexId);
      setPosition(null);
    };

    const handlePointerLeave = () => {
      clearHoveredHex();
    };

    eventRoot.addEventListener('mousemove', handlePointerMove);
    eventRoot.addEventListener('click', handleTouchClick);
    eventRoot.addEventListener('mouseleave', handlePointerLeave);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    return () => {
      eventRoot.removeEventListener('mousemove', handlePointerMove);
      eventRoot.removeEventListener('click', handleTouchClick);
      eventRoot.removeEventListener('mouseleave', handlePointerLeave);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [clearHoveredHex, map]);

  const currentHex = useMemo(() => parseHexKey(currentHexKey), [currentHexKey]);

  useEffect(() => {
    const cardElement = cardRef.current;
    if (!cardElement) {
      return;
    }

    if (isTouchDevice) {
      cardElement.style.removeProperty('left');
      cardElement.style.removeProperty('top');
      cardElement.style.removeProperty('position');
      cardElement.style.removeProperty('transform');
      cardElement.style.pointerEvents = 'auto';
      cardElement.style.zIndex = '800';
      return;
    }

    if (!position) {
      return;
    }

    cardElement.style.left = `${position.x}px`;
    cardElement.style.pointerEvents = 'none';
    cardElement.style.position = 'absolute';
    cardElement.style.top = `${position.y}px`;
    cardElement.style.transform = 'translate(-50%, calc(-100% - 12px))';
    cardElement.style.zIndex = '800';
  }, [isTouchDevice, position]);

  if (!cell || (!isTouchDevice && !position)) {
    return null;
  }

  const cardClassName = isTouchDevice
    ? 'hex-tooltip-card hex-tooltip-card--docked'
    : 'hex-tooltip-card';

  return createPortal(
    <div
      ref={cardRef}
      className={cardClassName}
    >
      <TooltipCard
        cell={cell}
        clearHoveredHex={clearHoveredHex}
        currentHex={currentHex}
        isContested={isContested}
        isTouchDevice={isTouchDevice}
        t={t}
      />
    </div>,
    map.getContainer(),
  );
}

interface TooltipCardProps {
  cell: HexCell;
  clearHoveredHex: () => void;
  currentHex: [number, number] | null;
  isContested: boolean;
  isTouchDevice: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}

function TooltipCard({ cell, clearHoveredHex, currentHex, isContested, isTouchDevice, t }: TooltipCardProps) {
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string;
  const distance = currentHex ? getHexDistance([cell.q, cell.r], currentHex) : null;
  const ownerColor = cell.ownerColor ?? '#888';
  const ownerName = cell.ownerName ?? translate('map.unclaimed');
  const threatLevel = cell.troops > 500
    ? translate('map.threatHigh', { defaultValue: 'THREAT: HIGH' })
    : cell.troops > 100
      ? translate('map.threatMed', { defaultValue: 'THREAT: MED' })
      : translate('map.threatLow', { defaultValue: 'THREAT: LOW' });

  return (
    <div className="tooltip-card">
      <div className="tooltip-header">
        <div className="tooltip-owner">
          <TooltipOwnerChevron ownerColor={ownerColor} />
          <span className="tooltip-callsign-prefix">
            {translate('map.tooltipCallsign', { defaultValue: 'ZONE: ' })}
          </span>
          <span className="tooltip-player-name">
            {ownerName}
          </span>
          {cell.isMasterTile ? <IconMarkup markup={iconHtml('crown', 'sm')} /> : null}
        </div>
        {isTouchDevice ? (
          <button
            type="button"
            className="tooltip-dismiss-btn"
            onClick={clearHoveredHex}
            aria-label={translate('game.close', { defaultValue: 'Sluiten' })}
          >
            ✕
          </button>
        ) : null}
      </div>
      <div className="tooltip-stat tooltip-stat--troops">
        <span className="tooltip-stat-icon"><IconMarkup markup={iconHtml('helmet', 'sm')} /></span>
        <span>{cell.troops}</span>
      </div>
      <div className="tooltip-stat tooltip-coords">Q{cell.q} R{cell.r}</div>
      {cell.troops > 0 ? (
        <div className="tooltip-stat">
          <span className={`threat-level threat-level--${
            cell.troops > 500 ? 'high' : cell.troops > 100 ? 'med' : 'low'
          }`}>
            {threatLevel}
          </span>
        </div>
      ) : null}
      {cell.isFort ? (
        <div className="tooltip-stat">
          <span className="tooltip-stat-icon"><IconMarkup markup={iconHtml('fort', 'sm')} /></span>
          <span>{translate('map.fortStatus', { defaultValue: 'FORTIFIED' })}</span>
        </div>
      ) : null}
      {isContested ? (
        <div className="tooltip-stat">
          <span className="tooltip-stat-icon"><IconMarkup markup={iconHtml('contested', 'sm')} /></span>
          {translate('map.contestedLabel', { defaultValue: 'Contested' })} - {translate('map.contestedDescription', { defaultValue: 'borders enemy territory' })}
        </div>
      ) : null}
      {distance != null ? (
        <div className="tooltip-stat tooltip-distance">
          {translate('map.zones', {
            count: distance,
            defaultValue: distance === 1 ? '{{count}} zone' : '{{count}} zones',
          })}
        </div>
      ) : null}
    </div>
  );
}

function TooltipOwnerChevron({ ownerColor }: { ownerColor: string }) {
  const chevronRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const chevronElement = chevronRef.current;
    if (!chevronElement) {
      return;
    }

    chevronElement.style.background = ownerColor;
  }, [ownerColor]);

  return <div ref={chevronRef} className="tooltip-owner-chevron" aria-hidden="true" />;
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
