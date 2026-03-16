import type { TFunction } from 'i18next';
import type { GameEventLogEntry } from '../../types/game';

interface GameLogPlayerNameOverrides {
  playerName?: string;
  targetPlayerName?: string;
  winnerName?: string;
}

export function formatGameLogEntry(
  event: GameEventLogEntry,
  t: TFunction,
  overrides: GameLogPlayerNameOverrides = {},
): string {
  const playerName = overrides.playerName ?? event.playerName ?? t('gameLog.unknownPlayer');
  const targetPlayerName = overrides.targetPlayerName ?? event.targetPlayerName ?? t('gameLog.unknownPlayer');
  const winnerName = overrides.winnerName ?? event.winnerName;

  switch (event.type) {
    case 'PlayerJoined':
      return t('gameLog.events.PlayerJoined', { playerName });
    case 'PlayerLeft':
      return t('gameLog.events.PlayerLeft', { playerName });
    case 'PlayerReturnedToLobby':
      return t('gameLog.events.PlayerReturnedToLobby', { playerName });
    case 'AllianceChanged':
      return t('gameLog.events.AllianceChanged', {
        playerName,
        allianceName: event.allianceName ?? t('gameLog.unknownAlliance')
      });
    case 'MasterTileAssigned':
      return t('gameLog.events.MasterTileAssigned', {
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'StartingTileAssigned':
      return t('gameLog.events.StartingTileAssigned', {
        targetPlayerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'TileCaptured':
      if (event.targetPlayerName) {
        return t('gameLog.events.TileCapturedFrom', {
          playerName,
          targetPlayerName,
          q: event.q ?? '?',
          r: event.r ?? '?'
        });
      }

      return t('gameLog.events.TileCaptured', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'GameStarted':
      return t('gameLog.events.GameStarted');
    case 'GameOver':
      if (winnerName) {
        return event.isAllianceVictory
          ? t('gameLog.events.GameOverAlliance', { winnerName })
          : t('gameLog.events.GameOverPlayer', { winnerName });
      }

      return t('gameLog.events.GameOver');
    default:
      return event.message || t('gameLog.events.Unknown');
  }
}
