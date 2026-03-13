import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';

interface HelpOverlayProps {
  dynamics?: GameState['dynamics'];
  onClose: () => void;
}

export function HelpOverlay({ dynamics, onClose }: HelpOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className="hud-modal-sheet open help-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="hud-modal-header">
        <h3>{t('guidance.helpTitle')}</h3>
        <button className="hud-modal-close" onClick={onClose} aria-label={t('game.cancel')}>×</button>
      </div>
      <div className="help-overlay-content">
        <div className="help-section">
          <h4>🗺️ {t('guidance.movementTitle')}</h4>
          <p>{t('guidance.helpMovement')}</p>
        </div>
        
        <div className="help-section">
          <h4>⛳ {t('guidance.claimingTitle')}</h4>
          <p>{t('guidance.helpClaim')}</p>
        </div>

        <div className="help-section">
          <h4>⚔️ {t('guidance.combatTitle')}</h4>
          <p>{t('guidance.helpAttack')}</p>
        </div>

        {dynamics?.terrainEnabled && (
          <div className="help-section">
            <h4>⛰️ {t('guidance.terrainTitle')}</h4>
            <p>{t('guidance.helpTerrain')}</p>
          </div>
        )}

        {dynamics?.fogOfWarEnabled && (
          <div className="help-section">
            <h4>🌫️ {t('guidance.fogOfWarTitle')}</h4>
            <p>{t('guidance.fogOfWarText')}</p>
          </div>
        )}

        {dynamics?.activeCopresenceModes && dynamics.activeCopresenceModes.length > 0 && dynamics.activeCopresenceModes[0] !== 'None' && (
          <div className="help-section">
            <h4>🤝 {t('guidance.copresenceTitle')}</h4>
            <p>{t('guidance.helpCopresence')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
