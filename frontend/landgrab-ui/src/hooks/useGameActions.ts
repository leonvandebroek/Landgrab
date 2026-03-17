import { useGameActionsAbilities } from './useGameActionsAbilities';
import { useGameActionsGameplay } from './useGameActionsGameplay';
import { useGameActionsHost } from './useGameActionsHost';
import { useGameActionsLobby } from './useGameActionsLobby';
import type { UseGameActionsOptions, UseGameActionsResult } from './useGameActions.shared';

export function useGameActions(options: UseGameActionsOptions): UseGameActionsResult {
  const lobbyActions = useGameActionsLobby(options);
  const abilityActions = useGameActionsAbilities(options);
  const hostActions = useGameActionsHost(options);
  const gameplayActions = useGameActionsGameplay({
    ...options,
    handleActivateCommandoRaid: abilityActions.handleActivateCommandoRaid,
  });

  return {
    refreshMyRooms: lobbyActions.refreshMyRooms,
    handleCreateRoom: lobbyActions.handleCreateRoom,
    handleJoinRoom: lobbyActions.handleJoinRoom,
    handleSetAlliance: lobbyActions.handleSetAlliance,
    handleAssignPlayerRole: lobbyActions.handleAssignPlayerRole,
    handleRandomizeRoles: lobbyActions.handleRandomizeRoles,
    handleSetMapLocation: lobbyActions.handleSetMapLocation,
    handleSetTileSize: lobbyActions.handleSetTileSize,
    handleUseCenteredGameArea: lobbyActions.handleUseCenteredGameArea,
    handleSetPatternGameArea: lobbyActions.handleSetPatternGameArea,
    handleSetCustomGameArea: lobbyActions.handleSetCustomGameArea,
    handleSetClaimMode: lobbyActions.handleSetClaimMode,
    handleSetAllowSelfClaim: lobbyActions.handleSetAllowSelfClaim,
    handleSetWinCondition: lobbyActions.handleSetWinCondition,
    handleSetBeaconEnabled: lobbyActions.handleSetBeaconEnabled,
    handleSetTileDecayEnabled: lobbyActions.handleSetTileDecayEnabled,
    handleSetGameDynamics: lobbyActions.handleSetGameDynamics,
    handleSetPlayerRole: lobbyActions.handleSetPlayerRole,
    handleSetAllianceHQ: lobbyActions.handleSetAllianceHQ,
    handleActivateBeacon: abilityActions.handleActivateBeacon,
    handleDeactivateBeacon: abilityActions.handleDeactivateBeacon,
    handleActivateCommandoRaid: abilityActions.handleActivateCommandoRaid,
    handleActivateTacticalStrike: abilityActions.handleActivateTacticalStrike,
    handleActivateReinforce: abilityActions.handleActivateReinforce,
    handleActivateShieldWall: abilityActions.handleActivateShieldWall,
    handleActivateEmergencyRepair: abilityActions.handleActivateEmergencyRepair,
    handleStartDemolish: abilityActions.handleStartDemolish,
    handleSetMasterTile: lobbyActions.handleSetMasterTile,
    handleSetMasterTileByHex: lobbyActions.handleSetMasterTileByHex,
    handleAssignStartingTile: lobbyActions.handleAssignStartingTile,
    handleConfigureAlliances: lobbyActions.handleConfigureAlliances,
    handleDistributePlayers: lobbyActions.handleDistributePlayers,
    handleAssignAllianceStartingTile: lobbyActions.handleAssignAllianceStartingTile,
    handleStartGame: lobbyActions.handleStartGame,
    handleReturnToLobby: lobbyActions.handleReturnToLobby,
    handleSetObserverMode: hostActions.handleSetObserverMode,
    handleUpdateDynamicsLive: hostActions.handleUpdateDynamicsLive,
    handleSendHostMessage: hostActions.handleSendHostMessage,
    handlePauseGame: hostActions.handlePauseGame,
    handleHexClick: gameplayActions.handleHexClick,
    tileActions: gameplayActions.tileActions,
    currentHexActions: gameplayActions.currentHexActions,
    currentHexCell: gameplayActions.currentHexCell,
    handleTileAction: gameplayActions.handleTileAction,
    handleCurrentHexAction: gameplayActions.handleCurrentHexAction,
    handleDismissTileActions: gameplayActions.handleDismissTileActions,
    handleConfirmPickup: gameplayActions.handleConfirmPickup,
    handleConfirmReinforce: gameplayActions.handleConfirmReinforce,
    handleConfirmAttack: gameplayActions.handleConfirmAttack,
    handleCancelAttack: gameplayActions.handleCancelAttack,
    handleReClaimHex: gameplayActions.handleReClaimHex,
    handlePlayAgain: lobbyActions.handlePlayAgain,
  };
}
