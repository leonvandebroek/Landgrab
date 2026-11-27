import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CombatResult, NeutralClaimResult } from '../../../types/game';
import { Button, FactRow, Sheet, SheetHeader, Stepper } from '../../ui/kit';

interface CombatProps {
  result: CombatResult;
  onDeploy: (count: number) => void;
  onClose: () => void;
}

/** After a fight: what happened, and how many troops stay on a tile you took. */
export function CombatResultSheet({ result, onDeploy, onClose }: CombatProps) {
  const { t } = useTranslation();
  const won = result.isAttacker ? result.attackerWon : !result.attackerWon;
  const survivors = result.isAttacker ? result.attackerTroopsRemaining : result.defenderTroopsRemaining;
  const [stay, setStay] = useState(() => Math.max(0, Math.min(survivors, Math.ceil(survivors / 2))));
  const opponent = result.isAttacker
    ? (result.previousOwnerName ?? t('ui.outcome.enemy'))
    : (result.attackerName ?? t('ui.outcome.enemy'));
  const attackerBonus = result.attackerBonuses?.reduce((sum, bonus) => sum + (bonus.value ?? 0), 0) ?? result.attackerBonus;
  const defenderBonus = result.defenderBonuses?.reduce((sum, bonus) => sum + (bonus.value ?? 0), 0) ?? result.defenderBonus;
  const attackedWith = result.attackerTroopsLost + result.attackerTroopsRemaining;
  const defendedWith = result.defenderTroopsLost + result.defenderTroopsRemaining;
  const wouldHaveBeenEnough = Math.floor(result.effectiveDefence) + 1;

  // You attacked and took the tile.
  if (result.isAttacker && won) {
    return (
      <Sheet open onClose={() => onDeploy(0)} labelledBy="combat-title" testId="combat-result-sheet">
        <SheetHeader title={t('ui.outcome.tookTile')} titleId="combat-title" status={t('ui.outcome.won')} statusTone="ready" />
        <div className="lg-facts">
          <FactRow label={t('ui.outcome.attackedWith')} value={attackedWith} />
          <FactRow label={t('ui.outcome.defendedWith', { name: opponent })} value={defendedWith} />
          {defenderBonus > 0 && <FactRow label={t('ui.outcome.theirBonus')} value={`+${defenderBonus}`} />}
          {attackerBonus > 0 && <FactRow label={t('ui.outcome.yourBonus')} value={`+${attackerBonus}`} tone="good" />}
        </div>
        {survivors > 0 ? (
          <>
            <p className="lg-muted">{t('ui.outcome.survivorsHelp', { count: survivors })}</p>
            <Stepper
              value={stay}
              min={0}
              max={survivors}
              onChange={setStay}
              decreaseLabel={t('ui.play.fewer')}
              increaseLabel={t('ui.play.more')}
              caption={t('ui.outcome.staysWithYou', { count: survivors - stay })}
              testId="combat-deploy-stepper"
            />
            <Button onClick={() => onDeploy(stay)} testId="combat-deploy-btn">
              {stay > 0 ? t('ui.outcome.leaveHere', { count: stay }) : t('ui.outcome.carryAll')}
            </Button>
          </>
        ) : (
          <Button onClick={() => onDeploy(0)} testId="combat-deploy-btn">{t('ui.outcome.backToMap')}</Button>
        )}
      </Sheet>
    );
  }

  // You attacked and lost.
  if (result.isAttacker) {
    return (
      <Sheet open onClose={onClose} labelledBy="combat-title" testId="combat-result-sheet">
        <SheetHeader title={t('ui.outcome.heldTile', { name: opponent })} titleId="combat-title" status={t('ui.outcome.failed')} statusTone="warn" />
        <div className="lg-facts">
          <FactRow label={t('ui.outcome.attackedWith')} value={attackedWith} />
          <FactRow label={t('ui.outcome.defendedWith', { name: opponent })} value={defendedWith} />
          {defenderBonus > 0 && <FactRow label={t('ui.outcome.theirBonus')} value={`+${defenderBonus}`} tone="bad" />}
          <FactRow label={t('ui.outcome.troopsLeft')} value={survivors} />
          <FactRow label={t('ui.outcome.wouldHaveBeen')} value={t('ui.outcome.troopsCount', { count: wouldHaveBeenEnough })} tone="good" />
        </div>
        <p className="lg-muted">{t('ui.outcome.lostHelp')}</p>
        <Button onClick={onClose} testId="combat-close-btn">{t('ui.outcome.backToMap')}</Button>
      </Sheet>
    );
  }

  // Someone attacked your tile.
  return (
    <Sheet open onClose={onClose} labelledBy="combat-title" testId="combat-result-sheet">
      <SheetHeader
        title={won ? t('ui.outcome.defended', { name: opponent }) : t('ui.outcome.lostTile', { name: opponent })}
        titleId="combat-title"
        status={won ? t('ui.outcome.won') : t('ui.outcome.lost')}
        statusTone={won ? 'ready' : 'warn'}
      />
      <div className="lg-facts">
        <FactRow label={t('ui.outcome.theyAttackedWith', { name: opponent })} value={attackedWith} />
        <FactRow label={t('ui.outcome.youDefendedWith')} value={defendedWith} />
        <FactRow label={t('ui.outcome.troopsLeftTile')} value={result.defenderTroopsRemaining} />
      </div>
      <Button onClick={onClose} testId="combat-close-btn">{t('ui.outcome.backToMap')}</Button>
    </Sheet>
  );
}

interface ClaimProps {
  result: NeutralClaimResult;
  onDeploy: (count: number) => void;
}

/** After claiming a free tile while carrying troops: how many stay there. */
export function ClaimDeploySheet({ result, onDeploy }: ClaimProps) {
  const { t } = useTranslation();
  const carried = result.carriedTroops;
  const [stay, setStay] = useState(() => Math.min(carried, 1));

  return (
    <Sheet open onClose={() => onDeploy(0)} labelledBy="claim-title" testId="claim-deploy-sheet">
      <SheetHeader title={t('ui.outcome.claimed')} titleId="claim-title" status={t('ui.outcome.yours')} statusTone="ready" />
      <p className="lg-muted">{t('ui.outcome.claimedHelp', { carried, onTile: result.troopsOnHex })}</p>
      <Stepper
        value={stay}
        min={0}
        max={carried}
        onChange={setStay}
        decreaseLabel={t('ui.play.fewer')}
        increaseLabel={t('ui.play.more')}
        caption={t('ui.outcome.staysWithYou', { count: carried - stay })}
        testId="claim-deploy-stepper"
      />
      <Button onClick={() => onDeploy(stay)} testId="claim-deploy-btn">
        {stay > 0 ? t('ui.outcome.leaveHere', { count: stay }) : t('ui.outcome.carryAll')}
      </Button>
    </Sheet>
  );
}
