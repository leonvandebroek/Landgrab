import React from 'react';
import { useTranslation } from 'react-i18next';
import { useGameplayStore } from '../../stores/gameplayStore';
import { abilityRegistry } from '../../config/abilityRegistry';
import { Icon } from '../ui/Icon';

export interface AbilityCardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  statusContent?: React.ReactNode;
  footerContent?: React.ReactNode;
  onBackToHud: () => void;
  showAbort?: boolean;
  onAbort?: () => void;
  abortLabel?: string;
}

/**
 * Every ability opens here, in the bottom panel over the map: title, who can
 * use it, what is happening now, and the buttons to act.
 */
export function AbilityCard({
  title,
  icon,
  children,
  statusContent,
  footerContent,
  onBackToHud,
  showAbort = false,
  onAbort,
  abortLabel,
}: AbilityCardProps) {
  const { t } = useTranslation();
  const activeAbility = useGameplayStore((state) => state.abilityUi.activeAbility);
  const roles = activeAbility ? abilityRegistry[activeAbility]?.roles ?? [] : [];
  const kicker = roles.length === 1
    ? t('ui.abilities.roleAbility', { role: t(`ui.roles.${roles[0] as 'Commander' | 'Scout' | 'Engineer'}.title`) })
    : t('ui.abilities.everyRole');

  return (
    <div className="lg-dock ability-card" data-testid="ability-card" role="region" aria-label={title}>
      <span className="lg-dock__handle" aria-hidden="true" />
      <header className="lg-dock__head">
        <div className="lg-row lg-grow" style={{ minWidth: 0 }}>
          {icon && <div className="ability-card__icon" aria-hidden="true">{icon}</div>}
          <div className="lg-dock__copy">
            <h2 className="lg-dock__title ability-card__title">{title}</h2>
            <span className="lg-dock__sub">{kicker}</span>
          </div>
        </div>
        <button
          type="button"
          className="lg-iconbtn lg-iconbtn--small"
          onClick={onBackToHud}
          aria-label={t('ui.abilities.backToMap')}
          data-testid="ability-card-close"
        >
          <Icon name="close" size={18} />
        </button>
      </header>

      {statusContent && <div className="ability-card__status-region">{statusContent}</div>}

      <div className="ability-card__body">{children}</div>

      {(footerContent || (showAbort && onAbort)) && (
        <footer className="ability-card__footer">
          {footerContent && <div className="ability-card__footer-actions">{footerContent}</div>}
          {showAbort && onAbort && (
            <button type="button" className="lg-btn lg-btn--outline lg-btn--md lg-btn--block ability-card__abort-btn" onClick={onAbort}>
              {abortLabel || t('ui.abilities.stop')}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
