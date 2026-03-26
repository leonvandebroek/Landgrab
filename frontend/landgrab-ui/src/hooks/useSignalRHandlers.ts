import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import { useGameplayStore } from '../stores';
import type { SavedSession } from '../stores/gameStore';
import { useGameStore } from '../stores/gameStore';
import { useInfoLedgeStore } from '../stores/infoLedgeStore';
import { useNotificationStore } from '../stores/notificationStore';
import { useUiStore } from '../stores/uiStore';
import type { SoundName } from './useSound';
import type { GameEvents } from './useSignalR';
import type { AttackPrompt, CombatPreviewState, FieldBattleInvite, FieldBattleResult, GameState, PickupPrompt, ReinforcePrompt, TroopTransferRequest, TroopTransferResult } from '../types/game';
import { vibrate, HAPTIC } from '../utils/haptics';
import { deriveAbilityUiFromPlayer } from '../utils/abilityUi';
import { getErrorMessage, localizeLobbyError, normalizeGameState } from '../utils/gameHelpers';
import { readPersistedDebugLocation } from '../utils/debugLocationSession';
import { useMapOrchestrator } from './useMapOrchestrator';
import { recordAgentEvent } from '../testing/agentBridge';
import type { SignalRInvoke } from '../types/common';
import { isLocallyVisible, recordLocalHexSighting } from '../utils/localVisibility';

interface UseSignalRHandlersOptions {
  getInvoke: () => SignalRInvoke | null;
  saveSession: (roomCode: string) => void;
  resolveResumeFromState: (state: import('../types/game').GameState) => boolean;
  resolveResumeFromError: (message: string) => boolean;
  savedSessionRef: MutableRefObject<SavedSession | null>;
  t: TFunction;
  playSound: (name: SoundName) => void;
}

function getHex(state: GameState | null, q: number, r: number) {
  if (!state) {
    return null;
  }

  return state.grid[`${q},${r}`] ?? null;
}

function shouldClearPickupPrompt(
  prompt: PickupPrompt | null,
  previousState: GameState | null,
  nextState: GameState
): boolean {
  if (!prompt) {
    return false;
  }

  const previousHex = getHex(previousState, prompt.q, prompt.r);
  const nextHex = getHex(nextState, prompt.q, prompt.r);

  if (!nextHex) {
    return true;
  }

  if (nextHex.troops <= 0) {
    return true;
  }

  if (!previousHex) {
    return false;
  }

  return previousHex.ownerId !== nextHex.ownerId;
}

function shouldClearAttackPrompt(
  prompt: AttackPrompt | null,
  previousState: GameState | null,
  nextState: GameState
): boolean {
  if (!prompt) {
    return false;
  }

  const previousHex = getHex(previousState, prompt.q, prompt.r);
  const nextHex = getHex(nextState, prompt.q, prompt.r);

  if (!nextHex) {
    return true;
  }

  if (!previousHex) {
    return false;
  }

  return previousHex.ownerId !== nextHex.ownerId;
}

function shouldClearCombatPreview(
  previewState: CombatPreviewState | null,
  previousState: GameState | null,
  nextState: GameState
): boolean {
  if (!previewState) {
    return false;
  }

  const previousHex = getHex(previousState, previewState.q, previewState.r);
  const nextHex = getHex(nextState, previewState.q, previewState.r);

  if (!nextHex) {
    return true;
  }

  if (!previousHex) {
    return false;
  }

  return previousHex.ownerId !== nextHex.ownerId || previousHex.troops !== nextHex.troops;
}

function shouldClearReinforcePrompt(
  prompt: ReinforcePrompt | null,
  previousState: GameState | null,
  nextState: GameState
): boolean {
  if (!prompt) {
    return false;
  }

  const previousHex = getHex(previousState, prompt.q, prompt.r);
  const nextHex = getHex(nextState, prompt.q, prompt.r);

  if (!nextHex) {
    return true;
  }

  if (!previousHex) {
    return false;
  }

  return previousHex.ownerId !== nextHex.ownerId || previousHex.ownerAllianceId !== nextHex.ownerAllianceId;
}

function restorePersistedDebugLocation(roomCode: string | null | undefined): void {
  const persistedDebugLocation = readPersistedDebugLocation(roomCode);
  if (!persistedDebugLocation) {
    return;
  }

  const uiState = useUiStore.getState();
  uiState.setDebugLocation(persistedDebugLocation);
  uiState.setDebugLocationEnabled(true);
}

function syncAbilityUiFromServerState(
  state: GameState,
  currentUserId: string | null | undefined,
): void {
  if (state.phase !== 'Playing' || !currentUserId) {
    return;
  }

  const player = state.players.find((candidate) => candidate.id === currentUserId);
  if (!player) {
    return;
  }

  const gameplayState = useGameplayStore.getState();
  const currentAbilityUi = gameplayState.abilityUi;
  const derivedAbilityUi = deriveAbilityUiFromPlayer(player, state);

  if (!derivedAbilityUi) {
    if (
      currentAbilityUi.activeAbility !== null
      || currentAbilityUi.mode !== 'idle'
    ) {
      gameplayState.exitAbilityMode();
    }

    return;
  }

  const shouldPreserveVisibleCard = currentAbilityUi.cardVisible
    && currentAbilityUi.activeAbility === derivedAbilityUi.ability;
  const syncedFocusPreset = currentAbilityUi.activeAbility === derivedAbilityUi.ability
    ? currentAbilityUi.mapFocusPreset
    : derivedAbilityUi.focusPreset;

  const alreadySynced = currentAbilityUi.activeAbility === derivedAbilityUi.ability
    && currentAbilityUi.mode === derivedAbilityUi.mode
    && currentAbilityUi.cardVisible === shouldPreserveVisibleCard
    && currentAbilityUi.mapFocusPreset === syncedFocusPreset;

  if (alreadySynced) {
    return;
  }

  gameplayState.enterAbilityMode(
    derivedAbilityUi.ability,
    derivedAbilityUi.mode,
    syncedFocusPreset,
    { cardVisible: shouldPreserveVisibleCard },
  );
}

export function useSignalRHandlers({
  getInvoke,
  saveSession,
  resolveResumeFromState,
  resolveResumeFromError,
  savedSessionRef,
  t,
  playSound,
}: UseSignalRHandlersOptions): GameEvents {
  // gameState is read from the store directly inside handlers (not as a subscription)
  // to avoid triggering useMemo re-creation on every game state update.
  const { dispatchStateToLayers, dispatchPlayersOnly } = useMapOrchestrator();

  return useMemo<GameEvents>(() => ({
    onRoomCreated: (code, state) => {
      const roomCode = code || state.roomCode;
      const normalizedState = normalizeGameState(state, useGameStore.getState().gameState);
      recordAgentEvent('RoomCreated', {
        roomCode,
        phase: normalizedState.phase,
        playerCount: normalizedState.players.length,
      });
      saveSession(roomCode);
      resolveResumeFromState(normalizedState);
      useGameStore.getState().setGameState(normalizedState);
      dispatchStateToLayers(normalizedState);
      useGameplayStore.getState().setPickupPrompt(null);
      useGameplayStore.getState().setReinforcePrompt(null);
      useUiStore.getState().setView('lobby');
      useGameplayStore.getState().clearGameplayUi();
      useGameplayStore.getState().setSelectedHexKey(null);
      useUiStore.getState().clearError();
    },
    onPlayerJoined: (state) => {
      const normalizedState = normalizeGameState(state, useGameStore.getState().gameState);
      recordAgentEvent('PlayerJoined', {
        roomCode: normalizedState.roomCode,
        phase: normalizedState.phase,
        playerCount: normalizedState.players.length,
      });
      resolveResumeFromState(normalizedState);
      if (normalizedState.roomCode) {
        saveSession(normalizedState.roomCode);
      }
      useGameStore.getState().setGameState(normalizedState);
      dispatchStateToLayers(normalizedState);
      useGameplayStore.getState().setPickupPrompt(null);
      useGameplayStore.getState().setReinforcePrompt(null);
      if (state.phase === 'Lobby') {
        useUiStore.getState().setView('lobby');
        useGameplayStore.getState().clearGameplayUi();
        useGameplayStore.getState().setSelectedHexKey(null);
      } else if (normalizedState.phase === 'Playing') {
        restorePersistedDebugLocation(normalizedState.roomCode);
        syncAbilityUiFromServerState(
          normalizedState,
          savedSessionRef.current?.userId ?? useGameStore.getState().savedSession?.userId,
        );
        useUiStore.getState().setView('game');
      } else if (normalizedState.phase === 'GameOver') {
        useUiStore.getState().setView('gameover');
      }
      useUiStore.getState().clearError();
    },
    onGameStarted: (state) => {
      const normalizedState = normalizeGameState(state, useGameStore.getState().gameState);
      recordAgentEvent('GameStarted', {
        roomCode: normalizedState.roomCode,
        playerCount: normalizedState.players.length,
      });
      resolveResumeFromState(normalizedState);
      if (normalizedState.roomCode) {
        saveSession(normalizedState.roomCode);
      }
      useGameStore.getState().setGameState(normalizedState);
      dispatchStateToLayers(normalizedState);
      useGameplayStore.getState().setPickupPrompt(null);
      useGameplayStore.getState().setReinforcePrompt(null);
      restorePersistedDebugLocation(normalizedState.roomCode);
      syncAbilityUiFromServerState(
        normalizedState,
        savedSessionRef.current?.userId ?? useGameStore.getState().savedSession?.userId,
      );
      useUiStore.getState().setView('game');
      useUiStore.getState().clearError();
    },
    onStateUpdated: (state) => {
      const normalizedState = normalizeGameState(state, useGameStore.getState().gameState);
      recordAgentEvent('StateUpdated', {
        roomCode: normalizedState.roomCode,
        phase: normalizedState.phase,
        playerCount: normalizedState.players.length,
        gridCount: Object.keys(normalizedState.grid).length,
        eventLogCount: normalizedState.eventLog?.length ?? 0,
      });
      const gameplayState = useGameplayStore.getState();
      const shouldClearPickup = shouldClearPickupPrompt(
        gameplayState.pickupPrompt,
        useGameStore.getState().gameState,
        normalizedState
      );
      const shouldClearAttack = shouldClearAttackPrompt(
        gameplayState.attackPrompt,
        useGameStore.getState().gameState,
        normalizedState
      );
      const shouldClearPreview = shouldClearCombatPreview(
        gameplayState.combatPreview,
        useGameStore.getState().gameState,
        normalizedState
      );
      const shouldClearReinforce = shouldClearReinforcePrompt(
        gameplayState.reinforcePrompt,
        useGameStore.getState().gameState,
        normalizedState
      );

      const resolvedResume = resolveResumeFromState(normalizedState);
      if (normalizedState.roomCode) {
        saveSession(normalizedState.roomCode);
      }
      useGameStore.getState().setGameState(normalizedState);
      dispatchStateToLayers(normalizedState);
      if (shouldClearPickup) {
        gameplayState.setPickupPrompt(null);
      }
      if (shouldClearAttack) {
        gameplayState.setAttackPrompt(null);
      }
      if (shouldClearPreview) {
        gameplayState.setCombatPreview(null);
      }
      if (shouldClearReinforce) {
        gameplayState.setReinforcePrompt(null);
      }
      if (normalizedState.phase === 'Playing') {
        if (useGameStore.getState().gameState?.phase !== 'Playing') {
          restorePersistedDebugLocation(normalizedState.roomCode);
        }
        useUiStore.getState().setView('game');

        const currentUserId = savedSessionRef.current?.userId ?? useGameStore.getState().savedSession?.userId;

        if (resolvedResume || useGameStore.getState().autoResuming) {
          syncAbilityUiFromServerState(normalizedState, currentUserId);
        }

        const updatedGameplayState = useGameplayStore.getState();
        const updatedAbilityUi = updatedGameplayState.abilityUi;
        const updatedPlayer = currentUserId
          ? normalizedState.players.find((player) => player.id === currentUserId) ?? null
          : null;
        const hasActiveCommandoRaid = updatedPlayer != null && (normalizedState.activeRaids?.some((raid) => (
          raid.initiatorPlayerId === updatedPlayer.id
          || (updatedPlayer.allianceId ? raid.initiatorAllianceId === updatedPlayer.allianceId : false)
        )) ?? false);

        const shouldExitAbilityMode = (
          updatedAbilityUi.activeAbility === 'fortConstruction'
          && updatedAbilityUi.mode === 'inProgress'
          && updatedPlayer?.fortTargetQ == null
        ) || (
          updatedAbilityUi.activeAbility === 'sabotage'
          && updatedAbilityUi.mode === 'inProgress'
          && updatedPlayer?.sabotageTargetQ == null
        ) || (
          updatedAbilityUi.activeAbility === 'demolish'
          && updatedAbilityUi.mode === 'inProgress'
          && !updatedPlayer?.demolishTargetKey
        ) || (
          updatedAbilityUi.activeAbility === 'commandoRaid'
          && updatedPlayer?.role !== 'Commander'
          && !hasActiveCommandoRaid
        );

        if (shouldExitAbilityMode) {
          updatedGameplayState.exitAbilityMode();
        }
      } else if (normalizedState.phase === 'GameOver') {
        useUiStore.getState().setView('gameover');
        useGameplayStore.getState().clearGameplayUi();
        useGameplayStore.getState().setSelectedHexKey(null);
      }
      useUiStore.getState().clearError();

      // Show toasts for new event log entries
      const prevLog = useGameStore.getState().gameState?.eventLog ?? [];
      const newLog = normalizedState.eventLog ?? [];
      if (newLog.length > prevLog.length) {
        const newEntries = newLog.slice(prevLog.length);
        const myUserId = savedSessionRef.current?.userId ?? useGameStore.getState().savedSession?.userId;
        for (const entry of newEntries) {
          if (entry.type === 'CommandoRaidStarted' || entry.type === 'CommandoRaidSuccess' || entry.type === 'CommandoRaidFailed' || entry.type === 'RallyPointActivated' || entry.type === 'RallyPointResolved' || entry.type === 'SabotageStarted' || entry.type === 'SabotageComplete' || entry.type === 'FortConstructionStarted' || entry.type === 'FortBuilt' || entry.type === 'DemolishStarted' || entry.type === 'DemolishCompleted') {
            useInfoLedgeStore.getState().push({
              severity: 'gameEvent',
              source: 'gameToast',
              persistent: false,
              icon: 'archeryTarget',
              message: entry.message,
            });
          }
          if (entry.type === 'CombatRepelled' && myUserId && entry.targetPlayerId === myUserId) {
            useInfoLedgeStore.getState().push({
              severity: 'gameEvent',
              source: 'gameToast',
              persistent: false,
              icon: 'contested',
              message: t('game.toast.attackRepelledYou', {
                attackerName: entry.playerName ?? '?',
                q: entry.q ?? 0,
                r: entry.r ?? 0,
              }),
            });
          }
        }
      }

      // Detect field battle opportunity for initiator (player who just moved onto a neutral tile with enemies)
      if (normalizedState.phase === 'Playing') {
        const myUserId = savedSessionRef.current?.userId ?? useGameStore.getState().savedSession?.userId;
        const previousState = useGameStore.getState().gameState;
        
        if (myUserId && previousState) {
          const myPlayer = normalizedState.players.find((p) => p.id === myUserId);
          const prevPlayer = previousState.players.find((p) => p.id === myUserId);
          
          if (myPlayer && prevPlayer && (myPlayer.currentHexQ !== prevPlayer.currentHexQ || myPlayer.currentHexR !== prevPlayer.currentHexR)) {
            // Player moved to a new hex
            const currentHexKey = myPlayer.currentHexQ != null && myPlayer.currentHexR != null
              ? `${myPlayer.currentHexQ},${myPlayer.currentHexR}`
              : null;
            const currentHex = currentHexKey ? normalizedState.grid[currentHexKey] ?? null : null;
            
            if (currentHex && currentHex.ownerId == null && (myPlayer.carriedTroops ?? 0) > 0) {
              // On a neutral hex with troops
              const enemiesOnSameTile = normalizedState.players.filter(
                (p) => p.id !== myUserId
                  && p.currentHexQ === myPlayer.currentHexQ
                  && p.currentHexR === myPlayer.currentHexR
                  && p.allianceId !== myPlayer.allianceId
                  && (p.carriedTroops ?? 0) > 0
              );
              
              if (enemiesOnSameTile.length > 0) {
                // Field battle is available — push notification
                useInfoLedgeStore.getState().push({
                  severity: 'gameEvent',
                  source: 'gameToast',
                  persistent: false,
                  icon: 'contested',
                  message: t('game.toast.fieldBattleDetected'),
                });
              }
            }
          }
        }
      }
    },
    onPlayersMoved: (players) => {
      recordAgentEvent('PlayersMoved', {
        players: players.map((player) => ({
          id: player.id,
          name: player.name,
          currentHexQ: player.currentHexQ,
          currentHexR: player.currentHexR,
        })),
      });

      // Record client-side sightings for enemy tiles that just left local visibility.
      // This bridges the gap between PlayersMoved (no UpdateMemory on backend) and the
      // next StateUpdated — without this, tiles snap to Hidden the moment the player
      // moves away because cell.lastSeenAt is null until the server sends Remembered.
      const currentState = useGameStore.getState().gameState;
      const myUserId = savedSessionRef.current?.userId ?? useGameStore.getState().savedSession?.userId;
      if (currentState && myUserId) {
        const memorySecs = currentState.dynamics?.enemySightingMemorySeconds ?? 0;
        if (memorySecs > 0) {
          const myAllianceId = currentState.players.find((p) => p.id === myUserId)?.allianceId;

          const oldAlliedKeys = new Set<string>();
          for (const p of currentState.players) {
            const isAllied = p.id === myUserId || (myAllianceId && p.allianceId === myAllianceId);
            if (isAllied && p.currentHexQ != null && p.currentHexR != null) {
              oldAlliedKeys.add(`${p.currentHexQ},${p.currentHexR}`);
            }
          }

          const newAlliedKeys = new Set<string>();
          for (const p of players) {
            const isAllied = p.id === myUserId || (myAllianceId && p.allianceId === myAllianceId);
            if (isAllied && p.currentHexQ != null && p.currentHexR != null) {
              newAlliedKeys.add(`${p.currentHexQ},${p.currentHexR}`);
            }
          }

          const allianceOwnedKeys = new Set<string>();
          if (myAllianceId) {
            for (const [key, cell] of Object.entries(currentState.grid)) {
              if (cell.ownerAllianceId === myAllianceId) {
                allianceOwnedKeys.add(key);
              }
            }
          }

          for (const [key, cell] of Object.entries(currentState.grid)) {
            if (!cell.ownerId || cell.ownerAllianceId === myAllianceId) continue;
            if (
              isLocallyVisible(key, oldAlliedKeys, allianceOwnedKeys, currentState.grid)
              && !isLocallyVisible(key, newAlliedKeys, allianceOwnedKeys, currentState.grid)
            ) {
              recordLocalHexSighting(key);
            }
          }
        }
      }

      useGameStore.getState().updateGameState((currentState) => {
        if (!currentState) {
          return currentState;
        }

        return {
          ...currentState,
          players,
        };
      });
      dispatchPlayersOnly(players);
    },
    onGameOver: () => {
      recordAgentEvent('GameOver');
      playSound('victory');
      vibrate(HAPTIC.victory);
      useGameplayStore.getState().clearGameplayUi();
      useGameplayStore.getState().setSelectedHexKey(null);
      useUiStore.getState().setView('gameover');
    },
    onCombatResult: (result) => {
      recordAgentEvent('CombatResult', {
        q: result.q,
        r: result.r,
        attackerWon: result.attackerWon,
        hexCaptured: result.hexCaptured,
      });
      vibrate(HAPTIC.attack);
      useGameplayStore.getState().setCombatPreview(null);
      useGameplayStore.getState().setAttackPrompt(null);
      useGameplayStore.getState().setCombatResult(result);
      useInfoLedgeStore.getState().push({
        severity: 'gameEvent',
        source: 'gameToast',
        persistent: false,
        icon: 'contested',
        message: result.attackerWon
          ? t('game.toast.combatWon', { q: result.q, r: result.r })
          : t('game.toast.combatLost', { q: result.q, r: result.r }),
      });
    },
    onNeutralClaimResult: (result) => {
      recordAgentEvent('NeutralClaimResult', {
        q: result.q,
        r: result.r,
        success: true,
      });
      useGameplayStore.getState().setNeutralClaimResult(result);
    },
    onTileLost: (data) => {
      recordAgentEvent('TileLost', {
        q: data.Q,
        r: data.R,
        attackerName: data.AttackerName,
      });
      playSound('notification');
      vibrate(HAPTIC.loss);
      useGameplayStore.getState().setMapFeedback({
        tone: 'error',
        message: t('game.tileLost', { attacker: data.AttackerName, q: data.Q, r: data.R }),
        targetHex: [data.Q, data.R],
      });
      useInfoLedgeStore.getState().push({
        severity: 'gameEvent',
        source: 'gameToast',
        persistent: false,
        icon: 'flag',
        message: t('game.toast.tileLost', { attacker: data.AttackerName, q: data.Q, r: data.R }),
      });
    },
    onError: (message) => {
      recordAgentEvent('Error', { message });
      const errorText = getErrorMessage(message);
      if (resolveResumeFromError(errorText)) {
        return;
      }

      useUiStore.getState().setError(localizeLobbyError(errorText, t));
    },
    onHostMessage: (data) => {
      recordAgentEvent('HostMessage', data);
      useNotificationStore.getState().setHostMessage(data);
      useInfoLedgeStore.getState().push({
        severity: 'hostMessage',
        source: 'hostMessage',
        persistent: false,
        duration: 10000,
        icon: 'radioTower',
        message: data.message,
      });
    },
    onDrainTick: (data) => {
      recordAgentEvent('DrainTick', data);
      const { gameState: currentState, savedSession } = useGameStore.getState();
      if (!currentState || !savedSession?.userId || !data.allianceId) {
        return;
      }

      const myPlayer = currentState.players.find((player) => player.id === savedSession.userId);
      if (!myPlayer?.allianceId || myPlayer.allianceId !== data.allianceId) {
        return;
      }

      useInfoLedgeStore.getState().push({
        severity: 'gameEvent',
        source: 'gameToast',
        persistent: false,
        icon: 'flag',
        message: t('game.toast.drainTick' as never, { troops: data.troopsLost }),
      });
    },
    onDynamicsChanged: (dynamics) => {
      recordAgentEvent('DynamicsChanged', dynamics);
      useGameStore.getState().updateGameState((currentState) => {
        if (!currentState) {
          return currentState;
        }

        return {
          ...currentState,
          dynamics,
        };
      });

      useInfoLedgeStore.getState().push({
        severity: 'gameEvent',
        source: 'gameToast',
        persistent: false,
        icon: 'gearHammer',
        message: t('game.dynamicsChanged' as never),
      });
    },
    onTemplateSaved: () => {
    },
    onTroopTransferReceived: (data: TroopTransferRequest) => {
      useNotificationStore.getState().setTroopTransferRequest(data);
      useInfoLedgeStore.getState().push({
        severity: 'gameEvent', source: 'gameToast', persistent: false,
        icon: 'helmet',
        message: t('game.toast.troopTransferReceived' as never, { name: data.initiatorName, count: data.amount }),
      });
    },
    onTroopTransferResult: (data: TroopTransferResult) => {
      useInfoLedgeStore.getState().push({
        severity: 'gameEvent', source: 'gameToast', persistent: false,
        icon: 'helmet',
        message: data.accepted
          ? t('game.toast.troopTransferAccepted' as never, { name: data.recipientName, count: data.amount })
          : t('game.toast.troopTransferDeclined' as never, { name: data.recipientName }),
      });
    },
    onFieldBattleInvite: (data: FieldBattleInvite) => {
      useNotificationStore.getState().setFieldBattleInvite(data);
      useInfoLedgeStore.getState().push({
        severity: 'gameEvent', source: 'gameToast', persistent: false,
        icon: 'contested',
        message: t('game.toast.fieldBattleInvite' as never, { name: data.initiatorName }),
      });
    },
    onFieldBattleResolved: (data: FieldBattleResult) => {
      useInfoLedgeStore.getState().push({
        severity: 'gameEvent', source: 'gameToast', persistent: false,
        icon: data.initiatorWon ? 'trophy' : 'flag',
        message: data.initiatorWon
          ? t('game.toast.fieldBattleWon' as never, { q: data.q, r: data.r })
          : t('game.toast.fieldBattleLost' as never, { q: data.q, r: data.r }),
      });
    },
    onReconnected: () => {
      recordAgentEvent('Reconnected');
      useUiStore.getState().clearError();
      const session = savedSessionRef.current;
      const invoke = getInvoke();
      if (!invoke || !session?.roomCode) {
        return;
      }

      invoke('RejoinRoom', session.roomCode).catch(() => {
        // Silently ignore — the justConnected auto-resume flow also attempts rejoin.
      });
    },
  }), [dispatchPlayersOnly, dispatchStateToLayers, getInvoke, playSound, resolveResumeFromError, resolveResumeFromState, saveSession, savedSessionRef, t]);
}
