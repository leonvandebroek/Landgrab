import { useCallback } from 'react';
import { roomHexToLatLng } from '../components/map/HexMath';
import { useGameStore } from '../stores/gameStore';
import { useGameplayStore } from '../stores';
import { useUiStore } from '../stores/uiStore';
import type {
  ClaimMode,
  GameAreaPattern,
  GameDynamics,
  HexCoordinate,
  RoomSummary,
  WinConditionType,
} from '../types/game';
import {
  getErrorMessage,
  isMissingHubMethodFailure,
  localizeLobbyError,
} from '../utils/gameHelpers';
import type { RefreshMyRooms, UseGameActionsOptions } from './useGameActions.shared';

interface UseGameActionsLobbyResult {
  refreshMyRooms: RefreshMyRooms;
  handleCreateRoom: () => void;
  handleJoinRoom: (code: string) => void;
  handleSetAlliance: (name: string) => void;
  handleAssignPlayerRole: (targetPlayerId: string, role: string) => void;
  handleRandomizeRoles: () => void;
  handleSetMapLocation: (lat: number, lng: number) => void;
  handleSetTileSize: (meters: number) => void;
  handleUseCenteredGameArea: () => void;
  handleSetPatternGameArea: (pattern: GameAreaPattern) => void;
  handleSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
  handleSetClaimMode: (mode: ClaimMode) => void;
  handleSetWinCondition: (type: WinConditionType, value: number) => void;
  handleSetBeaconEnabled: (enabled: boolean) => void;
  handleSetTileDecayEnabled: (enabled: boolean) => void;
  handleSetEnemySightingMemory: (seconds: number) => void;
  handleSetGameDynamics: (dynamics: GameDynamics) => void;
  handleSetPlayerRole: (role: string) => Promise<void>;
  handleSetAllianceHQ: (q: number, r: number, allianceId: string) => Promise<void>;
  handleSetMasterTile: (lat: number, lng: number) => void;
  handleSetMasterTileByHex: (q: number, r: number) => void;
  handleAssignStartingTile: (q: number, r: number, playerId: string) => void;
  handleConfigureAlliances: (names: string[]) => void;
  handleDistributePlayers: () => void;
  handleAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  handleStartGame: () => void;
  handleReturnToLobby: () => void;
  handlePlayAgain: () => void;
}

export function useGameActionsLobby({
  invoke,
  auth,
  connected,
  autoResuming,
  pendingResumeRef,
  gameState,
  t,
  clearSession,
}: Pick<
  UseGameActionsOptions,
  'invoke' | 'auth' | 'connected' | 'autoResuming' | 'pendingResumeRef' | 'gameState' | 't' | 'clearSession'
>): UseGameActionsLobbyResult {
  const setMyRooms = useGameStore(state => state.setMyRooms);
  const setGameState = useGameStore(state => state.setGameState);
  const updateGameState = useGameStore(state => state.updateGameState);
  const clearGameplayUi = useGameplayStore(state => state.clearGameplayUi);
  const setPickupPrompt = useGameplayStore(state => state.setPickupPrompt);
  const setView = useUiStore(state => state.setView);
  const setError = useUiStore(state => state.setError);

  const refreshMyRooms = useCallback(async (): Promise<void> => {
    if (!auth || !connected || !invoke) {
      setMyRooms([]);
      return;
    }

    const rooms = await invoke<RoomSummary[]>('GetMyRooms');
    setMyRooms(Array.isArray(rooms) ? rooms : []);
  }, [auth, connected, invoke, setMyRooms]);

  const cleanupLobbyState = useCallback((): void => {
    clearSession();
    setGameState(null);
    setPickupPrompt(null);
    clearGameplayUi();
    useGameplayStore.getState().setSelectedHexKey(null);
    setView('lobby');
  }, [clearGameplayUi, clearSession, setGameState, setPickupPrompt, setView]);

  const handleCreateRoom = useCallback((): void => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    if (!invoke) {
      return;
    }

    invoke('CreateRoom').catch(cause => setError(localizeLobbyError(getErrorMessage(cause), t)));
  }, [autoResuming, invoke, pendingResumeRef, setError, t]);

  const handleJoinRoom = useCallback((code: string): void => {
    if (autoResuming || pendingResumeRef.current) {
      setError(t('errors.pleaseWait'));
      return;
    }

    if (!invoke) {
      return;
    }

    const normalizedCode = code.trim().toUpperCase();
    invoke('JoinRoom', normalizedCode).catch(cause => setError(localizeLobbyError(getErrorMessage(cause), t)));
  }, [autoResuming, invoke, pendingResumeRef, setError, t]);

  const handleSetAlliance = useCallback((name: string): void => {
    if (!invoke) {
      return;
    }

    invoke('SetAlliance', name).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleAssignPlayerRole = useCallback((targetPlayerId: string, role: string): void => {
    if (!invoke) {
      return;
    }

    invoke('AssignPlayerRole', targetPlayerId, role).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleRandomizeRoles = useCallback((): void => {
    if (!invoke) {
      return;
    }

    invoke('RandomizeRoles').catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetMapLocation = useCallback((lat: number, lng: number): void => {
    if (!invoke) {
      return;
    }

    invoke('SetMapLocation', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetTileSize = useCallback((meters: number): void => {
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

  const handleUseCenteredGameArea = useCallback((): void => {
    if (!invoke) {
      return;
    }

    invoke('UseCenteredGameArea').catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetPatternGameArea = useCallback((pattern: GameAreaPattern): void => {
    if (!invoke) {
      return;
    }

    invoke('SetPatternGameArea', pattern).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetCustomGameArea = useCallback((coordinates: HexCoordinate[]): void => {
    if (!invoke) {
      return;
    }

    invoke('SetCustomGameArea', coordinates).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetClaimMode = useCallback((mode: ClaimMode): void => {
    if (!invoke) {
      return;
    }

    invoke('SetClaimMode', mode).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetWinCondition = useCallback((type: WinConditionType, value: number): void => {
    if (!invoke) {
      return;
    }

    invoke('SetWinCondition', type, value).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetBeaconEnabled = useCallback((enabled: boolean): void => {
    if (!invoke) {
      return;
    }

    invoke('SetBeaconEnabled', enabled).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetTileDecayEnabled = useCallback((enabled: boolean): void => {
    if (!invoke) {
      return;
    }

    invoke('SetTileDecayEnabled', enabled).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetEnemySightingMemory = useCallback((seconds: number): void => {
    if (!invoke) {
      return;
    }

    invoke('SetEnemySightingMemory', seconds).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetGameDynamics = useCallback((dynamics: GameDynamics): void => {
    if (!invoke) {
      return;
    }

    invoke('SetGameDynamics', dynamics).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetPlayerRole = useCallback(async (role: string): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('SetPlayerRole', role);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleSetAllianceHQ = useCallback(async (q: number, r: number, allianceId: string): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('SetAllianceHQ', q, r, allianceId);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleSetMasterTile = useCallback((lat: number, lng: number): void => {
    if (!invoke) {
      return;
    }

    invoke('SetMasterTile', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleSetMasterTileByHex = useCallback((q: number, r: number): void => {
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

  const handleAssignStartingTile = useCallback((q: number, r: number, playerId: string): void => {
    if (!invoke) {
      return;
    }

    invoke('AssignStartingTile', q, r, playerId).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleConfigureAlliances = useCallback((names: string[]): void => {
    if (!invoke) {
      return;
    }

    invoke('ConfigureAlliances', names).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleDistributePlayers = useCallback((): void => {
    if (!invoke) {
      return;
    }

    invoke('DistributePlayers').catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleAssignAllianceStartingTile = useCallback((q: number, r: number, allianceId: string): void => {
    if (!invoke) {
      return;
    }

    invoke('AssignAllianceStartingTile', q, r, allianceId).catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleStartGame = useCallback((): void => {
    if (!invoke) {
      return;
    }

    invoke('StartGame').catch(cause => setError(String(cause)));
  }, [invoke, setError]);

  const handleReturnToLobby = useCallback((): void => {
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

  const handlePlayAgain = useCallback((): void => {
    clearSession();
    setMyRooms([]);
    setGameState(null);
    clearGameplayUi();
    useGameplayStore.getState().setSelectedHexKey(null);
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
    handleSetMasterTile,
    handleSetMasterTileByHex,
    handleAssignStartingTile,
    handleConfigureAlliances,
    handleDistributePlayers,
    handleAssignAllianceStartingTile,
    handleStartGame,
    handleReturnToLobby,
    handlePlayAgain,
  };
}
