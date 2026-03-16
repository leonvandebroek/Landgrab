import { create } from 'zustand';
import type { HostMessage } from '../types/game';

const HOST_MESSAGE_TIMEOUT_MS = 10000;

type NotificationTimerKey = 'hostMessage';

interface NotificationStore {
  hostMessage: HostMessage | null;
  setHostMessage: (message: HostMessage | null) => void;
  clearAll: () => void;
}

const notificationTimers: Partial<Record<NotificationTimerKey, ReturnType<typeof setTimeout>>> = {};

function clearNotificationTimer(key: NotificationTimerKey): void {
  const timer = notificationTimers[key];
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  delete notificationTimers[key];
}

function clearAllNotificationTimers(): void {
  clearNotificationTimer('hostMessage');
}

function scheduleNotificationClear(
  key: NotificationTimerKey,
  timeoutMs: number,
  clearState: () => void,
): void {
  clearNotificationTimer(key);
  notificationTimers[key] = setTimeout(() => {
    clearState();
    delete notificationTimers[key];
  }, timeoutMs);
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  hostMessage: null,
  setHostMessage: (hostMessage) => {
    clearNotificationTimer('hostMessage');
    set({ hostMessage });

    if (!hostMessage) {
      return;
    }

    scheduleNotificationClear('hostMessage', HOST_MESSAGE_TIMEOUT_MS, () => set({ hostMessage: null }));
  },
  clearAll: () => {
    clearAllNotificationTimers();
    set({
      hostMessage: null,
    });
  },
}));
