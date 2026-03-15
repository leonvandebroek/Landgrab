import { useCallback } from 'react';
import { useNotificationStore } from '../stores/notificationStore';
import { useUiStore } from '../stores/uiStore';
import type { UseGameActionsOptions } from './useGameActions.shared';

interface UseGameActionsAbilitiesResult {
  handleActivateBeacon: () => Promise<void>;
  handleDeactivateBeacon: () => Promise<void>;
  handleActivateStealth: () => Promise<void>;
  handleActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<void>;
  handleAcceptDuel: (duelId: string) => Promise<void>;
  handleDeclineDuel: (duelId: string) => Promise<void>;
  handleDetainPlayer: (targetPlayerId: string) => Promise<void>;
}

export function useGameActionsAbilities({
  invoke,
}: Pick<UseGameActionsOptions, 'invoke'>): UseGameActionsAbilitiesResult {
  const setPendingDuel = useNotificationStore(state => state.setPendingDuel);
  const setError = useUiStore(state => state.setError);

  const handleActivateBeacon = useCallback(async (): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateBeacon');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleDeactivateBeacon = useCallback(async (): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('DeactivateBeacon');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleActivateStealth = useCallback(async (): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateStealth');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleActivateCommandoRaid = useCallback(async (targetQ: number, targetR: number): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateCommandoRaid', targetQ, targetR);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleAcceptDuel = useCallback(async (duelId: string): Promise<void> => {
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

  const handleDeclineDuel = useCallback(async (duelId: string): Promise<void> => {
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

  const handleDetainPlayer = useCallback(async (targetPlayerId: string): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('DetainPlayer', targetPlayerId);
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  return {
    handleActivateBeacon,
    handleDeactivateBeacon,
    handleActivateStealth,
    handleActivateCommandoRaid,
    handleAcceptDuel,
    handleDeclineDuel,
    handleDetainPlayer,
  };
}
