import { describe, expect, it } from 'vitest';
import type { GameState, HexCell, Player } from '../../types/game';
import {
  buildFeed,
  buildHappenings,
  buildStats,
  formatClock,
  projectForTeam,
  timeLeftMs,
  visibleKeysForTeam,
} from './observerModel';

function cell(q: number, r: number, team?: string, owner?: string, troops = 1): HexCell {
  return { q, r, troops: team ? troops : 0, isMasterTile: false, ownerAllianceId: team, ownerId: owner, visibilityTier: 'Visible' };
}

function player(id: string, team: string | undefined, q: number | null, r: number | null, extra: Partial<Player> = {}): Player {
  return {
    id, name: id, color: '#fff', allianceId: team, carriedTroops: 0, currentHexQ: q, currentHexR: r,
    isHost: false, isConnected: true, territoryCount: 0, ...extra,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  // A row of seven tiles: foxes hold -3 and -2, owls hold 1, 2 and 3.
  const cells = [
    cell(-3, 0, 'fox', 'fa', 2), cell(-2, 0, 'fox', 'fb', 3), cell(-1, 0), cell(0, 0),
    cell(1, 0, 'owl', 'oa', 4), cell(2, 0, 'owl', 'oa', 1), cell(3, 0, 'owl', 'ob', 1),
  ];
  return {
    roomCode: 'ABC123',
    phase: 'Playing',
    gameMode: 'Alliances',
    players: [
      player('fa', 'fox', -3, 0, { carriedTroops: 2 }),
      player('fb', 'fox', -2, 0),
      player('oa', 'owl', 2, 0),
      player('ob', 'owl', 3, 0),
    ],
    alliances: [
      { id: 'fox', name: 'Foxes', color: '#ff8a3d', memberIds: ['fa', 'fb'], territoryCount: 2 },
      { id: 'owl', name: 'Owls', color: '#5b9bff', memberIds: ['oa', 'ob'], territoryCount: 3 },
    ],
    eventLog: [],
    grid: Object.fromEntries(cells.map((c) => [`${c.q},${c.r}`, c])),
    mapLat: 52, mapLng: 5, hasMapLocation: true, gridRadius: 3,
    gameAreaMode: 'Centered', gameAreaPattern: null, tileSizeMeters: 25, claimMode: 'PresenceOnly',
    dynamics: { playerRolesEnabled: false, beaconEnabled: false, hqEnabled: false, hqAutoAssign: false, tileDecayEnabled: false, fieldBattleEnabled: true },
    winConditionType: 'TimedGame', winConditionValue: 0, gameDurationMinutes: 30,
    masterTileQ: null, masterTileR: null, gameStartedAt: '2026-01-01T12:00:00Z', isAllianceVictory: false,
    ...overrides,
  };
}

describe('buildStats', () => {
  it('counts tiles and troops from the grid and puts the leader first', () => {
    const stats = buildStats(makeState());
    expect(stats.totalTiles).toBe(7);
    expect(stats.claimedTiles).toBe(5);
    expect(stats.teams.map((team) => team.id)).toEqual(['owl', 'fox']);
    expect(stats.teams[0]).toMatchObject({ tiles: 3, troops: 6, pct: 43 });
    // Fox troops include the two that a player is carrying.
    expect(stats.teams[1]).toMatchObject({ tiles: 2, troops: 7, pct: 29 });
    expect(stats.teams[0].players.map((p) => [p.id, p.tiles])).toEqual([['oa', 2], ['ob', 1]]);
  });

  it('lists players without a team apart', () => {
    const state = makeState();
    state.players.push(player('zed', undefined, null, null, { isConnected: false }));
    const stats = buildStats(state);
    expect(stats.loose).toHaveLength(1);
    expect(stats.loose[0]).toMatchObject({ id: 'zed', isOffline: true, hasPosition: false });
  });
});

describe('clock', () => {
  it('gives the time left in a timed game and never goes below zero', () => {
    const start = Date.parse('2026-01-01T12:00:00Z');
    expect(timeLeftMs(makeState(), start + 10 * 60_000)).toBe(20 * 60_000);
    expect(timeLeftMs(makeState(), start + 45 * 60_000)).toBe(0);
    expect(timeLeftMs(makeState({ winConditionType: 'TerritoryPercent' }), start)).toBeNull();
  });

  it('formats minutes and hours', () => {
    expect(formatClock(754_000)).toBe('12:34');
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(3_754_000)).toBe('1:02:34');
  });
});

describe('buildHappenings', () => {
  it('lists open battles before raids and skips resolved battles', () => {
    const now = Date.parse('2026-01-01T12:05:00Z');
    const state = makeState({
      activeFieldBattles: [
        { id: 'b1', initiatorId: 'fa', initiatorName: 'fa', initiatorAllianceId: 'fox', q: 0, r: 0, initiatorTroops: 2, joinDeadline: '2026-01-01T12:05:20Z', joinedEnemyIds: ['oa'], resolved: false, targetEnemyId: null, fledEnemyIds: [] },
        { id: 'b2', initiatorId: 'oa', initiatorName: 'oa', initiatorAllianceId: 'owl', q: 1, r: 0, initiatorTroops: 2, joinDeadline: '2026-01-01T12:05:20Z', joinedEnemyIds: [], resolved: true, targetEnemyId: null, fledEnemyIds: [] },
      ],
      activeRaids: [
        { id: 'r1', targetQ: -2, targetR: 0, initiatorAllianceId: 'owl', initiatorPlayerId: 'ob', initiatorPlayerName: 'ob', deadline: '2026-01-01T12:05:10Z', isHQRaid: true },
      ],
    });
    state.players[1].isBeacon = true;
    const list = buildHappenings(state, now);
    expect(list.map((item) => item.kind)).toEqual(['fieldBattle', 'hqRaid', 'beacon']);
    expect(list[0]).toMatchObject({ joined: 1, teamColor: '#ff8a3d', q: 0, r: 0 });
  });

  it('is empty outside of play', () => {
    expect(buildHappenings(makeState({ phase: 'GameOver' }), 0)).toEqual([]);
  });
});

describe('buildFeed', () => {
  const events = [
    { createdAt: '2026-01-01T12:00:00Z', type: 'AlliancesConfigured', message: '' },
    { createdAt: '2026-01-01T12:01:00Z', type: 'TileCaptured', message: '' },
    { createdAt: '2026-01-01T12:02:00Z', type: 'FortBuilt', message: '' },
    { createdAt: '2026-01-01T12:03:00Z', type: 'GamePaused', message: '' },
  ];

  it('shows the newest first and leaves setup events out', () => {
    expect(buildFeed(events, 'all').map((event) => event.type)).toEqual(['GamePaused', 'FortBuilt', 'TileCaptured']);
  });

  it('filters battles and abilities', () => {
    expect(buildFeed(events, 'battles').map((event) => event.type)).toEqual(['TileCaptured']);
    expect(buildFeed(events, 'abilities').map((event) => event.type)).toEqual(['FortBuilt']);
  });
});

describe('team view', () => {
  it('shows a team its own tiles, the tiles around its players and enemy tiles that touch its land', () => {
    const state = makeState();
    // Give the owls a tile right next to the foxes.
    state.grid['-1,0'] = cell(-1, 0, 'owl', 'oa', 1);
    const visible = visibleKeysForTeam(state, 'fox');
    expect([...visible].sort()).toEqual(['-1,0', '-2,0', '-3,0'].sort());
  });

  it('hides the owner of unseen tiles and removes unseen enemies', () => {
    const state = makeState();
    const view = projectForTeam(state, 'fox');
    expect(view.grid['2,0']).toMatchObject({ visibilityTier: 'Hidden', troops: 0 });
    expect(view.grid['2,0'].ownerId).toBeUndefined();
    expect(view.grid['-2,0'].ownerId).toBe('fb');
    expect(view.players.map((p) => p.id)).toEqual(['fa', 'fb']);
  });

  it('keeps an enemy who stands on a tile the team can see', () => {
    const state = makeState();
    state.players[2].currentHexQ = -1; // an owl walks up to fox land
    const view = projectForTeam(state, 'fox');
    expect(view.players.map((p) => p.id)).toEqual(['fa', 'fb', 'oa']);
    expect(view.grid['0,0'].visibilityTier).toBe('Hidden');
  });
});
