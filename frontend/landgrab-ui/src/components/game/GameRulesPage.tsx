import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import { ROLE_CARDS, type RoleModalRole } from '../lobby/roleModalUtils';
import type { GameState } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';

interface GameRulesPageProps {
  gameState: GameState;
  onContinue: () => void;
  isModal?: boolean;
}

const roleIconNames: Record<RoleModalRole, GameIconName> = {
  Commander: 'helmet',
  Scout: 'compass',
  Engineer: 'gearHammer',
};

const roleAbilityIconNames: Record<string, GameIconName> = {
  warBonus: 'master',
  tacticalStrike: 'lightning',
  reinforce: 'rallyTroops',
  extendedVision: 'compass',
  firstStrike: 'archeryTarget',
  commandoRaid: 'crossbow',
  fortConstruction: 'gearHammer',
  sabotage: 'wrench',
  demolish: 'fist',
};

export function GameRulesPage({ gameState, onContinue, isModal = false }: GameRulesPageProps) {
  const { t } = useTranslation();
  const dynamics = gameState.dynamics;
  const beaconRuleItems = [
    t('rules.beacon.bullet1'),
    t('rules.beacon.bullet2'),
    t('rules.beacon.bullet3'),
    t('rules.beacon.bullet4'),
  ];

  const claimModeText =
    gameState.claimMode === 'PresenceOnly'
      ? t('rules.claiming.presenceOnly')
      : gameState.claimMode === 'PresenceWithTroop'
        ? t('rules.claiming.presenceWithTroop')
        : t('rules.claiming.adjacencyRequired');

  const winConditionText =
    gameState.winConditionType === 'TerritoryPercent'
      ? t('rules.winCondition.territoryPercent', { value: gameState.winConditionValue })
      : gameState.winConditionType === 'Elimination'
        ? t('rules.winCondition.elimination')
        : t('rules.winCondition.timedGame', { value: gameState.winConditionValue });

  const coreRuleItems = [
    t('rules.coreRules.adjacency'),
    t('rules.coreRules.troops'),
    t('rules.coreRules.homeBase'),
    t('rules.coreRules.winCondition'),
  ];

  const matchSpecificItems: Array<{ key: string; label: string; body: ReactNode }> = [
    { key: 'claiming', label: t('rules.claiming.title'), body: claimModeText },
    { key: 'combat', label: t('rules.combat.title'), body: t('rules.combat.body') },
    { key: 'win-condition', label: t('rules.winCondition.title'), body: winConditionText },
  ];

  if (dynamics.beaconEnabled) {
    matchSpecificItems.push({
      key: 'beacon',
      label: t('rules.beacon.title'),
      body: (
        <div className="rules-item-body">
          <p className="rules-item-intro">{t('rules.beacon.intro')}</p>
          <ul className="rules-list rules-list-secondary">
            {beaconRuleItems.map((item) => (
              <li key={item} className="rules-list-item">{item}</li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  if (dynamics.hqEnabled) {
    matchSpecificItems.push({
      key: 'hq',
      label: t('rules.hq.title'),
      body: t('rules.hq.body'),
    });
  }

  const content = (
    <div className="rules-content">
      {!isModal && <h2 className="rules-main-title">{t('rules.title')}</h2>}
      <p className="rules-section-body">{t('rules.overview.body')}</p>

      <section className="rules-section">
        <h3 className="rules-section-title"><GameIcon name="rocket" /> {t('rules.quickStart.title')}</h3>
        <ol className="rules-list rules-list-numbered">
          <li className="rules-list-item">{t('rules.quickStart.step1')}</li>
          <li className="rules-list-item">{t('rules.quickStart.step2')}</li>
          <li className="rules-list-item">{t('rules.quickStart.step3')}</li>
          <li className="rules-list-item">{t('rules.quickStart.step4')}</li>
        </ol>
      </section>

      <section className="rules-section">
        <h3 className="rules-section-title"><GameIcon name="compass" /> {t('rules.coreRules.title')}</h3>
        <ul className="rules-list">
          {coreRuleItems.map((item) => (
            <li key={item} className="rules-list-item">
              {item}
            </li>
          ))}
        </ul>

        <ul className="rules-list rules-list-secondary">
          {matchSpecificItems.map((item) => (
            <li key={item.key} className="rules-list-item">
              <strong>{item.label}:</strong>{typeof item.body === 'string' ? ` ${item.body}` : item.body}
            </li>
          ))}
        </ul>
      </section>

      {dynamics.playerRolesEnabled && (
        <section className="rules-section rules-roles-section">
          <h3 className="rules-section-title"><GameIcon name="theater" /> {t('rules.roles.title')}</h3>
          <div className="role-cards-grid">
            {ROLE_CARDS.map(({ role, abilities }) => (
              <div key={role} className="role-card">
                <h4>
                  <GameIcon name={roleIconNames[role]} /> {t(`roles.${role}.title` as never)}
                </h4>
                <ul className="role-abilities-list">
                  {abilities.map(({ key, type }) => (
                    <li key={key}>
                      <span className="ability-icon" aria-hidden="true"><GameIcon name={roleAbilityIconNames[key] ?? 'master'} /></span>
                      <span className="ability-name">{t(`roles.${role}.abilities.${key}.title` as never)}</span>
                      <span className={`ability-type ${type}`}>
                        {type === 'passive' ? t('roleModal.passive') : t('roleModal.activate')}
                      </span>
                      <p className="ability-desc">{t(`roles.${role}.abilities.${key}.description` as never)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rules-section">
        <h3 className="rules-section-title"><GameIcon name="master" /> {t('rules.advanced.title')}</h3>
        <ul className="rules-list">
          <li className="rules-list-item">{t('rules.advanced.observer')}</li>
        </ul>
      </section>

      {!isModal && <div className="rules-spacer" />}
    </div>
  );

  if (isModal) {
    return (
      <div className="hud-modal-sheet open rules-sheet" data-testid="game-rules-gate" onClick={(event) => event.stopPropagation()}>
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
    <div className="rules-page-container" data-testid="game-rules-gate">
      {content}
      <div className="rules-sticky-footer">
        <button className="btn-primary big rules-play-btn" onClick={onContinue}>
          {t('rules.letsPlay')}
        </button>
      </div>
    </div>
  );
}
