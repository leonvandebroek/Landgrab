import type { MutableRefObject, RefObject } from 'react';
import type { TFunction } from 'i18next';
import type { TileAction, TileActionType } from '../components/game/tileInteraction';
import { roomHexToLatLng } from '../components/map/HexMath';
import type {
  AuthState,
  ClaimMode,
  GameAreaPattern,
  GameDynamics,
  GameState,
  HexCell,
  HexCoordinate,
  Player,
  WinConditionType,
} from '../types/game';
import type { SoundName } from './useSound';

export type SignalRInvoke = <T = void>(method: string, ...args: unknown[]) => Promise<T>;

export interface LocationPoint {
  lat: number;
  lng: number;
}

export interface UseGameActionsOptions {
  invoke: SignalRInvoke | null;
  auth: AuthState | null;
  connected: boolean;
  autoResuming: boolean;
  pendingResumeRef: MutableRefObject<unknown | null>;
  gameState: GameState | null;
  currentLocation: LocationPoint | null;
  currentHeadingRef: RefObject<number | null>;
  currentHex: [number, number] | null;
  myPlayer: Player | null;
  isHostBypass: boolean;
  t: TFunction;
  playSound: (name: SoundName) => void;
  clearSession: () => void;
}

export interface UseGameActionsResult {
  refreshMyRooms: () => Promise<void>;
  handleCreateRoom: () => void;
  handleJoinRoom: (code: string) => void;
  handleSetAlliance: (name: string) => void;
  handleAssignPlayerRole: (targetPlayerId: string, role: string) => void;
  handleRandomizeRoles: () => void;
  handleSetMapLocation: (lat: number, lng: number) => void;
  handleSetTileSize: (meters: number) => void;
  handleUseCenteredGameArea: () => void;
  handleSetPatternGameArea: (pattern: GameAreaPattern) => void;
  handleSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
  handleSetClaimMode: (mode: ClaimMode) => void;
  handleSetWinCondition: (type: WinConditionType, value: number) => void;
  handleSetBeaconEnabled: (enabled: boolean) => void;
  handleSetTileDecayEnabled: (enabled: boolean) => void;
  handleSetEnemySightingMemory: (seconds: number) => void;
  handleSetGameDynamics: (dynamics: GameDynamics) => void;
  handleSetPlayerRole: (role: string) => Promise<void>;
  handleSetAllianceHQ: (q: number, r: number, allianceId: string) => Promise<void>;
  handleActivateBeacon: (heading: number) => Promise<boolean>;
  handleDeactivateBeacon: () => Promise<boolean>;
  handleActivateCommandoRaid: (targetQ: number, targetR: number) => Promise<boolean>;
  handleActivateTacticalStrike: (targetQ: number, targetR: number) => Promise<boolean>;
  handleActivateRallyPoint: () => Promise<boolean>;
  handleActivateSabotage: () => Promise<boolean>;
  handleCancelFortConstruction: () => Promise<boolean>;
  handleCancelSabotage: () => Promise<boolean>;
  handleCancelDemolish: () => Promise<boolean>;
  handleStartDemolish: () => Promise<boolean>;
  handleStartFortConstruction: () => Promise<boolean>;
  attemptIntercept: (heading: number) => Promise<{ status: string; seconds?: number }>;
  resolveRaidTarget?: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  resolveTacticalStrikeTarget?: (heading: number) => Promise<{ targetQ: number; targetR: number } | null>;
  handleSetMasterTile: (lat: number, lng: number) => void;
  handleSetMasterTileByHex: (q: number, r: number) => void;
  handleAssignStartingTile: (q: number, r: number, playerId: string) => void;
  handleConfigureAlliances: (names: string[]) => void;
  handleDistributePlayers: () => void;
  handleAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  handleStartGame: () => void;
  handleReturnToLobby: () => void;
  handleSetObserverMode: (enabled: boolean) => void;
  handleUpdateDynamicsLive: (dynamics: GameDynamics) => void;
  handleSendHostMessage: (message: string, allianceIds?: string[]) => void;
  handlePauseGame: (paused: boolean) => void;
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
  handlePlayAgain: () => void;
}

export interface ResolvedActionCoordinates {
  lat: number;
  lng: number;
}

export function resolveActionCoordinates(
  targetHex: [number, number],
  gameState: GameState | null,
  currentLocation: LocationPoint | null,
  isHostBypass: boolean,
): ResolvedActionCoordinates | null {
  if (isHostBypass && gameState && gameState.mapLat != null && gameState.mapLng != null) {
    const [lat, lng] = roomHexToLatLng(
      targetHex[0],
      targetHex[1],
      gameState.mapLat,
      gameState.mapLng,
      gameState.tileSizeMeters,
    );

    return { lat, lng };
  }

  if (!currentLocation) {
    return null;
  }

  return {
    lat: currentLocation.lat,
    lng: currentLocation.lng,
  };
}

export type RefreshMyRooms = () => Promise<void>;
