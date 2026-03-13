export function vibrate(pattern: number | readonly number[]): void {
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