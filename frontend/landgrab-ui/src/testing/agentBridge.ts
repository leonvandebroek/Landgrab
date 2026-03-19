import { latLngToRoomHex, roomHexToLatLng } from '../components/map/HexMath';
import { getTileActions } from '../components/game/tileInteraction';
import type { TileAction } from '../components/game/tileInteraction';
import { useGameStore } from '../stores/gameStore';
import { useGameplayStore } from '../stores/gameplayStore';
import { useUiStore } from '../stores/uiStore';
import type { AuthState, ClaimMode, GameDynamics, GameState, HexCell, Player, WinConditionType } from '../types/game';
import type { DebugLocationPoint } from '../stores/uiStore';

const AGENT_BRIDGE_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_AGENT_BRIDGE === 'true';
const DEFAULT_LAT = 50.8503;
const DEFAULT_LNG = 4.3517;
const EVENT_LOG_LIMIT = 300;

type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

interface LocationPoint {
  lat: number;
  lng: number;
}

interface AgentConnectionStatus {
  state: 'connected' | 'reconnecting' | 'disconnected';
  connected: boolean;
  reconnecting: boolean;
  updatedAt: string;
}

interface AgentEventRecord {
  id: number;
  name: string;
  timestamp: string;
  payload?: unknown;
}

interface AgentRuntime {
  auth: AuthState | null;
  connected: boolean;
  reconnecting: boolean;
  currentLocation: LocationPoint | null;
  currentHex: [number, number] | null;
  currentPlayerName: string;
  isHostBypass: boolean;
  invoke: SignalRInvoke | null;
  mapNavigate: (lat: number, lng: number) => void;
  applyDebugLocation: (lat: number, lng: number) => void;
  disableDebugLocation: () => void;
  stepDebugLocationByHex: (dq: number, dr: number) => LocationPoint | null;
  handleHexClick: (q: number, r: number, cell: HexCell | undefined) => void;
  handleSetAlliance: (name: string) => void;
  handleSetMapLocation: (lat: number, lng: number) => void;
  handleSetTileSize: (meters: number) => void;
  handleUseCenteredGameArea: () => void;
  handleSetClaimMode: (mode: ClaimMode) => void;
  handleSetWinCondition: (type: WinConditionType, value: number) => void;
  handleSetGameDynamics: (dynamics: GameDynamics) => void;
  handleConfigureAlliances: (names: string[]) => void;
  handleDistributePlayers: () => void;
  handleUpdateDynamicsLive: (dynamics: GameDynamics) => void;
}

interface AgentRulesInput {
  tileSizeMeters?: number;
  claimMode?: ClaimMode;
  winConditionType?: WinConditionType;
  winConditionValue?: number;
  hostBypassGps?: boolean;
  maxFootprintMeters?: number;
}

interface AgentDynamicsInput extends Partial<GameDynamics> {
  live?: boolean;
}

interface AgentAssignPlayersInput {
  allianceNames?: string[];
  autoDistribute?: boolean;
}

interface AgentConfigureDefaultsInput {
  preset?: 'default' | 'quick-2p' | 'combat-test' | 'fog-test';
  allianceNames?: string[];
  teamCount?: number;
  wizardStep?: number;
}

interface AgentHexActionInput {
  q: number;
  r: number;
  troopCount?: number;
  mode?: 'claim' | 'claimAlliance' | 'claimSelf' | 'reinforce';
}

interface AgentPlayerQuery {
  playerId?: string;
  playerName?: string;
  self?: boolean;
}

interface AgentBridgeApi {
  isEnabled: () => boolean;
  getSnapshot: () => unknown;
  getEvents: (sinceId?: number) => AgentEventRecord[];
  getConnectionStatus: () => AgentConnectionStatus;
  getHexSnapshot: (q: number, r: number) => unknown;
  getPlayerSnapshot: (query?: AgentPlayerQuery) => unknown;
  getVisibleHexKeys: () => string[];
  selectHex: (q: number, r: number) => unknown;
  setAlliance: (name: string) => unknown;
  centerOnPlayer: () => unknown;
  panToHex: (q: number, r: number) => unknown;
  claimHex: (input: AgentHexActionInput) => Promise<unknown>;
  attackHex: (input: AgentHexActionInput) => Promise<unknown>;
  pickupTroops: (input: { q: number; r: number; count: number }) => Promise<unknown>;
  reclaimHex: (input: { q: number; r: number; troopCount?: number }) => Promise<unknown>;
  setRules: (input: AgentRulesInput) => Promise<unknown>;
  setDynamics: (input: AgentDynamicsInput) => Promise<unknown>;
  assignPlayers: (input?: AgentAssignPlayersInput) => Promise<unknown>;
  configureDefaults: (input?: AgentConfigureDefaultsInput) => Promise<unknown>;
}

declare global {
  interface Window {
    __LANDGRAB_AGENT_BRIDGE__?: AgentBridgeApi;
  }
}

let runtime: AgentRuntime | null = null;
let nextEventId = 1;
const agentEvents: AgentEventRecord[] = [];
let connectionStatus: AgentConnectionStatus = {
  state: 'disconnected',
  connected: false,
  reconnecting: false,
  updatedAt: new Date(0).toISOString(),
};

function cloneForAgent<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

function ensureRuntime(): AgentRuntime {
  if (!runtime) {
    throw new Error('Landgrab agent bridge runtime is not available.');
  }

  return runtime;
}

function parseHexKey(key: string | null): [number, number] | null {
  if (!key) {
    return null;
  }

  const [q, r] = key.split(',').map(Number);
  if (!Number.isFinite(q) || !Number.isFinite(r)) {
    return null;
  }

  return [q, r];
}

function getGameState(): GameState | null {
  return useGameStore.getState().gameState;
}

function getUiState() {
  return useUiStore.getState();
}

function getGameplayState() {
  return useGameplayStore.getState();
}

function getMyPlayer(state: GameState | null, auth: AuthState | null): Player | null {
  if (!state || !auth) {
    return null;
  }

  return state.players.find((player) => player.id === auth.userId) ?? null;
}

function resolveCurrentHex(currentLocation: LocationPoint | null, state: GameState | null): [number, number] | null {
  if (!currentLocation || !state || state.mapLat == null || state.mapLng == null) {
    return null;
  }

  return latLngToRoomHex(currentLocation.lat, currentLocation.lng, state.mapLat, state.mapLng, state.tileSizeMeters);
}

function getSelectedHexActions(state: GameState | null, auth: AuthState | null, currentHex: [number, number] | null, isHostBypass: boolean): TileAction[] {
  const gameplayState = getGameplayState();
  const selectedHex = parseHexKey(gameplayState.selectedHexKey);
  const player = getMyPlayer(state, auth);

  if (!state || !selectedHex || !player) {
    return [];
  }

  const cell = state.grid[`${selectedHex[0]},${selectedHex[1]}`];
  return getTileActions({
    state,
    player,
    targetHex: selectedHex,
    targetCell: cell,
    currentHex,
    isHostBypass,
  });
}

function getCurrentHexActions(state: GameState | null, auth: AuthState | null, currentHex: [number, number] | null, isHostBypass: boolean): TileAction[] {
  const player = getMyPlayer(state, auth);
  if (!state || !currentHex || !player) {
    return [];
  }

  const cell = state.grid[`${currentHex[0]},${currentHex[1]}`];
  return getTileActions({
    state,
    player,
    targetHex: currentHex,
    targetCell: cell,
    currentHex,
    isHostBypass,
  });
}

function computeVisibleHexKeys(state: GameState | null, bounds: { north: number; south: number; east: number; west: number } | null): string[] {
  if (!state || !bounds || state.mapLat == null || state.mapLng == null) {
    return [];
  }

  return Object.entries(state.grid)
    .filter(([, cell]) => {
      const [lat, lng] = roomHexToLatLng(cell.q, cell.r, state.mapLat!, state.mapLng!, state.tileSizeMeters);
      return lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west;
    })
    .map(([key]) => key)
    .sort();
}

function findDefaultMasterTile(state: GameState): [number, number] | null {
  if (state.grid['0,0']) {
    return [0, 0];
  }

  const fallback = Object.values(state.grid).find((cell) => !cell.ownerId && !cell.isMasterTile);
  return fallback ? [fallback.q, fallback.r] : null;
}

function getBridgeSnapshot() {
  const currentRuntime = ensureRuntime();
  const state = getGameState();
  const uiState = getUiState();
  const gameplayState = getGameplayState();
  const selectedHex = parseHexKey(gameplayState.selectedHexKey);
  const effectiveCurrentHex = currentRuntime.currentHex ?? resolveCurrentHex(currentRuntime.currentLocation, state);
  const myPlayer = getMyPlayer(state, currentRuntime.auth);
  const currentHexActions = getCurrentHexActions(state, currentRuntime.auth, effectiveCurrentHex, currentRuntime.isHostBypass);
  const selectedHexActions = getSelectedHexActions(state, currentRuntime.auth, effectiveCurrentHex, currentRuntime.isHostBypass);
  const currentHexCell = effectiveCurrentHex && state ? state.grid[`${effectiveCurrentHex[0]},${effectiveCurrentHex[1]}`] ?? null : null;
  const selectedHexCell = selectedHex && state ? state.grid[`${selectedHex[0]},${selectedHex[1]}`] ?? null : null;
  const visibleHexKeys = computeVisibleHexKeys(state, uiState.mainMapBounds);

  return {
    timestamp: new Date().toISOString(),
    auth: currentRuntime.auth,
    connected: currentRuntime.connected,
    reconnecting: currentRuntime.reconnecting,
    connectionStatus,
    roomCode: state?.roomCode ?? null,
    view: uiState.view,
    currentPlayerName: currentRuntime.currentPlayerName,
    currentLocation: currentRuntime.currentLocation,
    currentHex: effectiveCurrentHex,
    currentHexCell,
    currentHexActions,
    selectedHex,
    selectedHexKey: gameplayState.selectedHexKey,
    selectedHexCell,
    selectedHexActions,
    myPlayer,
    gameState: state,
    gameplay: {
      selectedHexKey: gameplayState.selectedHexKey,
      currentHexKey: gameplayState.currentHexKey,
      mapFeedback: gameplayState.mapFeedback,
      pickupPrompt: gameplayState.pickupPrompt,
      pickupCount: gameplayState.pickupCount,
      reinforcePrompt: gameplayState.reinforcePrompt,
      reinforceCount: gameplayState.reinforceCount,
      attackPrompt: gameplayState.attackPrompt,
      attackCount: gameplayState.attackCount,
      combatPreview: gameplayState.combatPreview,
      combatResult: gameplayState.combatResult,
      neutralClaimResult: gameplayState.neutralClaimResult,
      commandoTargetingMode: gameplayState.commandoTargetingMode,
    },
    ui: {
      view: uiState.view,
      error: uiState.error,
      hasAcknowledgedRules: uiState.hasAcknowledgedRules,
      showDebugTools: uiState.showDebugTools,
      debugLocationEnabled: uiState.debugLocationEnabled,
      debugLocation: uiState.debugLocation,
      mainMapBounds: uiState.mainMapBounds,
      selectedHexScreenPos: uiState.selectedHexScreenPos,
    },
    visibleHexKeys,
    lastEvents: agentEvents.slice(-20),
  };
}

function resolveActionCoordinates(targetHex: [number, number]): LocationPoint {
  const currentRuntime = ensureRuntime();
  const state = getGameState();
  if (currentRuntime.isHostBypass && state && state.mapLat != null && state.mapLng != null) {
    const [lat, lng] = roomHexToLatLng(targetHex[0], targetHex[1], state.mapLat, state.mapLng, state.tileSizeMeters);
    return { lat, lng };
  }

  if (currentRuntime.currentLocation) {
    return currentRuntime.currentLocation;
  }

  if (state?.mapLat != null && state?.mapLng != null) {
    return { lat: state.mapLat, lng: state.mapLng };
  }

  return { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
}

async function placeTroops(q: number, r: number, troopCount?: number): Promise<unknown> {
  const currentRuntime = ensureRuntime();
  if (!currentRuntime.invoke) {
    throw new Error('SignalR invoke is not available.');
  }

  const coordinates = resolveActionCoordinates([q, r]);
  await currentRuntime.invoke('PlaceTroops', q, r, coordinates.lat, coordinates.lng, troopCount ?? null);
  return getBridgeSnapshot();
}

function getDefaultAlliances(playerCount: number, requestedTeamCount?: number): string[] {
  const total = Math.max(2, Math.min(requestedTeamCount ?? playerCount, 4));
  return Array.from({ length: total }, (_, index) => `Alliance ${index + 1}`);
}

function getConnectionState(connected: boolean, reconnecting: boolean): AgentConnectionStatus['state'] {
  if (connected) {
    return 'connected';
  }

  if (reconnecting) {
    return 'reconnecting';
  }

  return 'disconnected';
}

const bridgeApi: AgentBridgeApi = {
  isEnabled: () => AGENT_BRIDGE_ENABLED,
  getSnapshot: () => cloneForAgent(getBridgeSnapshot()),
  getEvents: (sinceId = 0) => cloneForAgent(agentEvents.filter((event) => event.id > sinceId)),
  getConnectionStatus: () => cloneForAgent(connectionStatus),
  getHexSnapshot: (q, r) => {
    const snapshot = getBridgeSnapshot() as ReturnType<typeof getBridgeSnapshot>;
    const state = snapshot.gameState;
    const cell = state?.grid?.[`${q},${r}`] ?? null;
    const player = snapshot.myPlayer;
    const actions = state && player
      ? getTileActions({
        state,
        player,
        targetHex: [q, r],
        targetCell: cell ?? undefined,
        currentHex: snapshot.currentHex,
        isHostBypass: ensureRuntime().isHostBypass,
      })
      : [];

    return cloneForAgent({
      q,
      r,
      cell,
      actions,
      visible: snapshot.visibleHexKeys.includes(`${q},${r}`),
      selected: snapshot.selectedHexKey === `${q},${r}`,
      currentHex: snapshot.currentHex,
    });
  },
  getPlayerSnapshot: (query) => {
    const snapshot = getBridgeSnapshot() as ReturnType<typeof getBridgeSnapshot>;
    const players = snapshot.gameState?.players ?? [];
    const player = query?.self || (!query?.playerId && !query?.playerName)
      ? snapshot.myPlayer
      : players.find((candidate) => {
        if (query?.playerId && candidate.id === query.playerId) {
          return true;
        }

        return Boolean(query?.playerName && candidate.name === query.playerName);
      }) ?? null;

    return cloneForAgent({ player, roomCode: snapshot.roomCode, phase: snapshot.gameState?.phase ?? null });
  },
  getVisibleHexKeys: () => cloneForAgent(computeVisibleHexKeys(getGameState(), getUiState().mainMapBounds)),
  selectHex: (q, r) => {
    const currentRuntime = ensureRuntime();
    const state = getGameState();
    currentRuntime.handleHexClick(q, r, state?.grid?.[`${q},${r}`]);
    return cloneForAgent(getBridgeSnapshot());
  },
  setAlliance: (name) => {
    ensureRuntime().handleSetAlliance(name);
    return cloneForAgent(getBridgeSnapshot());
  },
  centerOnPlayer: () => {
    const currentRuntime = ensureRuntime();
    if (currentRuntime.currentLocation) {
      currentRuntime.mapNavigate(currentRuntime.currentLocation.lat, currentRuntime.currentLocation.lng);
    }

    return cloneForAgent(getBridgeSnapshot());
  },
  panToHex: (q, r) => {
    const currentRuntime = ensureRuntime();
    const state = getGameState();
    if (!state || state.mapLat == null || state.mapLng == null) {
      throw new Error('Map center is not configured.');
    }

    const [lat, lng] = roomHexToLatLng(q, r, state.mapLat, state.mapLng, state.tileSizeMeters);
    currentRuntime.mapNavigate(lat, lng);
    return cloneForAgent(getBridgeSnapshot());
  },
  claimHex: async ({ q, r, troopCount, mode }) => {
    const currentRuntime = ensureRuntime();
    currentRuntime.handleHexClick(q, r, getGameState()?.grid?.[`${q},${r}`]);

    if (mode === 'reinforce') {
      return cloneForAgent(await placeTroops(q, r, troopCount ?? getMyPlayer(getGameState(), currentRuntime.auth)?.carriedTroops ?? 1));
    }

    return cloneForAgent(await placeTroops(q, r, troopCount));
  },
  attackHex: async ({ q, r, troopCount }) => {
    const currentRuntime = ensureRuntime();
    currentRuntime.handleHexClick(q, r, getGameState()?.grid?.[`${q},${r}`]);
    if (!currentRuntime.invoke) {
      throw new Error('SignalR invoke is not available.');
    }

    // The game requires the player to be physically inside the target hex.
    // Compute target-hex coords and teleport via UpdatePlayerLocation before preview + attack.
    const state = getGameState();
    let attackCoords = resolveActionCoordinates([q, r]);
    if (!currentRuntime.isHostBypass && state?.mapLat != null && state?.mapLng != null) {
      const [tLat, tLng] = roomHexToLatLng(q, r, state.mapLat, state.mapLng, state.tileSizeMeters);
      attackCoords = { lat: tLat, lng: tLng };
      await currentRuntime.invoke('UpdatePlayerLocation', tLat, tLng);
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
    }

    const preview = await currentRuntime.invoke<Record<string, unknown>>('GetCombatPreview', q, r).catch(() => null);
    const cellBefore = getGameState()?.grid?.[`${q},${r}`] ?? null;
    const myPlayerBefore = getMyPlayer(getGameState(), currentRuntime.auth);
    const finalTroopCount = troopCount ?? myPlayerBefore?.carriedTroops ?? undefined;

    // Clear any stale combat result before attacking so we can detect a fresh one.
    useGameplayStore.getState().setCombatResult(null);

    await currentRuntime.invoke('PlaceTroops', q, r, attackCoords.lat, attackCoords.lng, finalTroopCount ?? null);

    // Poll for the combat result to arrive via SignalR (up to 5 s).
    let combatResult: unknown = null;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      combatResult = useGameplayStore.getState().combatResult;
      if (combatResult) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }

    const stateAfter = getGameState();
    const myPlayerAfter = getMyPlayer(stateAfter, currentRuntime.auth);
    const cellAfter = stateAfter?.grid?.[`${q},${r}`] ?? null;

    return cloneForAgent({
      q,
      r,
      attackerTroopsSent: finalTroopCount ?? null,
      attackerCarriedBefore: myPlayerBefore?.carriedTroops ?? null,
      attackerCarriedAfter: myPlayerAfter?.carriedTroops ?? null,
      attackerTerritoryAfter: myPlayerAfter?.territoryCount ?? null,
      defenderTroopsBefore: cellBefore?.troops ?? null,
      defenderOwnerBefore: cellBefore?.ownerName ?? null,
      defenderTroopsAfter: cellAfter?.troops ?? null,
      defenderOwnerAfter: cellAfter?.ownerName ?? null,
      hexOwnerChanged: (cellBefore?.ownerId ?? null) !== (cellAfter?.ownerId ?? null),
      // Strip newState — it embeds the full 65KB game state and is redundant here.
      combatResult: combatResult && typeof combatResult === 'object'
        ? Object.fromEntries(Object.entries(combatResult as Record<string, unknown>).filter(([k]) => k !== 'newState'))
        : combatResult ?? null,
      preview: preview
        ? {
          valid: preview['valid'],
          canAttack: preview['canAttack'],
          attackerTroops: preview['attackerTroops'],
          defenderTroops: preview['defenderTroops'],
          attackerBonus: preview['attackerBonus'],
          defenderBonus: preview['defenderBonus'],
        }
        : null,
    });
  },
  pickupTroops: async ({ q, r, count }) => {
    const currentRuntime = ensureRuntime();
    currentRuntime.handleHexClick(q, r, getGameState()?.grid?.[`${q},${r}`]);
    if (!currentRuntime.invoke) {
      throw new Error('SignalR invoke is not available.');
    }

    const carriedBefore = getMyPlayer(getGameState(), currentRuntime.auth)?.carriedTroops ?? 0;
    const coordinates = resolveActionCoordinates([q, r]);
    await currentRuntime.invoke('PickUpTroops', q, r, count, coordinates.lat, coordinates.lng);

    // Wait for SignalR state update to propagate to the store.
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    const state = getGameState();
    const myPlayer = getMyPlayer(state, currentRuntime.auth);
    const hexCell = state?.grid?.[`${q},${r}`] ?? null;
    return cloneForAgent({
      success: true,
      pickedUpCount: count,
      carriedTroopsBefore: carriedBefore,
      carriedTroopsAfter: myPlayer?.carriedTroops ?? null,
      hexTroopsAfter: hexCell?.troops ?? null,
      hexOwner: hexCell?.ownerName ?? null,
      territoryCount: myPlayer?.territoryCount ?? null,
    });
  },
  reclaimHex: async ({ q, r, troopCount }) => cloneForAgent(await placeTroops(q, r, troopCount ?? 1)),
  setRules: async (input) => {
    const currentRuntime = ensureRuntime();
    const state = getGameState();

    if (input.tileSizeMeters != null) {
      currentRuntime.handleSetTileSize(input.tileSizeMeters);
    }

    if (input.claimMode) {
      currentRuntime.handleSetClaimMode(input.claimMode);
    }

    if (input.winConditionType) {
      const nextValue = input.winConditionValue
        ?? state?.winConditionValue
        ?? (input.winConditionType === 'Elimination' ? 1 : 50);
      currentRuntime.handleSetWinCondition(input.winConditionType, nextValue);
    }

    if (currentRuntime.invoke && state?.roomCode) {
      if (input.hostBypassGps != null) {
        await currentRuntime.invoke('SetHostBypassGps', state.roomCode, input.hostBypassGps);
      }

      if (input.maxFootprintMeters != null) {
        await currentRuntime.invoke('SetMaxFootprint', state.roomCode, input.maxFootprintMeters);
      }
    }

    return cloneForAgent(getBridgeSnapshot());
  },
  setDynamics: async (input) => {
    const currentRuntime = ensureRuntime();
    const state = getGameState();
    const baseDynamics = state?.dynamics;
    if (!baseDynamics) {
      throw new Error('Game dynamics are not available.');
    }

    const nextDynamics: GameDynamics = {
      ...baseDynamics,
      ...input,
    };

    if (input.live && state?.roomCode) {
      currentRuntime.handleUpdateDynamicsLive(nextDynamics);
    } else {
      currentRuntime.handleSetGameDynamics(nextDynamics);
    }

    return cloneForAgent(getBridgeSnapshot());
  },
  assignPlayers: async (input) => {
    const currentRuntime = ensureRuntime();
    const state = getGameState();
    if (!state) {
      throw new Error('Game state is not available.');
    }

    const allianceNames = input?.allianceNames?.length
      ? input.allianceNames
      : getDefaultAlliances(state.players.length);

    currentRuntime.handleConfigureAlliances(allianceNames);
    if (input?.autoDistribute !== false) {
      currentRuntime.handleDistributePlayers();
    }

    return cloneForAgent({ allianceNames, snapshot: getBridgeSnapshot() });
  },
  configureDefaults: async (input) => {
    const currentRuntime = ensureRuntime();
    const state = getGameState();
    if (!state) {
      throw new Error('Game state is not available.');
    }

    const preset = input?.preset ?? 'default';
    const mapLocation = currentRuntime.currentLocation ?? { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
    currentRuntime.handleSetMapLocation(mapLocation.lat, mapLocation.lng);
    currentRuntime.handleUseCenteredGameArea();

    const allianceNames = input?.allianceNames?.length
      ? input.allianceNames
      : getDefaultAlliances(state.players.length, input?.teamCount);
    currentRuntime.handleConfigureAlliances(allianceNames);
    currentRuntime.handleDistributePlayers();

    if (preset === 'combat-test') {
      currentRuntime.handleSetGameDynamics({
        ...state.dynamics,
        combatMode: 'Balanced',
      });
    }

    if (currentRuntime.invoke && state.roomCode) {
      const masterTile = findDefaultMasterTile(state);

      if (masterTile) {
        await currentRuntime.invoke('SetMasterTileByHex', masterTile[0], masterTile[1]).catch(() => undefined);
      }

      await currentRuntime.invoke('SetWizardStep', input?.wizardStep ?? 4).catch(() => undefined);
    }

    return cloneForAgent({
      preset,
      allianceNames,
      snapshot: getBridgeSnapshot(),
    });
  },
};

export function installAgentBridge(nextRuntime: AgentRuntime): void {
  if (!AGENT_BRIDGE_ENABLED || typeof window === 'undefined') {
    return;
  }

  runtime = nextRuntime;
  window.__LANDGRAB_AGENT_BRIDGE__ = bridgeApi;
  setAgentConnectionStatus(nextRuntime.connected, nextRuntime.reconnecting);
}

export function uninstallAgentBridge(): void {
  if (typeof window === 'undefined') {
    return;
  }

  runtime = null;
  delete window.__LANDGRAB_AGENT_BRIDGE__;
}

export function recordAgentEvent(name: string, payload?: unknown): void {
  if (!AGENT_BRIDGE_ENABLED) {
    return;
  }

  agentEvents.push({
    id: nextEventId++,
    name,
    timestamp: new Date().toISOString(),
    payload: payload === undefined ? undefined : cloneForAgent(payload),
  });

  if (agentEvents.length > EVENT_LOG_LIMIT) {
    agentEvents.splice(0, agentEvents.length - EVENT_LOG_LIMIT);
  }
}

export function setAgentConnectionStatus(connected: boolean, reconnecting: boolean): void {
  if (!AGENT_BRIDGE_ENABLED) {
    return;
  }

  connectionStatus = {
    state: getConnectionState(connected, reconnecting),
    connected,
    reconnecting,
    updatedAt: new Date().toISOString(),
  };
}

export function setAgentDebugLocation(enabled: boolean, location: DebugLocationPoint | null): void {
  if (!AGENT_BRIDGE_ENABLED || !runtime) {
    return;
  }

  if (!enabled || !location) {
    runtime.disableDebugLocation();
    return;
  }

  runtime.applyDebugLocation(location.lat, location.lng);
}
