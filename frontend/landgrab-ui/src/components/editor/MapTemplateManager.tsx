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
  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete template "${name}"? This cannot be undone.`)) {
      onDelete(id);
    }
  };

  if (loading) {
    return (
      <div className="map-editor-templates">
        <div className="map-editor-templates__header">
          <h2>Map Templates</h2>
        </div>
        <div className="map-editor-templates__loading">Loading templates…</div>
      </div>
    );
  }

  return (
    <div className="map-editor-templates">
      <div className="map-editor-templates__header">
        <h2>Map Templates</h2>
        <button className="btn-primary" onClick={onCreateNew}>
          + Create New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="map-editor-empty">
          <div className="map-editor-empty__icon">🗺️</div>
          <h3>No templates yet</h3>
          <p>Create your first map template to get started designing custom game boards.</p>
          <button className="btn-primary big" onClick={onCreateNew}>
            Create Your First Template
          </button>
        </div>
      ) : (
        <div className="map-editor-templates__grid">
          {templates.map((t) => (
            <div key={t.id} className="map-editor-card">
              <div
                className="map-editor-card__body"
                onClick={() => onEdit(t)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onEdit(t);
                }}
              >
                <h3 className="map-editor-card__name">{t.name}</h3>
                {t.description && (
                  <p className="map-editor-card__desc">{t.description}</p>
                )}
                <div className="map-editor-card__meta">
                  <span className="map-editor-card__badge">{t.hexCount} hexes</span>
                  <span className="map-editor-card__badge">{t.tileSizeMeters}m tiles</span>
                </div>
                <div className="map-editor-card__date">
                  Updated {new Date(t.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="map-editor-card__actions">
                <button
                  className="btn-secondary"
                  onClick={() => onEdit(t)}
                  title="Edit"
                >
                  ✏️ Edit
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => onDuplicate(t.id)}
                  title="Duplicate"
                >
                  📋 Duplicate
                </button>
                <button
                  className="btn-secondary map-editor-card__delete"
                  onClick={() => handleDelete(t.id, t.name)}
                  title="Delete"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
