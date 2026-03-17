import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../common/GameIcon';
import type { GameDynamics, Player } from '../../types/game';
import { useSecondTick } from '../../hooks/useSecondTick';

interface AbilityBarProps {
  player: Player;
  dynamics: GameDynamics;
  onActivateBeacon: () => void;
  onDeactivateBeacon: () => void;
  commandoTargetingMode: boolean;
  onStartCommandoTargeting: () => void;
  onCancelCommandoTargeting: () => void;
}

const barStyle: CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  overflowX: 'auto',
  padding: '0.25rem 0',
  pointerEvents: 'auto'
};

const pillStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  padding: '0.4rem 0.75rem',
  borderRadius: '2rem',
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.88)',
  color: '#fff',
  fontSize: '0.8rem',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background 0.2s, border-color 0.2s'
};

function formatCountdown(isoDate: string | undefined): string | null {
  if (!isoDate) return null;

  const remaining = new Date(isoDate).getTime() - Date.now();
  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getPillStyle(state: 'default' | 'active' | 'targeting' | 'disabled'): CSSProperties {
  const base = { ...pillStyle };

  if (state === 'active') {
    base.borderColor = 'rgba(46, 204, 113, 0.6)';
    base.background = 'rgba(46, 204, 113, 0.15)';
  } else if (state === 'targeting') {
    base.borderColor = 'rgba(231, 76, 60, 0.6)';
    base.background = 'rgba(231, 76, 60, 0.15)';
  } else if (state === 'disabled') {
    base.opacity = 0.5;
    base.cursor = 'default';
  }

  return base;
}

export function AbilityBar({
  player,
  dynamics,
  onActivateBeacon,
  onDeactivateBeacon,
  commandoTargetingMode,
  onStartCommandoTargeting,
  onCancelCommandoTargeting
}: AbilityBarProps) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);

  const showBeacon = dynamics.beaconEnabled;
  const showCommando = dynamics.playerRolesEnabled && player.role === 'Scout';

  const hasActiveCountdown = Boolean(
    player.commandoDeadline || player.commandoCooldownUntil
  );

  useSecondTick(() => {
    if (!hasActiveCountdown) {
      return;
    }

    setTick((tick) => tick + 1);
  });

  if (!showBeacon && !showCommando) {
    return null;
  }

  return (
    <div style={barStyle}>
      {showBeacon && (
        <button
          type="button"
          onClick={player.isBeacon ? onDeactivateBeacon : onActivateBeacon}
          style={getPillStyle(player.isBeacon ? 'active' : 'default')}
        >
          <span><GameIcon name="radioTower" /></span>
          <span>{player.isBeacon ? t('phase5.beaconDeactivate' as never) : t('phase5.beaconActivate' as never)}</span>
        </button>
      )}

      {showCommando && (() => {
        const deadlineTime = formatCountdown(player.commandoDeadline);
        const cooldownTime = formatCountdown(player.commandoCooldownUntil);
        const isActive = player.isCommandoActive && deadlineTime !== null;
        const isOnCooldown = !isActive && cooldownTime !== null;

        if (commandoTargetingMode) {
          return (
            <button
              type="button"
              onClick={onCancelCommandoTargeting}
              style={getPillStyle('targeting')}
            >
              <span><GameIcon name="archeryTarget" /></span>
              <span>{t('phase6.commandoSelectTarget' as never)}</span>
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={!isActive && !isOnCooldown ? onStartCommandoTargeting : undefined}
            disabled={isActive || isOnCooldown}
            style={getPillStyle(isActive ? 'active' : isOnCooldown ? 'disabled' : 'default')}
          >
            <span><GameIcon name="contested" /></span>
            <span>
              {isActive
                ? t('phase6.commandoActive' as never, { time: deadlineTime })
                : isOnCooldown
                  ? t('phase6.commandoCooldown' as never)
                  : t('phase6.commandoActivate' as never)}
            </span>
            {isOnCooldown && cooldownTime && (
              <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{cooldownTime}</span>
            )}
          </button>
        );
      })()}
    </div>
  );
}
