using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameService(
    RoomService roomService,
    LobbyService lobbyService,
    AllianceConfigService allianceConfigService,
    MapAreaService mapAreaService,
    GameTemplateService gameTemplateService,
    GameConfigService gameConfigService,
    GameplayService gameplayService,
    AbilityService abilityService,
    DuelService duelService,
    HostControlService hostControlService,
    GameStateService gameStateService,
    WinConditionService winConditionService)
{
    private readonly WinConditionService _winConditionService = winConditionService;
    internal WinConditionService WinConditionService => _winConditionService;

    public GameRoom CreateRoom(string hostUserId, string hostUsername, string connectionId) => roomService.CreateRoom(hostUserId, hostUsername, connectionId);
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
    public (GameState? state, string? error) SetAllowSelfClaim(string roomCode, string userId, bool allow) => gameConfigService.SetAllowSelfClaim(roomCode, userId, allow);
    public (GameState? state, string? error) SetWinCondition(string roomCode, string userId, string winConditionType, int value) => gameConfigService.SetWinCondition(roomCode, userId, winConditionType, value);
    public (GameState? state, string? error) SetCopresenceModes(string roomCode, string userId, List<string> modes) => gameConfigService.SetCopresenceModes(roomCode, userId, modes);
    public (GameState? state, string? error) SetCopresencePreset(string roomCode, string userId, string preset) => gameConfigService.SetCopresencePreset(roomCode, userId, preset);
    public (GameState? state, string? error) SetGameDynamics(string roomCode, string userId, GameDynamics dynamics) => gameConfigService.SetGameDynamics(roomCode, userId, dynamics);
    public (GameState? state, string? error) SetPlayerRole(string roomCode, string userId, string role) => lobbyService.SetPlayerRole(roomCode, userId, role);
    public (GameState? state, string? error) SetAllianceHQ(string roomCode, string userId, int q, int r, string allianceId) => allianceConfigService.SetAllianceHQ(roomCode, userId, q, r, allianceId);
    public (GameState? state, string? error) SetMasterTile(string roomCode, string userId, double lat, double lng) => mapAreaService.SetMasterTile(roomCode, userId, lat, lng);
    public (GameState? state, string? error) SetMasterTileByHex(string roomCode, string userId, int q, int r) => mapAreaService.SetMasterTileByHex(roomCode, userId, q, r);
    public (GameState? state, string? error) AssignStartingTile(string roomCode, string userId, int q, int r, string targetPlayerId) => lobbyService.AssignStartingTile(roomCode, userId, q, r, targetPlayerId);
    public (GameState? state, string? error) StartGame(string roomCode, string userId) => lobbyService.StartGame(roomCode, userId);

    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId) => abilityService.ActivateBeacon(roomCode, userId);
    public (GameState? state, string? error) DeactivateBeacon(string roomCode, string userId) => abilityService.DeactivateBeacon(roomCode, userId);
    public (GameState? state, string? error) ActivateStealth(string roomCode, string userId) => abilityService.ActivateStealth(roomCode, userId);
    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId, int targetQ, int targetR) => abilityService.ActivateCommandoRaid(roomCode, userId, targetQ, targetR);
    public (GameState? state, string? error, PendingDuel? newDuel, (string payerId, int amount, int hexQ, int hexR)? tollPaid, (string hunterId, string preyId, int reward)? preyCaught) UpdatePlayerLocation(string roomCode, string userId, double lat, double lng) => gameplayService.UpdatePlayerLocation(roomCode, userId, lat, lng);
    public (GameState? state, string? error, AmbushResult? ambushResult) PickUpTroops(string roomCode, string userId, int q, int r, int count, double playerLat, double playerLng) => gameplayService.PickUpTroops(roomCode, userId, q, r, count, playerLat, playerLng);
    public (GameState? state, string? error, string? previousOwnerId, CombatResult? combatResult) PlaceTroops(string roomCode, string userId, int q, int r, double playerLat, double playerLng, int? troopCount = null, bool claimForSelf = false) => gameplayService.PlaceTroops(roomCode, userId, q, r, playerLat, playerLng, troopCount, claimForSelf);
    public (GameState? state, string? error) ReClaimHex(string roomCode, string userId, int q, int r, ReClaimMode mode) => gameplayService.ReClaimHex(roomCode, userId, q, r, mode);
    public (GameState? state, string? error) AddReinforcementsToAllHexes(string roomCode) => gameplayService.AddReinforcementsToAllHexes(roomCode);
    public PendingDuel? InitiateDuel(string roomCode, string challengerId, string targetId, int q, int r) => duelService.InitiateDuel(roomCode, challengerId, targetId, q, r);
    public (bool success, string? winnerId, string? loserId) ResolveDuel(string roomCode, string duelId, bool accepted) => duelService.ResolveDuel(roomCode, duelId, accepted);
    public (GameState? state, string? error) DetainPlayer(string roomCode, string detainerId, string targetId) => duelService.DetainPlayer(roomCode, detainerId, targetId);
    public void ProcessHostageReleases(GameRoom room) => duelService.ProcessHostageReleases(room);
    public void ProcessDuelExpiry(GameRoom room) => duelService.ProcessDuelExpiry(room);

    public void AppendEventLogPublic(GameState state, GameEventLogEntry entry) => gameStateService.AppendEventLog(state, entry);
    public GameState SnapshotStatePublic(GameState state) => gameStateService.SnapshotState(state);
    public GameState GetPlayerSnapshot(GameState fullSnapshot, string userId) => gameStateService.GetPlayerSnapshot(fullSnapshot, userId);
    public GameState GetPlayerSnapshot(GameState fullSnapshot, string userId, IReadOnlyDictionary<string, HexCell> hiddenFogCells) => gameStateService.GetPlayerSnapshot(fullSnapshot, userId, hiddenFogCells);
    public IReadOnlyDictionary<string, HexCell> CreateHiddenFogCellsForBroadcast(GameState fullSnapshot) => gameStateService.CreateHiddenFogCellsForBroadcast(fullSnapshot);

    public (GameState? state, string? error) SetHostObserverMode(string roomCode, string userId, bool enabled) => hostControlService.SetHostObserverMode(roomCode, userId, enabled);
    public (GameState? state, string? error) UpdateGameDynamicsLive(string roomCode, string userId, GameDynamics dynamics) => hostControlService.UpdateGameDynamicsLive(roomCode, userId, dynamics);
    public (GameState? state, string? error) TriggerGameEvent(string roomCode, string userId, string eventType, int? targetQ, int? targetR, string? targetAllianceId) => hostControlService.TriggerGameEvent(roomCode, userId, eventType, targetQ, targetR, targetAllianceId);
    public (GameState? state, string? error) SendHostMessage(string roomCode, string userId, string message, List<string>? targetAllianceIds) => hostControlService.SendHostMessage(roomCode, userId, message, targetAllianceIds);
    public (GameState? state, string? error) PauseGame(string roomCode, string userId, bool paused) => hostControlService.PauseGame(roomCode, userId, paused);

    public List<string> GetAllianceConnectionIds(GameRoom room, List<string> allianceIds) => gameStateService.GetAllianceConnectionIds(room, allianceIds);
}
