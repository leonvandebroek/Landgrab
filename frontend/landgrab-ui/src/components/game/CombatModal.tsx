import type { CombatResult } from '../../types/game';
import { useTranslation } from 'react-i18next';
import { DiceRoller } from './DiceRoller';

interface Props {
  result: CombatResult;
  gameMode?: string;
  allowSelfClaim?: boolean;
  onReClaim?: (mode: 'Alliance' | 'Self' | 'Abandon') => void;
  onClose: () => void;
}

export function CombatModal({ result, gameMode, allowSelfClaim, onReClaim, onClose }: Props) {
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
          <div className="vs">{t('combat.vs')}</div>
          <div>
            <DiceRoller dice={result.defendDice} label={t('combat.defender')} />
            {result.defenderLost > 0 && (
              <p className="loss">{t('combat.troopLost', { count: result.defenderLost })}</p>
            )}
          </div>
        </div>

        {(result.attackerBonus || result.defenderBonus) ? (
          <div style={{
            display: 'flex', gap: '0.75rem', justifyContent: 'center',
            fontSize: '0.85rem', opacity: 0.85, margin: '0.25rem 0',
          }}>
            {result.attackerBonus ? (
              <span>⚔️ {t('terrain.presenceBonus')}</span>
            ) : null}
            {result.defenderBonus ? (
              <span>🛡️ {t('terrain.defendBonus', { bonus: result.defenderBonus })}</span>
            ) : null}
            {result.defenderTerrainType && result.defenderTerrainType !== 'None' ? (
              <span style={{ opacity: 0.7 }}>({t(`terrain.${result.defenderTerrainType}` as never)})</span>
            ) : null}
          </div>
        ) : null}

        {result.hexCaptured ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            <h4 style={{ margin: 0, textAlign: 'center' }}>{t('combat.postCombatTitle')}</h4>
            {gameMode === 'Alliances' ? (
              <>
                <button className="btn-primary" onClick={() => { onReClaim?.('Alliance'); onClose(); }}>
                  {t('combat.claimForAlliance')}
                </button>
                {allowSelfClaim !== false && (
                  <button className="btn-secondary" onClick={() => { onReClaim?.('Self'); onClose(); }}>
                    {t('combat.claimForSelf')}
                  </button>
                )}
                <button className="btn-secondary" style={{ color: 'var(--danger, #e74c3c)' }} onClick={() => { onReClaim?.('Abandon'); onClose(); }}>
                  {t('combat.abandon')}
                </button>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={onClose}>
                  {t('combat.continue')}
                </button>
                <button className="btn-secondary" style={{ color: 'var(--danger, #e74c3c)' }} onClick={() => { onReClaim?.('Abandon'); onClose(); }}>
                  {t('combat.abandon')}
                </button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
            <p style={{ textAlign: 'center', margin: 0 }}>{t('combat.youLost')}</p>
            <button className="btn-primary" onClick={onClose}>{t('combat.continue')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
