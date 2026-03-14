import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ClaimMode, CopresenceMode, GameAreaPattern, GameDynamics, GameState, HexCoordinate, RoomSummary, WinConditionType } from '../../types/game';
import { SetupWizard } from './SetupWizard';
import { GuestWizardView } from './GuestWizardView';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface Props {
  username: string;
  myUserId: string;
  gameState: GameState | null;
  connected: boolean;
  currentLocation: LocationPoint | null;
  locationError: string | null;
  locationLoading: boolean;
  recentRooms: RoomSummary[];
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onSetAlliance: (name: string) => void;
  onSetMapLocation: (lat: number, lng: number) => void;
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
  onSetPlayerRole?: (role: string) => void;
  onSetMasterTile: (lat: number, lng: number) => void;
  onSetMasterTileByHex: (q: number, r: number) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onSetAllianceHQ?: (q: number, r: number, allianceId: string) => void;
  onConfigureAlliances: (names: string[]) => void;
  onDistributePlayers: () => void;
  onAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  onStartGame: () => void;
  onReturnToLobby: () => void;
  onLogout: () => void;
  onSetObserverMode?: (enabled: boolean) => void;
  error: string;
  invoke?: (method: string, ...args: unknown[]) => Promise<unknown>;
}

export function GameLobby({
  username,
  myUserId,
  gameState,
  connected,
  currentLocation,
  locationError,
  locationLoading,
  recentRooms,
  onCreateRoom,
  onJoinRoom,
  onSetAlliance,
  onConfigureAlliances,
  onDistributePlayers,
  onSetMapLocation,
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
  onSetPlayerRole,
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
  const [joinCode, setJoinCode] = useState('');

  const canSubmitJoinCode = connected && joinCode.trim().length === 6;
  const me = gameState?.players.find(p => p.id === myUserId);
  const isHost = me?.isHost ?? false;

  // ── No room: entry screen ──────────────────────────────────────
  if (!gameState) {
    return (
      <div className="lobby-page">
        <div className="lobby-card is-entry">
          <div className="lobby-entry-hero">
            <div className="lobby-entry-copy">
              <span className="section-kicker">{t('lobby.stagingBadge')}</span>
              <h2>{t('lobby.lobbyLeadTitle')}</h2>
              <p className="subtitle">{t('lobby.lobbyLeadBody')}</p>
            </div>

            <div className="lobby-entry-meta">
              <div className="entry-user-chip">
                <strong>{t('lobby.welcome', { username })}</strong>
                <span>{connected ? t('lobby.roomStatusConnected') : t('lobby.connectingToServer')}</span>
              </div>
              <div className="entry-highlight-card">
                <span className="room-code">6</span>
                <div>
                  <strong>{t('lobby.joinRoomTitle')}</strong>
                  <span>{t('lobby.joinRoomDetail')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lobby-entry-layout">
            <div className="lobby-entry-main">
              <div className="setting-card entry-panel entry-panel-primary">
                <div className="card-header">
                  <div>
                    <span className="section-kicker">{t('lobby.chooseYourBattle')}</span>
                    <h3>{t('lobby.createRoomTitle')}</h3>
                    <p className="section-note">{t('lobby.createRoomDetail')}</p>
                  </div>
                  <span className={`status-chip${connected ? ' is-ready' : ''}`}>
                    {connected ? t('lobby.roomStatusConnected') : t('lobby.connectingToServer')}
                  </span>
                </div>

                <button type="button" className="btn-primary big" onClick={onCreateRoom} disabled={!connected}>
                  {t('lobby.createRoom')}
                </button>
              </div>

              <div className="setting-card entry-panel">
                <div className="card-header">
                  <div>
                    <span className="section-kicker">{t('lobby.orJoin')}</span>
                    <h3>{t('lobby.joinRoomTitle')}</h3>
                    <p className="section-note">{t('lobby.joinRoomDetail')}</p>
                  </div>
                </div>

                <div className="join-form entry-join-form">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={event => setJoinCode(event.target.value.toUpperCase())}
                    placeholder={t('lobby.roomCodePlaceholder')}
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => onJoinRoom(joinCode)}
                    disabled={!canSubmitJoinCode}
                    title={getJoinDisabledReason(joinCode, connected, t) ?? undefined}
                  >
                    {t('lobby.join')}
                  </button>
                </div>
                {!canSubmitJoinCode && (
                  <p className="section-note">{getJoinDisabledReason(joinCode, connected, t)}</p>
                )}
              </div>
            </div>

            <div className="lobby-entry-side">
              <div className="setting-card entry-panel entry-panel-secondary">
                <div className="card-header">
                  <div>
                    <h3>{t('lobby.recentRooms')}</h3>
                    <p className="section-note">{t('lobby.recentRoomsNote')}</p>
                  </div>
                </div>

                {recentRooms.length > 0 ? (
                  <div className="recent-rooms-list">
                    {recentRooms.map(room => (
                      <button
                        key={room.code}
                        type="button"
                        className="recent-room-button"
                        onClick={() => onJoinRoom(room.code)}
                      >
                        <div className="recent-room-copy">
                          <div className="recent-room-heading">
                            <span className="room-code">{room.code}</span>
                            <span className="phase-badge">{t(`phase.${room.phase}`)}</span>
                          </div>
                          <span className="section-note">
                            {t('lobby.roomHostedBy', { name: room.hostName })} · {t('lobby.roomPlayerCount', { count: room.playerCount })}
                          </span>
                        </div>
                        <span className="recent-room-status">
                          {room.isConnected ? t('lobby.roomStatusConnected') : t('lobby.roomStatusDisconnected')}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="stage-spotlight-card compact">
                    <strong>{t('lobby.joinRoomTitle')}</strong>
                    <span>{t('lobby.joinRoomDetail')}</span>
                  </div>
                )}
              </div>

              <div className="entry-footer-actions">
                {error && <p className="error-msg">{error}</p>}
                {!connected && <p className="info-msg">{t('lobby.connectingToServer')}</p>}
                <button type="button" className="btn-ghost" onClick={onLogout}>{t('lobby.signOut')}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── In room: wizard ────────────────────────────────────────────
  if (isHost) {
    return (
      <SetupWizard
        gameState={gameState}
        myUserId={myUserId}
        currentLocation={currentLocation}
        locationError={locationError}
        locationLoading={locationLoading}
        onSetMapLocation={onSetMapLocation}
        onSetAlliance={onSetAlliance}
        onConfigureAlliances={onConfigureAlliances}
        onDistributePlayers={onDistributePlayers}
        onSetTileSize={onSetTileSize}
        onUseCenteredGameArea={onUseCenteredGameArea}
        onSetPatternGameArea={onSetPatternGameArea}
        onSetCustomGameArea={onSetCustomGameArea}
        onSetClaimMode={onSetClaimMode}
        onSetAllowSelfClaim={onSetAllowSelfClaim}
        onSetWinCondition={onSetWinCondition}
        onSetCopresenceModes={onSetCopresenceModes}
        onSetCopresencePreset={onSetCopresencePreset}
        onSetGameDynamics={onSetGameDynamics}
        onSetPlayerRole={onSetPlayerRole}
        onSetMasterTileByHex={onSetMasterTileByHex}
        onAssignStartingTile={onAssignStartingTile}
        onSetAllianceHQ={onSetAllianceHQ}
        onStartGame={onStartGame}
        onReturnToLobby={onReturnToLobby}
        onLogout={onLogout}
        onSetObserverMode={onSetObserverMode}
        error={error}
        invoke={invoke}
      />
    );
  }

  return (
    <GuestWizardView
      gameState={gameState}
      myUserId={myUserId}
      currentLocation={currentLocation}
      onSetAlliance={onSetAlliance}
      onSetPlayerRole={onSetPlayerRole}
      onSetMasterTileByHex={onSetMasterTileByHex}
      onAssignStartingTile={onAssignStartingTile}
      onStartGame={onStartGame}
      onReturnToLobby={onReturnToLobby}
      onLogout={onLogout}
      error={error}
    />
  );
}

function getJoinDisabledReason(joinCode: string, connected: boolean, t: TFunction): string | null {
  if (!connected) return t('lobby.disabledReason.connecting');
  if (joinCode.trim().length !== 6) return t('lobby.disabledReason.roomCodeLength');
  return null;
}
