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
        <h3>{t('guidance.helpTitle', 'How to Play')}</h3>
        <button className="hud-modal-close" onClick={onClose} aria-label={t('game.cancel', 'Close')}>×</button>
      </div>
      <div className="help-overlay-content">
        <div className="help-section">
          <h4>🗺️ {t('guidance.movementTitle', 'Movement')}</h4>
          <p>{t('guidance.movementText', 'Walk around in the real world to move your avatar on the map. Your GPS location determines which tile you are on.')}</p>
        </div>
        
        <div className="help-section">
          <h4>⛳ {t('guidance.claimingTitle', 'Claiming')}</h4>
          <p>{t('guidance.claimingText', 'Stand on an unowned hex and tap it to claim it for yourself or your alliance.')}</p>
        </div>

        <div className="help-section">
          <h4>⚔️ {t('guidance.combatTitle', 'Combat')}</h4>
          <p>{t('guidance.combatText', 'When carrying troops, tap an enemy hex to attack. It is a battle of numbers!')}</p>
        </div>

        {dynamics?.terrainEnabled && (
          <div className="help-section">
            <h4>⛰️ {t('guidance.terrainTitle', 'Terrain')}</h4>
            <p>{t('guidance.terrainText', 'Different terrain types provide defense bonuses or affect movement. Water is impassable.')}</p>
          </div>
        )}

        {dynamics?.fogOfWarEnabled && (
          <div className="help-section">
            <h4>🌫️ {t('guidance.fogOfWarTitle', 'Fog of War')}</h4>
            <p>{t('guidance.fogOfWarText', 'Enemy troop counts are hidden until you are close enough or if they are in forests.')}</p>
          </div>
        )}

        {dynamics?.activeCopresenceModes && dynamics.activeCopresenceModes.length > 0 && dynamics.activeCopresenceModes[0] !== 'None' && (
          <div className="help-section">
            <h4>🤝 {t('guidance.copresenceTitle', 'Player Interaction')}</h4>
            <p>{t('guidance.copresenceText', 'Special interactions happen when multiple players occupy the same or adjacent tiles.')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
