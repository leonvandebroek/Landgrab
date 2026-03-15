import { useTranslation } from 'react-i18next';
import type { GameAreaMode, GameAreaPattern } from '../../../types/game';
import { GAME_AREA_PATTERNS } from '../gameAreaShapes';

export type AreaModeOption = GameAreaMode | 'Template';

/** Minimum number of hexes required for a valid freehand-drawn area. */
export const MIN_DRAWN_HEX_COUNT = 7;

interface Props {
    areaMode: AreaModeOption;
    selectedPattern: GameAreaPattern;
    patternFitsFootprint: boolean;
    onSelectAreaMode: (mode: AreaModeOption) => void;
    onSelectPattern: (pattern: GameAreaPattern) => void;
    onApplyCentered: () => void;
    onApplyPattern: () => void;
}

export function AreaModeSelector({
    areaMode,
    selectedPattern,
    patternFitsFootprint,
    onSelectAreaMode,
    onSelectPattern,
    onApplyCentered,
    onApplyPattern,
}: Props) {
    const { t } = useTranslation();

    return (
        <>
            <div className="wizard-area-mode-tabs">
                <button
                    type="button"
                    className={`wizard-area-mode-tab${areaMode === 'Drawn' ? ' is-active' : ''}`}
                    onClick={() => onSelectAreaMode('Drawn')}
                >
                    {t('wizard.areaModeDrawn')}
                </button>
                <button
                    type="button"
                    className={`wizard-area-mode-tab${areaMode === 'Centered' ? ' is-active' : ''}`}
                    onClick={() => onSelectAreaMode('Centered')}
                >
                    {t('wizard.areaModeCentered')}
                </button>
                <button
                    type="button"
                    className={`wizard-area-mode-tab${areaMode === 'Pattern' ? ' is-active' : ''}`}
                    onClick={() => onSelectAreaMode('Pattern')}
                >
                    {t('wizard.areaModePattern')}
                </button>
                <button
                    type="button"
                    className={`wizard-area-mode-tab${areaMode === 'Template' ? ' is-active' : ''}`}
                    onClick={() => onSelectAreaMode('Template')}
                >
                    {t('mapEditor.areaTemplate')}
                </button>
            </div>

            {areaMode === 'Centered' && (
                <div className="wizard-area-mode-panel">
                    <p className="wizard-hint">{t('wizard.areaCenteredHint')}</p>
                    <div className="wizard-area-actions">
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onApplyCentered}
                        >
                            {t('wizard.areaApplyCentered')}
                        </button>
                    </div>
                </div>
            )}

            {areaMode === 'Pattern' && (
                <div className="wizard-area-mode-panel">
                    <p className="wizard-hint">
                        {t('wizard.areaSelectedPattern')}: <strong>{t(`wizard.areaPattern.${selectedPattern}.title`)}</strong>
                    </p>
                    <div className="wizard-pattern-grid">
                        {GAME_AREA_PATTERNS.map(pattern => (
                            <button
                                key={pattern}
                                type="button"
                                className={`wizard-pattern-card${selectedPattern === pattern ? ' is-active' : ''}`}
                                onClick={() => onSelectPattern(pattern)}
                            >
                                <strong>{t(`wizard.areaPattern.${pattern}.title`)}</strong>
                                <span>{t(`wizard.areaPattern.${pattern}.detail`)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="wizard-area-actions">
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onApplyPattern}
                            disabled={!patternFitsFootprint}
                        >
                            {t('wizard.areaApplyPattern')}
                        </button>
                    </div>
                    {!patternFitsFootprint && (
                        <p className="error-msg wizard-area-validation">{t('wizard.areaTooLarge')}</p>
                    )}
                </div>
            )}
        </>
    );
}
