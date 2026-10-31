import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import type { PlayerRole } from '../../types/game';
import type { GameIconName } from '../../utils/gameIcons';

type AbilityRole = Exclude<PlayerRole, 'None'>;

interface AbilityMeta {
    icon: GameIconName;
    type: 'passive' | 'active';
}

export interface AbilityInfoSheetProps {
    role: AbilityRole;
    abilityKey: string;
    onClose: () => void;
    stateTone?: 'standby' | 'active' | 'cooldown' | 'targeting' | 'inProgress';
    badgeText?: string | null;
    disabled?: boolean;
    onActivate?: () => void;
}

const ROLE_ABILITY_META: Record<AbilityRole, Record<string, AbilityMeta>> = {
    Commander: {
        warBonus: { icon: 'master', type: 'passive' },
        tacticalStrike: { icon: 'lightning', type: 'active' },
        reinforce: { icon: 'rallyTroops', type: 'active' },
    },
    Scout: {
        extendedVision: { icon: 'compass', type: 'passive' },
        firstStrike: { icon: 'archeryTarget', type: 'passive' },
    },
    Engineer: {
        fortConstruction: { icon: 'gearHammer', type: 'passive' },
        sabotage: { icon: 'wrench', type: 'active' },
        demolish: { icon: 'fist', type: 'active' },
    },
};

const ROLE_ACCENT_COLORS: Record<AbilityRole, string> = {
    Commander: '#f6c453',
    Scout: '#6bc5ff',
    Engineer: '#ffb366',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buttonLabel(t: any, stateTone?: string, badgeText?: string | null, abilityKey?: string): string {
    switch (stateTone) {
        case 'cooldown':
            return badgeText ? `${t('roleModal.recharging' as never)} · ${badgeText}` : t('roleModal.recharging' as never);
        case 'active':
        case 'inProgress':
            return badgeText ? `${t('roleModal.deployed' as never)} · ${badgeText}` : t('roleModal.deployed' as never);
        case 'targeting':
            return `[+] ${t('roleModal.selectTarget' as never)}`;
        default:
            if (abilityKey === 'commandoRaid') {
                return `[+] ${t('roleModal.selectTarget' as never)}`;
            }
            return t('roleModal.activate' as never);
    }
}

export function AbilityInfoSheet({ role, abilityKey, onClose, stateTone = 'standby', badgeText, disabled, onActivate }: AbilityInfoSheetProps) {
    const { t } = useTranslation();
    const abilityMeta = ROLE_ABILITY_META[role][abilityKey] ?? { icon: 'master', type: 'active' as const };
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
                <div className="ability-info-sheet__header">
                    <div className="ability-info-sheet__identity">
                        <span
                            className="ability-info-sheet__icon"
                            aria-hidden="true"
                            style={{ '--ability-accent': ROLE_ACCENT_COLORS[role] } as React.CSSProperties}
                        >
                            <GameIcon name={abilityMeta.icon} />
                        </span>

                        <div className="ability-info-sheet__title-block">
                            <span className="ability-info-sheet__role">{t(`roles.${role}.title` as never)}</span>
                            <h3 id="ability-info-sheet-title" className="ability-info-sheet__title">{t(`${abilityPrefix}.title` as never)}</h3>
                        </div>
                    </div>

                    <button type="button" className="ability-info-sheet__close-btn" aria-label={t('game.close')} onClick={onClose}>
                        <span aria-hidden="true">✕</span>
                    </button>
                </div>

                <div className="ability-info-sheet__meta">
                    <span className="ability-info-sheet__meta-label">
                        <div className={`ability-info-sheet__status-led${stateTone !== 'standby' ? ` ability-info-sheet__status-led--${stateTone}` : ''}`}></div>
                        <span>
                            {abilityMeta.type === 'passive'
                                ? t('roleModal.passive' as never)
                                : stateTone === 'cooldown'
                                    ? t('roles.status.cooldown' as never)
                                    : stateTone === 'active' || stateTone === 'inProgress'
                                        ? t('roles.status.active' as never)
                                        : t('roleModal.ready' as never)}
                        </span>
                    </span>
                    {abilityMeta.type === 'active' && (
                        <span className="ability-info-sheet__meta-value">
                            {badgeText ?? t(`${abilityPrefix}.cooldown` as never)}
                        </span>
                    )}
                </div>

                <p className="ability-info-sheet__description">{t(`${abilityPrefix}.description` as never)}</p>

                {abilityMeta.type === 'active' && (
                    <button
                        type="button"
                        className={[
                            'ability-info-sheet__activate-btn',
                            stateTone === 'cooldown' ? 'ability-info-sheet__activate-btn--cooldown' : '',
                            stateTone === 'active' || stateTone === 'inProgress' ? 'ability-info-sheet__activate-btn--active' : '',
                            stateTone === 'targeting' ? 'ability-info-sheet__activate-btn--targeting' : '',
                            abilityKey === 'commandoRaid' && stateTone === 'standby' ? 'ability-info-sheet__activate-btn--targeting' : '',
                        ].filter(Boolean).join(' ')}
                        disabled={disabled || stateTone === 'cooldown' || stateTone === 'active' || stateTone === 'inProgress'}
                        onClick={() => {
                            onActivate?.();
                            onClose();
                        }}
                    >
                        {buttonLabel(t, stateTone, badgeText, abilityKey)}
                    </button>
                )}
            </div>
        </div>
    );
}