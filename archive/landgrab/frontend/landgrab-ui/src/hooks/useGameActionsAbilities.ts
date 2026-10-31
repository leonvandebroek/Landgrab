import { useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useUiStore } from '../stores/uiStore';
import type { InvokeFn } from '../types/abilities';
import {
  resolveRaidTarget as resolveRaidTargetLocal,
  resolveTacticalStrikeTarget as resolveTacticalStrikeTargetLocal,
  resolveTroopTransferTarget as resolveTroopTransferTargetLocal,
} from '../utils/combatCalculations';
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
  handleSelectFieldBattleTarget: (battleId: string, targetId: string) => Promise<boolean>;
  handleChallengePlayer: (enemyId: string) => Promise<boolean>;
  handleFleeBattle: (battleId: string) => Promise<boolean>;
  handleActivateRallyPoint: () => Promise<boolean>;
  handleActivateSabotage: () => Promise<boolean>;
  handleCancelFortConstruction: () => Promise<boolean>;
  handleCancelSabotage: () => Promise<boolean>;
  handleCancelDemolish: () => Promise<boolean>;
  handleStartDemolish: () => Promise<boolean>;
  handleStartFortConstruction: () => Promise<boolean>;
  attemptIntercept: (heading: number) => Promise<{ status: string; seconds?: number }>;
}

/**
 * Generic handler factory — eliminates the repetitive try/catch boilerplate.
 * Preserves the exact same public API as the old per-method useCallback approach.
 */
function makeHandler<TArgs extends unknown[], TResult>(
  invoke: InvokeFn | null,
  setError: (msg: string) => void,
  method: string,
  fallback: TResult,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    if (!invoke) return fallback;
    try {
      return (await invoke<TResult>(method, ...args)) ?? fallback;
    } catch (error) {
      setError(String(error));
      return fallback;
    }
  };
}

export function useGameActionsAbilities({
  invoke,
}: Pick<UseGameActionsOptions, 'invoke'>): UseGameActionsAbilitiesResult {
  const setError = useUiStore((state) => state.setError);
  const gameState = useGameStore((state) => state.gameState);
  const currentUserId = useGameStore((state) => state.savedSession?.userId ?? null);

  // Cast invoke to InvokeFn — SignalRInvoke and InvokeFn are compatible at runtime;
  // InvokeFn allows undefined return which is the safer superset.
  const invokeFn = invoke as InvokeFn | null;

  return useMemo(() => ({
    handleActivateBeacon:         makeHandler(invokeFn, setError, 'ActivateBeacon',              false as boolean),
    handleDeactivateBeacon:       makeHandler(invokeFn, setError, 'DeactivateBeacon',            false as boolean),
    handleShareBeaconIntel:       makeHandler(invokeFn, setError, 'ShareBeaconIntel',            0 as number),
    handleActivateCommandoRaid:   makeHandler(invokeFn, setError, 'ActivateCommandoRaid',        false as boolean),
    resolveRaidTarget: async (_heading: number) => {
      try {
        const player = currentUserId
          ? gameState?.players.find((candidate) => candidate.id === currentUserId) ?? null
          : null;
        return Promise.resolve(player && gameState ? resolveRaidTargetLocal(player, gameState) : null);
      } catch (error) {
        setError(String(error));
        return Promise.resolve(null);
      }
    },
    handleActivateTacticalStrike: makeHandler(invokeFn, setError, 'ActivateTacticalStrike',      false as boolean),
    resolveTacticalStrikeTarget: async (heading: number) => {
      try {
        const player = currentUserId
          ? gameState?.players.find((candidate) => candidate.id === currentUserId) ?? null
          : null;
        return Promise.resolve(
          player && gameState
            ? resolveTacticalStrikeTargetLocal(player, gameState, heading)
            : null,
        );
      } catch (error) {
        setError(String(error));
        return Promise.resolve(null);
      }
    },
    resolveTroopTransferTarget: async (heading: number) => {
      try {
        const player = currentUserId
          ? gameState?.players.find((candidate) => candidate.id === currentUserId) ?? null
          : null;
        return Promise.resolve(
          player && gameState
            ? resolveTroopTransferTargetLocal(player, gameState.players, heading)
            : null,
        );
      } catch (error) {
        setError(String(error));
        return Promise.resolve(null);
      }
    },
    handleInitiateTroopTransfer:  makeHandler<[number, string], { transferId: string } | null>(
      invokeFn, setError, 'InitiateTroopTransfer', null,
    ),
    handleRespondToTroopTransfer: makeHandler(invokeFn, setError, 'RespondToTroopTransfer',      false as boolean),
    handleInitiateFieldBattle:    makeHandler<[], { battleId: string } | null>(
      invokeFn, setError, 'InitiateFieldBattle', null,
    ),
    handleJoinFieldBattle:        makeHandler(invokeFn, setError, 'JoinFieldBattle',             false as boolean),
    handleSelectFieldBattleTarget: makeHandler(invokeFn, setError, 'SelectFieldBattleTarget',    false as boolean),
    handleChallengePlayer:        makeHandler(invokeFn, setError, 'ChallengePlayer',             false as boolean),
    handleFleeBattle:             makeHandler(invokeFn, setError, 'FleeBattle',                  false as boolean),
    handleActivateRallyPoint:     makeHandler(invokeFn, setError, 'ActivateRallyPoint',          false as boolean),
    handleActivateSabotage:       makeHandler(invokeFn, setError, 'ActivateSabotage',            false as boolean),
    handleCancelFortConstruction: makeHandler(invokeFn, setError, 'CancelFortConstruction',      false as boolean),
    handleCancelSabotage:         makeHandler(invokeFn, setError, 'CancelSabotage',              false as boolean),
    handleCancelDemolish:         makeHandler(invokeFn, setError, 'CancelDemolish',              false as boolean),
    handleStartDemolish:          makeHandler(invokeFn, setError, 'StartDemolish',               false as boolean),
    handleStartFortConstruction:  makeHandler(invokeFn, setError, 'StartFortConstruction',       false as boolean),
    // attemptIntercept uses console.warn (not setError) on failure — kept explicit.
    attemptIntercept: makeHandler<[number], { status: string; seconds?: number }>(
      invokeFn, setError, 'AttemptIntercept', { status: 'noTarget' },
    ),
  }), [currentUserId, gameState, invokeFn, setError]);
}
