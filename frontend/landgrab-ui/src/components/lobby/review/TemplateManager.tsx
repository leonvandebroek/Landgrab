import { useTranslation } from 'react-i18next';
import type { MapTemplate } from '../../../types/game';

interface Props {
    templates: MapTemplate[];
    selectedTemplateId: string;
    templateLoading: boolean;
    /** Whether the invoke channel is available (controls button/form disabled state). */
    canUseTemplates: boolean;
    hasSavedArea: boolean;
    showSaveForm: boolean;
    saveTemplateName: string;
    saveTemplateDesc: string;
    savingTemplate: boolean;
    onSelectTemplate: (templateId: string) => void;
    onLoadTemplate: () => void;
    onRefreshTemplates: () => void;
    onShowSaveForm: () => void;
    onHideSaveForm: () => void;
    onSaveTemplateNameChange: (name: string) => void;
    onSaveTemplateDescChange: (description: string) => void;
    onSaveCurrentArea: () => void;
}

export function TemplateManager({
    templates,
    selectedTemplateId,
    templateLoading,
    canUseTemplates,
    hasSavedArea,
    showSaveForm,
    saveTemplateName,
    saveTemplateDesc,
    savingTemplate,
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
        <div className="wizard-area-mode-panel">
            <p className="wizard-hint">{t('mapEditor.areaTemplateHint')}</p>

            {templateLoading && (
                <p className="wizard-hint">{t('mapEditor.loading')}</p>
            )}

            {!templateLoading && templates.length === 0 && (
                <p className="wizard-hint">{t('mapEditor.noTemplates')}</p>
            )}

            {!templateLoading && templates.length > 0 && (
                <div className="wizard-area-actions">
                    <select
                        value={selectedTemplateId}
                        onChange={event => onSelectTemplate(event.target.value)}
                        className="wizard-template-select"
                        aria-label={t('mapEditor.selectTemplate')}
                        title={t('mapEditor.selectTemplate')}
                    >
                        <option value="" disabled>
                            {t('mapEditor.selectTemplate')}
                        </option>
                        {templates.map(template => (
                            <option key={template.id} value={template.id}>
                                {template.name} ({template.hexCount} hexes)
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={onLoadTemplate}
                        disabled={!selectedTemplateId || !canUseTemplates}
                    >
                        {t('mapEditor.loadTemplate')}
                    </button>
                </div>
            )}

            <button
                type="button"
                className="btn-ghost small"
                onClick={onRefreshTemplates}
            >
                {t('mapEditor.refreshTemplates')}
            </button>

            {hasSavedArea && (
                <div className="wizard-area-save-template">
                    {!showSaveForm ? (
                        <button
                            type="button"
                            className="btn-ghost small"
                            onClick={onShowSaveForm}
                            disabled={!canUseTemplates}
                        >
                            {t('mapEditor.saveAsTemplate')}
                        </button>
                    ) : (
                        <div className="wizard-area-save-form">
                            <input
                                type="text"
                                value={saveTemplateName}
                                onChange={event => onSaveTemplateNameChange(event.target.value)}
                                placeholder={t('mapEditor.templateName')}
                            />
                            <input
                                type="text"
                                value={saveTemplateDesc}
                                onChange={event => onSaveTemplateDescChange(event.target.value)}
                                placeholder={t('mapEditor.templateDescription')}
                            />
                            <div className="wizard-area-actions">
                                <button
                                    type="button"
                                    className="btn-secondary"
                                    onClick={onSaveCurrentArea}
                                    disabled={!saveTemplateName.trim() || savingTemplate}
                                >
                                    {savingTemplate
                                        ? t('mapEditor.saving')
                                        : t('mapEditor.saveCurrentArea')}
                                </button>
                                <button
                                    type="button"
                                    className="btn-ghost small"
                                    onClick={onHideSaveForm}
                                >
                                    {t('mapEditor.cancel')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
