import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './hooks/useAuth';
import { useSignalR } from './hooks/useSignalR';
import { useGeolocation } from './hooks/useGeolocation';
import { AuthPage } from './components/auth/AuthPage';
import { GameLobby } from './components/lobby/GameLobby';
import { GameMap } from './components/map/GameMap';
import { PlayerPanel } from './components/game/PlayerPanel';
import { GameOver } from './components/game/GameOver';
import { latLngToRoomHex } from './components/map/HexMath';
import type { ClaimMode, GameState, HexCell, RoomSummary, WinConditionType } from './types/game';
import './styles/index.css';

const SESSION_STORAGE_KEY = 'landgrab_session';
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

interface PickupPrompt {
  q: number;
  r: number;
  max: number;
}

interface SavedSession {
  roomCode: string;
  userId: string;
}

interface PendingResume {
  source: ResumeSource;
  expectedRoomCode?: string;
  resolve: (outcome: ResumeOutcome) => void;
  timeoutId: number;
}

export default function App() {
  const { t } = useTranslation();
  const { auth, login, register, logout } = useAuth();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'lobby' | 'game' | 'gameover'>('lobby');
  const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null);
  const [pickupCount, setPickupCount] = useState(1);
  const [autoResuming, setAutoResuming] = useState(false);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(loadSavedSession);
  const [myRooms, setMyRooms] = useState<RoomSummary[]>([]);
  const location = useGeolocation(Boolean(auth));
  const lastLocationRef = useRef('');
  const previousConnectedRef = useRef(false);
  const pendingResumeRef = useRef<PendingResume | null>(null);
  const savedSessionRef = useRef<SavedSession | null>(savedSession);
  const resumeSequenceRef = useRef(0);
  const savedRoomCode = savedSession?.roomCode ?? '';

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
    setSavedSession(next);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  }, [auth]);

  const clearSession = useCallback(() => {
    savedSessionRef.current = null;
    setSavedSession(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
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

  const currentLocation = useMemo<LocationPoint | null>(() => {
    if (location.lat == null || location.lng == null) {
      return null;
    }

    return { lat: location.lat, lng: location.lng };
  }, [location.lat, location.lng]);

  const clearError = () => setError('');

  const applyIncomingState = useCallback((state: GameState, nextView?: 'lobby' | 'game' | 'gameover') => {
    resolveResumeFromState(state);
    if (state.roomCode) {
      saveSession(state.roomCode);
    }
    setGameState(state);
    setPickupPrompt(null);

    if (nextView) {
      setView(nextView);
    } else if (state.phase === 'Playing') {
      setView('game');
    } else if (state.phase === 'GameOver') {
      setView('gameover');
    }

    clearError();
  }, [resolveResumeFromState, saveSession]);

  const { connected, reconnecting, invoke } = useSignalR(auth?.token ?? null, {
    onRoomCreated: (code, state) => {
      saveSession(code || state.roomCode);
      applyIncomingState(state, 'lobby');
    },
    onPlayerJoined: (state) => {
      applyIncomingState(state, state.phase === 'Lobby' ? 'lobby' : undefined);
    },
    onGameStarted: (state) => {
      applyIncomingState(state, 'game');
    },
    onStateUpdated: (state) => {
      applyIncomingState(state);
    },
    onGameOver: () => setView('gameover'),
    onError: (message) => {
      if (resolveResumeFromError(message)) {
        return;
      }
      setError(message);
    },
    onReconnected: () => {
      clearError();
    }
  });

  const refreshMyRooms = useCallback(async () => {
    if (!auth || !connected) {
      setMyRooms([]);
      return;
    }

    const rooms = await invoke<RoomSummary[]>('GetMyRooms');
    setMyRooms(Array.isArray(rooms) ? rooms : []);
  }, [auth, connected, invoke]);

  const myPlayer = useMemo(() => {
    if (!auth || !gameState) {
      return null;
    }

    return gameState.players.find(player => player.id === auth.userId) ?? null;
  }, [auth, gameState]);

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

  useEffect(() => {
    if (!connected || gameState?.phase !== 'Playing' || !currentLocation) {
      lastLocationRef.current = '';
      return;
    }

    const locationKey = `${currentLocation.lat.toFixed(6)},${currentLocation.lng.toFixed(6)}`;
    if (lastLocationRef.current === locationKey) {
      return;
    }

    lastLocationRef.current = locationKey;
    invoke('UpdatePlayerLocation', currentLocation.lat, currentLocation.lng)
      .catch(cause => setError(String(cause)));
  }, [connected, currentLocation, gameState?.phase, invoke]);

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
          setView('lobby');
          setError(t('errors.roomNoLongerAvailable'));
        } else if (joinOutcome.status === 'error') {
          setError(joinOutcome.message);
        } else {
          setError(t('errors.timedOut'));
        }
      } else if (rejoinOutcome.status === 'error' && isClearlyStaleRejoinFailure(rejoinOutcome.message)) {
        clearSession();
        setGameState(null);
        setPickupPrompt(null);
        setView('lobby');
        setError(t('errors.roomNoLongerAvailable'));
      } else if (rejoinOutcome.status === 'error') {
        setError(rejoinOutcome.message);
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
  }, [auth, clearPendingResume, clearSession, connected, invoke, runResumeAction, t]);

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
          setError(String(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth, autoResuming, connected, gameState, invoke]);

  const handleCreateRoom = useCallback(() => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    invoke('CreateRoom').catch(cause => setError(String(cause)));
  }, [autoResuming, invoke, t]);

  const handleJoinRoom = useCallback((code: string) => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    invoke('JoinRoom', code).catch(cause => setError(String(cause)));
  }, [autoResuming, invoke, t]);

  const handleSetAlliance = useCallback((name: string) => {
    invoke('SetAlliance', name).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetMapLocation = useCallback((lat: number, lng: number) => {
    invoke('SetMapLocation', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetTileSize = useCallback((meters: number) => {
    invoke('SetTileSize', meters).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetClaimMode = useCallback((mode: ClaimMode) => {
    invoke('SetClaimMode', mode).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetWinCondition = useCallback((type: WinConditionType, value: number) => {
    invoke('SetWinCondition', type, value).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetMasterTile = useCallback((lat: number, lng: number) => {
    invoke('SetMasterTile', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleAssignStartingTile = useCallback((q: number, r: number, playerId: string) => {
    invoke('AssignStartingTile', q, r, playerId).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleStartGame = useCallback(() => {
    invoke('StartGame').catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleReturnToLobby = useCallback(() => {
    void invoke('ReturnToLobby')
      .catch(cause => setError(String(cause)))
      .finally(() => {
        clearSession();
        setGameState(null);
        setPickupPrompt(null);
        setView('lobby');
        void refreshMyRooms().catch(cause => setError(String(cause)));
      });
  }, [clearSession, invoke, refreshMyRooms]);

  const handleHexClick = useCallback((q: number, r: number, cell: HexCell | undefined) => {
    if (!auth || !gameState || gameState.phase !== 'Playing') {
      return;
    }
    if (!currentLocation || !currentHex) {
      setError(t('errors.gpsRequired'));
      return;
    }
    if (currentHex[0] !== q || currentHex[1] !== r) {
      setError(t('errors.mustBeOnHex'));
      return;
    }
    if (cell?.isMasterTile) {
      setError(t('errors.masterTileConquer'));
      return;
    }

    clearError();

    const carriedTroops = myPlayer?.carriedTroops ?? 0;
    if (cell?.ownerId === auth.userId && carriedTroops === 0) {
      if (cell.troops < 1) {
        setError(t('errors.noTroopsPickup'));
        return;
      }

      setPickupPrompt({ q, r, max: cell.troops });
      setPickupCount(1);
      return;
    }

    invoke('PlaceTroops', q, r, currentLocation.lat, currentLocation.lng)
      .then(() => setPickupPrompt(null))
      .catch(cause => setError(String(cause)));
  }, [auth, currentHex, currentLocation, gameState, invoke, myPlayer, t]);

  const handleConfirmPickup = useCallback(() => {
    if (!pickupPrompt || !currentLocation) {
      return;
    }

    invoke('PickUpTroops', pickupPrompt.q, pickupPrompt.r, pickupCount, currentLocation.lat, currentLocation.lng)
      .then(() => setPickupPrompt(null))
      .catch(cause => setError(String(cause)));
  }, [currentLocation, invoke, pickupCount, pickupPrompt]);

  const handlePlayAgain = useCallback(() => {
    clearSession();
    setMyRooms([]);
    setGameState(null);
    setView('lobby');
    setError('');
    setPickupPrompt(null);
    void refreshMyRooms().catch(cause => setError(String(cause)));
  }, [clearSession, refreshMyRooms]);

  const connectionBanner = autoResuming
    ? t('errors.restoringRoom', { code: savedRoomCode })
    : reconnecting
      ? t('errors.reconnecting')
      : '';

  const visibleRecentRooms = auth && connected ? myRooms : [];

  if (!auth) {
    return <AuthPage onLogin={login} onRegister={register} />;
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
      <>
        {connectionBanner && <ConnectionBanner message={connectionBanner} />}
        <div className="game-layout">
          <GameMap
            state={gameState}
            myUserId={auth.userId}
            currentLocation={currentLocation}
            onHexClick={handleHexClick}
          />
          <PlayerPanel
            state={gameState}
            myUserId={auth.userId}
            currentLocation={currentLocation}
            currentHex={currentHex}
            pickupPrompt={pickupPrompt}
            pickupCount={pickupCount}
            onPickupCountChange={setPickupCount}
            onConfirmPickup={handleConfirmPickup}
            onCancelPickup={() => setPickupPrompt(null)}
            onReturnToLobby={handleReturnToLobby}
            error={error}
            locationError={location.error}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {connectionBanner && <ConnectionBanner message={connectionBanner} />}
      <GameLobby
        username={auth.username}
        myUserId={auth.userId}
        gameState={gameState}
        connected={connected}
        currentLocation={currentLocation}
        locationError={location.error}
        locationLoading={location.loading}
        recentRooms={visibleRecentRooms}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onSetAlliance={handleSetAlliance}
        onSetMapLocation={handleSetMapLocation}
        onSetTileSize={handleSetTileSize}
        onSetClaimMode={handleSetClaimMode}
        onSetWinCondition={handleSetWinCondition}
        onSetMasterTile={handleSetMasterTile}
        onAssignStartingTile={handleAssignStartingTile}
        onStartGame={handleStartGame}
        onReturnToLobby={handleReturnToLobby}
        onLogout={() => {
          clearSession();
          setMyRooms([]);
          logout();
          setGameState(null);
          setPickupPrompt(null);
          setView('lobby');
        }}
        error={error}
      />
    </>
  );
}

function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SavedSession> | null;
    if (!parsed?.roomCode || typeof parsed.roomCode !== 'string'
      || !parsed.userId || typeof parsed.userId !== 'string') {
      return null;
    }

    const roomCode = parsed.roomCode.trim().toUpperCase();
    const userId = parsed.userId.trim();
    return roomCode && userId ? { roomCode, userId } : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isClearlyStaleJoinFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('room not found');
}

function isClearlyStaleRejoinFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('no active room');
}

function isMissingRejoinMethodFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('does not exist')
    || normalized.includes('unknown hub method')
    || normalized.includes('method not found')
    || normalized.includes('not implemented');
}

function ConnectionBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        padding: '0.55rem 0.9rem',
        borderRadius: 999,
        background: 'rgba(26, 39, 64, 0.94)',
        border: '1px solid rgba(136, 153, 170, 0.35)',
        color: '#ecf0f1',
        fontSize: '0.85rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)'
      }}
    >
      {message}
    </div>
  );
}
