import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../../../styles/notification-panel.css';
import { useNotificationStore } from '../../../stores/notificationStore';
import { useSecondTick } from '../../../hooks/useSecondTick';
import { GameIcon } from '../../common/GameIcon';
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
  onFleeBattle: (battleId: string) => Promise<boolean>;
}

export function FieldBattleInvitePanel({ invoke, onFleeBattle }: FieldBattleInvitePanelProps) {
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

  const isInitiator = fieldBattleInvite.isInitiator === true;

  const handleJoin = async () => {
    await invoke?.('JoinFieldBattle', fieldBattleInvite.battleId);
    setFieldBattleInvite(null);
  };

  const handleFlee = async () => {
    await onFleeBattle(fieldBattleInvite.battleId);
    setFieldBattleInvite(null);
  };

  const handleIgnore = () => {
    setFieldBattleInvite(null);
  };

  if (isInitiator) return null;

  return (
    <div className="notification-panel notification-panel--field-battle">
      <div className="fb-invite__header">
        <span className="fb-invite__header-icon">
          <GameIcon name="contested" size="sm" />
        </span>
        <h3 className="fb-invite__title">{t('abilities.fieldBattle.battleInviteTitle' as never)}</h3>
      </div>

      <div className="fb-invite__initiator">
        <span className="fb-invite__initiator-label">{t('abilities.fieldBattle.initiatedByLabel' as never)}</span>
        <span className="fb-invite__initiator-name">{fieldBattleInvite.initiatorName}</span>
        {fieldBattleInvite.initiatorAllianceName && (
          <span className="fb-invite__initiator-alliance">{fieldBattleInvite.initiatorAllianceName}</span>
        )}
      </div>

      <div className="fb-invite__location">
        <span className="fb-invite__location-label">{t('abilities.fieldBattle.locationLabel' as never)}</span>
        <span className="fb-invite__location-coords">
          ({fieldBattleInvite.q}, {fieldBattleInvite.r})
        </span>
      </div>

      {secondsLeft != null && (
        <div className="fb-invite__timer">
          <span className="fb-invite__timer-number">{secondsLeft}</span>
          <span className="fb-invite__timer-label">{t('abilities.fieldBattle.joinWindowLabel' as never)}</span>
        </div>
      )}

      <p className="notification-panel__message">
        {t('abilities.fieldBattle.invite.fleeDescription' as never, { seconds: secondsLeft ?? 30 })}
        {' '}
        {t('abilities.fieldBattle.invite.stayDescription' as never)}
      </p>

      <div className="fb-invite__actions">
        <button
          type="button"
          className="fb-invite__ignore-btn"
          onClick={() => { void handleFlee(); }}
        >
          {t('abilities.fieldBattle.invite.fleeBtn' as never)}
        </button>
        <button
          type="button"
          className="fb-invite__join-btn"
          onClick={() => { void handleJoin(); }}
        >
          <GameIcon name="fist" size="sm" />
          {t('abilities.fieldBattle.joinCta' as never)}
        </button>
        <button
          type="button"
          className="fb-invite__ignore-btn"
          onClick={handleIgnore}
        >
          {t('abilities.fieldBattle.ignoreBtn' as never)}
        </button>
      </div>
    </div>
  );
}
