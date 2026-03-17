import { create } from 'zustand';
import { gameIcons, type GameIconName } from '../utils/gameIcons';

export type LedgeSeverity = 'connection' | 'error' | 'hostMessage' | 'interaction' | 'gameEvent';

export type LedgeSource =
    | 'connection'
    | 'locationError'
    | 'error'
    | 'paused'
    | 'hostMessage'
    | 'interaction'
    | 'gameToast';

export interface LedgeItem {
    id: string;
    severity: LedgeSeverity;
    message: string;
    icon?: GameIconName;
    teamColor?: string;
    persistent: boolean;
    duration?: number;
    source: LedgeSource;
    createdAt: number;
}

export const DEFAULT_DURATION_MS = 4000;
export const MAX_ITEMS = 10;

export const SEVERITY_PRIORITY: Record<LedgeSeverity, number> = {
    connection: 0,
    error: 1,
    hostMessage: 2,
    interaction: 3,
    gameEvent: 4,
};

interface InfoLedgeStore {
    items: LedgeItem[];
    expanded: boolean;
    push: (item: Omit<LedgeItem, 'id' | 'createdAt' | 'icon'> & { icon?: GameIconName | string }) => void;
    dismiss: (id: string) => void;
    clearBySource: (source: LedgeSource) => void;
    setExpanded: (expanded: boolean) => void;
    toggleExpanded: () => void;
    clearAll: () => void;
}

const ledgeTimers = new Map<string, ReturnType<typeof setTimeout>>();

const legacyLedgeIcons: Record<string, GameIconName> = {
    '⚔️': 'contested',
    '🚩': 'flag',
    '📢': 'radioTower',
    '🎲': 'gearHammer',
    '📍': 'pin',
    '⚠️': 'lightning',
    '⏸': 'hourglass',
    '🔄': 'returnArrow',
};

function normalizeLedgeIcon(icon?: GameIconName | string): GameIconName | undefined {
    if (!icon) {
        return undefined;
    }

    if (icon in gameIcons) {
        return icon as GameIconName;
    }

    return legacyLedgeIcons[icon];
}

function createLedgeId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clearLedgeTimer(id: string): void {
    const timer = ledgeTimers.get(id);
    if (!timer) {
        return;
    }

    clearTimeout(timer);
    ledgeTimers.delete(id);
}

function clearLedgeTimers(ids: Iterable<string>): void {
    for (const id of ids) {
        clearLedgeTimer(id);
    }
}

function clearAllLedgeTimers(): void {
    for (const timer of ledgeTimers.values()) {
        clearTimeout(timer);
    }

    ledgeTimers.clear();
}

function enforceMaxItems(items: LedgeItem[]): { items: LedgeItem[]; removedIds: string[] } {
    const nextItems = [...items];
    const removedIds: string[] = [];

    while (nextItems.length > MAX_ITEMS) {
        const oldestTransientIndex = nextItems.findIndex((item) => !item.persistent);

        if (oldestTransientIndex >= 0) {
            const [removedItem] = nextItems.splice(oldestTransientIndex, 1);
            removedIds.push(removedItem.id);
            continue;
        }

        const removedItem = nextItems.shift();
        if (!removedItem) {
            break;
        }

        removedIds.push(removedItem.id);
    }

    return { items: nextItems, removedIds };
}

function scheduleDismiss(id: string, duration: number, dismiss: (itemId: string) => void): void {
    clearLedgeTimer(id);

    const timer = setTimeout(() => {
        dismiss(id);
    }, duration);

    ledgeTimers.set(id, timer);
}

export const useInfoLedgeStore = create<InfoLedgeStore>()((set, get) => ({
    items: [],
    expanded: false,
    push: (item) => {
        const createdAt = Date.now();
        const id = createLedgeId();
        const duration = item.persistent ? item.duration : item.duration ?? DEFAULT_DURATION_MS;
        const ledgeItem: LedgeItem = {
            ...item,
            icon: normalizeLedgeIcon(item.icon),
            duration,
            id,
            createdAt,
        };

        let removedIds: string[] = [];
        let keptItem = false;

        set((state) => {
            const result = enforceMaxItems([...state.items, ledgeItem]);
            removedIds = result.removedIds;
            keptItem = result.items.some((existingItem) => existingItem.id === id);
            return { items: result.items };
        });

        clearLedgeTimers(removedIds);

        if (!ledgeItem.persistent && keptItem && typeof ledgeItem.duration === 'number') {
            scheduleDismiss(id, ledgeItem.duration, get().dismiss);
        }
    },
    dismiss: (id) => {
        clearLedgeTimer(id);
        set((state) => ({
            items: state.items.filter((item) => item.id !== id),
        }));
    },
    clearBySource: (source) => {
        const idsToClear = get()
            .items
            .filter((item) => item.source === source)
            .map((item) => item.id);

        if (idsToClear.length === 0) {
            return;
        }

        clearLedgeTimers(idsToClear);
        set((state) => ({
            items: state.items.filter((item) => item.source !== source),
        }));
    },
    setExpanded: (expanded) => {
        set({ expanded });
    },
    toggleExpanded: () => {
        set((state) => ({ expanded: !state.expanded }));
    },
    clearAll: () => {
        clearAllLedgeTimers();
        set({ items: [] });
    },
}));

export function selectSortedItems(state: InfoLedgeStore): LedgeItem[] {
    return [...state.items].sort((left, right) => {
        const severityPriority = SEVERITY_PRIORITY[left.severity] - SEVERITY_PRIORITY[right.severity];
        if (severityPriority !== 0) {
            return severityPriority;
        }

        return left.createdAt - right.createdAt;
    });
}

export function selectActiveItem(state: InfoLedgeStore): LedgeItem | undefined {
    return selectSortedItems(state)[0];
}