import { useMemo, useState, useRef, useEffect } from 'react';
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
  onClearAll: () => void;
  onFlyTo: (lat: number, lng: number) => void;
  saving: boolean;
  isNew: boolean;
}

const MIN_HEXES = 7;
const MIN_TILE = 10;
const MAX_TILE = 500;
const MAX_NAME = 100;
const MAX_DESC = 500;

// Logarithmic slider for better control at small sizes
const SLIDER_MIN = Math.log(MIN_TILE);
const SLIDER_MAX = Math.log(MAX_TILE);
const SLIDER_STEPS = 200;

function sizeToSlider(size: number): number {
  return ((Math.log(size) - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * SLIDER_STEPS;
}

function sliderToSize(val: number): number {
  const logVal = SLIDER_MIN + (val / SLIDER_STEPS) * (SLIDER_MAX - SLIDER_MIN);
  return Math.round(Math.exp(logVal));
}

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
  onClearAll,
  onFlyTo,
  saving,
  isNew,
}: EditorToolbarProps) {
  const { t, i18n } = useTranslation();
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

  // ── Location search ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchAbortRef = useRef<AbortController | null>(null);

  // Abort any pending fetch + timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchAbortRef.current?.abort();
    };
  }, []);

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    // Cancel previous timer + in-flight request
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchAbortRef.current?.abort();

    if (query.trim().length < 3) {
      setSearchResults([]);
      setShowResults(false);
      setSearching(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSearching(true);
      try {
        const encoded = encodeURIComponent(query.trim());
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&addressdetails=0`,
          {
            signal: controller.signal,
            headers: { 'Accept-Language': i18n.language },
          }
        );
        if (res.ok) {
          const data = await res.json() as Array<{ display_name: string; lat: string; lon: string }>;
          setSearchResults(data);
          setShowResults(data.length > 0);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          // silently fail for genuine network errors
        }
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSelectLocation = (lat: string, lon: string) => {
    onFlyTo(parseFloat(lat), parseFloat(lon));
    setShowResults(false);
    setSearchQuery('');
  };

  const handleTileSizeSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = sliderToSize(parseInt(e.target.value, 10));
    onTileSizeChange(Math.max(MIN_TILE, Math.min(MAX_TILE, newSize)));
  };

  const handleTileSizeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (Number.isNaN(raw)) return;
    onTileSizeChange(Math.max(MIN_TILE, Math.min(MAX_TILE, raw)));
  };

  return (
    <aside className="map-editor-toolbar">
      <h2 className="map-editor-toolbar__title">
        {isNew ? t('mapEditor.newTemplate') : t('mapEditor.editTemplate')}
      </h2>

      {/* Location search */}
      <div className="map-editor-toolbar__section">
        <label className="map-editor-toolbar__label" htmlFor="tpl-search">
          {t('mapEditor.searchLocation')}
        </label>
        <div className="map-editor-toolbar__search-wrap">
          <input
            id="tpl-search"
            type="text"
            className="map-editor-toolbar__input"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('mapEditor.searchPlaceholder')}
            autoComplete="off"
          />
          {searching && <span className="map-editor-toolbar__search-spinner" />}
        </div>
        {showResults && (
          <ul className="map-editor-toolbar__search-results">
            {searchResults.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="map-editor-toolbar__search-result"
                  onClick={() => handleSelectLocation(r.lat, r.lon)}
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Hex tile size slider */}
      <div className="map-editor-toolbar__section">
        <label className="map-editor-toolbar__label" htmlFor="tpl-tile-slider">
          {t('mapEditor.tileSizeMeters')}
        </label>
        <div className="map-editor-toolbar__slider-wrap">
          <input
            id="tpl-tile-slider"
            type="range"
            className="map-editor-toolbar__slider"
            min={0}
            max={SLIDER_STEPS}
            step={1}
            value={sizeToSlider(tileSizeMeters)}
            onChange={handleTileSizeSlider}
          />
          <div className="map-editor-toolbar__slider-value">
            <input
              type="number"
              className="map-editor-toolbar__input map-editor-toolbar__input--small"
              value={tileSizeMeters}
              onChange={handleTileSizeInput}
              min={MIN_TILE}
              max={MAX_TILE}
              step={5}
            />
            <span className="map-editor-toolbar__slider-unit">m</span>
          </div>
        </div>
        <div className="map-editor-toolbar__slider-labels">
          <span>{MIN_TILE}m</span>
          <span>{MAX_TILE}m</span>
        </div>
      </div>

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
          rows={2}
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
        {hexCount > 0 && (
          <button
            type="button"
            className="map-editor-toolbar__btn map-editor-toolbar__btn--danger"
            onClick={onClearAll}
          >
            {t('mapEditor.clear')}
          </button>
        )}
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
