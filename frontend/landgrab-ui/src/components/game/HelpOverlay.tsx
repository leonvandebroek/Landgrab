import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import type { GameState } from '../../types/game';

interface HelpOverlayProps {
  dynamics?: GameState['dynamics'];
  onClose: () => void;
}

export function HelpOverlay({ dynamics, onClose }: HelpOverlayProps) {
  const { t } = useTranslation();
  const beaconItems = [
    t('guidance.helpBeaconBullet1'),
    t('guidance.helpBeaconBullet2'),
    t('guidance.helpBeaconBullet3'),
    t('guidance.helpBeaconBullet4'),
  ];

  return (
    <div className="hud-modal-sheet open help-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="hud-modal-header">
        <h3>{t('guidance.helpTitle')}</h3>
        <button className="hud-modal-close" onClick={onClose} aria-label={t('game.cancel')}>×</button>
      </div>
      <div className="help-overlay-content">
        <div className="help-section">
          <h4><GameIcon name="treasureMap" /> {t('guidance.movementTitle')}</h4>
          <p>{t('guidance.helpMovement')}</p>
        </div>

        <div className="help-section">
          <h4><GameIcon name="flag" /> {t('guidance.claimingTitle')}</h4>
          <p>{t('guidance.helpClaim')}</p>
        </div>

        <div className="help-section">
          <h4><GameIcon name="contested" /> {t('guidance.combatTitle')}</h4>
          <p>{t('guidance.helpAttack')}</p>
        </div>

        <div className="help-section">
          <h4><GameIcon name="contested" /> {t('guidance.contestedZonesTitle' as never, { defaultValue: 'Contested Zones' })}</h4>
          <p>{t('guidance.contestedZonesText' as never, { defaultValue: 'Red circles mark hexes that border enemy territory. These are frontline zones where combat can occur.' })}</p>
        </div>

        <div className="help-section">
          <h4><GameIcon name="helmet" /> {t('guidance.troopsTitle' as never, { defaultValue: 'Troops' })}</h4>
          <p>{t('guidance.helpTroops' as never, { defaultValue: 'Pick up troops from your team\'s tiles and carry them in your backpack. Reinforce friendly tiles or use carried troops to attack enemies. You need more troops than the defender to capture a tile.' })}</p>
        </div>

        {dynamics?.beaconEnabled && (
          <div className="help-section">
            <h4><GameIcon name="radioTower" /> {t('guidance.beaconTitle')}</h4>
            <p>{t('guidance.helpBeaconLegend' as never, { defaultValue: "Beacons extend your team's claiming range. In Adjacency Required mode, a teammate's beacon lets allies claim hexes within 2 hexes of the beacon, even without bordering territory. The beacon holder must stay within 1 hex of the beacon location." })}</p>
            <p className="help-section-intro">{t('guidance.helpBeaconIntro')}</p>
            <ul className="help-list">
              {beaconItems.map((item) => (
                <li key={item} className="help-list-item">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {dynamics?.hqEnabled && (
          <div className="help-section">
            <h4><GameIcon name="hq" /> {t('guidance.hqLegendTitle' as never, { defaultValue: 'HQ' })}</h4>
            <p>{t('guidance.hqLegendText' as never, { defaultValue: "Your alliance's headquarters. When enabled, HQ must be assigned in the lobby. Supply lines connect to HQ - disconnected territory may not regenerate troops. If your HQ is captured, claiming is temporarily frozen!" })}</p>
          </div>
        )}

        {dynamics?.tileDecayEnabled && (
          <div className="help-section">
            <h4><GameIcon name="hourglass" /> {t('dynamics.feature.tileDecayEnabled')}</h4>
            <p>{t('dynamics.feature.tileDecayEnabledDesc')}</p>
          </div>
        )}

        {dynamics?.playerRolesEnabled && (
          <div className="help-section">
            <h4><GameIcon name="theater" /> {t('dynamics.feature.playerRoles')}</h4>
            <p>{t('dynamics.feature.playerRolesDesc')}</p>
          </div>
        )}

      </div>
    </div>
  );
}
