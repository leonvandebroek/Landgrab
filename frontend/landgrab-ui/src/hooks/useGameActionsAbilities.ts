import { useCallback } from 'react';
import { useUiStore } from '../stores/uiStore';
import type { UseGameActionsOptions } from './useGameActions.shared';

interface UseGameActionsAbilitiesResult {
  handleActivateBeacon: () => Promise<boolean>;
  handleDeactivateBeacon: () => Promise<boolean>;
  handleActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<boolean>;
  handleActivateTacticalStrike: () => Promise<boolean>;
  handleActivateReinforce: () => Promise<boolean>;
  handleActivateSabotage: () => Promise<boolean>;
  handleCancelFortConstruction: () => Promise<boolean>;
  handleCancelSabotage: () => Promise<boolean>;
  handleCancelDemolish: () => Promise<boolean>;
  handleStartDemolish: () => Promise<boolean>;
  handleStartFortConstruction: () => Promise<boolean>;
}

export function useGameActionsAbilities({
  invoke,
}: Pick<UseGameActionsOptions, 'invoke'>): UseGameActionsAbilitiesResult {
  const setError = useUiStore(state => state.setError);

  const handleActivateBeacon = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateBeacon');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleDeactivateBeacon = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('DeactivateBeacon');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleActivateCommandoRaid = useCallback(async (targetQ: number, targetR: number): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateCommandoRaid', targetQ, targetR);
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleActivateTacticalStrike = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateTacticalStrike');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleActivateReinforce = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateReinforce');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleActivateSabotage = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateSabotage');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleCancelFortConstruction = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('CancelFortConstruction');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleCancelSabotage = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('CancelSabotage');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleCancelDemolish = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('CancelDemolish');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleStartDemolish = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('StartDemolish');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleStartFortConstruction = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('StartFortConstruction');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  return {
    handleActivateBeacon,
    handleDeactivateBeacon,
    handleActivateCommandoRaid,
    handleActivateTacticalStrike,
    handleActivateReinforce,
    handleActivateSabotage,
    handleCancelFortConstruction,
    handleCancelSabotage,
    handleCancelDemolish,
    handleStartDemolish,
    handleStartFortConstruction,
  };
}
