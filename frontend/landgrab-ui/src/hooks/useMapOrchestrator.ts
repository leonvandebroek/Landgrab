import { useCallback, useEffect, useRef } from 'react';
import { useEffectsStore } from '../stores/effectsStore';
import { usePlayerLayerStore } from '../stores/playerLayerStore';
import type { GameState, Player } from '../types/game';
import { detectTroopMovements } from '../utils/gridDiff';

const MAX_TROOP_MOVEMENTS = 10;
const TROOP_MOVEMENT_CLEAR_DELAY_MS = 1500;

export function useMapOrchestrator() {
  const previousStateRef = useRef<GameState | null>(null);
  const troopMovementClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (troopMovementClearTimerRef.current) {
      clearTimeout(troopMovementClearTimerRef.current);
      troopMovementClearTimerRef.current = null;
    }
  }, []);

  const dispatchStateToLayers = useCallback((state: GameState) => {
    const previousState = previousStateRef.current;
    previousStateRef.current = state;

    useEffectsStore.getState().setEffects({
      contestedEdges: state.contestedEdges ?? [],
      supplyEdges: state.supplyEdges ?? [],
      disconnectedHexKeys: new Set(state.disconnectedHexKeys ?? []),
    });

    usePlayerLayerStore.getState().setPlayers(state.players ?? []);

    const troopMovements = detectTroopMovements(previousState?.grid, state.grid);
    if (troopMovements.length > 0) {
      const store = useEffectsStore.getState();
      const existing = store.troopMovements;
      const combined = [...existing, ...troopMovements].slice(-MAX_TROOP_MOVEMENTS);
      store.setTroopMovements(combined);

      if (troopMovementClearTimerRef.current) {
        clearTimeout(troopMovementClearTimerRef.current);
      }
      troopMovementClearTimerRef.current = setTimeout(() => {
        useEffectsStore.getState().setTroopMovements([]);
        troopMovementClearTimerRef.current = null;
      }, TROOP_MOVEMENT_CLEAR_DELAY_MS);
    }
  }, []);

  const dispatchPlayersOnly = useCallback((players: Player[]) => {
    usePlayerLayerStore.getState().setPlayers(players);
  }, []);

  return { dispatchStateToLayers, dispatchPlayersOnly };
}
