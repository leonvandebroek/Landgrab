import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSignalR } from './hooks/useSignalR';
import { useGeolocation } from './hooks/useGeolocation';
import { AuthPage } from './components/auth/AuthPage';
import { GameLobby } from './components/lobby/GameLobby';
import { GameMap } from './components/map/GameMap';
import { PlayerPanel } from './components/game/PlayerPanel';
import { GameOver } from './components/game/GameOver';
import { latLngToRoomHex } from './components/map/HexMath';
import type { ClaimMode, GameState, HexCell, WinConditionType } from './types/game';
import './styles/index.css';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface PickupPrompt {
  q: number;
  r: number;
  max: number;
}

export default function App() {
  const { auth, login, register, logout } = useAuth();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'lobby' | 'game' | 'gameover'>('lobby');
  const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null);
  const [pickupCount, setPickupCount] = useState(1);
  const location = useGeolocation(Boolean(auth));
  const lastLocationRef = useRef('');

  const currentLocation = useMemo<LocationPoint | null>(() => {
    if (location.lat == null || location.lng == null) {
      return null;
    }

    return { lat: location.lat, lng: location.lng };
  }, [location.lat, location.lng]);

  const clearError = () => setError('');

  const { connected, invoke } = useSignalR(auth?.token ?? null, {
    onRoomCreated: (_, state) => {
      setGameState(state);
      setView('lobby');
      setPickupPrompt(null);
      clearError();
    },
    onPlayerJoined: (state) => {
      setGameState(state);
      setView('lobby');
      clearError();
    },
    onGameStarted: (state) => {
      setGameState(state);
      setView('game');
      setPickupPrompt(null);
      clearError();
    },
    onStateUpdated: (state) => {
      setGameState(state);
      if (state.phase === 'Playing') {
        setView('game');
      }
      if (state.phase === 'GameOver') {
        setView('gameover');
      }
      clearError();
    },
    onGameOver: () => setView('gameover'),
    onError: (message) => setError(message)
  });

  const myPlayer = useMemo(() => {
    if (!auth || !gameState) {
      return null;
    }

    return gameState.players.find(player => player.id === auth.userId) ?? null;
  }, [auth, gameState]);

  const currentHex = useMemo(() => {
    if (!gameState || !currentLocation || gameState.mapLat == null || gameState.mapLng == null) {
      return null;
    }

    return latLngToRoomHex(
      currentLocation.lat,
      currentLocation.lng,
      gameState.mapLat,
      gameState.mapLng,
      gameState.tileSizeMeters
    );
  }, [currentLocation, gameState]);

  useEffect(() => {
    if (!connected || gameState?.phase !== 'Playing' || !currentLocation) {
      lastLocationRef.current = '';
      return;
    }

    const locationKey = `${currentLocation.lat.toFixed(6)},${currentLocation.lng.toFixed(6)}`;
    if (lastLocationRef.current === locationKey) {
      return;
    }

    lastLocationRef.current = locationKey;
    invoke('UpdatePlayerLocation', currentLocation.lat, currentLocation.lng)
      .catch(cause => setError(String(cause)));
  }, [connected, currentLocation, gameState?.phase, invoke]);

  const handleCreateRoom = useCallback(() => {
    invoke('CreateRoom').catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleJoinRoom = useCallback((code: string) => {
    invoke('JoinRoom', code).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetAlliance = useCallback((name: string) => {
    invoke('SetAlliance', name).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetMapLocation = useCallback((lat: number, lng: number) => {
    invoke('SetMapLocation', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetTileSize = useCallback((meters: number) => {
    invoke('SetTileSize', meters).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetClaimMode = useCallback((mode: ClaimMode) => {
    invoke('SetClaimMode', mode).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetWinCondition = useCallback((type: WinConditionType, value: number) => {
    invoke('SetWinCondition', type, value).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleSetMasterTile = useCallback((lat: number, lng: number) => {
    invoke('SetMasterTile', lat, lng).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleAssignStartingTile = useCallback((q: number, r: number, playerId: string) => {
    invoke('AssignStartingTile', q, r, playerId).catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleStartGame = useCallback(() => {
    invoke('StartGame').catch(cause => setError(String(cause)));
  }, [invoke]);

  const handleHexClick = useCallback((q: number, r: number, cell: HexCell | undefined) => {
    if (!auth || !gameState || gameState.phase !== 'Playing') {
      return;
    }
    if (!currentLocation || !currentHex) {
      setError('Your GPS location is required before you can interact with the map.');
      return;
    }
    if (currentHex[0] !== q || currentHex[1] !== r) {
      setError('You must be standing inside a hex to interact with it.');
      return;
    }
    if (cell?.isMasterTile) {
      setError('The master tile cannot be conquered.');
      return;
    }

    clearError();

    const carriedTroops = myPlayer?.carriedTroops ?? 0;
    if (cell?.ownerId === auth.userId && carriedTroops === 0) {
      if (cell.troops < 1) {
        setError('There are no troops to pick up from this hex.');
        return;
      }

      setPickupPrompt({ q, r, max: cell.troops });
      setPickupCount(1);
      return;
    }

    invoke('PlaceTroops', q, r, currentLocation.lat, currentLocation.lng)
      .then(() => setPickupPrompt(null))
      .catch(cause => setError(String(cause)));
  }, [auth, currentHex, currentLocation, gameState, invoke, myPlayer]);

  const handleConfirmPickup = useCallback(() => {
    if (!pickupPrompt || !currentLocation) {
      return;
    }

    invoke('PickUpTroops', pickupPrompt.q, pickupPrompt.r, pickupCount, currentLocation.lat, currentLocation.lng)
      .then(() => setPickupPrompt(null))
      .catch(cause => setError(String(cause)));
  }, [currentLocation, invoke, pickupCount, pickupPrompt]);

  const handlePlayAgain = useCallback(() => {
    setGameState(null);
    setView('lobby');
    setError('');
    setPickupPrompt(null);
  }, []);

  if (!auth) {
    return <AuthPage onLogin={login} onRegister={register} />;
  }

  if (view === 'gameover' && gameState) {
    return <GameOver state={gameState} onPlayAgain={handlePlayAgain} />;
  }

  if (view === 'game' && gameState) {
    return (
      <div className="game-layout">
        <GameMap
          state={gameState}
          myUserId={auth.userId}
          currentLocation={currentLocation}
          onHexClick={handleHexClick}
        />
        <PlayerPanel
          state={gameState}
          myUserId={auth.userId}
          currentLocation={currentLocation}
          currentHex={currentHex}
          pickupPrompt={pickupPrompt}
          pickupCount={pickupCount}
          onPickupCountChange={setPickupCount}
          onConfirmPickup={handleConfirmPickup}
          onCancelPickup={() => setPickupPrompt(null)}
          error={error}
          locationError={location.error}
        />
      </div>
    );
  }

  return (
    <GameLobby
      username={auth.username}
      myUserId={auth.userId}
      gameState={gameState}
      connected={connected}
      currentLocation={currentLocation}
      locationError={location.error}
      locationLoading={location.loading}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onSetAlliance={handleSetAlliance}
      onSetMapLocation={handleSetMapLocation}
      onSetTileSize={handleSetTileSize}
      onSetClaimMode={handleSetClaimMode}
      onSetWinCondition={handleSetWinCondition}
      onSetMasterTile={handleSetMasterTile}
      onAssignStartingTile={handleAssignStartingTile}
      onStartGame={handleStartGame}
      onLogout={() => {
        logout();
        setGameState(null);
        setPickupPrompt(null);
        setView('lobby');
      }}
      error={error}
    />
  );
}
