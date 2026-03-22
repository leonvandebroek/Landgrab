import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { CombatModal } from './game/CombatModal';
import { CombatPreviewModal } from './game/CombatPreviewModal';
import { GameRulesPage } from './game/GameRulesPage';
import { HostControlPlane } from './game/HostControlPlane';
import { LoadingFallback } from './LoadingFallback';
import { TroopDeployModal } from './game/TroopDeployModal';
import { useGameStore } from '../stores/gameStore';
import { useGameplayStore } from '../stores';
import { useUiStore } from '../stores/uiStore';
import type { GameDynamics, HexCell } from '../types/game';
import type { PlayerDisplayPreferences } from '../types/playerPreferences';
import type { TileAction, TileActionType } from './game/tileInteraction';

// Heavy components loaded lazily — same split as original App.
const GameMap = lazy(() =>
  import('./map/GameMap').then(m => ({ default: m.GameMap }))
);
const PlayingHud = lazy(() =>
  import('./game/PlayingHud').then(m => ({ default: m.PlayingHud }))
);

interface LocationPoint {
  lat: number;
  lng: number;
}

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
  onActivateBeacon: (heading: number) => Promise<boolean>;
  onDeactivateBeacon: () => Promise<boolean>;
  onShareBeaconIntel: () => Promise<number>;
  onActivateTacticalStrike: (targetQ: number, targetR: number) => Promise<boolean>;
  onResolveTacticalStrikeTarget: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  onActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<boolean>;
  onResolveRaidTarget: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  onActivateRallyPoint: () => Promise<boolean>;
  onActivateSabotage: () => Promise<boolean>;
  onCancelFortConstruction: () => Promise<boolean>;
  onCancelSabotage: () => Promise<boolean>;
  onCancelDemolish: () => Promise<boolean>;
  onStartDemolish: () => Promise<boolean>;
  onStartFortConstruction: () => Promise<boolean>;
  onAttemptIntercept: (heading: number) => Promise<{ status: string; seconds?: number }>;
  onSetObserverMode: (enabled: boolean) => void;
  onUpdateDynamicsLive: (dynamics: GameDynamics) => void;
  onSendHostMessage: (message: string, allianceIds?: string[]) => void;
  onPauseGame: (paused: boolean) => void;
  onDeployCombatTroops: (count: number) => Promise<void>;
  onDeployNeutralClaimTroops: (count: number) => Promise<void>;
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
  actions: GameViewActions;
}

/**
 * Renders the full in-game UI for `view === 'game'`.
 *
 * Reads gameState, selectedHexKey, combatPreview, combatResult, hasAcknowledgedRules, error,
 * setMainMapBounds and setSelectedHexScreenPos directly from Zustand stores.
 * Delegates everything else through props to keep App as a thin orchestrator.
 */
export function GameView({
  userId,
  currentLocation,
  currentHex,
  effectiveLocationError,
  currentPlayerName,
  playerDisplayPrefs,
  onPlayerDisplayPrefsChange,
  mapNavigateRef,
  onNavigateMap,
  debugToggle,
  debugPanel,
  actions,
}: GameViewProps) {
  // ── Store reads ─────────────────────────────────────────────────────────
  const gameState = useGameStore(state => state.gameState);
  const selectedHexKey = useGameplayStore(state => state.selectedHexKey);
  const combatPreview = useGameplayStore(state => state.combatPreview);
  const combatResult = useGameplayStore(state => state.combatResult);
  const neutralClaimResult = useGameplayStore(state => state.neutralClaimResult);
  const setCombatPreview = useGameplayStore(state => state.setCombatPreview);
  const setCombatResult = useGameplayStore(state => state.setCombatResult);
  const setNeutralClaimResult = useGameplayStore(state => state.setNeutralClaimResult);
  const hasAcknowledgedRules = useUiStore(state => state.hasAcknowledgedRules);
  const setHasAcknowledgedRules = useUiStore(state => state.setHasAcknowledgedRules);
  const error = useUiStore(state => state.error);
  const setMainMapBounds = useUiStore(state => state.setMainMapBounds);
  const setSelectedHexScreenPos = useUiStore(state => state.setSelectedHexScreenPos);

  // ── Rules-acknowledgment logic ──────────────────────────────────────────
  // Scoped here because it is exclusively needed by the game view.
  const rulesKey = gameState?.roomCode ? `lg-rules-ack-${gameState.roomCode}` : '';

  useEffect(() => {
    if (!rulesKey) {
      setHasAcknowledgedRules(false);
      return;
    }
    setHasAcknowledgedRules(sessionStorage.getItem(rulesKey) === 'true');
  }, [rulesKey, setHasAcknowledgedRules]);

  const handleAcknowledgeRules = useCallback(() => {
    if (rulesKey) {
      sessionStorage.setItem(rulesKey, 'true');
    }
    setHasAcknowledgedRules(true);
  }, [rulesKey, setHasAcknowledgedRules]);

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
  const shouldShowRulesGate = !hasAcknowledgedRules && !isHost;

  // ── All hooks must fire before any conditional return ───────────────────
  if (!gameState) return null;

  // ── Rules gate ──────────────────────────────────────────────────────────
  if (shouldShowRulesGate) {
    return (
      <>
        <GameRulesPage gameState={gameState} onContinue={handleAcknowledgeRules} />
      </>
    );
  }

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
        <PlayingHud
          myUserId={userId}
          currentHex={currentHex}
          onConfirmPickup={actions.onConfirmPickup}
          onConfirmReinforce={actions.onConfirmReinforce}
          onReturnToLobby={actions.onReturnToLobby}
          locationError={effectiveLocationError}
          isHostBypass={isHostBypass}
          currentHexActions={actions.currentHexActions}
          onCurrentHexAction={actions.onCurrentHexAction}
          onDismissTileActions={actions.onDismissTileActions}
          onActivateBeacon={actions.onActivateBeacon}
          onDeactivateBeacon={actions.onDeactivateBeacon}
          onShareBeaconIntel={actions.onShareBeaconIntel}
          onActivateTacticalStrike={actions.onActivateTacticalStrike}
          onResolveTacticalStrikeTarget={actions.onResolveTacticalStrikeTarget}
          onActivateCommandoRaid={actions.onActivateCommandoRaid}
          onResolveRaidTarget={actions.onResolveRaidTarget}
          onActivateRallyPoint={actions.onActivateRallyPoint}
          onActivateSabotage={actions.onActivateSabotage}
          onCancelFortConstruction={actions.onCancelFortConstruction}
          onCancelSabotage={actions.onCancelSabotage}
          onCancelDemolish={actions.onCancelDemolish}
          onStartDemolish={actions.onStartDemolish}
          onStartFortConstruction={actions.onStartFortConstruction}
          onAttemptIntercept={actions.onAttemptIntercept}
          playerDisplayPrefs={playerDisplayPrefs}
          onPlayerDisplayPrefsChange={onPlayerDisplayPrefsChange}
          currentPlayerName={currentPlayerName}
          hasLocation={Boolean(currentLocation)}
          onSetObserverMode={actions.onSetObserverMode}
          debugToggle={debugToggle}
          debugPanel={debugPanel}
          onNavigateMap={onNavigateMap}
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
          />
        </PlayingHud>
      </Suspense>
      {combatPreview && (
        <CombatPreviewModal
          preview={combatPreview.preview}
          onAttack={() => void actions.onConfirmAttack()}
          onRetreat={() => setCombatPreview(null)}
        />
      )}
      {combatResult && (
        <CombatModal
          result={combatResult}
          onDeployTroops={(count) => void actions.onDeployCombatTroops(count)}
          onClose={() => setCombatResult(null)}
        />
      )}
      {neutralClaimResult && (
        <TroopDeployModal
          claimResult={neutralClaimResult}
          onDeploy={(count) => void actions.onDeployNeutralClaimTroops(count)}
          onClose={() => setNeutralClaimResult(null)}
        />
      )}
    </>
  );
}
