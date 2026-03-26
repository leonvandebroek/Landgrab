import { getTileActions } from '../game/tileInteraction';
import type { ActiveCommandoRaid, AllianceDto, ClaimMode, GameDynamics, HexCell, Player } from '../../types/game';
import { isLocallyVisible } from '../../utils/localVisibility';

const COPRESENCE_TARGET_COUNT = 3;

export interface TricorderTileState {
  baseState: 'neutral' | 'allied' | 'enemy';
  visibilityTier: 'Visible' | 'Remembered' | 'Hidden';
  isRemembered: boolean;
  stalenessTier: 'live' | 'fading' | 'stale';
  strengthUnknown: boolean;
  presenceBoosted: boolean;
  relationState: {
    isCurrent: boolean;
    selectionType: 'none' | 'selectedFriendly' | 'selectedHostile';
    reachability: 'none' | 'reachable' | 'unreachable';
  };
  urgencyState: {
    isContested: boolean;
    hasActiveRaid: boolean;
    rallyObjective: boolean;
    rallyDeadline?: string;
  };
  progressState: {
    type: 'none' | 'build' | 'demolish' | 'sabotage';
    progress: number;
    stepsCompleted?: number;
    stepsRequired?: number;
  };
  structureState: {
    type: 'none' | 'hq' | 'fort' | 'master';
    isFortified: boolean;
  };
  chips: TileChip[];
  badge: {
    visible: boolean;
    count: number;
  };
  regenBlocked: boolean;
  regenBlockedUntil?: string;
  ownerColor?: string;
  isOwned: boolean;
  isMine: boolean;
  isAlly: boolean;
}

export type TileChipType =
  | 'presenceCritical'
  | 'presenceSatisfied'
  | 'reachable'
  | 'unreachable'
  | 'regenBlocked'
  | 'raidOnly';

export interface TileChip {
  type: TileChipType;
  label?: string;
}

export interface DeriveTileStateParams {
  cell: HexCell | undefined;
  hexKey: string;
  currentPlayerId: string;
  currentPlayerAllianceId?: string;
  playerHexKey: string | null;
  currentHexKey: string | null;
  selectedHexKey: string | null;
  alliances: AllianceDto[];
  players: Record<string, Player>;
  activeRaids: ActiveCommandoRaid[];
  contestedHexKeys: Set<string>;
  grid: Record<string, HexCell>;
  claimMode?: ClaimMode;
  dynamics?: GameDynamics;
  playerPositions?: ReadonlyMap<string, string[]>;
  beaconConeHexKeys?: ReadonlySet<string>;
  alliedPlayerHexKeys?: ReadonlySet<string>;
  allianceOwnedHexKeys?: ReadonlySet<string>;
}

export function deriveTileState(params: DeriveTileStateParams): TricorderTileState {
  const {
    hexKey,
    currentPlayerId,
    currentPlayerAllianceId,
    playerHexKey,
    currentHexKey,
    selectedHexKey,
    alliances,
    players,
    activeRaids,
    contestedHexKeys,
    grid,
    claimMode,
    dynamics,
    playerPositions,
    beaconConeHexKeys,
    alliedPlayerHexKeys,
    allianceOwnedHexKeys,
  } = params;

  const cell = params.cell ?? grid[hexKey];
  const now = Date.now();
  const ownerPlayer = cell?.ownerId ? players[cell.ownerId] : undefined;
  const currentPlayer = players[currentPlayerId];
  const isMine = Boolean(cell?.ownerId && cell.ownerId === currentPlayerId);
  const isAlly = Boolean(
    cell?.ownerAllianceId
    && currentPlayerAllianceId
    && cell.ownerAllianceId === currentPlayerAllianceId
    && !isMine,
  );
  const isOwned = Boolean(cell?.ownerId);
  const ownerColor = ownerPlayer?.allianceColor ?? ownerPlayer?.color ?? cell?.ownerColor;
  const baseState: TricorderTileState['baseState'] = !isOwned
    ? 'neutral'
    : (isMine || isAlly)
      ? 'allied'
      : 'enemy';
  const isAlliedCell = isMine || isAlly;
  const presenceBoosted = isAlliedCell && hexKey === playerHexKey;

  // Beacon cone bypass must be resolved before strengthUnknown so that enemy
  // Hidden tiles inside the cone show the real troop count (not '?').
  const serverTier = cell?.visibilityTier ?? 'Visible';
  const locallyVisible = alliedPlayerHexKeys && allianceOwnedHexKeys
    ? isLocallyVisible(hexKey, alliedPlayerHexKeys, allianceOwnedHexKeys, grid, beaconConeHexKeys)
    : false;
  const visibilityTierEarly = locallyVisible ? 'Visible' : serverTier;
  const isInBeaconConeEarly = Boolean(beaconConeHexKeys?.has(hexKey));
  const strengthUnknown = !isInBeaconConeEarly && getStrengthUnknownState({
    cell,
    baseState,
    visibilityTier: visibilityTierEarly,
  });

  const relationState: TricorderTileState['relationState'] = {
    isCurrent: hexKey === currentHexKey,
    selectionType: hexKey === selectedHexKey
      ? baseState === 'enemy'
        ? 'selectedHostile'
        : baseState === 'allied'
          ? 'selectedFriendly'
          : 'none'
      : 'none',
    reachability: getReachabilityState({
      cell,
      currentHexKey,
      currentPlayer,
      dynamics,
      grid,
      hexKey,
      claimMode,
      selectedHexKey,
    }),
  };

  const currentAlliance = currentPlayerAllianceId
    ? alliances.find((alliance) => alliance.id === currentPlayerAllianceId)
    : undefined;
  const relevantRallyPlayerIds = new Set(
    currentAlliance?.memberIds.length
      ? currentAlliance.memberIds
      : [currentPlayerId],
  );
  const rallyPlayers = Object.values(players).filter((player) =>
    player.rallyPointActive
    && player.rallyPointQ === cell?.q
    && player.rallyPointR === cell?.r
    && relevantRallyPlayerIds.has(player.id),
  );
  const rallyDeadline = getEarliestFutureIso(
    rallyPlayers
      .map((player) => player.rallyPointDeadline)
      .filter((value): value is string => Boolean(value)),
    now,
  );

  const urgencyState: TricorderTileState['urgencyState'] = {
    isContested: contestedHexKeys.has(hexKey),
    hasActiveRaid: activeRaids.some((raid) => `${raid.targetQ},${raid.targetR}` === hexKey),
    rallyObjective: rallyPlayers.length > 0,
    rallyDeadline,
  };

  const progressState = getProgressState(cell, hexKey, currentPlayer);

  const isHQ = Boolean(cell) && alliances.some(
    (alliance) => alliance.hqHexQ === cell.q && alliance.hqHexR === cell.r,
  );
  const structureState: TricorderTileState['structureState'] = {
    type: cell?.isMasterTile
      ? 'master'
      : isHQ
        ? 'hq'
        : cell?.isFort
          ? 'fort'
          : 'none',
    isFortified: Boolean(cell?.isFortified),
  };

  const regenBlockedUntil = isFutureIso(cell?.sabotagedUntil, now) ? cell?.sabotagedUntil : undefined;
  const regenBlocked = Boolean(regenBlockedUntil);
  const chips: TileChip[] = [];
  const copresenceChip = getCopresenceChip({
    hexKey,
    currentPlayerId,
    currentPlayerAllianceId,
    alliances,
    players,
    playerPositions,
  });

  if (copresenceChip) {
    chips.push(copresenceChip);
  }

  if (relationState.reachability === 'reachable') {
    chips.push({ type: 'reachable' });
  } else if (relationState.reachability === 'unreachable') {
    chips.push({ type: 'unreachable' });
  }

  if (regenBlocked) {
    chips.push({ type: 'regenBlocked' });
  }

  const visibilityTier = visibilityTierEarly;
  const isInBeaconCone = isInBeaconConeEarly;
  const isHidden = visibilityTier === 'Hidden' && !isInBeaconCone;
  const isRemembered = visibilityTier === 'Remembered' && !isInBeaconCone;

  // Amber Archive: Compute staleness tier for remembered enemy tiles
  const stalenessTier = computeStalenessTier(cell, isRemembered, baseState);

  const troopCount = isRemembered ? (cell?.lastKnownTroops ?? 0) : (cell?.troops ?? 0);

  // Hidden tiles reveal nothing
  if (isHidden) {
    return {
      baseState: 'neutral',
      visibilityTier,
      isRemembered,
      stalenessTier: 'live',
      strengthUnknown: true,
      presenceBoosted: false,
      relationState,
      urgencyState: { isContested: false, hasActiveRaid: false, rallyObjective: false },
      progressState: { type: 'none', progress: 0 },
      structureState: { type: 'none', isFortified: false },
      chips: chips.filter(c => c.type === 'reachable' || c.type === 'unreachable'),
      badge: { visible: false, count: 0 },
      regenBlocked: false,
      regenBlockedUntil: undefined,
      ownerColor: undefined,
      isOwned: false,
      isMine: false,
      isAlly: false,
    };
  }

  // Remembered tiles show stale info
  if (isRemembered) {
    return {
      baseState,
      visibilityTier,
      isRemembered,
      stalenessTier,
      strengthUnknown: true, // Hide enemy strength gradients
      presenceBoosted: false,
      relationState,
      urgencyState: { isContested: false, hasActiveRaid: false, rallyObjective: false },
      progressState: { type: 'none', progress: 0 },
      structureState: {
        type: cell?.lastKnownIsMasterTile ? 'master' : (cell?.lastKnownIsFort ? 'fort' : 'none'),
        isFortified: Boolean(cell?.lastKnownIsFort),
      },
      chips: chips.filter(c => c.type === 'reachable' || c.type === 'unreachable'),
      badge: { visible: troopCount > 0, count: troopCount },
      regenBlocked: false, // Hide tactical overlays
      regenBlockedUntil: undefined,
      ownerColor: cell?.lastKnownOwnerColor ?? ownerColor,
      isOwned: Boolean(cell?.lastKnownOwnerId),
      isMine: false,
      isAlly: false,
    };
  }

  return {
    baseState,
    visibilityTier,
    isRemembered,
    stalenessTier,
    strengthUnknown,
    presenceBoosted,
    relationState,
    urgencyState,
    progressState,
    structureState,
    chips,
    badge: {
      visible: troopCount > 0,
      count: troopCount,
    },
    regenBlocked,
    regenBlockedUntil,
    ownerColor,
    isOwned,
    isMine,
    isAlly,
  };
}

export function getProgressState(
  cell: HexCell | undefined,
  hexKey: string,
  currentPlayer: Player | undefined,
): TricorderTileState['progressState'] {
  if (!currentPlayer || !cell) {
    return { type: 'none', progress: 0 };
  }

  if (
    currentPlayer.fortTargetQ != null
    && currentPlayer.fortTargetR != null
    && cell.q === currentPlayer.fortTargetQ
    && cell.r === currentPlayer.fortTargetR
  ) {
    const visited = currentPlayer.fortPerimeterVisited?.length ?? 0;
    return { type: 'build', progress: visited / 6, stepsCompleted: visited, stepsRequired: 6 };
  }

  if (
    currentPlayer.sabotageTargetQ != null
    && currentPlayer.sabotageTargetR != null
    && cell.q === currentPlayer.sabotageTargetQ
    && cell.r === currentPlayer.sabotageTargetR
  ) {
    const visited = currentPlayer.sabotagePerimeterVisited?.length ?? 0;
    return { type: 'sabotage', progress: visited / 3, stepsCompleted: visited, stepsRequired: 3 };
  }

  if (currentPlayer.demolishTargetKey && currentPlayer.demolishTargetKey === hexKey) {
    const approaches = currentPlayer.demolishApproachDirectionsMade?.length ?? 0;
    return { type: 'demolish', progress: approaches / 3, stepsCompleted: approaches, stepsRequired: 3 };
  }

  return { type: 'none', progress: 0 };
}

function getStrengthUnknownState({
  cell,
  baseState,
  visibilityTier,
}: {
  cell: HexCell | undefined;
  baseState: TricorderTileState['baseState'];
  visibilityTier: 'Visible' | 'Remembered' | 'Hidden';
}): boolean {
  if (baseState !== 'enemy' || !cell) {
    return false;
  }

  return visibilityTier === 'Hidden';
}

function getEarliestFutureIso(values: string[], now: number): string | undefined {
  let earliestValue: string | undefined;
  let earliestMs = Number.POSITIVE_INFINITY;

  for (const value of values) {
    const valueMs = parseIsoMs(value);
    if (valueMs === undefined || valueMs <= now || valueMs >= earliestMs) {
      continue;
    }

    earliestMs = valueMs;
    earliestValue = value;
  }

  return earliestValue;
}

function getCopresenceChip({
  hexKey,
  currentPlayerId,
  currentPlayerAllianceId,
  alliances,
  players,
  playerPositions,
}: {
  hexKey: string;
  currentPlayerId: string;
  currentPlayerAllianceId?: string;
  alliances: AllianceDto[];
  players: Record<string, Player>;
  playerPositions?: ReadonlyMap<string, string[]>;
}): TileChip | undefined {
  const playerIds = playerPositions?.get(hexKey);
  if (!playerIds?.length) {
    return undefined;
  }

  const currentAlliance = currentPlayerAllianceId
    ? alliances.find((alliance) => alliance.id === currentPlayerAllianceId)
    : undefined;
  const requiredCount = Math.max(
    1,
    Math.min(COPRESENCE_TARGET_COUNT, currentAlliance?.memberIds.length ?? 1),
  );

  const alliedCount = playerIds.reduce((count, playerId) => {
    const player = players[playerId];
    if (!player) {
      return count;
    }

    const isFriendlyPlayer = player.id === currentPlayerId
      || (
        currentPlayerAllianceId !== undefined
        && player.allianceId === currentPlayerAllianceId
      );

    return isFriendlyPlayer ? count + 1 : count;
  }, 0);

  if (alliedCount <= 0) {
    return undefined;
  }

  const displayedCount = Math.min(alliedCount, requiredCount);

  return {
    type: alliedCount >= requiredCount ? 'presenceSatisfied' : 'presenceCritical',
    label: `${displayedCount}/${requiredCount}`,
  };
}

function isFutureIso(value: string | undefined, now: number): boolean {
  const valueMs = parseIsoMs(value);
  return valueMs !== undefined && valueMs > now;
}

function parseIsoMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getReachabilityState({
  cell,
  currentHexKey,
  currentPlayer,
  dynamics,
  grid,
  hexKey,
  claimMode,
  selectedHexKey,
}: {
  cell: HexCell | undefined;
  currentHexKey: string | null;
  currentPlayer?: Player;
  dynamics?: GameDynamics;
  grid: Record<string, HexCell>;
  hexKey: string;
  claimMode?: ClaimMode;
  selectedHexKey: string | null;
}): TricorderTileState['relationState']['reachability'] {
  if (!cell || !currentPlayer || !claimMode || !dynamics || selectedHexKey !== hexKey) {
    return 'none';
  }

  const targetHex = parseHexKey(hexKey);
  const currentHex = parseHexKey(currentHexKey);

  if (!targetHex) {
    return 'none';
  }

  const actions = getTileActions({
    state: {
      grid,
      claimMode,
      dynamics,
    } as never,
    player: currentPlayer,
    targetHex,
    targetCell: cell,
    currentHex,
  });

  if (actions.length === 0) {
    return 'none';
  }

  return actions.some((action) => action.enabled) ? 'reachable' : 'unreachable';
}

function parseHexKey(hexKey: string | null): [number, number] | null {
  if (!hexKey) {
    return null;
  }

  const [qText, rText] = hexKey.split(',');
  const q = Number(qText);
  const r = Number(rText);

  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    return null;
  }

  return [q, r];
}

const STALENESS_FADING_THRESHOLD_MS = 120_000; // 0–120s → fading

function computeStalenessTier(
  cell: HexCell | undefined,
  isRemembered: boolean,
  _baseState: TricorderTileState['baseState'],
): TricorderTileState['stalenessTier'] {
  if (!isRemembered) {
    return 'live';
  }

  if (!cell?.lastSeenAt) {
    return 'stale';
  }

  const ageMs = Date.now() - new Date(cell.lastSeenAt).getTime();
  return ageMs < STALENESS_FADING_THRESHOLD_MS ? 'fading' : 'stale';
}