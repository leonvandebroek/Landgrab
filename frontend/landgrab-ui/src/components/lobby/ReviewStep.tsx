import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameAreaMode, GameAreaPattern, GameState, HexCell, HexCoordinate } from '../../types/game';
import { GameMap } from '../map/GameMap';
import { hexKey } from '../map/HexMath';
import { CustomSelect } from './CustomSelect';
import {
    buildCenteredGameArea,
    buildDrawingCanvas,
    buildPatternGameArea,
    GAME_AREA_PATTERNS,
    getAreaFootprintMetrics,
    getMaxTileSizeForArea,
    isConnectedArea,
    MAX_GAME_AREA_FOOTPRINT_METERS,
} from './gameAreaShapes';

const MIN_DRAWN_HEX_COUNT = 7;

interface LocationPoint {
    lat: number;
    lng: number;
}

interface Props {
    gameState: GameState;
    myUserId: string;
    isHost: boolean;
    currentLocation: LocationPoint | null;
    canStart: boolean;
    onUseCenteredGameArea: () => void;
    onSetPatternGameArea: (pattern: GameAreaPattern) => void;
    onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
    onSetMasterTileByHex: (q: number, r: number) => void;
    onAssignStartingTile: (q: number, r: number, playerId: string) => void;
    onStartGame: () => void;
}

export function ReviewStep({
    gameState,
    myUserId,
    isHost,
    currentLocation,
    canStart,
    onUseCenteredGameArea,
    onSetPatternGameArea,
    onSetCustomGameArea,
    onSetMasterTileByHex,
    onAssignStartingTile,
    onStartGame,
}: Props) {
    const { t } = useTranslation();
    const [showCustomize, setShowCustomize] = useState(false);
    const [selectedHex, setSelectedHex] = useState<[number, number] | null>(null);
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [areaModeDraft, setAreaModeDraft] = useState<GameAreaMode | null>(null);
    const [selectedPatternDraft, setSelectedPatternDraft] = useState<GameAreaPattern | null>(null);
    const [drawnCellsDraft, setDrawnCellsDraft] = useState<HexCoordinate[] | null>(null);

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
            case 'Centered':
            default:
                return buildCenteredGameArea();
        }
    }, [areaMode, drawingCanvas, selectedPattern]);

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
    const previewMaxTileSize = useMemo(() => getMaxTileSizeForArea(activeAreaCells), [activeAreaCells]);
    const drawIsConnected = useMemo(() => isConnectedArea(drawnCells), [drawnCells]);
    const drawIsLargeEnough = drawnCells.length >= MIN_DRAWN_HEX_COUNT;
    const drawFitsFootprint = previewMetrics.maxDimensionMeters <= MAX_GAME_AREA_FOOTPRINT_METERS;
    const canApplyDrawn = drawIsConnected && drawIsLargeEnough && drawFitsFootprint;
    const patternFitsFootprint = previewMetrics.maxDimensionMeters <= MAX_GAME_AREA_FOOTPRINT_METERS;
    const areaStatsText = t('wizard.areaStats', {
        count: activeAreaCells.length,
        footprint: formatDistance(Math.round(previewMetrics.maxDimensionMeters)),
    });

    const handleAreaHexClick = (q: number, r: number, cell: HexCell | undefined) => {
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
