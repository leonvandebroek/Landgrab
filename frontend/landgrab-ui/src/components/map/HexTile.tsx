import { memo, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEffectsStore } from '../../stores/effectsStore';
import { useGameStore } from '../../stores/gameStore';
import { usePlayerLayerStore } from '../../stores/playerLayerStore';
import type { HexCell, Player } from '../../types/game';
import { iconHtml } from '../../utils/gameIcons';
import type { HexPixelGeometry } from '../../hooks/useHexGeometries';
import { TroopBadge } from './TroopBadge';
import {
  getHexBorderStyle,
  getHexFillStyle,
  getHexOwnerColor,
  getHexPolygonClassName,
  getHexTerritoryStatus,
} from '../game/map/hexRendering';

interface HexTileProps {
  hexId: string;
  geometry: HexPixelGeometry;
  isCurrent: boolean;
  isSelected: boolean;
  onHexClick?: (q: number, r: number) => void;
}

const DEFAULT_OWNER_COLOR = '#4f8cff';
const HEX_NEIGHBOR_OFFSETS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const FORT_BUILD_DURATION_MS = 10 * 60 * 1000;
type HexPolygonStyle = CSSProperties & { 
  '--hex-owner-color': string;
  '--hex-player-highlight-color'?: string;
};
const EMPTY_NEIGHBORS: Array<HexCell | undefined> = [];

let cachedPlayers: Player[] = [];
let cachedPlayersById = new Map<string, Player>();

function getPlayersById(players: Player[]): ReadonlyMap<string, Player> {
  if (players !== cachedPlayers) {
    cachedPlayers = players;
    cachedPlayersById = new Map(players.map((player) => [player.id, player]));
  }

  return cachedPlayersById;
}

export const HexTile = memo(function HexTile({ hexId, geometry, isCurrent, isSelected, onHexClick }: HexTileProps) {
  const cell = useGameStore((state) => (state.gridOverride ?? state.gameState?.grid)?.[hexId] ?? null);
  const isHQ = useGameStore(
    (state) => (state.gameState?.alliances ?? []).some(
      (alliance) => `${alliance.hqHexQ ?? ''},${alliance.hqHexR ?? ''}` === hexId,
    ),
  );
  const neighborCells = useGameStore(useShallow((state) => {
    const grid = state.gridOverride ?? state.gameState?.grid;
    if (!grid) return EMPTY_NEIGHBORS;
    const parsed = parseHexId(hexId);
    if (!parsed) return EMPTY_NEIGHBORS;
    const [q, r] = parsed;
    return HEX_NEIGHBOR_OFFSETS.map(([dq, dr]) => grid[`${q + dq},${r + dr}`]) as Array<HexCell | undefined>;
  }));
  const hasGridOverride = useGameStore((state) => state.gridOverride !== null);
  // isInactive = full fading (ReviewStep preview only)
  const isInactive = hasGridOverride && !cell;
  const isContested = useEffectsStore((state) => state.contestedHexKeys.has(hexId));
  const hasActiveRaid = useGameStore(
    (state) => (state.gameState?.activeRaids ?? []).some(
      (raid) => `${raid.targetQ},${raid.targetR}` === hexId,
    ),
  );
  const players = usePlayerLayerStore((state) => state.players);
  const myUserId = usePlayerLayerStore((state) => state.myUserId);

  const handleClick = useCallback(() => {
    if (cell && onHexClick) {
      onHexClick(cell.q, cell.r);
    }
  }, [onHexClick, cell]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  const playersById = getPlayersById(players);

  const myPlayer = playersById.get(myUserId);

  const isMine = Boolean(cell?.ownerId && cell.ownerId === myUserId);
  const isFriendlyAllianceCell = Boolean(
    cell?.ownerAllianceId
    && myPlayer?.allianceId
    && cell.ownerAllianceId === myPlayer.allianceId,
  );
  const isHostile = Boolean(cell?.ownerId && cell.ownerId !== myUserId && !isFriendlyAllianceCell);

  const neighborhoodGrid = useMemo<Record<string, HexCell>>(() => {
    const grid: Record<string, HexCell> = {};

    if (cell) {
      grid[hexId] = cell;
    }

    for (const neighborCell of neighborCells) {
      if (!neighborCell) {
        continue;
      }

      grid[`${neighborCell.q},${neighborCell.r}`] = neighborCell;
    }

    return grid;
  }, [cell, hexId, neighborCells]);

  const radius = useMemo(() => {
    const firstPoint = geometry.points.split(' ')[0];
    if (!firstPoint) return 30;
    const [x, y] = firstPoint.split(',').map(Number);
    const dx = x - geometry.center[0];
    const dy = y - geometry.center[1];
    return Math.sqrt(dx * dx + dy * dy);
  }, [geometry]);

  // Scale elements if hex is small to prevent overlap
  const scale = Math.min(1.0, Math.max(0.5, radius / 35));

  const slots = useMemo(() => {
    const R = radius;
    // Push further out (0.6) to avoid badge overlap, but scale ensures fit
    const f = 0.6; 
    
    return {
      center: { x: geometry.center[0], y: geometry.center[1] },
      topRight: { x: geometry.center[0] + R * f, y: geometry.center[1] - R * f },
      topLeft: { x: geometry.center[0] - R * f, y: geometry.center[1] - R * f },
    };
  }, [geometry.center, radius]);

  if (!cell) {
    return null;
  }

  const ownerColor = getHexOwnerColor(cell, playersById, cell.ownerColor ?? DEFAULT_OWNER_COLOR);
  const territoryStatus = getHexTerritoryStatus(cell, neighborhoodGrid, false);
  const engineerBuildProgress = !cell.isFort && !isInactive
    ? getEngineerBuildProgress(cell.engineerBuiltAt)
    : null;
  const fillStyle = getHexFillStyle({
    cell,
    isContested: territoryStatus.isContested || isContested,
    isInactive,
    isHQ,
    ownerColor,
  });
  const borderStyle = getHexBorderStyle({
    cell,
    isCurrentHex: isCurrent,
    isFrontier: territoryStatus.isFrontier,
    isEngineeringInProgress: engineerBuildProgress != null,
    isHQ,
    isInactive,
    isSelected,
    ownerColor,
  });
  const polygonClassName = [
    getHexPolygonClassName({
      cell,
      cellKey: hexId,
      isCurrentHex: isCurrent,
      isFrontier: territoryStatus.isFrontier,
      isHQ,
      isInactive,
      isMine,
      isSelected,
      isContested: territoryStatus.isContested || isContested,
      newlyClaimedKeys: EMPTY_KEYS,
      newlyRevealedKeys: EMPTY_KEYS,
      shouldShowBorderEffects: true,
    }),
    borderStyle.animationClass ?? '',
  ].filter(Boolean).join(' ');
  const showTroopBadge = !isInactive
    && (Boolean(cell.ownerId) || cell.isMasterTile)
    && (cell.troops > 0 || cell.isFort || isHQ || cell.isMasterTile || territoryStatus.isFrontier);
  const polygonStyle: HexPolygonStyle = {
    '--hex-owner-color': ownerColor,
    '--hex-player-highlight-color': myPlayer?.allianceColor ?? myPlayer?.color ?? '#22d3ee',
  } as HexPolygonStyle;

  return (
    <g
      className="hex-tile"
      data-hex-id={hexId}
      data-troops={cell.troops}
      data-inactive={isInactive ? '1' : undefined}
      data-center-x={geometry.center[0]}
      data-center-y={geometry.center[1]}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <polygon
        className={polygonClassName}
        data-hex-id={hexId}
        points={geometry.points}
        fill={fillStyle.fillColor}
        fillOpacity={fillStyle.fillOpacity}
        stroke={borderStyle.borderColor}
        strokeWidth={borderStyle.borderWeight}
        strokeOpacity={borderStyle.borderOpacity}
        strokeDasharray={borderStyle.dashArray}
        style={polygonStyle}
      />

      {isContested && !isInactive && (
        <polygon
          points={geometry.points}
          fill="rgba(255,51,51,0.15)"
          stroke="none"
          pointerEvents="none"
          className="hex-threat-breathe"
          aria-hidden="true"
        />
      )}

      {isHQ && !cell.isMasterTile && !isInactive && (
        <text
          x={slots.center.x}
          y={slots.center.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.floor(radius * 0.35)}
          fill={ownerColor}
          opacity={0.80}
          pointerEvents="none"
          aria-hidden="true"
        >
          [HQ]
        </text>
      )}

      {cell.isFort && !cell.isMasterTile && !isHQ && !isInactive && (
        <text
          x={slots.center.x}
          y={slots.center.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.floor(radius * 0.35)}
          fill={ownerColor}
          opacity={0.80}
          pointerEvents="none"
          aria-hidden="true"
        >
          [F]
        </text>
      )}

      {isCurrent && !isInactive && (
        <text
          x={slots.center.x}
          y={slots.center.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.floor(radius * 0.7)}
          fill="#00ffaa"
          opacity={0.7}
          pointerEvents="none"
          className="hex-gps-crosshair"
          aria-hidden="true"
        >
          [·]
        </text>
      )}

      {/* Raid Marker: Top Left */}
      {hasActiveRaid && !isInactive ? (
        <>
          <polygon
            className="hex-commando-raid-overlay"
            data-hex-id={hexId}
            points={geometry.points}
            fill="#ef4444"
            fillOpacity={0.15}
            stroke="#ef4444"
            strokeWidth={3}
            strokeOpacity={0.95}
            pointerEvents="none"
          />
          {renderForeignObject({
            className: 'hex-fo-raid hex-commando-raid-marker',
            x: slots.topLeft.x - (13 * scale),
            y: slots.topLeft.y - (13 * scale),
            width: 26 * scale,
            height: 26 * scale,
            html: iconHtml('archeryTarget'),
          })}
        </>
      ) : null}

      {/* Fort Progress: Top Right */}
      {engineerBuildProgress != null ? renderForeignObject({
        className: 'hex-fo-progress hex-fort-progress',
        x: slots.topRight.x - (18 * scale),
        y: slots.topRight.y - (18 * scale),
        width: 36 * scale,
        height: 36 * scale,
        html: `<div class="fort-progress-ring" style="--progress:${engineerBuildProgress.toFixed(4)}"></div>`,
      }) : null}

      {/* Troop Badge: Always Center */}
      {showTroopBadge ? (
        <foreignObject
          className="hex-fo-badge"
          x={slots.center.x - (19 * scale)}
          y={slots.center.y - (19 * scale)}
          width={38 * scale}
          height={38 * scale}
          pointerEvents="none"
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <TroopBadge
              troops={cell.troops}
              ownerColor={ownerColor}
              isFort={cell.isFort}
              isHQ={isHQ}
              isMasterTile={cell.isMasterTile}
              isForestBlind={false}
              isEnemy={cell.ownerId ? isHostile : undefined}
              q={cell.q}
              r={cell.r}
              showCoords={false}
            />
          </div>
        </foreignObject>
      ) : null}

      {/* TODO: At zoom > 17, inject coordinate label DivIcon here */}
    </g>
  );
});

function parseHexId(hexId: string): [number, number] | null {
  const delimiter = hexId.includes(',') ? ',' : ':';
  const [qText, rText] = hexId.split(delimiter);
  const q = Number(qText);
  const r = Number(rText);

  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    return null;
  }

  return [q, r];
}

function getEngineerBuildProgress(engineerBuiltAt?: string): number | null {
  if (!engineerBuiltAt) {
    return null;
  }

  const builtAtMs = Date.parse(engineerBuiltAt);
  if (!Number.isFinite(builtAtMs)) {
    return null;
  }

  return Math.max(0, Math.min(1, (Date.now() - builtAtMs) / FORT_BUILD_DURATION_MS));
}

function renderForeignObject({
  className,
  x,
  y,
  width,
  height,
  html,
}: {
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
  html: string;
}) {
  return (
    <foreignObject
      className={className}
      x={x}
      y={y}
      width={width}
      height={height}
      pointerEvents="none"
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: `${height}px`, // Ensure 1em SVGs fill the container
          fontFamily: '"Rajdhani", system-ui, sans-serif',
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </foreignObject>
  );
}

const EMPTY_KEYS = new Set<string>();
