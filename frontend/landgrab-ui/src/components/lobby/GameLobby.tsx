import { useCallback, useEffect, useState } from 'react';
import type { ClaimMode, GameAreaPattern, GameDynamics, GameState, HexCoordinate, RoomSummary, WinConditionType } from '../../types/game';
import { HomeScreen } from './HomeScreen';
import { RoomScreen } from './RoomScreen';
import { SettingsScreen } from './SettingsScreen';

interface LocationPoint {
  lat: number;
  lng: number;
}

interface Props {
  username: string;
  myUserId: string;
  authToken: string;
  gameState: GameState | null;
  connected: boolean;
  currentLocation: LocationPoint | null;
  locationError: string | null;
  locationLoading: boolean;
  recentRooms: RoomSummary[];
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
  onSetWinCondition: (type: WinConditionType, value: number) => void;
  onSetBeaconEnabled: (enabled: boolean) => void;
  onSetTileDecayEnabled: (enabled: boolean) => void;
  onSetEnemySightingMemory: (seconds: number) => void;
  onSetGameDynamics: (dynamics: GameDynamics) => void;
  onSetPlayerRole?: (role: string) => void;
  onSetMasterTile: (lat: number, lng: number) => void;
  onSetMasterTileByHex: (q: number, r: number) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onSetAllianceHQ?: (q: number, r: number, allianceId: string) => void;
  onConfigureAlliances: (names: string[]) => void;
  onDistributePlayers: () => void;
  onSetVirtualPlayerCount: (count: number) => void;
  onAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  onStartGame: () => void;
  onReturnToLobby: () => void;
  onLogout: () => void;
  onSetObserverMode?: (enabled: boolean) => void;
  error: string;
  invoke?: (method: string, ...args: unknown[]) => Promise<unknown>;
}

const ROOM_STEP = 1;
const SETTINGS_STEP = 2;

/**
 * Lobby router: home (no room), game room (host step 1 and every guest) and
 * game settings (host step 2). The step is synced with the server so guests
 * can see what the host is doing.
 */
export function GameLobby(props: Props) {
  const { gameState, myUserId, invoke } = props;
  const me = gameState?.players.find((player) => player.id === myUserId);
  const isHost = me?.isHost ?? false;
  const [localStep, setLocalStep] = useState<number | null>(null);

  const serverStep = gameState?.currentWizardStep;
  const step = localStep ?? (typeof serverStep === 'number' ? serverStep : ROOM_STEP);

  const goToStep = useCallback((next: number) => {
    setLocalStep(next);
    if (!invoke) return;
    void invoke('SetWizardStep', next)
      .catch((cause) => {
        console.error('Failed to sync the room step with the server.', cause);
        setLocalStep(null);
      });
  }, [invoke]);

  // Drop the optimistic step once the server confirms it.
  useEffect(() => {
    if (localStep !== null && serverStep === localStep) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocalStep(null);
    }
  }, [localStep, serverStep]);

  if (!gameState) {
    return (
      <HomeScreen
        username={props.username}
        connected={props.connected}
        recentRooms={props.recentRooms}
        error={props.error}
        onCreateRoom={props.onCreateRoom}
        onJoinRoom={props.onJoinRoom}
        onLogout={props.onLogout}
      />
    );
  }

  if (isHost && step >= SETTINGS_STEP) {
    return (
      <SettingsScreen
        gameState={gameState}
        myUserId={myUserId}
        authToken={props.authToken}
        currentLocation={props.currentLocation}
        locationError={props.locationError}
        locationLoading={props.locationLoading}
        error={props.error}
        onBack={() => goToStep(ROOM_STEP)}
        onSetMapLocation={props.onSetMapLocation}
        onSetTileSize={props.onSetTileSize}
        onUseCenteredGameArea={props.onUseCenteredGameArea}
        onSetPatternGameArea={props.onSetPatternGameArea}
        onSetCustomGameArea={props.onSetCustomGameArea}
        onSetClaimMode={props.onSetClaimMode}
        onSetWinCondition={props.onSetWinCondition}
        onSetBeaconEnabled={props.onSetBeaconEnabled}
        onSetTileDecayEnabled={props.onSetTileDecayEnabled}
        onSetEnemySightingMemory={props.onSetEnemySightingMemory}
        onSetGameDynamics={props.onSetGameDynamics}
        onAssignPlayerRole={props.onAssignPlayerRole}
        onRandomizeRoles={props.onRandomizeRoles}
        onSetMasterTileByHex={props.onSetMasterTileByHex}
        onAssignStartingTile={props.onAssignStartingTile}
        onSetAllianceHQ={props.onSetAllianceHQ}
        onSetObserverMode={props.onSetObserverMode}
        onStartGame={props.onStartGame}
        invoke={invoke}
      />
    );
  }

  return (
    <RoomScreen
      gameState={gameState}
      myUserId={myUserId}
      error={props.error}
      onSetAlliance={props.onSetAlliance}
      onConfigureAlliances={props.onConfigureAlliances}
      onDistributePlayers={props.onDistributePlayers}
      onSetVirtualPlayerCount={props.onSetVirtualPlayerCount}
      onSetPlayerRole={props.onSetPlayerRole}
      onNext={() => goToStep(SETTINGS_STEP)}
      onLeave={props.onReturnToLobby}
    />
  );
}
