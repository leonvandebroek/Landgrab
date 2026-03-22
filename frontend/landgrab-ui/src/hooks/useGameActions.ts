import { useGameActionsAbilities } from './useGameActionsAbilities';
import { useGameActionsGameplay } from './useGameActionsGameplay';
import { useGameActionsHost } from './useGameActionsHost';
import { useGameActionsLobby } from './useGameActionsLobby';
import type { UseGameActionsOptions, UseGameActionsResult } from './useGameActions.shared';

export function useGameActions(options: UseGameActionsOptions): UseGameActionsResult {
  const lobbyActions = useGameActionsLobby(options);
  const abilityActions = useGameActionsAbilities(options);
  const hostActions = useGameActionsHost(options);
  const gameplayActions = useGameActionsGameplay(options);

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
    handleSetWinCondition: lobbyActions.handleSetWinCondition,
    handleSetBeaconEnabled: lobbyActions.handleSetBeaconEnabled,
    handleSetTileDecayEnabled: lobbyActions.handleSetTileDecayEnabled,
    handleSetEnemySightingMemory: lobbyActions.handleSetEnemySightingMemory,
    handleSetGameDynamics: lobbyActions.handleSetGameDynamics,
    handleSetPlayerRole: lobbyActions.handleSetPlayerRole,
    handleSetAllianceHQ: lobbyActions.handleSetAllianceHQ,
    handleActivateBeacon: abilityActions.handleActivateBeacon,
    handleDeactivateBeacon: abilityActions.handleDeactivateBeacon,
    handleShareBeaconIntel: abilityActions.handleShareBeaconIntel,
    handleActivateCommandoRaid: abilityActions.handleActivateCommandoRaid,
    handleActivateTacticalStrike: abilityActions.handleActivateTacticalStrike,
    handleActivateRallyPoint: abilityActions.handleActivateRallyPoint,
    handleActivateSabotage: abilityActions.handleActivateSabotage,
    handleCancelFortConstruction: abilityActions.handleCancelFortConstruction,
    handleCancelSabotage: abilityActions.handleCancelSabotage,
    handleCancelDemolish: abilityActions.handleCancelDemolish,
    handleStartDemolish: abilityActions.handleStartDemolish,
    handleStartFortConstruction: abilityActions.handleStartFortConstruction,
    attemptIntercept: abilityActions.attemptIntercept,
    resolveRaidTarget: abilityActions.resolveRaidTarget,
    resolveTacticalStrikeTarget: abilityActions.resolveTacticalStrikeTarget,
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
    handleDeployCombatTroops: gameplayActions.handleDeployCombatTroops,
    handleDeployNeutralClaimTroops: gameplayActions.handleDeployNeutralClaimTroops,
    handleCancelAttack: gameplayActions.handleCancelAttack,
    handlePlayAgain: lobbyActions.handlePlayAgain,
  };
}
