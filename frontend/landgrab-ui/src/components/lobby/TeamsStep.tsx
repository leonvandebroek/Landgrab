import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, Player } from '../../types/game';
import { RoleSelector } from './RoleSelector';

// Matches backend AllianceColors for local preview before server response
const ALLIANCE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
const MAX_ALLIANCES = 8;

interface Props {
    gameState: GameState;
    myUserId: string;
    isHost: boolean;
    onSetAlliance: (name: string) => void;
    onConfigureAlliances: (names: string[]) => void;
    onDistributePlayers: () => void;
    onSetPlayerRole?: (role: string) => void;
}

export function TeamsStep({ gameState, myUserId, isHost, onSetAlliance, onConfigureAlliances, onDistributePlayers, onSetPlayerRole }: Props) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const me = gameState.players.find(p => p.id === myUserId);
    const allHaveAlliance = gameState.players.length >= 2 && gameState.players.every(p => p.allianceId);

    const copyCode = () => {
        navigator.clipboard.writeText(gameState.roomCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* clipboard may not be available */ });
    };

    return (
        <div className="wizard-step wizard-step-teams">
            <div className="wizard-step-header">
                <h2>{t('wizard.teamsTitle')}</h2>
                <p className="wizard-step-desc">{t('wizard.teamsDesc')}</p>
            </div>

            <div className="wizard-step-body">
                {/* Room code */}
                <div className="wizard-room-code-card">
                    <span className="wizard-room-code-label">{t('wizard.teamsRoomCode')}</span>
                    <div className="wizard-room-code-row">
                        <span className="room-code wizard-room-code-value">{gameState.roomCode}</span>
                        <button type="button" className="btn-ghost small" onClick={copyCode}>
                            {copied ? t('wizard.teamsCopied') : t('wizard.teamsCopy')}
                        </button>
                    </div>
                </div>

                {isHost ? (
                    <HostAllianceBuilder
                        gameState={gameState}
                        onConfigureAlliances={onConfigureAlliances}
                        onDistributePlayers={onDistributePlayers}
                    />
                ) : (
                    <GuestAlliancePicker
                        gameState={gameState}
                        myAllianceId={me?.allianceId}
                        onSetAlliance={onSetAlliance}
                    />
                )}

                {/* Player list */}
                <div className="wizard-players-section">
                    <h3>{t('wizard.teamsPlayersTitle')}</h3>
                    <div className="players-list players-list-detailed">
                        {gameState.players.map(player => (
                            <PlayerRow key={player.id} player={player} isMe={player.id === myUserId} />
                        ))}
                    </div>
                    {allHaveAlliance ? (
                        <p className="wizard-success-chip">{t('wizard.teamsReady')}</p>
                    ) : (
                        <p className="wizard-hint">{t('wizard.teamsWaiting')}</p>
                    )}
                </div>

                {gameState.dynamics?.playerRolesEnabled && onSetPlayerRole && (
                    <RoleSelector
                        currentRole={me?.role ?? 'None'}
                        onSelectRole={onSetPlayerRole}
                    />
                )}
            </div>
        </div>
    );
}

// ── Host: Alliance Builder ───────────────────────────────────────

function HostAllianceBuilder({
    gameState,
    onConfigureAlliances,
    onDistributePlayers,
}: {
    gameState: GameState;
    onConfigureAlliances: (names: string[]) => void;
    onDistributePlayers: () => void;
}) {
    const { t } = useTranslation();
    const [newName, setNewName] = useState('');
    const [allianceNames, setAllianceNames] = useState<string[]>(() =>
        gameState.alliances.map(a => a.name)
    );

    // Sync local state when server alliances change (render-time pattern per React docs:
    // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
    const [prevAlliances, setPrevAlliances] = useState(gameState.alliances);
    if (prevAlliances !== gameState.alliances) {
        setPrevAlliances(gameState.alliances);
        const serverNames = gameState.alliances.map(a => a.name);
        if (!(allianceNames.length === serverNames.length && allianceNames.every((n, i) => n === serverNames[i]))) {
            setAllianceNames(serverNames);
        }
    }

    const addAlliance = () => {
        const trimmed = newName.trim();
        if (!trimmed) return;
        if (allianceNames.length >= MAX_ALLIANCES) return;
        if (allianceNames.some(n => n.toLowerCase() === trimmed.toLowerCase())) return;

        const updated = [...allianceNames, trimmed];
        setAllianceNames(updated);
        setNewName('');
        onConfigureAlliances(updated);
    };

    const removeAlliance = (index: number) => {
        const updated = allianceNames.filter((_, i) => i !== index);
        setAllianceNames(updated);
        onConfigureAlliances(updated);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addAlliance();
        }
    };

    const canAdd = newName.trim().length > 0
        && allianceNames.length < MAX_ALLIANCES
        && !allianceNames.some(n => n.toLowerCase() === newName.trim().toLowerCase());

    return (
        <div className="wizard-alliance-section">
            <h3>{t('wizard.allianceBuilder')}</h3>
            <p className="wizard-hint">{t('wizard.allianceBuilderDesc')}</p>

            <div className="join-form">
                <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('wizard.allianceNamePlaceholder')}
                    maxLength={30}
                    disabled={allianceNames.length >= MAX_ALLIANCES}
                />
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={addAlliance}
                    disabled={!canAdd}
                >
                    {t('wizard.addAlliance')}
                </button>
            </div>

            {allianceNames.length > 0 && (
                <div className="alliances-row">
                    {allianceNames.map((name, index) => {
                        // Use server color if available, otherwise preview color
                        const serverAlliance = gameState.alliances.find(a => a.name === name);
                        const color = serverAlliance?.color ?? ALLIANCE_COLORS[index % ALLIANCE_COLORS.length];

                        return (
                            <span
                                key={name}
                                className="alliance-badge"
                                style={{ background: color }}
                            >
                                {name}
                                <button
                                    type="button"
                                    className="alliance-badge-remove"
                                    onClick={() => removeAlliance(index)}
                                    aria-label={t('wizard.removeAlliance', { name })}
                                >
                                    ✕
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}

            {allianceNames.length >= 2 && (
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={onDistributePlayers}
                >
                    🎲 {t('wizard.distributePlayers')}
                </button>
            )}
        </div>
    );
}

// ── Guest: Alliance Picker ───────────────────────────────────────

function GuestAlliancePicker({
    gameState,
    myAllianceId,
    onSetAlliance,
}: {
    gameState: GameState;
    myAllianceId: string | undefined;
    onSetAlliance: (name: string) => void;
}) {
    const { t } = useTranslation();

    return (
        <div className="wizard-alliance-section">
            <h3>{t('wizard.teamsAllianceTitle')}</h3>

            {gameState.alliances.length > 0 ? (
                <>
                    <p className="wizard-hint">{t('wizard.guestPickAlliance')}</p>
                    <div className="alliances-row">
                        {gameState.alliances.map(alliance => (
                            <button
                                key={alliance.id}
                                type="button"
                                className={`alliance-badge alliance-badge-button${myAllianceId === alliance.id ? ' is-active' : ''}`}
                                style={{ background: alliance.color }}
                                aria-pressed={myAllianceId === alliance.id}
                                onClick={() => onSetAlliance(alliance.name)}
                            >
                                {alliance.name} ({alliance.memberIds.length})
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <p className="wizard-hint">{t('wizard.guestWaitingAlliances')}</p>
            )}
        </div>
    );
}

// ── Shared: Player Row ───────────────────────────────────────────

function PlayerRow({ player, isMe }: { player: Player; isMe: boolean }) {
    const { t } = useTranslation();

    return (
        <div className={`player-row${isMe ? ' is-me' : ''}`}>
            <span className="player-dot" style={{ background: player.allianceColor ?? player.color }} />
            <div className="player-copy">
                <span className="player-name">{player.name} {player.isHost ? '👑' : ''}</span>
            </div>
            {player.allianceName ? (
                <span className="alliance-tag" style={{ background: player.allianceColor }}>
                    {player.allianceName}
                </span>
            ) : (
                <span className="player-pending-chip">{t('lobby.playerNeedsAllianceShort')}</span>
            )}
        </div>
    );
}
