import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameAreaPattern, GameState, HexCell, HexCoordinate, MapTemplate } from '../../types/game';
import { listMapTemplates } from '../../api/mapTemplateApi';
import { GameMap } from '../map/GameMap';
import { hexKey } from '../map/HexMath';
import {
    buildCenteredGameArea,
    buildDrawingCanvas,
    buildPatternGameArea,
    getAreaFootprintMetrics,
    getMaxFootprintMeters,
    getMaxTileSizeForArea,
    isConnectedArea,
} from './gameAreaShapes';
import {
    GameStartButton,
    MIN_DRAWN_HEX_COUNT,
    ReviewAreaPanel,
    ReviewCustomizePanel,
    ReviewSummary,
} from './review';
import type { AreaModeOption } from './review';

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

    // ── UI state ─────────────────────────────────────────────────────────────
    const [showCustomize, setShowCustomize] = useState(false);
    const [selectedHex, setSelectedHex] = useState<[number, number] | null>(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState('');

    // ── Area draft state ──────────────────────────────────────────────────────
    const [areaModeDraft, setAreaModeDraft] = useState<AreaModeOption | null>(null);
    const [selectedPatternDraft, setSelectedPatternDraft] = useState<GameAreaPattern | null>(null);
    const [drawnCellsDraft, setDrawnCellsDraft] = useState<HexCoordinate[] | null>(null);

    // ── HQ placement state (lifted so the map-click handler can use it) ───────
    const [hqMode, setHqMode] = useState(false);
    const [hqAllianceId, setHqAllianceId] = useState<string | null>(null);

    // ── Template state ────────────────────────────────────────────────────────
    const [templates, setTemplates] = useState<MapTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateLoading, setTemplateLoading] = useState(false);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [saveTemplateName, setSaveTemplateName] = useState('');
    const [saveTemplateDesc, setSaveTemplateDesc] = useState('');
    const [savingTemplate, setSavingTemplate] = useState(false);

    // ── Derived values ────────────────────────────────────────────────────────
    const mapIsReady = gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null;
    const masterTileReady = gameState.masterTileQ != null && gameState.masterTileR != null;
    const hasSavedArea = Object.keys(gameState.grid).length > 0;

    const drawingCanvas = useMemo(() => buildDrawingCanvas(), []);
    const savedDrawnCells = useMemo(
        () => Object.values(gameState.grid).map(cell => ({ q: cell.q, r: cell.r })),
        [gameState.grid]
    );

    const areaMode: AreaModeOption = areaModeDraft ?? gameState.gameAreaMode;
    const selectedPattern: GameAreaPattern = selectedPatternDraft ?? gameState.gameAreaPattern ?? 'WideFront';
    const drawnCells: HexCoordinate[] = drawnCellsDraft ?? savedDrawnCells;

    const effectiveSelectedPlayerId = gameState.players.some(player => player.id === selectedPlayerId)
        ? selectedPlayerId
        : gameState.players.find(player => player.territoryCount === 0)?.id ?? gameState.players[0]?.id ?? '';

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
    }, [areaMode, drawingCanvas, savedDrawnCells, selectedPattern]);

    const previewGrid = useMemo(
        () => buildPreviewGrid(previewCells, gameState.grid),
        [gameState.grid, previewCells]
    );

    const inactiveHexKeys = useMemo(() => {
        if (areaMode !== 'Drawn') return [];
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
    const maxFootprintText = formatDistance(Math.round(maxFootprint));

    // ── Draft helpers ─────────────────────────────────────────────────────────
    const clearAreaDraft = useCallback(() => {
        setAreaModeDraft(null);
        setSelectedPatternDraft(null);
        setDrawnCellsDraft(null);
    }, []);

    const resetAreaDraft = useCallback(() => {
        clearAreaDraft();
        setSelectedHex(null);
    }, [clearAreaDraft]);

    const resetSaveTemplateForm = useCallback(() => {
        setShowSaveForm(false);
        setSaveTemplateName('');
        setSaveTemplateDesc('');
    }, []);

    // ── Template handlers ─────────────────────────────────────────────────────
    const fetchTemplates = useCallback(async () => {
        setTemplateLoading(true);
        try {
            const list = await listMapTemplates(authToken);
            setTemplates(list);
        } catch {
            // Template fetch errors are non-critical.
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
            // Error handled by server broadcast.
        }
    }, [gameState.roomCode, invoke, selectedTemplateId]);

    const handleSaveAsTemplate = useCallback(async () => {
        if (!invoke || !saveTemplateName.trim()) return;
        setSavingTemplate(true);
        try {
            const description = saveTemplateDesc.trim() || undefined;
            await invoke('SaveCurrentAreaAsTemplate', gameState.roomCode, saveTemplateName.trim(), description);
            resetSaveTemplateForm();
            void fetchTemplates();
        } catch {
            // Error handled by server broadcast.
        } finally {
            setSavingTemplate(false);
        }
    }, [fetchTemplates, gameState.roomCode, invoke, resetSaveTemplateForm, saveTemplateDesc, saveTemplateName]);

    // ── Map hex-click handler ────────────────────────────────────────────────
    const handleAreaHexClick = useCallback((q: number, r: number, cell: HexCell | undefined) => {
        // HQ placement mode takes priority over all other interactions
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
                const previousCells = previousDraft ?? drawnCells;
                const key = hexKey(q, r);
                if (previousCells.some(existing => hexKey(existing.q, existing.r) === key)) {
                    return previousCells.filter(existing => hexKey(existing.q, existing.r) !== key);
                }
                return [...previousCells, { q, r }];
            });
            return;
        }

        if (!cell?.isMasterTile) {
            setSelectedHex([q, r]);
        }
    }, [areaMode, drawnCells, hqAllianceId, hqMode, onSetAllianceHQ]);

    // ── Area apply handlers ───────────────────────────────────────────────────
    const handleApplyCentered = useCallback(() => {
        onUseCenteredGameArea();
        clearAreaDraft();
    }, [clearAreaDraft, onUseCenteredGameArea]);

    const handleApplyPattern = useCallback(() => {
        onSetPatternGameArea(selectedPattern);
        clearAreaDraft();
    }, [clearAreaDraft, onSetPatternGameArea, selectedPattern]);

    const handleApplyDrawn = useCallback(() => {
        onSetCustomGameArea(drawnCells);
        clearAreaDraft();
    }, [clearAreaDraft, drawnCells, onSetCustomGameArea]);

    // ── Tile / HQ assignment handlers ─────────────────────────────────────────
    const handleSetMasterTile = useCallback(() => {
        if (!selectedHex) return;
        onSetMasterTileByHex(selectedHex[0], selectedHex[1]);
        setSelectedHex(null);
    }, [onSetMasterTileByHex, selectedHex]);

    const handleAssignStartingTile = useCallback(() => {
        if (!selectedHex) return;
        onAssignStartingTile(selectedHex[0], selectedHex[1], effectiveSelectedPlayerId);
        setSelectedHex(null);
    }, [effectiveSelectedPlayerId, onAssignStartingTile, selectedHex]);

    const handleToggleAllianceHqMode = useCallback((allianceId: string) => {
        if (hqMode && hqAllianceId === allianceId) {
            setHqMode(false);
            setHqAllianceId(null);
            return;
        }
        setHqMode(true);
        setHqAllianceId(allianceId);
        setSelectedHex(null);
    }, [hqAllianceId, hqMode]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="wizard-step wizard-step-review">
            <div className="wizard-step-header">
                <h2>{t('wizard.reviewTitle')}</h2>
                <p className="wizard-step-desc">{t('wizard.reviewDesc')}</p>
            </div>

            <div className="wizard-step-body">
                <ReviewSummary
                    gameState={gameState}
                    tileSizeText={formatDistance(gameState.tileSizeMeters)}
                />

                <p className="wizard-hint">{t('wizard.reviewAutoPlaceNote')}</p>

                {isHost && mapIsReady && (
                    <ReviewAreaPanel
                        areaMode={areaMode}
                        selectedPattern={selectedPattern}
                        savedAreaSummary={savedAreaSummary}
                        areaStatsText={areaStatsText}
                        maxFootprintText={maxFootprintText}
                        maxTileSizeText={formatDistance(previewMaxTileSize)}
                        patternFitsFootprint={patternFitsFootprint}
                        drawnCells={drawnCells}
                        minDrawnHexCount={MIN_DRAWN_HEX_COUNT}
                        drawIsLargeEnough={drawIsLargeEnough}
                        drawIsConnected={drawIsConnected}
                        drawFitsFootprint={drawFitsFootprint}
                        canApplyDrawn={canApplyDrawn}
                        templates={templates}
                        selectedTemplateId={selectedTemplateId}
                        templateLoading={templateLoading}
                        canUseTemplates={invoke !== undefined}
                        hasSavedArea={hasSavedArea}
                        showSaveForm={showSaveForm}
                        saveTemplateName={saveTemplateName}
                        saveTemplateDesc={saveTemplateDesc}
                        savingTemplate={savingTemplate}
                        onSelectAreaMode={setAreaModeDraft}
                        onSelectPattern={setSelectedPatternDraft}
                        onApplyCentered={handleApplyCentered}
                        onApplyPattern={handleApplyPattern}
                        onApplyDrawn={handleApplyDrawn}
                        onClearDrawn={() => setDrawnCellsDraft([])}
                        onResetDraft={resetAreaDraft}
                        onSelectTemplate={setSelectedTemplateId}
                        onLoadTemplate={() => void handleLoadTemplate()}
                        onRefreshTemplates={() => void fetchTemplates()}
                        onShowSaveForm={() => setShowSaveForm(true)}
                        onHideSaveForm={resetSaveTemplateForm}
                        onSaveTemplateNameChange={setSaveTemplateName}
                        onSaveTemplateDescChange={setSaveTemplateDesc}
                        onSaveCurrentArea={() => void handleSaveAsTemplate()}
                    />
                )}

                {mapIsReady && (
                    <div className="wizard-map-preview">
                        <GameMap
                            state={gameState}
                            myUserId={myUserId}
                            currentLocation={currentLocation}
                            gridOverride={isHost ? previewGrid : undefined}
                            inactiveHexKeys={isHost ? inactiveHexKeys : undefined}
                            selectedHex={selectedHex}
                            onHexClick={
                                isHost && (areaMode === 'Drawn' || showCustomize)
                                    ? handleAreaHexClick
                                    : undefined
                            }
                        />
                    </div>
                )}

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
                            <ReviewCustomizePanel
                                areaMode={areaMode}
                                selectedHex={selectedHex}
                                masterTileReady={masterTileReady}
                                players={gameState.players}
                                alliances={gameState.alliances}
                                effectiveSelectedPlayerId={effectiveSelectedPlayerId}
                                hqMode={hqMode}
                                hqAllianceId={hqAllianceId}
                                hqEnabled={(gameState.dynamics?.hqEnabled ?? false) && !(gameState.dynamics?.hqAutoAssign ?? true)}
                                onSelectedPlayerChange={setSelectedPlayerId}
                                onSetMasterTile={handleSetMasterTile}
                                onAssignStartingTile={handleAssignStartingTile}
                                onToggleAllianceHqMode={handleToggleAllianceHqMode}
                                onSetAllianceHQ={onSetAllianceHQ}
                            />
                        )}
                    </>
                )}

                {isHost && (
                    <GameStartButton canStart={canStart} onStartGame={onStartGame} />
                )}

                {!isHost && (
                    <p className="wizard-hint wizard-waiting">{t('wizard.guestWaitingStart')}</p>
                )}
            </div>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPreviewGrid(
    cells: HexCoordinate[],
    baseGrid: Record<string, HexCell>
): Record<string, HexCell> {
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
