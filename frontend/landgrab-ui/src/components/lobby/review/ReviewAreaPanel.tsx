import { useTranslation } from 'react-i18next';
import type { GameAreaPattern, HexCoordinate, MapTemplate } from '../../../types/game';
import { AreaModeSelector } from './AreaModeSelector';
import type { AreaModeOption } from './AreaModeSelector';
import { HexDrawingCanvas } from './HexDrawingCanvas';
import { TemplateManager } from './TemplateManager';

interface Props {
    areaMode: AreaModeOption;
    selectedPattern: GameAreaPattern;
    savedAreaSummary: string;
    areaStatsText: string;
    /** Pre-formatted max tile size string (e.g. "120 m"). */
    maxTileSizeText: string;
    patternFitsFootprint: boolean;
    drawnCells: HexCoordinate[];
    minDrawnHexCount: number;
    drawIsLargeEnough: boolean;
    drawIsConnected: boolean;
    drawFitsFootprint: boolean;
    canApplyDrawn: boolean;
    templates: MapTemplate[];
    selectedTemplateId: string;
    templateLoading: boolean;
    canUseTemplates: boolean;
    hasSavedArea: boolean;
    showSaveForm: boolean;
    saveTemplateName: string;
    saveTemplateDesc: string;
    savingTemplate: boolean;
    onSelectAreaMode: (mode: AreaModeOption) => void;
    onSelectPattern: (pattern: GameAreaPattern) => void;
    onApplyCentered: () => void;
    onApplyPattern: () => void;
    onApplyDrawn: () => void;
    onClearDrawn: () => void;
    onResetDraft: () => void;
    onSelectTemplate: (templateId: string) => void;
    onLoadTemplate: () => void;
    onRefreshTemplates: () => void;
    onShowSaveForm: () => void;
    onHideSaveForm: () => void;
    onSaveTemplateNameChange: (name: string) => void;
    onSaveTemplateDescChange: (description: string) => void;
    onSaveCurrentArea: () => void;
}

export function ReviewAreaPanel({
    areaMode,
    selectedPattern,
    savedAreaSummary,
    areaStatsText,
    maxTileSizeText,
    patternFitsFootprint,
    drawnCells,
    minDrawnHexCount,
    drawIsLargeEnough,
    drawIsConnected,
    drawFitsFootprint,
    canApplyDrawn,
    templates,
    selectedTemplateId,
    templateLoading,
    canUseTemplates,
    hasSavedArea,
    showSaveForm,
    saveTemplateName,
    saveTemplateDesc,
    savingTemplate,
    onSelectAreaMode,
    onSelectPattern,
    onApplyCentered,
    onApplyPattern,
    onApplyDrawn,
    onClearDrawn,
    onResetDraft,
    onSelectTemplate,
    onLoadTemplate,
    onRefreshTemplates,
    onShowSaveForm,
    onHideSaveForm,
    onSaveTemplateNameChange,
    onSaveTemplateDescChange,
    onSaveCurrentArea,
}: Props) {
    const { t } = useTranslation();

    return (
        <div className="wizard-area-panel">
            <div className="wizard-area-panel-header">
                <div>
                    <h3>{t('wizard.areaTitle')}</h3>
                    <p className="wizard-hint">{t('wizard.areaDesc')}</p>
                </div>
                <div className="wizard-area-chip-stack">
                    <span className="wizard-area-saved-chip">{savedAreaSummary}</span>
                    <span className="wizard-area-footprint-chip">{t('wizard.areaFootprintLimit')}</span>
                </div>
            </div>

            <div className="wizard-area-stats-row">
                <span className="wizard-area-stat">{areaStatsText}</span>
                <span className="wizard-area-stat">{t('wizard.rulesTileSizeLimit', { max: maxTileSizeText })}</span>
            </div>

            <AreaModeSelector
                areaMode={areaMode}
                selectedPattern={selectedPattern}
                patternFitsFootprint={patternFitsFootprint}
                onSelectAreaMode={onSelectAreaMode}
                onSelectPattern={onSelectPattern}
                onApplyCentered={onApplyCentered}
                onApplyPattern={onApplyPattern}
            />

            {areaMode === 'Drawn' && (
                <HexDrawingCanvas
                    drawnCells={drawnCells}
                    minDrawnHexCount={minDrawnHexCount}
                    drawIsLargeEnough={drawIsLargeEnough}
                    drawIsConnected={drawIsConnected}
                    drawFitsFootprint={drawFitsFootprint}
                    canApplyDrawn={canApplyDrawn}
                    onApplyDrawn={onApplyDrawn}
                    onClearDrawn={onClearDrawn}
                    onResetDraft={onResetDraft}
                />
            )}

            {areaMode === 'Template' && (
                <TemplateManager
                    templates={templates}
                    selectedTemplateId={selectedTemplateId}
                    templateLoading={templateLoading}
                    canUseTemplates={canUseTemplates}
                    hasSavedArea={hasSavedArea}
                    showSaveForm={showSaveForm}
                    saveTemplateName={saveTemplateName}
                    saveTemplateDesc={saveTemplateDesc}
                    savingTemplate={savingTemplate}
                    onSelectTemplate={onSelectTemplate}
                    onLoadTemplate={onLoadTemplate}
                    onRefreshTemplates={onRefreshTemplates}
                    onShowSaveForm={onShowSaveForm}
                    onHideSaveForm={onHideSaveForm}
                    onSaveTemplateNameChange={onSaveTemplateNameChange}
                    onSaveTemplateDescChange={onSaveTemplateDescChange}
                    onSaveCurrentArea={onSaveCurrentArea}
                />
            )}
        </div>
    );
}
