import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthPage } from './components/auth/AuthPage';
import { GameView } from './components/GameView';
import { LobbyView } from './components/LobbyView';
import { MapEditorPage } from './components/editor/MapEditorPage';
import { DebugLocationPanel } from './components/game/DebugLocationPanel';
import { GameOver } from './components/game/GameOver';
import { latLngToRoomHex, roomHexToLatLng } from './components/map/HexMath';
import { useAuth } from './hooks/useAuth';
import { useAutoResume } from './hooks/useAutoResume';
import type { SignalRInvoke } from './hooks/useAutoResume';
import { useGameActions } from './hooks/useGameActions';
import { useGeolocation } from './hooks/useGeolocation';
import { usePlayerPreferences } from './hooks/usePlayerPreferences';
import { useSignalR } from './hooks/useSignalR';
import { useSignalRHandlers } from './hooks/useSignalRHandlers';
import { useSound } from './hooks/useSound';
import { useToastQueue } from './hooks/useToastQueue';
import { useGameStore } from './stores/gameStore';
import { useGameplayStore } from './stores/gameplayStore';
import { useUiStore } from './stores/uiStore';
import type { RoomSummary } from './types/game';
import { getErrorMessage, localizeLobbyError } from './utils/gameHelpers';
import './styles/index.css';

const DEBUG_GPS_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_GPS === 'true';

interface LocationPoint {
  lat: number;
  lng: number;
}

export default function App() {
  const { t } = useTranslation();
  const { auth, authReady, login, register, logout } = useAuth();
  const gameState = useGameStore(state => state.gameState);
  const savedSession = useGameStore(state => state.savedSession);
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
  const setHasAcknowledgedRules = useUiStore(state => state.setHasAcknowledgedRules);
  const setShowDebugTools = useUiStore(state => state.setShowDebugTools);
  const setDebugLocationEnabled = useUiStore(state => state.setDebugLocationEnabled);
  const setDebugLocation = useUiStore(state => state.setDebugLocation);
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const location = useGeolocation(Boolean(auth));
  const { playSound } = useSound();
  const mapNavigateRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const invokeRef = useRef<SignalRInvoke | null>(null);
  const savedRoomCode = savedSession?.roomCode ?? '';
  const rulesKey = gameState?.roomCode ? `lg-rules-ack-${gameState.roomCode}` : '';

  useEffect(() => {
    if (!rulesKey) {
      setHasAcknowledgedRules(false);
      return;
    }

    setHasAcknowledgedRules(sessionStorage.getItem(rulesKey) === 'true');
  }, [rulesKey, setHasAcknowledgedRules]);

  const autoResume = useAutoResume({ auth, t });
  const signalRHandlers = useSignalRHandlers({
    getInvoke: () => invokeRef.current,
    saveSession: autoResume.saveSession,
    resolveResumeFromState: autoResume.resolveResumeFromState,
    resolveResumeFromError: autoResume.resolveResumeFromError,
    savedSessionRef: autoResume.savedSessionRef,
    t,
    playSound,
    pushToast,
  });
  const { connected, reconnecting, invoke } = useSignalR(auth?.token ?? null, signalRHandlers);
  invokeRef.current = invoke;

  useEffect(() => autoResume.handleConnectionChange(connected, invoke), [autoResume, connected, invoke]);

  const liveLocation = useMemo<LocationPoint | null>(() => {
    if (location.lat == null || location.lng == null) {
      return null;
    }

    return { lat: location.lat, lng: location.lng };
  }, [location.lat, location.lng]);

  const usingDebugLocation = DEBUG_GPS_AVAILABLE && debugLocationEnabled && debugLocation !== null;
  const currentLocation = useMemo<LocationPoint | null>(() => {
    if (usingDebugLocation) {
      return debugLocation;
    }

    return liveLocation;
  }, [debugLocation, liveLocation, usingDebugLocation]);

  const effectiveLocationError = usingDebugLocation ? null : location.error;
  const effectiveLocationLoading = usingDebugLocation ? false : location.loading;
  const mapCenterLocation = useMemo<LocationPoint | null>(() => {
    if (!gameState || gameState.mapLat == null || gameState.mapLng == null) {
      return null;
    }

    return { lat: gameState.mapLat, lng: gameState.mapLng };
  }, [gameState]);

  const myPlayer = useMemo(() => {
    if (!auth || !gameState) {
      return null;
    }

    return gameState.players.find(player => player.id === auth.userId) ?? null;
  }, [auth, gameState]);

  const isHostBypass = Boolean(gameState?.hostBypassGps && myPlayer?.isHost);
  const currentHex = useMemo(() => {
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
  }, [currentLocation, gameState]);

  const {
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
    handleAcceptDuel,
    handleDeclineDuel,
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
    currentHexActions,
    handleCurrentHexAction,
    handleDismissTileActions,
    handleConfirmPickup,
    handleConfirmAttack,
    handleReClaimHex,
    handlePlayAgain,
  } = useGameActions({
    invoke,
    auth,
    connected,
    autoResuming,
    pendingResumeRef: autoResume.pendingResumeRef,
    gameState,
    currentLocation,
    currentHex,
    myPlayer,
    isHostBypass,
    t,
    playSound,
    clearSession: autoResume.clearSession,
  });

  const handleMiniMapNavigate = useCallback((lat: number, lng: number) => {
    mapNavigateRef.current?.(lat, lng);
  }, []);

  const handleAcknowledgeRules = useCallback(() => {
    if (rulesKey) {
      sessionStorage.setItem(rulesKey, 'true');
    }

    setHasAcknowledgedRules(true);
  }, [rulesKey, setHasAcknowledgedRules]);

  const applyDebugLocation = useCallback((lat: number, lng: number) => {
    setDebugLocation({ lat, lng });
    setDebugLocationEnabled(true);
    setError('');
  }, [setDebugLocation, setDebugLocationEnabled, setError]);

  const disableDebugLocation = useCallback(() => {
    setDebugLocationEnabled(false);
    setDebugLocation(null);
    setError('');
  }, [setDebugLocation, setDebugLocationEnabled, setError]);

  const canStepDebugByHex = Boolean(
    gameState?.mapLat != null
      && gameState?.mapLng != null
      && (currentLocation ?? mapCenterLocation),
  );

  const stepDebugLocationByHex = useCallback((dq: number, dr: number): LocationPoint | null => {
    if (!gameState || gameState.mapLat == null || gameState.mapLng == null) {
      return null;
    }

    const seedLocation = currentLocation ?? mapCenterLocation;
    if (!seedLocation) {
      return null;
    }

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
    if (!auth || !connected || gameState || autoResuming) {
      return;
    }

    let cancelled = false;
    void invoke<RoomSummary[]>('GetMyRooms')
      .then(rooms => {
        if (!cancelled) {
          setMyRooms(Array.isArray(rooms) ? rooms : []);
        }
      })
      .catch(cause => {
        if (!cancelled) {
          setError(localizeLobbyError(getErrorMessage(cause), t));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth, autoResuming, connected, gameState, invoke, setError, setMyRooms, t]);

  const connectionBannerMessage = autoResuming
    ? t('errors.restoringRoom', { code: savedRoomCode })
    : reconnecting
      ? t('errors.reconnecting')
      : '';
  const connectionBanner = connectionBannerMessage
    ? <ConnectionBanner message={connectionBannerMessage} />
    : null;

  const debugGpsPanel = auth && DEBUG_GPS_AVAILABLE && showDebugTools && view !== 'gameover' ? (
    <DebugLocationPanel
      enabled={usingDebugLocation}
      mapCenter={mapCenterLocation}
      canStepByHex={canStepDebugByHex}
      onApply={applyDebugLocation}
      onDisable={disableDebugLocation}
      onStepByHex={stepDebugLocationByHex}
    />
  ) : null;

  const debugToggleButton = auth && DEBUG_GPS_AVAILABLE && view !== 'gameover' ? (
    <button
      type="button"
      className={view === 'game' ? 'btn-secondary debug-toggle-ingame' : 'debug-tools-toggle'}
      onClick={() => setShowDebugTools(!showDebugTools)}
      aria-pressed={showDebugTools}
    >
      {showDebugTools ? t('debugGps.hideTools') : t('debugGps.showTools')}
    </button>
  ) : null;

  const handleLogout = useCallback(() => {
    autoResume.clearSession();
    disableDebugLocation();
    setShowDebugTools(false);
    setMyRooms([]);
    void logout();
    setGameState(null);
    setPickupPrompt(null);
    clearGameplayUi();
    setView('lobby');
  }, [autoResume, clearGameplayUi, disableDebugLocation, logout, setGameState, setMyRooms, setPickupPrompt, setShowDebugTools, setView]);

  if (!authReady) {
    return null;
  }

  if (!auth) {
    return <AuthPage onLogin={login} onRegister={register} />;
  }

  if (view === 'mapEditor') {
    return <MapEditorPage token={auth.token} onBack={() => setView('lobby')} />;
  }

  if (view === 'gameover' && gameState) {
    return (
      <>
        {connectionBanner}
        <GameOver state={gameState} onPlayAgain={handlePlayAgain} />
      </>
    );
  }

  if (view === 'game' && gameState) {
    return (
      <GameView
        connectionBanner={connectionBanner}
        currentHex={currentHex}
        currentHexActions={currentHexActions}
        currentLocation={currentLocation}
        debugGpsPanel={debugGpsPanel}
        debugToggleButton={debugToggleButton}
        locationError={effectiveLocationError}
        mapNavigateRef={mapNavigateRef}
        onAcceptDuel={handleAcceptDuel}
        onActivateBeacon={handleActivateBeacon}
        onActivateStealth={handleActivateStealth}
        onAcknowledgeRules={handleAcknowledgeRules}
        onConfirmAttack={handleConfirmAttack}
        onConfirmPickup={handleConfirmPickup}
        onCurrentHexAction={handleCurrentHexAction}
        onDeactivateBeacon={handleDeactivateBeacon}
        onDeclineDuel={handleDeclineDuel}
        onDismissTileActions={handleDismissTileActions}
        onDismissToast={dismissToast}
        onHexClick={handleHexClick}
        onNavigateMap={handleMiniMapNavigate}
        onPauseGame={handlePauseGame}
        onPlayerDisplayPrefsChange={setPlayerDisplayPrefs}
        onReClaim={handleReClaimHex}
        onReturnToLobby={handleReturnToLobby}
        onSendHostMessage={handleSendHostMessage}
        onSetObserverMode={handleSetObserverMode}
        onTriggerEvent={handleTriggerEvent}
        onUpdateDynamics={handleUpdateDynamicsLive}
        playerDisplayPrefs={playerDisplayPrefs}
        toasts={toasts}
        userId={auth.userId}
        username={auth.username}
      />
    );
  }

  return (
    <>
      {connectionBanner}
      <LobbyView
        connected={connected}
        currentLocation={currentLocation}
        debugGpsPanel={debugGpsPanel}
        debugToggleButton={debugToggleButton}
        invoke={invoke}
        locationError={effectiveLocationError}
        locationLoading={effectiveLocationLoading}
        mapEditorLabel={t('mapEditor.title')}
        onAssignAllianceStartingTile={handleAssignAllianceStartingTile}
        onAssignStartingTile={handleAssignStartingTile}
        onConfigureAlliances={handleConfigureAlliances}
        onCreateRoom={handleCreateRoom}
        onDistributePlayers={handleDistributePlayers}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
        onOpenMapEditor={() => setView('mapEditor')}
        onReturnToLobby={handleReturnToLobby}
        onSetAlliance={handleSetAlliance}
        onSetAllianceHQ={handleSetAllianceHQ}
        onSetAllowSelfClaim={handleSetAllowSelfClaim}
        onSetClaimMode={handleSetClaimMode}
        onSetCopresenceModes={handleSetCopresenceModes}
        onSetCopresencePreset={handleSetCopresencePreset}
        onSetCustomGameArea={handleSetCustomGameArea}
        onSetGameDynamics={handleSetGameDynamics}
        onSetMapLocation={handleSetMapLocation}
        onSetMasterTile={handleSetMasterTile}
        onSetMasterTileByHex={handleSetMasterTileByHex}
        onSetObserverMode={handleSetObserverMode}
        onSetPatternGameArea={handleSetPatternGameArea}
        onSetPlayerRole={handleSetPlayerRole}
        onSetTileSize={handleSetTileSize}
        onSetWinCondition={handleSetWinCondition}
        onStartGame={handleStartGame}
        onUseCenteredGameArea={handleUseCenteredGameArea}
        token={auth.token}
        userId={auth.userId}
        username={auth.username}
      />
    </>
  );
}

function ConnectionBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="connection-banner"
    >
      {message}
    </div>
  );
}
