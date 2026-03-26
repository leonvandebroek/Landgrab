import React from 'react';
import { useTranslation } from 'react-i18next';
import '../../styles/ability-card.css';

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

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  );
}

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
  
  const defaultAbortLabel = t('abilities.abortMission', 'Abort Mission');

  return (
    <div className="ability-card">
      <header className="ability-card__header">
        <div className="ability-card__title-group">
          {icon && <div className="ability-card__icon">{icon}</div>}
          <h2 className="ability-card__title">{title}</h2>
        </div>
        <button 
          className="ability-card__back-btn" 
          onClick={onBackToHud}
          aria-label={t('common.cancel', 'Cancel/Back')}
        >
          <CloseIcon />
        </button>
      </header>

      {statusContent && (
        <div className="ability-card__status-region">
          {statusContent}
        </div>
      )}

      <div className="ability-card__body">
        {children}
      </div>

      {(footerContent || (showAbort && onAbort)) && (
        <footer className="ability-card__footer">
          {footerContent && (
            <div className="ability-card__footer-actions">
              {footerContent}
            </div>
          )}

          {showAbort && onAbort && (
            <button className="ability-card__abort-btn" onClick={onAbort}>
              <AlertIcon />
              {abortLabel || defaultAbortLabel}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
