import { useTranslation } from 'react-i18next';
import type { CombatMode, GameDynamics, GameState } from '../../types/game';
import { CustomSelect } from './CustomSelect';
import { FEATURE_KEYS } from '../../utils/dynamics';
import type { FeatureKey } from '../../utils/dynamics';

const COMBAT_MODES: CombatMode[] = ['Classic', 'Balanced', 'Siege'];
const ENEMY_SIGHTING_MEMORY_OPTIONS = [15, 30, 60, 120] as const;
const FIELD_BATTLE_RESOLUTION_MODES = [
    'InitiatorVsSumOfJoined',
    'InitiatorVsHighestOfJoined',
    'InitiatorPlusRandomVsSumPlusRandom',
    'InitiatorPlusRandomVsHighestPlusRandom',
] as const;
type FieldBattleResolutionMode = typeof FIELD_BATTLE_RESOLUTION_MODES[number];

/* ── Component ────────────────────────────────────────────────────────── */

interface Props {
    gameState: GameState;
    isHost: boolean;
    onSetBeaconEnabled: (enabled: boolean) => void;
    onSetTileDecayEnabled: (enabled: boolean) => void;
    onSetEnemySightingMemory: (seconds: number) => void;
    onSetGameDynamics: (dynamics: GameDynamics) => void;
}

export function DynamicsStep({
    gameState,
    isHost,
    onSetBeaconEnabled,
    onSetTileDecayEnabled,
    onSetEnemySightingMemory,
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
            case 'playerRoles':
                return dynamics.playerRolesEnabled;
            case 'beaconEnabled':
                return dynamics.beaconEnabled;
            case 'hq':
                return dynamics.hqEnabled;
            case 'tileDecayEnabled':
                return dynamics.tileDecayEnabled;
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
            case 'playerRoles':
                updateDynamics({ playerRolesEnabled: checked });
                return;
            case 'hq':
                updateDynamics({ hqEnabled: checked, ...(checked ? { hqAutoAssign: true } : {}) });
                return;
        }
    };

    const handleCombatModeChange = (mode: CombatMode) => {
        if (!isHost) return;

        updateDynamics({ combatMode: mode });
    };

    const handleFieldBattleResolutionModeChange = (mode: FieldBattleResolutionMode) => {
        if (!isHost) return;
        updateDynamics({ fieldBattleResolutionMode: mode });
    };

    const handleEnemySightingMemoryChange = (value: string) => {
        if (!isHost) {
            return;
        }

        const seconds = Number(value);
        if (!Number.isFinite(seconds)) {
            return;
        }

        onSetEnemySightingMemory(seconds);
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
                                    <label className="toggle-row toggle-row--nested">
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
                                        <p className="wizard-hint wizard-hint--info wizard-hint--nested">
                                            {t('dynamics.info.hqAutoAssignNote')}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    ))}

                    {showHqAssignmentWarning && (
                        <p className="wizard-hint wizard-hint--warning" role="alert">
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

                    <div className="settings-row settings-row--top-aligned settings-row--spaced-top">
                        <div className="wizard-setting-copy">
                            <strong>{t('lobby.settings.enemySightingMemory' as never)}</strong>
                            <p className="wizard-hint wizard-hint--compact-top">
                                {t('lobby.settings.enemySightingMemoryDesc' as never)}
                            </p>
                        </div>
                        <CustomSelect
                            value={String(dynamics.enemySightingMemorySeconds ?? 120)}
                            options={ENEMY_SIGHTING_MEMORY_OPTIONS.map((seconds) => ({
                                value: String(seconds),
                                label: t('lobby.settings.enemySightingMemorySeconds' as never, { seconds }),
                            }))}
                            disabled={!isHost}
                            onChange={handleEnemySightingMemoryChange}
                        />
                    </div>
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

                <div className="wizard-rule-card">
                    <h3>{t('lobby.fieldBattleResolution.title' as never)}</h3>
                    <p className="wizard-hint">{t('lobby.fieldBattleResolution.description' as never)}</p>
                    <div className="claim-mode-grid">
                        {FIELD_BATTLE_RESOLUTION_MODES.map(mode => (
                            <label key={mode} className={`claim-mode-option${(dynamics.fieldBattleResolutionMode ?? 'InitiatorVsSumOfJoined') === mode ? ' active' : ''}`}>
                                <input
                                    type="radio"
                                    name="wizard-field-battle-resolution"
                                    checked={(dynamics.fieldBattleResolutionMode ?? 'InitiatorVsSumOfJoined') === mode}
                                    onChange={() => handleFieldBattleResolutionModeChange(mode)}
                                    disabled={!isHost}
                                />
                                <span className="claim-mode-copy">
                                    <span>
                                        {mode === 'InitiatorVsSumOfJoined'
                                            ? t('lobby.fieldBattleResolution.initiatorVsSum' as never)
                                            : mode === 'InitiatorVsHighestOfJoined'
                                                ? t('lobby.fieldBattleResolution.initiatorVsHighest' as never)
                                                : mode === 'InitiatorPlusRandomVsSumPlusRandom'
                                                    ? t('lobby.fieldBattleResolution.initiatorPlusRandomVsSum' as never)
                                                    : t('lobby.fieldBattleResolution.initiatorPlusRandomVsHighest' as never)}
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
