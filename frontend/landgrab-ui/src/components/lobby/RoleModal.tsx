import { useTranslation } from 'react-i18next';
import { ROLE_ABILITIES, ROLE_EMOJIS, type RoleModalRole } from './roleModalUtils';

export interface RoleModalProps {
    role: RoleModalRole;
    onDismiss: () => void;
}

export function RoleModal({ role, onDismiss }: RoleModalProps) {
    const { t } = useTranslation();
    const abilities = ROLE_ABILITIES[role];
    const rolePrefix = `roles.${role}`;

    return (
        <div className="role-modal-overlay" onClick={onDismiss}>
            <div
                className="role-modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="role-modal-title"
                onClick={event => event.stopPropagation()}
            >
                <div className="role-modal-header">
                    <h3 id="role-modal-title">
                        <span className="role-modal-emoji" aria-hidden="true">{ROLE_EMOJIS[role]}</span>
                        <span>{t(`${rolePrefix}.title` as never)}</span>
                    </h3>
                    <p>{t(`${rolePrefix}.intro` as never)}</p>
                </div>

                <div className="role-modal-divider" aria-hidden="true" />

                <div className="role-modal-abilities">
                    {abilities.map(ability => {
                        const abilityPrefix = `${rolePrefix}.abilities.${ability.key}`;

                        return (
                            <div key={ability.key} className="role-modal-ability">
                                <div className="role-modal-ability-topline">
                                    <div className="role-modal-ability-name">
                                        <span className="role-modal-ability-icon" aria-hidden="true">{ability.icon}</span>
                                        <span>{t(`${abilityPrefix}.title` as never)}</span>
                                    </div>
                                    <div className="role-modal-ability-meta">
                                        <span className={`role-modal-badge role-modal-badge-${ability.type}`}>
                                            {ability.type === 'passive' ? t('roleModal.passive') : t('roleModal.activate')}
                                        </span>
                                        {ability.type === 'active' && (
                                            <span className="role-modal-cooldown">
                                                {t(`${abilityPrefix}.cooldown` as never)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <p>{t(`${abilityPrefix}.description` as never)}</p>
                            </div>
                        );
                    })}
                </div>

                <div className="role-modal-divider" aria-hidden="true" />

                <button type="button" className="btn-primary role-modal-dismiss" onClick={onDismiss}>
                    {t('roleModal.gotIt')}
                </button>
            </div>
        </div>
    );
}