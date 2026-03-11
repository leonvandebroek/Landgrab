import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameEventLogEntry } from '../../types/game';
import { formatGameLogEntry } from './gameLogFormat';

interface Props {
  events: GameEventLogEntry[];
}

export function GameEventLog({ events }: Props) {
  const { i18n, t } = useTranslation();

  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [events]
  );

  return (
    <section className="game-log" aria-labelledby="game-log-title">
      <div className="game-log-header">
        <h4 id="game-log-title">{t('gameLog.title')}</h4>
        <span className="game-log-count">{sortedEvents.length}</span>
      </div>

      {sortedEvents.length === 0 ? (
        <p className="game-log-empty">{t('gameLog.empty')}</p>
      ) : (
        <div className="game-log-list">
          {sortedEvents.map(event => (
            <article
              key={`${event.createdAt}-${event.type}-${event.playerId ?? 'unknown'}-${event.q ?? 'x'}-${event.r ?? 'y'}`}
              className="game-log-item"
            >
              <time className="game-log-time" dateTime={event.createdAt}>
                {formatEventTimestamp(event.createdAt, i18n.resolvedLanguage)}
              </time>
              <p className="game-log-message">{formatGameLogEntry(event, t)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
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
