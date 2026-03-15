import type { TFunction } from 'i18next';
import type { GameDynamics, GameState } from '../types/game';

const DEFAULT_GAME_DYNAMICS: GameDynamics = {
  activeCopresenceModes: [],
  copresencePreset: null,
  terrainEnabled: false,
  playerRolesEnabled: false,
  fogOfWarEnabled: false,
  supplyLinesEnabled: false,
  hqEnabled: false,
  timedEscalationEnabled: false,
  underdogPactEnabled: false,
  neutralNPCEnabled: false,
  randomEventsEnabled: false,
  missionSystemEnabled: false,
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function normalizeGameState(state: GameState, previousState?: GameState | null): GameState {
  const previousEventLog = previousState?.roomCode === state.roomCode && Array.isArray(previousState.eventLog)
    ? previousState.eventLog
    : undefined;

  return {
    ...state,
    eventLog: Array.isArray(state.eventLog) ? state.eventLog : previousEventLog,
    dynamics: state.dynamics ?? DEFAULT_GAME_DYNAMICS,
  };
}

export function isClearlyStaleJoinFailure(message: string): boolean {
  return message.toLowerCase().includes('room not found');
}

export function isClearlyStaleRejoinFailure(message: string): boolean {
  return message.toLowerCase().includes('no active room');
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
  const text = typeof message === 'string' ? message : JSON.stringify(message);
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
