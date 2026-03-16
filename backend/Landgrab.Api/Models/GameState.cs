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

public enum ReClaimMode { Alliance, Self, Abandon }

public enum CopresenceMode
{
    None,
    Standoff,
    PresenceBonus,
    Rally,
    Drain,
    Beacon,
    FrontLine,
    Shepherd,
    CommandoRaid
}

public enum TerrainType
{
    None,
    Water,
    Building,
    Road,
    Path,
    Forest,
    Park,
    Hills,
    Steep
}

public enum PlayerRole
{
    None,
    Commander,
    Scout,
    Defender,
    Engineer
}

public class GameDynamics
{
    public List<CopresenceMode> ActiveCopresenceModes { get; set; } = [];
    public string? CopresencePreset { get; set; }
    public bool TerrainEnabled { get; set; }
    public bool PlayerRolesEnabled { get; set; }
    public bool FogOfWarEnabled { get; set; }
    public bool SupplyLinesEnabled { get; set; }
    public bool HQEnabled { get; set; }
    public bool TimedEscalationEnabled { get; set; }
    public bool UnderdogPactEnabled { get; set; }
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
    public bool IsHost { get; set; }
    public bool IsConnected { get; set; } = true;
    public int TerritoryCount { get; set; }

    // Phase 4: Player role
    public PlayerRole Role { get; set; } = PlayerRole.None;

    // Phase 5: Beacon — player marks position
    public bool IsBeacon { get; set; }
    public double? BeaconLat { get; set; }
    public double? BeaconLng { get; set; }

    // Phase 6: CommandoRaid
    public bool IsCommandoActive { get; set; }
    public int? CommandoTargetQ { get; set; }
    public int? CommandoTargetR { get; set; }
    public DateTime? CommandoDeadline { get; set; }
    public DateTime? CommandoCooldownUntil { get; set; }
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

    // Phase 8: Underdog Pact
    public DateTime? UnderdogBoostUntil { get; set; }
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

public class GameState
{
    public string RoomCode { get; set; } = "";
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
    public GameMode GameMode { get; set; } = GameMode.Alliances;
    public int CurrentWizardStep { get; set; }
    public List<PlayerDto> Players { get; set; } = [];
    public List<AllianceDto> Alliances { get; set; } = [];
    public List<GameEventLogEntry> EventLog { get; set; } = [];
    public Dictionary<string, HexCell> Grid { get; set; } = [];
    public double? MapLat { get; set; }
    public double? MapLng { get; set; }
    public bool HasMapLocation => MapLat.HasValue && MapLng.HasValue;
    public int GridRadius { get; set; } = 8;
    public GameAreaMode GameAreaMode { get; set; } = GameAreaMode.Centered;
    public GameAreaPattern? GameAreaPattern { get; set; }
    public int TileSizeMeters { get; set; } = 25;
    public ClaimMode ClaimMode { get; set; } = ClaimMode.AdjacencyRequired;
    public WinConditionType WinConditionType { get; set; } = WinConditionType.TerritoryPercent;
    public int WinConditionValue { get; set; } = 60;
    public bool AllowSelfClaim { get; set; } = true;
    public GameDynamics Dynamics { get; set; } = new();
    public int? GameDurationMinutes { get; set; }
    public int? MasterTileQ { get; set; }
    public int? MasterTileR { get; set; }
    public DateTime? GameStartedAt { get; set; }
    public string? WinnerId { get; set; }
    public string? WinnerName { get; set; }
    public bool IsAllianceVictory { get; set; }
    public List<Achievement> Achievements { get; set; } = [];

    // Host settings
    public bool HostBypassGps { get; set; } = false;
    public int? MaxFootprintMetersOverride { get; set; }
    public bool HostObserverMode { get; set; } = false;
    public bool IsPaused { get; set; } = false;

    // Phase 8: Rush Hour
    public bool IsRushHour { get; set; }
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
    public int AttackerBonus { get; set; }
    public int DefenderBonus { get; set; }
    public string? DefenderTerrainType { get; set; }
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
