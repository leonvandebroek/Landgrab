import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import type { GameState } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';

interface Props {
  state: GameState;
  onPlayAgain: () => void;
}

const confettiColors = [
  '#f39c12', '#e74c3c', '#2ecc71', '#3498db', '#9b59b6',
  '#1abc9c', '#e67e22', '#f1c40f', '#e84393', '#00cec9',
];

// Pre-computed random confetti styles (module-level to avoid impure render calls)
const confettiStyles = Array.from({ length: 40 }, () => ({
  left: `${Math.random() * 100}%`,
  animationDelay: `${Math.random() * 2}s`,
  animationDuration: `${2 + Math.random() * 3}s`,
  width: `${8 + Math.random() * 6}px`,
  height: `${8 + Math.random() * 6}px`,
}));

const achievementIcons: Record<string, GameIconName> = {
  territoryLeader: 'treasureMap',
  armyCommander: 'contested',
  conqueror: 'crossbow',
  firstStrike: 'lightning',
};

export function GameOver({ state, onPlayAgain }: Props) {
  const { i18n, t } = useTranslation();
  const winnerColor = state.isAllianceVictory
    ? state.alliances.find(a => a.id === state.winnerId)?.color
    : state.players.find(p => p.id === state.winnerId)?.color;

  const totalHexes = Object.values(state.grid).filter(cell => !cell.isMasterTile).length;

  const playerColorMap = new Map(state.players.map(p => [p.id, p.color]));

  return (
    <div className="gameover-page">
      {/* Pure CSS confetti celebration */}
      <div className="confetti-container">
        {confettiStyles.map((style, i) => (
          <div
            key={i}
            className="confetti-piece"
            style={{
              ...style,
              backgroundColor: confettiColors[i % confettiColors.length],
              borderRadius: i % 3 === 0 ? '50%' : '2px',
            }}
          />
        ))}
      </div>

      <div className="gameover-card">
        <div className="trophy"><GameIcon name="trophy" size="lg" /></div>
        <h1
          className="winner-glow"
          style={{ '--winner-color': winnerColor ?? '#f39c12' } as React.CSSProperties}
        >
          {state.winnerName}
        </h1>
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
                  {a.id === state.winnerId && <span className="crown"><GameIcon name="crown" /></span>}
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
                  {p.id === state.winnerId && <span className="crown"><GameIcon name="crown" /></span>}
                </div>
              ))
          }
        </div>

        {state.achievements && state.achievements.length > 0 && (
          <div className="achievements-section" style={{ textAlign: 'left' }}>
            <h3 style={{
              marginBottom: '0.8rem',
              color: 'var(--muted)',
              fontSize: '0.9rem',
              textTransform: 'uppercase',
            }}>
              <GameIcon name="trophy" /> {t('gameover.achievements' as never)}
            </h3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              {state.achievements.map(achievement => {
                const playerColor = playerColorMap.get(achievement.playerId) ?? '#888';
                const icon = achievementIcons[achievement.id] ?? 'trophy';
                return (
                  <div
                    key={achievement.id}
                    style={{
                      background: 'rgba(18, 25, 38, 0.75)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '12px',
                      padding: '0.6rem 0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      borderLeft: `3px solid ${playerColor}`,
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    }}
                  >
                    <span style={{ fontSize: '1.4rem', flexShrink: 0 }}><GameIcon name={icon} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        color: '#fff',
                      }}>
                        {t(achievement.titleKey as never)}
                      </div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: playerColor,
                        fontWeight: 500,
                      }}>
                        {achievement.playerName}
                        {achievement.value && (
                          <span style={{ color: 'var(--muted)', marginLeft: '0.3rem' }}>
                            ({achievement.value})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
