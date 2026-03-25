import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useSecondTick } from '../../../hooks/useSecondTick';
import type { InvokeFn } from '../../../types/abilities';

function getSecondsLeft(joinDeadline: string | undefined, now: number): number | null {
  if (!joinDeadline) {
    return null;
  }

  const remaining = new Date(joinDeadline).getTime() - now;
  if (remaining <= 0) {
    return null;
  }

  return Math.ceil(remaining / 1000);
}

interface FieldBattleInvitePanelProps {
  invoke: InvokeFn | null;
}

export function FieldBattleInvitePanel({ invoke }: FieldBattleInvitePanelProps) {
  const { t } = useTranslation();
  const fieldBattleInvite = useNotificationStore((store) => store.fieldBattleInvite);
  const setFieldBattleInvite = useNotificationStore((store) => store.setFieldBattleInvite);
  const [now, setNow] = useState(() => Date.now());

  useSecondTick(() => {
    setNow(Date.now());
  });

  const secondsLeft = getSecondsLeft(fieldBattleInvite?.joinDeadline, now);

  useEffect(() => {
    if (fieldBattleInvite && secondsLeft == null) {
      setFieldBattleInvite(null);
    }
  }, [fieldBattleInvite, secondsLeft, setFieldBattleInvite]);

  if (!fieldBattleInvite) return null;

  const handleJoin = async () => {
    await invoke?.('JoinFieldBattle', fieldBattleInvite.battleId);
    setFieldBattleInvite(null);
  };

  const handleIgnore = () => {
    setFieldBattleInvite(null);
  };

  return (
    <div className="notification-panel notification-panel--field-battle">
      <p className="notification-panel__message">
        {t('abilities.fieldBattle.inviteReceived' as never, { name: fieldBattleInvite.initiatorName })}
      </p>
      {secondsLeft != null && (
        <p className="notification-panel__countdown">
          {t('abilities.fieldBattle.joinsIn' as never, { seconds: secondsLeft })}
        </p>
      )}
      <div className="notification-panel__actions">
        <button
          type="button"
          className="ability-card__primary-btn"
          onClick={() => { void handleJoin(); }}
        >
          {t('abilities.fieldBattle.joinCta' as never)}
        </button>
        <button
          type="button"
          className="ability-card__secondary-btn"
          onClick={handleIgnore}
        >
          {t('abilities.fieldBattle.ignoreBtn' as never)}
        </button>
      </div>
    </div>
  );
}
