import type { CombatResult } from '../../types/game';
import { DiceRoller } from './DiceRoller';

interface Props {
  result: CombatResult;
  onClose: () => void;
}

export function CombatModal({ result, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3>{result.hexCaptured ? '⚔️ Territory Captured!' : '🛡️ Attack Repelled!'}</h3>

        <div className="combat-dice">
          <div>
            <DiceRoller dice={result.attackDice} label="⚔️ Attacker" />
            {result.attackerLost > 0 && (
              <p className="loss">-{result.attackerLost} troop{result.attackerLost !== 1 ? 's' : ''}</p>
            )}
          </div>
          <div className="vs">VS</div>
          <div>
            <DiceRoller dice={result.defendDice} label="🛡️ Defender" />
            {result.defenderLost > 0 && (
              <p className="loss">-{result.defenderLost} troop{result.defenderLost !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>

        <button className="btn-primary" onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}
