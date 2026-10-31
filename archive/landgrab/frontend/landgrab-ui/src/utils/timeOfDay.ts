import type { CSSProperties } from 'react';

type TimePeriod = 'dawn' | 'day' | 'sunset' | 'night';

export function getTimePeriod(hour?: number): TimePeriod {
  const h = hour ?? new Date().getHours();
  if (h >= 5 && h < 7) return 'dawn';
  if (h >= 7 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'sunset';
  return 'night';
}

export function getTimeOverlayStyle(period?: TimePeriod): CSSProperties {
  const p = period ?? getTimePeriod();
  switch (p) {
    case 'dawn':
      return {
        background: 'rgba(255, 183, 77, 0.12)',
        mixBlendMode: 'multiply',
        opacity: 1,
        pointerEvents: 'none',
      };
    case 'day':
      return {
        background: 'transparent',
        opacity: 0,
        pointerEvents: 'none',
      };
    case 'sunset':
      return {
        background: 'rgba(255, 152, 67, 0.15)',
        mixBlendMode: 'multiply',
        opacity: 1,
        pointerEvents: 'none',
      };
    case 'night':
      return {
        background: 'rgba(10, 20, 60, 0.25)',
        mixBlendMode: 'normal',
        opacity: 1,
        pointerEvents: 'none',
      };
  }
}
