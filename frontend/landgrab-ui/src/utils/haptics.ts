import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';

// navigator.vibrate does not exist in the iPhone web view, so the app uses the native haptics plugin: one pulse per
// "on" entry of the pattern, at the same offsets as the web pattern.
export function vibrate(pattern: number | readonly number[]): void {
  if (Capacitor.isNativePlatform()) {
    const steps = typeof pattern === 'number' ? [pattern] : pattern;
    let at = 0;
    steps.forEach((ms, i) => {
      if (i % 2 === 0) {
        const duration = ms;
        setTimeout(() => { void Haptics.vibrate({ duration }).catch(() => undefined); }, at);
      }
      at += ms;
    });
    return;
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    if (typeof pattern === 'number') {
      navigator.vibrate(pattern);
      return;
    }

    navigator.vibrate([...pattern]);
  }
}

export const HAPTIC = {
  claim: 50,
  attack: [50, 30, 80],
  loss: [100, 50, 100],
  victory: [50, 30, 50, 30, 100],
} as const;
