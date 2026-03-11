import { useState } from 'react';
import type { GameState } from '../../types/game';
import { useGeolocation } from '../../hooks/useGeolocation';

interface Props {
  username: string;
  gameState: GameState | null;
  connected: boolean;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onSetAlliance: (name: string) => void;
  onSetMapLocation: (lat: number, lng: number) => void;
  onStartGame: () => void;
  onLogout: () => void;
  error: string;
}

export function GameLobby({
  username, gameState, connected,
  onCreateRoom, onJoinRoom, onSetAlliance, onSetMapLocation, onStartGame,
  onLogout, error
}: Props) {
  const [joinCode, setJoinCode] = useState('');
  const [allianceName, setAllianceName] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const geo = useGeolocation();

  const me = gameState?.players.find(p => p.name === username);
  const isHost = me?.isHost ?? false;

  const handleUseGPS = () => {
    geo.request();
  };

  const handleApplyGPS = () => {
    if (geo.lat !== null && geo.lng !== null) {
      onSetMapLocation(geo.lat, geo.lng);
    }
  };

  const handleSetManual = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      onSetMapLocation(lat, lng);
    }
  };

  if (!gameState) {
    return (
      <div className="lobby-page">
        <div className="lobby-card">
          <h2>Welcome, {username}!</h2>
          <p className="subtitle">Choose your battle:</p>

          <button className="btn-primary big" onClick={onCreateRoom} disabled={!connected}>
            🏠 Create Room
          </button>

          <div className="divider">— or join —</div>

          <div className="join-form">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Room code (e.g. ABC123)"
              maxLength={6}
            />
            <button
              className="btn-secondary"
              onClick={() => onJoinRoom(joinCode)}
              disabled={!connected || joinCode.length < 4}
            >
              Join
            </button>
          </div>

          {error && <p className="error-msg">{error}</p>}
          {!connected && <p className="info-msg">Connecting to server…</p>}

          <button className="btn-ghost" onClick={onLogout}>Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <h2>Room: <span className="room-code">{gameState.roomCode}</span></h2>
        <p className="subtitle">Share this code with friends!</p>

        {/* Players list */}
        <div className="players-list">
          {gameState.players.map(p => (
            <div key={p.id} className="player-row">
              <span className="player-dot" style={{ background: p.allianceColor ?? p.color }} />
              <span className="player-name">{p.name} {p.isHost ? '👑' : ''}</span>
              {p.allianceName && (
                <span className="alliance-tag" style={{ background: p.allianceColor }}>
                  {p.allianceName}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Alliance setup */}
        <div className="section">
          <h3>Your Alliance</h3>
          <div className="join-form">
            <input
              type="text"
              value={allianceName}
              onChange={e => setAllianceName(e.target.value)}
              placeholder="Alliance name (e.g. Red Team)"
              maxLength={30}
            />
            <button
              className="btn-secondary"
              onClick={() => { if (allianceName) onSetAlliance(allianceName); }}
              disabled={!allianceName}
            >
              Join / Create
            </button>
          </div>
          {gameState.alliances.length > 0 && (
            <div className="alliances-row">
              {gameState.alliances.map(a => (
                <span key={a.id} className="alliance-badge" style={{ background: a.color }}>
                  {a.name} ({a.memberIds.length})
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Map location (host only) */}
        {isHost && (
          <div className="section">
            <h3>Map Location</h3>
            {gameState.mapLat !== null && gameState.mapLng !== null && (
              <p className="info-msg">
                📍 Set: {gameState.mapLat.toFixed(4)}, {gameState.mapLng.toFixed(4)}
              </p>
            )}
            <button className="btn-secondary" onClick={handleUseGPS} disabled={geo.loading}>
              {geo.loading ? 'Getting location…' : '📍 Use My GPS Location'}
            </button>
            {geo.error && <p className="error-msg">{geo.error}</p>}
            {geo.lat !== null && (
              <p className="info-msg">
                GPS: {geo.lat.toFixed(4)}, {geo.lng?.toFixed(4)}
                <button className="btn-ghost small" onClick={handleApplyGPS}>Apply</button>
              </p>
            )}
            <div className="manual-location">
              <input
                type="number"
                value={manualLat}
                onChange={e => setManualLat(e.target.value)}
                placeholder="Latitude (e.g. 51.5074)"
                step="0.0001"
              />
              <input
                type="number"
                value={manualLng}
                onChange={e => setManualLng(e.target.value)}
                placeholder="Longitude (e.g. -0.1278)"
                step="0.0001"
              />
              <button className="btn-ghost small" onClick={handleSetManual}>
                Set Manual
              </button>
            </div>
          </div>
        )}

        {error && <p className="error-msg">{error}</p>}

        {isHost && (
          <button
            className="btn-primary big"
            onClick={onStartGame}
            disabled={gameState.players.length < 2 || gameState.mapLat === null || gameState.mapLng === null}
          >
            🚀 Start Game
          </button>
        )}

        {!isHost && (
          <p className="info-msg">Waiting for host to start the game…</p>
        )}

        <button className="btn-ghost" onClick={onLogout}>Leave & Sign out</button>
      </div>
    </div>
  );
}
