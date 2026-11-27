import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/kit';

export const COACH_STORAGE_KEY = 'landgrab-tutorial-completed';

const TIPS = [
  { key: 'score', place: 'top' },
  { key: 'dock', place: 'bottom' },
  { key: 'mapButtons', place: 'bottom' },
  { key: 'menu', place: 'top' },
] as const;

// eslint-disable-next-line react-refresh/only-export-components
export function hasSeenCoach(): boolean {
  try {
    return Boolean(localStorage.getItem(COACH_STORAGE_KEY));
  } catch {
    return true;
  }
}

/** First game: one short tip at a time, pointing at the part it explains. */
export type CoachTarget = typeof TIPS[number]['key'];

export function CoachTips({ onDone, onStep }: { onDone: () => void; onStep?: (target: CoachTarget) => void }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const tip = TIPS[index];
  const last = index === TIPS.length - 1;

  useEffect(() => {
    onStep?.(tip.key);
  }, [onStep, tip.key]);

  const finish = () => {
    try {
      localStorage.setItem(COACH_STORAGE_KEY, 'true');
    } catch {
      // Private mode: show the tips again next time, nothing else breaks.
    }
    onDone();
  };

  return (
    <div
      className={`lg-coach lg-coach--${tip.place}`}
      role="dialog"
      aria-labelledby="coach-title"
      data-testid="coach-tip"
    >
      <div className="lg-coach__head">
        <h2 className="lg-coach__title" id="coach-title">{t(`ui.coach.${tip.key}.title`)}</h2>
        <span className="lg-coach__step">{t('ui.coach.step', { n: index + 1, total: TIPS.length })}</span>
      </div>
      <p className="lg-coach__body">{t(`ui.coach.${tip.key}.body`)}</p>
      <div className="lg-coach__actions">
        <Button variant="quiet" size="md" onClick={finish} testId="coach-skip">{t('ui.coach.skip')}</Button>
        <Button
          variant="primary"
          size="md"
          onClick={() => (last ? finish() : setIndex(index + 1))}
          testId="coach-next"
        >
          {last ? t('ui.coach.done') : t('ui.coach.next')}
        </Button>
      </div>
    </div>
  );
}
