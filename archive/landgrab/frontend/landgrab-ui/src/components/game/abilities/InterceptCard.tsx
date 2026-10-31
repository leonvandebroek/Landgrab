import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AbilityCard } from '../AbilityCard';
import { useDeviceOrientation } from '../../../hooks/useDeviceOrientation';
import { useGameplayStore } from '../../../stores';
import type { AbilityCardProps } from '../../../types/abilities';

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

  let statusText: string = t('abilities.intercept.noTarget', 'Scanning for enemy signals...');
  let statusClass = 'text-gray-400';

  if (targetStatus === 'locking') {
    statusText = t('abilities.intercept.locking', `Locking on... Signal acquired (${lockSeconds}s)`);
    statusClass = 'text-yellow-400 font-bold animate-pulse';
  } else if (targetStatus === 'broken') {
    statusText = t('abilities.intercept.broken', 'Signal lost! Realign device.');
    statusClass = 'text-red-500 font-semibold';
  } else if (targetStatus === 'success') {
    statusText = t('abilities.intercept.success', 'Intercept Successful!');
    statusClass = 'text-green-500 font-bold';
  }

  return (
    <AbilityCard
      title={t('abilities.intercept.title', 'Intercept')}
      icon="🔭"
      onBackToHud={exitAbilityMode}
    >
      <div className="flex flex-col items-center justify-center p-4 space-y-4">
        <p className="text-sm text-gray-300 text-center mb-2">
          {t(
            'abilities.intercept.instructions',
            'Point your device around to search for enemy signals. Maintain heading to complete the intercept.',
          )}
        </p>

        <div className="text-xl font-mono tracking-wider bg-gray-900 px-4 py-2 rounded-lg border border-gray-700 w-full text-center">
          Heading: {heading != null ? `${Math.round(heading)}°` : '--°'}
        </div>

        <div className={`text-center p-3 w-full rounded-md bg-gray-800 border ${
          targetStatus === 'noTarget' ? 'border-gray-600' :
          targetStatus === 'locking' ? 'border-yellow-500' :
          targetStatus === 'broken' ? 'border-red-500' :
          'border-green-500'
        }`}>
          <p className={`text-md ${statusClass}`}>
            {statusText}
          </p>
        </div>
      </div>
    </AbilityCard>
  );
}
