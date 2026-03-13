import { useTranslation } from 'react-i18next';
import type { CopresenceMode, GameDynamics, GameState } from '../../types/game';

/* ── Constants ────────────────────────────────────────────────────────── */

const PRESETS = [
    'Klassiek', 'Territorium', 'Formatie', 'Logistiek',
    'Infiltratie', 'Chaos', 'Tolweg', 'Aangepast',
] as const;

const COPRESENCE_MODES = [
    'Standoff', 'PresenceBattle', 'PresenceBonus',
    'Ambush', 'Toll', 'Duel', 'Rally', 'Drain',
    'Stealth', 'Hostage', 'Scout', 'Beacon',
    'FrontLine', 'Relay', 'JagerProoi', 'Shepherd', 'CommandoRaid',
] as const;

const FEATURE_KEYS = [
    'terrain', 'playerRoles', 'fogOfWar', 'supplyLines', 'hq',
    'timedEscalation', 'underdogPact', 'neutralNPC', 'randomEvents', 'missionSystem',
] as const;

type FeatureKey = typeof FEATURE_KEYS[number];

/** Maps a feature key to its corresponding GameDynamics boolean field. */
const featureField = (key: FeatureKey): keyof GameDynamics =>
    `${key}Enabled` as keyof GameDynamics;

/* ── Component ────────────────────────────────────────────────────────── */

interface Props {
    gameState: GameState;
    isHost: boolean;
    onSetCopresenceModes: (modes: CopresenceMode[]) => void;
    onSetCopresencePreset: (preset: string) => void;
    onSetGameDynamics: (dynamics: GameDynamics) => void;
}

export function DynamicsStep({
    gameState,
    isHost,
    onSetCopresenceModes,
    onSetCopresencePreset,
    onSetGameDynamics,
}: Props) {
    const { t } = useTranslation();
    const { dynamics } = gameState;
    const activePreset = dynamics.copresencePreset ?? 'Klassiek';

    /* ── Handlers ──────────────────────────────────────────────────── */

    const handleModeToggle = (mode: CopresenceMode, checked: boolean) => {
        if (!isHost) return;
        const next = checked
            ? [...dynamics.activeCopresenceModes, mode]
            : dynamics.activeCopresenceModes.filter(m => m !== mode);
        onSetCopresenceModes(next);
    };

    const handleFeatureToggle = (key: FeatureKey, checked: boolean) => {
        if (!isHost) return;
        onSetGameDynamics({ ...dynamics, [featureField(key)]: checked });
    };

    /* ── Render ────────────────────────────────────────────────────── */

    return (
        <div className="wizard-step wizard-step-dynamics">
            <div className="wizard-step-header">
                <h2>{t('wizard.dynamicsTitle')}</h2>
                <p className="wizard-step-desc">{t('wizard.dynamicsDesc')}</p>
            </div>

            <div className="wizard-step-body">
                <p className="wizard-hint">{t('wizard.dynamicsDefaultsNote')}</p>

                {/* ── Presets ──────────────────────────────────────── */}
                <div className="wizard-rule-card">
                    <h3>{t('dynamics.presetsLabel')}</h3>
                    <p className="wizard-hint">{t('dynamics.presetsDesc')}</p>

                    <div className="claim-mode-grid preset-grid">
                        {PRESETS.map(preset => (
                            <label
                                key={preset}
                                className={`claim-mode-option preset-option${activePreset === preset ? ' active' : ''}`}
                            >
                                <input
                                    type="radio"
                                    name="dynamics-preset"
                                    checked={activePreset === preset}
                                    onChange={() => isHost && onSetCopresencePreset(preset)}
                                    disabled={!isHost}
                                />
                                <span className="claim-mode-copy">
                                    <strong>{t(`dynamics.preset.${preset}.title`)}</strong>
                                    <span>{t(`dynamics.preset.${preset}.detail`)}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* ── Custom copresence modes (visible when "Aangepast") ── */}
                {activePreset === 'Aangepast' && (
                    <div className="wizard-rule-card">
                        <h3>{t('dynamics.customLabel')}</h3>
                        <p className="wizard-hint">{t('dynamics.customDesc')}</p>

                        <div className="toggle-grid">
                            {COPRESENCE_MODES.map(mode => {
                                const checked = dynamics.activeCopresenceModes.includes(mode);
                                return (
                                    <label key={mode} className={`toggle-card${checked ? ' active' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={e => handleModeToggle(mode, e.target.checked)}
                                            disabled={!isHost}
                                        />
                                        <span className="toggle-card-copy">
                                            <strong>{t(`dynamics.mode.${mode}.title`)}</strong>
                                            <span>{t(`dynamics.mode.${mode}.detail`)}</span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Feature toggles ─────────────────────────────── */}
                <div className="wizard-rule-card">
                    <h3>{t('dynamics.featuresLabel')}</h3>
                    <p className="wizard-hint">{t('dynamics.featuresDesc')}</p>

                    {FEATURE_KEYS.map(key => (
                        <label key={key} className="toggle-row">
                            <input
                                type="checkbox"
                                checked={!!dynamics[featureField(key)]}
                                onChange={e => handleFeatureToggle(key, e.target.checked)}
                                disabled={!isHost}
                            />
                            <span className="toggle-row-copy">
                                <strong>{t(`dynamics.feature.${key}`)}</strong>
                                <span>{t(`dynamics.feature.${key}Desc`)}</span>
                            </span>
                        </label>
                    ))}
                </div>
            </div>
        </div>
    );
}
