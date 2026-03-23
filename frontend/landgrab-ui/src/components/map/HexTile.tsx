import { memo, useCallback, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEffectsStore } from '../../stores/effectsStore';
import { useGameStore } from '../../stores/gameStore';
import { useGameplayStore } from '../../stores/gameplayStore';
import { usePlayerLayerStore } from '../../stores/playerLayerStore';
import type { ActiveCommandoRaid, AllianceDto, ClaimMode, GameDynamics, HexCell, Player } from '../../types/game';
import { iconHtml } from '../../utils/gameIcons';
import type { HexPixelGeometry } from '../../hooks/useHexGeometries';
import { TroopBadge } from './TroopBadge';
import { deriveTileState, type TileChip, type TricorderTileState } from './tricorderTileState';
import {
  getHexBorderStyle,
  getHexFillStyle,
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
type HexPolygonStyle = CSSProperties & { 
  '--hex-owner-color': string;
  '--hex-player-highlight-color'?: string;
};
const EMPTY_NEIGHBORS: Array<HexCell | undefined> = [];
const EMPTY_GRID: Record<string, HexCell> = {};
const EMPTY_RAIDS: ActiveCommandoRaid[] = [];
const EMPTY_ALLIANCES: AllianceDto[] = [];
const DEFAULT_CLAIM_MODE: ClaimMode = 'PresenceOnly';
const DEFAULT_DYNAMICS: GameDynamics = {
  playerRolesEnabled: false,
  beaconEnabled: false,
  hqEnabled: false,
  hqAutoAssign: false,
  tileDecayEnabled: false,
  enemySightingMemorySeconds: 0,
};

let cachedPlayers: Player[] = [];
let cachedPlayersById = new Map<string, Player>();
let cachedPlayersRecord: Record<string, Player> = {};
let cachedPlayerPositions = new Map<string, string[]>();

function getPlayersById(players: Player[]): ReadonlyMap<string, Player> {
  if (players !== cachedPlayers) {
    cachedPlayers = players;
    cachedPlayersById = new Map(players.map((player) => [player.id, player]));
    cachedPlayersRecord = Object.fromEntries(cachedPlayersById) as Record<string, Player>;
    cachedPlayerPositions = new Map<string, string[]>();

    for (const player of players) {
      if (!Number.isFinite(player.currentHexQ) || !Number.isFinite(player.currentHexR)) {
        continue;
      }

      const playerHexKey = `${player.currentHexQ},${player.currentHexR}`;
      const positionedPlayers = cachedPlayerPositions.get(playerHexKey) ?? [];
      positionedPlayers.push(player.id);
      cachedPlayerPositions.set(playerHexKey, positionedPlayers);
    }
  }

  return cachedPlayersById;
}

function getPlayersRecord(players: Player[]): Readonly<Record<string, Player>> {
  getPlayersById(players);
  return cachedPlayersRecord;
}

function getPlayerPositions(players: Player[]): ReadonlyMap<string, string[]> {
  getPlayersById(players);
  return cachedPlayerPositions;
}

export const HexTile = memo(function HexTile({ hexId, geometry, isCurrent, isSelected, onHexClick }: HexTileProps) {
  const cell = useGameStore((state) => (state.gridOverride ?? state.gameState?.grid)?.[hexId] ?? null);
  const isHQ = useGameStore(
    (state) => (state.gameState?.alliances ?? []).some(
      (alliance) => `${alliance.hqHexQ ?? ''},${alliance.hqHexR ?? ''}` === hexId,
    ),
  );
  const alliances = useGameStore((state) => state.gameState?.alliances ?? EMPTY_ALLIANCES);
  const activeRaids = useGameStore((state) => state.gameState?.activeRaids ?? EMPTY_RAIDS);
  const claimMode = useGameStore((state) => state.gameState?.claimMode ?? DEFAULT_CLAIM_MODE);
  const dynamics = useGameStore((state) => state.gameState?.dynamics ?? DEFAULT_DYNAMICS);
  const grid = useGameStore((state) => isSelected ? ((state.gridOverride ?? state.gameState?.grid) ?? EMPTY_GRID) : EMPTY_GRID);
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
  const contestedHexKeys = useEffectsStore((state) => state.contestedHexKeys);
  const players = usePlayerLayerStore((state) => state.players);
  const myUserId = usePlayerLayerStore((state) => state.myUserId);
  const currentHexKey = useGameplayStore((state) => state.currentHexKey);
  const selectedHexKey = useGameplayStore((state) => state.selectedHexKey);
  const beaconConeHexKeys = useGameplayStore((state) => state.beaconConeHexKeys);
  const fullGrid = useGameStore((state) => state.gridOverride ?? state.gameState?.grid ?? EMPTY_GRID);

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
  const playersRecord = getPlayersRecord(players);
  const playerPositions = getPlayerPositions(players);

  const myPlayer = playersById.get(myUserId);

  // Compute allied player hex keys for local visibility
  const alliedPlayerHexKeys = useMemo(() => {
    const keys = new Set<string>();
    const allianceId = myPlayer?.allianceId;
    for (const player of players) {
      const isAllied = player.id === myUserId
        || (allianceId && player.allianceId === allianceId);
      if (isAllied && player.currentHexQ != null && player.currentHexR != null) {
        keys.add(`${player.currentHexQ},${player.currentHexR}`);
      }
    }
    return keys;
  }, [players, myUserId, myPlayer]);

  // Compute alliance-owned hex keys for local visibility
  const allianceOwnedHexKeys = useMemo(() => {
    const keys = new Set<string>();
    const allianceId = myPlayer?.allianceId;
    if (!allianceId) {
      return keys;
    }
    for (const [key, cell] of Object.entries(fullGrid)) {
      if (cell.ownerId && cell.ownerAllianceId === allianceId) {
        keys.add(key);
      }
    }
    return keys;
  }, [fullGrid, myPlayer]);

  const tileState = useMemo(() => deriveTileState({
    cell: cell ?? undefined,
    hexKey: hexId,
    currentPlayerId: myUserId,
    currentPlayerAllianceId: myPlayer?.allianceId,
    playerHexKey: currentHexKey,
    currentHexKey,
    selectedHexKey,
    alliances,
    players: playersRecord,
    activeRaids,
    contestedHexKeys,
    grid,
    claimMode,
    dynamics,
    playerPositions,
    beaconConeHexKeys,
    alliedPlayerHexKeys,
    allianceOwnedHexKeys,
  }), [
    activeRaids,
    alliances,
    alliedPlayerHexKeys,
    allianceOwnedHexKeys,
    beaconConeHexKeys,
    cell,
    claimMode,
    contestedHexKeys,
    currentHexKey,
    dynamics,
    grid,
    hexId,
    myPlayer?.allianceId,
    myUserId,
    playerPositions,
    playersRecord,
    selectedHexKey,
  ]);

  const isMine = tileState.isMine;
  const isFriendlyAllianceCell = tileState.isAlly;
  const isHostile = tileState.baseState === 'enemy';

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
      topCenter: { x: geometry.center[0], y: geometry.center[1] - R * 0.68 },
      topRight: { x: geometry.center[0] + R * f, y: geometry.center[1] - R * f },
      topLeft: { x: geometry.center[0] - R * f, y: geometry.center[1] - R * f },
      bottomRight: { x: geometry.center[0] + R * 0.55, y: geometry.center[1] + R * 0.52 },
      bottomLeft: { x: geometry.center[0] - R * 0.55, y: geometry.center[1] + R * 0.52 },
    };
  }, [geometry.center, radius]);

  if (!cell) {
    return null;
  }

  const ownerColor = tileState.ownerColor ?? DEFAULT_OWNER_COLOR;
  const territoryStatus = getHexTerritoryStatus(cell, neighborhoodGrid, isFriendlyAllianceCell && false);
  const derivedIsHQ = tileState.structureState.type === 'hq' || isHQ;
  const isContested = tileState.urgencyState.isContested;
  const hasActiveRaid = tileState.urgencyState.hasActiveRaid;
  const showRaidObjective = hasActiveRaid && !isInactive;
  const showRallyObjective = !showRaidObjective && tileState.urgencyState.rallyObjective && !isInactive;
  const showContestedOverlay = !showRaidObjective && !showRallyObjective && isContested && !isInactive;
  const selectionType = tileState.relationState.selectionType;
  const structureGlyphClassName = getStructureGlyphClassName(tileState.structureState.type);
  const progressRing = getProgressRingDescriptor(tileState.progressState);
  const presenceChip = getPresenceChip(tileState.chips);
  const reachabilityChip = tileState.regenBlocked ? undefined : getReachabilityChip(tileState.chips);
  const fillStyle = getHexFillStyle({
    cell,
    isContested: territoryStatus.isContested || isContested,
    isInactive,
    isHQ: derivedIsHQ,
    ownerColor,
  });
  const borderStyle = getHexBorderStyle({
    cell,
    isCurrentHex: isCurrent,
    isFrontier: territoryStatus.isFrontier,
    isEngineeringInProgress: tileState.progressState.type === 'build',
    isHQ: derivedIsHQ,
    isInactive,
    isSelected,
    selectionType,
    ownerColor,
  });
  const polygonClassName = [
    getHexPolygonClassName({
      cell,
      cellKey: hexId,
      isCurrentHex: isCurrent,
      isFrontier: territoryStatus.isFrontier,
      isHQ: derivedIsHQ,
      isInactive,
      isMine,
      isSelected,
      selectionType,
      isContested: territoryStatus.isContested || isContested,
      newlyClaimedKeys: EMPTY_KEYS,
      newlyRevealedKeys: EMPTY_KEYS,
      shouldShowBorderEffects: true,
    }),
    borderStyle.animationClass ?? '',
    // Beacon cone tiles have visibilityTier === 'Hidden' on the raw cell but must render
    // as visible — skip the dark/desaturated overlay for them.
    (tileState.visibilityTier === 'Hidden' && !beaconConeHexKeys.has(hexId)) ? 'hex-hidden-hostile' : '',
    tileState.stalenessTier === 'fading' ? 'hex-fading' : tileState.stalenessTier === 'stale' ? 'hex-stale' : '',
  ].filter(Boolean).join(' ');
  const showTroopBadge = !isInactive
    && (Boolean(cell.ownerId) || cell.isMasterTile || tileState.visibilityTier === 'Remembered' || beaconConeHexKeys.has(hexId))
    && (tileState.badge.visible || cell.isFort || derivedIsHQ || cell.isMasterTile || territoryStatus.isFrontier);
  const polygonStyle: HexPolygonStyle = {
    '--hex-owner-color': ownerColor,
    '--hex-player-highlight-color': myPlayer?.allianceColor ?? myPlayer?.color ?? '#22d3ee',
  } as HexPolygonStyle;

  const amberStroke = tileState.stalenessTier === 'stale'
    ? { color: '#ffb000', opacity: 0.5 }
    : tileState.stalenessTier === 'fading'
      ? { color: '#ffb000', opacity: 0.25 }
      : null;
  const strokeColor = amberStroke?.color ?? borderStyle.borderColor;
  const strokeOpacity = amberStroke?.opacity ?? borderStyle.borderOpacity;

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
        stroke={strokeColor}
        strokeWidth={borderStyle.borderWeight}
        strokeOpacity={strokeOpacity}
        strokeDasharray={borderStyle.dashArray}
        style={polygonStyle}
      />

      {showRallyObjective ? renderForeignObject({
        className: 'hex-fo-halo',
        x: slots.center.x - (radius * 1.15),
        y: slots.center.y - (radius * 1.15),
        width: radius * 2.3,
        height: radius * 2.3,
        contentClassName: 'hex-halo-rally',
        contentStyle: {
          position: 'relative',
          top: 'auto',
          left: 'auto',
          transform: 'none',
          width: '100%',
          height: '100%',
        },
      }) : null}

      {showContestedOverlay && (
        <polygon
          points={geometry.points}
          fill="rgba(255, 255, 255, 0.12)"
          stroke="none"
          pointerEvents="none"
          className="hex-threat-breathe"
          aria-hidden="true"
        />
      )}

      {(tileState.stalenessTier === 'fading' || tileState.stalenessTier === 'stale') && (
        <polygon
          points={geometry.points}
          fill={tileState.stalenessTier === 'stale' ? 'rgba(255, 176, 0, 0.40)' : 'rgba(255, 176, 0, 0.20)'}
          stroke="none"
          pointerEvents="none"
          aria-hidden="true"
        />
      )}

      {tileState.regenBlocked && !isInactive ? (
        <polygon
          points={geometry.points}
          className="hex-indicator-corrupt"
          pointerEvents="none"
          aria-hidden="true"
        />
      ) : null}

      {structureGlyphClassName && !isInactive ? renderForeignObject({
        className: 'hex-fo-glyph',
        x: slots.topCenter.x - (14 * scale),
        y: slots.topCenter.y - (14 * scale),
        width: 28 * scale,
        height: 28 * scale,
        contentClassName: structureGlyphClassName,
        contentStyle: {
          position: 'relative',
          top: 'auto',
          left: 'auto',
          transform: 'none',
          width: '100%',
          height: '100%',
        },
      }) : null}

      {isCurrent && !isInactive && (
        <g
          className="hex-gps-crosshair"
          style={{ transformOrigin: `${slots.center.x}px ${slots.center.y}px` }}
        >
          <text
            x={slots.center.x}
            y={slots.center.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={Math.floor(radius * 0.7)}
            fill="#00ffaa"
            opacity={0.7}
            pointerEvents="none"
            aria-hidden="true"
          >
            [·]
          </text>
        </g>
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
            aria-hidden="true"
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

      {progressRing && !isInactive ? renderForeignObject({
        className: 'hex-fo-progress',
        x: slots.topRight.x - (18 * scale),
        y: slots.topRight.y - (18 * scale),
        width: 36 * scale,
        height: 36 * scale,
        contentClassName: progressRing.className,
        contentStyle: {
          '--progress': progressRing.progress.toFixed(4),
          '--ring-color': progressRing.color,
          position: 'relative',
          top: 'auto',
          left: 'auto',
          transform: 'none',
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
        } as CSSProperties,
        children: (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'conic-gradient(var(--ring-color) calc(var(--progress, 0) * 1turn), rgba(255,255,255,0.08) 0)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 0)',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 5px), #000 0)',
              opacity: 0.72,
            }}
          />
        ),
      }) : null}

      {presenceChip && !isInactive ? renderForeignObject({
        className: 'hex-fo-chip hex-fo-chip-left',
        x: slots.bottomLeft.x - (18 * scale),
        y: slots.bottomLeft.y - (11 * scale),
        width: Math.max(28, 16 + ((presenceChip.label?.length ?? 0) * 7)) * scale,
        height: 22 * scale,
        contentClassName: getChipClassName(presenceChip),
        contentStyle: {
          position: 'relative',
          top: 'auto',
          left: 'auto',
          transform: 'none',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
        },
        children: presenceChip.label,
      }) : null}

      {reachabilityChip && !isInactive ? renderForeignObject({
        className: 'hex-fo-chip hex-fo-chip-right',
        x: slots.bottomRight.x - (9 * scale),
        y: slots.bottomRight.y - (9 * scale),
        width: 18 * scale,
        height: 18 * scale,
        contentClassName: getChipClassName(reachabilityChip),
        contentStyle: {
          position: 'relative',
          top: 'auto',
          left: 'auto',
          transform: 'none',
          width: '100%',
          height: '100%',
        },
      }) : null}

      {tileState.presenceBoosted && !isInactive ? renderForeignObject({
        className: 'hex-fo-presence-boost',
        x: slots.center.x + (radius * 0.18) - (9 * scale),
        y: slots.center.y - (radius * 0.34) - (9 * scale),
        width: 18 * scale,
        height: 18 * scale,
        contentClassName: 'hex-presence-boost-indicator',
        contentStyle: {
          position: 'relative',
          top: 'auto',
          left: 'auto',
          transform: 'none',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        children: '↑',
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
          aria-hidden="true"
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
              troops={tileState.badge.count}
              ownerColor={ownerColor}
              isFort={tileState.structureState.type === 'fort'}
              isHQ={tileState.structureState.type === 'hq'}
              isMasterTile={tileState.structureState.type === 'master'}
              isForestBlind={tileState.strengthUnknown}
              isEnemy={tileState.isOwned ? isHostile : undefined}
              isStale={tileState.isRemembered}
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

function renderForeignObject({
  className,
  x,
  y,
  width,
  height,
  html,
  children,
  contentClassName,
  contentStyle,
}: {
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
  html?: string;
  children?: ReactNode;
  contentClassName?: string;
  contentStyle?: CSSProperties;
}) {
  return (
    <foreignObject
      className={className}
      x={x}
      y={y}
      width={width}
      height={height}
      pointerEvents="none"
      aria-hidden="true"
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
          fontSize: `${height}px`,
          fontFamily: '"Rajdhani", system-ui, sans-serif',
        }}
      >
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className={contentClassName} style={contentStyle}>
            {children}
          </div>
        )}
      </div>
    </foreignObject>
  );
}

const EMPTY_KEYS = new Set<string>();

function getStructureGlyphClassName(structureType: TricorderTileState['structureState']['type']): string | undefined {
  if (structureType === 'none') {
    return undefined;
  }

  return `hex-glyph-base hex-glyph-${structureType}`;
}

function getProgressRingDescriptor(progressState: TricorderTileState['progressState']) {
  if (progressState.type === 'none') {
    return undefined;
  }

  if (progressState.type === 'build') {
    return {
      className: 'hex-ring-base hex-ring-build',
      color: 'var(--hex-ring-build)',
      progress: progressState.progress,
    };
  }

  if (progressState.type === 'demolish') {
    return {
      className: 'hex-ring-base hex-ring-demolish',
      color: 'var(--hex-ring-demo)',
      progress: progressState.progress,
    };
  }

  return {
    className: 'hex-ring-base hex-ring-sabotage',
    color: 'var(--hex-ring-sab)',
    progress: progressState.progress,
  };
}

function getPresenceChip(chips: TileChip[]): TileChip | undefined {
  return chips.find((chip) => chip.type === 'presenceCritical' || chip.type === 'presenceSatisfied');
}

function getReachabilityChip(chips: TileChip[]): TileChip | undefined {
  return chips.find((chip) => chip.type === 'reachable' || chip.type === 'unreachable');
}

function getChipClassName(chip: TileChip): string {
  switch (chip.type) {
    case 'reachable':
      return 'hex-chip-base hex-chip-reachable';
    case 'unreachable':
      return 'hex-chip-base hex-chip-unreachable';
    case 'presenceCritical':
      return 'hex-chip-copresence hex-chip-copresence-critical';
    case 'presenceSatisfied':
      return 'hex-chip-copresence hex-chip-copresence-satisfied';
    default:
      return 'hex-chip-base';
  }
}
