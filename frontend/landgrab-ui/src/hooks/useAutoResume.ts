import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import type { AuthState, GameState } from '../types/game';
import { useGameStore } from '../stores/gameStore';
import type { SavedSession } from '../stores/gameStore';
import { useGameplayStore } from '../stores/gameplayStore';
import { useUiStore } from '../stores/uiStore';
import {
  getErrorMessage,
  isClearlyStaleJoinFailure,
  isClearlyStaleRejoinFailure,
  isMissingRejoinMethodFailure,
  localizeLobbyError,
} from '../utils/gameHelpers';

const RESUME_TIMEOUT_MS = 5000;

type ResumeSource = 'join' | 'rejoin';

type ResumeOutcome =
  | { status: 'success'; roomCode: string }
  | { status: 'error'; source: ResumeSource; message: string }
  | { status: 'timeout'; source: ResumeSource };

interface PendingResume {
  source: ResumeSource;
  expectedRoomCode?: string;
  resolve: (outcome: ResumeOutcome) => void;
  timeoutId: number;
}

export type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

interface UseAutoResumeOptions {
  auth: AuthState | null;
  t: TFunction;
}

interface UseAutoResumeResult {
  clearSession: () => void;
  handleConnectionChange: (connected: boolean, invoke: SignalRInvoke | null) => (() => void) | void;
  pendingResumeRef: MutableRefObject<unknown | null>;
  resolveResumeFromError: (message: string) => boolean;
  resolveResumeFromState: (state: GameState) => boolean;
  saveSession: (roomCode: string) => void;
  savedSessionRef: MutableRefObject<SavedSession | null>;
}

export function useAutoResume({ auth, t }: UseAutoResumeOptions): UseAutoResumeResult {
  const savedSession = useGameStore(state => state.savedSession);
  const previousConnectedRef = useRef(false);
  const pendingResumeRef = useRef<PendingResume | null>(null);
  const savedSessionRef = useRef<SavedSession | null>(savedSession);
  const resumeSequenceRef = useRef(0);

  useEffect(() => {
    savedSessionRef.current = useGameStore.getState().loadSession();
  }, []);

  useEffect(() => {
    savedSessionRef.current = savedSession;
  }, [savedSession]);

  const saveSession = useCallback((roomCode: string) => {
    if (!auth?.userId) {
      return;
    }

    const normalizedRoomCode = roomCode.trim().toUpperCase();
    if (!normalizedRoomCode) {
      return;
    }

    const nextSession = { roomCode: normalizedRoomCode, userId: auth.userId };
    savedSessionRef.current = nextSession;
    useGameStore.getState().setSavedSession(nextSession);
  }, [auth?.userId]);

  const clearSession = useCallback(() => {
    savedSessionRef.current = null;
    useGameStore.getState().clearSession();
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
        timeoutId,
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
    expectedRoomCode?: string,
  ) => {
    const outcomePromise = beginResumeAttempt(source, expectedRoomCode);

    try {
      await action();
    } catch (cause) {
      clearPendingResume({ status: 'error', source, message: getErrorMessage(cause) });
    }

    return outcomePromise;
  }, [beginResumeAttempt, clearPendingResume]);

  const handleConnectionChange = useCallback((connected: boolean, invoke: SignalRInvoke | null) => {
    const justConnected = connected && !previousConnectedRef.current;
    previousConnectedRef.current = connected;

    if (!justConnected || !auth || !invoke) {
      return;
    }

    const activeSavedSession = savedSessionRef.current;
    if (!activeSavedSession?.roomCode) {
      return;
    }

    let cancelled = false;
    const sequence = ++resumeSequenceRef.current;

    void Promise.resolve().then(async () => {
      if (cancelled || resumeSequenceRef.current !== sequence) {
        return;
      }

      if (activeSavedSession.userId !== auth.userId) {
        clearSession();
        return;
      }

      useGameStore.getState().setAutoResuming(true);
      useUiStore.getState().clearError();

      const rejoinOutcome = await runResumeAction(
        'rejoin',
        () => invoke('RejoinRoom', activeSavedSession.roomCode),
      );
      if (cancelled || resumeSequenceRef.current !== sequence) {
        return;
      }

      if (rejoinOutcome.status === 'success') {
        useGameStore.getState().setAutoResuming(false);
        return;
      }

      const resetToLobby = (message: string) => {
        clearSession();
        useGameStore.getState().setGameState(null);
        useGameplayStore.getState().setPickupPrompt(null);
        useGameplayStore.getState().clearGameplayUi();
        useUiStore.getState().setView('lobby');
        useUiStore.getState().setError(message);
      };

      const fallbackUnavailable = rejoinOutcome.status === 'error'
        && isMissingRejoinMethodFailure(rejoinOutcome.message);

      if (fallbackUnavailable) {
        const joinOutcome = await runResumeAction(
          'join',
          () => invoke('JoinRoom', activeSavedSession.roomCode),
          activeSavedSession.roomCode,
        );
        if (cancelled || resumeSequenceRef.current !== sequence) {
          return;
        }

        if (joinOutcome.status === 'success') {
          useGameStore.getState().setAutoResuming(false);
          return;
        }

        if (joinOutcome.status === 'error' && isClearlyStaleJoinFailure(joinOutcome.message)) {
          resetToLobby(t('errors.roomNoLongerAvailable'));
        } else if (joinOutcome.status === 'error') {
          useUiStore.getState().setError(localizeLobbyError(joinOutcome.message, t));
        } else {
          useUiStore.getState().setError(t('errors.timedOut'));
        }
      } else if (rejoinOutcome.status === 'error' && isClearlyStaleRejoinFailure(rejoinOutcome.message)) {
        resetToLobby(t('errors.roomNoLongerAvailable'));
      } else if (rejoinOutcome.status === 'error') {
        useUiStore.getState().setError(localizeLobbyError(rejoinOutcome.message, t));
      } else {
        useUiStore.getState().setError(t('errors.timedOut'));
      }

      useGameStore.getState().setAutoResuming(false);
    });

    return () => {
      cancelled = true;
      clearPendingResume({ status: 'timeout', source: pendingResumeRef.current?.source ?? 'join' });
      useGameStore.getState().setAutoResuming(false);
    };
  }, [auth, clearPendingResume, clearSession, runResumeAction, t]);

  return useMemo(() => ({
    clearSession,
    handleConnectionChange,
    pendingResumeRef: pendingResumeRef as MutableRefObject<unknown | null>,
    resolveResumeFromError,
    resolveResumeFromState,
    saveSession,
    savedSessionRef,
  }), [clearSession, handleConnectionChange, resolveResumeFromError, resolveResumeFromState, saveSession]);
}
