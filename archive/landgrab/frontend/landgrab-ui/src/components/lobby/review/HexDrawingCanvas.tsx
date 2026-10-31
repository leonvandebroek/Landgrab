import { useTranslation } from 'react-i18next';
import type { HexCoordinate } from '../../../types/game';

interface Props {
    drawnCells: HexCoordinate[];
    minDrawnHexCount: number;
    drawIsLargeEnough: boolean;
    drawIsConnected: boolean;
    drawFitsFootprint: boolean;
    canApplyDrawn: boolean;
    onApplyDrawn: () => void;
    onClearDrawn: () => void;
    onResetDraft: () => void;
}

export function HexDrawingCanvas({
    drawnCells,
    minDrawnHexCount,
    drawIsLargeEnough,
    drawIsConnected,
    drawFitsFootprint,
    canApplyDrawn,
    onApplyDrawn,
    onClearDrawn,
    onResetDraft,
}: Props) {
    const { t } = useTranslation();

    return (
        <div className="wizard-area-mode-panel">
            <p className="wizard-hint">{t('wizard.areaDrawHint', { count: drawnCells.length })}</p>
            {!drawIsLargeEnough && (
                <p className="error-msg wizard-area-validation">{t('wizard.areaTooSmall', { count: minDrawnHexCount })}</p>
            )}
            {drawIsLargeEnough && !drawIsConnected && (
                <p className="error-msg wizard-area-validation">{t('wizard.areaDisconnected')}</p>
            )}
            {drawIsLargeEnough && drawIsConnected && !drawFitsFootprint && (
                <p className="error-msg wizard-area-validation">{t('wizard.areaTooLarge')}</p>
            )}
            <div className="wizard-area-actions">
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={onApplyDrawn}
                    disabled={!canApplyDrawn}
                >
                    {t('wizard.areaApplyDrawn')}
                </button>
                <button
                    type="button"
                    className="btn-ghost small"
                    onClick={onClearDrawn}
                >
                    {t('wizard.areaClearDrawn')}
                </button>
                <button
                    type="button"
                    className="btn-ghost small"
                    onClick={onResetDraft}
                >
                    {t('wizard.areaResetDraft')}
                </button>
            </div>
        </div>
    );
}
