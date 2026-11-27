import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AbilityCard } from '../AbilityCard';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';
import { useGameplayStore } from '../../../stores';
import type { AbilityCardProps } from '../../../types/abilities';
import { Icon } from '../../ui/Icon';
import { cx } from '../../ui/kit';

export function InterceptCard({ invoke }: AbilityCardProps) {
  const { t } = useTranslation();
  const exitAbilityMode = useGameplayStore((s) => s.exitAbilityMode);
  const [targetStatus, setTargetStatus] = useState<string>('noTarget');
  const [lockSeconds, setLockSeconds] = useState<number>(0);
  const { heading } = useDeviceOrientation(true);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (heading == null || !invoke) return undefined;

    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
    }

    intervalRef.current = window.setInterval(async () => {
      const result = await invoke<{ status: string; seconds?: number }>('AttemptIntercept', heading)
        ?? { status: 'noTarget' };

      setTargetStatus(result.status);
      if (result.seconds !== undefined) {
        setLockSeconds(result.seconds);
      }

      if (result.status === 'success') {
        exitAbilityMode();
      }
    }, 500);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [heading, invoke, exitAbilityMode]);

  const statusText = targetStatus === 'locking'
    ? t('abilities.intercept.locking' as never, { seconds: lockSeconds })
    : targetStatus === 'broken'
      ? t('abilities.intercept.lockBroken' as never)
      : targetStatus === 'success'
        ? t('abilities.intercept.success' as never)
        : t('abilities.intercept.scanning' as never);
  const live = targetStatus === 'locking' || targetStatus === 'success';

  return (
    <AbilityCard
      title={t('abilities.intercept.title' as never)}
      icon={<Icon name="eye" />}
      onBackToHud={exitAbilityMode}
      statusContent={(
        <span className={cx('ability-card__status-pill', live && 'ability-card__status-pill--live')}>{statusText}</span>
      )}
    >
      <p className="ability-card__status-copy">{t('abilities.intercept.instructions' as never)}</p>
      {targetStatus === 'locking' && (
        <div className="lg-score__bar"><span className="lg-score__fill" style={{ width: `${Math.min(100, (lockSeconds / 5) * 100)}%`, background: 'var(--lg-accent)' }} /></div>
      )}
    </AbilityCard>
  );
}
