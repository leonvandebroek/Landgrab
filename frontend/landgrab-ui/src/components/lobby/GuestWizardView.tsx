import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, PlayerRole } from '../../types/game';
import { RoleModal } from './RoleModal';
import { RolesStep } from './RolesStep';
import { TeamsStep } from './TeamsStep';
import { ReviewStep } from './ReviewStep';
import { WizardToast } from './WizardToast';
import { isRoleModalRole, type RoleModalRole } from './roleModalUtils';

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
    onAssignPlayerRole: (targetPlayerId: string, role: string) => void;
    onRandomizeRoles: () => void;
    onSetPlayerRole?: (role: string) => void;
    onSetMasterTileByHex: (q: number, r: number) => void;
    onAssignStartingTile: (q: number, r: number, playerId: string) => void;
    onStartGame: () => void;
    onReturnToLobby: () => void;
    onLogout: () => void;
    error: string;
}

function clampWizardStep(step: number, total: number) {
    return Math.max(0, Math.min(total - 1, step));
}

function WaitingStepCard({ title, description }: { title: string; description: string }) {
    return (
        <div className="wizard-step wizard-step-waiting">
            <div className="wizard-step-header">
                <h2>{title}</h2>
                <p className="wizard-step-desc">{description}</p>
            </div>
        </div>
    );
}

export function GuestWizardView({
    gameState,
    myUserId,
    authToken,
    currentLocation,
    onSetAlliance,
    onAssignPlayerRole,
    onRandomizeRoles,
    onSetMasterTileByHex,
    onAssignStartingTile,
    onStartGame,
    onReturnToLobby,
    onLogout,
    error,
}: Props) {
    const { t } = useTranslation();
    const hostAdvancedStepMessage = String(t('wizard.hostAdvancedStep' as never, {
        defaultValue: 'The host moved to the next step.',
    } as never));
    const rolesEnabled = gameState.dynamics?.playerRolesEnabled === true;
    const totalSteps = rolesEnabled ? 6 : 5;
    const reviewStep = totalSteps - 1;
    const me = useMemo(
        () => gameState.players.find(player => player.id === myUserId),
        [gameState.players, myUserId],
    );
    const [toastSequence, setToastSequence] = useState(0);
    const [showRoleModal, setShowRoleModal] = useState<RoleModalRole | null>(null);
    const previousStepRef = useRef<number | null>(null);
    const myRole = me?.role ?? 'None';
    const previousRoleRef = useRef<PlayerRole>(myRole);

    const guestStep = useMemo(() => {
        if (typeof gameState.currentWizardStep === 'number') {
            return clampWizardStep(gameState.currentWizardStep, totalSteps);
        }

        if (!gameState.hasMapLocation || gameState.mapLat == null || gameState.mapLng == null) {
            return 0;
        }

        if (!me?.allianceId) {
            return 1;
        }

        return totalSteps - 1;
    }, [gameState.currentWizardStep, gameState.hasMapLocation, gameState.mapLat, gameState.mapLng, me?.allianceId, totalSteps]);

    useEffect(() => {
        const previousStep = previousStepRef.current;
        previousStepRef.current = guestStep;

        if (previousStep == null || guestStep <= previousStep) {
            return;
        }

        const timer = window.setTimeout(() => {
            setToastSequence(sequence => sequence + 1);
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [guestStep]);

    useEffect(() => {
        const previousRole = previousRoleRef.current;
        previousRoleRef.current = myRole;

        if (isRoleModalRole(previousRole) || !isRoleModalRole(myRole)) {
            return;
        }

        const timer = window.setTimeout(() => {
            setShowRoleModal(myRole);
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [myRole]);

    return (
        <div className="wizard-page">
            <div className="wizard-container" data-testid="setup-wizard">
                {toastSequence > 0 && (
                    <WizardToast
                        key={toastSequence}
                        message={hostAdvancedStepMessage}
                    />
                )}

                <div className="wizard-header">
                    <div className="wizard-header-left">
                        <span className="room-code" data-testid="wizard-room-code">{gameState.roomCode}</span>
                        <span className="phase-badge">{t('lobby.guestRole')}</span>
                    </div>
                    <div className="wizard-step-indicator">
                        {Array.from({ length: totalSteps }, (_, i) => (
                            <span
                                key={i}
                                className={`wizard-dot${i === guestStep ? ' is-active' : ''}${i < guestStep ? ' is-done' : ''}`}
                            />
                        ))}
                        <span className="wizard-step-label">
                            {t('wizard.stepOf', { current: guestStep + 1, total: totalSteps })}
                        </span>
                    </div>
                </div>

                <div className="wizard-content">
                    {guestStep === 0 && (
                        <WaitingStepCard
                            title={t('wizard.locationTitle')}
                            description={t('wizard.guestWaitingLocation')}
                        />
                    )}
                    {guestStep === 1 && (
                        <TeamsStep
                            gameState={gameState}
                            myUserId={myUserId}
                            isHost={false}
                            onSetAlliance={onSetAlliance}
                            onConfigureAlliances={() => { }}
                            onDistributePlayers={() => { }}
                        />
                    )}
                    {guestStep === 2 && (
                        <WaitingStepCard
                            title={t('wizard.rulesTitle')}
                            description={t('wizard.guestWaitingRules')}
                        />
                    )}
                    {guestStep === 3 && (
                        <WaitingStepCard
                            title={t('wizard.dynamicsTitle')}
                            description={t('lobby.waitingForHost')}
                        />
                    )}
                    {rolesEnabled && guestStep === 4 && (
                        <RolesStep
                            gameState={gameState}
                            myUserId={myUserId}
                            isHost={false}
                            onAssignPlayerRole={onAssignPlayerRole}
                            onRandomizeRoles={onRandomizeRoles}
                        />
                    )}
                    {guestStep === reviewStep && (
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

                <div className="wizard-footer">
                    <div className="wizard-footer-left">
                        <button type="button" className="btn-ghost" onClick={onReturnToLobby}>
                            {t('lobby.returnToLobby')}
                        </button>
                    </div>
                    <div className="wizard-footer-right" />
                </div>

                {error && <p className="error-msg wizard-error">{error}</p>}

                <div className="wizard-secondary-actions">
                    <button type="button" className="btn-ghost" onClick={onLogout}>{t('lobby.leaveSignOut')}</button>
                </div>
            </div>

            {showRoleModal && (
                <RoleModal role={showRoleModal} onDismiss={() => setShowRoleModal(null)} />
            )}
        </div>
    );
}
