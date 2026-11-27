import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores';
import type { GameState } from '../../types/game';
import { Icon } from '../ui/Icon';
import { Button, Screen, cx } from '../ui/kit';

interface Props {
  state: GameState;
  /** Back to the home screen. */
  onPlayAgain: () => void;
  /** Back to home and straight into hosting a new room. */
  onHostNew?: () => void;
  myUserId?: string;
}

/** Who won, the final score, your own game and the ranking. */
export function GameOver({ state, onPlayAgain, onHostNew, myUserId }: Props) {
  const { t } = useTranslation();
  const savedId = useGameStore((store) => store.savedSession?.userId);
  const myId = myUserId ?? savedId;
  const me = state.players.find((player) => player.id === myId);

  const claimable = Math.max(1, Object.values(state.grid).filter((cell) => !cell.isMasterTile).length);
  const pct = (tiles: number) => Math.round((tiles / claimable) * 100);

  const teams = useMemo(() => (state.alliances.length > 0
    ? state.alliances.map((alliance) => ({ id: alliance.id, name: alliance.name, color: alliance.color, tiles: alliance.territoryCount }))
    : state.players.map((player) => ({ id: player.id, name: player.name, color: player.color, tiles: player.territoryCount })))
    .sort((a, b) => b.tiles - a.tiles), [state.alliances, state.players]);

  const winnerTeam = teams.find((team) => team.id === state.winnerId);
  const winnerName = state.winnerName ?? winnerTeam?.name ?? '';
  const iWon = state.isAllianceVictory ? me?.allianceId === state.winnerId : myId === state.winnerId;

  const [openedAt] = useState(() => Date.now());
  const minutes = useMemo(() => {
    if (!state.gameStartedAt) return null;
    const end = state.eventLog?.find((event) => event.type === 'GameOver')?.createdAt;
    const endMs = end ? Date.parse(end) : openedAt;
    return Math.max(1, Math.round((endMs - Date.parse(state.gameStartedAt)) / 60000));
  }, [openedAt, state.eventLog, state.gameStartedAt]);

  const reason = state.winConditionType === 'TimedGame'
    ? t('ui.over.reasonTime')
    : state.winConditionType === 'Elimination'
      ? t('ui.over.reasonElimination')
      : t('ui.over.reasonTerritory', { pct: state.winConditionValue });

  const attacksWon = (state.eventLog ?? []).filter((event) => event.type === 'TileCaptured' && event.playerId === myId).length;
  const ranking = [...state.players].sort((a, b) => b.territoryCount - a.territoryCount);

  return (
    <Screen
      testId="game-over"
      footer={(
        <div className="lg-actions">
          {onHostNew && <Button onClick={onHostNew} testId="gameover-host-new">{t('ui.over.hostNew')}</Button>}
          <Button variant={onHostNew ? 'secondary' : 'primary'} onClick={onPlayAgain} testId="gameover-home">{t('ui.over.backHome')}</Button>
        </div>
      )}
    >
      <div className="lg-over__hero">
        <div className="lg-over__trophy" style={winnerTeam ? { background: winnerTeam.color } : undefined}>
          <Icon name="trophy" size={36} />
        </div>
        <span className="lg-eyebrow">{t('ui.over.kicker')}</span>
        <h1 className="lg-over__title">{iWon ? t('ui.over.youWin', { name: winnerName }) : t('ui.over.wins', { name: winnerName })}</h1>
        <p className="lg-muted">
          {minutes != null ? t('ui.over.after', { reason, count: minutes }) : reason}
        </p>
      </div>

      <div className="lg-card lg-stack lg-stack--sm">
        {teams.slice(0, 4).map((team) => (
          <div key={team.id} className="lg-stack lg-stack--sm">
            <div className="lg-row lg-row--between">
              <span className="lg-row"><span className="lg-dot" style={{ background: team.color }} />{team.name}</span>
              <strong>{pct(team.tiles)}%</strong>
            </div>
            <div className="lg-score__bar"><span className="lg-score__fill" style={{ width: `${pct(team.tiles)}%`, background: team.color }} /></div>
          </div>
        ))}
      </div>

      {me && (
        <section className="lg-stack lg-stack--sm">
          <h2 className="lg-h3">{t('ui.over.yourGame')}</h2>
          <div className="lg-stats">
            <div className="lg-stat"><span className="lg-stat__num">{me.territoryCount}</span><span className="lg-stat__label">{t('ui.over.tilesHeld')}</span></div>
            <div className="lg-stat"><span className="lg-stat__num">{attacksWon}</span><span className="lg-stat__label">{t('ui.over.attacksWon')}</span></div>
            <div className="lg-stat"><span className="lg-stat__num">{minutes ?? '–'}</span><span className="lg-stat__label">{t('ui.over.minutes')}</span></div>
          </div>
        </section>
      )}

      {(state.achievements?.length ?? 0) > 0 && (
        <section className="lg-stack lg-stack--sm">
          <h2 className="lg-h3">{t('ui.over.awards')}</h2>
          {state.achievements!.map((achievement) => (
            <div key={achievement.id} className="lg-scorerow">
              <span className="lg-scorerow__name">{t(achievement.titleKey as never)}</span>
              <span className="lg-scorerow__tiles">{achievement.playerName}{achievement.value ? ` · ${achievement.value}` : ''}</span>
            </div>
          ))}
        </section>
      )}

      <section className="lg-stack lg-stack--sm">
        <h2 className="lg-h3">{t('ui.over.ranking')}</h2>
        {ranking.map((player, index) => (
          <div key={player.id} className={cx('lg-scorerow', player.id === myId && 'is-me')}>
            <span className="lg-scorerow__name">
              {index + 1}. {player.name}{player.id === myId ? ` ${t('ui.menu.youSuffix')}` : ''}
            </span>
            <span className="lg-scorerow__tiles">{t('ui.play.tiles', { count: player.territoryCount })}</span>
          </div>
        ))}
      </section>
    </Screen>
  );
}
