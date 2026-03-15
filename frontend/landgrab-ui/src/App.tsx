import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from './hooks/useAuth';
import { useSignalR } from './hooks/useSignalR';
import { useGeolocation } from './hooks/useGeolocation';
import { usePlayerPreferences } from './hooks/usePlayerPreferences';
import { useSound } from './hooks/useSound';
import { vibrate, HAPTIC } from './utils/haptics';
import { useToastQueue } from './hooks/useToastQueue';
import { AuthPage } from './components/auth/AuthPage';
import { MapEditorPage } from './components/editor/MapEditorPage';
import { DebugLocationPanel } from './components/game/DebugLocationPanel';
import { GameRulesPage } from './components/game/GameRulesPage';
import { GameLobby } from './components/lobby/GameLobby';
import { GameMap } from './components/map/GameMap';
import { PlayingHud } from './components/game/PlayingHud';
import { CombatModal } from './components/game/CombatModal';
import { GameOver } from './components/game/GameOver';
import { getTileInteractionStatus, getTileActions } from './components/game/tileInteraction';
import type { MapInteractionFeedback, TileAction, TileActionType } from './components/game/tileInteraction';
import { latLngToRoomHex, roomHexToLatLng } from './components/map/HexMath';
import { HostControlPlane } from './components/game/HostControlPlane';
import type { ClaimMode, CombatResult, CopresenceMode, GameAreaPattern, GameDynamics, GameState, HexCell, HexCoordinate, Mission, PendingDuel, RandomEvent, ReClaimMode, RoomSummary, WinConditionType } from './types/game';
import './styles/index.css';

const DEBUG_GPS_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_GPS === 'true';
const SESSION_STORAGE_KEY = 'landgrab_session';
const RESUME_TIMEOUT_MS = 5000;
const LOCATION_BROADCAST_THROTTLE_MS = 3000;

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
  const [view, setView] = useState<'lobby' | 'game' | 'gameover' | 'mapEditor'>('lobby');
  const [selectedHex, setSelectedHex] = useState<[number, number] | null>(null);
  const [mapFeedback, setMapFeedback] = useState<MapInteractionFeedback | null>(null);
  const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null);
  const [pickupCount, setPickupCount] = useState(1);
  const [autoResuming, setAutoResuming] = useState(false);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(loadSavedSession);
  const [myRooms, setMyRooms] = useState<RoomSummary[]>([]);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [debugLocationEnabled, setDebugLocationEnabled] = useState(false);
  const [debugLocation, setDebugLocation] = useState<LocationPoint | null>(null);
  const [attackPrompt, setAttackPrompt] = useState<{ q: number; r: number; max: number; defenderTroops: number } | null>(null);
  const [attackCount, setAttackCount] = useState(1);
  const [commandoTargetingMode, setCommandoTargetingMode] = useState(false);
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [randomEvent, setRandomEvent] = useState<RandomEvent | null>(null);
  const [eventWarning, setEventWarning] = useState<RandomEvent | null>(null);
  const [missionNotification, setMissionNotification] = useState<{ mission: Mission; type: 'assigned' | 'completed' | 'failed' } | null>(null);
  const [pendingDuel, setPendingDuel] = useState<PendingDuel | null>(null);
  const [hostMessage, setHostMessage] = useState<{ message: string; fromHost: boolean } | null>(null);
  const [playerDisplayPrefs, setPlayerDisplayPrefs] = usePlayerPreferences();
  const [hasAcknowledgedRules, setHasAcknowledgedRules] = useState(false);
  const [mainMapBounds, setMainMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const [selectedHexScreenPos, setSelectedHexScreenPos] = useState<{ x: number; y: number } | null>(null);
  const { toasts, pushToast, dismissToast } = useToastQueue();
  const mapNavigateRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const handleMiniMapNavigate = useCallback((lat: number, lng: number) => {
    mapNavigateRef.current?.(lat, lng);
  }, []);
  const location = useGeolocation(Boolean(auth));
  const { playSound } = useSound();
  const lastLocationRef = useRef('');
  const locationThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocationRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  const previousConnectedRef = useRef(false);
  const pendingResumeRef = useRef<PendingResume | null>(null);
  const savedSessionRef = useRef<SavedSession | null>(savedSession);
  const resumeSequenceRef = useRef(0);
  const notificationTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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

  // Clean up all notification auto-dismiss timers on unmount
  useEffect(() => {
    return () => {
      for (const id of Object.values(notificationTimersRef.current)) {
        clearTimeout(id);
      }
    };
  }, []);

  /** Set state and schedule auto-clear after `ms`. Cancels any prior timer for the same key. */
  const scheduleAutoClear = useCallback(<T,>(
    key: string,
    setter: React.Dispatch<React.SetStateAction<T>>,
    value: NoInfer<T>,
    clearValue: NoInfer<T>,
    ms: number,
  ) => {
    if (notificationTimersRef.current[key]) {
      clearTimeout(notificationTimersRef.current[key]);
    }
    setter(value);
    notificationTimersRef.current[key] = setTimeout(() => {
      setter(clearValue);
      delete notificationTimersRef.current[key];
    }, ms);
  }, []);

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

  const clearError = () => setError('');
  const clearGameplayUi = useCallback(() => {
    setSelectedHex(null);
    setMapFeedback(null);
    setAttackPrompt(null);
    setCommandoTargetingMode(false);
    setCombatResult(null);
  }, []);

  // Auto-dismiss map feedback toasts after 3.5s
  useEffect(() => {
    if (!mapFeedback) return;
    const timer = setTimeout(() => setMapFeedback(null), 3500);
    return () => clearTimeout(timer);
  }, [mapFeedback]);

  const applyIncomingState = useCallback((state: GameState, nextView?: 'lobby' | 'game' | 'gameover' | 'mapEditor') => {
    const normalizedState = normalizeGameState(state, gameState);
    resolveResumeFromState(normalizedState);
    if (normalizedState.roomCode) {
      saveSession(normalizedState.roomCode);
    }
    setGameState(normalizedState);
    setPickupPrompt(null);

    if (nextView) {
      setView(nextView);
    } else if (normalizedState.phase === 'Playing') {
      setView('game');
    } else if (normalizedState.phase === 'GameOver') {
      setView('gameover');
    }

    if ((nextView && nextView !== 'game') || (!nextView && normalizedState.phase !== 'Playing')) {
      clearGameplayUi();
    }

    clearError();
  }, [clearGameplayUi, gameState, resolveResumeFromState, saveSession]);

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
    onGameOver: () => {
      playSound('victory');
      vibrate(HAPTIC.victory);
      clearGameplayUi();
      setCombatResult(null);
      setView('gameover');
    },
    onCombatResult: (result) => {
      vibrate(HAPTIC.attack);
      setCombatResult(result);
      pushToast({
        type: 'combat',
        message: result.attackerWon
          ? t('game.toast.combatWon', { q: result.q, r: result.r })
          : t('game.toast.combatLost', { q: result.q, r: result.r }),
      });
    },
    onTileLost: (data) => {
      playSound('notification');
      vibrate(HAPTIC.loss);
      setMapFeedback({
        tone: 'error',
        message: `${data.AttackerName} captured tile (${data.Q}, ${data.R})!`,
        targetHex: [data.Q, data.R]
      });
      pushToast({
        type: 'territory',
        message: t('game.toast.tileLost', { attacker: data.AttackerName, q: data.Q, r: data.R }),
        teamColor: undefined,
      });
    },
    onError: (message) => {
      if (resolveResumeFromError(message)) {
        return;
      }
      setError(localizeLobbyError(message, t));
    },
    onRandomEvent: (event) => {
      scheduleAutoClear('randomEvent', setRandomEvent, event, null, 8000);
      pushToast({
        type: 'event',
        message: event.title,
      });
    },
    onEventWarning: (event) => {
      scheduleAutoClear('eventWarning', setEventWarning, event, null, 120000);
    },
    onMissionAssigned: (mission) => {
      scheduleAutoClear('missionNotification', setMissionNotification, { mission, type: 'assigned' as const }, null, 6000);
    },
    onMissionCompleted: (mission) => {
      scheduleAutoClear('missionNotification', setMissionNotification, { mission, type: 'completed' as const }, null, 6000);
      pushToast({
        type: 'mission',
        message: mission.title,
        icon: '✅',
      });
    },
    onMissionFailed: (mission) => {
      scheduleAutoClear('missionNotification', setMissionNotification, { mission, type: 'failed' as const }, null, 6000);
    },
    onDuelChallenge: (duel) => {
      scheduleAutoClear('pendingDuel', setPendingDuel, duel, null, 30000);
    },
    onDuelResult: () => {
      if (notificationTimersRef.current['pendingDuel']) {
        clearTimeout(notificationTimersRef.current['pendingDuel']);
        delete notificationTimersRef.current['pendingDuel'];
      }
      setPendingDuel(null);
    },
    onHostMessage: (data: { message: string; fromHost: boolean }) => {
      scheduleAutoClear('hostMessage', setHostMessage, data, null, 10000);
    },
    onTemplateSaved: (data) => {
      console.log('[SignalR] TemplateSaved:', data.templateId, data.name);
    },
    onReconnected: () => {
      clearError();
      // Immediately re-establish room mapping so hub calls don't fail
      // before the justConnected useEffect fires (race condition fix).
      const session = savedSessionRef.current;
      if (session?.roomCode) {
        invoke('RejoinRoom', session.roomCode).catch(() => {
          // Silently ignore — the justConnected useEffect will also attempt rejoin.
        });
      }
    }
  });

  const clearLocationThrottle = useCallback(() => {
    if (locationThrottleRef.current !== null) {
      clearTimeout(locationThrottleRef.current);
      locationThrottleRef.current = null;
    }
  }, []);

  const sendPendingLocation = useCallback(() => {
    clearLocationThrottle();

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
  }, [clearLocationThrottle, invoke]);

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

  const isHostBypass = Boolean(gameState?.hostBypassGps && myPlayer?.isHost);

  const selectedHexKey = useMemo(() => {
    if (!selectedHex) {
      return null;
    }

    return `${selectedHex[0]},${selectedHex[1]}`;
  }, [selectedHex]);

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

  const currentHexKey = useMemo(() => {
    if (!currentHex) {
      return null;
    }

    return `${currentHex[0]},${currentHex[1]}`;
  }, [currentHex]);

  const isInOwnHex = useMemo(() => {
    if (!auth || !gameState || !currentHexKey) {
      return false;
    }

    return gameState.grid[currentHexKey]?.ownerId === auth.userId;
  }, [auth, currentHexKey, gameState]);

  const playerColor = myPlayer?.allianceColor ?? myPlayer?.color ?? '#4f8cff';
  const currentPlayerName = myPlayer?.name ?? auth?.username ?? '';

  const handleAcknowledgeRules = useCallback(() => {
    if (rulesKey) {
      sessionStorage.setItem(rulesKey, 'true');
    }

    setHasAcknowledgedRules(true);
  }, [rulesKey]);

  // Auto-show tile actions when the player physically moves to a new hex
  const prevCurrentHexRef = useRef<string | null>(null);
  useEffect(() => {
    const key = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
    if (key === prevCurrentHexRef.current) return;
    prevCurrentHexRef.current = key;

    if (gameState?.phase === 'Playing' && currentHex) {
      setSelectedHex(currentHex);
      setMapFeedback(null);
      setPickupPrompt(null);
      setAttackPrompt(null);
    }
  }, [currentHex, gameState?.phase]);

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

  const handleCreateRoom = useCallback(() => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    invoke('CreateRoom').catch(cause => setError(localizeLobbyError(getErrorMessage(cause), t)));
  }, [autoResuming, invoke, t]);

  const handleJoinRoom = useCallback((code: string) => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    invoke('JoinRoom', code).catch(cause => setError(localizeLobbyError(getErrorMessage(cause), t)));
  }, [autoResuming, invoke, t]);

  const handleSetAlliance = useCallback((name: string) => {
    invoke('SetAlliance', name).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetMapLocation = useCallback((lat: number, lng: number) => {
    invoke('SetMapLocation', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetTileSize = useCallback((meters: number) => {
    const previousTileSizeMeters = gameState?.tileSizeMeters ?? meters;
    const roomCode = gameState?.roomCode ?? '';

    setGameState(previousState => previousState
      ? {
        ...previousState,
        tileSizeMeters: meters
      }
      : previousState);

    invoke('SetTileSize', meters).catch(cause => {
      setGameState(previousState => {
        if (!previousState || previousState.roomCode !== roomCode) {
          return previousState;
        }

        return {
          ...previousState,
          tileSizeMeters: previousTileSizeMeters
        };
      });
      setError(String(cause));
    });
  }, [gameState?.roomCode, gameState?.tileSizeMeters, invoke]);

  const handleUseCenteredGameArea = useCallback(() => {
    invoke('UseCenteredGameArea').catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetPatternGameArea = useCallback((pattern: GameAreaPattern) => {
    invoke('SetPatternGameArea', pattern).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetCustomGameArea = useCallback((coordinates: HexCoordinate[]) => {
    invoke('SetCustomGameArea', coordinates).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetClaimMode = useCallback((mode: ClaimMode) => {
    invoke('SetClaimMode', mode).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetAllowSelfClaim = useCallback(async (allow: boolean) => {
    await invoke('SetAllowSelfClaim', allow);
  }, [invoke]);

  const handleSetWinCondition = useCallback((type: WinConditionType, value: number) => {
    invoke('SetWinCondition', type, value).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetCopresenceModes = useCallback((modes: CopresenceMode[]) => {
    invoke('SetCopresenceModes', modes).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetCopresencePreset = useCallback((preset: string) => {
    invoke('SetCopresencePreset', preset).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetGameDynamics = useCallback((dynamics: GameDynamics) => {
    invoke('SetGameDynamics', dynamics).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetPlayerRole = useCallback(async (role: string) => {
    try {
      await invoke('SetPlayerRole', role);
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleSetAllianceHQ = useCallback(async (q: number, r: number, allianceId: string) => {
    try {
      await invoke('SetAllianceHQ', q, r, allianceId);
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleActivateBeacon = useCallback(async () => {
    try {
      await invoke('ActivateBeacon');
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleDeactivateBeacon = useCallback(async () => {
    try {
      await invoke('DeactivateBeacon');
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleActivateStealth = useCallback(async () => {
    try {
      await invoke('ActivateStealth');
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleActivateCommandoRaid = useCallback(async (targetQ: number, targetR: number) => {
    try {
      await invoke('ActivateCommandoRaid', targetQ, targetR);
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleAcceptDuel = useCallback(async (duelId: string) => {
    try {
      await invoke('AcceptDuel', duelId);
      setPendingDuel(null);
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleDeclineDuel = useCallback(async (duelId: string) => {
    try {
      await invoke('DeclineDuel', duelId);
      setPendingDuel(null);
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleDetainPlayer = useCallback(async (targetPlayerId: string) => {
    try {
      await invoke('DetainPlayer', targetPlayerId);
    } catch (err) {
      setError(String(err));
    }
  }, [invoke]);

  const handleSetMasterTile = useCallback((lat: number, lng: number) => {
    invoke('SetMasterTile', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetMasterTileByHex = useCallback((q: number, r: number) => {
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
        gameState.tileSizeMeters
      );
      invoke('SetMasterTile', fallbackLat, fallbackLng)
        .catch(fallbackCause => setError(localizeLobbyError(getErrorMessage(fallbackCause), t)));
    });
  }, [gameState, invoke, t]);

  const handleAssignStartingTile = useCallback((q: number, r: number, playerId: string) => {
    invoke('AssignStartingTile', q, r, playerId).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleConfigureAlliances = useCallback((names: string[]) => {
    invoke('ConfigureAlliances', names).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleDistributePlayers = useCallback(() => {
    invoke('DistributePlayers').catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleAssignAllianceStartingTile = useCallback((q: number, r: number, allianceId: string) => {
    invoke('AssignAllianceStartingTile', q, r, allianceId).catch(cause => setError(String(cause)));
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
        clearGameplayUi();
        setView('lobby');
        void refreshMyRooms().catch(cause => setError(String(cause)));
      });
  }, [clearGameplayUi, clearSession, invoke, refreshMyRooms]);

  // ── Host Observer Mode handlers ──────────────────────────────────
  const handleSetObserverMode = useCallback((enabled: boolean) => {
    if (!activeRoomCode) return;
    invoke('SetHostObserverMode', activeRoomCode, enabled).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke]);

  const handleUpdateDynamicsLive = useCallback((dynamics: GameDynamics) => {
    if (!activeRoomCode) return;
    invoke('UpdateGameDynamicsLive', activeRoomCode, dynamics).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke]);

  const handleTriggerEvent = useCallback((eventType: string, targetQ?: number, targetR?: number, targetAllianceId?: string) => {
    if (!activeRoomCode) return;
    invoke('TriggerGameEvent', activeRoomCode, eventType, targetQ ?? null, targetR ?? null, targetAllianceId ?? null)
      .catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke]);

  const handleSendHostMessage = useCallback((message: string, allianceIds?: string[]) => {
    if (!activeRoomCode) return;
    invoke('SendHostMessage', activeRoomCode, message, allianceIds ?? null).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke]);

  const handlePauseGame = useCallback((paused: boolean) => {
    if (!activeRoomCode) return;
    invoke('PauseGame', activeRoomCode, paused).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke]);

  const handleHexClick = useCallback((q: number, r: number, cell: HexCell | undefined) => {
    if (commandoTargetingMode) {
      handleActivateCommandoRaid(q, r);
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

    // Check if player is NOT on this hex - show info message (skip when host GPS bypass is active)
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
        targetHex
      });
      return;
    }

    // Player IS on this hex (or host bypass is active) - TileActionPanel will show via tileActions memo
    // Clear any old feedback
    setMapFeedback(null);
  }, [auth, commandoTargetingMode, currentHex, gameState, handleActivateCommandoRaid, isHostBypass, myPlayer, t]);

  const tileActions = useMemo<TileAction[]>(() => {
    if (!gameState || gameState.phase !== 'Playing' || !selectedHex) return [];
    const targetCell = gameState.grid[`${selectedHex[0]},${selectedHex[1]}`];
    return getTileActions({
      state: gameState,
      player: myPlayer,
      targetHex: selectedHex,
      targetCell,
      currentHex,
      isHostBypass,
    });
  }, [gameState, selectedHex, myPlayer, currentHex, isHostBypass]);

  const currentHexActions = useMemo<TileAction[]>(() => {
    if (!gameState || gameState.phase !== 'Playing' || !currentHex) return [];
    const targetCell = gameState.grid[`${currentHex[0]},${currentHex[1]}`];
    return getTileActions({
      state: gameState,
      player: myPlayer,
      targetHex: currentHex,
      targetCell,
      currentHex,
      isHostBypass,
    });
  }, [gameState, currentHex, myPlayer, isHostBypass]);

  const currentHexCell = useMemo(() => {
    if (!gameState || !currentHex) return undefined;
    return gameState.grid[`${currentHex[0]},${currentHex[1]}`];
  }, [gameState, currentHex]);

  const handleTileAction = useCallback((actionType: TileActionType) => {
    if (!selectedHex || !gameState) return;
    const [q, r] = selectedHex;

    // When host GPS bypass is active, send hex center coordinates instead of actual GPS
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
      return; // no location available
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
              targetHex: selectedHex
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
  }, [selectedHex, currentLocation, gameState, isHostBypass, myPlayer, invoke, playSound, t]);

  const handleCurrentHexAction = useCallback((actionType: TileActionType) => {
    if (!currentHex || !gameState) return;
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
              targetHex: currentHex
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
  }, [currentHex, currentLocation, gameState, isHostBypass, myPlayer, invoke, playSound, t]);

  const handleDismissTileActions = useCallback(() => {
    setSelectedHex(null);
    setMapFeedback(null);
  }, []);

  const handleConfirmPickup = useCallback(() => {
    if (!pickupPrompt) {
      return;
    }

    // When host GPS bypass is active, use hex center coordinates
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
      return; // no location available
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
            r: pickupPrompt.r
          }),
          targetHex
        });
      })
      .catch(cause => {
        setMapFeedback({
          tone: 'error',
          message: getErrorMessage(cause),
          targetHex
        });
      });
  }, [currentLocation, gameState, invoke, isHostBypass, pickupCount, pickupPrompt, playSound, t]);

  const handleConfirmAttack = useCallback(async () => {
    if (!attackPrompt) return;

    // When host GPS bypass is active, use hex center coordinates
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
      return; // no location available
    }

    try {
      await invoke('PlaceTroops', attackPrompt.q, attackPrompt.r, attackLat, attackLng, attackCount, false);
      playSound('attack');
      // CombatResult will come via SignalR event
    } catch (err) {
      playSound('error');
      setMapFeedback({ tone: 'error', message: getErrorMessage(err), targetHex: [attackPrompt.q, attackPrompt.r] });
    } finally {
      setAttackPrompt(null);
    }
  }, [attackPrompt, attackCount, currentLocation, gameState, invoke, isHostBypass, playSound]);

  const handleCancelAttack = useCallback(() => {
    setAttackPrompt(null);
  }, []);

  const handleReClaimHex = useCallback(async (mode: ReClaimMode) => {
    if (!combatResult) return;
    if (mode === 'Alliance') {
      // Default behavior — tile is already claimed for alliance by PlaceTroops
      setCombatResult(null);
      return;
    }
    try {
      await invoke('ReClaimHex', combatResult.q, combatResult.r, mode);
    } catch (err) {
      setMapFeedback({ tone: 'error', message: getErrorMessage(err), targetHex: [combatResult.q, combatResult.r] });
    } finally {
      setCombatResult(null);
    }
  }, [combatResult, invoke]);

  const handlePlayAgain = useCallback(() => {
    clearSession();
    setMyRooms([]);
    setGameState(null);
    clearGameplayUi();
    setView('lobby');
    setError('');
    setPickupPrompt(null);
    void refreshMyRooms().catch(cause => setError(String(cause)));
  }, [clearGameplayUi, clearSession, refreshMyRooms]);

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
      onClick={() => setShowDebugTools(value => !value)}
      aria-pressed={showDebugTools}
    >
      {showDebugTools ? t('debugGps.hideTools') : t('debugGps.showTools')}
    </button>
  ) : null;

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
        </>
      );
    }

    return (
      <>
        {connectionBanner && <ConnectionBanner message={connectionBanner} />}
        <PlayingHud
          state={gameState}
          myUserId={auth.userId}
          currentHex={currentHex}
          selectedHex={selectedHex}
          interactionFeedback={mapFeedback}
          pickupPrompt={pickupPrompt}
          pickupCount={pickupCount}
          onPickupCountChange={setPickupCount}
          onConfirmPickup={handleConfirmPickup}
          onCancelPickup={() => setPickupPrompt(null)}
          onReturnToLobby={handleReturnToLobby}
          error={error}
          locationError={effectiveLocationError}
          tileActions={tileActions}
          currentHexActions={currentHexActions}
          currentHexCell={currentHexCell}
          onTileAction={handleTileAction}
          onCurrentHexAction={handleCurrentHexAction}
          onDismissTileActions={handleDismissTileActions}
          attackPrompt={attackPrompt}
          attackCount={attackCount}
          onAttackCountChange={setAttackCount}
          onConfirmAttack={handleConfirmAttack}
          onCancelAttack={handleCancelAttack}
          randomEvent={randomEvent}
          eventWarning={eventWarning}
          isRushHour={gameState?.isRushHour}
          missionNotification={missionNotification}
          pendingDuel={pendingDuel}
          onAcceptDuel={handleAcceptDuel}
          onDeclineDuel={handleDeclineDuel}
          onDetainPlayer={handleDetainPlayer}
          onActivateBeacon={handleActivateBeacon}
          onDeactivateBeacon={handleDeactivateBeacon}
          onActivateStealth={handleActivateStealth}
          commandoTargetingMode={commandoTargetingMode}
          onStartCommandoTargeting={() => setCommandoTargetingMode(true)}
          onCancelCommandoTargeting={() => setCommandoTargetingMode(false)}
          playerDisplayPrefs={playerDisplayPrefs}
          onPlayerDisplayPrefsChange={setPlayerDisplayPrefs}
          playerColor={playerColor}
          currentPlayerName={currentPlayerName}
          selectedHexKey={selectedHexKey}
          carriedTroops={myPlayer?.carriedTroops ?? 0}
          isInOwnHex={isInOwnHex}
          hasLocation={Boolean(currentLocation)}
          hostMessage={hostMessage}
          isPaused={gameState.isPaused}
          isHost={myPlayer?.isHost}
          onSetObserverMode={handleSetObserverMode}
          debugToggle={debugToggleButton}
          debugPanel={debugGpsPanel}
          toasts={toasts}
          onDismissToast={dismissToast}
          mainMapBounds={mainMapBounds}
          selectedHexScreenPos={selectedHexScreenPos}
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
      <GameLobby
        username={auth.username}
        myUserId={auth.userId}
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
          logout();
          setGameState(null);
          setPickupPrompt(null);
          clearGameplayUi();
          setView('lobby');
        }}
        onSetObserverMode={handleSetObserverMode}
        error={error}
        invoke={invoke}
      />
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

function normalizeGameState(state: GameState, previousState?: GameState | null): GameState {
  const previousEventLog = previousState?.roomCode === state.roomCode && Array.isArray(previousState.eventLog)
    ? previousState.eventLog
    : undefined;

  return {
    ...state,
    eventLog: Array.isArray(state.eventLog) ? state.eventLog : previousEventLog,
    dynamics: state.dynamics ?? {
      activeCopresenceModes: [],
      copresencePreset: null,
      terrainEnabled: false,
      playerRolesEnabled: false,
      fogOfWarEnabled: false,
      supplyLinesEnabled: false,
      hqEnabled: false,
      timedEscalationEnabled: false,
      underdogPactEnabled: false,
      neutralNPCEnabled: false,
      randomEventsEnabled: false,
      missionSystemEnabled: false,
    },
  };
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

function isMissingHubMethodFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('method does not exist')
    || normalized.includes('unknown hub method')
    || normalized.includes('method not found')
    || normalized.includes('does not exist');
}

function localizeLobbyError(message: unknown, t: TFunction): string {
  const text = typeof message === 'string' ? message : JSON.stringify(message);
  const normalized = text.toLowerCase();

  if (normalized.includes('room not found')) {
    return t('lobby.joinErrors.roomNotFound');
  }

  if (normalized.includes('room is full') || normalized.includes('full')) {
    return t('lobby.joinErrors.roomFull');
  }

  if (normalized.includes('already in')) {
    return t('lobby.joinErrors.alreadyInRoom');
  }

  if (normalized.includes('unable to rejoin') || normalized.includes('no active room')) {
    return t('lobby.joinErrors.roomUnavailable');
  }

  if (normalized.includes('not in a room')) {
    return t('lobby.joinErrors.notInRoom');
  }

  return text;
}

function getPlaceSuccessMessage(
  placeOutcome: 'claim' | 'reinforce' | 'capture' | undefined,
  q: number,
  r: number,
  t: TFunction
): string {
  switch (placeOutcome) {
    case 'reinforce':
      return t('game.mapFeedback.reinforced', { q, r });
    case 'capture':
      return t('game.mapFeedback.captured', { q, r });
    case 'claim':
    default:
      return t('game.mapFeedback.claimed', { q, r });
  }
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
