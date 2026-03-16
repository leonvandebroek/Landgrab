import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState } from '../../types/game';
import { TeamsStep } from './TeamsStep';
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
    onSetAlliance: (name: string) => void;
    onSetPlayerRole?: (role: string) => void;
    onSetMasterTileByHex: (q: number, r: number) => void;
    onAssignStartingTile: (q: number, r: number, playerId: string) => void;
    onStartGame: () => void;
    onReturnToLobby: () => void;
    onLogout: () => void;
    error: string;
}

// Guest wizard: 3 steps — Waiting (location), Teams, Review
const TOTAL_STEPS = 3;

export function GuestWizardView({
    gameState,
    myUserId,
    authToken,
    currentLocation,
    onSetAlliance,
    onSetPlayerRole,
    onSetMasterTileByHex,
    onAssignStartingTile,
    onStartGame,
    onReturnToLobby,
    onLogout,
    error,
}: Props) {
    const { t } = useTranslation();
    const me = useMemo(
        () => gameState.players.find(player => player.id === myUserId),
        [gameState.players, myUserId]
    );

    const stepComplete = useMemo(() => ({
        location: gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null,
        teams: Boolean(me?.allianceId),
        review: false,
    }), [gameState, me?.allianceId]);

    const deriveStep = useCallback((): number => {
        if (!stepComplete.location) return 0;
        if (!stepComplete.teams) return 1;
        return 2;
    }, [stepComplete]);

    const [guestStep, setGuestStep] = useState(deriveStep);

    const canGoNext = useMemo(() => {
        switch (guestStep) {
            case 0:
                return stepComplete.location;
            case 1:
                return stepComplete.teams;
            default:
                return false;
        }
    }, [guestStep, stepComplete]);

    const goNext = () => {
        if (guestStep < TOTAL_STEPS - 1 && canGoNext) {
            setGuestStep(guestStep + 1);
        }
    };

    const goBack = () => {
        if (guestStep > 0) {
            setGuestStep(guestStep - 1);
        }
    };

    return (
        <div className="wizard-page">
            <div className="wizard-container" data-testid="setup-wizard">
                {/* Header */}
                <div className="wizard-header">
                    <div className="wizard-header-left">
                        <span className="room-code" data-testid="wizard-room-code">{gameState.roomCode}</span>
                        <span className="phase-badge">{t('lobby.guestRole')}</span>
                    </div>
                    <div className="wizard-step-indicator">
                        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                            <span
                                key={i}
                                className={`wizard-dot${i === guestStep ? ' is-active' : ''}${i < guestStep ? ' is-done' : ''}`}
                            />
                        ))}
                        <span className="wizard-step-label">
                            {t('wizard.stepOf', { current: guestStep + 1, total: TOTAL_STEPS })}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="wizard-content">
                    {guestStep === 0 && (
                        <div className="wizard-step wizard-step-waiting">
                            <div className="wizard-step-header">
                                <h2>{t('wizard.locationTitle')}</h2>
                                <p className="wizard-step-desc">{t('wizard.guestWaitingLocation')}</p>
                            </div>
                        </div>
                    )}
                    {guestStep === 1 && (
                        <TeamsStep
                            gameState={gameState}
                            myUserId={myUserId}
                            isHost={false}
                            onSetAlliance={onSetAlliance}
                            onConfigureAlliances={() => { }}
                            onDistributePlayers={() => { }}
                            onSetPlayerRole={onSetPlayerRole}
                        />
                    )}
                    {guestStep === 2 && (
                        <ReviewStep
                            gameState={gameState}
                            myUserId={myUserId}
                            authToken={authToken}
                            isHost={false}
                            currentLocation={currentLocation}
                            canStart={false}
                            onUseCenteredGameArea={() => { }}
                            onSetPatternGameArea={() => { }}
                            onSetCustomGameArea={() => { }}
                            onSetMasterTileByHex={onSetMasterTileByHex}
                            onAssignStartingTile={onAssignStartingTile}
                            onStartGame={onStartGame}
                        />
                    )}
                </div>

                {/* Navigation */}
                <div className="wizard-footer">
                    <div className="wizard-footer-left">
                        {guestStep > 0 ? (
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
                        {guestStep < TOTAL_STEPS - 1 && (
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
