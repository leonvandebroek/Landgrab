import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, Player, PlayerRole } from '../../types/game';
import { GameIcon } from '../common/GameIcon';
import { RoleModal } from './RoleModal';
import { isRoleModalRole, type RoleModalRole } from './roleModalUtils';

const ROLE_OPTIONS: PlayerRole[] = ['None', 'Commander', 'Scout', 'Engineer'];

const ROLE_LABEL_KEYS: Record<PlayerRole, string> = {
    None: 'phase4.roleNone',
    Commander: 'phase4.roleCommander',
    Scout: 'phase4.roleScout',
    Engineer: 'phase4.roleEngineer',
};

interface Props {
    gameState: GameState;
    myUserId: string;
    isHost: boolean;
    enableAssignedRoleModal?: boolean;
    onAssignPlayerRole: (targetPlayerId: string, role: string) => void;
    onRandomizeRoles: () => void;
}

export function RolesStep({
    gameState,
    myUserId,
    isHost,
    enableAssignedRoleModal = true,
    onAssignPlayerRole,
    onRandomizeRoles,
}: Props) {
    const { t } = useTranslation();
    const [showRoleModal, setShowRoleModal] = useState<RoleModalRole | null>(null);

    const me = gameState.players.find(player => player.id === myUserId);
    const myRole = me?.role ?? 'None';
    const previousRoleRef = useRef<PlayerRole>(myRole);

    useEffect(() => {
        const previousRole = previousRoleRef.current;
        previousRoleRef.current = myRole;

        if (!enableAssignedRoleModal || isRoleModalRole(previousRole) || !isRoleModalRole(myRole)) {
            return;
        }

        const timer = window.setTimeout(() => {
            setShowRoleModal(myRole);
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [enableAssignedRoleModal, myRole]);

    return (
        <div className="wizard-step">
            <div className="wizard-step-header">
                <h2>{t('wizard.rolesTitle')}</h2>
                <p className="wizard-step-desc">{t('wizard.rolesDesc')}</p>
            </div>

            <div className="wizard-step-body">
                <div className="wizard-players-section">
                    <div className="card-header">
                        <div>
                            <h3>{t('wizard.teamsPlayersTitle')}</h3>
                            {isHost && <p className="wizard-hint">{t('wizard.randomizeRolesDesc')}</p>}
                        </div>
                        {isHost && (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={onRandomizeRoles}
                                title={t('wizard.randomizeRolesDesc')}
                            >
                                {t('wizard.randomizeRoles')}
                            </button>
                        )}
                    </div>

                    <div className="players-list players-list-detailed">
                        {gameState.players.map(player => (
                            <PlayerRow
                                key={player.id}
                                player={player}
                                isHost={isHost}
                                isMe={player.id === myUserId}
                                onAssignPlayerRole={onAssignPlayerRole}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {showRoleModal && (
                <RoleModal role={showRoleModal} onDismiss={() => setShowRoleModal(null)} />
            )}
        </div>
    );
}

function PlayerRow({
    player,
    isHost,
    isMe,
    onAssignPlayerRole,
}: {
    player: Player;
    isHost: boolean;
    isMe: boolean;
    onAssignPlayerRole: (targetPlayerId: string, role: string) => void;
}) {
    const { t } = useTranslation();
    const currentRole = player.role ?? 'None';

    const handleRoleChange = (event: ChangeEvent<HTMLSelectElement>) => {
        onAssignPlayerRole(player.id, event.target.value);
    };

    return (
        <div className={`player-row${isMe ? ' is-me' : ''}`}>
            <span className="player-dot" style={{ background: player.allianceColor ?? player.color }} />
            <div className="player-copy">
                <span className="player-name">{player.name} {player.isHost && <GameIcon name="crown" size="sm" />}</span>
                {!isHost && <span className="section-note">{t(ROLE_LABEL_KEYS[currentRole] as never)}</span>}
            </div>
            {isHost ? (
                <select
                    value={currentRole}
                    onChange={handleRoleChange}
                    aria-label={`${t('wizard.assignRole')} ${player.name}`}
                >
                    {ROLE_OPTIONS.map(role => (
                        <option key={role} value={role}>
                            {t(ROLE_LABEL_KEYS[role] as never)}
                        </option>
                    ))}
                </select>
            ) : null}
            {player.allianceName ? (
                <span className="alliance-tag" style={{ background: player.allianceColor }}>
                    {player.allianceName}
                </span>
            ) : (
                <span className="section-note">{t('lobby.playerNeedsAllianceShort')}</span>
            )}
        </div>
    );
}