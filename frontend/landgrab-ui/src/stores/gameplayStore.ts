import { create } from 'zustand';
import type {
  AttackPrompt,
  CombatPreviewState,
  CombatResult,
  MapInteractionFeedback,
  NeutralClaimResult,
  PickupPrompt,
  ReinforcePrompt,
} from '../types/game';

const MAP_FEEDBACK_TIMEOUT_MS = 3500;

interface GameplayStore {
  selectedHex: [number, number] | null;
  mapFeedback: MapInteractionFeedback | null;
  pickupPrompt: PickupPrompt | null;
  pickupCount: number;
  reinforcePrompt: ReinforcePrompt | null;
  reinforceCount: number;
  attackPrompt: AttackPrompt | null;
  attackCount: number;
  combatPreview: CombatPreviewState | null;
  combatResult: CombatResult | null;
  neutralClaimResult: NeutralClaimResult | null;
  commandoTargetingMode: boolean;
  setSelectedHex: (hex: [number, number] | null) => void;
  setMapFeedback: (feedback: MapInteractionFeedback | null) => void;
  setPickupPrompt: (prompt: PickupPrompt | null) => void;
  setPickupCount: (count: number) => void;
  setReinforcePrompt: (prompt: ReinforcePrompt | null) => void;
  setReinforceCount: (count: number) => void;
  setAttackPrompt: (prompt: AttackPrompt | null) => void;
  setAttackCount: (count: number) => void;
  setCombatPreview: (preview: CombatPreviewState | null) => void;
  setCombatResult: (result: CombatResult | null) => void;
  setNeutralClaimResult: (result: NeutralClaimResult | null) => void;
  setCommandoTargetingMode: (mode: boolean) => void;
  clearGameplayUi: () => void;
  selectedHexKey: string | null;
}

let mapFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function clearMapFeedbackTimer(): void {
  if (!mapFeedbackTimer) {
    return;
  }

  clearTimeout(mapFeedbackTimer);
  mapFeedbackTimer = null;
}

export const useGameplayStore = create<GameplayStore>()((set, get) => ({
  selectedHex: null,
  mapFeedback: null,
  pickupPrompt: null,
  pickupCount: 1,
  reinforcePrompt: null,
  reinforceCount: 1,
  attackPrompt: null,
  attackCount: 1,
  combatPreview: null,
  combatResult: null,
  neutralClaimResult: null,
  commandoTargetingMode: false,
  setSelectedHex: (selectedHex) => set({ selectedHex }),
  setMapFeedback: (mapFeedback) => {
    clearMapFeedbackTimer();
    set({ mapFeedback });

    if (!mapFeedback) {
      return;
    }

    mapFeedbackTimer = setTimeout(() => {
      set({ mapFeedback: null });
      mapFeedbackTimer = null;
    }, MAP_FEEDBACK_TIMEOUT_MS);
  },
  setPickupPrompt: (pickupPrompt) => set({ pickupPrompt }),
  setPickupCount: (pickupCount) => set({ pickupCount }),
  setReinforcePrompt: (reinforcePrompt) => set({ reinforcePrompt }),
  setReinforceCount: (reinforceCount) => set({ reinforceCount }),
  setAttackPrompt: (attackPrompt) => set({ attackPrompt }),
  setAttackCount: (attackCount) => set({ attackCount }),
  setCombatPreview: (combatPreview) => set({ combatPreview }),
  setCombatResult: (combatResult) => set({ combatResult }),
  setNeutralClaimResult: (neutralClaimResult) => set({ neutralClaimResult }),
  setCommandoTargetingMode: (commandoTargetingMode) => set({ commandoTargetingMode }),
  clearGameplayUi: () => {
    clearMapFeedbackTimer();
    set({
      selectedHex: null,
      mapFeedback: null,
      pickupPrompt: null,
      pickupCount: 1,
      reinforcePrompt: null,
      reinforceCount: 1,
      attackPrompt: null,
      attackCount: 1,
      combatPreview: null,
      combatResult: null,
      neutralClaimResult: null,
      commandoTargetingMode: false,
    });
  },
  get selectedHexKey() {
    const selectedHex = get().selectedHex;
    return selectedHex ? `${selectedHex[0]},${selectedHex[1]}` : null;
  },
}));
