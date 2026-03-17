import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionBanner } from './ConnectionBanner';
import { GameIcon } from './common/GameIcon';
import { LoadingFallback } from './LoadingFallback';
import { useGameStore } from '../stores/gameStore';
import { useUiStore } from '../stores/uiStore';
import type {
  ClaimMode,
  GameAreaPattern,
  GameDynamics,
  HexCoordinate,
  RoomSummary,
  WinConditionType,
} from '../types/game';

// GameLobby is large – keep the same lazy split as the original App.
const GameLobby = lazy(() =>
  import('./lobby/GameLobby').then(m => ({ default: m.GameLobby }))
);

type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

interface LocationPoint {
  lat: number;
  lng: number;
}

/** All lobby-specific action callbacks sourced from useGameActions in App. */
export interface LobbyViewActions {
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onSetAlliance: (name: string) => void;
  onAssignPlayerRole: (targetPlayerId: string, role: string) => void;
  onRandomizeRoles: () => void;
  onSetMapLocation: (lat: number, lng: number) => void;
  onSetTileSize: (meters: number) => void;
  onUseCenteredGameArea: () => void;
  onSetPatternGameArea: (pattern: GameAreaPattern) => void;
  onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
  onSetClaimMode: (mode: ClaimMode) => void;
  onSetAllowSelfClaim: (allow: boolean) => Promise<void>;
  onSetWinCondition: (type: WinConditionType, value: number) => void;
  onSetBeaconEnabled: (enabled: boolean) => void;
  onSetTileDecayEnabled: (enabled: boolean) => void;
  onSetGameDynamics: (dynamics: GameDynamics) => void;
  onSetPlayerRole: (role: string) => Promise<void>;
  onSetAllianceHQ: (q: number, r: number, allianceId: string) => Promise<void>;
  onSetMasterTile: (lat: number, lng: number) => void;
  onSetMasterTileByHex: (q: number, r: number) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onConfigureAlliances: (names: string[]) => void;
  onDistributePlayers: () => void;
  onAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  onStartGame: () => void;
  onReturnToLobby: () => void;
  onSetObserverMode: (enabled: boolean) => void;
}

export interface LobbyViewProps {
  /** Pre-formatted banner text; empty string means no banner. */
  connectionBanner: string;
  username: string;
  userId: string;
  authToken: string;
  connected: boolean;
  currentLocation: LocationPoint | null;
  effectiveLocationError: string | null;
  effectiveLocationLoading: boolean;
  visibleRecentRooms: RoomSummary[];
  invoke: SignalRInvoke;
  /** Handles full logout sequence including session/state cleanup. */
  onLogout: () => void;
  /** Rendered by the debug GPS panel slot (may be null). */
  debugPanel: ReactNode;
  /** Rendered by the debug-tools toggle button slot (may be null). */
  debugToggle: ReactNode;
  actions: LobbyViewActions;
}

/**
 * Renders the lobby UI (view === 'lobby' fallthrough in App).
 *
 * Reads `gameState` and `error` directly from Zustand stores; reads `setView`
 * from uiStore for the map-editor shortcut button.
 */
export function LobbyView({
  connectionBanner,
  username,
  userId,
  authToken,
  connected,
  currentLocation,
  effectiveLocationError,
  effectiveLocationLoading,
  visibleRecentRooms,
  invoke,
  onLogout,
  debugPanel,
  debugToggle,
  actions,
}: LobbyViewProps) {
  const { t } = useTranslation();
  const gameState = useGameStore(state => state.gameState);
  const error = useUiStore(state => state.error);
  const setView = useUiStore(state => state.setView);

  return (
    <>
      {connectionBanner && <ConnectionBanner message={connectionBanner} />}
      <Suspense fallback={<LoadingFallback />}>
        <GameLobby
          username={username}
          myUserId={userId}
          authToken={authToken}
          gameState={gameState}
          connected={connected}
          currentLocation={currentLocation}
          locationError={effectiveLocationError}
          locationLoading={effectiveLocationLoading}
          recentRooms={visibleRecentRooms}
          onCreateRoom={actions.onCreateRoom}
          onJoinRoom={actions.onJoinRoom}
          onSetAlliance={actions.onSetAlliance}
          onAssignPlayerRole={actions.onAssignPlayerRole}
          onRandomizeRoles={actions.onRandomizeRoles}
          onSetMapLocation={actions.onSetMapLocation}
          onSetTileSize={actions.onSetTileSize}
          onUseCenteredGameArea={actions.onUseCenteredGameArea}
          onSetPatternGameArea={actions.onSetPatternGameArea}
          onSetCustomGameArea={actions.onSetCustomGameArea}
          onSetClaimMode={actions.onSetClaimMode}
          onSetAllowSelfClaim={actions.onSetAllowSelfClaim}
          onSetWinCondition={actions.onSetWinCondition}
          onSetBeaconEnabled={actions.onSetBeaconEnabled}
          onSetTileDecayEnabled={actions.onSetTileDecayEnabled}
          onSetGameDynamics={actions.onSetGameDynamics}
          onSetPlayerRole={actions.onSetPlayerRole}
          onSetAllianceHQ={actions.onSetAllianceHQ}
          onSetMasterTile={actions.onSetMasterTile}
          onSetMasterTileByHex={actions.onSetMasterTileByHex}
          onAssignStartingTile={actions.onAssignStartingTile}
          onConfigureAlliances={actions.onConfigureAlliances}
          onDistributePlayers={actions.onDistributePlayers}
          onAssignAllianceStartingTile={actions.onAssignAllianceStartingTile}
          onStartGame={actions.onStartGame}
          onReturnToLobby={actions.onReturnToLobby}
          onLogout={onLogout}
          onSetObserverMode={actions.onSetObserverMode}
          error={error}
          invoke={invoke}
        />
      </Suspense>

      {/* Map-editor shortcut – only shown when not already in a game. */}
      {!gameState && (
        <button
          type="button"
          className="btn-secondary map-editor-toggle"
          data-testid="lobby-map-editor-toggle"
          onClick={() => setView('mapEditor')}
        >
          <GameIcon name="treasureMap" /> {t('mapEditor.title')}
        </button>
      )}

      {debugPanel}
      {debugToggle}
    </>
  );
}
