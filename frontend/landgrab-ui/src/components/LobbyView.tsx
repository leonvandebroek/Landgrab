import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useUiStore } from '../stores/uiStore';
import { LoadingFallback } from './LoadingFallback';
import type {
  ClaimMode,
  CopresenceMode,
  GameAreaPattern,
  GameDynamics,
  HexCoordinate,
  WinConditionType,
} from '../types/game';
import type { SignalRInvoke } from '../hooks/useAutoResume';

const GameLobby = lazy(() =>
  import('./lobby/GameLobby').then(module => ({ default: module.GameLobby })),
);

interface LocationPoint {
  lat: number;
  lng: number;
}

interface LobbyViewProps {
  connected: boolean;
  currentLocation: LocationPoint | null;
  debugGpsPanel: ReactNode;
  debugToggleButton: ReactNode;
  invoke: SignalRInvoke | null;
  locationError: string | null;
  locationLoading: boolean;
  mapEditorLabel: string;
  onAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onConfigureAlliances: (names: string[]) => void;
  onCreateRoom: () => void;
  onDistributePlayers: () => void;
  onJoinRoom: (code: string) => void;
  onLogout: () => void;
  onOpenMapEditor: () => void;
  onReturnToLobby: () => void;
  onSetAlliance: (name: string) => void;
  onSetAllianceHQ: (q: number, r: number, allianceId: string) => Promise<void>;
  onSetAllowSelfClaim: (allow: boolean) => Promise<void>;
  onSetClaimMode: (mode: ClaimMode) => void;
  onSetCopresenceModes: (modes: CopresenceMode[]) => void;
  onSetCopresencePreset: (preset: string) => void;
  onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
  onSetGameDynamics: (dynamics: GameDynamics) => void;
  onSetMapLocation: (lat: number, lng: number) => void;
  onSetMasterTile: (lat: number, lng: number) => void;
  onSetMasterTileByHex: (q: number, r: number) => void;
  onSetObserverMode: (enabled: boolean) => void;
  onSetPatternGameArea: (pattern: GameAreaPattern) => void;
  onSetPlayerRole: (role: string) => Promise<void>;
  onSetTileSize: (meters: number) => void;
  onSetWinCondition: (type: WinConditionType, value: number) => void;
  onStartGame: () => void;
  onUseCenteredGameArea: () => void;
  token: string;
  userId: string;
  username: string;
}

export function LobbyView({
  connected,
  currentLocation,
  debugGpsPanel,
  debugToggleButton,
  invoke,
  locationError,
  locationLoading,
  mapEditorLabel,
  onAssignAllianceStartingTile,
  onAssignStartingTile,
  onConfigureAlliances,
  onCreateRoom,
  onDistributePlayers,
  onJoinRoom,
  onLogout,
  onOpenMapEditor,
  onReturnToLobby,
  onSetAlliance,
  onSetAllianceHQ,
  onSetAllowSelfClaim,
  onSetClaimMode,
  onSetCopresenceModes,
  onSetCopresencePreset,
  onSetCustomGameArea,
  onSetGameDynamics,
  onSetMapLocation,
  onSetMasterTile,
  onSetMasterTileByHex,
  onSetObserverMode,
  onSetPatternGameArea,
  onSetPlayerRole,
  onSetTileSize,
  onSetWinCondition,
  onStartGame,
  onUseCenteredGameArea,
  token,
  userId,
  username,
}: LobbyViewProps) {
  const gameState = useGameStore(state => state.gameState);
  const myRooms = useGameStore(state => state.myRooms);
  const error = useUiStore(state => state.error);
  const visibleRecentRooms = connected ? myRooms : [];

  return (
    <>
      <Suspense fallback={<LoadingFallback />}>
        <GameLobby
          username={username}
          myUserId={userId}
          authToken={token}
          gameState={gameState}
          connected={connected}
          currentLocation={currentLocation}
          locationError={locationError}
          locationLoading={locationLoading}
          recentRooms={visibleRecentRooms}
          onCreateRoom={onCreateRoom}
          onJoinRoom={onJoinRoom}
          onSetAlliance={onSetAlliance}
          onSetMapLocation={onSetMapLocation}
          onSetTileSize={onSetTileSize}
          onUseCenteredGameArea={onUseCenteredGameArea}
          onSetPatternGameArea={onSetPatternGameArea}
          onSetCustomGameArea={onSetCustomGameArea}
          onSetClaimMode={onSetClaimMode}
          onSetAllowSelfClaim={onSetAllowSelfClaim}
          onSetWinCondition={onSetWinCondition}
          onSetCopresenceModes={onSetCopresenceModes}
          onSetCopresencePreset={onSetCopresencePreset}
          onSetGameDynamics={onSetGameDynamics}
          onSetPlayerRole={onSetPlayerRole}
          onSetAllianceHQ={onSetAllianceHQ}
          onSetMasterTile={onSetMasterTile}
          onSetMasterTileByHex={onSetMasterTileByHex}
          onAssignStartingTile={onAssignStartingTile}
          onConfigureAlliances={onConfigureAlliances}
          onDistributePlayers={onDistributePlayers}
          onAssignAllianceStartingTile={onAssignAllianceStartingTile}
          onStartGame={onStartGame}
          onReturnToLobby={onReturnToLobby}
          onLogout={onLogout}
          onSetObserverMode={onSetObserverMode}
          error={error}
          invoke={invoke ?? undefined}
        />
      </Suspense>
      {!gameState && (
        <button
          type="button"
          className="btn-secondary map-editor-toggle"
          onClick={onOpenMapEditor}
        >
          🗺️ {mapEditorLabel}
        </button>
      )}
      {debugGpsPanel}
      {debugToggleButton}
    </>
  );
}
