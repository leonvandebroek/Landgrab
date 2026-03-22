import { useCallback } from 'react';
import { useUiStore } from '../stores/uiStore';
import { computeBeaconCone } from '../utils/beaconCone';
import type { UseGameActionsOptions } from './useGameActions.shared';

interface UseGameActionsAbilitiesResult {
  handleActivateBeacon: (heading: number) => Promise<boolean>;
  handleDeactivateBeacon: () => Promise<boolean>;
  handleShareBeaconIntel: () => Promise<number>;
  handleActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<boolean>;
  resolveRaidTarget: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  handleActivateTacticalStrike: (targetQ: number, targetR: number) => Promise<boolean>;
  resolveTacticalStrikeTarget: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
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
  gameState,
  myPlayer,
}: Pick<UseGameActionsOptions, 'invoke' | 'gameState' | 'myPlayer'>): UseGameActionsAbilitiesResult {
  const setError = useUiStore(state => state.setError);

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
    if (!invoke || !gameState || !myPlayer) {
      return 0;
    }

    const { currentHexQ, currentHexR, beaconHeading } = myPlayer;
    if (currentHexQ == null || currentHexR == null || beaconHeading == null) {
      return 0;
    }

    const playerHexKey = `${currentHexQ},${currentHexR}`;
    const hexKeys = computeBeaconCone(playerHexKey, beaconHeading, gameState.grid);

    try {
      const count = await invoke<number>('ShareBeaconIntel', gameState.roomCode, hexKeys);
      return count ?? 0;
    } catch (error) {
      setError(String(error));
      return 0;
    }
  }, [invoke, gameState, myPlayer, setError]);

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

  const resolveRaidTarget = useCallback(async (heading: number): Promise<{ targetQ: number; targetR: number } | null> => {
    if (!invoke) {
      return null;
    }

    try {
      return await invoke<{ targetQ: number; targetR: number } | null>('ResolveRaidTarget', heading);
    } catch (error) {
      // Don't show global error for polling
      console.warn("ResolveRaidTarget error:", error);
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
      console.warn("ResolveTacticalStrikeTarget error:", error);
      return null;
    }
  }, [invoke]);

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
      console.warn("AttemptIntercept error:", error);
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
