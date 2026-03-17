import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, Player } from '../../types/game';
import { GameIcon } from '../common/GameIcon';

const ALLIANCE_COLORS = ['#ef4444', '#06b6d4', '#f59e0b', '#a855f7', '#10b981', '#ec4899', '#e67e22', '#34495e'];
const MAX_ALLIANCES = 8;

interface Props {
    gameState: GameState;
    myUserId: string;
    isHost: boolean;
    onSetAlliance: (name: string) => void;
    onConfigureAlliances: (names: string[]) => void;
    onDistributePlayers: () => void;
}

export function TeamsStep({
    gameState,
    myUserId,
    isHost,
    onSetAlliance,
    onConfigureAlliances,
    onDistributePlayers,
}: Props) {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const me = gameState.players.find(p => p.id === myUserId);
    const myAllianceId = me?.allianceId;
    const connectedPlayers = useMemo(
        () => gameState.players.filter(player => player.isConnected),
        [gameState.players],
    );
    const playersWaitingForAllianceCount = useMemo(
        () => connectedPlayers.filter(player => !player.allianceId).length,
        [connectedPlayers],
    );

    const readinessMessage = useMemo(() => {
        if (playersWaitingForAllianceCount > 0) {
            return {
                className: 'wizard-hint',
                message: t('wizard.teamsWaitingAssignment', { count: playersWaitingForAllianceCount }),
            };
        }

        if (connectedPlayers.length >= 2 && connectedPlayers.length === gameState.players.length) {
            return {
                className: 'wizard-success-chip',
                message: t('wizard.teamsAllReady'),
            };
        }

        return {
            className: 'wizard-hint',
            message: t('wizard.teamsConnected', { count: connectedPlayers.length }),
        };
    }, [connectedPlayers.length, gameState.players.length, playersWaitingForAllianceCount, t]);

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
                    <>
                        <HostAllianceBuilder
                            gameState={gameState}
                            onConfigureAlliances={onConfigureAlliances}
                            onDistributePlayers={onDistributePlayers}
                        />
                        <AlliancePickerSection
                            title={myAllianceId ? t('wizard.yourAllianceJoined' as never, { alliance: gameState.alliances.find(a => a.id === myAllianceId)?.name ?? '' }) : t('wizard.hostJoinAlliance')}
                            hint={myAllianceId ? t('wizard.switchAllianceHint' as never) : t('wizard.hostJoinAllianceDesc')}
                            emptyHint={t('wizard.guestWaitingAlliances')}
                            gameState={gameState}
                            myAllianceId={myAllianceId}
                            onSetAlliance={onSetAlliance}
                        />
                    </>
                ) : (
                    <AlliancePickerSection
                        title={myAllianceId ? t('wizard.yourAllianceJoined' as never, { alliance: gameState.alliances.find(a => a.id === myAllianceId)?.name ?? '' }) : t('wizard.teamsAllianceTitle')}
                        hint={myAllianceId ? t('wizard.switchAllianceHint' as never) : t('wizard.guestPickAlliance')}
                        emptyHint={t('wizard.guestWaitingAlliances')}
                        gameState={gameState}
                        myAllianceId={myAllianceId}
                        onSetAlliance={onSetAlliance}
                    />
                )}

                <div className="wizard-players-section">
                    <div className="card-header">
                        <div>
                            <h3>{t('wizard.teamsPlayersTitle')}</h3>
                        </div>
                    </div>
                    <div className="players-list players-list-detailed">
                        {gameState.players.map(player => (
                            <PlayerRow
                                key={player.id}
                                player={player}
                                isMe={player.id === myUserId}
                            />
                        ))}
                    </div>
                    <p className={readinessMessage.className}>{readinessMessage.message}</p>
                </div>
            </div>
        </div>
    );
}

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
        gameState.alliances.map(a => a.name),
    );

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
                    {t('wizard.distributePlayers')}
                </button>
            )}
        </div>
    );
}

function AlliancePickerSection({
    title,
    hint,
    emptyHint,
    gameState,
    myAllianceId,
    onSetAlliance,
}: {
    title: string;
    hint: string;
    emptyHint: string;
    gameState: GameState;
    myAllianceId: string | undefined;
    onSetAlliance: (name: string) => void;
}) {
    return (
        <div className="wizard-alliance-section">
            <h3>{title}</h3>

            {gameState.alliances.length > 0 ? (
                <>
                    <p className="wizard-hint">{hint}</p>
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
                <p className="wizard-hint">{emptyHint}</p>
            )}
        </div>
    );
}

function PlayerRow({
    player,
    isMe,
}: {
    player: Player;
    isMe: boolean;
}) {
    const { t } = useTranslation();

    return (
        <div className={`player-row${isMe ? ' is-me' : ''}`}>
            <span className="player-dot" style={{ background: player.allianceColor ?? player.color }} />
            <div className="player-copy">
                <span className="player-name">{player.name} {player.isHost && <GameIcon name="crown" size="sm" />}</span>
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
