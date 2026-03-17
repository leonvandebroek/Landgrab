import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import type { GameEventLogEntry, Player } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';
import { formatGameLogEntry } from './gameLogFormat';

interface Props {
  events?: GameEventLogEntry[] | null;
  players?: Player[];
}

type GameLogTone = 'neutral' | 'info' | 'setup' | 'action' | 'victory';

export function GameEventLog({ events, players }: Props) {
  const { i18n, t } = useTranslation();
  const hasEventLog = Array.isArray(events);
  const playerDirectory = useMemo(() => players ?? [], [players]);

  const sortedEvents = useMemo(
    () => (Array.isArray(events) ? [...events] : []).sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    ),
    [events]
  );

  return (
    <section className="game-log" aria-labelledby="game-log-title">
      <div className="game-log-header">
        <h4 id="game-log-title">{t('gameLog.title')}</h4>
        <span className="game-log-count">{hasEventLog ? sortedEvents.length : '—'}</span>
      </div>

      {!hasEventLog ? (
        <p className="game-log-empty">{t('gameLog.unavailable')}</p>
      ) : sortedEvents.length === 0 ? (
        <p className="game-log-empty">{t('gameLog.empty')}</p>
      ) : (
        <div className="game-log-list">
          {sortedEvents.map(event => {
            const tone = getGameLogTone(event.type);
            const playerName = formatPlayerLabel(
              resolvePlayer(playerDirectory, event.playerId, event.playerName),
              event.playerName,
            );
            const targetPlayerName = formatPlayerLabel(
              resolvePlayer(playerDirectory, event.targetPlayerId, event.targetPlayerName),
              event.targetPlayerName,
            );
            const winnerName = formatPlayerLabel(
              resolvePlayer(playerDirectory, event.winnerId, event.winnerName),
              event.winnerName,
            );

            return (
              <article
                key={`${event.createdAt}-${event.type}-${event.playerId ?? 'unknown'}-${event.q ?? 'x'}-${event.r ?? 'y'}`}
                className={`game-log-item is-${tone}`}
              >
                <div className={`game-log-icon is-${tone}`} aria-hidden="true"><GameIcon name={getGameLogIcon(event.type)} size="sm" /></div>
                <div className="game-log-body">
                  <time className="game-log-time" dateTime={event.createdAt}>
                    {formatEventTimestamp(event.createdAt, i18n.resolvedLanguage)}
                  </time>
                  <p className="game-log-message">{formatGameLogEntry(event, t, {
                    playerName,
                    targetPlayerName,
                    winnerName,
                  })}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getGameLogTone(type: string): GameLogTone {
  switch (type) {
    case 'PlayerJoined':
    case 'PlayerLeft':
    case 'PlayerReturnedToLobby':
    case 'AllianceChanged':
      return 'info';
    case 'MasterTileAssigned':
    case 'StartingTileAssigned':
      return 'setup';
    case 'TileCaptured':
      return 'action';
    case 'GameStarted':
    case 'GameOver':
      return 'victory';
    default:
      return 'neutral';
  }
}

function getGameLogIcon(type: string): GameIconName {
  switch (type) {
    case 'PlayerJoined':
      return 'shinyEntrance';
    case 'PlayerLeft':
    case 'PlayerReturnedToLobby':
      return 'returnArrow';
    case 'AllianceChanged':
      return 'priceTag';
    case 'MasterTileAssigned':
      return 'crown';
    case 'StartingTileAssigned':
      return 'pin';
    case 'TileCaptured':
      return 'contested';
    case 'GameStarted':
      return 'rocket';
    case 'GameOver':
      return 'trophy';
    default:
      return 'pin';
  }
}

function formatEventTimestamp(createdAt: string, language?: string): string {
  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp)) {
    return createdAt;
  }

  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
}

function resolvePlayer(players: Player[], playerId?: string, playerName?: string): Player | undefined {
  if (playerId) {
    const playerById = players.find(player => player.id === playerId);
    if (playerById) {
      return playerById;
    }
  }

  if (playerName) {
    const normalizedName = playerName.trim().toLocaleLowerCase();
    return players.find(player => player.name.trim().toLocaleLowerCase() === normalizedName);
  }

  return undefined;
}

function formatPlayerLabel(player: Player | undefined, fallbackName?: string): string | undefined {
  const name = fallbackName?.trim() || player?.name?.trim();
  if (!name) {
    return undefined;
  }

  const emoji = player?.emoji?.trim();
  return emoji ? `${emoji} ${name}` : name;
}
