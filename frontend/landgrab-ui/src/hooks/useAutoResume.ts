import { useCallback, useEffect, useRef } from 'react';
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

export interface PendingResume {
  source: ResumeSource;
  expectedRoomCode?: string;
  resolve: (outcome: ResumeOutcome) => void;
  timeoutId: number;
}

type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

interface UseAutoResumeOptions {
  auth: AuthState | null;
  /** Reactive connection flag returned by useSignalR. */
  connected: boolean;
  /** Stable invoke function returned by useSignalR. */
  invoke: SignalRInvoke;
  t: TFunction;
  /**
   * Ref created in App and shared with useSignalRHandlers.
   * useAutoResume owns syncing its `.current` value and updating it through
   * saveSession / clearSession so both hooks always see the same session.
   */
  savedSessionRef: MutableRefObject<SavedSession | null>;
}

export interface UseAutoResumeResult {
  saveSession: (roomCode: string) => void;
  clearSession: () => void;
  resolveResumeFromState: (state: GameState) => boolean;
  resolveResumeFromError: (message: string) => boolean;
  /** Exposed for useGameActions which checks whether a resume is pending. */
  pendingResumeRef: MutableRefObject<PendingResume | null>;
}

/**
 * Encapsulates all saved-session management and auto-resume sequencing.
 *
 * Call order in App must be:
 *   1. Create `savedSessionRef` (useRef) in App so it can be shared with
 *      useSignalRHandlers before useAutoResume is called.
 *   2. Call useSignalRHandlers / useSignalR to obtain `connected` and `invoke`.
 *   3. Call useAutoResume with those reactive values.
 *   4. Populate the stable-wrapper ref so useSignalRHandlers delegates to the
 *      real callbacks returned here.
 */
export function useAutoResume({
  auth,
  connected,
  invoke,
  t,
  savedSessionRef,
}: UseAutoResumeOptions): UseAutoResumeResult {
  // Store reads – all Zustand action selectors are stable references.
  const savedSession = useGameStore(state => state.savedSession);
  const setGameState = useGameStore(state => state.setGameState);
  const setAutoResuming = useGameStore(state => state.setAutoResuming);
  const setPickupPrompt = useGameplayStore(state => state.setPickupPrompt);
  const clearGameplayUi = useGameplayStore(state => state.clearGameplayUi);
  const setView = useUiStore(state => state.setView);
  const setError = useUiStore(state => state.setError);
  const clearError = useUiStore(state => state.clearError);

  // Resume-lifecycle refs – fully owned by this hook.
  const pendingResumeRef = useRef<PendingResume | null>(null);
  const resumeSequenceRef = useRef(0);
  const previousConnectedRef = useRef(false);

  // Keep the shared savedSessionRef in sync whenever the store value changes.
  // This covers external updates (e.g. store hydration) that bypass saveSession.
  useEffect(() => {
    savedSessionRef.current = savedSession;
  }, [savedSession, savedSessionRef]);

  // ── Session helpers ──────────────────────────────────────────────────────

  const saveSession = useCallback(
    (roomCode: string) => {
      if (!auth?.userId) return;
      const normalizedRoomCode = roomCode.trim().toUpperCase();
      if (!normalizedRoomCode) return;
      const next: SavedSession = { roomCode: normalizedRoomCode, userId: auth.userId };
      savedSessionRef.current = next;
      useGameStore.getState().setSavedSession(next);
    },
    [auth?.userId, savedSessionRef],
  );

  const clearSession = useCallback(() => {
    savedSessionRef.current = null;
    useGameStore.getState().clearSession();
  }, [savedSessionRef]);

  // ── Pending-promise helpers ──────────────────────────────────────────────

  const clearPendingResume = useCallback((outcome?: ResumeOutcome) => {
    const pending = pendingResumeRef.current;
    if (!pending) return false;
    window.clearTimeout(pending.timeoutId);
    pendingResumeRef.current = null;
    if (outcome) pending.resolve(outcome);
    return true;
  }, []);

  const beginResumeAttempt = useCallback(
    (source: ResumeSource, expectedRoomCode?: string) => {
      clearPendingResume();
      return new Promise<ResumeOutcome>(resolve => {
        const timeoutId = window.setTimeout(() => {
          if (pendingResumeRef.current?.resolve === resolve) {
            pendingResumeRef.current = null;
            resolve({ status: 'timeout', source });
          }
        }, RESUME_TIMEOUT_MS);
        pendingResumeRef.current = { source, expectedRoomCode, resolve, timeoutId };
      });
    },
    [clearPendingResume],
  );

  const resolveResumeFromState = useCallback(
    (state: GameState) => {
      const pending = pendingResumeRef.current;
      if (!pending || !state.roomCode) return false;
      if (pending.expectedRoomCode && state.roomCode !== pending.expectedRoomCode) return false;
      return clearPendingResume({ status: 'success', roomCode: state.roomCode });
    },
    [clearPendingResume],
  );

  const resolveResumeFromError = useCallback(
    (message: string) => {
      const pending = pendingResumeRef.current;
      if (!pending) return false;
      return clearPendingResume({ status: 'error', source: pending.source, message });
    },
    [clearPendingResume],
  );

  const runResumeAction = useCallback(
    async (
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
    },
    [beginResumeAttempt, clearPendingResume],
  );

  // ── Connection-triggered auto-resume ────────────────────────────────────
  // Fires whenever SignalR transitions from disconnected → connected and a
  // saved session room code exists.  Mirrors the original effect in App exactly.
  useEffect(() => {
    const justConnected = connected && !previousConnectedRef.current;
    previousConnectedRef.current = connected;

    if (!justConnected || !auth) return;

    const session = savedSessionRef.current;
    if (!session?.roomCode) return;

    let cancelled = false;
    const sequence = ++resumeSequenceRef.current;

    void Promise.resolve().then(async () => {
      if (cancelled || resumeSequenceRef.current !== sequence) return;

      if (session.userId !== auth.userId) {
        clearSession();
        return;
      }

      setAutoResuming(true);
      clearError();

      const rejoinOutcome = await runResumeAction(
        'rejoin',
        () => invoke('RejoinRoom', session.roomCode),
      );
      if (cancelled || resumeSequenceRef.current !== sequence) return;

      if (rejoinOutcome.status === 'success') {
        setAutoResuming(false);
        return;
      }

      const fallbackUnavailable =
        rejoinOutcome.status === 'error' &&
        isMissingRejoinMethodFailure(rejoinOutcome.message);

      if (fallbackUnavailable) {
        const joinOutcome = await runResumeAction(
          'join',
          () => invoke('JoinRoom', session.roomCode),
          session.roomCode,
        );
        if (cancelled || resumeSequenceRef.current !== sequence) return;

        if (joinOutcome.status === 'success') {
          setAutoResuming(false);
          return;
        }

        const joinClearlyStale =
          joinOutcome.status === 'error' && isClearlyStaleJoinFailure(joinOutcome.message);

        if (joinClearlyStale) {
          clearSession();
          setGameState(null);
          setPickupPrompt(null);
          clearGameplayUi();
          setView('lobby');
          setError(t('errors.roomNoLongerAvailable'));
        } else if (joinOutcome.status === 'error') {
          setError(localizeLobbyError(joinOutcome.message, t));
        } else {
          setError(t('errors.timedOut'));
        }
      } else if (
        rejoinOutcome.status === 'error' &&
        isClearlyStaleRejoinFailure(rejoinOutcome.message)
      ) {
        clearSession();
        setGameState(null);
        setPickupPrompt(null);
        clearGameplayUi();
        setView('lobby');
        setError(t('errors.roomNoLongerAvailable'));
      } else if (rejoinOutcome.status === 'error') {
        setError(localizeLobbyError(rejoinOutcome.message, t));
      } else {
        setError(t('errors.timedOut'));
      }

      setAutoResuming(false);
    });

    return () => {
      cancelled = true;
      clearPendingResume({
        status: 'timeout',
        source: pendingResumeRef.current?.source ?? 'join',
      });
      setAutoResuming(false);
    };
  }, [auth, clearGameplayUi, clearPendingResume, clearSession, connected, invoke, runResumeAction, t]);

  return {
    saveSession,
    clearSession,
    resolveResumeFromState,
    resolveResumeFromError,
    pendingResumeRef,
  };
}
