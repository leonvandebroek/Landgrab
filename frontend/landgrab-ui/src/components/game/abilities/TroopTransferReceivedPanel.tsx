import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useSecondTick } from '../../../hooks/useSecondTick';
import type { InvokeFn } from '../../../types/abilities';

function getSecondsLeft(expiresAt: string | undefined, now: number): number | null {
  if (!expiresAt) {
    return null;
  }

  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) {
    return null;
  }

  return Math.ceil(remaining / 1000);
}

interface TroopTransferReceivedPanelProps {
  invoke: InvokeFn | null;
}

export function TroopTransferReceivedPanel({ invoke }: TroopTransferReceivedPanelProps) {
  const { t } = useTranslation();
  const troopTransferRequest = useNotificationStore((store) => store.troopTransferRequest);
  const setTroopTransferRequest = useNotificationStore((store) => store.setTroopTransferRequest);
  const [now, setNow] = useState(() => Date.now());

  useSecondTick(() => {
    setNow(Date.now());
  });

  const secondsLeft = getSecondsLeft(troopTransferRequest?.expiresAt, now);

  useEffect(() => {
    if (troopTransferRequest && secondsLeft == null) {
      setTroopTransferRequest(null);
    }
  }, [troopTransferRequest, secondsLeft, setTroopTransferRequest]);

  if (!troopTransferRequest) return null;

  const handleAccept = async () => {
    await invoke?.('RespondToTroopTransfer', troopTransferRequest.transferId, true);
    setTroopTransferRequest(null);
  };

  const handleDecline = async () => {
    await invoke?.('RespondToTroopTransfer', troopTransferRequest.transferId, false);
    setTroopTransferRequest(null);
  };

  return (
    <div className="notification-panel notification-panel--troop-transfer">
      <p className="notification-panel__message">
        {t('abilities.troopTransfer.received' as never, {
          name: troopTransferRequest.initiatorName,
          count: troopTransferRequest.amount,
        })}
      </p>
      {secondsLeft != null && (
        <p className="notification-panel__countdown">
          {t('abilities.troopTransfer.expiresIn' as never, { seconds: secondsLeft })}
        </p>
      )}
      <div className="notification-panel__actions">
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => { void handleAccept(); }}
        >
          {t('abilities.troopTransfer.accept' as never)}
        </button>
        <button
          type="button"
          className="ability-card__secondary-btn"
          onClick={() => { void handleDecline(); }}
        >
          {t('abilities.troopTransfer.decline' as never)}
        </button>
      </div>
    </div>
  );
}
