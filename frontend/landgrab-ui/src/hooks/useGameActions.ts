import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import { getTileActions, getTileInteractionStatus } from '../components/game/tileInteraction';
import type { TileAction, TileActionType } from '../components/game/tileInteraction';
import { roomHexToLatLng } from '../components/map/HexMath';
import { useGameStore } from '../stores/gameStore';
import { useGameplayStore } from '../stores/gameplayStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useUiStore } from '../stores/uiStore';
import type {
  AuthState,
  ClaimMode,
  CopresenceMode,
  GameAreaPattern,
  GameDynamics,
  GameState,
  HexCell,
  HexCoordinate,
  Player,
  ReClaimMode,
  RoomSummary,
  WinConditionType,
} from '../types/game';
import { vibrate, HAPTIC } from '../utils/haptics';
import {
  getErrorMessage,
  getPlaceSuccessMessage,
  isMissingHubMethodFailure,
  localizeLobbyError,
} from '../utils/gameHelpers';
import type { SoundName } from './useSound';

const LOCATION_BROADCAST_THROTTLE_MS = 3000;

type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

interface LocationPoint {
  lat: number;
  lng: number;
}

interface UseGameActionsOptions {
  invoke: SignalRInvoke | null;
  auth: AuthState | null;
  connected: boolean;
  autoResuming: boolean;
  pendingResumeRef: MutableRefObject<unknown | null>;
  gameState: GameState | null;
  currentLocation: LocationPoint | null;
  currentHex: [number, number] | null;
  myPlayer: Player | null;
  isHostBypass: boolean;
  t: TFunction;
  playSound: (name: SoundName) => void;
  clearSession: () => void;
}

interface UseGameActionsResult {
  refreshMyRooms: () => Promise<void>;
  handleCreateRoom: () => void;
  handleJoinRoom: (code: string) => void;
  handleSetAlliance: (name: string) => void;
  handleSetMapLocation: (lat: number, lng: number) => void;
  handleSetTileSize: (meters: number) => void;
  handleUseCenteredGameArea: () => void;
  handleSetPatternGameArea: (pattern: GameAreaPattern) => void;
  handleSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
  handleSetClaimMode: (mode: ClaimMode) => void;
  handleSetAllowSelfClaim: (allow: boolean) => Promise<void>;
  handleSetWinCondition: (type: WinConditionType, value: number) => void;
  handleSetCopresenceModes: (modes: CopresenceMode[]) => void;
  handleSetCopresencePreset: (preset: string) => void;
  handleSetGameDynamics: (dynamics: GameDynamics) => void;
  handleSetPlayerRole: (role: string) => Promise<void>;
  handleSetAllianceHQ: (q: number, r: number, allianceId: string) => Promise<void>;
  handleActivateBeacon: () => Promise<void>;
  handleDeactivateBeacon: () => Promise<void>;
  handleActivateStealth: () => Promise<void>;
  handleActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<void>;
  handleAcceptDuel: (duelId: string) => Promise<void>;
  handleDeclineDuel: (duelId: string) => Promise<void>;
  handleDetainPlayer: (targetPlayerId: string) => Promise<void>;
  handleSetMasterTile: (lat: number, lng: number) => void;
  handleSetMasterTileByHex: (q: number, r: number) => void;
  handleAssignStartingTile: (q: number, r: number, playerId: string) => void;
  handleConfigureAlliances: (names: string[]) => void;
  handleDistributePlayers: () => void;
  handleAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  handleStartGame: () => void;
  handleReturnToLobby: () => void;
  handleSetObserverMode: (enabled: boolean) => void;
  handleUpdateDynamicsLive: (dynamics: GameDynamics) => void;
  handleTriggerEvent: (eventType: string, targetQ?: number, targetR?: number, targetAllianceId?: string) => void;
  handleSendHostMessage: (message: string, allianceIds?: string[]) => void;
  handlePauseGame: (paused: boolean) => void;
  handleHexClick: (q: number, r: number, cell: HexCell | undefined) => void;
  tileActions: TileAction[];
  currentHexActions: TileAction[];
  currentHexCell: HexCell | undefined;
  handleTileAction: (actionType: TileActionType) => void;
  handleCurrentHexAction: (actionType: TileActionType) => void;
  handleDismissTileActions: () => void;
  handleConfirmPickup: () => void;
  handleConfirmAttack: () => Promise<void>;
  handleCancelAttack: () => void;
  handleReClaimHex: (mode: ReClaimMode) => Promise<void>;
  handlePlayAgain: () => void;
}

export function useGameActions({
  invoke,
  auth,
  connected,
  autoResuming,
  pendingResumeRef,
  gameState,
  currentLocation,
  currentHex,
  myPlayer,
  isHostBypass,
  t,
  playSound,
  clearSession,
}: UseGameActionsOptions): UseGameActionsResult {
  const setMyRooms = useGameStore(state => state.setMyRooms);
  const setGameState = useGameStore(state => state.setGameState);
  const updateGameState = useGameStore(state => state.updateGameState);
  const selectedHex = useGameplayStore(state => state.selectedHex);
  const pickupPrompt = useGameplayStore(state => state.pickupPrompt);
  const pickupCount = useGameplayStore(state => state.pickupCount);
  const attackPrompt = useGameplayStore(state => state.attackPrompt);
  const attackCount = useGameplayStore(state => state.attackCount);
  const commandoTargetingMode = useGameplayStore(state => state.commandoTargetingMode);
  const combatResult = useGameplayStore(state => state.combatResult);
  const setSelectedHex = useGameplayStore(state => state.setSelectedHex);
  const setMapFeedback = useGameplayStore(state => state.setMapFeedback);
  const setPickupPrompt = useGameplayStore(state => state.setPickupPrompt);
  const setPickupCount = useGameplayStore(state => state.setPickupCount);
  const setAttackPrompt = useGameplayStore(state => state.setAttackPrompt);
  const setAttackCount = useGameplayStore(state => state.setAttackCount);
  const setCombatResult = useGameplayStore(state => state.setCombatResult);
  const setCommandoTargetingMode = useGameplayStore(state => state.setCommandoTargetingMode);
  const clearGameplayUi = useGameplayStore(state => state.clearGameplayUi);
  const setPendingDuel = useNotificationStore(state => state.setPendingDuel);
  const setView = useUiStore(state => state.setView);
  const setError = useUiStore(state => state.setError);
  const clearError = useUiStore(state => state.clearError);
  const lastLocationRef = useRef('');
  const locationThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocationRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  const previousCurrentHexRef = useRef<string | null>(null);
  const activeRoomCode = gameState?.roomCode ?? '';

  const clearLocationThrottle = useCallback(() => {
    if (locationThrottleRef.current !== null) {
      clearTimeout(locationThrottleRef.current);
      locationThrottleRef.current = null;
    }
  }, []);

  const sendPendingLocation = useCallback(() => {
    clearLocationThrottle();

    if (!invoke) {
      pendingLocationRef.current = null;
      return;
    }

    const pendingLocation = pendingLocationRef.current;
    if (!pendingLocation) {
      return;
    }

    const locationKey = `${pendingLocation.lat.toFixed(6)},${pendingLocation.lon.toFixed(6)}`;
    if (lastLocationRef.current === locationKey) {
      pendingLocationRef.current = null;
      return;
    }

    pendingLocationRef.current = null;
    lastLocationRef.current = locationKey;
    lastSendTimeRef.current = Date.now();

    invoke('UpdatePlayerLocation', pendingLocation.lat, pendingLocation.lon)
      .catch(cause => setError(String(cause)));
  }, [clearLocationThrottle, invoke, setError]);

  useEffect(() => {
    if (!connected || gameState?.phase !== 'Playing' || !currentLocation) {
      clearLocationThrottle();
      pendingLocationRef.current = null;
      lastSendTimeRef.current = 0;
      lastLocationRef.current = '';
      return;
    }

    pendingLocationRef.current = { lat: currentLocation.lat, lon: currentLocation.lng };

    const locationKey = `${currentLocation.lat.toFixed(6)},${currentLocation.lng.toFixed(6)}`;
    if (lastLocationRef.current === locationKey) {
      pendingLocationRef.current = null;
      return;
    }

    const elapsedSinceLastSend = Date.now() - lastSendTimeRef.current;
    if (elapsedSinceLastSend >= LOCATION_BROADCAST_THROTTLE_MS) {
      sendPendingLocation();
      return;
    }

    clearLocationThrottle();
    locationThrottleRef.current = setTimeout(() => {
      sendPendingLocation();
    }, LOCATION_BROADCAST_THROTTLE_MS - elapsedSinceLastSend);
  }, [clearLocationThrottle, connected, currentLocation, gameState?.phase, sendPendingLocation]);

  useEffect(() => {
    const shouldFlushPendingLocation = connected && gameState?.phase === 'Playing';

    return () => {
      if (shouldFlushPendingLocation) {
        sendPendingLocation();
        return;
      }

      clearLocationThrottle();
    };
  }, [clearLocationThrottle, connected, gameState?.phase, sendPendingLocation]);

  useEffect(() => {
    const nextKey = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
    if (nextKey === previousCurrentHexRef.current) {
      return;
    }

    previousCurrentHexRef.current = nextKey;
    if (gameState?.phase !== 'Playing' || !currentHex) {
      return;
    }

    setSelectedHex(currentHex);
    setMapFeedback(null);
    setPickupPrompt(null);
    setAttackPrompt(null);
  }, [currentHex, gameState?.phase, setAttackPrompt, setMapFeedback, setPickupPrompt, setSelectedHex]);

  const refreshMyRooms = useCallback(async () => {
    if (!auth || !connected || !invoke) {
      setMyRooms([]);
      return;
    }

    const rooms = await invoke<RoomSummary[]>('GetMyRooms');
    setMyRooms(Array.isArray(rooms) ? rooms : []);
  }, [auth, connected, invoke, setMyRooms]);

  const cleanupLobbyState = useCallback(() => {
    clearSession();
    setGameState(null);
    setPickupPrompt(null);
    clearGameplayUi();
    setView('lobby');
  }, [clearGameplayUi, clearSession, setGameState, setPickupPrompt, setView]);

  const handleCreateRoom = useCallback(() => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    if (!invoke) {
      return;
    }

    invoke('CreateRoom').catch(cause => setError(localizeLobbyError(getErrorMessage(cause), t)));
  }, [autoResuming, invoke, pendingResumeRef, setError, t]);

  const handleJoinRoom = useCallback((code: string) => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    if (!invoke) {
      return;
    }

    invoke('JoinRoom', code).catch(cause => setError(localizeLobbyError(getErrorMessage(cause), t)));
  }, [autoResuming, invoke, pendingResumeRef, setError, t]);

  const handleSetAlliance = useCallback((name: string) => {
    if (!invoke) {
      return;
    }

    invoke('SetAlliance', name).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetMapLocation = useCallback((lat: number, lng: number) => {
    if (!invoke) {
      return;
    }

    invoke('SetMapLocation', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetTileSize = useCallback((meters: number) => {
    if (!invoke) {
      return;
    }

    const previousTileSizeMeters = gameState?.tileSizeMeters ?? meters;
    const roomCode = gameState?.roomCode ?? '';

    updateGameState(previousState => previousState
      ? {
        ...previousState,
        tileSizeMeters: meters,
      }
      : previousState);

    invoke('SetTileSize', meters).catch(cause => {
      updateGameState(previousState => {
        if (!previousState || previousState.roomCode !== roomCode) {
          return previousState;
        }

        return {
          ...previousState,
          tileSizeMeters: previousTileSizeMeters,
        };
      });
      setError(String(cause));
    });
  }, [gameState?.roomCode, gameState?.tileSizeMeters, invoke, setError, updateGameState]);

  const handleUseCenteredGameArea = useCallback(() => {
    if (!invoke) {
      return;
    }

    invoke('UseCenteredGameArea').catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetPatternGameArea = useCallback((pattern: GameAreaPattern) => {
    if (!invoke) {
      return;
    }

    invoke('SetPatternGameArea', pattern).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetCustomGameArea = useCallback((coordinates: HexCoordinate[]) => {
    if (!invoke) {
      return;
    }

    invoke('SetCustomGameArea', coordinates).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetClaimMode = useCallback((mode: ClaimMode) => {
    if (!invoke) {
      return;
    }

    invoke('SetClaimMode', mode).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetAllowSelfClaim = useCallback(async (allow: boolean) => {
    if (!invoke) {
      return;
    }

    await invoke('SetAllowSelfClaim', allow);
  }, [invoke]);

  const handleSetWinCondition = useCallback((type: WinConditionType, value: number) => {
    if (!invoke) {
      return;
    }

    invoke('SetWinCondition', type, value).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetCopresenceModes = useCallback((modes: CopresenceMode[]) => {
    if (!invoke) {
      return;
    }

    invoke('SetCopresenceModes', modes).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetCopresencePreset = useCallback((preset: string) => {
    if (!invoke) {
      return;
    }

    invoke('SetCopresencePreset', preset).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetGameDynamics = useCallback((dynamics: GameDynamics) => {
    if (!invoke) {
      return;
    }

    invoke('SetGameDynamics', dynamics).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetPlayerRole = useCallback(async (role: string) => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('SetPlayerRole', role);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleSetAllianceHQ = useCallback(async (q: number, r: number, allianceId: string) => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('SetAllianceHQ', q, r, allianceId);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleActivateBeacon = useCallback(async () => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateBeacon');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleDeactivateBeacon = useCallback(async () => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('DeactivateBeacon');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleActivateStealth = useCallback(async () => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateStealth');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleActivateCommandoRaid = useCallback(async (targetQ: number, targetR: number) => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateCommandoRaid', targetQ, targetR);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleAcceptDuel = useCallback(async (duelId: string) => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('AcceptDuel', duelId);
      setPendingDuel(null);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError, setPendingDuel]);

  const handleDeclineDuel = useCallback(async (duelId: string) => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('DeclineDuel', duelId);
      setPendingDuel(null);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError, setPendingDuel]);

  const handleDetainPlayer = useCallback(async (targetPlayerId: string) => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('DetainPlayer', targetPlayerId);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleSetMasterTile = useCallback((lat: number, lng: number) => {
    if (!invoke) {
      return;
    }

    invoke('SetMasterTile', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetMasterTileByHex = useCallback((q: number, r: number) => {
    if (!invoke) {
      return;
    }

    invoke('SetMasterTileByHex', q, r).catch(cause => {
      const message = getErrorMessage(cause);
      if (!isMissingHubMethodFailure(message) || !gameState || gameState.mapLat == null || gameState.mapLng == null) {
        setError(localizeLobbyError(message, t));
        return;
      }

      const [fallbackLat, fallbackLng] = roomHexToLatLng(
        q,
        r,
        gameState.mapLat,
        gameState.mapLng,
        gameState.tileSizeMeters,
      );

      invoke('SetMasterTile', fallbackLat, fallbackLng)
        .catch(fallbackCause => setError(localizeLobbyError(getErrorMessage(fallbackCause), t)));
    });
  }, [gameState, invoke, setError, t]);

  const handleAssignStartingTile = useCallback((q: number, r: number, playerId: string) => {
    if (!invoke) {
      return;
    }

    invoke('AssignStartingTile', q, r, playerId).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleConfigureAlliances = useCallback((names: string[]) => {
    if (!invoke) {
      return;
    }

    invoke('ConfigureAlliances', names).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleDistributePlayers = useCallback(() => {
    if (!invoke) {
      return;
    }

    invoke('DistributePlayers').catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleAssignAllianceStartingTile = useCallback((q: number, r: number, allianceId: string) => {
    if (!invoke) {
      return;
    }

    invoke('AssignAllianceStartingTile', q, r, allianceId).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleStartGame = useCallback(() => {
    if (!invoke) {
      return;
    }

    invoke('StartGame').catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleReturnToLobby = useCallback(() => {
    if (!invoke) {
      cleanupLobbyState();
      void refreshMyRooms().catch(cause => setError(String(cause)));
      return;
    }

    void invoke('ReturnToLobby')
      .catch(cause => setError(String(cause)))
      .finally(() => {
        cleanupLobbyState();
        void refreshMyRooms().catch(cause => setError(String(cause)));
      });
  }, [cleanupLobbyState, invoke, refreshMyRooms, setError]);

  const handleSetObserverMode = useCallback((enabled: boolean) => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('SetHostObserverMode', activeRoomCode, enabled).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handleUpdateDynamicsLive = useCallback((dynamics: GameDynamics) => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('UpdateGameDynamicsLive', activeRoomCode, dynamics).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handleTriggerEvent = useCallback((eventType: string, targetQ?: number, targetR?: number, targetAllianceId?: string) => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('TriggerGameEvent', activeRoomCode, eventType, targetQ ?? null, targetR ?? null, targetAllianceId ?? null)
      .catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handleSendHostMessage = useCallback((message: string, allianceIds?: string[]) => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('SendHostMessage', activeRoomCode, message, allianceIds ?? null).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handlePauseGame = useCallback((paused: boolean) => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('PauseGame', activeRoomCode, paused).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handleHexClick = useCallback((q: number, r: number, cell: HexCell | undefined) => {
    if (commandoTargetingMode) {
      void handleActivateCommandoRaid(q, r);
      setCommandoTargetingMode(false);
      return;
    }

    if (!auth || !gameState || gameState.phase !== 'Playing') {
      return;
    }

    const targetHex: [number, number] = [q, r];
    setSelectedHex(targetHex);
    setPickupPrompt(null);
    clearError();

    if (!isHostBypass && (!currentHex || currentHex[0] !== q || currentHex[1] !== r)) {
      const interactionStatus = getTileInteractionStatus({
        state: gameState,
        player: myPlayer,
        targetHex,
        targetCell: cell,
        currentHex,
        t,
        isHostBypass,
      });
      setMapFeedback({
        tone: interactionStatus.action === 'none' ? interactionStatus.tone : 'info',
        message: interactionStatus.message,
        targetHex,
      });
      return;
    }

    setMapFeedback(null);
  }, [
    auth,
    clearError,
    commandoTargetingMode,
    currentHex,
    gameState,
    handleActivateCommandoRaid,
    isHostBypass,
    myPlayer,
    setCommandoTargetingMode,
    setMapFeedback,
    setPickupPrompt,
    setSelectedHex,
    t,
  ]);

  const tileActions = useMemo<TileAction[]>(() => {
    if (!gameState || gameState.phase !== 'Playing' || !selectedHex) {
      return [];
    }

    const targetCell = gameState.grid[`${selectedHex[0]},${selectedHex[1]}`];
    return getTileActions({
      state: gameState,
      player: myPlayer,
      targetHex: selectedHex,
      targetCell,
      currentHex,
      isHostBypass,
    });
  }, [currentHex, gameState, isHostBypass, myPlayer, selectedHex]);

  const currentHexActions = useMemo<TileAction[]>(() => {
    if (!gameState || gameState.phase !== 'Playing' || !currentHex) {
      return [];
    }

    const targetCell = gameState.grid[`${currentHex[0]},${currentHex[1]}`];
    return getTileActions({
      state: gameState,
      player: myPlayer,
      targetHex: currentHex,
      targetCell,
      currentHex,
      isHostBypass,
    });
  }, [currentHex, gameState, isHostBypass, myPlayer]);

  const currentHexCell = useMemo(() => {
    if (!gameState || !currentHex) {
      return undefined;
    }

    return gameState.grid[`${currentHex[0]},${currentHex[1]}`];
  }, [currentHex, gameState]);

  const handleTileAction = useCallback((actionType: TileActionType) => {
    if (!selectedHex || !gameState || !invoke) {
      return;
    }

    const [q, r] = selectedHex;

    let actionLat: number;
    let actionLng: number;
    if (isHostBypass && gameState.mapLat != null && gameState.mapLng != null) {
      const [hexLat, hexLng] = roomHexToLatLng(q, r, gameState.mapLat, gameState.mapLng, gameState.tileSizeMeters);
      actionLat = hexLat;
      actionLng = hexLng;
    } else if (currentLocation) {
      actionLat = currentLocation.lat;
      actionLng = currentLocation.lng;
    } else {
      return;
    }

    switch (actionType) {
      case 'claim':
      case 'reinforce':
      case 'claimAlliance':
      case 'claimSelf': {
        const claimForSelf = actionType === 'claimSelf';
        invoke('PlaceTroops', q, r, actionLat, actionLng, null, claimForSelf)
          .then(() => {
            setPickupPrompt(null);
            playSound(actionType === 'reinforce' ? 'reinforce' : 'claim');
            if (actionType !== 'reinforce') {
              vibrate(HAPTIC.claim);
            }
            setMapFeedback({
              tone: 'success',
              message: getPlaceSuccessMessage(actionType === 'reinforce' ? 'reinforce' : 'claim', q, r, t),
              targetHex: selectedHex,
            });
          })
          .catch(cause => {
            playSound('error');
            setMapFeedback({ tone: 'error', message: getErrorMessage(cause), targetHex: selectedHex });
          });
        break;
      }
      case 'attack': {
        const cell = gameState.grid[`${q},${r}`];
        const defenderTroops = cell?.troops ?? 0;
        const maxTroops = myPlayer?.carriedTroops ?? 0;
        setAttackPrompt({ q, r, max: maxTroops, defenderTroops });
        setAttackCount(maxTroops);
        break;
      }
      case 'pickup': {
        const cell = gameState.grid[`${q},${r}`];
        setPickupPrompt({ q, r, max: cell?.troops ?? 1 });
        setPickupCount(1);
        break;
      }
      case 'ignore':
        setSelectedHex(null);
        setMapFeedback(null);
        break;
    }
  }, [
    currentLocation,
    gameState,
    invoke,
    isHostBypass,
    myPlayer,
    playSound,
    selectedHex,
    setAttackCount,
    setAttackPrompt,
    setMapFeedback,
    setPickupCount,
    setPickupPrompt,
    setSelectedHex,
    t,
  ]);

  const handleCurrentHexAction = useCallback((actionType: TileActionType) => {
    if (!currentHex || !gameState || !invoke) {
      return;
    }

    const [q, r] = currentHex;

    let actionLat: number;
    let actionLng: number;
    if (isHostBypass && gameState.mapLat != null && gameState.mapLng != null) {
      const [hexLat, hexLng] = roomHexToLatLng(q, r, gameState.mapLat, gameState.mapLng, gameState.tileSizeMeters);
      actionLat = hexLat;
      actionLng = hexLng;
    } else if (currentLocation) {
      actionLat = currentLocation.lat;
      actionLng = currentLocation.lng;
    } else {
      return;
    }

    switch (actionType) {
      case 'claim':
      case 'reinforce':
      case 'claimAlliance':
      case 'claimSelf': {
        const claimForSelf = actionType === 'claimSelf';
        invoke('PlaceTroops', q, r, actionLat, actionLng, null, claimForSelf)
          .then(() => {
            setPickupPrompt(null);
            playSound(actionType === 'reinforce' ? 'reinforce' : 'claim');
            if (actionType !== 'reinforce') {
              vibrate(HAPTIC.claim);
            }
            setMapFeedback({
              tone: 'success',
              message: getPlaceSuccessMessage(actionType === 'reinforce' ? 'reinforce' : 'claim', q, r, t),
              targetHex: currentHex,
            });
          })
          .catch(cause => {
            playSound('error');
            setMapFeedback({ tone: 'error', message: getErrorMessage(cause), targetHex: currentHex });
          });
        break;
      }
      case 'attack': {
        setSelectedHex(currentHex);
        const cell = gameState.grid[`${q},${r}`];
        const defenderTroops = cell?.troops ?? 0;
        const maxTroops = myPlayer?.carriedTroops ?? 0;
        setAttackPrompt({ q, r, max: maxTroops, defenderTroops });
        setAttackCount(maxTroops);
        break;
      }
      case 'pickup': {
        setSelectedHex(currentHex);
        const cell = gameState.grid[`${q},${r}`];
        setPickupPrompt({ q, r, max: cell?.troops ?? 1 });
        setPickupCount(1);
        break;
      }
      case 'ignore':
        setMapFeedback(null);
        break;
    }
  }, [
    currentHex,
    currentLocation,
    gameState,
    invoke,
    isHostBypass,
    myPlayer,
    playSound,
    setAttackCount,
    setAttackPrompt,
    setMapFeedback,
    setPickupCount,
    setPickupPrompt,
    setSelectedHex,
    t,
  ]);

  const handleDismissTileActions = useCallback(() => {
    setSelectedHex(null);
    setMapFeedback(null);
  }, [setMapFeedback, setSelectedHex]);

  const handleConfirmPickup = useCallback(() => {
    if (!pickupPrompt || !invoke) {
      return;
    }

    let pickupLat: number;
    let pickupLng: number;
    if (isHostBypass && gameState && gameState.mapLat != null && gameState.mapLng != null) {
      const [hexLat, hexLng] = roomHexToLatLng(pickupPrompt.q, pickupPrompt.r, gameState.mapLat, gameState.mapLng, gameState.tileSizeMeters);
      pickupLat = hexLat;
      pickupLng = hexLng;
    } else if (currentLocation) {
      pickupLat = currentLocation.lat;
      pickupLng = currentLocation.lng;
    } else {
      return;
    }

    const targetHex: [number, number] = [pickupPrompt.q, pickupPrompt.r];
    clearError();
    setSelectedHex(targetHex);
    invoke('PickUpTroops', pickupPrompt.q, pickupPrompt.r, pickupCount, pickupLat, pickupLng)
      .then(() => {
        setPickupPrompt(null);
        playSound('pickup');
        setMapFeedback({
          tone: 'success',
          message: t('game.mapFeedback.pickedUp', {
            count: pickupCount,
            q: pickupPrompt.q,
            r: pickupPrompt.r,
          }),
          targetHex,
        });
      })
      .catch(cause => {
        setMapFeedback({
          tone: 'error',
          message: getErrorMessage(cause),
          targetHex,
        });
      });
  }, [
    clearError,
    currentLocation,
    gameState,
    invoke,
    isHostBypass,
    pickupCount,
    pickupPrompt,
    playSound,
    setMapFeedback,
    setPickupPrompt,
    setSelectedHex,
    t,
  ]);

  const handleConfirmAttack = useCallback(async () => {
    if (!attackPrompt || !invoke) {
      return;
    }

    let attackLat: number;
    let attackLng: number;
    if (isHostBypass && gameState && gameState.mapLat != null && gameState.mapLng != null) {
      const [hexLat, hexLng] = roomHexToLatLng(attackPrompt.q, attackPrompt.r, gameState.mapLat, gameState.mapLng, gameState.tileSizeMeters);
      attackLat = hexLat;
      attackLng = hexLng;
    } else if (currentLocation) {
      attackLat = currentLocation.lat;
      attackLng = currentLocation.lng;
    } else {
      return;
    }

    try {
      await invoke('PlaceTroops', attackPrompt.q, attackPrompt.r, attackLat, attackLng, attackCount, false);
      playSound('attack');
    } catch (error) {
      playSound('error');
      setMapFeedback({ tone: 'error', message: getErrorMessage(error), targetHex: [attackPrompt.q, attackPrompt.r] });
    } finally {
      setAttackPrompt(null);
    }
  }, [attackCount, attackPrompt, currentLocation, gameState, invoke, isHostBypass, playSound, setAttackPrompt, setMapFeedback]);

  const handleCancelAttack = useCallback(() => {
    setAttackPrompt(null);
  }, [setAttackPrompt]);

  const handleReClaimHex = useCallback(async (mode: ReClaimMode) => {
    if (!combatResult) {
      return;
    }

    if (mode === 'Alliance') {
      setCombatResult(null);
      return;
    }

    if (!invoke) {
      setCombatResult(null);
      return;
    }

    try {
      await invoke('ReClaimHex', combatResult.q, combatResult.r, mode);
    } catch (error) {
      setMapFeedback({ tone: 'error', message: getErrorMessage(error), targetHex: [combatResult.q, combatResult.r] });
    } finally {
      setCombatResult(null);
    }
  }, [combatResult, invoke, setCombatResult, setMapFeedback]);

  const handlePlayAgain = useCallback(() => {
    clearSession();
    setMyRooms([]);
    setGameState(null);
    clearGameplayUi();
    setView('lobby');
    setError('');
    setPickupPrompt(null);
    void refreshMyRooms().catch(cause => setError(String(cause)));
  }, [clearGameplayUi, clearSession, refreshMyRooms, setError, setGameState, setMyRooms, setPickupPrompt, setView]);

  return {
    refreshMyRooms,
    handleCreateRoom,
    handleJoinRoom,
    handleSetAlliance,
    handleSetMapLocation,
    handleSetTileSize,
    handleUseCenteredGameArea,
    handleSetPatternGameArea,
    handleSetCustomGameArea,
    handleSetClaimMode,
    handleSetAllowSelfClaim,
    handleSetWinCondition,
    handleSetCopresenceModes,
    handleSetCopresencePreset,
    handleSetGameDynamics,
    handleSetPlayerRole,
    handleSetAllianceHQ,
    handleActivateBeacon,
    handleDeactivateBeacon,
    handleActivateStealth,
    handleActivateCommandoRaid,
    handleAcceptDuel,
    handleDeclineDuel,
    handleDetainPlayer,
    handleSetMasterTile,
    handleSetMasterTileByHex,
    handleAssignStartingTile,
    handleConfigureAlliances,
    handleDistributePlayers,
    handleAssignAllianceStartingTile,
    handleStartGame,
    handleReturnToLobby,
    handleSetObserverMode,
    handleUpdateDynamicsLive,
    handleTriggerEvent,
    handleSendHostMessage,
    handlePauseGame,
    handleHexClick,
    tileActions,
    currentHexActions,
    currentHexCell,
    handleTileAction,
    handleCurrentHexAction,
    handleDismissTileActions,
    handleConfirmPickup,
    handleConfirmAttack,
    handleCancelAttack,
    handleReClaimHex,
    handlePlayAgain,
  };
}
