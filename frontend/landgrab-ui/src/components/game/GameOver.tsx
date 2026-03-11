import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';

interface Props {
  state: GameState;
  onPlayAgain: () => void;
}

export function GameOver({ state, onPlayAgain }: Props) {
  const { t } = useTranslation();
  const winnerColor = state.isAllianceVictory
    ? state.alliances.find(a => a.id === state.winnerId)?.color
    : state.players.find(p => p.id === state.winnerId)?.color;

  const totalHexes = Object.keys(state.grid).length;

  return (
    <div className="gameover-page">
      <div className="gameover-card">
        <div className="trophy">🏆</div>
        <h1>{state.winnerName}</h1>
        <p className="subtitle" style={{ color: winnerColor }}>
          {state.isAllianceVictory ? t('gameover.allianceVictory') : t('gameover.playerVictory')}
        </p>

        <div className="final-scores">
          <h3>{t('gameover.finalScores')}</h3>
          {state.isAllianceVictory
            ? state.alliances
                .sort((a, b) => b.territoryCount - a.territoryCount)
                .map(a => (
                  <div key={a.id} className="score-row final">
                    <span className="score-dot" style={{ background: a.color }} />
                    <span>{a.name}</span>
                    <span className="score-count">
                      {t('gameover.hexCount', { count: a.territoryCount, percent: Math.round(a.territoryCount / totalHexes * 100) })}
                    </span>
                    {a.id === state.winnerId && <span className="crown">👑</span>}
                  </div>
                ))
            : state.players
                .sort((a, b) => b.territoryCount - a.territoryCount)
                .map(p => (
                  <div key={p.id} className="score-row final">
                    <span className="score-dot" style={{ background: p.color }} />
                    <span>{p.name}</span>
                    <span className="score-count">
                      {t('gameover.hexCount', { count: p.territoryCount, percent: Math.round(p.territoryCount / totalHexes * 100) })}
                    </span>
                    {p.id === state.winnerId && <span className="crown">👑</span>}
                  </div>
                ))
          }
        </div>

        <button className="btn-primary big" onClick={onPlayAgain}>
          {t('gameover.playAgain')}
        </button>
      </div>
    </div>
  );
}
