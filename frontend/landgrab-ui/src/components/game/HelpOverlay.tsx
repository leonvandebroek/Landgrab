import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';
import type { CopresenceMode } from '../../types/game';

interface HelpOverlayProps {
  dynamics?: GameState['dynamics'];
  onClose: () => void;
}

const copresenceIcons: Record<CopresenceMode, string> = {
  None: '',
  Standoff: '🚫',
  PresenceBonus: '⚔️',
  Rally: '🛡️',
  Drain: '⚡',
  Beacon: '📡',
  FrontLine: '🎯',
  Shepherd: '🐑',
  CommandoRaid: '🎖️',
};

export function HelpOverlay({ dynamics, onClose }: HelpOverlayProps) {
  const { t } = useTranslation();

  const activeModes = (dynamics?.activeCopresenceModes ?? []).filter(
    (m): m is Exclude<CopresenceMode, 'None'> => m !== 'None',
  );

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

        <div className="help-section">
          <h4>🪖 {t('guidance.troopsTitle' as never, { defaultValue: 'Troops' })}</h4>
          <p>{t('guidance.helpTroops' as never, { defaultValue: 'Pick up troops from your team\'s tiles and carry them in your backpack. Reinforce friendly tiles or use carried troops to attack enemies. You need more troops than the defender to capture a tile.' })}</p>
        </div>

        {activeModes.map((mode) => (
          <div className="help-section" key={mode}>
            <h4>{copresenceIcons[mode]} {t(`dynamics.mode.${mode}.title`)}</h4>
            <p>{t(`dynamics.mode.${mode}.detail`)}</p>
          </div>
        ))}

        {dynamics?.hqEnabled && (
          <div className="help-section">
            <h4>🏛️ {t('dynamics.feature.hq')}</h4>
            <p>{t('dynamics.feature.hqDesc')}</p>
          </div>
        )}

        {dynamics?.supplyLinesEnabled && (
          <div className="help-section">
            <h4>🔗 {t('dynamics.feature.supplyLines')}</h4>
            <p>{t('dynamics.feature.supplyLinesDesc')}</p>
          </div>
        )}

        {dynamics?.playerRolesEnabled && (
          <div className="help-section">
            <h4>🎭 {t('dynamics.feature.playerRoles')}</h4>
            <p>{t('dynamics.feature.playerRolesDesc')}</p>
          </div>
        )}

        {dynamics?.timedEscalationEnabled && (
          <div className="help-section">
            <h4>⏱️ {t('dynamics.feature.timedEscalation')}</h4>
            <p>{t('dynamics.feature.timedEscalationDesc')}</p>
          </div>
        )}

        {dynamics?.underdogPactEnabled && (
          <div className="help-section">
            <h4>💪 {t('dynamics.feature.underdogPact')}</h4>
            <p>{t('dynamics.feature.underdogPactDesc')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
