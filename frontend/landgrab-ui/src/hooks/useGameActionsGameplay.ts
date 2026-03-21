import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getTileActions, getTileInteractionStatus } from '../components/game/tileInteraction';
import type { TileAction, TileActionType } from '../components/game/tileInteraction';
import { useGameplayStore } from '../stores';
import { useUiStore } from '../stores/uiStore';
import type { CombatPreviewDto, HexCell } from '../types/game';
import { vibrate, HAPTIC } from '../utils/haptics';
import { getErrorMessage, getPlaceSuccessMessage } from '../utils/gameHelpers';
import type { UseGameActionsOptions } from './useGameActions.shared';
import { resolveActionCoordinates } from './useGameActions.shared';

const LOCATION_BROADCAST_THROTTLE_MS = 3000;
const MIN_MOVEMENT_METRES = 5;
const HEARTBEAT_INTERVAL_MS = 30_000;

function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusM = 6_371_000;
  const toRadians = (degrees: number): number => degrees * (Math.PI / 180);
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLng = toRadians(lng2 - lng1);
  const startLat = toRadians(lat1);
  const endLat = toRadians(lat2);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusM * c;
}

type ClaimTileActionType = 'claim' | 'reinforce' | 'claimAlliance' | 'claimSelf';

type UseGameActionsGameplayOptions = Pick<
  UseGameActionsOptions,
  'invoke' | 'auth' | 'connected' | 'gameState' | 'currentLocation' | 'currentHeadingRef' | 'currentHex' | 'myPlayer' | 'isHostBypass' | 't' | 'playSound'
>;

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
  handleDeployCombatTroops: (count: number) => Promise<void>;
  handleDeployNeutralClaimTroops: (count: number) => Promise<void>;
  handleCancelAttack: () => void;
}

export function useGameActionsGameplay({
  invoke,
  auth,
  connected,
  gameState,
  currentLocation,
  currentHeadingRef,
  currentHex,
  myPlayer,
  isHostBypass,
  t,
  playSound,
}: UseGameActionsGameplayOptions): UseGameActionsGameplayResult {
  const selectedHexKey = useGameplayStore(state => state.selectedHexKey);
  const abilityUi = useGameplayStore(state => state.abilityUi);
  const combatResult = useGameplayStore(state => state.combatResult);
  const neutralClaimResult = useGameplayStore(state => state.neutralClaimResult);
  const setMapFeedback = useGameplayStore(state => state.setMapFeedback);
  const setPickupPrompt = useGameplayStore(state => state.setPickupPrompt);
  const setPickupCount = useGameplayStore(state => state.setPickupCount);
  const setReinforcePrompt = useGameplayStore(state => state.setReinforcePrompt);
  const setReinforceCount = useGameplayStore(state => state.setReinforceCount);
  const setAttackPrompt = useGameplayStore(state => state.setAttackPrompt);
  const setCombatPreview = useGameplayStore(state => state.setCombatPreview);
  const setCombatResult = useGameplayStore(state => state.setCombatResult);
  const setNeutralClaimResult = useGameplayStore(state => state.setNeutralClaimResult);
  const setSelectedHexKey = useGameplayStore(state => state.setSelectedHexKey);
  const setError = useUiStore(state => state.setError);
  const clearError = useUiStore(state => state.clearError);
  const lastSentPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastSendTimeRef = useRef<number>(0);
  const previousCurrentHexRef = useRef<string | null>(null);

  const selectedHex = useMemo<[number, number] | null>(() => {
    if (!selectedHexKey) {
      return null;
    }

    return selectedHexKey.split(',').map(Number) as [number, number];
  }, [selectedHexKey]);

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

    const elapsedSinceLastSend = Date.now() - lastSendTimeRef.current;
    if (elapsedSinceLastSend < LOCATION_BROADCAST_THROTTLE_MS) {
      locationThrottleRef.current = setTimeout(() => {
        sendPendingLocation();
      }, LOCATION_BROADCAST_THROTTLE_MS - elapsedSinceLastSend);
      return;
    }

    const lastSentPosition = lastSentPositionRef.current;
    const distanceSinceLastSend = lastSentPosition
      ? haversineDistanceM(
        lastSentPosition.lat,
        lastSentPosition.lng,
        pendingLocation.lat,
        pendingLocation.lng,
      )
      : Number.POSITIVE_INFINITY;
    const heartbeatDue = lastSendTimeRef.current === 0 || elapsedSinceLastSend >= HEARTBEAT_INTERVAL_MS;

    if (!heartbeatDue && distanceSinceLastSend < MIN_MOVEMENT_METRES) {
      locationThrottleRef.current = setTimeout(() => {
        sendPendingLocation();
      }, HEARTBEAT_INTERVAL_MS - elapsedSinceLastSend);
      return;
    }

    lastSendTimeRef.current = Date.now();

    invoke('UpdatePlayerLocation', pendingLocation.lat, pendingLocation.lng, currentHeadingRef?.current ?? null)
      .then(() => {
        lastSentPositionRef.current = { lat: pendingLocation.lat, lng: pendingLocation.lng };
        clearLocationThrottle();
        locationThrottleRef.current = setTimeout(() => {
          sendPendingLocation();
        }, HEARTBEAT_INTERVAL_MS);
      })
      .catch(cause => setError(String(cause)));
  }, [clearLocationThrottle, currentHeadingRef, invoke, setError]);

  useEffect((): void | (() => void) => {
    if (!connected || gameState?.phase !== 'Playing' || !currentLocation) {
      clearLocationThrottle();
      pendingLocationRef.current = null;
      lastSendTimeRef.current = 0;
      lastSentPositionRef.current = null;
      return;
    }

    pendingLocationRef.current = { lat: currentLocation.lat, lng: currentLocation.lng };
    sendPendingLocation();
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

    useGameplayStore.getState().setSelectedHexKey(null);
    setMapFeedback(null);
    setPickupPrompt(null);
    setReinforcePrompt(null);
    setAttackPrompt(null);
    setCombatPreview(null);
  }, [currentHex, gameState?.phase, setAttackPrompt, setCombatPreview, setMapFeedback, setPickupPrompt, setReinforcePrompt]);

  const getCombatPreview = useCallback(async (q: number, r: number): Promise<CombatPreviewDto> => {
    if (!invoke) {
      throw new Error('SignalR connection is not available.');
    }

    return invoke<CombatPreviewDto>('GetCombatPreview', q, r);
  }, [invoke]);

  const placeTroopsAction = useCallback((targetHex: [number, number], actionType: ClaimTileActionType): void => {
    if (!invoke) {
      return;
    }

    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    const [q, r] = targetHex;

    invoke('PlaceTroops', q, r, coordinates.lat, coordinates.lng, null)
      .then(() => {
        setPickupPrompt(null);
        setReinforcePrompt(null);
        setAttackPrompt(null);
        setCombatPreview(null);
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
    setCombatPreview,
    setMapFeedback,
    setPickupPrompt,
    setReinforcePrompt,
    t,
  ]);

  const tileActions = useMemo<TileAction[]>(() => {
    if (!gameState || gameState.phase !== 'Playing' || !selectedHexKey || !selectedHex) {
      return [];
    }

    const targetCell = gameState.grid[selectedHexKey];
    return getTileActions({
      state: gameState,
      player: myPlayer,
      targetHex: selectedHex,
      targetCell,
      currentHex,
      isHostBypass,
    });
  }, [currentHex, gameState, isHostBypass, myPlayer, selectedHex, selectedHexKey]);

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
    const nextSelectedHexKey = `${q},${r}`;

    if (abilityUi.mode === 'targeting' || abilityUi.mode === 'confirming') {
      return;
    }

    if (!auth || !gameState || gameState.phase !== 'Playing') {
      return;
    }

    const targetHex: [number, number] = [q, r];
    clearError();

    const isCurrentTile = currentHex?.[0] === q && currentHex[1] === r;

    if (!isCurrentTile) {
      setSelectedHexKey(nextSelectedHexKey);
      setPickupPrompt(null);
      setReinforcePrompt(null);
      setAttackPrompt(null);
      setCombatPreview(null);

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

    setSelectedHexKey(null);
    setPickupPrompt(null);
    setReinforcePrompt(null);
    setAttackPrompt(null);
    setCombatPreview(null);
    setMapFeedback(null);
  }, [
    auth,
    abilityUi.mode,
    clearError,
    currentHex,
    gameState,
    isHostBypass,
    myPlayer,
    setSelectedHexKey,
    setMapFeedback,
    setPickupPrompt,
    setReinforcePrompt,
    setAttackPrompt,
    setCombatPreview,
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
        setAttackPrompt(null);
        setCombatResult(null);
        void getCombatPreview(q, r)
          .then((preview) => {
            setCombatPreview({ q, r, preview });
          })
          .catch((cause) => {
            playSound('error');
            setMapFeedback({ tone: 'error', message: getErrorMessage(cause), targetHex: selectedHex });
          });
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
    setAttackPrompt,
    setCombatPreview,
    setCombatResult,
    setPickupCount,
    setPickupPrompt,
    setReinforceCount,
    setReinforcePrompt,
    getCombatPreview,
    playSound,
    setMapFeedback,
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
        useGameplayStore.getState().setSelectedHexKey(`${currentHex[0]},${currentHex[1]}`);
        setPickupPrompt(null);
        setAttackPrompt(null);
        const maxTroops = myPlayer?.carriedTroops ?? 1;
        setReinforcePrompt({ q, r, max: maxTroops });
        setReinforceCount(1);
        break;
      }
      case 'attack': {
        useGameplayStore.getState().setSelectedHexKey(`${currentHex[0]},${currentHex[1]}`);
        setPickupPrompt(null);
        setReinforcePrompt(null);
        setAttackPrompt(null);
        setCombatResult(null);
        void getCombatPreview(q, r)
          .then((preview) => {
            setCombatPreview({ q, r, preview });
          })
          .catch((cause) => {
            playSound('error');
            setMapFeedback({ tone: 'error', message: getErrorMessage(cause), targetHex: currentHex });
          });
        break;
      }
      case 'pickup': {
        useGameplayStore.getState().setSelectedHexKey(`${currentHex[0]},${currentHex[1]}`);
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
    setAttackPrompt,
    setCombatPreview,
    setCombatResult,
    setPickupCount,
    setPickupPrompt,
    setReinforceCount,
    setReinforcePrompt,
    getCombatPreview,
    playSound,
    setMapFeedback,
  ]);

  const handleDismissTileActions = useCallback((): void => {
    useGameplayStore.getState().setSelectedHexKey(null);
    setMapFeedback(null);
    setCombatPreview(null);
  }, [setCombatPreview, setMapFeedback]);

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
    useGameplayStore.getState().setSelectedHexKey(`${targetHex[0]},${targetHex[1]}`);
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
    useGameplayStore.getState().setSelectedHexKey(`${targetHex[0]},${targetHex[1]}`);

    try {
      await invoke(
        'PlaceTroops',
        currentReinforcePrompt.q,
        currentReinforcePrompt.r,
        coordinates.lat,
        coordinates.lng,
        currentReinforceCount,
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
    t,
  ]);

  const handleConfirmAttack = useCallback(async (): Promise<void> => {
    const currentCombatPreview = useGameplayStore.getState().combatPreview;

    if (!currentCombatPreview || !invoke) {
      return;
    }

    const targetHex: [number, number] = [currentCombatPreview.q, currentCombatPreview.r];
    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    try {
      const troopCount = myPlayer?.carriedTroops ?? currentCombatPreview.preview.attackerTroops;
      await invoke('PlaceTroops', currentCombatPreview.q, currentCombatPreview.r, coordinates.lat, coordinates.lng, troopCount);
      playSound('attack');
      setCombatPreview(null);
    } catch (error) {
      playSound('error');
      setMapFeedback({ tone: 'error', message: getErrorMessage(error), targetHex });
    }
  }, [currentLocation, gameState, invoke, isHostBypass, myPlayer?.carriedTroops, playSound, setCombatPreview, setMapFeedback]);

  const handleDeployCombatTroops = useCallback(async (count: number): Promise<void> => {
    if (!combatResult) {
      return;
    }

    if (count === 0) {
      setCombatResult(null);
      return;
    }

    if (!invoke) {
      return;
    }

    const targetHex: [number, number] = [combatResult.q, combatResult.r];
    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    try {
      await invoke('PlaceTroops', combatResult.q, combatResult.r, coordinates.lat, coordinates.lng, count);
      playSound('reinforce');
      setCombatResult(null);
    } catch (error) {
      playSound('error');
      setMapFeedback({ tone: 'error', message: getErrorMessage(error), targetHex });
    }
  }, [combatResult, currentLocation, gameState, invoke, isHostBypass, playSound, setCombatResult, setMapFeedback]);

  const handleDeployNeutralClaimTroops = useCallback(async (count: number): Promise<void> => {
    if (!neutralClaimResult) {
      return;
    }

    if (count === 0) {
      setNeutralClaimResult(null);
      return;
    }

    if (!invoke) {
      return;
    }

    const targetHex: [number, number] = [neutralClaimResult.q, neutralClaimResult.r];
    const coordinates = resolveActionCoordinates(targetHex, gameState, currentLocation, isHostBypass);
    if (!coordinates) {
      return;
    }

    try {
      await invoke('PlaceTroops', neutralClaimResult.q, neutralClaimResult.r, coordinates.lat, coordinates.lng, count);
      playSound('reinforce');
      setNeutralClaimResult(null);
    } catch (error) {
      playSound('error');
      setMapFeedback({ tone: 'error', message: getErrorMessage(error), targetHex });
    }
  }, [currentLocation, gameState, invoke, isHostBypass, neutralClaimResult, playSound, setMapFeedback, setNeutralClaimResult]);

  const handleCancelAttack = useCallback((): void => {
    setAttackPrompt(null);
    setCombatPreview(null);
  }, [setAttackPrompt, setCombatPreview]);

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
    handleDeployCombatTroops,
    handleDeployNeutralClaimTroops,
    handleCancelAttack,
  };
}
