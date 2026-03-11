import type { CombatResult } from '../../types/game';
import { useTranslation } from 'react-i18next';
import { DiceRoller } from './DiceRoller';

interface Props {
  result: CombatResult;
  onClose: () => void;
}

export function CombatModal({ result, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3>{result.hexCaptured ? t('combat.territoryCapture') : t('combat.attackRepelled')}</h3>

        <div className="combat-dice">
          <div>
            <DiceRoller dice={result.attackDice} label={t('combat.attacker')} />
            {result.attackerLost > 0 && (
              <p className="loss">{t('combat.troopLost', { count: result.attackerLost })}</p>
            )}
          </div>
          <div className="vs">VS</div>
          <div>
            <DiceRoller dice={result.defendDice} label={t('combat.defender')} />
            {result.defenderLost > 0 && (
              <p className="loss">{t('combat.troopLost', { count: result.defenderLost })}</p>
            )}
          </div>
        </div>

        <button className="btn-primary" onClick={onClose}>{t('combat.continue')}</button>
      </div>
    </div>
  );
}
