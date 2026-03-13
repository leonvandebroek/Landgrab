import { useState, useEffect, useCallback } from 'react';
import type {
  MapTemplate,
  MapTemplateDetail,
  HexCoordinate,
} from '../../types/game';
import {
  listMapTemplates,
  getMapTemplate,
  createMapTemplate,
  updateMapTemplate,
  deleteMapTemplate,
  duplicateMapTemplate,
} from '../../api/mapTemplateApi';
import { MapTemplateManager } from './MapTemplateManager';
import { MapEditor } from './MapEditor';
import { EditorToolbar } from './EditorToolbar';

interface MapEditorPageProps {
  token: string;
  onBack: () => void;
}

export function MapEditorPage({ token, onBack }: MapEditorPageProps) {
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [templates, setTemplates] = useState<MapTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<MapTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Shared editor state — synced between MapEditor and EditorToolbar
  const [selectedCoords, setSelectedCoords] = useState<HexCoordinate[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tileSizeMeters, setTileSizeMeters] = useState(50);

  // Derived stats
  const hexCount = selectedCoords.length;
  const isConnected = checkConnected(selectedCoords);

  // ── Data fetching ────────────────────────────────────────────

  const fetchTemplates = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const data = await listMapTemplates(token);
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // ── List-view actions ────────────────────────────────────────

  const handleCreateNew = () => {
    setEditingTemplate(null);
    setSelectedCoords([]);
    setName('');
    setDescription('');
    setTileSizeMeters(50);
    setError('');
    setView('editor');
  };

  const handleEdit = async (template: MapTemplate) => {
    setError('');
    setLoading(true);
    try {
      const detail = await getMapTemplate(token, template.id);
      setEditingTemplate(detail);
      setSelectedCoords(detail.coordinates);
      setName(detail.name);
      setDescription(detail.description ?? '');
      setTileSizeMeters(detail.tileSizeMeters);
      setView('editor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await deleteMapTemplate(token, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleDuplicate = async (id: string) => {
    setError('');
    try {
      const duplicated = await duplicateMapTemplate(token, id);
      setTemplates((prev) => [...prev, duplicated]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate template');
    }
  };

  // ── Editor-view actions ──────────────────────────────────────

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      if (editingTemplate) {
        await updateMapTemplate(token, editingTemplate.id, {
          name,
          description,
          coordinates: selectedCoords,
          tileSizeMeters,
        });
      } else {
        await createMapTemplate(token, {
          name,
          description,
          coordinates: selectedCoords,
          tileSizeMeters,
        });
      }
      setView('list');
      setEditingTemplate(null);
      await fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleEditorBack = () => {
    setView('list');
    setEditingTemplate(null);
    setError('');
  };

  const handleBack = () => {
    if (view === 'editor') {
      handleEditorBack();
    } else {
      onBack();
    }
  };

  const handleCoordinatesChange = useCallback((coords: HexCoordinate[]) => {
    setSelectedCoords(coords);
  }, []);

  // ── Render: Editor view ──────────────────────────────────────

  if (view === 'editor') {
    return (
      <div className="map-editor-page">
        {error && <div className="map-editor-page__error">{error}</div>}
        <div className="map-editor-layout">
          <div className="map-editor-layout__toolbar">
            <EditorToolbar
              name={name}
              description={description}
              tileSizeMeters={tileSizeMeters}
              hexCount={hexCount}
              isConnected={isConnected}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onTileSizeChange={setTileSizeMeters}
              onSave={handleSave}
              onBack={handleBack}
              saving={saving}
              isNew={editingTemplate === null}
            />
          </div>
          <div className="map-editor-layout__canvas">
            <MapEditor
              coordinates={selectedCoords}
              onCoordinatesChange={handleCoordinatesChange}
              tileSizeMeters={tileSizeMeters}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Render: List view ────────────────────────────────────────

  return (
    <div className="map-editor-page">
      <div className="map-editor-page__nav">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
      </div>
      {error && <div className="map-editor-page__error">{error}</div>}
      <MapTemplateManager
        templates={templates}
        loading={loading}
        onCreateNew={handleCreateNew}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

/** Check whether all hex coordinates form a single connected group (flood-fill). */
function checkConnected(coords: HexCoordinate[]): boolean {
  if (coords.length <= 1) return true;

  const key = (q: number, r: number) => `${q},${r}`;
  const coordSet = new Set(coords.map((c) => key(c.q, c.r)));
  const visited = new Set<string>();
  const stack = [coords[0]];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    const k = key(cur.q, cur.r);
    if (visited.has(k)) continue;
    visited.add(k);

    // Six axial hex neighbors
    const neighbors = [
      { q: cur.q + 1, r: cur.r },
      { q: cur.q - 1, r: cur.r },
      { q: cur.q, r: cur.r + 1 },
      { q: cur.q, r: cur.r - 1 },
      { q: cur.q + 1, r: cur.r - 1 },
      { q: cur.q - 1, r: cur.r + 1 },
    ];

    for (const n of neighbors) {
      const nk = key(n.q, n.r);
      if (coordSet.has(nk) && !visited.has(nk)) {
        stack.push(n);
      }
    }
  }

  return visited.size === coords.length;
}
