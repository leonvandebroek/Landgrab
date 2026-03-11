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

public class PlayerDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Color { get; set; } = "";
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
}

public class AllianceDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Color { get; set; } = "";
    public List<string> MemberIds { get; set; } = [];
    public int TerritoryCount { get; set; }
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
    public List<PlayerDto> Players { get; set; } = [];
    public List<AllianceDto> Alliances { get; set; } = [];
    public List<GameEventLogEntry> EventLog { get; set; } = [];
    public Dictionary<string, HexCell> Grid { get; set; } = [];
    public double? MapLat { get; set; }
    public double? MapLng { get; set; }
    public bool HasMapLocation => MapLat.HasValue && MapLng.HasValue;
    public int GridRadius { get; set; } = 8;
    public int TileSizeMeters { get; set; } = 100;
    public ClaimMode ClaimMode { get; set; } = ClaimMode.AdjacencyRequired;
    public WinConditionType WinConditionType { get; set; } = WinConditionType.TerritoryPercent;
    public int WinConditionValue { get; set; } = 60;
    public int? GameDurationMinutes { get; set; }
    public int? MasterTileQ { get; set; }
    public int? MasterTileR { get; set; }
    public DateTime? GameStartedAt { get; set; }
    public string? WinnerId { get; set; }
    public string? WinnerName { get; set; }
    public bool IsAllianceVictory { get; set; }
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

public class CombatResult
{
    public int[] AttackDice { get; set; } = [];
    public int[] DefendDice { get; set; } = [];
    public bool AttackerWon { get; set; }
    public int AttackerLost { get; set; }
    public int DefenderLost { get; set; }
    public bool HexCaptured { get; set; }
    public GameState NewState { get; set; } = null!;
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
