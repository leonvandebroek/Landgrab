import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores';
import './TeamLegend.css';

interface TeamLegendProps {
  myAllianceId?: string;
}

export function TeamLegend({ myAllianceId }: TeamLegendProps) {
  const { t } = useTranslation();
  const alliances = useGameStore((s) => s.gameState?.alliances);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setExpanded(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!alliances || alliances.length < 2) return null;

  return (
    <div className="team-legend-container">
      <button 
        className="team-legend-toggle" 
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        data-testid="legend-toggle"
      >
        {alliances.slice(0, 3).map((a) => (
          <div 
            key={a.id} 
            className="team-legend-dot" 
            style={{ backgroundColor: a.color || '#fff' } as React.CSSProperties} 
          />
        ))}
        {alliances.length > 3 && <span style={{ fontSize: 10, color: '#fff', lineHeight: 1 } as React.CSSProperties}>+</span>}
      </button>

      {expanded && (
        <div className="team-legend-panel" data-testid="legend-panel">
          {alliances.map((a) => {
            const isMe = a.id === myAllianceId;
            return (
              <div key={a.id} className="team-legend-row" data-testid={`legend-row-${a.id}`}>
                <div 
                  className="team-legend-swatch" 
                  style={{ backgroundColor: a.color || '#fff' } as React.CSSProperties} 
                />
                <span className="team-legend-label">
                  {a.name || t('game.legend.enemyTeam')}
                </span>
                {isMe && <span className="team-legend-you">({t('game.legend.yourTeam')})</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}