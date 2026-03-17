import { useTranslation } from 'react-i18next';
import type { CombatMode, GameDynamics, GameState } from '../../types/game';
import { FEATURE_KEYS } from '../../utils/dynamics';
import type { FeatureKey } from '../../utils/dynamics';

const COMBAT_MODES: CombatMode[] = ['Classic', 'Balanced', 'Siege'];

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
    const activeCombatMode = dynamics.combatMode ?? 'Balanced';
    const alliancesMissingHq = gameState.alliances.filter(
        alliance => alliance.memberIds.length > 0 && (alliance.hqHexQ == null || alliance.hqHexR == null),
    );
    const showHqAssignmentWarning = dynamics.hqEnabled && !dynamics.hqAutoAssign && alliancesMissingHq.length > 0;

    const updateDynamics = (updates: Partial<GameDynamics>) => {
        onSetGameDynamics({ ...dynamics, ...updates });
    };

    const isFeatureEnabled = (key: FeatureKey) => {
        switch (key) {
            case 'terrain':
                return dynamics.terrainEnabled;
            case 'playerRoles':
                return dynamics.playerRolesEnabled;
            case 'fogOfWar':
                return dynamics.fogOfWarEnabled;
            case 'beaconEnabled':
                return dynamics.beaconEnabled;
            case 'supplyLines':
                return dynamics.supplyLinesEnabled;
            case 'hq':
                return dynamics.hqEnabled;
            case 'tileDecayEnabled':
                return dynamics.tileDecayEnabled;
            case 'timedEscalation':
                return dynamics.timedEscalationEnabled;
            case 'underdogPact':
                return dynamics.underdogPactEnabled;
        }
    };

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

        switch (key) {
            case 'terrain':
                updateDynamics({ terrainEnabled: checked });
                return;
            case 'playerRoles':
                updateDynamics({ playerRolesEnabled: checked });
                return;
            case 'fogOfWar':
                updateDynamics({ fogOfWarEnabled: checked });
                return;
            case 'supplyLines':
                updateDynamics({
                    supplyLinesEnabled: checked,
                    ...(checked ? { hqEnabled: true } : {}),
                });
                return;
            case 'hq':
                updateDynamics({ hqEnabled: checked, ...(checked ? { hqAutoAssign: true } : {}) });
                return;
            case 'timedEscalation':
                updateDynamics({ timedEscalationEnabled: checked });
                return;
            case 'underdogPact':
                updateDynamics({ underdogPactEnabled: checked });
                return;
        }
    };

    const handleCombatModeChange = (mode: CombatMode) => {
        if (!isHost) return;

        updateDynamics({ combatMode: mode });
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
                        <div key={key}>
                            <label className="toggle-row">
                                <input
                                    type="checkbox"
                                    checked={isFeatureEnabled(key)}
                                    onChange={e => handleFeatureToggle(key, e.target.checked)}
                                    disabled={!isHost}
                                />
                                <span className="toggle-row-copy">
                                    <strong>{t(`dynamics.feature.${key}`)}</strong>
                                    <span>{t(`dynamics.feature.${key}Desc`)}</span>
                                </span>
                            </label>
                            {key === 'hq' && dynamics.hqEnabled && (
                                <>
                                    <label className="toggle-row" style={{ paddingLeft: '1.5rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={dynamics.hqAutoAssign ?? true}
                                            onChange={e => updateDynamics({ hqAutoAssign: e.target.checked })}
                                            disabled={!isHost}
                                        />
                                        <span className="toggle-row-copy">
                                            <strong>{t('dynamics.feature.hqAutoAssign')}</strong>
                                            <span>{t('dynamics.feature.hqAutoAssignDesc')}</span>
                                        </span>
                                    </label>
                                    {dynamics.hqAutoAssign && (
                                        <p className="wizard-hint" style={{ color: '#6ec6ff', paddingLeft: '1.5rem' }}>
                                            {t('dynamics.info.hqAutoAssignNote')}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    ))}

                    {showHqAssignmentWarning && (
                        <p className="wizard-hint" role="alert" style={{ color: '#f4b350' }}>
                            {alliancesMissingHq.length === 1
                                ? t('dynamics.warning.missingSingleHq' as never, {
                                    defaultValue: 'HQ is enabled, but 1 alliance still needs an HQ assigned in Review.',
                                })
                                : t('dynamics.warning.missingMultipleHq' as never, {
                                    count: alliancesMissingHq.length,
                                    defaultValue: 'HQ is enabled, but {{count}} alliances still need an HQ assigned in Review.',
                                })}
                        </p>
                    )}
                </div>

                <div className="wizard-rule-card">
                    <h3>
                        {t('dynamics.combatModeLabel' as never, {
                            defaultValue: 'Combat mode',
                        })}
                    </h3>
                    <p className="wizard-hint">
                        {t('dynamics.combatModeDesc' as never, {
                            defaultValue: 'Choose how battles resolve once players attack an occupied hex.',
                        })}
                    </p>

                    <div className="claim-mode-grid">
                        {COMBAT_MODES.map(mode => (
                            <label key={mode} className={`claim-mode-option${activeCombatMode === mode ? ' active' : ''}`}>
                                <input
                                    type="radio"
                                    name="wizard-combat-mode"
                                    checked={activeCombatMode === mode}
                                    onChange={() => handleCombatModeChange(mode)}
                                    disabled={!isHost}
                                />
                                <span className="claim-mode-copy">
                                    <strong>
                                        {t(`dynamics.combatMode.${mode}.title` as never, {
                                            defaultValue: mode,
                                        })}
                                    </strong>
                                    <span>
                                        {mode === 'Classic'
                                            ? t('dynamics.combatMode.Classic.description' as never, {
                                                defaultValue: 'Deterministic - higher total always wins',
                                            })
                                            : mode === 'Balanced'
                                                ? t('dynamics.combatMode.Balanced.description' as never, {
                                                    defaultValue: 'Dice-based with partial losses on both sides',
                                                })
                                                : t('dynamics.combatMode.Siege.description' as never, {
                                                    defaultValue: 'Like Balanced but defenders get +25% bonus',
                                                })}
                                    </span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
