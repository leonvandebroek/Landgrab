import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, Player } from '../../types/game';

interface Props {
    gameState: GameState;
    myUserId: string;
    onSetAlliance: (name: string) => void;
}

export function TeamsStep({ gameState, myUserId, onSetAlliance }: Props) {
    const { t } = useTranslation();
    const [allianceName, setAllianceName] = useState('');
    const [copied, setCopied] = useState(false);

    const me = gameState.players.find(p => p.id === myUserId);
    const allHaveAlliance = gameState.players.length >= 2 && gameState.players.every(p => p.allianceId);

    const copyCode = () => {
        navigator.clipboard.writeText(gameState.roomCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* clipboard may not be available */ });
    };

    const joinAlliance = (name: string) => {
        const trimmed = name.trim();
        if (trimmed) {
            setAllianceName(trimmed);
            onSetAlliance(trimmed);
        }
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

                {/* Alliance picker */}
                <div className="wizard-alliance-section">
                    <h3>{t('wizard.teamsAllianceTitle')}</h3>
                    <p className="wizard-hint">{t('wizard.teamsAllianceDesc')}</p>

                    <div className="join-form">
                        <input
                            type="text"
                            value={allianceName}
                            onChange={e => setAllianceName(e.target.value)}
                            placeholder={t('lobby.allianceNamePlaceholder')}
                            maxLength={30}
                        />
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => joinAlliance(allianceName)}
                            disabled={!allianceName.trim()}
                        >
                            {t('lobby.joinCreate')}
                        </button>
                    </div>

                    {gameState.alliances.length > 0 && (
                        <div className="alliances-row">
                            {gameState.alliances.map(alliance => (
                                <button
                                    key={alliance.id}
                                    type="button"
                                    className={`alliance-badge alliance-badge-button${me?.allianceId === alliance.id ? ' is-active' : ''}`}
                                    style={{ background: alliance.color }}
                                    aria-pressed={me?.allianceId === alliance.id}
                                    onClick={() => joinAlliance(alliance.name)}
                                >
                                    {alliance.name} ({alliance.memberIds.length})
                                </button>
                            ))}
                        </div>
                    )}
                </div>

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
            </div>
        </div>
    );
}

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
