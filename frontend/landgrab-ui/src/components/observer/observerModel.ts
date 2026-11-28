import type { GameEventLogEntry, GameState, HexCell, Player } from '../../types/game';
import { computeBeaconCone } from '../../utils/beaconCone';

/* ─────────────────────────────────────────────────────────────────────────
   Everything the observer screen shows, worked out from the full game state
   a spectator receives. Pure functions, so they are tested without a map.
   ───────────────────────────────────────────────────────────────────────── */

export interface ObserverPlayer {
  id: string;
  name: string;
  tiles: number;
  carrying: number;
  isVirtual: boolean;
  isOffline: boolean;
  hasPosition: boolean;
}

export interface ObserverTeam {
  id: string;
  name: string;
  color: string;
  tiles: number;
  troops: number;
  /** Share of every tile on the map, 0 to 100, rounded. */
  pct: number;
  players: ObserverPlayer[];
}

export interface ObserverStats {
  teams: ObserverTeam[];
  totalTiles: number;
  claimedTiles: number;
  /** Players who are in no team. */
  loose: ObserverPlayer[];
}

const HEX_NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1],
];

function toObserverPlayer(player: Player, tiles: number): ObserverPlayer {
  return {
    id: player.id,
    name: player.name,
    tiles,
    carrying: player.carriedTroops ?? 0,
    isVirtual: Boolean(player.isVirtual),
    isOffline: !player.isConnected && !player.isVirtual,
    hasPosition: hasPosition(player),
  };
}

export function hasPosition(player: Player): boolean {
  return (player.currentLat != null && player.currentLng != null)
    || (player.currentHexQ != null && player.currentHexR != null);
}

/** Team standings counted from the grid itself, leader first. */
export function buildStats(state: GameState): ObserverStats {
  const cells = Object.values(state.grid ?? {});
  const tilesByTeam = new Map<string, number>();
  const troopsByTeam = new Map<string, number>();
  const tilesByPlayer = new Map<string, number>();
  let claimedTiles = 0;

  for (const cell of cells) {
    if (!cell.ownerId && !cell.ownerAllianceId) continue;
    claimedTiles += 1;
    if (cell.ownerId) tilesByPlayer.set(cell.ownerId, (tilesByPlayer.get(cell.ownerId) ?? 0) + 1);
    if (cell.ownerAllianceId) {
      tilesByTeam.set(cell.ownerAllianceId, (tilesByTeam.get(cell.ownerAllianceId) ?? 0) + 1);
      troopsByTeam.set(cell.ownerAllianceId, (troopsByTeam.get(cell.ownerAllianceId) ?? 0) + (cell.troops ?? 0));
    }
  }

  const totalTiles = cells.length;
  const teamIds = new Set(state.alliances.map((alliance) => alliance.id));
  const teams = state.alliances.map<ObserverTeam>((alliance) => {
    const tiles = tilesByTeam.get(alliance.id) ?? 0;
    const players = state.players
      .filter((player) => player.allianceId === alliance.id)
      .map((player) => toObserverPlayer(player, tilesByPlayer.get(player.id) ?? 0))
      .sort((a, b) => b.tiles - a.tiles || a.name.localeCompare(b.name));
    return {
      id: alliance.id,
      name: alliance.name,
      color: alliance.color,
      tiles,
      troops: (troopsByTeam.get(alliance.id) ?? 0) + state.players
        .filter((player) => player.allianceId === alliance.id)
        .reduce((sum, player) => sum + (player.carriedTroops ?? 0), 0),
      pct: totalTiles > 0 ? Math.round((100 * tiles) / totalTiles) : 0,
      players,
    };
  }).sort((a, b) => b.tiles - a.tiles || a.name.localeCompare(b.name));

  const loose = state.players
    .filter((player) => !player.allianceId || !teamIds.has(player.allianceId))
    .map((player) => toObserverPlayer(player, tilesByPlayer.get(player.id) ?? 0));

  return { teams, totalTiles, claimedTiles, loose };
}

/** Milliseconds left in a timed game, or null when the game has no clock. */
export function timeLeftMs(state: GameState, now: number): number | null {
  if (state.winConditionType !== 'TimedGame' || !state.gameStartedAt || !state.gameDurationMinutes) return null;
  const end = Date.parse(state.gameStartedAt) + state.gameDurationMinutes * 60_000;
  if (Number.isNaN(end)) return null;
  return Math.max(0, end - now);
}

/** Milliseconds since the game started, or null before the start. */
export function elapsedMs(state: GameState, now: number): number | null {
  if (!state.gameStartedAt) return null;
  const start = Date.parse(state.gameStartedAt);
  if (Number.isNaN(start)) return null;
  return Math.max(0, now - start);
}

/** 754000 becomes "12:34", and from one hour on "1:02:34". */
export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

export type HappeningKind = 'fieldBattle' | 'raid' | 'hqRaid' | 'rally' | 'fort' | 'sabotage' | 'demolish' | 'beacon';

export interface Happening {
  id: string;
  kind: HappeningKind;
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamColor: string | null;
  /** Tile it happens on, when known. */
  q: number | null;
  r: number | null;
  /** How many opponents have joined a field battle. */
  joined: number;
  /** Time it ends (ms since epoch), or null when it has no deadline. */
  endsAt: number | null;
}

function parseTime(value: string | undefined | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function parseHexKey(key: string | undefined | null): [number, number] | null {
  if (!key) return null;
  const [q, r] = key.split(',').map(Number);
  return Number.isFinite(q) && Number.isFinite(r) ? [q, r] : null;
}

/** What is going on right now: battles first, then the things with a deadline. */
export function buildHappenings(state: GameState, now: number): Happening[] {
  if (state.phase !== 'Playing') return [];
  const teamColor = (teamId: string | null | undefined) =>
    state.alliances.find((alliance) => alliance.id === teamId)?.color ?? null;
  const list: Happening[] = [];

  for (const battle of state.activeFieldBattles ?? []) {
    if (battle.resolved) continue;
    list.push({
      id: `battle-${battle.id}`,
      kind: 'fieldBattle',
      playerId: battle.initiatorId,
      playerName: battle.initiatorName,
      teamId: battle.initiatorAllianceId ?? null,
      teamColor: teamColor(battle.initiatorAllianceId),
      q: battle.q,
      r: battle.r,
      joined: battle.joinedEnemyIds?.length ?? 0,
      endsAt: parseTime(battle.joinDeadline),
    });
  }

  for (const raid of state.activeRaids ?? []) {
    list.push({
      id: `raid-${raid.id}`,
      kind: raid.isHQRaid ? 'hqRaid' : 'raid',
      playerId: raid.initiatorPlayerId,
      playerName: raid.initiatorPlayerName,
      teamId: raid.initiatorAllianceId ?? null,
      teamColor: teamColor(raid.initiatorAllianceId),
      q: raid.targetQ,
      r: raid.targetR,
      joined: 0,
      endsAt: parseTime(raid.deadline),
    });
  }

  for (const player of state.players) {
    const base = {
      playerId: player.id,
      playerName: player.name,
      teamId: player.allianceId ?? null,
      teamColor: teamColor(player.allianceId) ?? player.color ?? null,
      joined: 0,
    };
    if (player.rallyPointActive) {
      list.push({ ...base, id: `rally-${player.id}`, kind: 'rally', q: player.rallyPointQ ?? null, r: player.rallyPointR ?? null, endsAt: parseTime(player.rallyPointDeadline) });
    }
    if (player.fortTargetQ != null && player.fortTargetR != null) {
      list.push({ ...base, id: `fort-${player.id}`, kind: 'fort', q: player.fortTargetQ, r: player.fortTargetR, endsAt: null });
    }
    if (player.sabotageTargetQ != null && player.sabotageTargetR != null) {
      list.push({ ...base, id: `sabotage-${player.id}`, kind: 'sabotage', q: player.sabotageTargetQ, r: player.sabotageTargetR, endsAt: null });
    }
    const demolish = parseHexKey(player.demolishTargetKey);
    if (demolish) {
      list.push({ ...base, id: `demolish-${player.id}`, kind: 'demolish', q: demolish[0], r: demolish[1], endsAt: null });
    }
    if (player.isBeacon) {
      list.push({ ...base, id: `beacon-${player.id}`, kind: 'beacon', q: player.currentHexQ ?? null, r: player.currentHexR ?? null, endsAt: null });
    }
  }

  const rank = (item: Happening) => (item.kind === 'fieldBattle' ? 0 : item.endsAt != null ? 1 : 2);
  return list
    .filter((item) => item.endsAt == null || item.endsAt > now - 2000)
    .sort((a, b) => rank(a) - rank(b) || (a.endsAt ?? Infinity) - (b.endsAt ?? Infinity));
}

export type FeedFilter = 'all' | 'battles' | 'abilities';

const BATTLE_EVENTS = new Set([
  'TileCaptured', 'CombatRepelled', 'HQCaptured', 'FieldBattleStarted', 'FieldBattleResolved',
  'CommandoRaidStarted', 'CommandoRaidSuccess', 'CommandoRaidFailed',
]);

const ABILITY_EVENTS = new Set([
  'BeaconActivated', 'TacticalStrikeActivated', 'RallyPointActivated', 'RallyPointResolved',
  'CommandoRaidStarted', 'CommandoRaidSuccess', 'CommandoRaidFailed',
  'FortConstructionStarted', 'FortConstructionCancelled', 'FortConstructionInvalidated', 'FortBuilt',
  'SabotageStarted', 'SabotageCancelled', 'SabotageInvalidated', 'SabotageComplete',
  'DemolishStarted', 'DemolishCancelled', 'DemolishInvalidated', 'DemolishCompleted',
]);

/** Setup chatter that says nothing about the game being played. */
const QUIET_EVENTS = new Set([
  'PlayerJoined', 'GameAreaUpdated', 'AlliancesConfigured', 'PlayersDistributed', 'AllianceChanged',
  'MasterTileAssigned', 'StartingTileAssigned', 'AllianceStartingTileAssigned',
]);

/** Newest first, limited, with the setup events left out. */
export function buildFeed(events: GameEventLogEntry[] | null | undefined, filter: FeedFilter, limit = 60): GameEventLogEntry[] {
  return [...(events ?? [])]
    .filter((event) => {
      if (QUIET_EVENTS.has(event.type)) return false;
      if (filter === 'battles') return BATTLE_EVENTS.has(event.type);
      if (filter === 'abilities') return ABILITY_EVENTS.has(event.type);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

/** Which team an event belongs to, for its colour mark. */
export function eventTeamColor(event: GameEventLogEntry, state: GameState): string | null {
  const teamId = event.allianceId
    ?? state.players.find((player) => player.id === event.playerId)?.allianceId;
  return state.alliances.find((alliance) => alliance.id === teamId)?.color ?? null;
}

/**
 * The tiles one team can see, by the same rules the server uses for players:
 * their own tiles, the tiles around their players, enemy tiles that touch
 * their land, and the tiles their beacons light up.
 */
export function visibleKeysForTeam(state: GameState, teamId: string): Set<string> {
  const grid = state.grid ?? {};
  const visible = new Set<string>();
  const owned: HexCell[] = [];

  for (const [key, cell] of Object.entries(grid)) {
    if (cell.ownerAllianceId === teamId) {
      visible.add(key);
      owned.push(cell);
    }
  }

  for (const cell of owned) {
    for (const [dq, dr] of HEX_NEIGHBOURS) {
      const key = `${cell.q + dq},${cell.r + dr}`;
      const neighbour = grid[key];
      if (neighbour?.ownerId && neighbour.ownerAllianceId !== teamId) visible.add(key);
    }
  }

  for (const player of state.players) {
    if (player.allianceId !== teamId || player.currentHexQ == null || player.currentHexR == null) continue;
    const q = player.currentHexQ;
    const r = player.currentHexR;
    visible.add(`${q},${r}`);
    for (const [dq, dr] of HEX_NEIGHBOURS) {
      const key = `${q + dq},${r + dr}`;
      if (grid[key]) visible.add(key);
    }
    if (player.isBeacon) {
      const heading = player.beaconHeading ?? player.currentHeading;
      if (heading != null) {
        for (const key of computeBeaconCone(`${q},${r}`, heading, grid, state.dynamics?.beaconSectorAngle ?? 45)) {
          visible.add(key);
        }
      }
    }
  }

  return visible;
}

export interface TeamView {
  grid: Record<string, HexCell>;
  players: Player[];
}

/** The map as one team sees it: unseen tiles lose their owner, unseen enemies disappear. */
export function projectForTeam(state: GameState, teamId: string): TeamView {
  const visible = visibleKeysForTeam(state, teamId);
  const grid: Record<string, HexCell> = {};

  for (const [key, cell] of Object.entries(state.grid ?? {})) {
    grid[key] = visible.has(key)
      ? cell
      : {
        q: cell.q,
        r: cell.r,
        troops: 0,
        isMasterTile: cell.isMasterTile,
        visibilityTier: 'Hidden',
      };
  }

  const players = state.players.filter((player) => {
    if (player.allianceId === teamId) return true;
    if (player.currentHexQ == null || player.currentHexR == null) return false;
    return visible.has(`${player.currentHexQ},${player.currentHexR}`);
  });

  return { grid, players };
}
