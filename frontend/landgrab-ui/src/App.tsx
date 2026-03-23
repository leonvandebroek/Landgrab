import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import { useAutoResume } from './hooks/useAutoResume';
import { useGameActions } from './hooks/useGameActions';
import { useSignalR } from './hooks/useSignalR';
import { useSignalRHandlers } from './hooks/useSignalRHandlers';
import { useGeolocation } from './hooks/useGeolocation';
import { useDeviceOrientation } from './hooks/useDeviceOrientation';
import { usePlayerPreferences } from './hooks/usePlayerPreferences';
import { useSound } from './hooks/useSound';
import { AuthPage } from './components/auth/AuthPage';
import { MapEditorPage } from './components/editor/MapEditorPage';
import { ConnectionBanner } from './components/ConnectionBanner';
import { DebugLocationPanel } from './components/game/DebugLocationPanel';
import { DebugSensorPanel } from './components/game/DebugSensorPanel';
import { GameOver } from './components/game/GameOver';
import { GameView } from './components/GameView';
import type { GameViewActions } from './components/GameView';
import { LobbyView } from './components/LobbyView';
import type { LobbyViewActions } from './components/LobbyView';
import { latLngToRoomHex, roomHexToLatLng } from './components/map/HexMath';
import type { GameState, RoomSummary } from './types/game';
import { useGameStore } from './stores/gameStore';
import type { SavedSession } from './stores/gameStore';
import { useGameplayStore } from './stores';
import { useInfoLedgeStore } from './stores/infoLedgeStore';
import { useUiStore } from './stores/uiStore';
import { getErrorMessage, localizeLobbyError } from './utils/gameHelpers';
import {
  clearPersistedDebugLocation,
  persistDebugLocation,
  readPersistedDebugLocation,
} from './utils/debugLocationSession';
import { installAgentBridge, uninstallAgentBridge } from './testing/agentBridge';
import './styles/index.css';
import './styles/tricorder-v2.css';

const DEBUG_GPS_AVAILABLE = import.meta.env.DEV;

type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

interface LocationPoint {
  lat: number;
  lng: number;
}

export default function App() {
  const { t } = useTranslation();
  const { auth, authReady, login, register, logout } = useAuth();

  // ── Store reads ──────────────────────────────────────────────────────────
  const gameState = useGameStore(state => state.gameState);
  const savedSession = useGameStore(state => state.savedSession);
  const myRooms = useGameStore(state => state.myRooms);
  const autoResuming = useGameStore(state => state.autoResuming);
  const setGameState = useGameStore(state => state.setGameState);
  const setMyRooms = useGameStore(state => state.setMyRooms);
  const setPickupPrompt = useGameplayStore(state => state.setPickupPrompt);
  const clearGameplayUi = useGameplayStore(state => state.clearGameplayUi);
  const [playerDisplayPrefs, setPlayerDisplayPrefs] = usePlayerPreferences();
  const view = useUiStore(state => state.view);
  const showDebugTools = useUiStore(state => state.showDebugTools);
  const debugLocationEnabled = useUiStore(state => state.debugLocationEnabled);
  const debugLocation = useUiStore(state => state.debugLocation);
  const setView = useUiStore(state => state.setView);
  const setError = useUiStore(state => state.setError);
  const setShowDebugTools = useUiStore(state => state.setShowDebugTools);
  const setDebugLocationEnabled = useUiStore(state => state.setDebugLocationEnabled);
  const setDebugLocation = useUiStore(state => state.setDebugLocation);

  // ── Toast queue / misc hooks ─────────────────────────────────────────────
  const mapNavigateRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const handleMiniMapNavigate = useCallback((lat: number, lng: number) => {
    mapNavigateRef.current?.(lat, lng);
  }, []);
  const myPlayer = useMemo(() => {
    if (!auth || !gameState) return null;
    return gameState.players.find(player => player.id === auth.userId) ?? null;
  }, [auth, gameState]);
  const isHostOnLocationSetupStep = useMemo(() => {
    if (!gameState || gameState.phase !== 'Lobby' || !myPlayer?.isHost) {
      return false;
    }

    if (typeof gameState.currentWizardStep === 'number') {
      return gameState.currentWizardStep === 0;
    }

    return !gameState.hasMapLocation || gameState.mapLat == null || gameState.mapLng == null;
  }, [gameState, myPlayer?.isHost]);
  const shouldEnableGeolocation = Boolean(auth) && (
    gameState?.phase === 'Playing'
    || isHostOnLocationSetupStep
  );
  const location = useGeolocation(shouldEnableGeolocation);
  const { headingRef } = useDeviceOrientation(shouldEnableGeolocation);
  const { playSound } = useSound();

  // ── SignalR wiring ───────────────────────────────────────────────────────
  //
  // useAutoResume needs `connected` and `invoke` from useSignalR, but
  // useSignalRHandlers needs session callbacks (saveSession, resolveResume*)
  // from useAutoResume — a circular dependency.
  //
  // Resolution:
  //  1. Create `savedSessionRef` here so it can be shared with
  //     useSignalRHandlers before useAutoResume is called.
  //  2. Create a single `autoResumeRef` object that holds the real callbacks
  //     once useAutoResume returns, plus three stable wrapper useCallbacks
  //     that always delegate through it.  useSignalRHandlers uses only the
  //     stable wrappers, so its useMemo never stales on callback identity.
  //  3. Call useSignalRHandlers → useSignalR → useAutoResume in that order.
  //  4. After useAutoResume returns, populate the shared refs in layout effects
  //     so handlers see the latest callbacks without mutating refs during render.

  const invokeRef = useRef<SignalRInvoke | null>(null);

  // Shared with useSignalRHandlers; useAutoResume manages .current syncing.
  const savedSessionRef = useRef<SavedSession | null>(savedSession);

  const autoResumeRef = useRef<{
    saveSession: (code: string) => void;
    resolveResumeFromState: (state: GameState) => boolean;
    resolveResumeFromError: (msg: string) => boolean;
  }>({
    saveSession: () => { },
    resolveResumeFromState: () => false,
    resolveResumeFromError: () => false,
  });

  // Stable wrappers — identity never changes, so useSignalRHandlers' useMemo
  // is not invalidated when the real callbacks are replaced after first render.
  const stableSaveSession = useCallback(
    (code: string) => { autoResumeRef.current.saveSession(code); },
    [],
  );
  const stableResolveFromState = useCallback(
    (state: GameState) => autoResumeRef.current.resolveResumeFromState(state),
    [],
  );
  const stableResolveFromError = useCallback(
    (msg: string) => autoResumeRef.current.resolveResumeFromError(msg),
    [],
  );

  const signalRHandlers = useSignalRHandlers({
    getInvoke: () => invokeRef.current,
    saveSession: stableSaveSession,
    resolveResumeFromState: stableResolveFromState,
    resolveResumeFromError: stableResolveFromError,
    savedSessionRef,
    t,
    playSound,
  });

  const { connected, reconnecting, invoke } = useSignalR(auth?.token ?? null, signalRHandlers);
  useLayoutEffect(() => {
    invokeRef.current = invoke;
  });

  // Now we have connected + invoke — call useAutoResume.
  const { saveSession, clearSession, resolveResumeFromState, resolveResumeFromError, pendingResumeRef } =
    useAutoResume({ auth, connected, invoke, t, savedSessionRef });

  useLayoutEffect(() => {
    autoResumeRef.current = { saveSession, resolveResumeFromState, resolveResumeFromError };
  });

  // ── Location ─────────────────────────────────────────────────────────────
  const usingDebugLocation = DEBUG_GPS_AVAILABLE && debugLocationEnabled && debugLocation !== null;

  const currentLocation = useMemo<LocationPoint | null>(() => {
    if (usingDebugLocation) return debugLocation;
    if (location.lat != null && location.lng != null) return { lat: location.lat, lng: location.lng };
    if (myPlayer?.currentLat == null || myPlayer.currentLng == null) return null;
    return { lat: myPlayer.currentLat, lng: myPlayer.currentLng };
  }, [usingDebugLocation, debugLocation, location.lat, location.lng, myPlayer]);

  const mapCenterLocation = useMemo<LocationPoint | null>(() => {
    if (!gameState || gameState.mapLat == null || gameState.mapLng == null) return null;
    return { lat: gameState.mapLat, lng: gameState.mapLng };
  }, [gameState]);
  const activeRoomCode = gameState?.roomCode ?? null;

  useEffect(() => {
    if (!DEBUG_GPS_AVAILABLE || !activeRoomCode) {
      return;
    }

    if (debugLocationEnabled && debugLocation !== null) {
      return;
    }

    const persistedDebugLocation = readPersistedDebugLocation(activeRoomCode);
    if (!persistedDebugLocation) {
      return;
    }

    setDebugLocation(persistedDebugLocation);
    setDebugLocationEnabled(true);
  }, [
    activeRoomCode,
    debugLocation,
    debugLocationEnabled,
    setDebugLocation,
    setDebugLocationEnabled,
  ]);

  useEffect(() => {
    if (
      !DEBUG_GPS_AVAILABLE
      || !activeRoomCode
      || !debugLocationEnabled
      || debugLocation === null
    ) {
      return;
    }

    persistDebugLocation(activeRoomCode, debugLocation);
  }, [
    activeRoomCode,
    debugLocation,
    debugLocationEnabled,
  ]);

  // ── Player / game derived values ─────────────────────────────────────────
  const isHostBypass = Boolean(gameState?.hostBypassGps && myPlayer?.isHost);
  const effectiveLocationError = usingDebugLocation || isHostBypass ? null : location.error;
  const effectiveLocationLoading = usingDebugLocation || isHostBypass ? false : location.loading;

  const serverCurrentHex = useMemo<[number, number] | null>(() => {
    if (myPlayer?.currentHexQ == null || myPlayer.currentHexR == null) return null;
    return [myPlayer.currentHexQ, myPlayer.currentHexR];
  }, [myPlayer]);

  const currentHex = useMemo(() => {
    if (serverCurrentHex) {
      return serverCurrentHex;
    }

    if (!gameState || !currentLocation || gameState.mapLat == null || gameState.mapLng == null) {
      return null;
    }
    return latLngToRoomHex(
      currentLocation.lat,
      currentLocation.lng,
      gameState.mapLat,
      gameState.mapLng,
      gameState.tileSizeMeters,
    );
  }, [currentLocation, gameState, serverCurrentHex]);

  const currentPlayerName = myPlayer?.name ?? auth?.username ?? '';

  // ── Game actions ─────────────────────────────────────────────────────────
  const {
    handleCreateRoom,
    handleJoinRoom,
    handleSetAlliance,
    handleAssignPlayerRole,
    handleRandomizeRoles,
    handleSetMapLocation,
    handleSetTileSize,
    handleUseCenteredGameArea,
    handleSetPatternGameArea,
    handleSetCustomGameArea,
    handleSetClaimMode,
    handleSetWinCondition,
    handleSetBeaconEnabled,
    handleSetTileDecayEnabled,
    handleSetEnemySightingMemory,
    handleSetGameDynamics,
    handleSetPlayerRole,
    handleSetAllianceHQ,
    handleActivateBeacon,
    handleDeactivateBeacon,
    handleShareBeaconIntel,
    handleActivateCommandoRaid,
    resolveRaidTarget,
    handleActivateTacticalStrike,
    resolveTacticalStrikeTarget,
    handleActivateRallyPoint,
    handleActivateSabotage,
    handleCancelFortConstruction,
    handleCancelSabotage,
    handleCancelDemolish,
    handleStartDemolish,
    handleStartFortConstruction,
    attemptIntercept,
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
    handleSendHostMessage,
    handlePauseGame,
    handleHexClick,
    currentHexActions,
    handleCurrentHexAction,
    handleDismissTileActions,
    handleConfirmPickup,
    handleConfirmReinforce,
    handleConfirmAttack,
    handleDeployCombatTroops,
    handleDeployNeutralClaimTroops,
    handlePlayAgain,
  } = useGameActions({
    invoke,
    auth,
    connected,
    autoResuming,
    pendingResumeRef,
    gameState,
    currentLocation,
    currentHeadingRef: headingRef,
    currentHex,
    myPlayer,
    isHostBypass,
    t,
    playSound,
    clearSession,
  });

  // ── GetMyRooms effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth || !connected || gameState || autoResuming) return;

    let cancelled = false;
    void invoke<RoomSummary[]>('GetMyRooms')
      .then(rooms => {
        if (!cancelled) setMyRooms(Array.isArray(rooms) ? rooms : []);
      })
      .catch(cause => {
        if (!cancelled) setError(localizeLobbyError(getErrorMessage(cause), t));
      });

    return () => { cancelled = true; };
  }, [auth, autoResuming, connected, gameState, invoke, setError, setMyRooms, t]);

  // ── Debug GPS helpers ────────────────────────────────────────────────────
  const canStepDebugByHex = Boolean(
    gameState?.mapLat != null &&
    gameState?.mapLng != null &&
    (currentLocation ?? mapCenterLocation),
  );

  const applyDebugLocation = useCallback((lat: number, lng: number) => {
    if (activeRoomCode) {
      persistDebugLocation(activeRoomCode, { lat, lng });
    }
    setDebugLocation({ lat, lng });
    setDebugLocationEnabled(true);
    setError('');
  }, [activeRoomCode, setDebugLocation, setDebugLocationEnabled, setError]);

  const disableDebugLocation = useCallback(() => {
    clearPersistedDebugLocation(activeRoomCode);
    setDebugLocationEnabled(false);
    setDebugLocation(null);
    setError('');
  }, [activeRoomCode, setDebugLocationEnabled, setDebugLocation, setError]);

  const stepDebugLocationByHex = useCallback((dq: number, dr: number): LocationPoint | null => {
    if (!gameState || gameState.mapLat == null || gameState.mapLng == null) return null;
    const seedLocation = currentLocation ?? mapCenterLocation;
    if (!seedLocation) return null;

    const [baseQ, baseR] = latLngToRoomHex(
      seedLocation.lat,
      seedLocation.lng,
      gameState.mapLat,
      gameState.mapLng,
      gameState.tileSizeMeters,
    );
    const [nextLat, nextLng] = roomHexToLatLng(
      baseQ + dq,
      baseR + dr,
      gameState.mapLat,
      gameState.mapLng,
      gameState.tileSizeMeters,
    );
    const nextLocation = { lat: nextLat, lng: nextLng };
    applyDebugLocation(nextLocation.lat, nextLocation.lng);
    return nextLocation;
  }, [applyDebugLocation, currentLocation, gameState, mapCenterLocation]);

  useEffect(() => {
    const ARROW_MAP: Record<string, [number, number]> = {
      ArrowUp:    [0,  1],
      ArrowDown:  [0, -1],
      ArrowLeft:  [-1, 0],
      ArrowRight: [1,  0],
    };
    function handleKeyDown(e: KeyboardEvent) {
      const delta = ARROW_MAP[e.key];
      if (!delta || !canStepDebugByHex) return;
      e.preventDefault();
      stepDebugLocationByHex(delta[0], delta[1]);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canStepDebugByHex, stepDebugLocationByHex]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        const { pickupPrompt, reinforcePrompt, combatPreview } = useGameplayStore.getState();
        if (pickupPrompt) {
          handleConfirmPickup();
        } else if (reinforcePrompt) {
          void handleConfirmReinforce();
        } else if (combatPreview) {
          void handleConfirmAttack();
        } else {
          const primary = currentHexActions.find(a => a.enabled);
          if (primary) handleCurrentHexAction(primary.type);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleDismissTileActions();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentHexActions, handleConfirmAttack, handleConfirmPickup, handleConfirmReinforce, handleCurrentHexAction, handleDismissTileActions]);

  // ── Connection / session banner ──────────────────────────────────────────
  const savedRoomCode = savedSession?.roomCode ?? '';
  const connectionBanner = autoResuming
    ? t('errors.restoringRoom', { code: savedRoomCode })
    : reconnecting
      ? t('errors.reconnecting')
      : '';

  useEffect(() => {
    if (view !== 'game') {
      useInfoLedgeStore.getState().clearBySource('connection');
      return;
    }

    if (connectionBanner) {
      useInfoLedgeStore.getState().push({
        severity: 'connection',
        source: 'connection',
        persistent: true,
        icon: 'returnArrow',
        message: connectionBanner,
      });
    } else {
      useInfoLedgeStore.getState().clearBySource('connection');
    }
  }, [connectionBanner, view]);

  // ── Logout handler ───────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    clearSession();
    disableDebugLocation();
    setShowDebugTools(false);
    setMyRooms([]);
    void logout();
    setGameState(null);
    setPickupPrompt(null);
    clearGameplayUi();
    useGameplayStore.getState().setSelectedHexKey(null);
    setView('lobby');
  }, [
    clearGameplayUi,
    clearSession,
    disableDebugLocation,
    logout,
    setGameState,
    setMyRooms,
    setPickupPrompt,
    setShowDebugTools,
    setView,
  ]);

  // ── Debug panel / toggle nodes ───────────────────────────────────────────
  const visibleRecentRooms = auth && connected ? myRooms : [];

  const debugGpsPanel = auth && DEBUG_GPS_AVAILABLE && showDebugTools && view !== 'gameover' ? (
    <div className="debug-panels-container">
      <DebugLocationPanel
        enabled={usingDebugLocation}
        mapCenter={mapCenterLocation}
        canStepByHex={canStepDebugByHex}
        onApply={applyDebugLocation}
        onDisable={disableDebugLocation}
        onStepByHex={stepDebugLocationByHex}
      />
      <DebugSensorPanel />
    </div>
  ) : null;

  const debugToggleButton = auth && DEBUG_GPS_AVAILABLE && view !== 'gameover' ? (
    <button
      type="button"
      data-testid="dev-section-toggle"
      className={view === 'game' ? 'btn-secondary debug-toggle-ingame' : 'debug-tools-toggle'}
      onClick={() => setShowDebugTools(!showDebugTools)}
    >
      {showDebugTools ? t('debugGps.hideTools') : t('debugGps.showTools')}
    </button>
  ) : null;

  // ── Action groupings for child views ─────────────────────────────────────
  const gameViewActions = useMemo<GameViewActions>(() => ({
    onHexClick: handleHexClick,
    onConfirmPickup: handleConfirmPickup,
    onConfirmReinforce: handleConfirmReinforce,
    onReturnToLobby: handleReturnToLobby,
    currentHexActions,
    onCurrentHexAction: handleCurrentHexAction,
    onDismissTileActions: handleDismissTileActions,
    onConfirmAttack: handleConfirmAttack,
    onActivateBeacon: handleActivateBeacon,
    onDeactivateBeacon: handleDeactivateBeacon,
    onShareBeaconIntel: handleShareBeaconIntel,
    onActivateCommandoRaid: handleActivateCommandoRaid,
    onResolveRaidTarget: resolveRaidTarget ?? (async () => null),
    onActivateTacticalStrike: handleActivateTacticalStrike,
    onResolveTacticalStrikeTarget: resolveTacticalStrikeTarget ?? (async () => null),
    onActivateRallyPoint: handleActivateRallyPoint,
    onActivateSabotage: handleActivateSabotage,
    onCancelFortConstruction: handleCancelFortConstruction,
    onCancelSabotage: handleCancelSabotage,
    onCancelDemolish: handleCancelDemolish,
    onStartDemolish: handleStartDemolish,
    onStartFortConstruction: handleStartFortConstruction,
    onAttemptIntercept: attemptIntercept,
    onSetObserverMode: handleSetObserverMode,
    onUpdateDynamicsLive: handleUpdateDynamicsLive,
    onSendHostMessage: handleSendHostMessage,
    onPauseGame: handlePauseGame,
    onDeployCombatTroops: handleDeployCombatTroops,
    onDeployNeutralClaimTroops: handleDeployNeutralClaimTroops,
  }), [
    handleHexClick, handleConfirmPickup, handleConfirmReinforce, handleReturnToLobby, currentHexActions,
    handleCurrentHexAction, handleDismissTileActions, handleConfirmAttack,
    handleActivateBeacon, handleDeactivateBeacon, handleShareBeaconIntel, handleActivateCommandoRaid, resolveRaidTarget, handleActivateTacticalStrike, resolveTacticalStrikeTarget,
    handleActivateRallyPoint, handleActivateSabotage, handleCancelFortConstruction,
    handleCancelSabotage, handleCancelDemolish,
    handleStartDemolish, handleStartFortConstruction, attemptIntercept, handleSetObserverMode,
    handleUpdateDynamicsLive, handleSendHostMessage, handlePauseGame, handleDeployCombatTroops,
    handleDeployNeutralClaimTroops,
  ]);

  const lobbyViewActions = useMemo<LobbyViewActions>(() => ({
    onCreateRoom: handleCreateRoom,
    onJoinRoom: handleJoinRoom,
    onSetAlliance: handleSetAlliance,
    onAssignPlayerRole: handleAssignPlayerRole,
    onRandomizeRoles: handleRandomizeRoles,
    onSetMapLocation: handleSetMapLocation,
    onSetTileSize: handleSetTileSize,
    onUseCenteredGameArea: handleUseCenteredGameArea,
    onSetPatternGameArea: handleSetPatternGameArea,
    onSetCustomGameArea: handleSetCustomGameArea,
    onSetClaimMode: handleSetClaimMode,
    onSetWinCondition: handleSetWinCondition,
    onSetBeaconEnabled: handleSetBeaconEnabled,
    onSetTileDecayEnabled: handleSetTileDecayEnabled,
    onSetEnemySightingMemory: handleSetEnemySightingMemory,
    onSetGameDynamics: handleSetGameDynamics,
    onSetPlayerRole: handleSetPlayerRole,
    onSetAllianceHQ: handleSetAllianceHQ,
    onSetMasterTile: handleSetMasterTile,
    onSetMasterTileByHex: handleSetMasterTileByHex,
    onAssignStartingTile: handleAssignStartingTile,
    onConfigureAlliances: handleConfigureAlliances,
    onDistributePlayers: handleDistributePlayers,
    onAssignAllianceStartingTile: handleAssignAllianceStartingTile,
    onStartGame: handleStartGame,
    onReturnToLobby: handleReturnToLobby,
    onSetObserverMode: handleSetObserverMode,
  }), [
    handleCreateRoom, handleJoinRoom, handleSetAlliance, handleAssignPlayerRole,
    handleRandomizeRoles, handleSetMapLocation,
    handleSetTileSize, handleUseCenteredGameArea, handleSetPatternGameArea,
    handleSetCustomGameArea, handleSetClaimMode,
    handleSetWinCondition, handleSetBeaconEnabled, handleSetTileDecayEnabled,
    handleSetEnemySightingMemory,
    handleSetGameDynamics, handleSetPlayerRole, handleSetAllianceHQ,
    handleSetMasterTile, handleSetMasterTileByHex, handleAssignStartingTile,
    handleConfigureAlliances, handleDistributePlayers, handleAssignAllianceStartingTile,
    handleStartGame, handleReturnToLobby, handleSetObserverMode,
  ]);

  useEffect(() => {
    installAgentBridge({
      auth,
      connected,
      reconnecting,
      currentLocation,
      currentHex,
      currentPlayerName,
      isHostBypass,
      invoke,
      mapNavigate: (lat, lng) => {
        mapNavigateRef.current?.(lat, lng);
      },
      applyDebugLocation,
      disableDebugLocation,
      stepDebugLocationByHex,
      handleHexClick,
      handleSetAlliance,
      handleSetMapLocation,
      handleSetTileSize,
      handleUseCenteredGameArea,
      handleSetClaimMode,
      handleSetWinCondition,
      handleSetGameDynamics,
      handleConfigureAlliances,
      handleDistributePlayers,
      handleUpdateDynamicsLive,
    });

    return () => {
      uninstallAgentBridge();
    };
  }, [
    auth,
    connected,
    reconnecting,
    currentLocation,
    currentHex,
    currentPlayerName,
    isHostBypass,
    invoke,
    applyDebugLocation,
    disableDebugLocation,
    stepDebugLocationByHex,
    handleHexClick,
    handleSetAlliance,
    handleSetMapLocation,
    handleSetTileSize,
    handleUseCenteredGameArea,
    handleSetClaimMode,
    handleSetWinCondition,
    handleSetGameDynamics,
    handleConfigureAlliances,
    handleDistributePlayers,
    handleUpdateDynamicsLive,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────

  if (!authReady) return null;

  if (!auth) {
    return <AuthPage onLogin={login} onRegister={register} />;
  }

  if (view === 'mapEditor') {
    return <MapEditorPage token={auth.token} onBack={() => setView('lobby')} />;
  }

  if (view === 'gameover' && gameState) {
    return (
      <>
        {connectionBanner && <ConnectionBanner message={connectionBanner} />}
        <GameOver state={gameState} onPlayAgain={handlePlayAgain} />
      </>
    );
  }

  if (view === 'game' && gameState) {
    return (
      <GameView
        userId={auth.userId}
        currentLocation={currentLocation}
        currentHex={currentHex}
        effectiveLocationError={effectiveLocationError}
        currentPlayerName={currentPlayerName}
        playerDisplayPrefs={playerDisplayPrefs}
        onPlayerDisplayPrefsChange={setPlayerDisplayPrefs}
        mapNavigateRef={mapNavigateRef}
        onNavigateMap={handleMiniMapNavigate}
        debugToggle={debugToggleButton}
        debugPanel={debugGpsPanel}
        actions={gameViewActions}
      />
    );
  }

  return (
    <LobbyView
      connectionBanner={connectionBanner}
      username={auth.username}
      userId={auth.userId}
      authToken={auth.token}
      connected={connected}
      currentLocation={currentLocation}
      effectiveLocationError={effectiveLocationError}
      effectiveLocationLoading={effectiveLocationLoading}
      visibleRecentRooms={visibleRecentRooms}
      invoke={invoke}
      onLogout={handleLogout}
      debugPanel={debugGpsPanel}
      debugToggle={debugToggleButton}
      actions={lobbyViewActions}
    />
  );
}
