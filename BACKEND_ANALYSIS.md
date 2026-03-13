# Landgrab Backend - Comprehensive Analysis

## 1. PROJECT STRUCTURE

### Directory Layout
```
/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Api/
├── Auth/                          # Authentication services
│   ├── EmailService.cs           # Email sending
│   ├── JwtService.cs             # JWT token generation
│   └── PasswordService.cs        # Password hashing (BCrypt)
├── Data/
│   └── AppDbContext.cs           # Entity Framework DbContext
├── Endpoints/                     # REST API endpoints (minimal APIs)
│   ├── AuthEndpoints.cs          # /api/auth routes
│   ├── AllianceEndpoints.cs      # /api/alliances routes
│   └── GlobalMapEndpoints.cs     # /api/global routes
├── Hubs/
│   └── GameHub.cs                # SignalR hub (real-time game)
├── Migrations/                    # EF Core database migrations
├── Models/                        # Data models/entities
│   ├── Alliance.cs               # Alliance entity
│   ├── GameState.cs              # Game state (large - 358 lines)
│   ├── HexCell.cs                # Game hex cell data
│   ├── HubErrorDto.cs            # Error DTO for SignalR
│   ├── PersistedRoom.cs          # Persisted game room
│   └── User.cs                   # User entity
├── Services/                      # Business logic
│   ├── GameService.cs            # Core game logic (3398 lines)
│   ├── GlobalMapService.cs       # Global map persistence
│   ├── HexService.cs             # Hex grid calculations
│   ├── MissionService.cs         # Mission system
│   ├── RandomEventService.cs     # Random events
│   ├── RoomPersistenceService.cs # Room persistence
│   ├── TerrainFetchService.cs    # Terrain data fetching
│   └── TroopRegenerationService.cs # Troop regeneration
├── Program.cs                     # Application entry point
├── appsettings.json              # Configuration
└── Landgrab.Api.csproj          # Project file
```

---

## 2. DATA MODELS

### **User Entity** (`/Models/User.cs`)
```csharp
public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = "";           // Max 30 chars, unique
    public string Email { get; set; } = "";             // Max 254 chars, unique
    public string PasswordHash { get; set; } = "";      // BCrypt hash
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<AllianceMember> AllianceMemberships { get; set; } = [];
}
```

### **Alliance & AllianceMember** (`/Models/Alliance.cs`)
```csharp
public class Alliance
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";              // Max 50 chars
    public string Tag { get; set; } = "";               // Max 6 chars
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<AllianceMember> Members { get; set; } = [];
}

public class AllianceMember
{
    public Guid UserId { get; set; }
    public Guid AllianceId { get; set; }
    public string Role { get; set; } = "member";        // "leader" or "member"
    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    public User User { get; set; } = null!;
    public Alliance Alliance { get; set; } = null!;
}
```

### **HexCell (Game Room Hex)** (`/Models/HexCell.cs`)
```csharp
public class HexCell
{
    public int Q { get; set; }
    public int R { get; set; }
    public string? OwnerId { get; set; }                // Player UUID
    public string? OwnerAllianceId { get; set; }
    public string? OwnerName { get; set; }
    public string? OwnerColor { get; set; }
    public int Troops { get; set; }
    public bool IsMasterTile { get; set; }
    public TerrainType TerrainType { get; set; }       // Water, Building, Road, etc.
    
    // Phase 3: Rally
    public bool IsFortified { get; set; }              // Fortified when ≥2 allied players present
    public DateTime? LastVisitedAt { get; set; }       // Phase 3: Shepherd
    
    // Phase 4: Engineer
    public DateTime? EngineerBuiltAt { get; set; }
    public bool IsFort { get; set; }                   // Permanent fort status
    
    // Phase 10: PresenceBattle
    public double? ContestProgress { get; set; }       // 0.0 to 1.0
    public string? ContestingPlayerId { get; set; }
}

public enum TerrainType { None, Water, Building, Road, Path, Forest, Park, Hills, Steep }
```

### **GlobalHex (Persistent Global Map)** (`/Models/HexCell.cs`)
```csharp
public class GlobalHex
{
    public int Q { get; set; }
    public int R { get; set; }
    public Guid? OwnerUserId { get; set; }
    public Guid? OwnerAllianceId { get; set; }
    public int Troops { get; set; } = 0;
    public DateTime? LastCaptured { get; set; }
    public DateTime? AttackCooldownUntil { get; set; }  // 5-minute cooldown after failed attack
    
    public User? Owner { get; set; }
    public Alliance? OwnerAlliance { get; set; }
}
```

### **GameState** (`/Models/GameState.cs` - 358 lines)
Main game state container tracking:

**Enums:**
```csharp
enum GamePhase { Lobby, Playing, GameOver }
enum GameMode { Alliances, FreeForAll }
enum ClaimMode { PresenceOnly, PresenceWithTroop, AdjacencyRequired }
enum WinConditionType { TerritoryPercent, Elimination, TimedGame }
enum GameAreaMode { Centered, Drawn, Pattern }
enum GameAreaPattern { WideFront, TallFront, Crossroads, Starburst }
enum CopresenceMode { 
    None, Standoff, PresenceBattle, PresenceBonus, Ambush, Toll, Duel, 
    Rally, Drain, Stealth, Hostage, Scout, Beacon, FrontLine, Relay, 
    JagerProoi, Shepherd, CommandoRaid 
}
enum PlayerRole { None, Commander, Scout, Defender, Saboteur, Engineer }
```

**Core Properties:**
```csharp
public class GameState
{
    public string RoomCode { get; set; }
    public GamePhase Phase { get; set; }
    public GameMode GameMode { get; set; }
    public List<PlayerDto> Players { get; set; }
    public List<AllianceDto> Alliances { get; set; }
    public List<GameEventLogEntry> EventLog { get; set; }      // Max 100 entries
    public Dictionary<string, HexCell> Grid { get; set; }      // Hex grid data
    
    // Map configuration
    public double? MapLat { get; set; }
    public double? MapLng { get; set; }
    public int GridRadius { get; set; } = 8;                   // Default: 8
    public GameAreaMode GameAreaMode { get; set; }
    public GameAreaPattern? GameAreaPattern { get; set; }
    public int TileSizeMeters { get; set; } = 25;             // Default: 25m
    
    // Gameplay settings
    public ClaimMode ClaimMode { get; set; }                   // How hexes can be claimed
    public WinConditionType WinConditionType { get; set; }
    public int WinConditionValue { get; set; } = 60;          // % territory for TerritoryPercent
    public bool AllowSelfClaim { get; set; } = true;
    public GameDynamics Dynamics { get; set; }
    
    // Game lifecycle
    public int? GameDurationMinutes { get; set; }
    public DateTime? GameStartedAt { get; set; }
    public string? WinnerId { get; set; }
    public bool IsAllianceVictory { get; set; }
    
    // Master tile & additional features
    public int? MasterTileQ { get; set; }
    public int? MasterTileR { get; set; }
    public List<Achievement> Achievements { get; set; }
    public List<Mission> Missions { get; set; }              // Phase 9
    public int? PreyTargetQ { get; set; }                    // Phase 6: JagerProoi
    public bool IsRushHour { get; set; }                     // Phase 8
}

public class GameDynamics
{
    public List<CopresenceMode> ActiveCopresenceModes { get; set; }
    public string? CopresencePreset { get; set; }
    public bool TerrainEnabled { get; set; }
    public bool PlayerRolesEnabled { get; set; }
    public bool FogOfWarEnabled { get; set; }
    public bool SupplyLinesEnabled { get; set; }
    public bool HQEnabled { get; set; }
    public bool TimedEscalationEnabled { get; set; }
    public bool UnderdogPactEnabled { get; set; }
    public bool NeutralNPCEnabled { get; set; }
    public bool RandomEventsEnabled { get; set; }
    public bool MissionSystemEnabled { get; set; }
}
```

### **PlayerDto & AllianceDto** (In GameState.cs)
```csharp
public class PlayerDto
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Color { get; set; }
    public string? AllianceId { get; set; }
    public int CarriedTroops { get; set; }               // Troops being carried
    public int? CarriedTroopsSourceQ { get; set; }       // Where troops came from
    public int? CarriedTroopsSourceR { get; set; }
    public double? CurrentLat { get; set; }
    public double? CurrentLng { get; set; }
    public bool IsHost { get; set; }
    public bool IsConnected { get; set; } = true;
    public int TerritoryCount { get; set; }
    
    // Phase 3: Scout
    public HashSet<string> VisitedHexes { get; set; } = [];
    
    // Phase 4: Player role
    public PlayerRole Role { get; set; }
    
    // Phase 5: Beacon
    public bool IsBeacon { get; set; }
    public double? BeaconLat { get; set; }
    public double? BeaconLng { get; set; }
    
    // Stealth, CommandoRaid, JagerProoi, Hostage fields...
}

public class AllianceDto
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Color { get; set; }
    public List<string> MemberIds { get; set; }
    public int TerritoryCount { get; set; }
    
    // Phase 4: HQ
    public int? HQHexQ { get; set; }
    public int? HQHexR { get; set; }
    public DateTime? ClaimFrozenUntil { get; set; }
    
    // Phase 8: Underdog Pact
    public DateTime? UnderdogBoostUntil { get; set; }
}
```

### **GameRoom** (In GameState.cs)
```csharp
public class GameRoom
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Code { get; set; } = "";
    public Guid HostUserId { get; set; }
    public GameState State { get; set; } = new();
    public object SyncRoot { get; } = new();                    // Lock for thread safety
    public ConcurrentDictionary<string, string> ConnectionMap { get; }  // ConnectionId -> UserId
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? EndedAt { get; set; }
    public Dictionary<string, PendingDuel> PendingDuels { get; set; }  // Phase 10
}
```

### **PersistedRoom** (`/Models/PersistedRoom.cs`)
```csharp
public class PersistedRoom
{
    public string Code { get; set; } = "";                      // Primary key
    public Guid HostUserId { get; set; }
    public string StateJson { get; set; } = "{}";              // Serialized GameState
    public string Phase { get; set; } = GamePhase.Lobby.ToString();
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
```

### **PasswordResetToken** (In GameState.cs)
```csharp
public class PasswordResetToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = "";                 // HMACSHA256
    public DateTime ExpiresAt { get; set; }                     // 1 hour
    public bool Used { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public User User { get; set; } = null!;
}
```

---

## 3. DATABASE CONTEXT

### **AppDbContext** (`/Data/AppDbContext.cs`)

```csharp
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    // Tracked entities
    public DbSet<User> Users => Set<User>();
    public DbSet<Alliance> Alliances => Set<Alliance>();
    public DbSet<AllianceMember> AllianceMembers => Set<AllianceMember>();
    public DbSet<GlobalHex> GlobalHexes => Set<GlobalHex>();
    public DbSet<GameEvent> GameEvents => Set<GameEvent>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<PersistedRoom> PersistedRooms => Set<PersistedRoom>();
    
    // Configuration in OnModelCreating:
    // - Users: Unique indexes on Username, Email (max 30, 254 chars)
    // - Alliances: Name (50 chars), Tag (6 chars) required
    // - AllianceMembers: Composite key (UserId, AllianceId), relationships configured
    // - GlobalHex: Composite key (Q, R), indexes on OwnerUserId, OwnerAllianceId
    // - GameEvent: Index on RoomId
    // - PasswordResetToken: OnDelete cascade
    // - PersistedRoom: Indexes on IsActive, UpdatedAt
}
```

**Database: SQL Server**
- Connection string in appsettings.json
- EF Core migrations in Migrations/ folder
- Initial migration: `20260313131210_InitialSqlServer.cs`

---

## 4. SIGNALR HUB

### **GameHub** (`/Hubs/GameHub.cs` - 849 lines)

**Key Methods:**

#### Room Management
- `CreateRoom()` - Create new game room, add host
- `JoinRoom(roomCode)` - Join existing room
- `RejoinRoom(roomCode)` - Rejoin after disconnect
- `ReturnToLobby()` - Leave current game

#### Game Setup (Lobby Phase)
- `SetMapLocation(lat, lng)` - Set game center coordinates
- `SetAlliance(allianceName)` - Assign player to alliance
- `ConfigureAlliances(names)` - Set up alliance list
- `DistributePlayers()` - Random player distribution
- `AssignAllianceStartingTile(q, r, allianceId)` - Set starting territory
- `SetTileSize(meters)` - Configure hex size (15-1000m)
- `UseCenteredGameArea()` - Use spiral grid from map center
- `SetPatternGameArea(pattern)` - Use predefined pattern
- `SetCustomGameArea(coordinates)` - Draw custom map area
- `SetClaimMode(mode)` - Choose ClaimMode
- `SetAllowSelfClaim(allow)` - Allow individual claiming
- `SetWinCondition(type, value)` - Win condition config
- `SetCopresenceModes(modes)` - Activate interaction modes
- `SetCopresencePreset(preset)` - Use interaction preset
- `SetGameDynamics(dynamics)` - Configure dynamics
- `SetPlayerRole(role)` - Assign player role
- `SetAllianceHQ(q, r, allianceId)` - Phase 4: Set HQ
- `SetMasterTile(lat, lng)` - Phase 4: Master tile by coords
- `SetMasterTileByHex(q, r)` - Phase 4: Master tile by hex
- `AssignStartingTile(q, r, targetPlayerId)` - Assign player starting hex
- `StartGame()` - Begin game, fetch terrain if enabled

#### Playing Phase
- `UpdatePlayerLocation(lat, lng)` - Update player GPS position, detect duels (Phase 10)
- `PickUpTroops(q, r, count, lat, lng)` - Pick up troops from owned hex
- `PlaceTroops(q, r, lat, lng, troopCount?, claimForSelf?)` - **Main tile action**
  - Claims neutral hexes
  - Reinforces own/allied hexes
  - Attacks enemy hexes
  - Validates player location in hex
  - Triggers combat if needed
  - Calls `ClaimNeutralHex` with ClaimMode validation
- `ReClaimHex(q, r, mode)` - ReClaim owned hex (Alliance/Self/Abandon)

#### Dynamics & Features
- `ActivateBeacon()` - Phase 5: Place beacon marker
- `DeactivateBeacon()` - Remove beacon
- `ActivateStealth()` - Phase 6: Enter stealth
- `ActivateCommandoRaid(q, r)` - Phase 6: Commando raid
- `AttackGlobalHex(fromQ, fromR, toQ, toR)` - Global map attack
- `JoinGlobalMap(lat, lng)` - Join persistent global map
- `AcceptDuel(duelId)` - Phase 10: Accept duel challenge
- `DeclineDuel(duelId)` - Phase 10: Decline duel
- `DetainPlayer(targetPlayerId)` - Phase 10: Hostage system

#### Helper Methods
- `BroadcastState(roomCode, state)` - Send state to all players (FOW support)
- `SendError(code, message)` - Send error to caller
- `MapErrorCode(message)` - Convert message to error code
- `UserId`, `Username` - Extract from JWT claims

---

## 5. SERVICES

### **HexService** (`/Services/HexService.cs` - 283 lines)
**Static utilities for hex grid calculations (axial coordinate system)**

```csharp
// Hex grid operations
public static string Key(int q, int r)                          // Get string key
public static IEnumerable<(int q, int r)> Neighbors(int q, int r)  // 6 neighbors
public static bool AreAdjacent(int q1, int r1, int q2, int r2)  // Check adjacency
public static IEnumerable<(int q, int r)> Spiral(int radius)    // Spiral from center
public static Dictionary<string, HexCell> BuildGrid(int radius)
public static Dictionary<string, HexCell> BuildGrid(IEnumerable<(int q, int r)> coordinates)

// Distance & geometry
public static int HexDistance(int q, int r)                     // Distance from origin
public static int InferRadius(IEnumerable<(int q, int r)> coordinates)
public static (double widthMeters, double heightMeters, double maxDimensionMeters)
    GetFootprintMetrics(IEnumerable<(int q, int r)> coordinates, double tileSizeMeters)
public static int GetMaxTileSizeForFootprint(IEnumerable<(int q, int r)> coordinates, 
    int maxFootprintMeters)

// Connectivity
public static bool IsConnected(IEnumerable<(int q, int r)> coordinates)  // Are all hexes connected?
public static bool IsAdjacentToOwned(Dictionary<string, HexCell> grid, int q, int r,
    string playerId, string? allianceId)                         // For AdjacencyRequired claim mode
public static int CountAllyBorderHexes(Dictionary<string, HexCell> grid, int q, int r,
    string defenderId, string? defenderAllianceId)

// Territory counting
public static int TerritoryCount(Dictionary<string, HexCell> grid, string playerId)
public static int AllianceTerritoryCount(Dictionary<string, HexCell> grid, string allianceId)

// Coordinate conversion
public static (double lat, double lng) HexToLatLng(int q, int r, double mapLat, double mapLng,
    int tileSizeMeters)                                          // Hex coords → GPS coords
public static (int q, int r) LatLngToHexForRoom(double lat, double lng, double mapLat,
    double mapLng, int tileSizeMeters)                          // GPS coords → Hex coords
public static bool IsPlayerInHex(double playerLat, double playerLng, int q, int r,
    double mapLat, double mapLng, int tileSizeMeters)          // Player location validation

// Ring distributions
public static List<(int q, int r)> GetEvenlySpacedRing(int count, int ringRadius, int gridRadius)
private static List<(int q, int r)> HexRing(int radius)

// Spiral search
public static IEnumerable<(int q, int r)> SpiralSearch(int startQ, int startR, int maxRadius)
    // Used by Scout to find nearest owned tile

// Hex rounding (double → int coordinates)
private static (int q, int r) HexRound(double q, double r)
```

**Key Constants:**
- `MetersPerDegreeLat = 111_320d`
- `Sqrt3 = 1.7320508075688772d`
- Flat-top hex directions: `[(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]`

---

### **GameService** (`/Services/GameService.cs` - 3398 lines)
**Core game logic, room management, tile placement, and game flow**

**Constants:**
```csharp
private const int DefaultGridRadius = 8;                // Default spiral radius
private const int DefaultTileSizeMeters = 25;          // Default hex size
private const int MaxFootprintMeters = 1_000;          // Max game area size
private const int MinimumDrawnHexCount = 7;            // Min custom hexes
private const int MaxEventLogEntries = 100;            // Event log cap

private static readonly string[] Colors =              // 16 player colors
private static readonly string[] AllianceColors =      // 8 alliance colors

private static readonly Dictionary<string, List<CopresenceMode>> CopresencePresets = {
    ["Klassiek"] = [],
    ["Territorium"] = [Shepherd, Drain],
    ["Formatie"] = [FrontLine, Rally],
    ["Logistiek"] = [Shepherd, Relay, FrontLine],
    ["Infiltratie"] = [Stealth, CommandoRaid, Scout],
    ["Chaos"] = [JagerProoi, Duel, PresenceBonus],
    ["Tolweg"] = [Beacon, Toll, Drain],
}
```

**Public Methods:**

**Room Lifecycle:**
- `GameRoom CreateRoom(userId, username, connectionId)` - New room with host
- `(GameRoom?, string?) JoinRoom(code, userId, username, connectionId)` - Join room, max 30 players
- `GameRoom? GetRoom(code)` - Get by code
- `GameState? GetStateSnapshot(code)` - Get state snapshot
- `GameRoom? GetRoomByConnection(connectionId)` - Get by SignalR connection
- `GameRoom? GetRoomByUserId(userId, roomCode?)` - Get player's room
- `int RestoreRooms(rooms)` - Restore persisted rooms on startup
- `IReadOnlyList<RoomSummaryDto> GetRoomsForUser(userId)` - Player's active rooms
- `IReadOnlyList<string> GetPlayingRoomCodes()` - All playing rooms
- `void RemoveConnection(room, connectionId, returnedToLobby?)` - Player disconnect

**Game Setup (Lobby):**
- `SetMapLocation(code, userId, lat, lng)` - Set game center
- `SetAlliance(code, userId, allianceName)` - Assign to alliance
- `ConfigureAlliances(code, userId, allianceNames)` - Configure alliances
- `DistributePlayersRandomly(code, userId)` - Auto-distribute players
- `AssignAllianceStartingTile(code, userId, q, r, allianceId)` - Set starting territory
- `SetTileSize(code, userId, meters)` - Set hex size (15-maxAllowed)
- `UseCenteredGameArea(code, userId)` - Use spiral grid
- `SetPatternGameArea(code, userId, pattern)` - Use pattern (WideFront, TallFront, etc.)
- `SetCustomGameArea(code, userId, coordinates)` - Custom map drawing
- `SetClaimMode(code, userId, mode)` - PresenceOnly / PresenceWithTroop / AdjacencyRequired
- `SetAllowSelfClaim(code, userId, allow)` - Allow individual claims vs alliance only
- `SetWinCondition(code, userId, type, value)` - TerritoryPercent / Elimination / TimedGame
- `SetCopresenceModes(code, userId, modes)` - Activate dynamic modes
- `SetCopresencePreset(code, userId, preset)` - Use preset combinations
- `SetGameDynamics(code, userId, dynamics)` - Configure all dynamics
- `SetPlayerRole(code, userId, role)` - Assign Commander, Scout, etc.
- `SetAllianceHQ(code, userId, q, r, allianceId)` - Phase 4: HQ location
- `SetMasterTile(code, userId, lat, lng)` - Phase 4: Master tile by GPS
- `SetMasterTileByHex(code, userId, q, r)` - Phase 4: Master tile by hex
- `AssignStartingTile(code, userId, q, r, targetPlayerId)` - Assign player start
- `StartGame(code, userId)` - Begin game

**Playing Phase:**
- `(state?, error?, duel?) UpdatePlayerLocation(code, userId, lat, lng)` - Update position, check duels
- `(state?, error?) PickUpTroops(code, userId, q, r, count, lat, lng)` - Pick up troops
- `(state?, error?, prevOwnerId?, combatResult?) PlaceTroops(code, userId, q, r, lat, lng, troopCount?, claimForSelf?)` - **MAIN ACTION**
  - Validates player in hex (proximity check)
  - Handles reinforcement, claiming, attacking
  - Applies combat bonuses
  - Returns CombatResult if combat occurred
- `(state?, error?) ReClaimHex(code, userId, q, r, mode)` - ReClaim: Alliance/Self/Abandon
- `(state?, error?) AddReinforcementsToAllHexes(code)` - Phase 4: Engineer reinforcement
- `(state?, error?) ActivateBeacon(code, userId)` - Phase 5: Place beacon
- `(state?, error?) DeactivateBeacon(code, userId)` - Remove beacon
- `(state?, error?) ActivateStealth(code, userId)` - Phase 6: Enter stealth
- `(state?, error?) ActivateCommandoRaid(code, userId, targetQ, targetR)` - Phase 6: Raid
- `(success?, winnerId?, loserId?) ResolveDuel(code, duelId, accepted)` - Phase 10: Duel resolution
- `(state?, error?) DetainPlayer(code, userId, targetPlayerId)` - Phase 10: Hostage

**Private Key Methods:**
- `void ClaimNeutralHex(state, player, cell, q, r, claimForSelf?)` - **ClaimMode validation**
  - Validates ClaimMode rules:
    - **PresenceOnly**: Just claim with presence
    - **PresenceWithTroop**: Need ≥1 troop to claim
    - **AdjacencyRequired**: Must be adjacent to owned territory (or within 2 hexes if Beacon active)
- `string? ValidateRealtimeAction(state, userId, q, r, lat, lng, out player, out cell)` - **Proximity validation**
  - Checks player is in hex: `HexService.IsPlayerInHex(playerLat, playerLng, q, r, ...)`
  - Validates game is in Playing phase
  - Validates map location exists
  - Returns error if hostage/detained
- `string? ValidateCoordinates(lat, lng)` - Validate GPS coords
- `Dictionary<string, HexCell> BuildGridForState(state)` - Build grid based on mode
- `int GetAllowedTileSizeMeters(coordinates, requested)` - Clamp tile size
- `IEnumerable<(int, int)> BuildPatternCoordinates(pattern)` - Pattern generator

---

### **GlobalMapService** (`/Services/GlobalMapService.cs` - 191 lines)
**Persistent global map (outside of games)**

```csharp
private const int AttackCooldownMinutes = 5;

// Queries
public async Task<IEnumerable<GlobalHex>> GetHexesForUserAsync(Guid userId)
public async Task<IEnumerable<GlobalHex>> GetHexesNearAsync(double lat, double lng, int radiusKm = 50)
public async Task<IEnumerable<object>> GetLeaderboardAsync(int top = 20)

// Actions
public async Task<(GlobalHex? result, string? error)> AttackHexAsync(
    Guid attackerUserId, int fromQ, int fromR, int toQ, int toR)
    // Validates adjacency (HexService.AreAdjacent)
    // Simple combat: attacker wins if roll > defender roll (bonus if more troops)
    // Sets 5-minute cooldown on failed attacks
    
public async Task EnsurePlayerHasStartingHex(Guid userId, double lat, double lng)
    // Finds nearest unclaimed hex within radius 5

// Coordinate conversion (1 hex ≈ 1km scale)
public static (int q, int r) LatLngToHex(double lat, double lng)
private static (int q, int r) HexRound(double q, double r)
private async Task<Guid?> GetUserAllianceIdAsync(Guid userId)
```

---

### **RoomPersistenceService** (`/Services/RoomPersistenceService.cs` - 324 lines)
**Persist/restore game rooms to SQL Server**

- `Task<int> DeactivateStaleRoomsAsync()` - Mark inactive rooms (>14 days)
- `Task<int> RestoreActiveRoomsAsync()` - Load active rooms from DB
- `Task PersistRoomAsync(GameRoom room, GameState snapshot)` - Save state JSON
- `Task PersistIfGameOverAsync(GameRoom room, GameState snapshot, GamePhase prev)` - Final save

---

### **TerrainFetchService** (`/Services/TerrainFetchService.cs` - 244 lines)
**Fetch real-world terrain data (OSM/elevation)**

- `Task AssignTerrainToGrid(grid, mapLat, mapLng, tileSizeMeters)` - Populate terrain types
- Converts hex coords to lat/lng, queries terrain API

---

### **TroopRegenerationService** (`/Services/TroopRegenerationService.cs` - 75 lines)
**Hosted service: periodic troop regeneration**

- Runs every N seconds
- Adds troops to all hex cells in playing games
- Uses IHostedService pattern

---

### **RandomEventService** (`/Services/RandomEventService.cs` - 158 lines)
**Hosted service: random game events**

- Runs periodically
- Triggers random events in active games
- Implements IHostedService

---

### **MissionService** (`/Services/MissionService.cs` - 571 lines)
**Hosted service: mission system (Phase 9)**

- Generate missions
- Track mission progress
- Award completion rewards
- Implements IHostedService

---

## 6. REST ENDPOINTS

### **Auth Endpoints** (`/Endpoints/AuthEndpoints.cs`)
```
POST   /api/auth/register           - Register account
POST   /api/auth/login              - Login (return JWT)
POST   /api/auth/forgot-password    - Request reset token
POST   /api/auth/reset-password     - Reset password with token
```

**Request Examples:**
```csharp
record RegisterRequest(string Username, string Email, string Password);
record LoginRequest(string UsernameOrEmail, string Password);
record ForgotPasswordRequest(string Email);
record ResetPasswordRequest(string Token, string NewPassword);
record AuthResponse(string Token, string Username, string UserId);
```

**Validation:**
- Username: 3-30 chars, alphanumeric + underscore
- Email: Valid format
- Password: ≥8 chars
- Rate limited: 10 requests per minute per IP

---

### **Alliance Endpoints** (`/Endpoints/AllianceEndpoints.cs`)
```
GET    /api/alliances/             - Get my alliances
POST   /api/alliances/             - Create alliance
POST   /api/alliances/{id}/join    - Join alliance
DELETE /api/alliances/{id}/leave   - Leave alliance
```

---

### **Global Map Endpoints** (`/Endpoints/GlobalMapEndpoints.cs`)
```
GET /api/global/hexes              - Get hexes near coords
GET /api/global/leaderboard        - Top 20 players
GET /api/global/myterritories      - My owned hexes
```

**All require JWT authorization**

---

## 7. CONFIGURATION

### **appsettings.json**
```json
{
  "Logging": { "LogLevel": { "Default": "Information" } },
  "AllowedHosts": "*",
  "AllowedOrigins": ["http://localhost:5173", "http://localhost:3000"],
  "Jwt": {
    "Secret": "",                    // Set via environment
    "Issuer": "landgrab",
    "Audience": "landgrab"
  },
  "App": { "BaseUrl": "http://localhost:5173" },
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost,1433;Initial Catalog=landgrab;User Id=sa;Password=...;"
  },
  "Azure": {
    "SignalR": { "ConnectionString": "" }  // Optional Azure SignalR
  },
  "AzureCommunicationServices": {
    "ConnectionString": "",
    "SenderAddress": "noreply@landgrab.app"
  }
}
```

---

## 8. KEY GAME LOGIC & TILE PLACEMENT RESTRICTIONS

### **Player Location Validation** (PlaceTroops)
```
1. ValidateCoordinates(playerLat, playerLng) ✓
2. Player must be in the correct hex:
   HexService.IsPlayerInHex(playerLat, playerLng, q, r, mapLat, mapLng, tileSizeMeters)
   - Converts GPS to hex coords
   - Validates exact hex match
3. Game must be in Playing phase
4. Map location must be configured
5. Player cannot be detained (Hostage)
```

### **Claim Mode Logic** (ClaimNeutralHex)

**ClaimMode.PresenceOnly:**
- Just walk into hex to claim
- Place carried troops or 1 default

**ClaimMode.PresenceWithTroop:**
- Must carry ≥1 troop
- Reduces troops by 1 on claim

**ClaimMode.AdjacencyRequired:**
```csharp
bool isAdjacent = HexService.IsAdjacentToOwned(grid, q, r, playerId, allianceId);
if (!isAdjacent && Beacon mode active) {
    // Check if beacon within 2 hex distance
    isAdjacent = teammate beacon within 2 hexes
}
if (!isAdjacent) return "This room requires neutral claims to border your territory.";
```

### **Combat Logic** (PlaceTroops attacking)
```csharp
var effectiveAttack = deployedTroops + attackerBonus;
var effectiveDefence = cell.Troops + defenderBonus;

if (effectiveAttack <= effectiveDefence)
    return "You need more effective strength to overcome the defenders.";

// Bonuses:
attackerBonus = 0;
if (PresenceBonus mode) attackerBonus += 1;
if (FrontLine mode) attackerBonus += allied players in adjacent hexes;
if (Commander in attacking hex) attackerBonus += 1;
if (Underdog: target >60% hexes) attackerBonus += 2;

defenderBonus = 0;
if (Terrain: Building/Hills) defenderBonus += 1;
if (Terrain: Steep) defenderBonus += 2;
if (Rally mode & fortified) defenderBonus += 1;
if (Fort present) defenderBonus += 1;

// Combat result:
cell.Troops = deployedTroops - defendingTroops;
player.CarriedTroops -= deployedTroops;
```

### **Map Bounds & Distance Checks**

**HexDistance (from origin):**
```csharp
public static int HexDistance(int q, int r) {
    var s = -q - r;
    return Math.Max(Math.Abs(q), Math.Max(Math.Abs(r), Math.Abs(s)));
}
```

**Tile Size Constraints:**
```
Min: 15 meters
Max: Clamped to MaxFootprintMeters (1000m) / grid footprint
Default: 25 meters
```

**GPS to Hex Conversion:**
```csharp
public static (int q, int r) LatLngToHexForRoom(double lat, double lng, 
    double mapLat, double mapLng, int tileSizeMeters) {
    var yMeters = (lat - mapLat) * MetersPerDegreeLat;
    var cosLat = Math.Cos(mapLat * Math.PI / 180d);
    var xMeters = (lng - mapLng) * MetersPerDegreeLat * Math.Max(Math.Abs(cosLat), 1e-9d);
    
    var q = (2d / 3d * xMeters) / tileSizeMeters;
    var r = (-1d / 3d * xMeters + Math.Sqrt(3d) / 3d * yMeters) / tileSizeMeters;
    return HexRound(q, r);
}
```

**Adjacency Check:**
```csharp
public static bool AreAdjacent(int q1, int r1, int q2, int r2) =>
    Neighbors(q1, r1).Any(n => n.q == q2 && n.r == r2);

public static IEnumerable<(int q, int r)> Neighbors(int q, int r) =>
    Directions.Select(d => (q + d.q, r + d.r));
    // Directions: [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
```

**Beacon Extension (Phase 5):**
```
Default adjacency distance: 0 (must be directly adjacent)
With Beacon: up to 2 hex distance
HexService.HexDistance(beaconQ - targetQ, beaconR - targetR) <= 2
```

### **Game Area Patterns**

**Centered:** Spiral radius (default: 8)
**Pattern Options:**
- WideFront: Wide horizontal strip
- TallFront: Tall vertical strip
- Crossroads: Cross-shaped
- Starburst: Star pattern

**Custom (Drawn):** Player selects hexes directly

---

## 9. TECHNOLOGY STACK

- **Framework:** .NET 8.0
- **Database:** SQL Server (EF Core)
- **Real-time:** SignalR (with Azure SignalR support)
- **Authentication:** JWT (HS256)
- **Password Hashing:** BCrypt.Net-Next
- **Email:** Azure Communication Services
- **ORM:** Entity Framework Core 8
- **Deployment:** Azure SignalR, CORS enabled

---

## 10. STARTUP FLOW

1. **Program.cs:**
   - Register services (GameService, GlobalMapService, etc.)
   - Configure JWT authentication
   - Setup CORS (localhost:5173, localhost:3000)
   - Setup rate limiting (auth: 10/min)
   - Add SignalR with JSON protocol + enum converter
   - Map REST endpoints
   - Map SignalR hub at `/hub/game`
   - SPA fallback to index.html

2. **Initialization:**
   - Run EF migrations
   - Deactivate stale rooms (>14 days)
   - Restore active rooms from database
   - Log room persistence status

---

## SUMMARY

**Landgrab Backend** is a complex, real-time multiplayer territory game engine built on:
- **SignalR** for real-time game updates
- **Hex grid system** (axial coordinates) for spatial mechanics
- **Modular game dynamics** (20+ optional game modes)
- **Persistent storage** for both global map and game rooms
- **JWT authentication** with email password reset
- **REST API** for auth, alliances, and global map
- **EF Core** for SQL Server data access

**Key Features:**
- 30-player rooms with alliance support
- Configurable claim modes (Presence, Troop, Adjacency)
- Real-world GPS integration (terrain, distances in meters)
- Advanced combat system with multiple bonus types
- 10+ copresence modes (Beacon, Stealth, Rally, Duel, Hostage, etc.)
- Mission system, terrain dynamics, player roles
- Game room persistence and recovery
- Global persistent map with attack cooldowns
