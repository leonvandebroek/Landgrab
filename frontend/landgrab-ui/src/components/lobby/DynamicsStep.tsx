import { useTranslation } from 'react-i18next';
import type { GameDynamics, GameState } from '../../types/game';
import { FEATURE_KEYS, featureField } from '../../utils/dynamics';
import type { FeatureKey } from '../../utils/dynamics';

/* ── Component ────────────────────────────────────────────────────────── */

interface Props {
    gameState: GameState;
    isHost: boolean;
    onSetBeaconEnabled: (enabled: boolean) => void;
    onSetTileDecayEnabled: (enabled: boolean) => void;
    onSetGameDynamics: (dynamics: GameDynamics) => void;
}

export function DynamicsStep({
    gameState,
    isHost,
    onSetBeaconEnabled,
    onSetTileDecayEnabled,
    onSetGameDynamics,
}: Props) {
    const { t } = useTranslation();
    const { dynamics } = gameState;

    /* ── Handlers ──────────────────────────────────────────────────── */

    const handleFeatureToggle = (key: FeatureKey, checked: boolean) => {
        if (!isHost) return;

        if (key === 'beaconEnabled') {
            onSetBeaconEnabled(checked);
            return;
        }

        if (key === 'tileDecayEnabled') {
            onSetTileDecayEnabled(checked);
            return;
        }

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
