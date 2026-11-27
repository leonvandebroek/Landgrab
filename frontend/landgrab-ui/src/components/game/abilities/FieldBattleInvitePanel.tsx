import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useGameStore } from '../../../stores/gameStore';
import { useSecondTick } from '../../../hooks/useSecondTick';
import type { InvokeFn } from '../../../types/abilities';
import { Button, Sheet, SheetHeader } from '../../ui/kit';

function getSecondsLeft(joinDeadline: string | undefined, now: number): number | null {
  if (!joinDeadline) return null;
  const remaining = new Date(joinDeadline).getTime() - now;
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

interface FieldBattleInvitePanelProps {
  invoke: InvokeFn | null;
  onFleeBattle: (battleId: string) => Promise<boolean>;
}

/** Someone challenges you on a free tile: flee, or stand and fight. */
export function FieldBattleInvitePanel({ invoke, onFleeBattle }: FieldBattleInvitePanelProps) {
  const { t } = useTranslation();
  const invite = useNotificationStore((store) => store.fieldBattleInvite);
  const setInvite = useNotificationStore((store) => store.setFieldBattleInvite);
  const gameState = useGameStore((store) => store.gameState);
  const myId = useGameStore((store) => store.savedSession?.userId);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useSecondTick(() => setNow(Date.now()));

  const secondsLeft = getSecondsLeft(invite?.joinDeadline, now);

  useEffect(() => {
    if (invite && secondsLeft == null) setInvite(null);
  }, [invite, secondsLeft, setInvite]);

  if (!invite || secondsLeft == null || invite.isInitiator === true) return null;

  const me = gameState?.players.find((player) => player.id === myId);
  const battle = gameState?.activeFieldBattles?.find((item) => item.id === invite.battleId);

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
      setInvite(null);
    }
  };

  return (
    <Sheet open labelledBy="challenged-title" testId="field-battle-invite-sheet">
      <SheetHeader
        title={t('ui.challenged.title', { name: invite.initiatorName })}
        kicker={t('ui.abilities.fieldBattle.title')}
        titleId="challenged-title"
      />
      <div className="lg-bigcount" role="timer" aria-live="polite">
        <span className="lg-bigcount__num">{secondsLeft}</span>
        <span className="lg-bigcount__label">{t('ui.challenged.seconds')}</span>
      </div>
      <p className="lg-muted lg-center">{t('ui.challenged.body')}</p>
      <div className="lg-versus">
        <div className="lg-versus__side">
          <span className="lg-versus__label">{t('ui.play.youCarry')}</span>
          <span className="lg-versus__num">{me?.carriedTroops ?? 0}</span>
        </div>
        <span className="lg-versus__vs">{t('ui.play.vs')}</span>
        <div className="lg-versus__side">
          <span className="lg-versus__label">{t('ui.challenged.theyCarry', { name: invite.initiatorName })}</span>
          <span className="lg-versus__num">{battle?.initiatorTroops ?? '?'}</span>
        </div>
      </div>
      <div className="lg-actions lg-actions--row">
        <Button variant="secondary" disabled={busy} onClick={() => void act(() => onFleeBattle(invite.battleId))} testId="field-battle-flee">
          {t('ui.challenged.flee')}
        </Button>
        <Button disabled={busy} onClick={() => void act(async () => { await invoke?.('JoinFieldBattle', invite.battleId); })} testId="field-battle-join">
          {t('ui.challenged.fight')}
        </Button>
      </div>
      <p className="lg-small lg-center">{t('ui.challenged.walkOff')}</p>
    </Sheet>
  );
}
