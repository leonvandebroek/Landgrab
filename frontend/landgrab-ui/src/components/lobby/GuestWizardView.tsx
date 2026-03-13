import { useMemo, useState } from 'react';
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
    currentLocation: LocationPoint | null;
    onSetAlliance: (name: string) => void;
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
    currentLocation,
    onSetAlliance,
    onSetMasterTileByHex,
    onAssignStartingTile,
    onStartGame,
    onReturnToLobby,
    onLogout,
    error,
}: Props) {
    const { t } = useTranslation();

    // Map host progress (4-step) to guest's 3-step view:
    //   host step 0 (location)  → guest max step 0
    //   host step 1 (teams)     → guest max step 1
    //   host step 2 (rules)     → guest max step 1 (rules is host-only)
    //   host step 3 (review)    → guest max step 2
    const hostStep = useMemo((): number => {
        const locationReady = gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null;
        const teamsReady = gameState.players.length >= 2 && gameState.players.every(p => p.allianceId);
        if (!locationReady) return 0;
        if (!teamsReady) return 1;
        return 2; // host is on rules (2) or review (3); in both cases guest can access up to step 1
    }, [gameState]);

    // hostStep 2 means host finished teams — guest can be on step 1. Review unlocks when host reaches review (step 3).
    const hostOnReview = useMemo(() => {
        const teamsReady = gameState.players.length >= 2 && gameState.players.every(p => p.allianceId);
        // Host is on review when all players have alliances AND master tile is set OR host explicitly advanced
        return teamsReady && gameState.masterTileQ != null;
    }, [gameState]);

    const guestMaxStep = hostOnReview ? 2 : Math.min(hostStep, 1);

    const [guestStep, setGuestStep] = useState(() => Math.max(guestMaxStep, hostStep === 0 ? 0 : 1));

    const effectiveStep = Math.min(guestStep, guestMaxStep);

    return (
        <div className="wizard-page">
            <div className="wizard-container">
                {/* Header */}
                <div className="wizard-header">
                    <div className="wizard-header-left">
                        <span className="room-code">{gameState.roomCode}</span>
                        <span className="phase-badge">{t('lobby.guestRole')}</span>
                    </div>
                    <div className="wizard-step-indicator">
                        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                            <span
                                key={i}
                                className={`wizard-dot${i === effectiveStep ? ' is-active' : ''}${i < effectiveStep ? ' is-done' : ''}`}
                            />
                        ))}
                        <span className="wizard-step-label">
                            {t('wizard.stepOf', { current: effectiveStep + 1, total: TOTAL_STEPS })}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="wizard-content">
                    {effectiveStep === 0 && (
                        <div className="wizard-step wizard-step-waiting">
                            <div className="wizard-step-header">
                                <h2>{t('wizard.locationTitle')}</h2>
                                <p className="wizard-step-desc">{t('wizard.guestWaitingLocation')}</p>
                            </div>
                        </div>
                    )}
                    {effectiveStep === 1 && (
                        <TeamsStep
                            gameState={gameState}
                            myUserId={myUserId}
                            isHost={false}
                            onSetAlliance={onSetAlliance}
                            onConfigureAlliances={() => { }}
                            onDistributePlayers={() => { }}
                        />
                    )}
                    {effectiveStep === 2 && (
                        <ReviewStep
                            gameState={gameState}
                            myUserId={myUserId}
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
                        {effectiveStep > 1 ? (
                            <button type="button" className="btn-ghost" onClick={() => setGuestStep(effectiveStep - 1)}>
                                {t('wizard.back')}
                            </button>
                        ) : (
                            <button type="button" className="btn-ghost" onClick={onReturnToLobby}>
                                {t('lobby.returnToLobby')}
                            </button>
                        )}
                    </div>
                    <div className="wizard-footer-right">
                        {effectiveStep < guestMaxStep && (
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => setGuestStep(effectiveStep + 1)}
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
