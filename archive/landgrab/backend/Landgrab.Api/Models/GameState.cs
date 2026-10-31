using System.Collections.Concurrent;
using System.Text.Json.Serialization;

namespace Landgrab.Api.Models;

public enum GamePhase
{
    Lobby,
    Playing,
    GameOver
}

public enum GameMode
{
    Alliances,
    FreeForAll
}

public enum ClaimMode
{
    PresenceOnly,
    PresenceWithTroop,
    AdjacencyRequired
}

public enum WinConditionType
{
    TerritoryPercent,
    Elimination,
    TimedGame
}

public enum GameAreaMode
{
    Centered,
    Drawn,
    Pattern
}

public enum GameAreaPattern
{
    WideFront,
    TallFront,
    Crossroads,
    Starburst
}


public enum CombatMode
{
    Classic,
    Balanced,
    Siege
}

public enum PlayerRole
{
    None,
    Commander,
    Scout,
    Engineer
}

public enum FieldBattleResolutionMode
{
    InitiatorVsSumOfJoined,
    InitiatorVsHighestOfJoined,
    InitiatorPlusRandomVsSumPlusRandom,
    InitiatorPlusRandomVsHighestPlusRandom
}

public class GameDynamics
{
    public bool BeaconEnabled { get; set; }
    public int BeaconSectorAngle { get; set; } = 45;
    public bool TileDecayEnabled { get; set; }
    public CombatMode CombatMode { get; set; } = CombatMode.Balanced;
    public bool PlayerRolesEnabled { get; set; }
    public bool HQEnabled { get; set; }
    public bool HQAutoAssign { get; set; } = true;
    public int EnemySightingMemorySeconds { get; set; } = 120;
    public bool FieldBattleEnabled { get; set; } = true;
    public FieldBattleResolutionMode FieldBattleResolutionMode { get; set; }
        = FieldBattleResolutionMode.InitiatorVsSumOfJoined;
}

public class HexCoordinateDto
{
    public int Q { get; set; }
    public int R { get; set; }
}

public class PlayerDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Color { get; set; } = "";
    public string Emoji { get; set; } = "";
    public string? AllianceId { get; set; }
    public string? AllianceName { get; set; }
    public string? AllianceColor { get; set; }
    public int CarriedTroops { get; set; }
    public int? CarriedTroopsSourceQ { get; set; }
    public int? CarriedTroopsSourceR { get; set; }
    public double? CurrentLat { get; set; }
    public double? CurrentLng { get; set; }
    public double? CurrentHeading { get; set; }
    public int? CurrentHexQ { get; set; }
    public int? CurrentHexR { get; set; }
    public bool IsHost { get; set; }
    public bool IsConnected { get; set; } = true;
    public int TerritoryCount { get; set; }

    // Phase 4: Player role
    public PlayerRole Role { get; set; } = PlayerRole.None;

    // Phase 5: Beacon — player marks position
    public bool IsBeacon { get; set; }
    public double? BeaconLat { get; set; }
    public double? BeaconLng { get; set; }
    public double? BeaconHeading { get; set; }

    // Phase 6: CommandoRaid cooldown (raid itself is now game-level via ActiveRaids)
    public DateTime? CommandoRaidCooldownUntil { get; set; }
    public DateTime? TroopTransferCooldownUntil { get; set; }

    // Commander abilities
    public bool TacticalStrikeActive { get; set; }
    public DateTime? TacticalStrikeExpiry { get; set; }
    public DateTime? TacticalStrikeCooldownUntil { get; set; }
    public int? TacticalStrikeTargetQ { get; set; }
    public int? TacticalStrikeTargetR { get; set; }
    public bool RallyPointActive { get; set; }
    public DateTime? RallyPointDeadline { get; set; }
    public DateTime? RallyPointCooldownUntil { get; set; }
    public int? RallyPointQ { get; set; }
    public int? RallyPointR { get; set; }

    // Scout abilities
    public DateTime? ShareIntelCooldownUntil { get; set; }
    public bool SabotageAlertNearby { get; set; }
    public string? InterceptTargetId { get; set; }
    public DateTime? InterceptLockStartAt { get; set; }

    // Engineer abilities
    public DateTime? FieldBattleCooldownUntil { get; set; }
    public int? FieldBattleCooldownHexQ { get; set; }
    public int? FieldBattleCooldownHexR { get; set; }
    public int? FortTargetQ { get; set; }
    public int? FortTargetR { get; set; }
    public List<string> FortPerimeterVisited { get; set; } = new();
    public int? SabotageTargetQ { get; set; }
    public int? SabotageTargetR { get; set; }
    public List<string> SabotagePerimeterVisited { get; set; } = new();
    public DateTime? SabotageCooldownUntil { get; set; }
    public Dictionary<string, DateTime> SabotageBlockedTiles { get; set; } = [];
    public string? DemolishTargetKey { get; set; }
    public List<string> DemolishApproachDirectionsMade { get; set; } = new();
    public DateTime? DemolishFacingLockStartAt { get; set; }
    public string? DemolishFacingHexKey { get; set; }
    public string? PreviousHexKey { get; set; }
    public DateTime? DemolishCooldownUntil { get; set; }
}

public class AllianceDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Color { get; set; } = "";
    public List<string> MemberIds { get; set; } = [];
    public int TerritoryCount { get; set; }

    // Phase 4: HQ
    public int? HQHexQ { get; set; }
    public int? HQHexR { get; set; }
    public DateTime? ClaimFrozenUntil { get; set; }

}

public class GameEventLogEntry
{
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string Type { get; set; } = "";
    public string Message { get; set; } = "";
    public string? PlayerId { get; set; }
    public string? PlayerName { get; set; }
    public string? TargetPlayerId { get; set; }
    public string? TargetPlayerName { get; set; }
    public string? AllianceId { get; set; }
    public string? AllianceName { get; set; }
    public int? Q { get; set; }
    public int? R { get; set; }
    public string? WinnerId { get; set; }
    public string? WinnerName { get; set; }
    public bool? IsAllianceVictory { get; set; }
}

public class ActiveCommandoRaid
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int TargetQ { get; set; }
    public int TargetR { get; set; }
    public string InitiatorAllianceId { get; set; } = "";
    public string InitiatorPlayerId { get; set; } = "";
    public string InitiatorPlayerName { get; set; } = "";
    public DateTime Deadline { get; set; }
    public bool IsHQRaid { get; set; }
}

public class ActiveTroopTransfer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string InitiatorId { get; set; } = "";
    public string InitiatorName { get; set; } = "";
    public string RecipientId { get; set; } = "";
    public string RecipientName { get; set; } = "";
    public int Amount { get; set; }
    public DateTime ExpiresAt { get; set; }
}

public class TroopTransferResultDto
{
    public bool Accepted { get; set; }
    public int Amount { get; set; }
    public string RecipientName { get; set; } = "";
    public string InitiatorName { get; set; } = "";
}

public class ActiveFieldBattle
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string InitiatorId { get; set; } = "";
    public string InitiatorName { get; set; } = "";
    public string InitiatorAllianceId { get; set; } = "";
    public int Q { get; set; }
    public int R { get; set; }
    public int InitiatorTroops { get; set; }
    public DateTime JoinDeadline { get; set; }
    public string? TargetEnemyId { get; set; }
    public List<string> JoinedEnemyIds { get; set; } = [];
    public List<string> FledEnemyIds { get; set; } = [];
    public bool Resolved { get; set; }
}

public class FieldBattleResultDto
{
    public Guid BattleId { get; set; }
    public bool InitiatorWon { get; set; }
    public string InitiatorName { get; set; } = "";
    public string InitiatorAllianceId { get; set; } = "";
    public int Q { get; set; }
    public int R { get; set; }
    public int InitiatorTroopsLost { get; set; }
    public int EnemyTroopsLost { get; set; }
    public bool NoEnemiesJoined { get; set; }
    public List<string> AllParticipantIds { get; set; } = [];
}

public class GameState
{
    public string RoomCode { get; set; } = "";
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
    public GameMode GameMode { get; set; } = GameMode.Alliances;
    public int CurrentWizardStep { get; set; }
    public List<PlayerDto> Players { get; set; } = [];
    public List<AllianceDto> Alliances { get; set; } = [];
    public List<ActiveCommandoRaid> ActiveRaids { get; set; } = [];
    public List<ActiveTroopTransfer> ActiveTroopTransfers { get; set; } = [];
    public List<ActiveFieldBattle> ActiveFieldBattles { get; set; } = [];
    public List<GameEventLogEntry> EventLog { get; set; } = [];
    public Dictionary<string, HexCell> Grid { get; set; } = [];
    public double? MapLat { get; set; }
    public double? MapLng { get; set; }
    public bool HasMapLocation => MapLat.HasValue && MapLng.HasValue;
    public int GridRadius { get; set; } = 8;
    public GameAreaMode GameAreaMode { get; set; } = GameAreaMode.Centered;
    public GameAreaPattern? GameAreaPattern { get; set; }
    public int TileSizeMeters { get; set; } = 25;
    public ClaimMode ClaimMode { get; set; } = ClaimMode.PresenceOnly;
    public WinConditionType WinConditionType { get; set; } = WinConditionType.TerritoryPercent;
    public int WinConditionValue { get; set; } = 60;
    public GameDynamics Dynamics { get; set; } = new();
    public int? GameDurationMinutes { get; set; }
    public int? MasterTileQ { get; set; }
    public int? MasterTileR { get; set; }
    public DateTime? GameStartedAt { get; set; }
    public string? WinnerId { get; set; }
    public string? WinnerName { get; set; }
    public bool IsAllianceVictory { get; set; }
    public List<Achievement> Achievements { get; set; } = [];
    public List<ContestedEdgeDto>? ContestedEdges { get; set; }

    // Host settings
    public bool HostBypassGps { get; set; } = false;
    public int? MaxFootprintMetersOverride { get; set; }
    public bool HostObserverMode { get; set; } = false;
    public bool IsPaused { get; set; } = false;
}

public class GameRoom
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";
    public Guid HostUserId { get; set; }
    public GameState State { get; set; } = new();
    [JsonIgnore]
    public object SyncRoot { get; } = new();
    [JsonIgnore]
    public ConcurrentDictionary<string, string> ConnectionMap { get; } = new();
    [JsonIgnore]
    public ConcurrentDictionary<string, PlayerVisibilityMemory> VisibilityMemory { get; } = new();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
}

public class Achievement
{
    public string Id { get; set; } = "";
    public string PlayerId { get; set; } = "";
    public string PlayerName { get; set; } = "";
    public string TitleKey { get; set; } = "";
    public string? Value { get; set; }
}

public class CombatBonusDetail
{
    public string Source { get; set; } = "";
    public int Value { get; set; }
}

public class CombatPreviewDto
{
    public int AttackerTroops { get; set; }
    public int DefenderTroops { get; set; }
    public int EffectiveAttack { get; set; }
    public int EffectiveDefence { get; set; }
    public double AttackerWinProbability { get; set; }
    public List<CombatBonusDetail> AttackerBonuses { get; set; } = [];
    public List<CombatBonusDetail> DefenderBonuses { get; set; } = [];
    public string CombatMode { get; set; } = "";
    public string DefenderName { get; set; } = "";
    public string? DefenderAllianceName { get; set; }
}

public sealed record InterceptAttemptResult(string Status, double? Seconds = null);

public class CombatResult
{
    public int[] AttackDice { get; set; } = [];
    public int[] DefendDice { get; set; } = [];
    public bool AttackerWon { get; set; }
    public int AttackerLost { get; set; }
    public int DefenderLost { get; set; }
    public bool HexCaptured { get; set; }
    public GameState NewState { get; set; } = null!;
    public int Q { get; set; }
    public int R { get; set; }
    public string? PreviousOwnerName { get; set; }
    public bool IsAttacker { get; set; }
    public string? AttackerName { get; set; }
    public int AttackerBonus { get; set; }
    public int DefenderBonus { get; set; }
    public int EffectiveAttack { get; set; }
    public int EffectiveDefence { get; set; }
    public int AttackerTroopsLost { get; set; }
    public int DefenderTroopsLost { get; set; }
    public int AttackerTroopsRemaining { get; set; }
    public int DefenderTroopsRemaining { get; set; }
    public double AttackerWinProbability { get; set; }
    public string CombatModeUsed { get; set; } = "";
    public List<CombatBonusDetail> AttackerBonuses { get; set; } = [];
    public List<CombatBonusDetail> DefenderBonuses { get; set; } = [];
}

public class NeutralClaimResult
{
    public int Q { get; set; }
    public int R { get; set; }
    public int CarriedTroops { get; set; }
    public int TroopsOnHex { get; set; }
}

public class GameEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? RoomId { get; set; }
    public Guid UserId { get; set; }
    public string EventType { get; set; } = "";
    public int? Q { get; set; }
    public int? R { get; set; }
    public string? Payload { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class RoomSummaryDto
{
    public string Code { get; set; } = "";
    public GamePhase Phase { get; set; }
    public int PlayerCount { get; set; }
    public bool IsConnected { get; set; }
    public string HostName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public class PasswordResetToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public bool Used { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User User { get; set; } = null!;
}
