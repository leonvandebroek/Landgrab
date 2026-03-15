import { create } from 'zustand';
import type { HostMessage, Mission, PendingDuel, RandomEvent } from '../types/game';

const RANDOM_EVENT_TIMEOUT_MS = 8000;
const EVENT_WARNING_TIMEOUT_MS = 120000;
const MISSION_NOTIFICATION_TIMEOUT_MS = 6000;
const PENDING_DUEL_TIMEOUT_MS = 30000;
const HOST_MESSAGE_TIMEOUT_MS = 10000;

type NotificationTimerKey =
  | 'randomEvent'
  | 'eventWarning'
  | 'missionNotification'
  | 'pendingDuel'
  | 'hostMessage';

export interface MissionNotification {
  mission: Mission;
  type: 'assigned' | 'completed' | 'failed';
}

interface NotificationStore {
  randomEvent: RandomEvent | null;
  eventWarning: RandomEvent | null;
  missionNotification: MissionNotification | null;
  pendingDuel: PendingDuel | null;
  hostMessage: HostMessage | null;
  setRandomEvent: (event: RandomEvent | null) => void;
  setEventWarning: (warning: RandomEvent | null) => void;
  setMissionNotification: (notification: MissionNotification | null) => void;
  setPendingDuel: (duel: PendingDuel | null) => void;
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
  clearNotificationTimer('randomEvent');
  clearNotificationTimer('eventWarning');
  clearNotificationTimer('missionNotification');
  clearNotificationTimer('pendingDuel');
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
  randomEvent: null,
  eventWarning: null,
  missionNotification: null,
  pendingDuel: null,
  hostMessage: null,
  setRandomEvent: (randomEvent) => {
    clearNotificationTimer('randomEvent');
    set({ randomEvent });

    if (!randomEvent) {
      return;
    }

    scheduleNotificationClear('randomEvent', RANDOM_EVENT_TIMEOUT_MS, () => set({ randomEvent: null }));
  },
  setEventWarning: (eventWarning) => {
    clearNotificationTimer('eventWarning');
    set({ eventWarning });

    if (!eventWarning) {
      return;
    }

    scheduleNotificationClear('eventWarning', EVENT_WARNING_TIMEOUT_MS, () => set({ eventWarning: null }));
  },
  setMissionNotification: (missionNotification) => {
    clearNotificationTimer('missionNotification');
    set({ missionNotification });

    if (!missionNotification) {
      return;
    }

    scheduleNotificationClear(
      'missionNotification',
      MISSION_NOTIFICATION_TIMEOUT_MS,
      () => set({ missionNotification: null }),
    );
  },
  setPendingDuel: (pendingDuel) => {
    clearNotificationTimer('pendingDuel');
    set({ pendingDuel });

    if (!pendingDuel) {
      return;
    }

    scheduleNotificationClear('pendingDuel', PENDING_DUEL_TIMEOUT_MS, () => set({ pendingDuel: null }));
  },
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
      randomEvent: null,
      eventWarning: null,
      missionNotification: null,
      pendingDuel: null,
      hostMessage: null,
    });
  },
}));
