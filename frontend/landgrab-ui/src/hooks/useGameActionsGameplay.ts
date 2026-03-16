import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getTileActions, getTileInteractionStatus } from '../components/game/tileInteraction';
import type { TileAction, TileActionType } from '../components/game/tileInteraction';
import { useGameplayStore } from '../stores/gameplayStore';
import { useUiStore } from '../stores/uiStore';
import type { HexCell, ReClaimMode } from '../types/game';
import { vibrate, HAPTIC } from '../utils/haptics';
import { getErrorMessage, getPlaceSuccessMessage } from '../utils/gameHelpers';
import type { UseGameActionsOptions } from './useGameActions.shared';
import { resolveActionCoordinates } from './useGameActions.shared';

const LOCATION_BROADCAST_THROTTLE_MS = 3000;

type ClaimTileActionType = 'claim' | 'reinforce' | 'claimAlliance' | 'claimSelf';

interface UseGameActionsGameplayOptions extends Pick<
  UseGameActionsOptions,
  'invoke' | 'auth' | 'connected' | 'gameState' | 'currentLocation' | 'currentHex' | 'myPlayer' | 'isHostBypass' | 't' | 'playSound'
> {
  handleActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<void>;
}

interface UseGameActionsGameplayResult {
  handleHexClick: (q: number, r: number, cell: HexCell | undefined) => void;
  tileActions: TileAction[];
  currentHexActions: TileAction[];
  currentHexCell: HexCell | undefined;
  handleTileAction: (actionType: TileActionType) => void;
  handleCurrentHexAction: (actionType: TileActionType) => void;
  handleDismissTileActions: () => void;
  handleConfirmPickup: () => void;
  handleConfirmReinforce: () => Promise<void>;
  handleConfirmAttack: () => Promise<void>;
  handleCancelAttack: () => void;
  handleReClaimHex: (mode: ReClaimMode) => Promise<void>;
}

export function useGameActionsGameplay({
  invoke,
  auth,
  connected,
  gameState,
  currentLocation,
  currentHex,
  myPlayer,
  isHostBypass,
  t,
  playSound,
  handleActivateCommandoRaid,
}: UseGameActionsGameplayOptions): UseGameActionsGameplayResult {
  const selectedHex = useGameplayStore(state => state.selectedHex);
  const commandoTargetingMode = useGameplayStore(state => state.commandoTargetingMode);
  const combatResult = useGameplayStore(state => state.combatResult);
  const setSelectedHex = useGameplayStore(state => state.setSelectedHex);
  const setMapFeedback = useGameplayStore(state => state.setMapFeedback);
  const setPickupPrompt = useGameplayStore(state => state.setPickupPrompt);
  const setPickupCount = useGameplayStore(state => state.setPickupCount);
  const setReinforcePrompt = useGameplayStore(state => state.setReinforcePrompt);
  const setReinforceCount = useGameplayStore(state => state.setReinforceCount);
  const setAttackPrompt = useGameplayStore(state => state.setAttackPrompt);
  const setAttackCount = useGameplayStore(state => state.setAttackCount);
  const setCombatResult = useGameplayStore(state => state.setCombatResult);
  const setCommandoTargetingMode = useGameplayStore(state => state.setCommandoTargetingMode);
  const setError = useUiStore(state => state.setError);
  const clearError = useUiStore(state => state.clearError);
  const lastLocationRef = useRef<string>('');
  const locationThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocationRef = useRef<{ lat: number; lon: number } | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  const previousCurrentHexRef = useRef<string | null>(null);

  const clearLocationThrottle = useCallback((): void => {
    if (locationThrottleRef.current !== null) {
      clearTimeout(locationThrottleRef.current);
      locationThrottleRef.current = null;
    }
  }, []);

  const sendPendingLocation = useCallback((): void => {
    clearLocationThrottle();

    if (!invoke) {
      pendingLocationRef.current = null;
      return;
    }

    const pendingLocation = pendingLocationRef.current;
    if (!pendingLocation) {
      return;
    }

    const locationKey = `${pendingLocation.lat.toFixed(6)},${pendingLocation.lon.toFixed(6)}`;
    if (lastLocationRef.current === locationKey) {
      pendingLocationRef.current = null;
      return;
    }

    pendingLocationRef.current = null;
    lastLocationRef.current = locationKey;
    lastSendTimeRef.current = Date.now();

    invoke('UpdatePlayerLocation', pendingLocation.lat, pendingLocation.lon)
      .catch(cause => setError(String(cause)));
  }, [clearLocationThrottle, invoke, setError]);

  useEffect((): void | (() => void) => {
    if (!connected || gameState?.phase !== 'Playing' || !currentLocation) {
      clearLocationThrottle();
      pendingLocationRef.current = null;
      lastSendTimeRef.current = 0;
      lastLocationRef.current = '';
      return;
    }

    pendingLocationRef.current = { lat: currentLocation.lat, lon: currentLocation.lng };

    const locationKey = `${currentLocation.lat.toFixed(6)},${currentLocation.lng.toFixed(6)}`;
    if (lastLocationRef.current === locationKey) {
      pendingLocationRef.current = null;
      return;
    }

    const elapsedSinceLastSend = Date.now() - lastSendTimeRef.current;
    if (elapsedSinceLastSend >= LOCATION_BROADCAST_THROTTLE_MS) {
      sendPendingLocation();
      return;
    }

    clearLocationThrottle();
    locationThrottleRef.current = setTimeout(() => {
      sendPendingLocation();
    }, LOCATION_BROADCAST_THROTTLE_MS - elapsedSinceLastSend);
  }, [clearLocationThrottle, connected, currentLocation, gameState?.phase, sendPendingLocation]);

  useEffect(() => {
    const shouldFlushPendingLocation = connected && gameState?.phase === 'Playing';

    return () => {
      if (shouldFlushPendingLocation) {
        sendPendingLocation();
        return;
      }

      clearLocationThrottle();
    };
  }, [clearLocationThrottle, connected, gameState?.phase, sendPendingLocation]);

  useEffect((): void => {
    const nextKey = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
    if (nextKey === previousCurrentHexRef.current) {
      return;
    }

    previousCurrentHexRef.current = nextKey;
    if (gameState?.phase !== 'Playing' || !currentHex) {
      return;
    }

    setSelectedHex(currentHex);
    setMapFeedback(null);
    setPickupPrompt(null);
    setReinforcePrompt(null);
    setAttackPrompt(null);
  }, [currentHex, gameState?.phase, setAttackPrompt, setMapFeedback, setPickupPrompt, setReinforcePrompt, setSelectedHex]);

  const placeTroopsAction = useCallback((targetHex: [number, number], actionType: ClaimTileActionType): void => {
    if (!invoke) {
      return;
    }

    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    const [q, r] = targetHex;
    const claimForSelf = actionType === 'claimSelf';

    invoke('PlaceTroops', q, r, coordinates.lat, coordinates.lng, null, claimForSelf)
      .then(() => {
        setPickupPrompt(null);
        setReinforcePrompt(null);
        setAttackPrompt(null);
        playSound(actionType === 'reinforce' ? 'reinforce' : 'claim');
        if (actionType !== 'reinforce') {
          vibrate(HAPTIC.claim);
        }
        setMapFeedback({
          tone: 'success',
          message: getPlaceSuccessMessage(actionType === 'reinforce' ? 'reinforce' : 'claim', q, r, t),
          targetHex,
        });
      })
      .catch(cause => {
        playSound('error');
        setMapFeedback({ tone: 'error', message: getErrorMessage(cause), targetHex });
      });
  }, [
    currentLocation,
    gameState,
    invoke,
    isHostBypass,
    playSound,
    setAttackPrompt,
    setMapFeedback,
    setPickupPrompt,
    setReinforcePrompt,
    t,
  ]);

  const tileActions = useMemo<TileAction[]>(() => {
    if (!gameState || gameState.phase !== 'Playing' || !selectedHex) {
      return [];
    }

    const targetCell = gameState.grid[`${selectedHex[0]},${selectedHex[1]}`];
    return getTileActions({
      state: gameState,
      player: myPlayer,
      targetHex: selectedHex,
      targetCell,
      currentHex,
      isHostBypass,
    });
  }, [currentHex, gameState, isHostBypass, myPlayer, selectedHex]);

  const currentHexActions = useMemo<TileAction[]>(() => {
    if (!gameState || gameState.phase !== 'Playing' || !currentHex) {
      return [];
    }

    const targetCell = gameState.grid[`${currentHex[0]},${currentHex[1]}`];
    return getTileActions({
      state: gameState,
      player: myPlayer,
      targetHex: currentHex,
      targetCell,
      currentHex,
      isHostBypass,
    });
  }, [currentHex, gameState, isHostBypass, myPlayer]);

  const currentHexCell = useMemo<HexCell | undefined>(() => {
    if (!gameState || !currentHex) {
      return undefined;
    }

    return gameState.grid[`${currentHex[0]},${currentHex[1]}`];
  }, [currentHex, gameState]);

  const handleHexClick = useCallback((q: number, r: number, cell: HexCell | undefined): void => {
    if (commandoTargetingMode) {
      void handleActivateCommandoRaid(q, r);
      setCommandoTargetingMode(false);
      return;
    }

    if (!auth || !gameState || gameState.phase !== 'Playing') {
      return;
    }

    const targetHex: [number, number] = [q, r];
    setSelectedHex(targetHex);
    setPickupPrompt(null);
    setReinforcePrompt(null);
    setAttackPrompt(null);
    clearError();

    if (!isHostBypass && (!currentHex || currentHex[0] !== q || currentHex[1] !== r)) {
      const interactionStatus = getTileInteractionStatus({
        state: gameState,
        player: myPlayer,
        targetHex,
        targetCell: cell,
        currentHex,
        t,
        isHostBypass,
      });
      setMapFeedback({
        tone: interactionStatus.action === 'none' ? interactionStatus.tone : 'info',
        message: interactionStatus.message,
        targetHex,
      });
      return;
    }

    setMapFeedback(null);
  }, [
    auth,
    clearError,
    commandoTargetingMode,
    currentHex,
    gameState,
    handleActivateCommandoRaid,
    isHostBypass,
    myPlayer,
    setCommandoTargetingMode,
    setMapFeedback,
    setPickupPrompt,
    setReinforcePrompt,
    setSelectedHex,
    setAttackPrompt,
    t,
  ]);

  const handleTileAction = useCallback((actionType: TileActionType): void => {
    if (!selectedHex || !gameState || !invoke) {
      return;
    }

    const [q, r] = selectedHex;

    switch (actionType) {
      case 'claim':
      case 'claimAlliance':
      case 'claimSelf': {
        placeTroopsAction(selectedHex, actionType);
        break;
      }
      case 'reinforce': {
        setPickupPrompt(null);
        setAttackPrompt(null);
        const maxTroops = myPlayer?.carriedTroops ?? 1;
        setReinforcePrompt({ q, r, max: maxTroops });
        setReinforceCount(1);
        break;
      }
      case 'attack': {
        setPickupPrompt(null);
        setReinforcePrompt(null);
        const cell = gameState.grid[`${q},${r}`];
        const defenderTroops = cell?.troops ?? 0;
        const maxTroops = myPlayer?.carriedTroops ?? 0;
        setAttackPrompt({ q, r, max: maxTroops, defenderTroops });
        setAttackCount(maxTroops);
        break;
      }
      case 'pickup': {
        setReinforcePrompt(null);
        setAttackPrompt(null);
        const cell = gameState.grid[`${q},${r}`];
        setPickupPrompt({ q, r, max: cell?.troops ?? 1 });
        setPickupCount(1);
        break;
      }
    }
  }, [
    gameState,
    invoke,
    myPlayer,
    placeTroopsAction,
    selectedHex,
    setAttackCount,
    setAttackPrompt,
    setPickupCount,
    setPickupPrompt,
    setReinforceCount,
    setReinforcePrompt,
  ]);

  const handleCurrentHexAction = useCallback((actionType: TileActionType): void => {
    if (!currentHex || !gameState || !invoke) {
      return;
    }

    const [q, r] = currentHex;

    switch (actionType) {
      case 'claim':
      case 'claimAlliance':
      case 'claimSelf': {
        placeTroopsAction(currentHex, actionType);
        break;
      }
      case 'reinforce': {
        setSelectedHex(currentHex);
        setPickupPrompt(null);
        setAttackPrompt(null);
        const maxTroops = myPlayer?.carriedTroops ?? 1;
        setReinforcePrompt({ q, r, max: maxTroops });
        setReinforceCount(1);
        break;
      }
      case 'attack': {
        setSelectedHex(currentHex);
        setPickupPrompt(null);
        setReinforcePrompt(null);
        const cell = gameState.grid[`${q},${r}`];
        const defenderTroops = cell?.troops ?? 0;
        const maxTroops = myPlayer?.carriedTroops ?? 0;
        setAttackPrompt({ q, r, max: maxTroops, defenderTroops });
        setAttackCount(maxTroops);
        break;
      }
      case 'pickup': {
        setSelectedHex(currentHex);
        setReinforcePrompt(null);
        setAttackPrompt(null);
        const cell = gameState.grid[`${q},${r}`];
        setPickupPrompt({ q, r, max: cell?.troops ?? 1 });
        setPickupCount(1);
        break;
      }
    }
  }, [
    currentHex,
    gameState,
    invoke,
    myPlayer,
    placeTroopsAction,
    setAttackCount,
    setAttackPrompt,
    setPickupCount,
    setPickupPrompt,
    setReinforceCount,
    setReinforcePrompt,
    setSelectedHex,
  ]);

  const handleDismissTileActions = useCallback((): void => {
    setSelectedHex(null);
    setMapFeedback(null);
  }, [setMapFeedback, setSelectedHex]);

  const handleConfirmPickup = useCallback((): void => {
    const currentPickupPrompt = useGameplayStore.getState().pickupPrompt;
    const currentPickupCount = useGameplayStore.getState().pickupCount;

    if (!currentPickupPrompt || !invoke) {
      return;
    }

    const targetHex: [number, number] = [currentPickupPrompt.q, currentPickupPrompt.r];
    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    clearError();
    setSelectedHex(targetHex);
    invoke('PickUpTroops', currentPickupPrompt.q, currentPickupPrompt.r, currentPickupCount, coordinates.lat, coordinates.lng)
      .then(() => {
        setPickupPrompt(null);
        playSound('pickup');
        setMapFeedback({
          tone: 'success',
          message: t('game.mapFeedback.pickedUp', {
            count: currentPickupCount,
            q: currentPickupPrompt.q,
            r: currentPickupPrompt.r,
          }),
          targetHex,
        });
      })
      .catch(cause => {
        setMapFeedback({
          tone: 'error',
          message: getErrorMessage(cause),
          targetHex,
        });
      });
  }, [
    clearError,
    currentLocation,
    gameState,
    invoke,
    isHostBypass,
    playSound,
    setMapFeedback,
    setPickupPrompt,
    setSelectedHex,
    t,
  ]);

  const handleConfirmReinforce = useCallback(async (): Promise<void> => {
    const currentReinforcePrompt = useGameplayStore.getState().reinforcePrompt;
    const currentReinforceCount = useGameplayStore.getState().reinforceCount;

    if (!currentReinforcePrompt || !invoke) {
      return;
    }

    const targetHex: [number, number] = [currentReinforcePrompt.q, currentReinforcePrompt.r];
    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    clearError();
    setSelectedHex(targetHex);

    try {
      await invoke(
        'PlaceTroops',
        currentReinforcePrompt.q,
        currentReinforcePrompt.r,
        coordinates.lat,
        coordinates.lng,
        currentReinforceCount,
        false,
      );
      setMapFeedback({
        tone: 'success',
        message: getPlaceSuccessMessage('reinforce', currentReinforcePrompt.q, currentReinforcePrompt.r, t),
        targetHex,
      });
      playSound('reinforce');
    } catch (error) {
      playSound('error');
      setMapFeedback({
        tone: 'error',
        message: getErrorMessage(error),
        targetHex,
      });
    } finally {
      setReinforcePrompt(null);
    }
  }, [
    clearError,
    currentLocation,
    gameState,
    invoke,
    isHostBypass,
    playSound,
    setMapFeedback,
    setReinforcePrompt,
    setSelectedHex,
    t,
  ]);

  const handleConfirmAttack = useCallback(async (): Promise<void> => {
    const currentAttackPrompt = useGameplayStore.getState().attackPrompt;
    const currentAttackCount = useGameplayStore.getState().attackCount;

    if (!currentAttackPrompt || !invoke) {
      return;
    }

    const targetHex: [number, number] = [currentAttackPrompt.q, currentAttackPrompt.r];
    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    try {
      await invoke('PlaceTroops', currentAttackPrompt.q, currentAttackPrompt.r, coordinates.lat, coordinates.lng, currentAttackCount, false);
      playSound('attack');
    } catch (error) {
      playSound('error');
      setMapFeedback({ tone: 'error', message: getErrorMessage(error), targetHex });
    } finally {
      setAttackPrompt(null);
    }
  }, [currentLocation, gameState, invoke, isHostBypass, playSound, setAttackPrompt, setMapFeedback]);

  const handleCancelAttack = useCallback((): void => {
    setAttackPrompt(null);
  }, [setAttackPrompt]);

  const handleReClaimHex = useCallback(async (mode: ReClaimMode): Promise<void> => {
    if (!combatResult) {
      return;
    }

    if (mode === 'Alliance') {
      setCombatResult(null);
      return;
    }

    if (!invoke) {
      setCombatResult(null);
      return;
    }

    try {
      await invoke('ReClaimHex', combatResult.q, combatResult.r, mode);
    } catch (error) {
      setMapFeedback({ tone: 'error', message: getErrorMessage(error), targetHex: [combatResult.q, combatResult.r] });
    } finally {
      setCombatResult(null);
    }
  }, [combatResult, invoke, setCombatResult, setMapFeedback]);

  return {
    handleHexClick,
    tileActions,
    currentHexActions,
    currentHexCell,
    handleTileAction,
    handleCurrentHexAction,
    handleDismissTileActions,
    handleConfirmPickup,
    handleConfirmReinforce,
    handleConfirmAttack,
    handleCancelAttack,
    handleReClaimHex,
  };
}
