import type { TFunction } from 'i18next';
import type { GameEventLogEntry } from '../../types/game';

export function formatGameLogEntry(event: GameEventLogEntry, t: TFunction): string {
  switch (event.type) {
    case 'PlayerJoined':
      return t('gameLog.events.PlayerJoined', {
        playerName: event.playerName ?? t('gameLog.unknownPlayer')
      });
    case 'PlayerLeft':
      return t('gameLog.events.PlayerLeft', {
        playerName: event.playerName ?? t('gameLog.unknownPlayer')
      });
    case 'PlayerReturnedToLobby':
      return t('gameLog.events.PlayerReturnedToLobby', {
        playerName: event.playerName ?? t('gameLog.unknownPlayer')
      });
    case 'AllianceChanged':
      return t('gameLog.events.AllianceChanged', {
        playerName: event.playerName ?? t('gameLog.unknownPlayer'),
        allianceName: event.allianceName ?? t('gameLog.unknownAlliance')
      });
    case 'MasterTileAssigned':
      return t('gameLog.events.MasterTileAssigned', {
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'StartingTileAssigned':
      return t('gameLog.events.StartingTileAssigned', {
        targetPlayerName: event.targetPlayerName ?? t('gameLog.unknownPlayer'),
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'TileCaptured':
      if (event.targetPlayerName) {
        return t('gameLog.events.TileCapturedFrom', {
          playerName: event.playerName ?? t('gameLog.unknownPlayer'),
          targetPlayerName: event.targetPlayerName,
          q: event.q ?? '?',
          r: event.r ?? '?'
        });
      }

      return t('gameLog.events.TileCaptured', {
        playerName: event.playerName ?? t('gameLog.unknownPlayer'),
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'GameStarted':
      return t('gameLog.events.GameStarted');
    case 'GameOver':
      if (event.winnerName) {
        return event.isAllianceVictory
          ? t('gameLog.events.GameOverAlliance', { winnerName: event.winnerName })
          : t('gameLog.events.GameOverPlayer', { winnerName: event.winnerName });
      }

      return t('gameLog.events.GameOver');
    default:
      return event.message || t('gameLog.events.Unknown');
  }
}
