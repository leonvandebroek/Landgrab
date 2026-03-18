import { create } from 'zustand';
import type { ContestedEdgeDto, SupplyEdgeDto } from '../types/game';

export interface TroopMovement {
  fromHex: string;
  toHex: string;
  count: number;
  type: 'transfer' | 'attack';
  teamColor: string;
}

interface EffectsStore {
  contestedEdges: ContestedEdgeDto[];
  supplyEdges: SupplyEdgeDto[];
  disconnectedHexKeys: Set<string>;
  troopMovements: TroopMovement[];

  setEffects: (effects: {
    contestedEdges: ContestedEdgeDto[];
    supplyEdges: SupplyEdgeDto[];
    disconnectedHexKeys: Set<string>;
  }) => void;
  setTroopMovements: (movements: TroopMovement[]) => void;
}

export const useEffectsStore = create<EffectsStore>((set) => ({
  contestedEdges: [],
  supplyEdges: [],
  disconnectedHexKeys: new Set<string>(),
  troopMovements: [],

  setEffects: (effects) => set(effects),
  setTroopMovements: (movements) => set({ troopMovements: movements }),
}));
