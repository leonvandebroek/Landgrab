using System;
using System.Collections.Generic;
using Landgrab.Api.Models;
using Landgrab.Api.Services.Abilities;

namespace Landgrab.Api.Services;

public class GameService(
    RoomService roomService,
    LobbyService lobbyService,
    AllianceConfigService allianceConfigService,
    MapAreaService mapAreaService,
    GameTemplateService gameTemplateService,
    GameConfigService gameConfigService,
    GameplayService gameplayService,
    CommanderAbilityService commanderAbilityService,
    ScoutAbilityService scoutAbilityService,
    EngineerAbilityService engineerAbilityService,
    SharedAbilityService sharedAbilityService,
    HostControlService hostControlService,
    GameStateService gameStateService,
    WinConditionService winConditionService)
{
    private readonly WinConditionService _winConditionService = winConditionService;
    internal WinConditionService WinConditionService => _winConditionService;

    public GameRoom CreateRoom(string hostUserId, string hostUsername, string connectionId) => roomService.CreateRoom(hostUserId, hostUsername, connectionId);
    public GameRoom CreateScenarioRoom(string hostUserId, InjectScenarioRequest req) => roomService.CreateScenarioRoom(hostUserId, req);
    public (GameRoom? room, string? error) JoinRoom(string roomCode, string userId, string username, string connectionId) => roomService.JoinRoom(roomCode, userId, username, connectionId);
    public GameRoom? GetRoom(string code) => roomService.GetRoom(code);
    public GameState? GetStateSnapshot(string roomCode) => gameStateService.GetStateSnapshot(roomCode);
    public GameRoom? GetRoomByConnection(string connectionId) => roomService.GetRoomByConnection(connectionId);
    public GameRoom? GetRoomByUserId(string userId, string? roomCode = null) => roomService.GetRoomByUserId(userId, roomCode);
    public int RestoreRooms(IEnumerable<GameRoom> rooms) => roomService.RestoreRooms(rooms);
    public IReadOnlyList<RoomSummaryDto> GetRoomsForUser(string userId) => roomService.GetRoomsForUser(userId);
    public IReadOnlyList<string> GetPlayingRoomCodes() => roomService.GetPlayingRoomCodes();
    public void RemoveConnection(GameRoom room, string connectionId, bool returnedToLobby = false) => roomService.RemoveConnection(room, connectionId, returnedToLobby);

    public (GameState? state, string? error) SetAlliance(string roomCode, string userId, string allianceName) => allianceConfigService.SetAlliance(roomCode, userId, allianceName);
    public (GameState? state, string? error) ConfigureAlliances(string roomCode, string userId, List<string> allianceNames) => allianceConfigService.ConfigureAlliances(roomCode, userId, allianceNames);
    public (GameState? state, string? error) DistributePlayersRandomly(string roomCode, string userId) => allianceConfigService.DistributePlayersRandomly(roomCode, userId);
    public (GameState? state, string? error) AssignAllianceStartingTile(string roomCode, string userId, int q, int r, string allianceId) => allianceConfigService.AssignAllianceStartingTile(roomCode, userId, q, r, allianceId);
    public (GameState? state, string? error) SetMapLocation(string roomCode, string userId, double lat, double lng) => mapAreaService.SetMapLocation(roomCode, userId, lat, lng);
    public (GameState? state, string? error) SetTileSize(string roomCode, string userId, int meters) => mapAreaService.SetTileSize(roomCode, userId, meters);
    public (bool success, string? error) SetHostBypassGps(string roomCode, string userId, bool bypass) => mapAreaService.SetHostBypassGps(roomCode, userId, bypass);
    public (bool success, string? error) SetMaxFootprint(string roomCode, string userId, int meters) => mapAreaService.SetMaxFootprint(roomCode, userId, meters);
    public Task<(bool success, string? error)> LoadMapTemplate(string roomCode, string userId, Guid templateId, IServiceScopeFactory scopeFactory)
    {
        _ = scopeFactory;
        return gameTemplateService.LoadMapTemplate(roomCode, userId, templateId);
    }

    public Task<(bool success, string? error, Guid? templateId)> SaveCurrentAreaAsTemplate(string roomCode, string userId, string name, string? description, IServiceScopeFactory scopeFactory)
    {
        _ = scopeFactory;
        return gameTemplateService.SaveCurrentAreaAsTemplate(roomCode, userId, name, description);
    }

    public (GameState? state, string? error) UseCenteredGameArea(string roomCode, string userId) => mapAreaService.UseCenteredGameArea(roomCode, userId);
    public (GameState? state, string? error) SetPatternGameArea(string roomCode, string userId, string pattern) => mapAreaService.SetPatternGameArea(roomCode, userId, pattern);
    public (GameState? state, string? error) SetCustomGameArea(string roomCode, string userId, IReadOnlyList<HexCoordinateDto> coordinates) => mapAreaService.SetCustomGameArea(roomCode, userId, coordinates);
    public (GameState? state, string? error) SetClaimMode(string roomCode, string userId, string claimMode) => gameConfigService.SetClaimMode(roomCode, userId, claimMode);
public (GameState? state, string? error) SetWinCondition(string roomCode, string userId, string winConditionType, int value) => gameConfigService.SetWinCondition(roomCode, userId, winConditionType, value);
    public (GameState? state, string? error) SetFieldBattleResolutionMode(string roomCode, string userId, string mode) => gameConfigService.SetFieldBattleResolutionMode(roomCode, userId, mode);
    public (GameState? state, string? error) SetBeaconEnabled(string roomCode, string userId, bool enabled) => gameConfigService.SetBeaconEnabled(roomCode, userId, enabled);
    public (GameState? state, string? error) SetTileDecayEnabled(string roomCode, string userId, bool enabled) => gameConfigService.SetTileDecayEnabled(roomCode, userId, enabled);
    public (GameState? state, string? error) SetEnemySightingMemory(string roomCode, string userId, int seconds) => gameConfigService.SetEnemySightingMemory(roomCode, userId, seconds);
    public (GameState? state, string? error) SetGameDynamics(string roomCode, string userId, GameDynamics dynamics) => gameConfigService.SetGameDynamics(roomCode, userId, dynamics);
    public (GameState? state, string? error) SetPlayerRole(string roomCode, string userId, string role) => lobbyService.SetPlayerRole(roomCode, userId, role);
    public (GameState? state, string? error) AssignPlayerRole(string roomCode, string userId, string targetPlayerId, string role) => lobbyService.AssignPlayerRole(roomCode, userId, targetPlayerId, role);
    public (GameState? state, string? error) RandomizeRoles(string roomCode, string userId) => lobbyService.RandomizeRoles(roomCode, userId);
    public (GameState? state, string? error) SetWizardStep(string roomCode, string userId, int step) => lobbyService.SetWizardStep(roomCode, userId, step);
    public (GameState? state, string? error) SetAllianceHQ(string roomCode, string userId, int q, int r, string allianceId) => allianceConfigService.SetAllianceHQ(roomCode, userId, q, r, allianceId);
    public (GameState? state, string? error) SetMasterTile(string roomCode, string userId, double lat, double lng) => mapAreaService.SetMasterTile(roomCode, userId, lat, lng);
    public (GameState? state, string? error) SetMasterTileByHex(string roomCode, string userId, int q, int r) => mapAreaService.SetMasterTileByHex(roomCode, userId, q, r);
    public (GameState? state, string? error) AssignStartingTile(string roomCode, string userId, int q, int r, string targetPlayerId) => lobbyService.AssignStartingTile(roomCode, userId, q, r, targetPlayerId);
    public (GameState? state, string? error) StartGame(string roomCode, string userId) => lobbyService.StartGame(roomCode, userId);

    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId, double heading) => scoutAbilityService.ActivateBeacon(roomCode, userId, heading);
    public (GameState? state, string? error) DeactivateBeacon(string roomCode, string userId) => scoutAbilityService.DeactivateBeacon(roomCode, userId);
    public (int sharedCount, string? error) ShareBeaconIntel(string roomCode, string userId, IEnumerable<string> hexKeys)
    {
        _ = hexKeys;
        return scoutAbilityService.ShareBeaconIntel(roomCode, userId);
    }
    public ((int targetQ, int targetR)? target, string? error) ResolveRaidTarget(string roomCode, string userId, double heading) => commanderAbilityService.ResolveRaidTarget(roomCode, userId, heading);
    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId) => commanderAbilityService.ActivateCommandoRaid(roomCode, userId);
    public ((int targetQ, int targetR)? target, string? error) ResolveTacticalStrikeTarget(string roomCode, string userId, double heading) => commanderAbilityService.ResolveTacticalStrikeTarget(roomCode, userId, heading);
    public (GameState? state, string? error) ActivateTacticalStrike(string roomCode, string userId, int targetQ, int targetR) => commanderAbilityService.ActivateTacticalStrike(roomCode, userId, targetQ, targetR);
    public ((string id, string name)? target, string? error) ResolveTroopTransferTarget(string roomCode, string userId, double heading)
        => sharedAbilityService.ResolveTroopTransferTarget(roomCode, userId, heading);
    public (Guid? transferId, string? error) InitiateTroopTransfer(string roomCode, string userId, int amount, string recipientId)
        => sharedAbilityService.InitiateTroopTransfer(roomCode, userId, amount, recipientId);
    public (GameState? state, string? error) RespondToTroopTransfer(string roomCode, string userId, Guid transferId, bool accepted)
        => sharedAbilityService.RespondToTroopTransfer(roomCode, userId, transferId, accepted);
    public (ActiveFieldBattle? battle, string? error) InitiateFieldBattle(string roomCode, string userId)
        => sharedAbilityService.InitiateFieldBattle(roomCode, userId);
    public string? JoinFieldBattle(string roomCode, string userId, Guid battleId)
        => sharedAbilityService.JoinFieldBattle(roomCode, userId, battleId);
    public (GameState? state, FieldBattleResultDto? result, string? error) ResolveFieldBattle(string roomCode, Guid battleId)
        => sharedAbilityService.ResolveFieldBattle(roomCode, battleId);
    public (GameState? state, string? error) ActivateRallyPoint(string roomCode, string userId) => commanderAbilityService.ActivateRallyPoint(roomCode, userId);
    public (GameState? state, string? error) ActivateShieldWall(string roomCode, string userId) => commanderAbilityService.ActivateShieldWall(roomCode, userId);
    public (GameState? state, string? error) StartFortConstruction(string roomCode, string userId) => engineerAbilityService.StartFortConstruction(roomCode, userId);
    public (GameState? state, string? error) CancelFortConstruction(string roomCode, string userId) => engineerAbilityService.CancelFortConstruction(roomCode, userId);
    public (GameState? state, string? error) ActivateSabotage(string roomCode, string userId) => engineerAbilityService.ActivateSabotage(roomCode, userId);
    public (GameState? state, string? error) CancelSabotage(string roomCode, string userId) => engineerAbilityService.CancelSabotage(roomCode, userId);
    public (GameState? state, string? error) StartDemolish(string roomCode, string userId) => engineerAbilityService.StartDemolish(roomCode, userId);
    public (GameState? state, string? error) CancelDemolish(string roomCode, string userId) => engineerAbilityService.CancelDemolish(roomCode, userId);
    public (InterceptAttemptResult? result, string? error) AttemptIntercept(string roomCode, string userId, double heading) => scoutAbilityService.AttemptIntercept(roomCode, userId, heading);
    public (GameState? state, string? error, bool gridChanged, bool playerHexChanged) UpdatePlayerLocation(string roomCode, string userId, double lat, double lng, double? heading)
    {
        return gameplayService.UpdatePlayerLocation(roomCode, userId, lat, lng, heading);
    }

    public (GameState? state, string? error) PickUpTroops(string roomCode, string userId, int q, int r, int count, double playerLat, double playerLng)
    {
        return gameplayService.PickUpTroops(roomCode, userId, q, r, count, playerLat, playerLng);
    }

    public (CombatPreviewDto? preview, string? error) GetCombatPreview(string roomCode, string userId, int q, int r)
    {
        return gameplayService.GetCombatPreview(roomCode, userId, q, r);
    }

    public (GameState? state, string? error, string? previousOwnerId, CombatResult? combatResult) PlaceTroops(string roomCode, string userId, int q, int r, double playerLat, double playerLng, int? troopCount = null) => gameplayService.PlaceTroops(roomCode, userId, q, r, playerLat, playerLng, troopCount);
    public GameplayService.ReinforcementTickResult AddReinforcementsToAllHexes(string roomCode) => gameplayService.AddReinforcementsToAllHexes(roomCode);
    public (GameState? state, string? error) ResolveExpiredCommandoRaids(string roomCode) => gameplayService.ResolveExpiredCommandoRaids(roomCode);
    public void ResolveExpiredRallyPoints(string roomCode) => gameplayService.ResolveExpiredRallyPoints(roomCode);
    public void ResolveActiveSabotages(string roomCode) => gameplayService.ResolveActiveSabotages(roomCode);

    public void AppendEventLogPublic(GameState state, GameEventLogEntry entry) => gameStateService.AppendEventLog(state, entry);
    public GameState SnapshotStatePublic(GameState state) => gameStateService.SnapshotState(state);

    public (GameState? state, string? error) SetHostObserverMode(string roomCode, string userId, bool enabled) => hostControlService.SetHostObserverMode(roomCode, userId, enabled);
    public (GameState? state, string? error) UpdateGameDynamicsLive(string roomCode, string userId, GameDynamics dynamics) => hostControlService.UpdateGameDynamicsLive(roomCode, userId, dynamics);
    public (GameState? state, string? error) SendHostMessage(string roomCode, string userId, string message, List<string>? targetAllianceIds) => hostControlService.SendHostMessage(roomCode, userId, message, targetAllianceIds);
    public (GameState? state, string? error) PauseGame(string roomCode, string userId, bool paused) => hostControlService.PauseGame(roomCode, userId, paused);

    public List<string> GetAllianceConnectionIds(GameRoom room, List<string> allianceIds) => gameStateService.GetAllianceConnectionIds(room, allianceIds);
}
