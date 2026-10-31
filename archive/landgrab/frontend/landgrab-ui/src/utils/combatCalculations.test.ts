import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/map/HexMath', () => ({
  hexNeighbors: vi.fn(),
  roomHexToLatLng: vi.fn(),
}));

import { hexNeighbors, roomHexToLatLng } from '../components/map/HexMath';
import {
  bearingDegrees,
  calculateCombatPreview,
  headingDiff,
  normalizeHeading,
  resolveRaidTarget,
  resolveTacticalStrikeTarget,
  resolveTroopTransferTarget,
} from './combatCalculations';
import type { GameState, HexCell, Player } from '../types/game';

const mockedHexNeighbors = vi.mocked(hexNeighbors);
const mockedRoomHexToLatLng = vi.mocked(roomHexToLatLng);
type GameStateOverrides = Omit<Partial<GameState>, 'dynamics'> & {
  dynamics?: Partial<GameState['dynamics']>;
};

const createPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'player-1',
  name: 'Alice',
  color: '#3366ff',
  allianceId: 'alliance-1',
  allianceName: 'Blue Team',
  allianceColor: '#3366ff',
  carriedTroops: 4,
  currentLat: 0,
  currentLng: 0,
  currentHexQ: 0,
  currentHexR: 0,
  isHost: false,
  isConnected: true,
  territoryCount: 0,
  role: 'None',
  ...overrides,
});

const createHexCell = (overrides: Partial<HexCell> = {}): HexCell => ({
  q: 1,
  r: 0,
  troops: 3,
  isMasterTile: false,
  isFort: false,
  isFortified: false,
  ownerName: 'Defender',
  ownerAllianceId: 'alliance-2',
  ...overrides,
});

const createGameState = (overrides: GameStateOverrides = {}): GameState => {
  const defaultState: GameState = {
    roomCode: 'ROOM1',
    phase: 'Playing',
    gameMode: 'Alliances',
    players: [],
    alliances: [
      { id: 'alliance-1', name: 'Blue Team', color: '#3366ff', memberIds: [], territoryCount: 0 },
      { id: 'alliance-2', name: 'Red Team', color: '#ff3355', memberIds: [], territoryCount: 0 },
    ],
    eventLog: [],
    grid: {},
    mapLat: 52.37,
    mapLng: 4.89,
    hasMapLocation: true,
    currentWizardStep: 1,
    gridRadius: 3,
    gameAreaMode: 'Centered',
    gameAreaPattern: null,
    tileSizeMeters: 100,
    claimMode: 'PresenceOnly',
    dynamics: {
      playerRolesEnabled: true,
      beaconEnabled: false,
      combatMode: 'Balanced',
      hqEnabled: false,
      hqAutoAssign: false,
      tileDecayEnabled: false,
      fieldBattleEnabled: false,
    },
    winConditionType: 'TerritoryPercent',
    winConditionValue: 50,
    gameDurationMinutes: null,
    masterTileQ: null,
    masterTileR: null,
    gameStartedAt: null,
    isAllianceVictory: false,
  };

  return {
    ...defaultState,
    ...overrides,
    dynamics: {
      ...defaultState.dynamics,
      ...overrides.dynamics,
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();

  mockedHexNeighbors.mockReturnValue([
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
    [-1, 1],
  ]);

  const coordinateMap: Record<string, [number, number]> = {
    '1,0': [1, 0],
    '0,1': [0, 1],
    '-1,0': [-1, 0],
    '0,-1': [0, -1],
    '1,-1': [1, 1],
    '-1,1': [-1, -1],
  };

  mockedRoomHexToLatLng.mockImplementation((q: number, r: number) => {
    const coordinate = coordinateMap[`${q},${r}`];
    if (!coordinate) {
      throw new Error(`Unexpected hex ${q},${r}`);
    }

    return coordinate;
  });
});

describe('bearingDegrees', () => {
  it('returns 0 for the same point', () => {
    expect(bearingDegrees(52.37, 4.89, 52.37, 4.89)).toBe(0);
  });

  it('returns 0 for north', () => {
    expect(bearingDegrees(0, 0, 1, 0)).toBeCloseTo(0, 5);
  });

  it('returns 90 for east', () => {
    expect(bearingDegrees(0, 0, 0, 1)).toBeCloseTo(90, 5);
  });

  it('returns 180 for south', () => {
    expect(bearingDegrees(0, 0, -1, 0)).toBeCloseTo(180, 5);
  });

  it('returns 270 for west', () => {
    expect(bearingDegrees(0, 0, 0, -1)).toBeCloseTo(270, 5);
  });
});

describe('headingDiff', () => {
  it('returns 0 for identical headings', () => {
    expect(headingDiff(90, 90)).toBe(0);
  });

  it('returns the direct difference when no wrap-around is shorter', () => {
    expect(headingDiff(10, 40)).toBe(30);
  });

  it('returns the shortest wrap-around difference', () => {
    expect(headingDiff(10, 350)).toBe(20);
  });
});

describe('normalizeHeading', () => {
  it('leaves headings already in range unchanged', () => {
    expect(normalizeHeading(90)).toBe(90);
  });

  it('wraps negative headings into the 0-360 range', () => {
    expect(normalizeHeading(-10)).toBe(350);
  });

  it('wraps headings above 360 into the 0-360 range', () => {
    expect(normalizeHeading(725)).toBe(5);
  });

  it('returns 0 for NaN', () => {
    expect(normalizeHeading(Number.NaN)).toBe(0);
  });

  it('returns 0 for positive infinity', () => {
    expect(normalizeHeading(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('returns 0 for negative infinity', () => {
    expect(normalizeHeading(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('resolveRaidTarget', () => {
  it('returns the commander current hex during gameplay when roles are enabled', () => {
    const player = createPlayer({ role: 'Commander', currentHexQ: 3, currentHexR: -2 });
    const state = createGameState();

    expect(resolveRaidTarget(player, state)).toEqual({ targetQ: 3, targetR: -2 });
  });

  it('returns null outside the playing phase', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({ phase: 'Lobby' });

    expect(resolveRaidTarget(player, state)).toBeNull();
  });

  it('returns null when player roles are disabled', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({ dynamics: { playerRolesEnabled: false } });

    expect(resolveRaidTarget(player, state)).toBeNull();
  });

  it('returns null for non-commanders', () => {
    const player = createPlayer({ role: 'Scout' });
    const state = createGameState();

    expect(resolveRaidTarget(player, state)).toBeNull();
  });

  it('returns null when the player current hex is missing', () => {
    const player = createPlayer({ role: 'Commander', currentHexQ: null, currentHexR: null });
    const state = createGameState();

    expect(resolveRaidTarget(player, state)).toBeNull();
  });
});

describe('resolveTacticalStrikeTarget', () => {
  it('returns the mapped neighbor whose bearing is closest to the heading', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({
      grid: {
        '1,0': createHexCell({ q: 1, r: 0 }),
        '0,1': createHexCell({ q: 0, r: 1 }),
        '-1,0': createHexCell({ q: -1, r: 0 }),
      },
    });

    expect(resolveTacticalStrikeTarget(player, state, 90)).toEqual({ targetQ: 0, targetR: 1 });
  });

  it('normalizes the heading before resolving the closest neighbor', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({
      grid: {
        '1,0': createHexCell({ q: 1, r: 0 }),
        '0,1': createHexCell({ q: 0, r: 1 }),
      },
    });

    expect(resolveTacticalStrikeTarget(player, state, 450)).toEqual({ targetQ: 0, targetR: 1 });
  });

  it('ignores neighboring hexes that are not present in the grid', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({
      grid: {
        '1,0': createHexCell({ q: 1, r: 0 }),
      },
    });

    expect(resolveTacticalStrikeTarget(player, state, 0)).toEqual({ targetQ: 1, targetR: 0 });
  });

  it('returns null when the closest neighbor is more than 30 degrees away', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({
      grid: {
        '1,0': createHexCell({ q: 1, r: 0 }),
        '0,1': createHexCell({ q: 0, r: 1 }),
      },
    });

    expect(resolveTacticalStrikeTarget(player, state, 135)).toBeNull();
  });

  it('returns null outside the playing phase', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({ phase: 'Lobby' });

    expect(resolveTacticalStrikeTarget(player, state, 90)).toBeNull();
  });

  it('returns null when player roles are disabled', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({ dynamics: { playerRolesEnabled: false } });

    expect(resolveTacticalStrikeTarget(player, state, 90)).toBeNull();
  });

  it('returns null when the room has no valid map location', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState({ hasMapLocation: false, mapLat: null, mapLng: null });

    expect(resolveTacticalStrikeTarget(player, state, 90)).toBeNull();
  });

  it('returns null for invalid headings', () => {
    const player = createPlayer({ role: 'Commander' });
    const state = createGameState();

    expect(resolveTacticalStrikeTarget(player, state, Number.NaN)).toBeNull();
  });

  it('returns null for non-commanders', () => {
    const player = createPlayer({ role: 'Scout' });
    const state = createGameState();

    expect(resolveTacticalStrikeTarget(player, state, 90)).toBeNull();
  });

  it('returns null when the player current hex is missing', () => {
    const player = createPlayer({ role: 'Commander', currentHexQ: null, currentHexR: null });
    const state = createGameState();

    expect(resolveTacticalStrikeTarget(player, state, 90)).toBeNull();
  });

  it('returns null when the player coordinates are missing', () => {
    const player = createPlayer({ role: 'Commander', currentLat: null, currentLng: null });
    const state = createGameState();

    expect(resolveTacticalStrikeTarget(player, state, 90)).toBeNull();
  });
});

describe('resolveTroopTransferTarget', () => {
  it('returns the closest allied player within 45 degrees of the heading', () => {
    const player = createPlayer({ currentLat: 0, currentLng: 0, allianceId: 'alliance-1' });
    const closerAlly = createPlayer({
      id: 'player-2',
      name: 'Bob',
      currentLat: 0,
      currentLng: 0.5,
      allianceId: 'alliance-1',
    });
    const fartherAlly = createPlayer({
      id: 'player-3',
      name: 'Cara',
      currentLat: 0,
      currentLng: 1,
      allianceId: 'alliance-1',
    });

    expect(resolveTroopTransferTarget(player, [player, fartherAlly, closerAlly], 90)).toEqual({
      recipientId: 'player-2',
      recipientName: 'Bob',
    });
  });

  it('ignores the initiator, enemies, and allies without coordinates', () => {
    const player = createPlayer({ currentLat: 0, currentLng: 0, allianceId: 'alliance-1' });
    const enemy = createPlayer({
      id: 'enemy-1',
      name: 'Enemy',
      currentLat: 0,
      currentLng: 0.2,
      allianceId: 'alliance-2',
    });
    const allyWithoutCoords = createPlayer({
      id: 'player-2',
      name: 'Hidden Ally',
      currentLat: null,
      currentLng: null,
      allianceId: 'alliance-1',
    });
    const validAlly = createPlayer({
      id: 'player-3',
      name: 'Visible Ally',
      currentLat: 0,
      currentLng: 1,
      allianceId: 'alliance-1',
    });

    expect(resolveTroopTransferTarget(player, [player, enemy, allyWithoutCoords, validAlly], 90)).toEqual({
      recipientId: 'player-3',
      recipientName: 'Visible Ally',
    });
  });

  it('treats 360 degrees as a valid normalized heading', () => {
    const player = createPlayer({ currentLat: 0, currentLng: 0, allianceId: 'alliance-1' });
    const northAlly = createPlayer({
      id: 'player-2',
      name: 'North Ally',
      currentLat: 1,
      currentLng: 0,
      allianceId: 'alliance-1',
    });

    expect(resolveTroopTransferTarget(player, [player, northAlly], 360)).toEqual({
      recipientId: 'player-2',
      recipientName: 'North Ally',
    });
  });

  it('returns null when the initiator coordinates are missing', () => {
    const player = createPlayer({ currentLat: null, currentLng: null, allianceId: 'alliance-1' });

    expect(resolveTroopTransferTarget(player, [player], 90)).toBeNull();
  });

  it('returns null when the initiator is not in an alliance', () => {
    const player = createPlayer({ allianceId: undefined });

    expect(resolveTroopTransferTarget(player, [player], 90)).toBeNull();
  });

  it('returns null for invalid headings', () => {
    const player = createPlayer({ allianceId: 'alliance-1' });

    expect(resolveTroopTransferTarget(player, [player], Number.NaN)).toBeNull();
    expect(resolveTroopTransferTarget(player, [player], -1)).toBeNull();
    expect(resolveTroopTransferTarget(player, [player], 361)).toBeNull();
  });

  it('returns null when no allied player falls within the heading window', () => {
    const player = createPlayer({ currentLat: 0, currentLng: 0, allianceId: 'alliance-1' });
    const southAlly = createPlayer({
      id: 'player-2',
      name: 'South Ally',
      currentLat: -1,
      currentLng: 0,
      allianceId: 'alliance-1',
    });

    expect(resolveTroopTransferTarget(player, [player, southAlly], 90)).toBeNull();
  });
});

describe('calculateCombatPreview', () => {
  it('calculates basic balanced combat with no bonuses', () => {
    const player = createPlayer({ carriedTroops: 4, allianceId: 'alliance-1' });
    const targetCell = createHexCell({ troops: 3, ownerName: 'Defender', ownerAllianceId: 'alliance-2' });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Balanced' } });

    expect(calculateCombatPreview(player, targetCell, 1, 0, [player], state)).toEqual({
      attackerTroops: 4,
      defenderTroops: 3,
      effectiveAttack: 4,
      effectiveDefence: 3,
      attackerWinProbability: 4 / 7,
      attackerBonuses: [],
      defenderBonuses: [],
      combatMode: 'Balanced',
      defenderName: 'Defender',
      defenderAllianceName: 'Red Team',
    });
  });

  it('adds the rally defender bonus', () => {
    const player = createPlayer({ carriedTroops: 4 });
    const targetCell = createHexCell({ troops: 3, isFortified: true });
    const state = createGameState({ dynamics: { playerRolesEnabled: true, combatMode: 'Balanced' } });

    const preview = calculateCombatPreview(player, targetCell, 1, 0, [player], state);

    expect(preview.effectiveDefence).toBe(4);
    expect(preview.defenderBonuses).toEqual([{ source: 'Rally', value: 1 }]);
    expect(preview.attackerWinProbability).toBe(0.5);
  });

  it('adds the fort defender bonus', () => {
    const player = createPlayer({ carriedTroops: 4 });
    const targetCell = createHexCell({ troops: 3, isFort: true });
    const state = createGameState({ dynamics: { playerRolesEnabled: true, combatMode: 'Balanced' } });

    const preview = calculateCombatPreview(player, targetCell, 1, 0, [player], state);

    expect(preview.effectiveDefence).toBe(4);
    expect(preview.defenderBonuses).toEqual([{ source: 'Fort', value: 1 }]);
    expect(preview.attackerWinProbability).toBe(0.5);
  });

  it('adds the commander attacker bonus when an allied commander is present on the target hex', () => {
    const player = createPlayer({ carriedTroops: 4, allianceId: 'alliance-1' });
    const commander = createPlayer({
      id: 'player-2',
      role: 'Commander',
      allianceId: 'alliance-1',
      currentHexQ: 2,
      currentHexR: -1,
    });
    const targetCell = createHexCell({ troops: 3 });
    const state = createGameState({ dynamics: { playerRolesEnabled: true, combatMode: 'Balanced' } });

    const preview = calculateCombatPreview(player, targetCell, 2, -1, [player, commander], state);

    expect(preview.effectiveAttack).toBe(5);
    expect(preview.attackerBonuses).toEqual([{ source: 'Commander', value: 1 }]);
    expect(preview.attackerWinProbability).toBe(5 / 8);
  });

  it('negates rally and fort defender bonuses when tactical strike is active on the target', () => {
    const player = createPlayer({
      carriedTroops: 4,
      tacticalStrikeActive: true,
      tacticalStrikeTargetQ: 1,
      tacticalStrikeTargetR: 0,
    });
    const targetCell = createHexCell({ troops: 3, isFortified: true, isFort: true });
    const state = createGameState({ dynamics: { playerRolesEnabled: true, combatMode: 'Balanced' } });

    const preview = calculateCombatPreview(player, targetCell, 1, 0, [player], state);

    expect(preview.effectiveDefence).toBe(3);
    expect(preview.defenderBonuses).toEqual([]);
    expect(preview.attackerWinProbability).toBe(4 / 7);
  });

  it('adds the siege defender advantage based on 25 percent of effective defence rounded up', () => {
    const player = createPlayer({ carriedTroops: 4 });
    const targetCell = createHexCell({ troops: 4 });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Siege' } });

    const preview = calculateCombatPreview(player, targetCell, 1, 0, [player], state);

    expect(preview.effectiveDefence).toBe(5);
    expect(preview.defenderBonuses).toEqual([{ source: 'Siege Defender Advantage', value: 1 }]);
    expect(preview.attackerWinProbability).toBe(4 / 9);
  });

  it('returns 1 in classic mode when attack is strictly greater than defence', () => {
    const player = createPlayer({ carriedTroops: 5 });
    const targetCell = createHexCell({ troops: 4 });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Classic' } });

    expect(calculateCombatPreview(player, targetCell, 1, 0, [player], state).attackerWinProbability).toBe(1);
  });

  it('returns 0 in classic mode when attack is not strictly greater than defence', () => {
    const player = createPlayer({ carriedTroops: 4 });
    const targetCell = createHexCell({ troops: 4 });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Classic' } });

    expect(calculateCombatPreview(player, targetCell, 1, 0, [player], state).attackerWinProbability).toBe(0);
  });

  it('clamps balanced mode probability to 0.2 on the low end', () => {
    const player = createPlayer({ carriedTroops: 1 });
    const targetCell = createHexCell({ troops: 99 });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Balanced' } });

    expect(calculateCombatPreview(player, targetCell, 1, 0, [player], state).attackerWinProbability).toBe(0.2);
  });

  it('clamps balanced mode probability to 0.8 on the high end', () => {
    const player = createPlayer({ carriedTroops: 99 });
    const targetCell = createHexCell({ troops: 1 });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Balanced' } });

    expect(calculateCombatPreview(player, targetCell, 1, 0, [player], state).attackerWinProbability).toBe(0.8);
  });

  it('returns 0.5 when both sides have zero total power', () => {
    const player = createPlayer({ carriedTroops: 0 });
    const targetCell = createHexCell({ troops: 0 });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Balanced' } });

    expect(calculateCombatPreview(player, targetCell, 1, 0, [player], state).attackerWinProbability).toBe(0.5);
  });

  it('falls back to Unknown defender and null alliance name when ownership details are missing', () => {
    const player = createPlayer({ carriedTroops: 4 });
    const targetCell = createHexCell({ troops: 3, ownerName: undefined, ownerAllianceId: undefined });
    const state = createGameState({ dynamics: { playerRolesEnabled: false, combatMode: 'Balanced' } });

    const preview = calculateCombatPreview(player, targetCell, 1, 0, [player], state);

    expect(preview.defenderName).toBe('Unknown defender');
    expect(preview.defenderAllianceName).toBeNull();
  });
});
