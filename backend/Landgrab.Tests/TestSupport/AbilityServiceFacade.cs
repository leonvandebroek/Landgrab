using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Api.Services.Abilities;

namespace Landgrab.Tests.TestSupport;

/// <summary>
/// Test-only facade that aggregates the four concrete ability services behind
/// the same method surface the old monolithic AbilityService exposed.
/// Keeps existing test code unchanged after the Phase 2 refactor.
/// </summary>
internal sealed class AbilityServiceFacade(
    CommanderAbilityService commander,
    ScoutAbilityService scout,
    EngineerAbilityService engineer,
    SharedAbilityService shared)
{
    // ── Scout ────────────────────────────────────────────────────────────────
    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId, double heading)
        => scout.ActivateBeacon(roomCode, userId, heading);

    public (GameState? state, string? error) DeactivateBeacon(string roomCode, string userId)
        => scout.DeactivateBeacon(roomCode, userId);

    public (int sharedCount, string? error) ShareBeaconIntel(string roomCode, string userId)
        => scout.ShareBeaconIntel(roomCode, userId);

    public (InterceptAttemptResult? result, string? error) AttemptIntercept(string roomCode, string userId, double heading)
        => scout.AttemptIntercept(roomCode, userId, heading);

    // ── Commander ────────────────────────────────────────────────────────────
    public ((int targetQ, int targetR)? target, string? error) ResolveRaidTarget(string roomCode, string userId, double heading)
        => commander.ResolveRaidTarget(roomCode, userId, heading);

    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId)
        => commander.ActivateCommandoRaid(roomCode, userId);

    public ((int targetQ, int targetR)? target, string? error) ResolveTacticalStrikeTarget(string roomCode, string userId, double heading)
        => commander.ResolveTacticalStrikeTarget(roomCode, userId, heading);

    public (GameState? state, string? error) ActivateTacticalStrike(string roomCode, string userId, int targetQ, int targetR)
        => commander.ActivateTacticalStrike(roomCode, userId, targetQ, targetR);

    public (GameState? state, string? error) ActivateRallyPoint(string roomCode, string userId)
        => commander.ActivateRallyPoint(roomCode, userId);

    public (GameState? state, string? error) ActivateShieldWall(string roomCode, string userId)
        => commander.ActivateShieldWall(roomCode, userId);

    // ── Engineer ─────────────────────────────────────────────────────────────
    public (GameState? state, string? error) StartFortConstruction(string roomCode, string userId)
        => engineer.StartFortConstruction(roomCode, userId);

    public (GameState? state, string? error) CancelFortConstruction(string roomCode, string userId)
        => engineer.CancelFortConstruction(roomCode, userId);

    public (GameState? state, string? error) ActivateSabotage(string roomCode, string userId)
        => engineer.ActivateSabotage(roomCode, userId);

    public (GameState? state, string? error) CancelSabotage(string roomCode, string userId)
        => engineer.CancelSabotage(roomCode, userId);

    public (GameState? state, string? error) StartDemolish(string roomCode, string userId)
        => engineer.StartDemolish(roomCode, userId);

    public (GameState? state, string? error) CancelDemolish(string roomCode, string userId)
        => engineer.CancelDemolish(roomCode, userId);

    // ── Shared ────────────────────────────────────────────────────────────────
    public ((string id, string name)? target, string? error) ResolveTroopTransferTarget(string roomCode, string userId, double heading)
        => shared.ResolveTroopTransferTarget(roomCode, userId, heading);

    public (Guid? transferId, string? error) InitiateTroopTransfer(string roomCode, string userId, int amount, string recipientId)
        => shared.InitiateTroopTransfer(roomCode, userId, amount, recipientId);

    public (GameState? state, string? error) RespondToTroopTransfer(string roomCode, string userId, Guid transferId, bool accepted)
        => shared.RespondToTroopTransfer(roomCode, userId, transferId, accepted);

    public (ActiveFieldBattle? battle, string? error) InitiateFieldBattle(string roomCode, string userId)
        => shared.InitiateFieldBattle(roomCode, userId);

    public (ActiveFieldBattle? battle, string? error) ChallengePlayer(string roomCode, string initiatorId, string targetPlayerId)
        => shared.ChallengePlayer(roomCode, initiatorId, targetPlayerId);

    public string? JoinFieldBattle(string roomCode, string userId, Guid battleId)
        => shared.JoinFieldBattle(roomCode, userId, battleId);

    public (GameState? state, string? error) SelectFieldBattleTarget(string roomCode, string initiatorId, Guid battleId, string targetId)
        => shared.SelectFieldBattleTarget(roomCode, initiatorId, battleId, targetId);

    public (GameState? state, FieldBattleResultDto? result, string? error) ResolveFieldBattle(string roomCode, Guid battleId)
        => shared.ResolveFieldBattle(roomCode, battleId);
}
