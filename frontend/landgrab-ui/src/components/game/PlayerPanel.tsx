import type { GameState } from '../../types/game';
import { DiceRoller } from './DiceRoller';

interface Props {
  state: GameState;
  myUserId: string;
  onRollDice: () => void;
  onEndTurn: () => void;
  rolling: boolean;
  error: string;
}

export function PlayerPanel({ state, myUserId, onRollDice, onEndTurn, rolling, error }: Props) {
  const currentPlayer = state.players[state.currentPlayerIndex % state.players.length];
  const isMyTurn = currentPlayer?.id === myUserId;

  const phaseLabel: Record<string, string> = {
    Lobby: 'Lobby',
    Reinforce: '🪖 Place Troops',
    Roll: '🎲 Roll Dice',
    Claim: '⚔️ Claim / Attack',
    GameOver: '🏆 Game Over'
  };

  return (
    <div className="player-panel">
      {/* Current turn indicator */}
      <div className="turn-banner" style={{ borderColor: currentPlayer?.allianceColor ?? currentPlayer?.color }}>
        <span className="turn-label">
          {isMyTurn ? '⭐ Your Turn!' : `${currentPlayer?.name}'s turn`}
        </span>
        <span className="phase-badge">{phaseLabel[state.phase] ?? state.phase}</span>
      </div>

      {/* Dice */}
      {state.lastDiceRoll.length > 0 && (
        <DiceRoller dice={state.lastDiceRoll} rolling={rolling} label="Rolled:" />
      )}

      {/* Moves remaining */}
      {state.phase === 'Claim' && (
        <div className="moves-remaining">
          Moves remaining: <strong>{state.movesRemaining}</strong>
        </div>
      )}

      {/* Actions */}
      {isMyTurn && (
        <div className="actions">
          {state.phase === 'Roll' && (
            <button className="btn-primary" onClick={onRollDice}>
              🎲 Roll Dice
            </button>
          )}
          {state.phase === 'Claim' && state.movesRemaining > 0 && (
            <p className="hint">Click a hex on the map to claim or attack it.</p>
          )}
          {state.phase === 'Claim' && (
            <button className="btn-secondary" onClick={onEndTurn}>
              ✓ End Turn
            </button>
          )}
          {state.phase === 'Reinforce' && currentPlayer?.troopsToPlace > 0 && (
            <p className="hint">
              Place {currentPlayer.troopsToPlace} troop{currentPlayer.troopsToPlace !== 1 ? 's' : ''}.
              Click your territory (or any empty hex for first placement).
            </p>
          )}
        </div>
      )}

      {error && <p className="error-msg">{error}</p>}

      {/* Scoreboard */}
      <div className="scoreboard">
        <h4>Territories</h4>
        {state.alliances.length > 0
          ? state.alliances.map(a => (
              <div key={a.id} className="score-row">
                <span className="score-dot" style={{ background: a.color }} />
                <span>{a.name}</span>
                <span className="score-count">{a.territoryCount}</span>
              </div>
            ))
          : state.players.map(p => (
              <div key={p.id} className="score-row">
                <span className="score-dot" style={{ background: p.color }} />
                <span>{p.name}</span>
                <span className="score-count">{p.territoryCount}</span>
              </div>
            ))
        }
      </div>

      {/* Turn number */}
      <div className="turn-number">Turn {state.turnNumber}</div>
    </div>
  );
}
