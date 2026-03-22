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
    case 'CombatRepelled':
      return t('gameLog.events.CombatRepelled', {
        playerName,
        targetPlayerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'HQCaptured':
      return t('gameLog.events.HQCaptured', {
        playerName,
        allianceName: event.allianceName ?? t('gameLog.unknownAlliance'),
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'CommandoRaidSuccess':
      return t('gameLog.events.CommandoRaidSuccess', {
        allianceName: event.allianceName ?? t('gameLog.unknownAlliance'),
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'CommandoRaidFailed':
      return t('gameLog.events.CommandoRaidFailed', {
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'RallyPointResolved':
      return t('gameLog.events.RallyPointResolved', {
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'FortConstructionInvalidated':
      return t('gameLog.events.FortConstructionInvalidated', { playerName });
    case 'FortBuilt':
      return t('gameLog.events.FortBuilt', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'SabotageInvalidated':
      return t('gameLog.events.SabotageInvalidated', { playerName });
    case 'SabotageComplete':
      return t('gameLog.events.SabotageComplete', {
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'DemolishInvalidated':
      return t('gameLog.events.DemolishInvalidated', { playerName });
    case 'DemolishCompleted':
      return t('gameLog.events.DemolishCompleted', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'GameAreaUpdated':
      return t('gameLog.events.GameAreaUpdated');
    case 'AlliancesConfigured':
      return t('gameLog.events.AlliancesConfigured');
    case 'PlayersDistributed':
      return t('gameLog.events.PlayersDistributed');
    case 'AllianceStartingTileAssigned':
      return t('gameLog.events.AllianceStartingTileAssigned', {
        allianceName: event.allianceName ?? t('gameLog.unknownAlliance'),
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'AllianceHQAssigned':
      return t('gameLog.events.AllianceHQAssigned', {
        allianceName: event.allianceName ?? t('gameLog.unknownAlliance'),
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'AllianceHQAutoAssigned':
      return t('gameLog.events.AllianceHQAutoAssigned', {
        allianceName: event.allianceName ?? t('gameLog.unknownAlliance'),
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'BeaconActivated':
      return t('gameLog.events.BeaconActivated', { playerName });
    case 'CommandoRaidStarted':
      return t('gameLog.events.CommandoRaidStarted', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'TacticalStrikeActivated':
      return t('gameLog.events.TacticalStrikeActivated', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'RallyPointActivated':
      return t('gameLog.events.RallyPointActivated', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'FortConstructionStarted':
      return t('gameLog.events.FortConstructionStarted', {
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'FortConstructionCancelled':
      return t('gameLog.events.FortConstructionCancelled', { playerName });
    case 'SabotageStarted':
      return t('gameLog.events.SabotageStarted', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'SabotageCancelled':
      return t('gameLog.events.SabotageCancelled', { playerName });
    case 'DemolishStarted':
      return t('gameLog.events.DemolishStarted', {
        playerName,
        q: event.q ?? '?',
        r: event.r ?? '?'
      });
    case 'DemolishCancelled':
      return t('gameLog.events.DemolishCancelled', { playerName });
    case 'HostAction':
    case 'RandomEvent':
    case 'HostMessage':
      return event.message || t('gameLog.events.Unknown');
    
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
