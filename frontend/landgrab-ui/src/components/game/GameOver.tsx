import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';

interface Props {
  state: GameState;
  onPlayAgain: () => void;
}

export function GameOver({ state, onPlayAgain }: Props) {
  const { i18n, t } = useTranslation();
  const winnerColor = state.isAllianceVictory
    ? state.alliances.find(a => a.id === state.winnerId)?.color
    : state.players.find(p => p.id === state.winnerId)?.color;

  const totalHexes = Object.values(state.grid).filter(cell => !cell.isMasterTile).length;

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
            ? [...state.alliances]
                .sort((a, b) => b.territoryCount - a.territoryCount)
                .map(a => (
                  <div key={a.id} className="score-row final">
                    <span className="score-dot" style={{ background: a.color }} />
                    <span className="score-name">{a.name}</span>
                    <span className="score-count">
                      {t('gameover.hexCount', {
                        count: a.territoryCount,
                        total: totalHexes,
                        percent: formatTerritoryShare(totalHexes > 0 ? (a.territoryCount / totalHexes) * 100 : 0, i18n.resolvedLanguage)
                      })}
                    </span>
                    {a.id === state.winnerId && <span className="crown">👑</span>}
                  </div>
                ))
            : [...state.players]
                .sort((a, b) => b.territoryCount - a.territoryCount)
                .map(p => (
                  <div key={p.id} className="score-row final">
                    <span className="score-dot" style={{ background: p.color }} />
                    <span className="score-name">{p.name}</span>
                    <span className="score-count">
                      {t('gameover.hexCount', {
                        count: p.territoryCount,
                        total: totalHexes,
                        percent: formatTerritoryShare(totalHexes > 0 ? (p.territoryCount / totalHexes) * 100 : 0, i18n.resolvedLanguage)
                      })}
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

function formatTerritoryShare(share: number, language?: string): string {
  if (share <= 0) {
    return '0%';
  }

  const formatter = new Intl.NumberFormat(language, {
    minimumFractionDigits: share < 10 ? 1 : 0,
    maximumFractionDigits: share < 10 ? 1 : 0
  });

  return `${formatter.format(share)}%`;
}
