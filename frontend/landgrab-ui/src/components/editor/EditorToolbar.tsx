import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface EditorToolbarProps {
  name: string;
  description: string;
  tileSizeMeters: number;
  hexCount: number;
  isConnected: boolean;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onTileSizeChange: (size: number) => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
  isNew: boolean;
}

const MIN_HEXES = 7;
const MIN_TILE = 15;
const MAX_TILE = 1000;
const MAX_NAME = 100;
const MAX_DESC = 500;

export function EditorToolbar({
  name,
  description,
  tileSizeMeters,
  hexCount,
  isConnected,
  onNameChange,
  onDescriptionChange,
  onTileSizeChange,
  onSave,
  onBack,
  saving,
  isNew,
}: EditorToolbarProps) {
  const { t } = useTranslation();
  const trimmedName = name.trim();
  const canSave =
    trimmedName.length > 0 &&
    hexCount >= MIN_HEXES &&
    isConnected &&
    !saving;

  const hints = useMemo(() => {
    const list: string[] = [];
    if (!trimmedName) list.push(t('mapEditor.needName'));
    if (hexCount < MIN_HEXES)
      list.push(t('mapEditor.needMoreHexesDetailed', { min: MIN_HEXES, count: hexCount }));
    if (hexCount > 0 && !isConnected)
      list.push(t('mapEditor.needConnected'));
    return list;
  }, [trimmedName, hexCount, isConnected, t]);

  const handleTileSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (Number.isNaN(raw)) return;
    onTileSizeChange(Math.max(MIN_TILE, Math.min(MAX_TILE, raw)));
  };

  return (
    <aside className="map-editor-toolbar">
      <h2 className="map-editor-toolbar__title">
        {isNew ? t('mapEditor.newTemplate') : t('mapEditor.editTemplate')}
      </h2>

      {/* Name */}
      <div className="map-editor-toolbar__section">
        <label className="map-editor-toolbar__label" htmlFor="tpl-name">
          {t('mapEditor.templateName')} *
        </label>
        <input
          id="tpl-name"
          type="text"
          className="map-editor-toolbar__input"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          maxLength={MAX_NAME}
          placeholder={t('mapEditor.templateNamePlaceholder')}
        />
      </div>

      {/* Description */}
      <div className="map-editor-toolbar__section">
        <label className="map-editor-toolbar__label" htmlFor="tpl-desc">
          {t('mapEditor.templateDescription')}
        </label>
        <textarea
          id="tpl-desc"
          className="map-editor-toolbar__input map-editor-toolbar__textarea"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          maxLength={MAX_DESC}
          placeholder={t('mapEditor.descriptionPlaceholder')}
          rows={3}
        />
      </div>

      {/* Tile size */}
      <div className="map-editor-toolbar__section">
        <label className="map-editor-toolbar__label" htmlFor="tpl-tile-size">
          {t('mapEditor.tileSizeMeters')}
        </label>
        <input
          id="tpl-tile-size"
          type="number"
          className="map-editor-toolbar__input"
          value={tileSizeMeters}
          onChange={handleTileSizeChange}
          min={MIN_TILE}
          max={MAX_TILE}
          step={5}
        />
      </div>

      {/* Stats */}
      <div className="map-editor-toolbar__stats">
        <div className="map-editor-toolbar__stat">
          <span className="map-editor-toolbar__stat-label">{t('mapEditor.hexes')}</span>
          <span className="map-editor-toolbar__stat-value">{hexCount}</span>
        </div>
        <div className="map-editor-toolbar__stat">
          <span className="map-editor-toolbar__stat-label">{t('mapEditor.connected')}</span>
          <span
            className={`map-editor-toolbar__stat-value ${
              hexCount === 0
                ? ''
                : isConnected
                  ? 'map-editor-toolbar__stat-value--ok'
                  : 'map-editor-toolbar__stat-value--warn'
            }`}
          >
            {hexCount === 0 ? '—' : isConnected ? t('mapEditor.connectedYes') : t('mapEditor.connectedNo')}
          </span>
        </div>
      </div>

      {/* Validation hints */}
      {hints.length > 0 && (
        <ul className="map-editor-toolbar__hints">
          {hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div className="map-editor-toolbar__actions">
        <button
          className="map-editor-toolbar__btn map-editor-toolbar__btn--primary"
          disabled={!canSave}
          onClick={onSave}
        >
          {saving ? t('mapEditor.saving') : isNew ? t('mapEditor.create') : t('mapEditor.update')}
        </button>
        <button
          className="map-editor-toolbar__btn map-editor-toolbar__btn--ghost"
          onClick={onBack}
        >
          {t('mapEditor.back')}
        </button>
      </div>
    </aside>
  );
}
