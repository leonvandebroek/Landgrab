import { useCallback } from 'react';
import type { GameDynamics } from '../types/game';
import { useUiStore } from '../stores/uiStore';
import type { UseGameActionsOptions } from './useGameActions.shared';

interface UseGameActionsHostResult {
  handleSetObserverMode: (enabled: boolean) => void;
  handleUpdateDynamicsLive: (dynamics: GameDynamics) => void;
  handleSendHostMessage: (message: string, allianceIds?: string[]) => void;
  handlePauseGame: (paused: boolean) => void;
}

export function useGameActionsHost({
  invoke,
  gameState,
}: Pick<UseGameActionsOptions, 'invoke' | 'gameState'>): UseGameActionsHostResult {
  const setError = useUiStore(state => state.setError);
  const activeRoomCode = gameState?.roomCode ?? '';

  const handleSetObserverMode = useCallback((enabled: boolean): void => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('SetHostObserverMode', activeRoomCode, enabled).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handleUpdateDynamicsLive = useCallback((dynamics: GameDynamics): void => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('UpdateGameDynamicsLive', activeRoomCode, dynamics).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handleSendHostMessage = useCallback((message: string, allianceIds?: string[]): void => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('SendHostMessage', activeRoomCode, message, allianceIds ?? null).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  const handlePauseGame = useCallback((paused: boolean): void => {
    if (!invoke || !activeRoomCode) {
      return;
    }

    invoke('PauseGame', activeRoomCode, paused).catch(cause => setError(String(cause)));
  }, [activeRoomCode, invoke, setError]);

  return {
    handleSetObserverMode,
    handleUpdateDynamicsLive,
    handleSendHostMessage,
    handlePauseGame,
  };
}
