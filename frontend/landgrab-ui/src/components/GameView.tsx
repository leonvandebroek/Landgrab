import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { MutableRefObject, ReactNode } from 'react';
import { HostControlPlane } from './game/HostControlPlane';
import { LoadingFallback } from './LoadingFallback';
import { ClaimDeploySheet, CombatResultSheet } from './game/play/OutcomeSheets';
import { useGameStore } from '../stores/gameStore';
import { useGameplayStore } from '../stores';
import { useUiStore } from '../stores/uiStore';
import type { GameDynamics, HexCell } from '../types/game';
import type { PlayerDisplayPreferences } from '../types/playerPreferences';
import type { TileAction, TileActionType } from './game/tileInteraction';
import type { InvokeFn } from '../types/abilities';
import type { LocationPoint } from '../types/common';

// Heavy components loaded lazily — same split as original App.
const GameMap = lazy(() =>
  import('./map/GameMap').then(m => ({ default: m.GameMap }))
);
const PlayScreen = lazy(() =>
  import('./game/play/PlayScreen').then(m => ({ default: m.PlayScreen }))
);

/** All game-action callbacks sourced from useGameActions in App. */
export interface GameViewActions {
  onHexClick: (q: number, r: number, cell: HexCell | undefined) => void;
  onConfirmPickup: () => void;
  onConfirmReinforce: () => Promise<void>;
  onReturnToLobby: () => void;
  currentHexActions: TileAction[];
  onCurrentHexAction: (actionType: TileActionType) => void;
  onDismissTileActions: () => void;
  onConfirmAttack: () => Promise<void>;
  onSetObserverMode: (enabled: boolean) => void;
  onUpdateDynamicsLive: (dynamics: GameDynamics) => void;
  onSendHostMessage: (message: string, allianceIds?: string[]) => void;
  onPauseGame: (paused: boolean) => void;
  onDeployCombatTroops: (count: number) => Promise<void>;
  onDeployNeutralClaimTroops: (count: number) => Promise<void>;
  onFleeBattle: (battleId: string) => Promise<boolean>;
}

export interface GameViewProps {
  /** The authenticated user's ID. */
  userId: string;
  currentLocation: LocationPoint | null;
  currentHex: [number, number] | null;
  effectiveLocationError: string | null;
  currentPlayerName: string;
  playerDisplayPrefs: PlayerDisplayPreferences;
  onPlayerDisplayPrefsChange: (
    next:
      | PlayerDisplayPreferences
      | ((current: PlayerDisplayPreferences) => PlayerDisplayPreferences),
  ) => void;
  /** Ref forwarded to GameMap so PlayingHud's minimap can pan the main map. */
  mapNavigateRef: MutableRefObject<((lat: number, lng: number) => void) | null>;
  onNavigateMap: (lat: number, lng: number) => void;
  debugToggle: ReactNode;
  debugPanel: ReactNode;
  /** Single invoke function for all SignalR hub calls. */
  invoke: InvokeFn | null;
  actions: GameViewActions;
}

/**
 * Renders the full in-game UI for `view === 'game'`.
 *
 * Reads gameState, selectedHexKey, combatResult, neutralClaimResult, error,
 * setMainMapBounds and setSelectedHexScreenPos directly from Zustand stores.
 * Delegates everything else through props to keep App as a thin orchestrator.
 */
export function GameView({
  userId,
  currentLocation,
  currentHex,
  effectiveLocationError,
  playerDisplayPrefs,
  onPlayerDisplayPrefsChange,
  mapNavigateRef,
  debugToggle,
  debugPanel,
  invoke,
  actions,
}: GameViewProps) {
  // ── Store reads ─────────────────────────────────────────────────────────
  const { t } = useTranslation();
  const gameState = useGameStore(state => state.gameState);
  const selectedHexKey = useGameplayStore(state => state.selectedHexKey);
  const combatResult = useGameplayStore(state => state.combatResult);
  const neutralClaimResult = useGameplayStore(state => state.neutralClaimResult);
  const setCombatResult = useGameplayStore(state => state.setCombatResult);
  const error = useUiStore(state => state.error);
  const setMainMapBounds = useUiStore(state => state.setMainMapBounds);
  const setSelectedHexScreenPos = useUiStore(state => state.setSelectedHexScreenPos);

  // ── Derived values ──────────────────────────────────────────────────────
  const myPlayer = useMemo(() => {
    if (!gameState) return null;
    return gameState.players.find(p => p.id === userId) ?? null;
  }, [gameState, userId]);
  const selectedHex = useMemo<[number, number] | null>(() => {
    if (!selectedHexKey) {
      return null;
    }

    return selectedHexKey.split(',').map(Number) as [number, number];
  }, [selectedHexKey]);
  const isHost = myPlayer?.isHost ?? false;

  // Host GPS-bypass: suppress location error banner when host is bypassing GPS
  const isHostBypass = Boolean(gameState?.hostBypassGps && isHost);

  // ── All hooks must fire before any conditional return ───────────────────
  if (!gameState) return null;

  // ── Observer / host-control mode ────────────────────────────────────────
  const isObserverMode = Boolean(myPlayer?.isHost && gameState.hostObserverMode);

  if (isObserverMode) {
    return (
      <>
        <Suspense fallback={<LoadingFallback />}>
          <HostControlPlane
            state={gameState}
            onSwitchToPlayer={() => actions.onSetObserverMode(false)}
            onUpdateDynamics={actions.onUpdateDynamicsLive}
            onSendMessage={actions.onSendHostMessage}
            onPauseGame={actions.onPauseGame}
            onReturnToLobby={actions.onReturnToLobby}
            error={error}
          >
            <GameMap
              state={gameState}
              myUserId={userId}
              currentLocation={currentLocation}
              constrainViewportToGrid
              onHexClick={actions.onHexClick}
              selectedHex={selectedHex}
              playerDisplayPrefs={playerDisplayPrefs}
            />
          </HostControlPlane>
        </Suspense>
      </>
    );
  }

  // ── Standard playing mode ────────────────────────────────────────────────
  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <PlayScreen
          state={gameState}
          myUserId={userId}
          currentHex={currentHex}
          hasLocation={Boolean(currentLocation)}
          locationError={effectiveLocationError}
          isHostBypass={isHostBypass}
          currentHexActions={actions.currentHexActions}
          onCurrentHexAction={actions.onCurrentHexAction}
          onConfirmPickup={actions.onConfirmPickup}
          onConfirmReinforce={actions.onConfirmReinforce}
          onConfirmAttack={actions.onConfirmAttack}
          onDismissTileActions={actions.onDismissTileActions}
          onReturnToLobby={actions.onReturnToLobby}
          onSetObserverMode={actions.onSetObserverMode}
          onFleeBattle={actions.onFleeBattle}
          invoke={invoke}
          playerDisplayPrefs={playerDisplayPrefs}
          onPlayerDisplayPrefsChange={onPlayerDisplayPrefsChange}
          debugToggle={debugToggle}
          debugPanel={debugPanel}
        >
          <GameMap
            state={gameState}
            myUserId={userId}
            currentLocation={currentLocation}
            constrainViewportToGrid
            onHexClick={actions.onHexClick}
            selectedHex={selectedHex}
            playerDisplayPrefs={playerDisplayPrefs}
            onBoundsChange={setMainMapBounds}
            onHexScreenPosition={setSelectedHexScreenPos}
            navigateRef={mapNavigateRef}
            controlsVariant="compact"
            compactLabels={{ layers: t('ui.layers.title'), locate: t('ui.play.centreOnMe') }}
          />
        </PlayScreen>
      </Suspense>
      {combatResult && (
        <CombatResultSheet
          key={`${combatResult.q},${combatResult.r}`}
          result={combatResult}
          onDeploy={(count) => void actions.onDeployCombatTroops(count)}
          onClose={() => setCombatResult(null)}
        />
      )}
      {!combatResult && neutralClaimResult && (
        <ClaimDeploySheet
          key={`${neutralClaimResult.q},${neutralClaimResult.r}`}
          result={neutralClaimResult}
          onDeploy={(count) => void actions.onDeployNeutralClaimTroops(count)}
        />
      )}
    </>
  );
}
