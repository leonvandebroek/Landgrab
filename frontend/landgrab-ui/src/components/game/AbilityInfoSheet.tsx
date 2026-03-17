import { useTranslation } from 'react-i18next';
import type { PlayerRole } from '../../types/game';

type AbilityRole = Exclude<PlayerRole, 'None'>;

interface AbilityMeta {
    icon: string;
    type: 'passive' | 'active';
}

export interface AbilityInfoSheetProps {
    role: AbilityRole;
    abilityKey: string;
    onClose: () => void;
}

const ROLE_ABILITY_META: Record<AbilityRole, Record<string, AbilityMeta>> = {
    Commander: {
        warBonus: { icon: '🎖️', type: 'passive' },
        tacticalStrike: { icon: '⚡', type: 'active' },
        reinforce: { icon: '🔄', type: 'active' },
    },
    Scout: {
        extendedVision: { icon: '👁️', type: 'passive' },
        firstStrike: { icon: '🎯', type: 'passive' },
        commandoRaid: { icon: '🎯', type: 'active' },
    },
    Defender: {
        presenceShield: { icon: '🔁', type: 'passive' },
        shieldWall: { icon: '🛡️', type: 'active' },
        lastStand: { icon: '🏃', type: 'passive' },
    },
    Engineer: {
        fortConstruction: { icon: '🏗️', type: 'passive' },
        emergencyRepair: { icon: '🔧', type: 'active' },
        demolish: { icon: '💣', type: 'active' },
    },
};

const ROLE_ACCENT_COLORS: Record<AbilityRole, string> = {
    Commander: '#f6c453',
    Scout: '#6bc5ff',
    Defender: '#72e0b5',
    Engineer: '#ffb366',
};

export function AbilityInfoSheet({ role, abilityKey, onClose }: AbilityInfoSheetProps) {
    const { t } = useTranslation();
    const abilityMeta = ROLE_ABILITY_META[role][abilityKey] ?? { icon: '✨', type: 'active' as const };
    const abilityPrefix = `roles.${role}.abilities.${abilityKey}`;

    return (
        <div className="ability-info-sheet-overlay" onClick={onClose}>
            <div
                className="ability-info-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ability-info-sheet-title"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="ability-info-sheet__handle" aria-hidden="true" />

                <div className="ability-info-sheet__header">
                    <div className="ability-info-sheet__identity">
                        <span
                            className="ability-info-sheet__icon"
                            aria-hidden="true"
                            style={{ '--ability-accent': ROLE_ACCENT_COLORS[role] } as React.CSSProperties}
                        >
                            {abilityMeta.icon}
                        </span>

                        <div className="ability-info-sheet__title-block">
                            <span className="ability-info-sheet__role">{t(`roles.${role}.title` as never)}</span>
                            <h3 id="ability-info-sheet-title">{t(`${abilityPrefix}.title` as never)}</h3>
                        </div>
                    </div>

                    <button type="button" className="btn-secondary ability-info-sheet__close" onClick={onClose}>
                        {t('common.close' as never)}
                    </button>
                </div>

                <div className="ability-info-sheet__meta">
                    <span className={`role-modal-badge role-modal-badge-${abilityMeta.type}`}>
                        {abilityMeta.type === 'passive' ? t('roleModal.passive' as never) : t('roleModal.activate' as never)}
                    </span>

                    {abilityMeta.type === 'active' && (
                        <span className="role-modal-cooldown">{t(`${abilityPrefix}.cooldown` as never)}</span>
                    )}
                </div>

                <p className="ability-info-sheet__description">{t(`${abilityPrefix}.description` as never)}</p>
            </div>
        </div>
    );
}