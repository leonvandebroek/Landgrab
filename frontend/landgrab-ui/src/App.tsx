import { useState, useCallback } from 'react';
import { useAuth } from './hooks/useAuth';
import { useSignalR } from './hooks/useSignalR';
import { AuthPage } from './components/auth/AuthPage';
import { GameLobby } from './components/lobby/GameLobby';
import { GameMap } from './components/map/GameMap';
import { PlayerPanel } from './components/game/PlayerPanel';
import { CombatModal } from './components/game/CombatModal';
import { GameOver } from './components/game/GameOver';
import type { GameState, HexCell, CombatResult } from './types/game';
import './styles/index.css';

export default function App() {
  const { auth, login, register, logout } = useAuth();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
  const [selectedHex, setSelectedHex] = useState<[number, number] | null>(null);
  const [error, setError] = useState('');
  const [rolling, setRolling] = useState(false);
  const [view, setView] = useState<'lobby' | 'game' | 'gameover'>('lobby');

  const clearError = () => setError('');

  // ── SignalR event handlers ──────────────────────────────────────────────

  const { connected, invoke } = useSignalR(auth?.token ?? null, {
    onRoomCreated: (_, state) => { setGameState(state); clearError(); },
    onPlayerJoined: (state) => { setGameState(state); clearError(); },
    onGameStarted: (state) => { setGameState(state); setView('game'); clearError(); },
    onStateUpdated: (state) => {
      setGameState(state);
      setRolling(false);
      clearError();
      if (state.phase === 'GameOver') setView('gameover');
    },
    onCombatResult: (result) => {
      setCombatResult(result);
      setGameState(result.newState);
      setSelectedHex(null);
      clearError();
      if (result.newState.phase === 'GameOver') setView('gameover');
    },
    onGameOver: () => setView('gameover'),
    onError: (msg) => setError(msg)
  });

  // ── Lobby actions ───────────────────────────────────────────────────────

  const handleCreateRoom = useCallback(() => {
    invoke('CreateRoom').catch(e => setError(String(e)));
  }, [invoke]);

  const handleJoinRoom = useCallback((code: string) => {
    invoke('JoinRoom', code).catch(e => setError(String(e)));
  }, [invoke]);

  const handleSetAlliance = useCallback((name: string) => {
    invoke('SetAlliance', name).catch(e => setError(String(e)));
  }, [invoke]);

  const handleSetMapLocation = useCallback((lat: number, lng: number) => {
    invoke('SetMapLocation', lat, lng).catch(e => setError(String(e)));
  }, [invoke]);

  const handleStartGame = useCallback(() => {
    invoke('StartGame').catch(e => setError(String(e)));
  }, [invoke]);

  // ── Game actions ────────────────────────────────────────────────────────

  const handleRollDice = useCallback(() => {
    setRolling(true);
    invoke('RollDice').catch(e => { setError(String(e)); setRolling(false); });
  }, [invoke]);

  const handleEndTurn = useCallback(() => {
    setSelectedHex(null);
    invoke('EndTurn').catch(e => setError(String(e)));
  }, [invoke]);

  const handleHexClick = useCallback((q: number, r: number, cell: HexCell | undefined) => {
    if (!gameState || !auth) return;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex % gameState.players.length];
    if (currentPlayer?.id !== auth.userId) return;

    setError('');

    if (gameState.phase === 'Reinforce') {
      invoke('PlaceReinforcement', q, r).catch(e => setError(String(e)));
      return;
    }

    if (gameState.phase !== 'Claim') return;

    if (!cell?.ownerId) {
      // Empty hex — claim it
      invoke('ClaimHex', q, r).catch(e => setError(String(e)));
      setSelectedHex(null);
    } else if (cell.ownerId === auth.userId) {
      // Own hex — select as attack origin
      setSelectedHex([q, r]);
    } else {
      // Enemy hex — attack from selected or prompt to select own hex first
      if (selectedHex) {
        invoke('AttackHex', selectedHex[0], selectedHex[1], q, r)
          .catch(e => setError(String(e)));
        setSelectedHex(null);
      } else {
        setError('First select one of your hexes (tap it), then tap the enemy hex to attack.');
      }
    }
  }, [gameState, auth, invoke, selectedHex]);

  const handlePlayAgain = useCallback(() => {
    setGameState(null);
    setView('lobby');
    setCombatResult(null);
    setSelectedHex(null);
    setError('');
  }, []);

  // ── Auth ────────────────────────────────────────────────────────────────

  if (!auth) {
    return (
      <AuthPage
        onLogin={login}
        onRegister={register}
      />
    );
  }

  // ── Game over ───────────────────────────────────────────────────────────

  if (view === 'gameover' && gameState) {
    return <GameOver state={gameState} onPlayAgain={handlePlayAgain} />;
  }

  // ── Active game ─────────────────────────────────────────────────────────

  if (view === 'game' && gameState) {
    return (
      <div className="game-layout">
        <GameMap
          state={gameState}
          myUserId={auth.userId}
          onHexClick={handleHexClick}
          selectedHex={selectedHex}
        />
        <PlayerPanel
          state={gameState}
          myUserId={auth.userId}
          onRollDice={handleRollDice}
          onEndTurn={handleEndTurn}
          rolling={rolling}
          error={error}
        />
        {combatResult && (
          <CombatModal
            result={combatResult}
            onClose={() => setCombatResult(null)}
          />
        )}
      </div>
    );
  }

  // ── Lobby ───────────────────────────────────────────────────────────────

  return (
    <GameLobby
      username={auth.username}
      gameState={gameState}
      connected={connected}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onSetAlliance={handleSetAlliance}
      onSetMapLocation={handleSetMapLocation}
      onStartGame={handleStartGame}
      onLogout={() => { logout(); setGameState(null); }}
      error={error}
    />
  );
}
