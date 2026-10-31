import type { TFunction } from 'i18next';
import type { GameDynamics, GameState } from '../types/game';

const DEFAULT_GAME_DYNAMICS: GameDynamics = {
  playerRolesEnabled: false,
  beaconEnabled: false,
  hqEnabled: false,
  hqAutoAssign: true,
  tileDecayEnabled: false,
  fieldBattleEnabled: true,
  enemySightingMemorySeconds: 0,
};

export function getErrorMessage(error: unknown): string {
  let raw: string;

  if (error instanceof Error) {
    raw = error.message;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    raw = (error as { message: string }).message;
  } else {
    raw = String(error);
  }

  if (raw.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'message' in parsed &&
        typeof (parsed as { message: unknown }).message === 'string'
      ) {
        return (parsed as { message: string }).message;
      }
    } catch {
      // Not valid JSON – fall through to return raw
    }
  }

  return raw;
}

export function normalizeGameState(state: GameState, previousState?: GameState | null): GameState {
  const previousEventLog = previousState?.roomCode === state.roomCode && Array.isArray(previousState.eventLog)
    ? previousState.eventLog
    : undefined;

  let normalizedGrid = state.grid;
  if (normalizedGrid) {
    normalizedGrid = Object.fromEntries(
      Object.entries(normalizedGrid).map(([key, cell]) => [
        key,
        { ...cell, visibilityTier: cell.visibilityTier ?? 'Visible' }
      ])
    );
  }

  return {
    ...state,
    grid: normalizedGrid,
    eventLog: Array.isArray(state.eventLog) ? state.eventLog : previousEventLog,
    dynamics: state.dynamics ?? DEFAULT_GAME_DYNAMICS,
  };
}

export function isClearlyStaleJoinFailure(message: string): boolean {
  return message.toLowerCase().includes('room not found');
}

export function isClearlyStaleRejoinFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('no active room')
    || normalized.includes('room not found')
    || normalized.includes('room no longer');
}

export function isMissingRejoinMethodFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('does not exist')
    || normalized.includes('unknown hub method')
    || normalized.includes('method not found')
    || normalized.includes('not implemented');
}

export function isMissingHubMethodFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('method does not exist')
    || normalized.includes('unknown hub method')
    || normalized.includes('method not found')
    || normalized.includes('does not exist');
}

export function localizeLobbyError(message: unknown, t: TFunction): string {
  const text = typeof message === 'string' ? message : getErrorMessage(message);
  const normalized = text.toLowerCase();

  if (normalized.includes('room not found')) {
    return t('lobby.joinErrors.roomNotFound');
  }

  if (normalized.includes('room is full') || normalized.includes('full')) {
    return t('lobby.joinErrors.roomFull');
  }

  if (normalized.includes('already in')) {
    return t('lobby.joinErrors.alreadyInRoom');
  }

  if (normalized.includes('unable to rejoin') || normalized.includes('no active room')) {
    return t('lobby.joinErrors.roomUnavailable');
  }

  if (normalized.includes('not in a room')) {
    return t('lobby.joinErrors.notInRoom');
  }

  return text;
}

export function getPlaceSuccessMessage(
  placeOutcome: 'claim' | 'reinforce' | 'capture' | undefined,
  q: number,
  r: number,
  t: TFunction,
): string {
  switch (placeOutcome) {
    case 'reinforce':
      return t('game.mapFeedback.reinforced', { q, r });
    case 'capture':
      return t('game.mapFeedback.captured', { q, r });
    case 'claim':
    default:
      return t('game.mapFeedback.claimed', { q, r });
  }
}
