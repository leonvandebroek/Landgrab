import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameEventLogEntry } from '../../types/game';
import { formatGameLogEntry } from './gameLogFormat';

interface Props {
  events?: GameEventLogEntry[] | null;
}

type GameLogTone = 'neutral' | 'info' | 'setup' | 'action' | 'victory';

export function GameEventLog({ events }: Props) {
  const { i18n, t } = useTranslation();
  const hasEventLog = Array.isArray(events);

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
            return (
              <article
                key={`${event.createdAt}-${event.type}-${event.playerId ?? 'unknown'}-${event.q ?? 'x'}-${event.r ?? 'y'}`}
                className={`game-log-item is-${tone}`}
              >
                <div className={`game-log-icon is-${tone}`} aria-hidden="true">{getGameLogIcon(event.type)}</div>
                <div className="game-log-body">
                  <time className="game-log-time" dateTime={event.createdAt}>
                    {formatEventTimestamp(event.createdAt, i18n.resolvedLanguage)}
                  </time>
                  <p className="game-log-message">{formatGameLogEntry(event, t)}</p>
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

function getGameLogIcon(type: string): string {
  switch (type) {
    case 'PlayerJoined':
      return '➕';
    case 'PlayerLeft':
    case 'PlayerReturnedToLobby':
      return '↩';
    case 'AllianceChanged':
      return '🏷';
    case 'MasterTileAssigned':
      return '👑';
    case 'StartingTileAssigned':
      return '📍';
    case 'TileCaptured':
      return '⚔️';
    case 'GameStarted':
      return '🚀';
    case 'GameOver':
      return '🏆';
    default:
      return '•';
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
