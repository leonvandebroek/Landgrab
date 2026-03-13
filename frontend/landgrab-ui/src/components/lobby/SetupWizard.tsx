import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaimMode, CopresenceMode, GameAreaPattern, GameDynamics, GameState, HexCoordinate, WinConditionType } from '../../types/game';
import { LocationStep } from './LocationStep';
import { TeamsStep } from './TeamsStep';
import { RulesStep } from './RulesStep';
import { DynamicsStep } from './DynamicsStep';
import { ReviewStep } from './ReviewStep';

interface LocationPoint {
    lat: number;
    lng: number;
}

interface Props {
    gameState: GameState;
    myUserId: string;
    currentLocation: LocationPoint | null;
    locationError: string | null;
    locationLoading: boolean;
    onSetMapLocation: (lat: number, lng: number) => void;
    onSetAlliance: (name: string) => void;
    onConfigureAlliances: (names: string[]) => void;
    onDistributePlayers: () => void;
    onSetTileSize: (meters: number) => void;
    onUseCenteredGameArea: () => void;
    onSetPatternGameArea: (pattern: GameAreaPattern) => void;
    onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
    onSetClaimMode: (mode: ClaimMode) => void;
    onSetAllowSelfClaim: (allow: boolean) => void;
    onSetWinCondition: (type: WinConditionType, value: number) => void;
    onSetCopresenceModes: (modes: CopresenceMode[]) => void;
    onSetCopresencePreset: (preset: string) => void;
    onSetGameDynamics: (dynamics: GameDynamics) => void;
    onSetMasterTileByHex: (q: number, r: number) => void;
    onAssignStartingTile: (q: number, r: number, playerId: string) => void;
    onStartGame: () => void;
    onReturnToLobby: () => void;
    onLogout: () => void;
    error: string;
    invoke?: (method: string, ...args: unknown[]) => Promise<unknown>;
}

const TOTAL_STEPS = 5;

export function SetupWizard({
    gameState,
    myUserId,
    currentLocation,
    locationError,
    locationLoading,
    onSetMapLocation,
    onSetAlliance,
    onConfigureAlliances,
    onDistributePlayers,
    onSetTileSize,
    onUseCenteredGameArea,
    onSetPatternGameArea,
    onSetCustomGameArea,
    onSetClaimMode,
    onSetAllowSelfClaim,
    onSetWinCondition,
    onSetCopresenceModes,
    onSetCopresencePreset,
    onSetGameDynamics,
    onSetMasterTileByHex,
    onAssignStartingTile,
    onStartGame,
    onReturnToLobby,
    onLogout,
    error,
    invoke,
}: Props) {
    const { t } = useTranslation();
    const me = gameState.players.find(p => p.id === myUserId);
    const isHost = me?.isHost ?? false;

    const stepComplete = useMemo(() => ({
        location: gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null,
        teams: gameState.alliances.length > 0 && gameState.players.length >= 2 && gameState.players.every(p => p.allianceId),
        rules: true, // rules always have defaults
        dynamics: true, // dynamics always have defaults (Klassiek preset)
        review: false, // review step is never "complete" — it terminates the wizard
    }), [gameState]);

    // Derive the initial wizard step from game state (for reconnects)
    const deriveStep = useCallback((): number => {
        if (!stepComplete.location) return 0;
        if (!stepComplete.teams) return 1;
        return 2; // default to rules; user can navigate to review
    }, [stepComplete]);

    const [step, setStep] = useState(deriveStep);

    // Wrap onSetMapLocation to auto-advance from location step
    const handleSetMapLocation = useCallback((lat: number, lng: number) => {
        onSetMapLocation(lat, lng);
        if (step === 0) setStep(1);
    }, [onSetMapLocation, step]);

    const canGoNext = useMemo(() => {
        switch (step) {
            case 0: return stepComplete.location;
            case 1: return stepComplete.teams;
            case 2: return true; // rules always valid (have defaults)
            case 3: return true; // dynamics always valid (have defaults)
            default: return false;
        }
    }, [step, stepComplete]);

    const canStart = useMemo(() => {
        return gameState.players.length >= 2
            && gameState.hasMapLocation
            && gameState.players.every(p => p.allianceId);
        // master tile + starting tiles are auto-assigned on StartGame by backend
    }, [gameState]);

    const goNext = () => {
        if (step < TOTAL_STEPS - 1 && canGoNext) {
            setStep(step + 1);
        }
    };

    const goBack = () => {
        if (step > 0) {
            setStep(step - 1);
        }
    };

    return (
        <div className="wizard-page">
            <div className="wizard-container">
                {/* Header with step indicator */}
                <div className="wizard-header">
                    <div className="wizard-header-left">
                        <span className="room-code">{gameState.roomCode}</span>
                        {!isHost && <span className="phase-badge">{t('lobby.guestRole')}</span>}
                    </div>
                    <div className="wizard-step-indicator">
                        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`wizard-dot${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
                                onClick={() => {
                                    // Allow clicking completed steps or current step
                                    if (i <= step || (i === step + 1 && canGoNext)) setStep(i);
                                }}
                                aria-label={`Step ${i + 1}`}
                            />
                        ))}
                        <span className="wizard-step-label">
                            {t('wizard.stepOf', { current: step + 1, total: TOTAL_STEPS })}
                        </span>
                    </div>
                </div>

                {/* Step content */}
                <div className="wizard-content">
                    {step === 0 && (
                        <LocationStep
                            currentLocation={currentLocation}
                            locationLoading={locationLoading}
                            locationError={locationError}
                            mapLat={gameState.mapLat}
                            mapLng={gameState.mapLng}
                            onSetMapLocation={handleSetMapLocation}
                        />
                    )}
                    {step === 1 && (
                        <TeamsStep
                            gameState={gameState}
                            myUserId={myUserId}
                            isHost={isHost}
                            onSetAlliance={onSetAlliance}
                            onConfigureAlliances={onConfigureAlliances}
                            onDistributePlayers={onDistributePlayers}
                        />
                    )}
                    {step === 2 && (
                        <RulesStep
                            gameState={gameState}
                            isHost={isHost}
                            onSetTileSize={onSetTileSize}
                            onSetClaimMode={onSetClaimMode}
                            onSetAllowSelfClaim={onSetAllowSelfClaim}
                            onSetWinCondition={onSetWinCondition}
                            invoke={invoke}
                        />
                    )}
                    {step === 3 && (
                        <DynamicsStep
                            gameState={gameState}
                            isHost={isHost}
                            onSetCopresenceModes={onSetCopresenceModes}
                            onSetCopresencePreset={onSetCopresencePreset}
                            onSetGameDynamics={onSetGameDynamics}
                        />
                    )}
                    {step === 4 && (
                        <ReviewStep
                            gameState={gameState}
                            myUserId={myUserId}
                            isHost={isHost}
                            currentLocation={currentLocation}
                            canStart={canStart}
                            onUseCenteredGameArea={onUseCenteredGameArea}
                            onSetPatternGameArea={onSetPatternGameArea}
                            onSetCustomGameArea={onSetCustomGameArea}
                            onSetMasterTileByHex={onSetMasterTileByHex}
                            onAssignStartingTile={onAssignStartingTile}
                            onStartGame={onStartGame}
                            invoke={invoke}
                        />
                    )}
                </div>

                {/* Navigation footer */}
                <div className="wizard-footer">
                    <div className="wizard-footer-left">
                        {step > 0 ? (
                            <button type="button" className="btn-ghost" onClick={goBack}>
                                {t('wizard.back')}
                            </button>
                        ) : (
                            <button type="button" className="btn-ghost" onClick={onReturnToLobby}>
                                {t('lobby.returnToLobby')}
                            </button>
                        )}
                    </div>

                    <div className="wizard-footer-right">
                        {step < TOTAL_STEPS - 1 && (
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={goNext}
                                disabled={!canGoNext}
                            >
                                {t('wizard.next')}
                            </button>
                        )}
                    </div>
                </div>

                {error && <p className="error-msg wizard-error">{error}</p>}

                <div className="wizard-secondary-actions">
                    <button type="button" className="btn-ghost" onClick={onLogout}>{t('lobby.leaveSignOut')}</button>
                </div>
            </div>
        </div>
    );
}
