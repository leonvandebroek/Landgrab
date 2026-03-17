import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaimMode, GameAreaPattern, GameDynamics, GameState, HexCoordinate, WinConditionType } from '../../types/game';
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
    authToken: string;
    currentLocation: LocationPoint | null;
    locationError: string | null;
    locationLoading: boolean;
    onSetMapLocation: (lat: number, lng: number) => void;
    onSetAlliance: (name: string) => void;
    onAssignPlayerRole: (targetPlayerId: string, role: string) => void;
    onRandomizeRoles: () => void;
    onConfigureAlliances: (names: string[]) => void;
    onDistributePlayers: () => void;
    onSetTileSize: (meters: number) => void;
    onUseCenteredGameArea: () => void;
    onSetPatternGameArea: (pattern: GameAreaPattern) => void;
    onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
    onSetClaimMode: (mode: ClaimMode) => void;
    onSetAllowSelfClaim: (allow: boolean) => void;
    onSetWinCondition: (type: WinConditionType, value: number) => void;
    onSetBeaconEnabled: (enabled: boolean) => void;
    onSetTileDecayEnabled: (enabled: boolean) => void;
    onSetGameDynamics: (dynamics: GameDynamics) => void;
    onSetPlayerRole?: (role: string) => void;
    onSetMasterTileByHex: (q: number, r: number) => void;
    onAssignStartingTile: (q: number, r: number, playerId: string) => void;
    onSetAllianceHQ?: (q: number, r: number, allianceId: string) => void;
    onStartGame: () => void;
    onReturnToLobby: () => void;
    onLogout: () => void;
    onSetObserverMode?: (enabled: boolean) => void;
    error: string;
    invoke?: (method: string, ...args: unknown[]) => Promise<unknown>;
}

const TOTAL_STEPS = 5;

function clampWizardStep(step: number) {
    return Math.max(0, Math.min(TOTAL_STEPS - 1, step));
}

export function SetupWizard({
    gameState,
    myUserId,
    authToken,
    currentLocation,
    locationError,
    locationLoading,
    onSetMapLocation,
    onSetAlliance,
    onAssignPlayerRole,
    onRandomizeRoles,
    onConfigureAlliances,
    onDistributePlayers,
    onSetTileSize,
    onUseCenteredGameArea,
    onSetPatternGameArea,
    onSetCustomGameArea,
    onSetClaimMode,
    onSetAllowSelfClaim,
    onSetWinCondition,
    onSetBeaconEnabled,
    onSetTileDecayEnabled,
    onSetGameDynamics,
    onSetMasterTileByHex,
    onAssignStartingTile,
    onSetAllianceHQ,
    onStartGame,
    onReturnToLobby,
    onLogout,
    onSetObserverMode,
    error,
    invoke,
}: Props) {
    const { t } = useTranslation();
    const me = gameState.players.find(p => p.id === myUserId);
    const isHost = me?.isHost ?? false;

    const stepComplete = useMemo(() => ({
        location: gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null,
        teams: gameState.alliances.length > 0
            && gameState.players.length >= 2
            && gameState.players.every(p => p.allianceId)
            && gameState.players.every(p => p.isConnected),
        rules: true,
        dynamics: true,
        review: false,
    }), [gameState]);

    const deriveStep = useCallback((): number => {
        if (!stepComplete.location) return 0;
        if (!stepComplete.teams) return 1;
        return 2;
    }, [stepComplete]);

    const serverWizardStep = useMemo(() => {
        if (typeof gameState.currentWizardStep !== 'number') {
            return null;
        }

        return clampWizardStep(gameState.currentWizardStep);
    }, [gameState.currentWizardStep]);

    const [step, setStep] = useState(() => serverWizardStep ?? deriveStep());

    useEffect(() => {
        if (serverWizardStep == null) {
            return;
        }

        const timer = window.setTimeout(() => {
            setStep(prev => (prev !== serverWizardStep ? serverWizardStep : prev));
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [serverWizardStep]);

    const syncWizardStep = useCallback(async (nextStep: number) => {
        const normalizedStep = clampWizardStep(nextStep);
        setStep(normalizedStep);

        if (!invoke) {
            return;
        }

        try {
            await invoke('SetWizardStep', normalizedStep);
        } catch (wizardStepError) {
            console.error('Failed to sync wizard step with the server.', {
                normalizedStep,
                wizardStepError,
            });
        }
    }, [invoke]);

    const handleSetMapLocation = useCallback((lat: number, lng: number) => {
        onSetMapLocation(lat, lng);

        if (step === 0) {
            void syncWizardStep(1);
        }
    }, [onSetMapLocation, step, syncWizardStep]);

    const canGoNext = useMemo(() => {
        switch (step) {
            case 0:
                return stepComplete.location;
            case 1:
                return stepComplete.teams;
            case 2:
                return true;
            case 3:
                return true;
            default:
                return false;
        }
    }, [step, stepComplete]);

    const canStart = useMemo(() => {
        return gameState.players.length >= 2
            && gameState.hasMapLocation
            && gameState.players.every(p => p.allianceId);
    }, [gameState]);

    const goNext = useCallback(() => {
        if (step >= TOTAL_STEPS - 1 || !canGoNext) {
            return;
        }

        void syncWizardStep(step + 1);
    }, [canGoNext, step, syncWizardStep]);

    const goBack = useCallback(() => {
        if (step <= 0) {
            return;
        }

        void syncWizardStep(step - 1);
    }, [step, syncWizardStep]);

    const goToStep = useCallback((nextStep: number) => {
        if (nextStep > step + 1 || (nextStep === step + 1 && !canGoNext)) {
            return;
        }

        void syncWizardStep(nextStep);
    }, [canGoNext, step, syncWizardStep]);

    return (
        <div className="wizard-page">
            <div className="wizard-container" data-testid="setup-wizard">
                {isHost && onSetObserverMode && (
                    <div className="observer-mode-toggle">
                        <span className="observer-mode-label">{t('observer.modeToggle' as never)}</span>
                        <div className="observer-mode-options">
                            <button
                                type="button"
                                className={`observer-mode-btn${!gameState.hostObserverMode ? ' active' : ''}`}
                                onClick={() => onSetObserverMode(false)}
                            >
                                {t('observer.playerMode' as never)}
                            </button>
                            <button
                                type="button"
                                className={`observer-mode-btn${gameState.hostObserverMode ? ' active' : ''}`}
                                onClick={() => onSetObserverMode(true)}
                            >
                                {t('observer.observerMode' as never)}
                            </button>
                        </div>
                    </div>
                )}

                <div className="wizard-header">
                    <div className="wizard-header-left">
                        <span className="room-code" data-testid="wizard-room-code">{gameState.roomCode}</span>
                        {!isHost && <span className="phase-badge">{t('lobby.guestRole')}</span>}
                        {isHost && gameState.hostObserverMode && <span className="phase-badge">{t('observer.observerBadge' as never)}</span>}
                    </div>
                    <div className="wizard-step-indicator">
                        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                            <button
                                key={i}
                                type="button"
                                className={`wizard-dot${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
                                onClick={() => goToStep(i)}
                                aria-label={`Step ${i + 1}`}
                            />
                        ))}
                        <span className="wizard-step-label">
                            {t('wizard.stepOf', { current: step + 1, total: TOTAL_STEPS })}
                        </span>
                    </div>
                </div>

                <div className="wizard-content" data-testid="wizard-step-content">
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
                            onAssignPlayerRole={onAssignPlayerRole}
                            onRandomizeRoles={onRandomizeRoles}
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
                            onSetBeaconEnabled={onSetBeaconEnabled}
                            onSetTileDecayEnabled={onSetTileDecayEnabled}
                            onSetGameDynamics={onSetGameDynamics}
                        />
                    )}
                    {step === 4 && (
                        <ReviewStep
                            gameState={gameState}
                            myUserId={myUserId}
                            authToken={authToken}
                            isHost={isHost}
                            currentLocation={currentLocation}
                            canStart={canStart}
                            onUseCenteredGameArea={onUseCenteredGameArea}
                            onSetPatternGameArea={onSetPatternGameArea}
                            onSetCustomGameArea={onSetCustomGameArea}
                            onSetMasterTileByHex={onSetMasterTileByHex}
                            onAssignStartingTile={onAssignStartingTile}
                            onSetAllianceHQ={onSetAllianceHQ}
                            onStartGame={onStartGame}
                            invoke={invoke}
                        />
                    )}
                </div>

                <div className="wizard-footer">
                    <div className="wizard-footer-left">
                        {step > 0 ? (
                            <button type="button" className="btn-ghost" data-testid="wizard-back-btn" onClick={goBack}>
                                {t('wizard.back')}
                            </button>
                        ) : (
                            <button type="button" className="btn-ghost" data-testid="wizard-return-lobby-btn" onClick={onReturnToLobby}>
                                {t('lobby.returnToLobby')}
                            </button>
                        )}
                    </div>

                    <div className="wizard-footer-right">
                        {step < TOTAL_STEPS - 1 && (
                            <button
                                type="button"
                                className="btn-primary"
                                data-testid="wizard-next-btn"
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
