import { useMemo, useState } from 'react';
import type { ClaimMode, GameState, WinConditionType } from '../../types/game';
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
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onSetAlliance: (name: string) => void;
  onSetMapLocation: (lat: number, lng: number) => void;
  onSetTileSize: (meters: number) => void;
  onSetClaimMode: (mode: ClaimMode) => void;
  onSetWinCondition: (type: WinConditionType, value: number) => void;
  onSetMasterTile: (lat: number, lng: number) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onStartGame: () => void;
  onLogout: () => void;
  error: string;
}

const CLAIM_MODE_DETAILS: Array<{ mode: ClaimMode; title: string; detail: string }> = [
  {
    mode: 'PresenceOnly',
    title: 'Presence only',
    detail: 'Neutral tiles can be claimed by standing on them.'
  },
  {
    mode: 'PresenceWithTroop',
    title: 'Presence with troop',
    detail: 'Neutral claims spend 1 carried troop.'
  },
  {
    mode: 'AdjacencyRequired',
    title: 'Adjacency required',
    detail: 'Neutral claims must border your alliance territory.'
  }
];

const WIN_CONDITION_LABELS: Record<WinConditionType, string> = {
  TerritoryPercent: 'Territory %',
  Elimination: 'Elimination',
  TimedGame: 'Timed game'
};

export function GameLobby({
  username,
  myUserId,
  gameState,
  connected,
  currentLocation,
  locationError,
  locationLoading,
  onCreateRoom,
  onJoinRoom,
  onSetAlliance,
  onSetMapLocation,
  onSetTileSize,
  onSetClaimMode,
  onSetWinCondition,
  onSetMasterTile,
  onAssignStartingTile,
  onStartGame,
  onLogout,
  error
}: Props) {
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
      onSetMapLocation(lat, lng);
    }
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

  if (!gameState) {
    return (
      <div className="lobby-page">
        <div className="lobby-card">
          <h2>Welcome, {username}!</h2>
          <p className="subtitle">Choose your battle:</p>

          <button type="button" className="btn-primary big" onClick={onCreateRoom} disabled={!connected}>
            🏠 Create Room
          </button>

          <div className="divider">— or join —</div>

          <div className="join-form">
            <input
              type="text"
              value={joinCode}
              onChange={event => setJoinCode(event.target.value.toUpperCase())}
              placeholder="Room code (e.g. ABC123)"
              maxLength={6}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onJoinRoom(joinCode)}
              disabled={!connected || joinCode.length < 4}
            >
              Join
            </button>
          </div>

          {error && <p className="error-msg">{error}</p>}
          {!connected && <p className="info-msg">Connecting to server…</p>}

          <button type="button" className="btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <h2>Room: <span className="room-code">{gameState.roomCode}</span></h2>
        <p className="subtitle">Share this code with friends and configure the battlefield.</p>

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
          <h3>Your Alliance</h3>
          <div className="join-form">
            <input
              type="text"
              value={allianceName}
              onChange={event => setAllianceName(event.target.value)}
              placeholder="Alliance name (e.g. Red Team)"
              maxLength={30}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => allianceName.trim() && onSetAlliance(allianceName)}
              disabled={!allianceName.trim()}
            >
              Join / Create
            </button>
          </div>

          {gameState.alliances.length > 0 && (
            <div className="alliances-row">
              {gameState.alliances.map(alliance => (
                <span key={alliance.id} className="alliance-badge" style={{ background: alliance.color }}>
                  {alliance.name} ({alliance.memberIds.length})
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="status-list">
          <span className="status-chip">Tile size: {formatDistance(gameState.tileSizeMeters)}</span>
          <span className="status-chip">Claim: {CLAIM_MODE_DETAILS.find(item => item.mode === gameState.claimMode)?.title ?? gameState.claimMode}</span>
          <span className="status-chip">Win: {WIN_CONDITION_LABELS[gameState.winConditionType]}</span>
          {gameState.masterTileQ !== null && gameState.masterTileR !== null && (
            <span className="status-chip">Master tile: {gameState.masterTileQ}, {gameState.masterTileR}</span>
          )}
        </div>

        {isHost && (
          <div className="setting-grid">
            <div className="setting-card">
              <h3>Map Center</h3>
              {gameState.mapLat !== null && gameState.mapLng !== null ? (
                <p className="info-msg">📍 {gameState.mapLat.toFixed(5)}, {gameState.mapLng.toFixed(5)}</p>
              ) : (
                <p className="section-note">Set a map center explicitly, or let the master tile use your current GPS as the anchor.</p>
              )}

              <div className="location-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => currentLocation && onSetMapLocation(currentLocation.lat, currentLocation.lng)}
                  disabled={!currentLocation || locationLoading}
                >
                  {locationLoading ? 'Locating…' : 'Use My Current GPS'}
                </button>
              </div>

              <div className="manual-location">
                <input
                  type="number"
                  value={manualLat}
                  onChange={event => setManualLat(event.target.value)}
                  placeholder="Latitude"
                  step="0.0001"
                />
                <input
                  type="number"
                  value={manualLng}
                  onChange={event => setManualLng(event.target.value)}
                  placeholder="Longitude"
                  step="0.0001"
                />
                <button type="button" className="btn-ghost small" onClick={applyManualLocation}>
                  Apply manual
                </button>
              </div>
            </div>

            <div className="setting-card">
              <h3>Room Settings</h3>

              <label className="range-field">
                <span>Tile size <strong className="range-value">{formatDistance(gameState.tileSizeMeters)}</strong></span>
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
                {CLAIM_MODE_DETAILS.map(({ mode, title, detail }) => (
                  <label key={mode} className={`claim-mode-option${gameState.claimMode === mode ? ' active' : ''}`}>
                    <input
                      type="radio"
                      name="claim-mode"
                      checked={gameState.claimMode === mode}
                      onChange={() => onSetClaimMode(mode)}
                    />
                    <span className="claim-mode-copy">
                      <strong>{title}</strong>
                      <span>{detail}</span>
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
                  {Object.entries(WIN_CONDITION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>

                {gameState.winConditionType !== 'Elimination' && (
                  <input
                    type="number"
                    min={1}
                    max={gameState.winConditionType === 'TerritoryPercent' ? 100 : undefined}
                    value={effectiveWinValue}
                    onChange={event => setWinValueDraft(event.target.value)}
                    placeholder={gameState.winConditionType === 'TimedGame' ? 'Minutes' : 'Percent'}
                  />
                )}

                <button type="button" className="btn-secondary" onClick={applyWinCondition}>
                  Apply
                </button>
              </div>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => currentLocation && onSetMasterTile(currentLocation.lat, currentLocation.lng)}
                disabled={!currentLocation || locationLoading}
              >
                {gameState.masterTileQ !== null ? 'Move Master Tile to My GPS' : 'Set Master Tile from My GPS'}
              </button>
            </div>
          </div>
        )}

        {locationError && <p className="error-msg">{locationError}</p>}
        {error && <p className="error-msg">{error}</p>}

        {gameState.masterTileQ !== null && gameState.masterTileR !== null && gameState.mapLat !== null && gameState.mapLng !== null && (
          <div className="map-card">
            <div>
              <h3>Starting Tile Assignment</h3>
              <p className="section-note">Click a hex, choose a player, then assign their starting tile.</p>
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
                  Selected hex:{' '}
                  <strong>{selectedHex ? `${selectedHex[0]}, ${selectedHex[1]}` : 'Pick one on the map'}</strong>
                </span>

                <div className="settings-row">
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
                    disabled={!selectedHex || !effectiveSelectedPlayerId}
                  >
                    Assign tile
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
            🚀 Start Real-Time Game
          </button>
        ) : (
          <p className="info-msg">Waiting for the host to finish setup and start the match…</p>
        )}

        <button type="button" className="btn-ghost" onClick={onLogout}>Leave &amp; Sign out</button>
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
