import { useCallback, useEffect, useRef, useState } from 'react';

export interface GameToast {
  id: string;
  type: 'achievement' | 'combat' | 'event' | 'mission' | 'territory';
  message: string;
  teamColor?: string;
  icon?: string;
  duration?: number;
}

const DEFAULT_DURATION_MS = 4000;
const DEFAULT_MAX_VISIBLE = 3;

/**
 * Manages a capped queue of game toast notifications.
 * Toasts auto-dismiss after their duration and the queue is capped
 * at `maxVisible` entries (oldest removed first when over limit).
 */
export function useToastQueue(maxVisible: number = DEFAULT_MAX_VISIBLE) {
  const [toasts, setToasts] = useState<GameToast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (partial: Omit<GameToast, 'id'>) => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const toast: GameToast = { ...partial, id };
      const duration = partial.duration ?? DEFAULT_DURATION_MS;

      setToasts((prev) => {
        const next = [...prev, toast];
        // When over limit, remove oldest and clean up their timers
        while (next.length > maxVisible) {
          const removed = next.shift();
          if (removed) {
            const timer = timersRef.current.get(removed.id);
            if (timer) {
              clearTimeout(timer);
              timersRef.current.delete(removed.id);
            }
          }
        }
        return next;
      });

      // Schedule auto-removal
      const timer = setTimeout(() => {
        dismissToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [maxVisible, dismissToast],
  );

  // Clean up all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast } as const;
}
