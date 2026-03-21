import { create } from 'zustand';
import type {
  AbilityKey,
  AbilityMode,
  AbilityUiState,
  MapFocusPreset,
} from '../types/abilities';
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

const initialAbilityUiState: AbilityUiState = {
  activeAbility: null,
  mode: 'idle',
  cardVisible: false,
  targetHexKey: null,
  pendingTargetHexKey: null,
  validTargetHexKeys: [],
  mapFocusPreset: 'none',
};

function isCommandoTargetingMode(abilityUi: AbilityUiState): boolean {
  return abilityUi.activeAbility === 'commandoRaid' && abilityUi.mode === 'targeting';
}

interface GameplayStore {
  selectedHexKey: string | null;
  currentHexKey: string | null;
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
  abilityUi: AbilityUiState;
  commandoTargetingMode: boolean;
  setSelectedHexKey: (key: string | null) => void;
  setCurrentHexKey: (key: string | null) => void;
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
  enterAbilityMode: (
    ability: AbilityKey,
    mode: AbilityMode,
    focusPreset?: MapFocusPreset,
    options?: { cardVisible?: boolean }
  ) => void;
  setAbilityMode: (mode: AbilityMode) => void;
  setAbilityTarget: (hexKey: string) => void;
  confirmAbilityTarget: () => void;
  activateAbility: () => void;
  hideAbilityCard: () => void;
  showAbilityCard: () => void;
  exitAbilityMode: () => void;
  setValidTargetHexKeys: (keys: string[]) => void;
  setCommandoTargetingMode: (mode: boolean) => void;
  clearGameplayUi: () => void;
}

let mapFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function clearMapFeedbackTimer(): void {
  if (!mapFeedbackTimer) {
    return;
  }

  clearTimeout(mapFeedbackTimer);
  mapFeedbackTimer = null;
}

export const useGameplayStore = create<GameplayStore>()((set) => ({
  selectedHexKey: null,
  currentHexKey: null,
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
  abilityUi: initialAbilityUiState,
  commandoTargetingMode: false,
  setSelectedHexKey: (selectedHexKey) => set({ selectedHexKey }),
  setCurrentHexKey: (currentHexKey) => set({ currentHexKey }),
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
  enterAbilityMode: (ability, mode, focusPreset = 'none', options) =>
    set(() => {
      const abilityUi: AbilityUiState = {
        activeAbility: ability,
        mode,
        cardVisible: options?.cardVisible ?? true,
        targetHexKey: null,
        pendingTargetHexKey: null,
        validTargetHexKeys: [],
        mapFocusPreset: focusPreset,
      };

      return {
        abilityUi,
        commandoTargetingMode: isCommandoTargetingMode(abilityUi),
      };
    }),
  setAbilityMode: (mode) =>
    set((state) => {
      const abilityUi: AbilityUiState = {
        ...state.abilityUi,
        mode,
      };

      return {
        abilityUi,
        commandoTargetingMode: isCommandoTargetingMode(abilityUi),
      };
    }),
  setAbilityTarget: (hexKey) =>
    set((state) => ({
      abilityUi: {
        ...state.abilityUi,
        pendingTargetHexKey: hexKey,
      },
    })),
  confirmAbilityTarget: () =>
    set((state) => {
      const abilityUi: AbilityUiState = {
        ...state.abilityUi,
        mode: 'confirming',
        targetHexKey: state.abilityUi.pendingTargetHexKey,
        pendingTargetHexKey: null,
      };

      return {
        abilityUi,
        commandoTargetingMode: isCommandoTargetingMode(abilityUi),
      };
    }),
  activateAbility: () =>
    set((state) => {
      const abilityUi: AbilityUiState = {
        ...state.abilityUi,
        mode: 'active',
        pendingTargetHexKey: null,
      };

      return {
        abilityUi,
        commandoTargetingMode: isCommandoTargetingMode(abilityUi),
      };
    }),
  hideAbilityCard: () =>
    set((state) => ({
      abilityUi: {
        ...state.abilityUi,
        cardVisible: false,
      },
    })),
  showAbilityCard: () =>
    set((state) => ({
      abilityUi: {
        ...state.abilityUi,
        cardVisible: true,
      },
    })),
  exitAbilityMode: () =>
    set(() => ({
      abilityUi: initialAbilityUiState,
      commandoTargetingMode: false,
    })),
  setValidTargetHexKeys: (validTargetHexKeys) =>
    set((state) => ({
      abilityUi: {
        ...state.abilityUi,
        validTargetHexKeys,
      },
    })),
  setCommandoTargetingMode: (commandoTargetingMode) => set({ commandoTargetingMode }),
  clearGameplayUi: () => {
    clearMapFeedbackTimer();
    set({
      selectedHexKey: null,
      currentHexKey: null,
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
      abilityUi: initialAbilityUiState,
      commandoTargetingMode: false,
    });
  },
}));
