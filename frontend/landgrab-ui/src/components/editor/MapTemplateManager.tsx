import { useTranslation } from 'react-i18next';
import type { MapTemplate } from '../../types/game';

interface MapTemplateManagerProps {
  templates: MapTemplate[];
  loading: boolean;
  onCreateNew: () => void;
  onEdit: (template: MapTemplate) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export function MapTemplateManager({
  templates,
  loading,
  onCreateNew,
  onEdit,
  onDelete,
  onDuplicate,
}: MapTemplateManagerProps) {
  const { t } = useTranslation();

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(t('mapEditor.deleteConfirm', { name }))) {
      onDelete(id);
    }
  };

  if (loading) {
    return (
      <div className="map-editor-templates">
        <div className="map-editor-templates__header">
          <h2>{t('mapEditor.title')}</h2>
        </div>
        <div className="map-editor-templates__loading">{t('mapEditor.loading')}</div>
      </div>
    );
  }

  return (
    <div className="map-editor-templates">
      <div className="map-editor-templates__header">
        <h2>{t('mapEditor.title')}</h2>
        <button className="btn-primary" onClick={onCreateNew}>
          + {t('mapEditor.createNew')}
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="map-editor-empty">
          <div className="map-editor-empty__icon">🗺️</div>
          <h3>{t('mapEditor.noTemplatesYet')}</h3>
          <p>{t('mapEditor.emptyMessage')}</p>
          <button className="btn-primary big" onClick={onCreateNew}>
            {t('mapEditor.createFirst')}
          </button>
        </div>
      ) : (
        <div className="map-editor-templates__grid">
          {templates.map((tpl) => (
            <div key={tpl.id} className="map-editor-card">
              <div
                className="map-editor-card__body"
                onClick={() => onEdit(tpl)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEdit(tpl);
                }}
              >
                <h3 className="map-editor-card__name">{tpl.name}</h3>
                {tpl.description && (
                  <p className="map-editor-card__desc">{tpl.description}</p>
                )}
                <div className="map-editor-card__meta">
                  <span className="map-editor-card__badge">
                    {t('mapEditor.hexCount', { count: tpl.hexCount })}
                  </span>
                  <span className="map-editor-card__badge">
                    {t('mapEditor.tileBadge', { size: tpl.tileSizeMeters })}
                  </span>
                </div>
                <div className="map-editor-card__date">
                  {t('mapEditor.updated', { date: new Date(tpl.updatedAt).toLocaleDateString() })}
                </div>
              </div>
              <div className="map-editor-card__actions">
                <button
                  className="btn-secondary"
                  onClick={() => onEdit(tpl)}
                  title={t('mapEditor.edit')}
                >
                  ✏️ {t('mapEditor.edit')}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => onDuplicate(tpl.id)}
                  title={t('mapEditor.duplicate')}
                >
                  📋 {t('mapEditor.duplicate')}
                </button>
                <button
                  className="btn-secondary map-editor-card__delete"
                  onClick={() => handleDelete(tpl.id, tpl.name)}
                  title={t('mapEditor.delete')}
                >
                  🗑️ {t('mapEditor.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
