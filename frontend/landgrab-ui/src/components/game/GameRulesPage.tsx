import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';

interface GameRulesPageProps {
  gameState: GameState;
  onContinue: () => void;
  isModal?: boolean;
}

export function GameRulesPage({ gameState, onContinue, isModal = false }: GameRulesPageProps) {
  const { t } = useTranslation();
  const d = gameState.dynamics;

  const content = (
    <div className="rules-content">
      {!isModal && <h2 className="rules-main-title">{t('rules.title')}</h2>}

      <div className="rules-section">
        <h3 className="rules-section-title">🗺️ {t('rules.overview.title')}</h3>
        <p className="rules-section-body">{t('rules.overview.body')}</p>
      </div>

      <div className="rules-section">
        <h3 className="rules-section-title">🚩 {t('rules.claiming.title')}</h3>
        <p className="rules-section-body">
          {gameState.claimMode === 'PresenceOnly' && t('rules.claiming.presenceOnly')}
          {gameState.claimMode === 'PresenceWithTroop' && t('rules.claiming.presenceWithTroop')}
          {gameState.claimMode === 'AdjacencyRequired' && t('rules.claiming.adjacencyRequired')}
        </p>
      </div>

      <div className="rules-section">
        <h3 className="rules-section-title">⚔️ {t('rules.combat.title')}</h3>
        <p className="rules-section-body">{t('rules.combat.body')}</p>
      </div>

      <div className="rules-section">
        <h3 className="rules-section-title">🏆 {t('rules.winCondition.title')}</h3>
        <p className="rules-section-body">
          {gameState.winConditionType === 'TerritoryPercent' && t('rules.winCondition.territoryPercent', { value: gameState.winConditionValue })}
          {gameState.winConditionType === 'Elimination' && t('rules.winCondition.elimination')}
          {gameState.winConditionType === 'TimedGame' && t('rules.winCondition.timedGame', { value: gameState.winConditionValue })}
        </p>
      </div>

      {d?.terrainEnabled && (
        <div className="rules-section">
          <h3 className="rules-section-title">🌲 {t('rules.terrain.title')}</h3>
          <p className="rules-section-body">{t('rules.terrain.body')}</p>
        </div>
      )}

      {d?.fogOfWarEnabled && (
        <div className="rules-section">
          <h3 className="rules-section-title">🌫️ {t('rules.fogOfWar.title')}</h3>
          <p className="rules-section-body">{t('rules.fogOfWar.body')}</p>
        </div>
      )}

      {d?.supplyLinesEnabled && (
        <div className="rules-section">
          <h3 className="rules-section-title">📦 {t('rules.supplyLines.title')}</h3>
          <p className="rules-section-body">{t('rules.supplyLines.body')}</p>
        </div>
      )}

      {d?.hqEnabled && (
        <div className="rules-section">
          <h3 className="rules-section-title">🏰 {t('rules.hq.title')}</h3>
          <p className="rules-section-body">{t('rules.hq.body')}</p>
        </div>
      )}

      {d?.playerRolesEnabled && (
        <div className="rules-section">
          <h3 className="rules-section-title">🎭 {t('rules.roles.title')}</h3>
          <p className="rules-section-body">{t('rules.roles.body')}</p>
        </div>
      )}

      {d?.activeCopresenceModes && d.activeCopresenceModes.length > 0 && !d.activeCopresenceModes.includes('None') && (
        <div className="rules-section">
          <h3 className="rules-section-title">👥 {t('rules.copresence.title')}</h3>
          <p className="rules-section-body">{t('rules.copresence.body')}</p>
        </div>
      )}

      {d?.timedEscalationEnabled && (
        <div className="rules-section">
          <h3 className="rules-section-title">⏱️ {t('rules.timedEscalation.title')}</h3>
          <p className="rules-section-body">{t('rules.timedEscalation.body')}</p>
        </div>
      )}

      {d?.underdogPactEnabled && (
        <div className="rules-section">
          <h3 className="rules-section-title">🤝 {t('rules.underdogPact.title')}</h3>
          <p className="rules-section-body">{t('rules.underdogPact.body')}</p>
        </div>
      )}

      {!isModal && <div className="rules-spacer" />}
    </div>
  );

  if (isModal) {
    return (
      <div className="hud-modal-sheet open rules-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="hud-modal-header">
          <h3>{t('rules.title')}</h3>
          <button className="hud-modal-close" onClick={onContinue}>×</button>
        </div>
        <div className="hud-modal-content rules-scroll-area">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="rules-page-container">
      {content}
      <div className="rules-sticky-footer">
        <button className="btn-primary big rules-play-btn" onClick={onContinue}>
          {t('rules.letsPlay')}
        </button>
      </div>
    </div>
  );
}
