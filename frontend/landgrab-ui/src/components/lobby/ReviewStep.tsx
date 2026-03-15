import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameAreaMode, GameAreaPattern, GameState, HexCell, HexCoordinate, MapTemplate } from '../../types/game';
import { listMapTemplates } from '../../api/mapTemplateApi';
import { GameMap } from '../map/GameMap';
import { hexKey } from '../map/HexMath';
import { CustomSelect } from './CustomSelect';
import {
    buildCenteredGameArea,
    buildDrawingCanvas,
    buildPatternGameArea,
    GAME_AREA_PATTERNS,
    getAreaFootprintMetrics,
    getMaxFootprintMeters,
    getMaxTileSizeForArea,
    isConnectedArea,
} from './gameAreaShapes';

type AreaModeOption = GameAreaMode | 'Template';

const MIN_DRAWN_HEX_COUNT = 7;

interface LocationPoint {
    lat: number;
    lng: number;
}

interface Props {
    gameState: GameState;
    myUserId: string;
    authToken: string;
    isHost: boolean;
    currentLocation: LocationPoint | null;
    canStart: boolean;
    onUseCenteredGameArea: () => void;
    onSetPatternGameArea: (pattern: GameAreaPattern) => void;
    onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
    onSetMasterTileByHex: (q: number, r: number) => void;
    onAssignStartingTile: (q: number, r: number, playerId: string) => void;
    onSetAllianceHQ?: (q: number, r: number, allianceId: string) => void;
    onStartGame: () => void;
    invoke?: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export function ReviewStep({
    gameState,
    myUserId,
    authToken,
    isHost,
    currentLocation,
    canStart,
    onUseCenteredGameArea,
    onSetPatternGameArea,
    onSetCustomGameArea,
    onSetMasterTileByHex,
    onAssignStartingTile,
    onSetAllianceHQ,
    onStartGame,
    invoke,
}: Props) {
    const { t } = useTranslation();
    const [showCustomize, setShowCustomize] = useState(false);
    const [selectedHex, setSelectedHex] = useState<[number, number] | null>(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [areaModeDraft, setAreaModeDraft] = useState<AreaModeOption | null>(null);
    const [selectedPatternDraft, setSelectedPatternDraft] = useState<GameAreaPattern | null>(null);
    const [drawnCellsDraft, setDrawnCellsDraft] = useState<HexCoordinate[] | null>(null);
    const [hqMode, setHqMode] = useState(false);
    const [hqAllianceId, setHqAllianceId] = useState<string | null>(null);

    // Template state
    const [templates, setTemplates] = useState<MapTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateLoading, setTemplateLoading] = useState(false);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [saveTemplateName, setSaveTemplateName] = useState('');
    const [saveTemplateDesc, setSaveTemplateDesc] = useState('');
    const [savingTemplate, setSavingTemplate] = useState(false);

    const mapIsReady = gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null;
    const masterTileReady = gameState.masterTileQ != null && gameState.masterTileR != null;
    const drawingCanvas = useMemo(() => buildDrawingCanvas(), []);
    const savedDrawnCells = useMemo(
        () => Object.values(gameState.grid).map(cell => ({ q: cell.q, r: cell.r })),
        [gameState.grid]
    );
    const areaMode = areaModeDraft ?? gameState.gameAreaMode;
    const selectedPattern = selectedPatternDraft ?? gameState.gameAreaPattern ?? 'WideFront';
    const drawnCells = drawnCellsDraft ?? savedDrawnCells;

    const effectiveSelectedPlayerId = gameState.players.some(p => p.id === selectedPlayerId)
        ? selectedPlayerId
        : gameState.players.find(p => p.territoryCount === 0)?.id ?? gameState.players[0]?.id ?? '';

    const drawnCellKeys = useMemo(
        () => new Set(drawnCells.map(cell => hexKey(cell.q, cell.r))),
        [drawnCells]
    );

    const previewCells = useMemo(() => {
        switch (areaMode) {
            case 'Drawn':
                return drawingCanvas;
            case 'Pattern':
                return buildPatternGameArea(selectedPattern);
            case 'Template':
                return savedDrawnCells.length > 0 ? savedDrawnCells : buildCenteredGameArea();
            case 'Centered':
            default:
                return buildCenteredGameArea();
        }
    }, [areaMode, drawingCanvas, selectedPattern, savedDrawnCells]);

    const previewGrid = useMemo(() => buildPreviewGrid(previewCells, gameState.grid), [gameState.grid, previewCells]);
    const inactiveHexKeys = useMemo(() => {
        if (areaMode !== 'Drawn') {
            return [];
        }

        return drawingCanvas
            .filter(cell => !drawnCellKeys.has(hexKey(cell.q, cell.r)))
            .map(cell => hexKey(cell.q, cell.r));
    }, [areaMode, drawingCanvas, drawnCellKeys]);

    const savedAreaSummary = useMemo(() => {
        switch (gameState.gameAreaMode) {
            case 'Drawn':
                return t('wizard.areaSavedDrawn', { count: Object.keys(gameState.grid).length });
            case 'Pattern':
                return t(`wizard.areaPattern.${gameState.gameAreaPattern ?? 'WideFront'}.title`);
            case 'Centered':
            default:
                return t('wizard.areaModeCentered');
        }
    }, [gameState.gameAreaMode, gameState.gameAreaPattern, gameState.grid, t]);

    const activeAreaCells = areaMode === 'Drawn' ? drawnCells : previewCells;
    const previewMetrics = useMemo(
        () => getAreaFootprintMetrics(activeAreaCells, gameState.tileSizeMeters),
        [activeAreaCells, gameState.tileSizeMeters]
    );
    const previewMaxTileSize = useMemo(
        () => getMaxTileSizeForArea(activeAreaCells, gameState.maxFootprintMetersOverride),
        [activeAreaCells, gameState.maxFootprintMetersOverride]
    );
    const drawIsConnected = useMemo(() => isConnectedArea(drawnCells), [drawnCells]);
    const drawIsLargeEnough = drawnCells.length >= MIN_DRAWN_HEX_COUNT;
    const maxFootprint = getMaxFootprintMeters(gameState.maxFootprintMetersOverride);
    const drawFitsFootprint = previewMetrics.maxDimensionMeters <= maxFootprint;
    const canApplyDrawn = drawIsConnected && drawIsLargeEnough && drawFitsFootprint;
    const patternFitsFootprint = previewMetrics.maxDimensionMeters <= maxFootprint;
    const areaStatsText = t('wizard.areaStats', {
        count: activeAreaCells.length,
        footprint: formatDistance(Math.round(previewMetrics.maxDimensionMeters)),
    });

    // Template fetching
    const fetchTemplates = useCallback(async () => {
        setTemplateLoading(true);
        try {
            const list = await listMapTemplates(authToken);
            setTemplates(list);
        } catch {
            // Template fetch errors are non-critical
        } finally {
            setTemplateLoading(false);
        }
    }, [authToken]);

    useEffect(() => {
        if (areaMode === 'Template') {
            void fetchTemplates();
        }
    }, [areaMode, fetchTemplates]);

    const handleLoadTemplate = useCallback(async () => {
        if (!invoke || !selectedTemplateId) return;
        try {
            await invoke('LoadMapTemplate', gameState.roomCode, selectedTemplateId);
        } catch {
            // Error handled by server broadcast
        }
    }, [invoke, selectedTemplateId, gameState.roomCode]);

    const handleSaveAsTemplate = useCallback(async () => {
        if (!invoke || !saveTemplateName.trim()) return;
        setSavingTemplate(true);
        try {
            const desc = saveTemplateDesc.trim() || undefined;
            await invoke('SaveCurrentAreaAsTemplate', gameState.roomCode, saveTemplateName.trim(), desc);
            setSaveTemplateName('');
            setSaveTemplateDesc('');
            setShowSaveForm(false);
            void fetchTemplates();
        } catch {
            // Error handled by server broadcast
        } finally {
            setSavingTemplate(false);
        }
    }, [invoke, saveTemplateName, saveTemplateDesc, gameState.roomCode, fetchTemplates]);

    const handleAreaHexClick = (q: number, r: number, cell: HexCell | undefined) => {
        if (hqMode && hqAllianceId && onSetAllianceHQ) {
            onSetAllianceHQ(q, r, hqAllianceId);
            setHqMode(false);
            setHqAllianceId(null);
            setSelectedHex(null);
            return;
        }

        if (areaMode === 'Drawn') {
            setSelectedHex([q, r]);
            setDrawnCellsDraft(previousDraft => {
                const previous = previousDraft ?? drawnCells;
                const key = hexKey(q, r);
                if (previous.some(existing => hexKey(existing.q, existing.r) === key)) {
                    return previous.filter(existing => hexKey(existing.q, existing.r) !== key);
                }

                return [...previous, { q, r }];
            });
            return;
        }

        if (!cell?.isMasterTile) {
            setSelectedHex([q, r]);
        }
    };

    const clearAreaDraft = () => {
        setAreaModeDraft(null);
        setSelectedPatternDraft(null);
        setDrawnCellsDraft(null);
    };

    const resetAreaDraft = () => {
        clearAreaDraft();
        setSelectedHex(null);
    };

    return (
        <div className="wizard-step wizard-step-review">
            <div className="wizard-step-header">
                <h2>{t('wizard.reviewTitle')}</h2>
                <p className="wizard-step-desc">{t('wizard.reviewDesc')}</p>
            </div>

            <div className="wizard-step-body">
                {/* Summary */}
                <div className="wizard-review-grid">
                    <div className="wizard-review-item">
                        <span className="wizard-review-label">{t('wizard.reviewLocation')}</span>
                        <span className="wizard-review-value">
                            {gameState.mapLat != null && gameState.mapLng != null
                                ? `${gameState.mapLat.toFixed(5)}, ${gameState.mapLng.toFixed(5)}`
                                : '—'}
                        </span>
                    </div>
                    <div className="wizard-review-item">
                        <span className="wizard-review-label">{t('wizard.reviewPlayers')}</span>
                        <span className="wizard-review-value">
                            {gameState.players.map(p => p.name).join(', ')}
                        </span>
                    </div>
                    <div className="wizard-review-item">
                        <span className="wizard-review-label">{t('wizard.reviewAlliances')}</span>
                        <span className="wizard-review-value">
                            {gameState.alliances.map(a => a.name).join(', ') || '—'}
                        </span>
                    </div>
                    <div className="wizard-review-item">
                        <span className="wizard-review-label">{t('wizard.reviewRules')}</span>
                        <span className="wizard-review-value">
                            {formatDistance(gameState.tileSizeMeters)} · {t(`claimMode.${gameState.claimMode}.title`)} · {t(`winCondition.${gameState.winConditionType}`)}
                        </span>
                    </div>
                </div>

                <p className="wizard-hint">{t('wizard.reviewAutoPlaceNote')}</p>

                {isHost && mapIsReady && (
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
                            <span className="wizard-area-stat">{t('wizard.rulesTileSizeLimit', { max: formatDistance(previewMaxTileSize) })}</span>
                        </div>

                        <div className="wizard-area-mode-tabs">
                            <button
                                type="button"
                                className={`wizard-area-mode-tab${areaMode === 'Drawn' ? ' is-active' : ''}`}
                                onClick={() => setAreaModeDraft('Drawn')}
                            >
                                {t('wizard.areaModeDrawn')}
                            </button>
                            <button
                                type="button"
                                className={`wizard-area-mode-tab${areaMode === 'Centered' ? ' is-active' : ''}`}
                                onClick={() => setAreaModeDraft('Centered')}
                            >
                                {t('wizard.areaModeCentered')}
                            </button>
                            <button
                                type="button"
                                className={`wizard-area-mode-tab${areaMode === 'Pattern' ? ' is-active' : ''}`}
                                onClick={() => setAreaModeDraft('Pattern')}
                            >
                                {t('wizard.areaModePattern')}
                            </button>
                            <button
                                type="button"
                                className={`wizard-area-mode-tab${areaMode === 'Template' ? ' is-active' : ''}`}
                                onClick={() => setAreaModeDraft('Template')}
                            >
                                {t('mapEditor.areaTemplate')}
                            </button>
                        </div>

                        {areaMode === 'Drawn' && (
                            <div className="wizard-area-mode-panel">
                                <p className="wizard-hint">{t('wizard.areaDrawHint', { count: drawnCells.length })}</p>
                                {!drawIsLargeEnough && (
                                    <p className="error-msg wizard-area-validation">{t('wizard.areaTooSmall', { count: MIN_DRAWN_HEX_COUNT })}</p>
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
                                        onClick={() => {
                                            onSetCustomGameArea(drawnCells);
                                            clearAreaDraft();
                                        }}
                                        disabled={!canApplyDrawn}
                                    >
                                        {t('wizard.areaApplyDrawn')}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-ghost small"
                                        onClick={() => setDrawnCellsDraft([])}
                                    >
                                        {t('wizard.areaClearDrawn')}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-ghost small"
                                        onClick={resetAreaDraft}
                                    >
                                        {t('wizard.areaResetDraft')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {areaMode === 'Centered' && (
                            <div className="wizard-area-mode-panel">
                                <p className="wizard-hint">{t('wizard.areaCenteredHint')}</p>
                                <div className="wizard-area-actions">
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => {
                                            onUseCenteredGameArea();
                                            clearAreaDraft();
                                        }}
                                    >
                                        {t('wizard.areaApplyCentered')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {areaMode === 'Pattern' && (
                            <div className="wizard-area-mode-panel">
                                <p className="wizard-hint">{t('wizard.areaSelectedPattern')}: <strong>{t(`wizard.areaPattern.${selectedPattern}.title`)}</strong></p>
                                <div className="wizard-pattern-grid">
                                    {GAME_AREA_PATTERNS.map(pattern => (
                                        <button
                                            key={pattern}
                                            type="button"
                                            className={`wizard-pattern-card${selectedPattern === pattern ? ' is-active' : ''}`}
                                            onClick={() => setSelectedPatternDraft(pattern)}
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
                                        onClick={() => {
                                            onSetPatternGameArea(selectedPattern);
                                            clearAreaDraft();
                                        }}
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

                        {areaMode === 'Template' && (
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
                                            onChange={e => setSelectedTemplateId(e.target.value)}
                                            className="wizard-template-select"
                                            aria-label={t('mapEditor.selectTemplate')}
                                            title={t('mapEditor.selectTemplate')}
                                        >
                                            <option value="" disabled>
                                                {t('mapEditor.selectTemplate')}
                                            </option>
                                            {templates.map(tpl => (
                                                <option key={tpl.id} value={tpl.id}>
                                                    {tpl.name} ({tpl.hexCount} hexes)
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => void handleLoadTemplate()}
                                            disabled={!selectedTemplateId || !invoke}
                                        >
                                            {t('mapEditor.loadTemplate')}
                                        </button>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    className="btn-ghost small"
                                    onClick={() => void fetchTemplates()}
                                >
                                    {t('mapEditor.refreshTemplates')}
                                </button>

                                {/* Save current area as template */}
                                {Object.keys(gameState.grid).length > 0 && (
                                    <div className="wizard-area-save-template">
                                        {!showSaveForm ? (
                                            <button
                                                type="button"
                                                className="btn-ghost small"
                                                onClick={() => setShowSaveForm(true)}
                                                disabled={!invoke}
                                            >
                                                {t('mapEditor.saveAsTemplate')}
                                            </button>
                                        ) : (
                                            <div className="wizard-area-save-form">
                                                <input
                                                    type="text"
                                                    value={saveTemplateName}
                                                    onChange={e => setSaveTemplateName(e.target.value)}
                                                    placeholder={t('mapEditor.templateName')}
                                                />
                                                <input
                                                    type="text"
                                                    value={saveTemplateDesc}
                                                    onChange={e => setSaveTemplateDesc(e.target.value)}
                                                    placeholder={t('mapEditor.templateDescription')}
                                                />
                                                <div className="wizard-area-actions">
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        onClick={() => void handleSaveAsTemplate()}
                                                        disabled={!saveTemplateName.trim() || savingTemplate}
                                                    >
                                                        {savingTemplate
                                                            ? t('mapEditor.saving')
                                                            : t('mapEditor.saveCurrentArea')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-ghost small"
                                                        onClick={() => {
                                                            setShowSaveForm(false);
                                                            setSaveTemplateName('');
                                                            setSaveTemplateDesc('');
                                                        }}
                                                    >
                                                        {t('mapEditor.cancel')}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Map preview */}
                {mapIsReady && (
                    <div className="wizard-map-preview">
                        <GameMap
                            state={gameState}
                            myUserId={myUserId}
                            currentLocation={currentLocation}
                            gridOverride={isHost ? previewGrid : undefined}
                            inactiveHexKeys={isHost ? inactiveHexKeys : undefined}
                            selectedHex={selectedHex}
                            onHexClick={isHost && (areaMode === 'Drawn' || showCustomize) ? handleAreaHexClick : undefined}
                        />
                    </div>
                )}

                {/* Customize toggle */}
                {isHost && (
                    <>
                        <button
                            type="button"
                            className="btn-ghost small"
                            onClick={() => setShowCustomize(v => !v)}
                        >
                            {showCustomize ? t('wizard.reviewCustomizeHide') : t('wizard.reviewCustomizeToggle')}
                        </button>

                        {showCustomize && (
                            <div className="wizard-customize-panel">
                                <p className="wizard-hint">{t('wizard.reviewCustomizeDesc')}</p>

                                {areaMode === 'Drawn' && (
                                    <p className="wizard-hint">{t('wizard.areaDrawCustomizeHint')}</p>
                                )}

                                {selectedHex && areaMode !== 'Drawn' && (
                                    <div className="wizard-customize-actions">
                                        <button
                                            type="button"
                                            className="btn-secondary"
                                            onClick={() => {
                                                onSetMasterTileByHex(selectedHex[0], selectedHex[1]);
                                                setSelectedHex(null);
                                            }}
                                        >
                                            {masterTileReady ? t('lobby.moveMasterTileToSelectedHex') : t('lobby.setMasterTileToSelectedHex')}
                                        </button>

                                        <div className="wizard-customize-assign">
                                            <CustomSelect
                                                value={effectiveSelectedPlayerId}
                                                options={gameState.players.map(player => ({
                                                    value: player.id,
                                                    label: player.name,
                                                }))}
                                                onChange={setSelectedPlayerId}
                                                className="wizard-player-select"
                                            />
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => {
                                                    onAssignStartingTile(selectedHex[0], selectedHex[1], effectiveSelectedPlayerId);
                                                    setSelectedHex(null);
                                                }}
                                                disabled={!masterTileReady}
                                            >
                                                {t('lobby.assignTile')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {gameState.dynamics?.hqEnabled && onSetAllianceHQ && (
                                    <div className="wizard-hq-section">
                                        <h4>{t('phase4.hq' as never)}</h4>
                                        {gameState.alliances.map(alliance => (
                                            <div key={alliance.id} className="wizard-hq-row">
                                                <div>
                                                    <svg className="wizard-hq-swatch" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                                                        <circle cx="6" cy="6" r="6" fill={alliance.color} />
                                                    </svg>
                                                    <strong>{alliance.name}</strong>
                                                    {alliance.hqHexQ != null && alliance.hqHexR != null && (
                                                        <span className="wizard-hq-coords">
                                                            🏛️ ({alliance.hqHexQ}, {alliance.hqHexR})
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`btn-secondary wizard-hq-button${hqMode && hqAllianceId === alliance.id ? ' is-active' : ''}`}
                                                    onClick={() => {
                                                        if (hqMode && hqAllianceId === alliance.id) {
                                                            setHqMode(false);
                                                            setHqAllianceId(null);
                                                        } else {
                                                            setHqMode(true);
                                                            setHqAllianceId(alliance.id);
                                                            setSelectedHex(null);
                                                        }
                                                    }}
                                                >
                                                    {hqMode && hqAllianceId === alliance.id
                                                        ? t('game.cancel' as never)
                                                        : alliance.hqHexQ != null
                                                            ? t('phase4.hq' as never) + ' ✏️'
                                                            : t('phase4.hq' as never) + ' 📍'}
                                                </button>
                                            </div>
                                        ))}
                                        {hqMode && (
                                            <div className="wizard-hq-hint">
                                                📍 Click a hex on the map to place the HQ
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!selectedHex && areaMode !== 'Drawn' && (
                                    <p className="wizard-hint">{t('lobby.hexSelectionNote')}</p>
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Start button */}
                {isHost && (
                    <button
                        type="button"
                        className="btn-primary big wizard-start-button"
                        onClick={onStartGame}
                        disabled={!canStart}
                    >
                        {t('wizard.reviewStartGame')}
                    </button>
                )}

                {!isHost && (
                    <p className="wizard-hint wizard-waiting">{t('wizard.guestWaitingStart')}</p>
                )}
            </div>
        </div>
    );
}

function buildPreviewGrid(cells: HexCoordinate[], baseGrid: Record<string, HexCell>): Record<string, HexCell> {
    return cells.reduce<Record<string, HexCell>>((grid, cell) => {
        const key = hexKey(cell.q, cell.r);
        const existing = baseGrid[key];
        grid[key] = existing ?? {
            q: cell.q,
            r: cell.r,
            troops: 0,
            isMasterTile: false,
        };
        return grid;
    }, {});
}

function formatDistance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}
