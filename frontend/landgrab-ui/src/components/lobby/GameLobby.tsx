import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaimMode, GameState, RoomSummary, WinConditionType } from '../../types/game';
import { GameMap } from '../map/GameMap';

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
  onSetClaimMode: (mode: ClaimMode) => void;
  onSetWinCondition: (type: WinConditionType, value: number) => void;
  onSetMasterTile: (lat: number, lng: number) => void;
  onSetMasterTileByHex: (q: number, r: number) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onStartGame: () => void;
  onReturnToLobby: () => void;
  onLogout: () => void;
  error: string;
}

const CLAIM_MODES: ClaimMode[] = ['PresenceOnly', 'PresenceWithTroop', 'AdjacencyRequired'];
const WIN_CONDITION_TYPES: WinConditionType[] = ['TerritoryPercent', 'Elimination', 'TimedGame'];

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
  onSetMapLocation,
  onSetTileSize,
  onSetClaimMode,
  onSetWinCondition,
  onSetMasterTile,
  onSetMasterTileByHex,
  onAssignStartingTile,
  onStartGame,
  onReturnToLobby,
  onLogout,
  error
}: Props) {
  const { t } = useTranslation();
  const [joinCode, setJoinCode] = useState('');
  const [allianceName, setAllianceName] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [selectedHex, setSelectedHex] = useState<[number, number] | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [winValueDraft, setWinValueDraft] = useState<string | null>(null);

  const me = gameState?.players.find(player => player.id === myUserId) ?? null;
  const isHost = me?.isHost ?? false;

  const derivedWinValue = gameState
    ? gameState.winConditionType === 'TimedGame'
      ? gameState.gameDurationMinutes ?? gameState.winConditionValue
      : gameState.winConditionValue
    : 60;

  const effectiveWinValue = winValueDraft ?? String(derivedWinValue);

  const effectiveSelectedPlayerId = gameState?.players.some(player => player.id === selectedPlayerId)
    ? selectedPlayerId
    : gameState?.players[0]?.id ?? '';

  const canStart = useMemo(() => {
    if (!gameState) {
      return false;
    }

    return gameState.players.length >= 2 &&
      gameState.hasMapLocation &&
      gameState.masterTileQ !== null &&
      gameState.masterTileR !== null &&
      gameState.players.every(player => player.allianceId) &&
      gameState.players.every(player => player.territoryCount > 0);
  }, [gameState]);

  const applyManualLocation = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setManualLat(formatCoordinate(lat));
      setManualLng(formatCoordinate(lng));
      onSetMapLocation(lat, lng);
    }
  };

  const useCurrentGpsForMapLocation = () => {
    if (!currentLocation) {
      return;
    }

    setManualLat(formatCoordinate(currentLocation.lat));
    setManualLng(formatCoordinate(currentLocation.lng));
    onSetMapLocation(currentLocation.lat, currentLocation.lng);
  };

  const applyWinCondition = () => {
    if (!gameState) {
      return;
    }

    const parsedValue = Number(effectiveWinValue);
    if (!Number.isFinite(parsedValue)) {
      return;
    }

    onSetWinCondition(gameState.winConditionType, parsedValue);
    setWinValueDraft(null);
  };

  const handleWinConditionTypeChange = (type: WinConditionType) => {
    if (!gameState) {
      return;
    }

    const currentValue = Number(effectiveWinValue);
    const fallbackValue = type === 'TimedGame'
      ? gameState.gameDurationMinutes ?? 15
      : gameState.winConditionValue;

    onSetWinCondition(
      type,
      type === 'Elimination'
        ? 1
        : Number.isFinite(currentValue) && currentValue > 0 ? currentValue : fallbackValue
    );
    setWinValueDraft(null);
  };

  const assignStartingTile = () => {
    if (!selectedHex || !effectiveSelectedPlayerId) {
      return;
    }

    onAssignStartingTile(selectedHex[0], selectedHex[1], effectiveSelectedPlayerId);
  };

  const assignMasterTileFromSelectedHex = () => {
    if (!selectedHex) {
      return;
    }

    onSetMasterTileByHex(selectedHex[0], selectedHex[1]);
  };

  const joinAlliance = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    setAllianceName(trimmedName);
    onSetAlliance(trimmedName);
  };

  if (!gameState) {
    return (
      <div className="lobby-page">
        <div className="lobby-card">
          <h2>{t('lobby.welcome', { username })}</h2>
          <p className="subtitle">{t('lobby.chooseYourBattle')}</p>

          <button type="button" className="btn-primary big" onClick={onCreateRoom} disabled={!connected}>
            {t('lobby.createRoom')}
          </button>

          <div className="divider">{t('lobby.orJoin')}</div>

          <div className="join-form">
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
              disabled={!connected || joinCode.length < 4}
            >
              {t('lobby.join')}
            </button>
          </div>

          {recentRooms.length > 0 && (
            <div className="section">
              <h3>{t('lobby.recentRooms')}</h3>
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
            </div>
          )}

          {error && <p className="error-msg">{error}</p>}
          {!connected && <p className="info-msg">{t('lobby.connectingToServer')}</p>}

          <button type="button" className="btn-ghost" onClick={onLogout}>{t('lobby.signOut')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <h2>{t('lobby.roomTitle', { code: gameState.roomCode })}</h2>
        <p className="subtitle">{t('lobby.roomSubtitle')}</p>

        <div className="players-list">
          {gameState.players.map(player => (
            <div key={player.id} className="player-row">
              <span className="player-dot" style={{ background: player.allianceColor ?? player.color }} />
              <span className="player-name">{player.name} {player.isHost ? '👑' : ''}</span>
              {player.allianceName && (
                <span className="alliance-tag" style={{ background: player.allianceColor }}>
                  {player.allianceName}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="section">
          <h3>{t('lobby.yourAlliance')}</h3>
          <div className="join-form">
              <input
                type="text"
                value={allianceName}
                onChange={event => setAllianceName(event.target.value)}
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

        <div className="status-list">
          <span className="status-chip">{t('lobby.tileSizeChip', { distance: formatDistance(gameState.tileSizeMeters) })}</span>
          <span className="status-chip">{t('lobby.claimChip', { mode: t(`claimMode.${gameState.claimMode}.title`) })}</span>
          <span className="status-chip">{t('lobby.winChip', { condition: t(`winCondition.${gameState.winConditionType}`) })}</span>
          {gameState.masterTileQ !== null && gameState.masterTileR !== null && (
            <span className="status-chip">{t('lobby.masterTileChip', { q: gameState.masterTileQ, r: gameState.masterTileR })}</span>
          )}
        </div>

        {isHost && (
          <div className="setting-grid">
            <div className="setting-card">
              <h3>{t('lobby.mapCenter')}</h3>
              {gameState.mapLat !== null && gameState.mapLng !== null ? (
                <p className="info-msg">📍 {gameState.mapLat.toFixed(5)}, {gameState.mapLng.toFixed(5)}</p>
              ) : (
                <p className="section-note">{t('lobby.mapCenterNote')}</p>
              )}

              <div className="location-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={useCurrentGpsForMapLocation}
                  disabled={!currentLocation || locationLoading}
                >
                  {locationLoading ? t('lobby.locating') : t('lobby.useMyCurrentGps')}
                </button>
              </div>

              <div className="manual-location">
                <input
                  type="number"
                  value={manualLat}
                  onChange={event => setManualLat(event.target.value)}
                  placeholder={t('lobby.latitude')}
                  step="0.0001"
                />
                <input
                  type="number"
                  value={manualLng}
                  onChange={event => setManualLng(event.target.value)}
                  placeholder={t('lobby.longitude')}
                  step="0.0001"
                />
                <button type="button" className="btn-ghost small" onClick={applyManualLocation}>
                  {t('lobby.applyManual')}
                </button>
              </div>
            </div>

            <div className="setting-card">
              <h3>{t('lobby.roomSettings')}</h3>

              <label className="range-field">
                <span>{t('lobby.tileSizeLabel')} <strong className="range-value">{formatDistance(gameState.tileSizeMeters)}</strong></span>
                <input
                  type="range"
                  min={50}
                  max={1000}
                  step={50}
                  value={gameState.tileSizeMeters}
                  onChange={event => onSetTileSize(Number(event.target.value))}
                />
              </label>

              <div className="claim-mode-grid">
                {CLAIM_MODES.map(mode => (
                  <label key={mode} className={`claim-mode-option${gameState.claimMode === mode ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name="claim-mode"
                      checked={gameState.claimMode === mode}
                      onChange={() => onSetClaimMode(mode)}
                    />
                    <span className="claim-mode-copy">
                      <strong>{t(`claimMode.${mode}.title`)}</strong>
                      <span>{t(`claimMode.${mode}.detail`)}</span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="settings-row">
                <select
                  className="inline-select"
                  value={gameState.winConditionType}
                  onChange={event => handleWinConditionTypeChange(event.target.value as WinConditionType)}
                >
                  {WIN_CONDITION_TYPES.map(type => (
                    <option key={type} value={type}>{t(`winCondition.${type}`)}</option>
                  ))}
                </select>

                {gameState.winConditionType !== 'Elimination' && (
                  <input
                    type="number"
                    min={1}
                    max={gameState.winConditionType === 'TerritoryPercent' ? 100 : undefined}
                    value={effectiveWinValue}
                    onChange={event => setWinValueDraft(event.target.value)}
                    placeholder={gameState.winConditionType === 'TimedGame'
                      ? t('lobby.minutesPlaceholder')
                      : t('lobby.percentPlaceholder')}
                  />
                )}

                <button type="button" className="btn-secondary" onClick={applyWinCondition}>
                  {t('lobby.apply')}
                </button>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => currentLocation && onSetMasterTile(currentLocation.lat, currentLocation.lng)}
                disabled={!currentLocation || locationLoading}
              >
                {gameState.masterTileQ !== null ? t('lobby.moveMasterTile') : t('lobby.setMasterTile')}
              </button>
            </div>
          </div>
        )}

        {locationError && <p className="error-msg">{locationError}</p>}
        {error && <p className="error-msg">{error}</p>}

        {gameState.mapLat !== null && gameState.mapLng !== null && (
          <div className="map-card">
            <div>
              <h3>{t('lobby.hexSetup')}</h3>
              <p className="section-note">{t('lobby.hexSetupNote')}</p>
            </div>

            <div className="lobby-map">
              <GameMap
                state={gameState}
                myUserId={myUserId}
                currentLocation={currentLocation}
                selectedHex={selectedHex}
                onHexClick={isHost ? (q, r, cell) => {
                  if (cell?.isMasterTile) {
                    return;
                  }
                  setSelectedHex([q, r]);
                } : undefined}
              />
            </div>

            {isHost && (
              <div className="selected-hex-card">
                <span>
                  {t('lobby.selectedHex')}{' '}
                  <strong>{selectedHex ? `${selectedHex[0]}, ${selectedHex[1]}` : t('lobby.pickOne')}</strong>
                </span>

                <div className="settings-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={assignMasterTileFromSelectedHex}
                    disabled={!selectedHex}
                  >
                    {gameState.masterTileQ !== null ? t('lobby.moveMasterTileToSelectedHex') : t('lobby.setMasterTileToSelectedHex')}
                  </button>

                  <select
                    className="inline-select"
                    value={effectiveSelectedPlayerId}
                    onChange={event => setSelectedPlayerId(event.target.value)}
                  >
                    {gameState.players.map(player => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={assignStartingTile}
                    disabled={!selectedHex || !effectiveSelectedPlayerId || gameState.masterTileQ === null || gameState.masterTileR === null}
                  >
                    {t('lobby.assignTile')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isHost ? (
          <button
            type="button"
            className="btn-primary big"
            onClick={onStartGame}
            disabled={!canStart}
          >
            {t('lobby.startGame')}
          </button>
        ) : (
          <p className="info-msg">{t('lobby.waitingForHost')}</p>
        )}

        <div className="secondary-actions">
          <button type="button" className="btn-secondary" onClick={onReturnToLobby}>
            {t('lobby.returnToLobby')}
          </button>
          <button type="button" className="btn-ghost" onClick={onLogout}>{t('lobby.leaveSignOut')}</button>
        </div>
      </div>
    </div>
  );
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }

  return `${meters} m`;
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}
