import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaimMode, GameState, WinConditionType } from '../../types/game';
import { getMaxTileSizeForArea } from './gameAreaShapes';
import { CustomSelect } from './CustomSelect';

const CLAIM_MODES: ClaimMode[] = ['PresenceOnly', 'PresenceWithTroop', 'AdjacencyRequired'];
const WIN_CONDITION_TYPES: WinConditionType[] = ['TerritoryPercent', 'Elimination', 'TimedGame'];

interface Props {
    gameState: GameState;
    isHost: boolean;
    onSetTileSize: (meters: number) => void;
    onSetClaimMode: (mode: ClaimMode) => void;
    onSetWinCondition: (type: WinConditionType, value: number) => void;
}

export function RulesStep({ gameState, isHost, onSetTileSize, onSetClaimMode, onSetWinCondition }: Props) {
    const { t } = useTranslation();
    const [winValueDraft, setWinValueDraft] = useState<string | null>(null);
    const [tileSizeDraft, setTileSizeDraft] = useState<number | null>(null);
    const maxTileSizeMeters = getMaxTileSizeForArea(Object.values(gameState.grid).map(cell => ({ q: cell.q, r: cell.r })));
    const effectiveTileSizeMeters = Math.min(gameState.tileSizeMeters, maxTileSizeMeters);
    const tileSizeMatchesServer = tileSizeDraft != null && tileSizeDraft === effectiveTileSizeMeters;
    const displayedTileSizeMeters = tileSizeMatchesServer ? effectiveTileSizeMeters : (tileSizeDraft ?? effectiveTileSizeMeters);

    useEffect(() => {
        if (!isHost || gameState.tileSizeMeters <= maxTileSizeMeters) {
            return;
        }

        onSetTileSize(maxTileSizeMeters);
    }, [gameState.tileSizeMeters, isHost, maxTileSizeMeters, onSetTileSize]);

    const derivedWinValue = gameState.winConditionType === 'TimedGame'
        ? gameState.gameDurationMinutes ?? gameState.winConditionValue
        : gameState.winConditionValue;
    const effectiveWinValue = winValueDraft ?? String(derivedWinValue);

    const applyWinCondition = () => {
        const parsed = Number(effectiveWinValue);
        if (Number.isFinite(parsed)) {
            onSetWinCondition(gameState.winConditionType, parsed);
            setWinValueDraft(null);
        }
    };

    const handleTypeChange = (type: WinConditionType) => {
        const fallback = type === 'TimedGame'
            ? gameState.gameDurationMinutes ?? 15
            : gameState.winConditionValue;
        const value = type === 'Elimination' ? 1 : fallback;
        onSetWinCondition(type, value);
        setWinValueDraft(null);
    };

    const syncTileSize = (meters: number) => {
        const boundedMeters = Math.max(15, Math.min(maxTileSizeMeters, meters));
        setTileSizeDraft(boundedMeters);
        if (isHost && boundedMeters !== gameState.tileSizeMeters) {
            onSetTileSize(boundedMeters);
        }
    };

    return (
        <div className="wizard-step wizard-step-rules">
            <div className="wizard-step-header">
                <h2>{t('wizard.rulesTitle')}</h2>
                <p className="wizard-step-desc">{t('wizard.rulesDesc')}</p>
            </div>

            <div className="wizard-step-body">
                <p className="wizard-hint">{t('wizard.rulesDefaultsNote')}</p>

                {/* Tile size */}
                <div className="wizard-rule-card">
                    <h3>{t('wizard.rulesTileSizeLabel')}</h3>
                    <p className="wizard-hint">{t('wizard.rulesTileSizeDesc')}</p>
                    <label className="range-field">
                        <span><strong className="range-value">{formatDistance(displayedTileSizeMeters)}</strong></span>
                        <input
                            type="range"
                            min={15}
                            max={maxTileSizeMeters}
                            step={1}
                            value={displayedTileSizeMeters}
                            onInput={e => syncTileSize(Number((e.target as HTMLInputElement).value))}
                            disabled={!isHost}
                        />
                    </label>
                    <p className="wizard-hint">{t('wizard.rulesTileSizeLimit', { max: formatDistance(maxTileSizeMeters) })}</p>
                </div>

                {/* Claim mode */}
                <div className="wizard-rule-card">
                    <h3>{t('wizard.rulesClaimModeLabel')}</h3>
                    <p className="wizard-hint">{t('wizard.rulesClaimModeDesc')}</p>
                    <div className="claim-mode-grid">
                        {CLAIM_MODES.map(mode => (
                            <label key={mode} className={`claim-mode-option${gameState.claimMode === mode ? ' active' : ''}`}>
                                <input
                                    type="radio"
                                    name="wizard-claim-mode"
                                    checked={gameState.claimMode === mode}
                                    onChange={() => isHost && onSetClaimMode(mode)}
                                    disabled={!isHost}
                                />
                                <span className="claim-mode-copy">
                                    <strong>{t(`claimMode.${mode}.title`)}</strong>
                                    <span>{t(`claimMode.${mode}.detail`)}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Win condition */}
                <div className="wizard-rule-card">
                    <h3>{t('wizard.rulesWinConditionLabel')}</h3>
                    <p className="wizard-hint">{t('wizard.rulesWinConditionDesc')}</p>
                    <div className="settings-row">
                        <CustomSelect
                            value={gameState.winConditionType}
                            options={WIN_CONDITION_TYPES.map(type => ({
                                value: type,
                                label: t(`winCondition.${type}`)
                            }))}
                            disabled={!isHost}
                            onChange={value => handleTypeChange(value as WinConditionType)}
                        />
                        {gameState.winConditionType !== 'Elimination' && (
                            <input
                                type="number"
                                min={1}
                                max={gameState.winConditionType === 'TerritoryPercent' ? 100 : undefined}
                                value={effectiveWinValue}
                                onChange={e => setWinValueDraft(e.target.value)}
                                placeholder={gameState.winConditionType === 'TimedGame' ? t('lobby.minutesPlaceholder') : t('lobby.percentPlaceholder')}
                                disabled={!isHost}
                            />
                        )}
                        {isHost && gameState.winConditionType !== 'Elimination' && (
                            <button type="button" className="btn-secondary" onClick={applyWinCondition}>
                                {t('lobby.apply')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatDistance(meters: number): string {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}
