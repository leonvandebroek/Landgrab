import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useGameStore } from '../../../stores/gameStore';
import { useSecondTick } from '../../../hooks/useSecondTick';
import type { InvokeFn } from '../../../types/abilities';
import { Button, Sheet, SheetHeader } from '../../ui/kit';

function getSecondsLeft(expiresAt: string | undefined, now: number): number | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - now;
  return remaining > 0 ? Math.ceil(remaining / 1000) : null;
}

interface TroopTransferReceivedPanelProps {
  invoke: InvokeFn | null;
}

/** A teammate offers you troops: accept or decline before the timer runs out. */
export function TroopTransferReceivedPanel({ invoke }: TroopTransferReceivedPanelProps) {
  const { t } = useTranslation();
  const request = useNotificationStore((store) => store.troopTransferRequest);
  const setRequest = useNotificationStore((store) => store.setTroopTransferRequest);
  const myCarried = useGameStore((store) => {
    const id = store.savedSession?.userId;
    return store.gameState?.players.find((player) => player.id === id)?.carriedTroops ?? 0;
  });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useSecondTick(() => setNow(Date.now()));

  const secondsLeft = getSecondsLeft(request?.expiresAt, now);

  useEffect(() => {
    if (request && secondsLeft == null) setRequest(null);
  }, [request, secondsLeft, setRequest]);

  if (!request || secondsLeft == null) return null;

  const respond = async (accept: boolean) => {
    setBusy(true);
    try {
      await invoke?.('RespondToTroopTransfer', request.transferId, accept);
    } finally {
      setBusy(false);
      setRequest(null);
    }
  };

  return (
    <Sheet open onClose={() => void respond(false)} labelledBy="transfer-in-title" testId="troop-offer-sheet">
      <SheetHeader
        title={t('ui.transferIn.title', { name: request.initiatorName, count: request.amount })}
        kicker={t('ui.abilities.troopTransfer.title')}
        status={t('ui.transferIn.left', { time: `0:${String(secondsLeft).padStart(2, '0')}` })}
        statusTone="live"
        titleId="transfer-in-title"
      />
      <p className="lg-muted">{t('ui.transferIn.body', { now: myCarried, after: myCarried + request.amount })}</p>
      <div className="lg-actions lg-actions--row">
        <Button variant="secondary" disabled={busy} onClick={() => void respond(false)} testId="troop-offer-decline">
          {t('ui.transferIn.decline')}
        </Button>
        <Button disabled={busy} onClick={() => void respond(true)} testId="troop-offer-accept">
          {t('ui.transferIn.accept', { count: request.amount })}
        </Button>
      </div>
    </Sheet>
  );
}
