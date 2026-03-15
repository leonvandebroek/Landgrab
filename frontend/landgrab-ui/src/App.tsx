import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import { useGameActions } from './hooks/useGameActions';
import { useSignalR } from './hooks/useSignalR';
import { useSignalRHandlers } from './hooks/useSignalRHandlers';
import { useGeolocation } from './hooks/useGeolocation';
import { usePlayerPreferences } from './hooks/usePlayerPreferences';
import { useSound } from './hooks/useSound';
import { useToastQueue } from './hooks/useToastQueue';
import { AuthPage } from './components/auth/AuthPage';
import { MapEditorPage } from './components/editor/MapEditorPage';
import { DebugLocationPanel } from './components/game/DebugLocationPanel';
import { GameRulesPage } from './components/game/GameRulesPage';
import { LoadingFallback } from './components/LoadingFallback';

// Heavy components loaded via React.lazy for bundle splitting.
// Named exports are re-mapped to default exports inline.
const GameLobby = lazy(() =>
  import('./components/lobby/GameLobby').then(m => ({ default: m.GameLobby }))
);
const GameMap = lazy(() =>
  import('./components/map/GameMap').then(m => ({ default: m.GameMap }))
);
const PlayingHud = lazy(() =>
  import('./components/game/PlayingHud').then(m => ({ default: m.PlayingHud }))
);
import { CombatModal } from './components/game/CombatModal';
import { GameOver } from './components/game/GameOver';
import { latLngToRoomHex, roomHexToLatLng } from './components/map/HexMath';
import { HostControlPlane } from './components/game/HostControlPlane';
import type { GameState, RoomSummary } from './types/game';
import { useGameStore } from './stores/gameStore';
import type { SavedSession } from './stores/gameStore';
import { useGameplayStore } from './stores/gameplayStore';
import { useUiStore } from './stores/uiStore';
import {
  getErrorMessage,
  isClearlyStaleJoinFailure,
  isClearlyStaleRejoinFailure,
  isMissingRejoinMethodFailure,
  localizeLobbyError,
} from './utils/gameHelpers';
import './styles/index.css';

const DEBUG_GPS_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_GPS === 'true';
const RESUME_TIMEOUT_MS = 5000;

type ResumeSource = 'join' | 'rejoin';

type ResumeOutcome =
  | { status: 'success'; roomCode: string }
  | { status: 'error'; source: ResumeSource; message: string }
  | { status: 'timeout'; source: ResumeSource };

interface LocationPoint {
  lat: number;
  lng: number;
}

interface PendingResume {
  source: ResumeSource;
  expectedRoomCode?: string;
  resolve: (outcome: ResumeOutcome) => void;
  timeoutId: number;
}

type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

export default function App() {
  const { t } = useTranslation();
  const { auth, authReady, login, register, logout } = useAuth();
  const gameState = useGameStore(state => state.gameState);
  const savedSession = useGameStore(state => state.savedSession);
  const myRooms = useGameStore(state => state.myRooms);
  const autoResuming = useGameStore(state => state.autoResuming);
  const setGameState = useGameStore(state => state.setGameState);
  const setMyRooms = useGameStore(state => state.setMyRooms);
  const setAutoResuming = useGameStore(state => state.setAutoResuming);
  const selectedHex = useGameplayStore(state => state.selectedHex);
  const combatResult = useGameplayStore(state => state.combatResult);
  const setPickupPrompt = useGameplayStore(state => state.setPickupPrompt);
  const setCombatResult = useGameplayStore(state => state.setCombatResult);
  const clearGameplayUi = useGameplayStore(state => state.clearGameplayUi);
  const [playerDisplayPrefs, setPlayerDisplayPrefs] = usePlayerPreferences();
  const view = useUiStore(state => state.view);
  const error = useUiStore(state => state.error);
  const hasAcknowledgedRules = useUiStore(state => state.hasAcknowledgedRules);
  const showDebugTools = useUiStore(state => state.showDebugTools);
  const debugLocationEnabled = useUiStore(state => state.debugLocationEnabled);
  const debugLocation = useUiStore(state => state.debugLocation);
  const setView = useUiStore(state => state.setView);
  const setError = useUiStore(state => state.setError);
  const clearError = useUiStore(state => state.clearError);
  const setHasAcknowledgedRules = useUiStore(state => state.setHasAcknowledgedRules);
  const setShowDebugTools = useUiStore(state => state.setShowDebugTools);
  const setDebugLocationEnabled = useUiStore(state => state.setDebugLocationEnabled);
  const setDebugLocation = useUiStore(state => state.setDebugLocation);
  const setMainMapBounds = useUiStore(state => state.setMainMapBounds);
  const setSelectedHexScreenPos = useUiStore(state => state.setSelectedHexScreenPos);
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const mapNavigateRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const handleMiniMapNavigate = useCallback((lat: number, lng: number) => {
    mapNavigateRef.current?.(lat, lng);
  }, []);
  const location = useGeolocation(Boolean(auth));
  const { playSound } = useSound();
  const previousConnectedRef = useRef(false);
  const pendingResumeRef = useRef<PendingResume | null>(null);
  const savedSessionRef = useRef<SavedSession | null>(savedSession);
  const invokeRef = useRef<SignalRInvoke | null>(null);
  const resumeSequenceRef = useRef(0);
  const savedRoomCode = savedSession?.roomCode ?? '';
  const activeRoomCode = gameState?.roomCode ?? '';
  const rulesKey = activeRoomCode ? `lg-rules-ack-${activeRoomCode}` : '';

  useEffect(() => {
    if (!rulesKey) {
      setHasAcknowledgedRules(false);
      return;
    }

    setHasAcknowledgedRules(sessionStorage.getItem(rulesKey) === 'true');
  }, [rulesKey]);

  useEffect(() => {
    savedSessionRef.current = savedSession;
  }, [savedSession]);

  const saveSession = useCallback((roomCode: string) => {
    if (!auth?.userId) {
      return;
    }

    const normalizedRoomCode = roomCode.trim().toUpperCase();
    if (!normalizedRoomCode) {
      return;
    }

    const next = { roomCode: normalizedRoomCode, userId: auth.userId };
    savedSessionRef.current = next;
    useGameStore.getState().setSavedSession(next);
  }, [auth?.userId]);

  const clearSession = useCallback(() => {
    savedSessionRef.current = null;
    useGameStore.getState().clearSession();
  }, []);

  const clearPendingResume = useCallback((outcome?: ResumeOutcome) => {
    const pending = pendingResumeRef.current;
    if (!pending) {
      return false;
    }

    window.clearTimeout(pending.timeoutId);
    pendingResumeRef.current = null;
    if (outcome) {
      pending.resolve(outcome);
    }
    return true;
  }, []);

  const beginResumeAttempt = useCallback((source: ResumeSource, expectedRoomCode?: string) => {
    clearPendingResume();
    return new Promise<ResumeOutcome>(resolve => {
      const timeoutId = window.setTimeout(() => {
        if (pendingResumeRef.current?.resolve === resolve) {
          pendingResumeRef.current = null;
          resolve({ status: 'timeout', source });
        }
      }, RESUME_TIMEOUT_MS);

      pendingResumeRef.current = {
        source,
        expectedRoomCode,
        resolve,
        timeoutId
      };
    });
  }, [clearPendingResume]);

  const resolveResumeFromState = useCallback((state: GameState) => {
    const pending = pendingResumeRef.current;
    if (!pending || !state.roomCode) {
      return false;
    }

    if (pending.expectedRoomCode && state.roomCode !== pending.expectedRoomCode) {
      return false;
    }

    return clearPendingResume({ status: 'success', roomCode: state.roomCode });
  }, [clearPendingResume]);

  const resolveResumeFromError = useCallback((message: string) => {
    const pending = pendingResumeRef.current;
    if (!pending) {
      return false;
    }

    return clearPendingResume({ status: 'error', source: pending.source, message });
  }, [clearPendingResume]);

  const runResumeAction = useCallback(async (
    source: ResumeSource,
    action: () => Promise<unknown>,
    expectedRoomCode?: string
  ) => {
    const outcomePromise = beginResumeAttempt(source, expectedRoomCode);
    try {
      await action();
    } catch (cause) {
      clearPendingResume({ status: 'error', source, message: getErrorMessage(cause) });
    }

    return outcomePromise;
  }, [beginResumeAttempt, clearPendingResume]);

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

  const signalRHandlers = useSignalRHandlers({
    getInvoke: () => invokeRef.current,
    saveSession,
    resolveResumeFromState,
    resolveResumeFromError,
    savedSessionRef,
    t,
    playSound,
    pushToast,
  });
  const { connected, reconnecting, invoke } = useSignalR(auth?.token ?? null, signalRHandlers);
  invokeRef.current = invoke;

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
      gameState.tileSizeMeters
    );
  }, [currentLocation, gameState]);

  const currentPlayerName = myPlayer?.name ?? auth?.username ?? '';
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
    pendingResumeRef,
    gameState,
    currentLocation,
    currentHex,
    myPlayer,
    isHostBypass,
    t,
    playSound,
    clearSession,
  });

  const handleAcknowledgeRules = useCallback(() => {
    if (rulesKey) {
      sessionStorage.setItem(rulesKey, 'true');
    }

    setHasAcknowledgedRules(true);
  }, [rulesKey]);

  const canStepDebugByHex = Boolean(
    gameState?.mapLat != null
    && gameState?.mapLng != null
    && (currentLocation ?? mapCenterLocation)
  );

  const applyDebugLocation = useCallback((lat: number, lng: number) => {
    setDebugLocation({ lat, lng });
    setDebugLocationEnabled(true);
    setError('');
  }, []);

  const disableDebugLocation = useCallback(() => {
    setDebugLocationEnabled(false);
    setDebugLocation(null);
    setError('');
  }, []);

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
      gameState.tileSizeMeters
    );
    const [nextLat, nextLng] = roomHexToLatLng(
      baseQ + dq,
      baseR + dr,
      gameState.mapLat,
      gameState.mapLng,
      gameState.tileSizeMeters
    );

    const nextLocation = { lat: nextLat, lng: nextLng };
    applyDebugLocation(nextLocation.lat, nextLocation.lng);
    return nextLocation;
  }, [applyDebugLocation, currentLocation, gameState, mapCenterLocation]);

  useEffect(() => {
    const justConnected = connected && !previousConnectedRef.current;
    previousConnectedRef.current = connected;

    if (!justConnected || !auth) {
      return;
    }

    const savedSession = savedSessionRef.current;
    if (!savedSession?.roomCode) {
      return;
    }

    let cancelled = false;
    const sequence = ++resumeSequenceRef.current;

    void Promise.resolve().then(async () => {
      if (cancelled || resumeSequenceRef.current !== sequence) {
        return;
      }

      if (savedSession.userId !== auth.userId) {
        clearSession();
        return;
      }

      setAutoResuming(true);
      clearError();

      const rejoinOutcome = await runResumeAction('rejoin', () => invoke('RejoinRoom', savedSession.roomCode));
      if (cancelled || resumeSequenceRef.current !== sequence) {
        return;
      }

      if (rejoinOutcome.status === 'success') {
        setAutoResuming(false);
        return;
      }

      const fallbackUnavailable = rejoinOutcome.status === 'error' && isMissingRejoinMethodFailure(rejoinOutcome.message);
      if (fallbackUnavailable) {
        const joinOutcome = await runResumeAction('join', () => invoke('JoinRoom', savedSession.roomCode), savedSession.roomCode);
        if (cancelled || resumeSequenceRef.current !== sequence) {
          return;
        }

        if (joinOutcome.status === 'success') {
          setAutoResuming(false);
          return;
        }

        const joinClearlyStale = joinOutcome.status === 'error' && isClearlyStaleJoinFailure(joinOutcome.message);
        if (joinClearlyStale) {
          clearSession();
          setGameState(null);
          setPickupPrompt(null);
          clearGameplayUi();
          setView('lobby');
          setError(t('errors.roomNoLongerAvailable'));
        } else if (joinOutcome.status === 'error') {
          setError(localizeLobbyError(joinOutcome.message, t));
        } else {
          setError(t('errors.timedOut'));
        }
      } else if (rejoinOutcome.status === 'error' && isClearlyStaleRejoinFailure(rejoinOutcome.message)) {
        clearSession();
        setGameState(null);
        setPickupPrompt(null);
        clearGameplayUi();
        setView('lobby');
        setError(t('errors.roomNoLongerAvailable'));
      } else if (rejoinOutcome.status === 'error') {
        setError(localizeLobbyError(rejoinOutcome.message, t));
      } else {
        setError(t('errors.timedOut'));
      }

      setAutoResuming(false);
    });

    return () => {
      cancelled = true;
      clearPendingResume({ status: 'timeout', source: pendingResumeRef.current?.source ?? 'join' });
      setAutoResuming(false);
    };
  }, [auth, clearGameplayUi, clearPendingResume, clearSession, connected, invoke, runResumeAction, t]);

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
  }, [auth, autoResuming, connected, gameState, invoke, t]);

  const connectionBanner = autoResuming
    ? t('errors.restoringRoom', { code: savedRoomCode })
    : reconnecting
      ? t('errors.reconnecting')
      : '';

  const visibleRecentRooms = auth && connected ? myRooms : [];
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
        {connectionBanner && <ConnectionBanner message={connectionBanner} />}
        <GameOver state={gameState} onPlayAgain={handlePlayAgain} />
      </>
    );
  }

  if (view === 'game' && gameState) {
    if (!hasAcknowledgedRules) {
      return (
        <>
          {connectionBanner && <ConnectionBanner message={connectionBanner} />}
          <GameRulesPage
            gameState={gameState}
            onContinue={handleAcknowledgeRules}
          />
        </>
      );
    }

    const isObserverMode = myPlayer?.isHost && gameState.hostObserverMode;

    if (isObserverMode) {
      return (
        <>
          {connectionBanner && <ConnectionBanner message={connectionBanner} />}
          <Suspense fallback={<LoadingFallback />}>
            <HostControlPlane
              state={gameState}
              onSwitchToPlayer={() => handleSetObserverMode(false)}
              onUpdateDynamics={handleUpdateDynamicsLive}
              onTriggerEvent={handleTriggerEvent}
              onSendMessage={handleSendHostMessage}
              onPauseGame={handlePauseGame}
              onReturnToLobby={handleReturnToLobby}
              error={error}
            >
              <GameMap
                state={gameState}
                myUserId={auth.userId}
                currentLocation={currentLocation}
                constrainViewportToGrid
                onHexClick={handleHexClick}
                selectedHex={selectedHex}
                playerDisplayPrefs={playerDisplayPrefs}
              />
            </HostControlPlane>
          </Suspense>
        </>
      );
    }

    return (
      <>
        {connectionBanner && <ConnectionBanner message={connectionBanner} />}
        <Suspense fallback={<LoadingFallback />}>
        <PlayingHud
          myUserId={auth.userId}
          currentHex={currentHex}
          onConfirmPickup={handleConfirmPickup}
          onReturnToLobby={handleReturnToLobby}
          locationError={effectiveLocationError}
          currentHexActions={currentHexActions}
          onCurrentHexAction={handleCurrentHexAction}
          onDismissTileActions={handleDismissTileActions}
          onConfirmAttack={handleConfirmAttack}
          onAcceptDuel={handleAcceptDuel}
          onDeclineDuel={handleDeclineDuel}
          onActivateBeacon={handleActivateBeacon}
          onDeactivateBeacon={handleDeactivateBeacon}
          onActivateStealth={handleActivateStealth}
          playerDisplayPrefs={playerDisplayPrefs}
          onPlayerDisplayPrefsChange={setPlayerDisplayPrefs}
          currentPlayerName={currentPlayerName}
          hasLocation={Boolean(currentLocation)}
          onSetObserverMode={handleSetObserverMode}
          debugToggle={debugToggleButton}
          debugPanel={debugGpsPanel}
          toasts={toasts}
          onDismissToast={dismissToast}
          onNavigateMap={handleMiniMapNavigate}
        >
            <GameMap
              state={gameState}
              myUserId={auth.userId}
              currentLocation={currentLocation}
              constrainViewportToGrid
              onHexClick={handleHexClick}
              selectedHex={selectedHex}
              playerDisplayPrefs={playerDisplayPrefs}
              onBoundsChange={setMainMapBounds}
              onHexScreenPosition={setSelectedHexScreenPos}
              navigateRef={mapNavigateRef}
            />
          </PlayingHud>
        </Suspense>
        {combatResult && (
          <CombatModal
            result={combatResult}
            gameMode={gameState.gameMode}
            allowSelfClaim={gameState?.allowSelfClaim !== false}
            onReClaim={handleReClaimHex}
            onClose={() => setCombatResult(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      {connectionBanner && <ConnectionBanner message={connectionBanner} />}
      <Suspense fallback={<LoadingFallback />}>
        <GameLobby
          username={auth.username}
          myUserId={auth.userId}
          authToken={auth.token}
          gameState={gameState}
          connected={connected}
          currentLocation={currentLocation}
          locationError={effectiveLocationError}
          locationLoading={effectiveLocationLoading}
          recentRooms={visibleRecentRooms}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onSetAlliance={handleSetAlliance}
          onSetMapLocation={handleSetMapLocation}
          onSetTileSize={handleSetTileSize}
          onUseCenteredGameArea={handleUseCenteredGameArea}
          onSetPatternGameArea={handleSetPatternGameArea}
          onSetCustomGameArea={handleSetCustomGameArea}
          onSetClaimMode={handleSetClaimMode}
          onSetAllowSelfClaim={handleSetAllowSelfClaim}
          onSetWinCondition={handleSetWinCondition}
          onSetCopresenceModes={handleSetCopresenceModes}
          onSetCopresencePreset={handleSetCopresencePreset}
          onSetGameDynamics={handleSetGameDynamics}
          onSetPlayerRole={handleSetPlayerRole}
          onSetAllianceHQ={handleSetAllianceHQ}
          onSetMasterTile={handleSetMasterTile}
          onSetMasterTileByHex={handleSetMasterTileByHex}
          onAssignStartingTile={handleAssignStartingTile}
          onConfigureAlliances={handleConfigureAlliances}
          onDistributePlayers={handleDistributePlayers}
          onAssignAllianceStartingTile={handleAssignAllianceStartingTile}
          onStartGame={handleStartGame}
          onReturnToLobby={handleReturnToLobby}
          onLogout={() => {
            clearSession();
            disableDebugLocation();
            setShowDebugTools(false);
            setMyRooms([]);
            void logout();
            setGameState(null);
            setPickupPrompt(null);
            clearGameplayUi();
            setView('lobby');
          }}
          onSetObserverMode={handleSetObserverMode}
          error={error}
          invoke={invoke}
        />
      </Suspense>
      {!gameState && (
        <button
          type="button"
          className="btn-secondary map-editor-toggle"
          onClick={() => setView('mapEditor')}
        >
          🗺️ {t('mapEditor.title')}
        </button>
      )}
      {debugGpsPanel}
      {debugToggleButton}
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
