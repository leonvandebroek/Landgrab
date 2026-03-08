namespace Landgrab.Api.Models;

public enum GamePhase
{
    Lobby,
    Reinforce,
    Roll,
    Claim,
    GameOver
}

public enum GameMode
{
    Alliances,
    FreeForAll
}

public class PlayerDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Color { get; set; } = "";
    public string? AllianceId { get; set; }
    public string? AllianceName { get; set; }
    public string? AllianceColor { get; set; }
    public int TroopsToPlace { get; set; }
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

public class GameState
{
    public string RoomCode { get; set; } = "";
    public GamePhase Phase { get; set; } = GamePhase.Lobby;
    public GameMode GameMode { get; set; } = GameMode.Alliances;
    public List<PlayerDto> Players { get; set; } = [];
    public List<AllianceDto> Alliances { get; set; } = [];
    public Dictionary<string, HexCell> Grid { get; set; } = []; // "q,r" → HexCell
    public int CurrentPlayerIndex { get; set; }
    public int MovesRemaining { get; set; }
    public int[] LastDiceRoll { get; set; } = [];
    public double MapLat { get; set; }
    public double MapLng { get; set; }
    public int GridRadius { get; set; } = 8;
    public int TurnNumber { get; set; }
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
    public List<string> ConnectionIds { get; set; } = [];
    public Dictionary<string, string> ConnectionMap { get; set; } = []; // connectionId → userId
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
    public string EventType { get; set; } = ""; // "claim", "attack", "reinforce", "roll"
    public int? Q { get; set; }
    public int? R { get; set; }
    public string? Payload { get; set; } // JSON
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
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
