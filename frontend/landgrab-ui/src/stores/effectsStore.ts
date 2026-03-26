import { create } from 'zustand';
import type { ContestedEdgeDto } from '../types/game';

export interface TroopMovement {
  fromHex: string;
  toHex: string;
  count: number;
  type: 'transfer' | 'attack';
  teamColor: string;
}

interface EffectsStore {
  contestedEdges: ContestedEdgeDto[];
  contestedHexKeys: Set<string>;
  troopMovements: TroopMovement[];

  setEffects: (effects: {
    contestedEdges: ContestedEdgeDto[];
  }) => void;
  setTroopMovements: (movements: TroopMovement[]) => void;
}

export const useEffectsStore = create<EffectsStore>((set) => ({
  contestedEdges: [],
  contestedHexKeys: new Set<string>(),
  troopMovements: [],

  setEffects: (effects) => set({
    ...effects,
    contestedHexKeys: new Set(
      effects.contestedEdges.flatMap((edge) => [edge.hexKeyA, edge.hexKeyB]),
    ),
  }),
  setTroopMovements: (movements) => set({ troopMovements: movements }),
}));
