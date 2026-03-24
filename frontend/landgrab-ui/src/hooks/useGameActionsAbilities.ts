import { useCallback } from 'react';
import { useUiStore } from '../stores/uiStore';
import type { UseGameActionsOptions } from './useGameActions.shared';

interface UseGameActionsAbilitiesResult {
  handleActivateBeacon: (heading: number) => Promise<boolean>;
  handleDeactivateBeacon: () => Promise<boolean>;
  handleShareBeaconIntel: () => Promise<number>;
  handleActivateCommandoRaid: () => Promise<boolean>;
  resolveRaidTarget: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  handleActivateTacticalStrike: (targetQ: number, targetR: number) => Promise<boolean>;
  resolveTacticalStrikeTarget: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  resolveTroopTransferTarget: (heading: number) => Promise<{ recipientId: string; recipientName: string } | null>;
  handleInitiateTroopTransfer: (amount: number, recipientId: string) => Promise<{ transferId: string } | null>;
  handleRespondToTroopTransfer: (transferId: string, accepted: boolean) => Promise<boolean>;
  handleInitiateFieldBattle: () => Promise<{ battleId: string } | null>;
  handleJoinFieldBattle: (battleId: string) => Promise<boolean>;
  handleActivateRallyPoint: () => Promise<boolean>;
  handleActivateSabotage: () => Promise<boolean>;
  handleCancelFortConstruction: () => Promise<boolean>;
  handleCancelSabotage: () => Promise<boolean>;
  handleCancelDemolish: () => Promise<boolean>;
  handleStartDemolish: () => Promise<boolean>;
  handleStartFortConstruction: () => Promise<boolean>;
  attemptIntercept: (heading: number) => Promise<{ status: string; seconds?: number }>;
}

export function useGameActionsAbilities({
  invoke,
}: Pick<UseGameActionsOptions, 'invoke'>): UseGameActionsAbilitiesResult {
  const setError = useUiStore((state) => state.setError);

  const handleActivateBeacon = useCallback(async (heading: number): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateBeacon', heading);
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

  const handleShareBeaconIntel = useCallback(async (): Promise<number> => {
    if (!invoke) {
      return 0;
    }

    try {
      const count = await invoke<number>('ShareBeaconIntel');
      return count ?? 0;
    } catch (error) {
      setError(String(error));
      return 0;
    }
  }, [invoke, setError]);

  const handleActivateCommandoRaid = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateCommandoRaid');
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const resolveRaidTarget = useCallback(async (heading: number): Promise<{ targetQ: number; targetR: number } | null> => {
    if (!invoke) {
      return null;
    }

    try {
      return await invoke<{ targetQ: number; targetR: number } | null>('ResolveRaidTarget', heading);
    } catch (error) {
      console.warn('ResolveRaidTarget error:', error);
      return null;
    }
  }, [invoke]);

  const handleActivateTacticalStrike = useCallback(async (targetQ: number, targetR: number): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateTacticalStrike', targetQ, targetR);
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const resolveTacticalStrikeTarget = useCallback(async (heading: number): Promise<{ targetQ: number; targetR: number } | null> => {
    if (!invoke) {
      return null;
    }

    try {
      return await invoke<{ targetQ: number; targetR: number } | null>('ResolveTacticalStrikeTarget', heading);
    } catch (error) {
      console.warn('ResolveTacticalStrikeTarget error:', error);
      return null;
    }
  }, [invoke]);

  const resolveTroopTransferTarget = useCallback(async (heading: number): Promise<{ recipientId: string; recipientName: string } | null> => {
    if (!invoke) return null;
    try {
      return await invoke<{ recipientId: string; recipientName: string } | null>('ResolveTroopTransferTarget', heading);
    } catch {
      return null;
    }
  }, [invoke]);

  const handleInitiateTroopTransfer = useCallback(async (amount: number, recipientId: string): Promise<{ transferId: string } | null> => {
    if (!invoke) return null;
    try {
      return await invoke<{ transferId: string }>('InitiateTroopTransfer', amount, recipientId);
    } catch (error) {
      setError(String(error));
      return null;
    }
  }, [invoke, setError]);

  const handleRespondToTroopTransfer = useCallback(async (transferId: string, accepted: boolean): Promise<boolean> => {
    if (!invoke) return false;
    try {
      await invoke('RespondToTroopTransfer', transferId, accepted);
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleInitiateFieldBattle = useCallback(async (): Promise<{ battleId: string } | null> => {
    if (!invoke) return null;
    try {
      return await invoke<{ battleId: string }>('InitiateFieldBattle');
    } catch (error) {
      setError(String(error));
      return null;
    }
  }, [invoke, setError]);

  const handleJoinFieldBattle = useCallback(async (battleId: string): Promise<boolean> => {
    if (!invoke) return false;
    try {
      await invoke('JoinFieldBattle', battleId);
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }, [invoke, setError]);

  const handleActivateRallyPoint = useCallback(async (): Promise<boolean> => {
    if (!invoke) {
      return false;
    }

    try {
      await invoke('ActivateRallyPoint');
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

  const attemptIntercept = useCallback(async (heading: number): Promise<{ status: string; seconds?: number }> => {
    if (!invoke) {
      return { status: 'noTarget' };
    }
    try {
      return await invoke<{ status: string; seconds?: number }>('AttemptIntercept', heading);
    } catch (error) {
      console.warn('AttemptIntercept error:', error);
      return { status: 'noTarget' };
    }
  }, [invoke]);

  return {
    handleActivateBeacon,
    handleDeactivateBeacon,
    handleShareBeaconIntel,
    handleActivateCommandoRaid,
    resolveRaidTarget,
    handleActivateTacticalStrike,
    resolveTacticalStrikeTarget,
    resolveTroopTransferTarget,
    handleInitiateTroopTransfer,
    handleRespondToTroopTransfer,
    handleInitiateFieldBattle,
    handleJoinFieldBattle,
    handleActivateRallyPoint,
    handleActivateSabotage,
    handleCancelFortConstruction,
    handleCancelSabotage,
    handleCancelDemolish,
    handleStartDemolish,
    handleStartFortConstruction,
    attemptIntercept,
  };
}
