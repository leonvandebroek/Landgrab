import { lazy, Suspense } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useGameplayStore } from '../stores/gameplayStore';
import { useUiStore } from '../stores/uiStore';
import { CombatModal } from './game/CombatModal';
import { GameRulesPage } from './game/GameRulesPage';
import { HostControlPlane } from './game/HostControlPlane';
import { LoadingFallback } from './LoadingFallback';
import type { GameDynamics, HexCell, ReClaimMode } from '../types/game';
import type { PlayerDisplayPreferences } from '../types/playerPreferences';
import type { GameToast } from '../hooks/useToastQueue';
import type { TileAction, TileActionType } from './game/tileInteraction';

const GameMap = lazy(() =>
  import('./map/GameMap').then(module => ({ default: module.GameMap })),
);

const PlayingHud = lazy(() =>
  import('./game/PlayingHud').then(module => ({ default: module.PlayingHud })),
);

interface LocationPoint {
  lat: number;
  lng: number;
}

interface GameViewProps {
  connectionBanner?: ReactNode;
  currentHex: [number, number] | null;
  currentHexActions: TileAction[];
  currentLocation: LocationPoint | null;
  debugGpsPanel: ReactNode;
  debugToggleButton: ReactNode;
  locationError: string | null;
  mapNavigateRef: MutableRefObject<((lat: number, lng: number) => void) | null>;
  onAcceptDuel: (duelId: string) => Promise<void>;
  onActivateBeacon: () => Promise<void>;
  onActivateStealth: () => Promise<void>;
  onAcknowledgeRules: () => void;
  onConfirmAttack: () => Promise<void>;
  onConfirmPickup: () => void;
  onCurrentHexAction: (actionType: TileActionType) => void;
  onDeactivateBeacon: () => Promise<void>;
  onDeclineDuel: (duelId: string) => Promise<void>;
  onDismissTileActions: () => void;
  onDismissToast: (id: string) => void;
  onHexClick: (q: number, r: number, cell: HexCell | undefined) => void;
  onNavigateMap: (lat: number, lng: number) => void;
  onPauseGame: (paused: boolean) => void;
  onPlayerDisplayPrefsChange: (prefs: PlayerDisplayPreferences) => void;
  onReClaim: (mode: ReClaimMode) => Promise<void>;
  onReturnToLobby: () => void;
  onSendHostMessage: (message: string, allianceIds?: string[]) => void;
  onSetObserverMode: (enabled: boolean) => void;
  onTriggerEvent: (eventType: string, targetQ?: number, targetR?: number, targetAllianceId?: string) => void;
  onUpdateDynamics: (dynamics: GameDynamics) => void;
  playerDisplayPrefs: PlayerDisplayPreferences;
  toasts: GameToast[];
  userId: string;
  username: string;
}

export function GameView({
  connectionBanner,
  currentHex,
  currentHexActions,
  currentLocation,
  debugGpsPanel,
  debugToggleButton,
  locationError,
  mapNavigateRef,
  onAcceptDuel,
  onActivateBeacon,
  onActivateStealth,
  onAcknowledgeRules,
  onConfirmAttack,
  onConfirmPickup,
  onCurrentHexAction,
  onDeactivateBeacon,
  onDeclineDuel,
  onDismissTileActions,
  onDismissToast,
  onHexClick,
  onNavigateMap,
  onPauseGame,
  onPlayerDisplayPrefsChange,
  onReClaim,
  onReturnToLobby,
  onSendHostMessage,
  onSetObserverMode,
  onTriggerEvent,
  onUpdateDynamics,
  playerDisplayPrefs,
  toasts,
  userId,
  username,
}: GameViewProps) {
  const gameState = useGameStore(state => state.gameState);
  const selectedHex = useGameplayStore(state => state.selectedHex);
  const combatResult = useGameplayStore(state => state.combatResult);
  const setCombatResult = useGameplayStore(state => state.setCombatResult);
  const error = useUiStore(state => state.error);
  const hasAcknowledgedRules = useUiStore(state => state.hasAcknowledgedRules);
  const setMainMapBounds = useUiStore(state => state.setMainMapBounds);
  const setSelectedHexScreenPos = useUiStore(state => state.setSelectedHexScreenPos);

  if (!gameState) {
    return null;
  }

  if (!hasAcknowledgedRules) {
    return (
      <>
        {connectionBanner}
        <GameRulesPage gameState={gameState} onContinue={onAcknowledgeRules} />
      </>
    );
  }

  const myPlayer = gameState.players.find(player => player.id === userId) ?? null;
  const isObserverMode = Boolean(myPlayer?.isHost && gameState.hostObserverMode);
  const currentPlayerName = myPlayer?.name ?? username;

  if (isObserverMode) {
    return (
      <>
        {connectionBanner}
        <Suspense fallback={<LoadingFallback />}>
          <HostControlPlane
            state={gameState}
            onSwitchToPlayer={() => onSetObserverMode(false)}
            onUpdateDynamics={onUpdateDynamics}
            onTriggerEvent={onTriggerEvent}
            onSendMessage={onSendHostMessage}
            onPauseGame={onPauseGame}
            onReturnToLobby={onReturnToLobby}
            error={error}
          >
            <GameMap
              state={gameState}
              myUserId={userId}
              currentLocation={currentLocation}
              constrainViewportToGrid
              onHexClick={onHexClick}
              selectedHex={selectedHex}
              playerDisplayPrefs={playerDisplayPrefs}
            />
          </HostControlPlane>
        </Suspense>
      </>
    );
  }

  return (
    <>
      {connectionBanner}
      <Suspense fallback={<LoadingFallback />}>
        <PlayingHud
          myUserId={userId}
          currentHex={currentHex}
          onConfirmPickup={onConfirmPickup}
          onReturnToLobby={onReturnToLobby}
          locationError={locationError}
          currentHexActions={currentHexActions}
          onCurrentHexAction={onCurrentHexAction}
          onDismissTileActions={onDismissTileActions}
          onConfirmAttack={onConfirmAttack}
          onAcceptDuel={onAcceptDuel}
          onDeclineDuel={onDeclineDuel}
          onActivateBeacon={onActivateBeacon}
          onDeactivateBeacon={onDeactivateBeacon}
          onActivateStealth={onActivateStealth}
          playerDisplayPrefs={playerDisplayPrefs}
          onPlayerDisplayPrefsChange={onPlayerDisplayPrefsChange}
          currentPlayerName={currentPlayerName}
          hasLocation={Boolean(currentLocation)}
          onSetObserverMode={onSetObserverMode}
          debugToggle={debugToggleButton}
          debugPanel={debugGpsPanel}
          toasts={toasts}
          onDismissToast={onDismissToast}
          onNavigateMap={onNavigateMap}
        >
          <GameMap
            state={gameState}
            myUserId={userId}
            currentLocation={currentLocation}
            constrainViewportToGrid
            onHexClick={onHexClick}
            selectedHex={selectedHex}
            playerDisplayPrefs={playerDisplayPrefs}
            onBoundsChange={setMainMapBounds}
            onHexScreenPosition={setSelectedHexScreenPos}
            navigateRef={mapNavigateRef}
          />
        </PlayingHud>
      </Suspense>
      {combatResult && (
        <CombatModal
          result={combatResult}
          gameMode={gameState.gameMode}
          allowSelfClaim={gameState.allowSelfClaim !== false}
          onReClaim={onReClaim}
          onClose={() => setCombatResult(null)}
        />
      )}
    </>
  );
}
