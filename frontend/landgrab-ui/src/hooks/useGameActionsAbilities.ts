import { useCallback } from 'react';
import { useUiStore } from '../stores/uiStore';
import type { UseGameActionsOptions } from './useGameActions.shared';

interface UseGameActionsAbilitiesResult {
  handleActivateBeacon: () => Promise<void>;
  handleDeactivateBeacon: () => Promise<void>;
  handleActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<void>;
  handleActivateTacticalStrike: () => Promise<void>;
  handleActivateReinforce: () => Promise<void>;
  handleActivateEmergencyRepair: () => Promise<void>;
  handleStartDemolish: () => Promise<void>;
}

export function useGameActionsAbilities({
  invoke,
}: Pick<UseGameActionsOptions, 'invoke'>): UseGameActionsAbilitiesResult {
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

  const handleActivateTacticalStrike = useCallback(async (): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateTacticalStrike');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleActivateReinforce = useCallback(async (): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateReinforce');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleActivateEmergencyRepair = useCallback(async (): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('ActivateEmergencyRepair');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  const handleStartDemolish = useCallback(async (): Promise<void> => {
    if (!invoke) {
      return;
    }

    try {
      await invoke('StartDemolish');
    } catch (error) {
      setError(String(error));
    }
  }, [invoke, setError]);

  return {
    handleActivateBeacon,
    handleDeactivateBeacon,
    handleActivateCommandoRaid,
    handleActivateTacticalStrike,
    handleActivateReinforce,
    handleActivateEmergencyRepair,
    handleStartDemolish,
  };
}
