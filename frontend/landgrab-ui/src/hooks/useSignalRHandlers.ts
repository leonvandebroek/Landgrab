import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import { useGameplayStore } from '../stores/gameplayStore';
import type { SavedSession } from '../stores/gameStore';
import { useGameStore } from '../stores/gameStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useUiStore } from '../stores/uiStore';
import type { SoundName } from './useSound';
import type { GameToast } from './useToastQueue';
import type { GameEvents } from './useSignalR';
import type { AttackPrompt, GameState, PickupPrompt, ReinforcePrompt } from '../types/game';
import { vibrate, HAPTIC } from '../utils/haptics';
import { localizeLobbyError, normalizeGameState } from '../utils/gameHelpers';
import { readPersistedDebugLocation } from '../utils/debugLocationSession';

type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

interface UseSignalRHandlersOptions {
  getInvoke: () => SignalRInvoke | null;
  saveSession: (roomCode: string) => void;
  resolveResumeFromState: (state: import('../types/game').GameState) => boolean;
  resolveResumeFromError: (message: string) => boolean;
  savedSessionRef: MutableRefObject<SavedSession | null>;
  t: TFunction;
  playSound: (name: SoundName) => void;
  pushToast: (toast: Omit<GameToast, 'id'>) => void;
}

function getHex(state: GameState | null, q: number, r: number) {
  if (!state) {
    return null;
  }

  return state.grid[`${q},${r}`] ?? null;
}

function shouldClearPickupPrompt(
  prompt: PickupPrompt | null,
  previousState: GameState | null,
  nextState: GameState
): boolean {
  if (!prompt) {
    return false;
  }

  const previousHex = getHex(previousState, prompt.q, prompt.r);
  const nextHex = getHex(nextState, prompt.q, prompt.r);

  if (!nextHex) {
    return true;
  }

  if (nextHex.troops <= 0) {
    return true;
  }

  if (!previousHex) {
    return false;
  }

  return previousHex.ownerId !== nextHex.ownerId;
}

function shouldClearAttackPrompt(
  prompt: AttackPrompt | null,
  previousState: GameState | null,
  nextState: GameState
): boolean {
  if (!prompt) {
    return false;
  }

  const previousHex = getHex(previousState, prompt.q, prompt.r);
  const nextHex = getHex(nextState, prompt.q, prompt.r);

  if (!nextHex) {
    return true;
  }

  if (!previousHex) {
    return false;
  }

  return previousHex.ownerId !== nextHex.ownerId;
}

function shouldClearReinforcePrompt(
  prompt: ReinforcePrompt | null,
  previousState: GameState | null,
  nextState: GameState
): boolean {
  if (!prompt) {
    return false;
  }

  const previousHex = getHex(previousState, prompt.q, prompt.r);
  const nextHex = getHex(nextState, prompt.q, prompt.r);

  if (!nextHex) {
    return true;
  }

  if (!previousHex) {
    return false;
  }

  return previousHex.ownerId !== nextHex.ownerId || previousHex.ownerAllianceId !== nextHex.ownerAllianceId;
}

function restorePersistedDebugLocation(roomCode: string | null | undefined): void {
  const persistedDebugLocation = readPersistedDebugLocation(roomCode);
  if (!persistedDebugLocation) {
    return;
  }

  const uiState = useUiStore.getState();
  uiState.setDebugLocation(persistedDebugLocation);
  uiState.setDebugLocationEnabled(true);
}

export function useSignalRHandlers({
  getInvoke,
  saveSession,
  resolveResumeFromState,
  resolveResumeFromError,
  savedSessionRef,
  t,
  playSound,
  pushToast,
}: UseSignalRHandlersOptions): GameEvents {
  const gameState = useGameStore(state => state.gameState);

  return useMemo<GameEvents>(() => ({
    onRoomCreated: (code, state) => {
      const roomCode = code || state.roomCode;
      const normalizedState = normalizeGameState(state, gameState);
      saveSession(roomCode);
      resolveResumeFromState(normalizedState);
      useGameStore.getState().setGameState(normalizedState);
      useGameplayStore.getState().setPickupPrompt(null);
      useGameplayStore.getState().setReinforcePrompt(null);
      useUiStore.getState().setView('lobby');
      useGameplayStore.getState().clearGameplayUi();
      useUiStore.getState().clearError();
    },
    onPlayerJoined: (state) => {
      const normalizedState = normalizeGameState(state, gameState);
      resolveResumeFromState(normalizedState);
      if (normalizedState.roomCode) {
        saveSession(normalizedState.roomCode);
      }
      useGameStore.getState().setGameState(normalizedState);
      useGameplayStore.getState().setPickupPrompt(null);
      useGameplayStore.getState().setReinforcePrompt(null);
      if (state.phase === 'Lobby') {
        useUiStore.getState().setView('lobby');
        useGameplayStore.getState().clearGameplayUi();
      } else if (normalizedState.phase === 'Playing') {
        restorePersistedDebugLocation(normalizedState.roomCode);
        useUiStore.getState().setView('game');
      } else if (normalizedState.phase === 'GameOver') {
        useUiStore.getState().setView('gameover');
      }
      useUiStore.getState().clearError();
    },
    onGameStarted: (state) => {
      const normalizedState = normalizeGameState(state, gameState);
      resolveResumeFromState(normalizedState);
      if (normalizedState.roomCode) {
        saveSession(normalizedState.roomCode);
      }
      useGameStore.getState().setGameState(normalizedState);
      useGameplayStore.getState().setPickupPrompt(null);
      useGameplayStore.getState().setReinforcePrompt(null);
      restorePersistedDebugLocation(normalizedState.roomCode);
      useUiStore.getState().setView('game');
      useUiStore.getState().clearError();
    },
    onStateUpdated: (state) => {
      const normalizedState = normalizeGameState(state, gameState);
      const gameplayState = useGameplayStore.getState();
      const shouldClearPickup = shouldClearPickupPrompt(
        gameplayState.pickupPrompt,
        gameState,
        normalizedState
      );
      const shouldClearAttack = shouldClearAttackPrompt(
        gameplayState.attackPrompt,
        gameState,
        normalizedState
      );
      const shouldClearReinforce = shouldClearReinforcePrompt(
        gameplayState.reinforcePrompt,
        gameState,
        normalizedState
      );

      resolveResumeFromState(normalizedState);
      if (normalizedState.roomCode) {
        saveSession(normalizedState.roomCode);
      }
      useGameStore.getState().setGameState(normalizedState);
      if (shouldClearPickup) {
        gameplayState.setPickupPrompt(null);
      }
      if (shouldClearAttack) {
        gameplayState.setAttackPrompt(null);
      }
      if (shouldClearReinforce) {
        gameplayState.setReinforcePrompt(null);
      }
      if (normalizedState.phase === 'Playing') {
        if (gameState?.phase !== 'Playing') {
          restorePersistedDebugLocation(normalizedState.roomCode);
        }
        useUiStore.getState().setView('game');
      } else if (normalizedState.phase === 'GameOver') {
        useUiStore.getState().setView('gameover');
        useGameplayStore.getState().clearGameplayUi();
      }
      useUiStore.getState().clearError();
    },
    onGameOver: () => {
      playSound('victory');
      vibrate(HAPTIC.victory);
      useGameplayStore.getState().clearGameplayUi();
      useUiStore.getState().setView('gameover');
    },
    onCombatResult: (result) => {
      vibrate(HAPTIC.attack);
      useGameplayStore.getState().setCombatResult(result);
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
      useGameplayStore.getState().setMapFeedback({
        tone: 'error',
        message: t('game.tileLost', { attacker: data.AttackerName, q: data.Q, r: data.R }),
        targetHex: [data.Q, data.R],
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

      useUiStore.getState().setError(localizeLobbyError(message, t));
    },
    onHostMessage: (data) => {
      useNotificationStore.getState().setHostMessage(data);
    },
    onTemplateSaved: () => {
    },
    onReconnected: () => {
      useUiStore.getState().clearError();
      const session = savedSessionRef.current;
      const invoke = getInvoke();
      if (!invoke || !session?.roomCode) {
        return;
      }

      invoke('RejoinRoom', session.roomCode).catch(() => {
        // Silently ignore — the justConnected auto-resume flow also attempts rejoin.
      });
    },
  }), [gameState, getInvoke, playSound, pushToast, resolveResumeFromError, resolveResumeFromState, saveSession, savedSessionRef, t]);
}
