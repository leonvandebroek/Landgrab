import { useEffect, useRef } from 'react';

const subscribers = new Set<() => void>();

let intervalId: number | null = null;

function startInterval() {
  if (intervalId !== null) {
    return;
  }

  intervalId = window.setInterval(() => {
    for (const subscriber of subscribers) {
      subscriber();
    }
  }, 1000);
}

function stopInterval() {
  if (intervalId === null || subscribers.size > 0) {
    return;
  }

  window.clearInterval(intervalId);
  intervalId = null;
}

export function useSecondTick(callback: () => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const subscriber = () => {
      callbackRef.current();
    };

    subscribers.add(subscriber);

    if (subscribers.size === 1) {
      startInterval();
    }

    return () => {
      subscribers.delete(subscriber);
      stopInterval();
    };
  }, []);
}
