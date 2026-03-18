import { memo, useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEffectsStore } from '../../stores/effectsStore';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores/gameplayStore';
import { usePlayerLayerStore } from '../../stores/playerLayerStore';
import type { HexCell, Player } from '../../types/game';
import { gameIcons, iconHtml } from '../../utils/gameIcons';
import { terrainIcons } from '../../utils/terrainIcons';
import type { HexPixelGeometry } from '../../hooks/useHexGeometries';
import { TroopBadge } from './TroopBadge';
import {
  getHexBorderStyle,
  getHexFillStyle,
  getHexOwnerColor,
  getHexPolygonClassName,
  getHexTerritoryStatus,
  isFogHiddenHex,
  shouldHideTroopCountInForest,
  shouldRenderTerrainIcon,
} from '../game/map/hexRendering';

interface HexTileProps {
  hexId: string;
  geometry: HexPixelGeometry;
  onHexClick?: (q: number, r: number) => void;
}

const DEFAULT_OWNER_COLOR = '#4f8cff';
const DEFAULT_HOST_COLOR = '#f1c40f';
const HEX_NEIGHBOR_OFFSETS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const FORT_BUILD_DURATION_MS = 10 * 60 * 1000;
type HexPolygonStyle = CSSProperties & { '--hex-owner-color': string };
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

export const HexTile = memo(function HexTile({ hexId, geometry, onHexClick }: HexTileProps) {
  const cell = useGameStore((state) => (state.gridOverride ?? state.gameState?.grid)?.[hexId] ?? null);
  const isSelected = useGameplayStore((state) => state.selectedHexKey === hexId);
  const isCurrent = useGameplayStore((state) => state.currentHexKey === hexId);
  const dynamics = useGameStore(useShallow((state) => state.gameState?.dynamics));
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
  const isSupplyDisconnected = useEffectsStore((state) => state.disconnectedHexKeys.has(hexId));
  const hasGridOverride = useGameStore((state) => state.gridOverride !== null);
  // isInactive = full fading (ReviewStep preview only); supply disconnection uses subtle overlay
  const isInactive = isSupplyDisconnected && hasGridOverride;
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
  const myAllianceId = myPlayer?.allianceId;

  const isMine = Boolean(cell?.ownerId && cell.ownerId === myUserId);
  const isHostile = Boolean(cell?.ownerId && cell.ownerId !== myUserId && !isMine);

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

  if (!cell) {
    return null;
  }

  const terrainType = cell.terrainType ?? 'None';
  const terrainIcon = terrainIcons[terrainType];
  const ownerColor = getHexOwnerColor(cell, playersById, cell.ownerColor ?? DEFAULT_OWNER_COLOR);
  const territoryStatus = getHexTerritoryStatus(cell, neighborhoodGrid, false);
  const isFogHidden = isFogHiddenHex(cell, isInactive, dynamics?.fogOfWarEnabled);
  const hasTerrain = Boolean(dynamics?.terrainEnabled && terrainType !== 'None');
  const fillStyle = getHexFillStyle({
    cell,
    hasTerrain,
    isFogHidden,
    isInactive,
    ownerColor,
    hostColor: DEFAULT_HOST_COLOR,
    terrainType,
  });
  const borderStyle = getHexBorderStyle({
    cell,
    isCurrentHex: isCurrent,
    isFogHidden,
    isHQ,
    isHostile,
    isInactive,
    isSelected,
  });
  const polygonClassName = getHexPolygonClassName({
    cell,
    cellKey: hexId,
    isCurrentHex: isCurrent,
    isFrontier: territoryStatus.isFrontier,
    isHQ,
    isInactive,
    isMine,
    isSelected,
    isSupplyDisconnected,
    isContested: territoryStatus.isContested || isContested,
    newlyClaimedKeys: EMPTY_KEYS,
    newlyRevealedKeys: EMPTY_KEYS,
    shouldShowBorderEffects: true,
    shouldShowSupplyLines: true,
    supplyLinesEnabled: dynamics?.supplyLinesEnabled,
    hqEnabled: dynamics?.hqEnabled,
  });
  const shouldShowTerrainMarker = shouldRenderTerrainIcon({
    cell,
    isFogHidden,
    isInactive,
    shouldShowBuildingIcons: true,
    shouldShowTerrainIcons: true,
    terrainIcon,
    terrainType,
    terrainEnabled: dynamics?.terrainEnabled,
  });
  const isForestBlind = shouldHideTroopCountInForest({
    cell,
    myAllianceId,
    myUserId,
    terrainEnabled: dynamics?.terrainEnabled,
  });
  const showTroopBadge = !isInactive && !isFogHidden && (Boolean(cell.ownerId) || cell.isMasterTile);
  const engineerBuildProgress = !cell.isFort && !isInactive && !isFogHidden
    ? getEngineerBuildProgress(cell.engineerBuiltAt)
    : null;
  const terrainMarkerHtml = shouldShowTerrainMarker && terrainIcon ? iconHtml(terrainIcon, 'sm') : null;
  const polygonStyle: HexPolygonStyle = {
    '--hex-owner-color': ownerColor,
  };

  return (
    <g
      className="hex-tile"
      data-hex-id={hexId}
      data-troops={cell.troops}
      data-inactive={isInactive ? '1' : undefined}
      data-fog={isFogHidden ? '1' : undefined}
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

      {isSelected ? (
        <polygon
          className="hex-selected-overlay"
          data-hex-id={hexId}
          points={geometry.points}
          fill="rgba(34, 211, 238, 0.12)"
          stroke="#22d3ee"
          strokeWidth={4}
          strokeOpacity={0.95}
          pointerEvents="none"
        />
      ) : null}

      {isCurrent ? (
        <polygon
          className="hex-active-player is-current-player-hex"
          data-hex-id={hexId}
          points={geometry.points}
          fill="rgba(46, 204, 113, 0.16)"
          stroke="#2ecc71"
          strokeWidth={5}
          strokeOpacity={0.95}
          strokeDasharray="10 6"
          pointerEvents="none"
        />
      ) : null}

      {isSupplyDisconnected && !isInactive && !isFogHidden ? (
        <polygon
          className="hex-disconnected-overlay"
          data-hex-id={hexId}
          points={geometry.points}
          fill="transparent"
          fillOpacity={0}
          stroke="rgba(214, 225, 240, 0.72)"
          strokeWidth={2}
          strokeOpacity={0.9}
          strokeDasharray="6 5"
          pointerEvents="none"
        />
      ) : null}

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
            x: geometry.center[0] - 13,
            y: geometry.center[1] - 13,
            width: 26,
            height: 26,
            html: iconHtml('archeryTarget'),
          })}
        </>
      ) : null}

      {terrainMarkerHtml ? renderForeignObject({
        className: `hex-fo-terrain hex-terrain-icon${showTroopBadge ? ' hex-terrain-icon--offset' : ''}`,
        x: showTroopBadge ? geometry.center[0] + 4 : geometry.center[0] - 11,
        y: showTroopBadge ? geometry.center[1] - 24 : geometry.center[1] - 11,
        width: showTroopBadge ? 18 : 22,
        height: showTroopBadge ? 18 : 22,
        html: terrainMarkerHtml,
      }) : null}

      {engineerBuildProgress != null ? renderForeignObject({
        className: 'hex-fo-progress hex-fort-progress',
        x: geometry.center[0] - 18,
        y: geometry.center[1] - 18,
        width: 36,
        height: 36,
        html: `<div class="fort-progress-ring" style="--progress:${engineerBuildProgress.toFixed(4)}"></div>`,
      }) : null}

      {cell.isFort && !isInactive && !isFogHidden ? renderForeignObject({
        className: 'hex-fo-fort hex-fort-icon-wrapper',
        x: geometry.center[0] - 9,
        y: geometry.center[1] - 9,
        width: 18,
        height: 18,
        html: iconHtml('fort', 'sm'),
      }) : null}

      {cell.isMasterTile && !isInactive && !isFogHidden ? renderForeignObject({
        className: 'hex-fo-building hex-building-icon',
        x: geometry.center[0] - 14,
        y: geometry.center[1] - 14,
        width: 28,
        height: 28,
        html: `<div class="building master" aria-hidden="true">${gameIcons.master}</div>`,
      }) : null}

      {isHQ && !cell.isMasterTile && !isInactive && !isFogHidden ? renderForeignObject({
        className: 'hex-fo-building hex-building-icon',
        x: geometry.center[0] - 14,
        y: geometry.center[1] - 14,
        width: 28,
        height: 28,
        html: iconHtml('hq'),
      }) : null}

      {showTroopBadge ? (
        <foreignObject
          className="hex-fo-badge"
          x={geometry.center[0] - 19}
          y={geometry.center[1] - 19}
          width={38}
          height={38}
          pointerEvents="none"
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TroopBadge
              troops={cell.troops}
              ownerColor={ownerColor}
              isFort={cell.isFort}
              isHQ={isHQ}
              isMasterTile={cell.isMasterTile}
              isForestBlind={isForestBlind}
            />
          </div>
        </foreignObject>
      ) : null}
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
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </foreignObject>
  );
}

const EMPTY_KEYS = new Set<string>();
