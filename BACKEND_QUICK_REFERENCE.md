# Landgrab Backend - Quick Reference Guide

## Core File Paths

**Models** (`/Models/`)
- `User.cs` - User entity (username, email, password hash)
- `Alliance.cs` - Alliance entity + AllianceMember
- `HexCell.cs` - Game room hex + GlobalHex (persistent)
- `GameState.cs` - Main game state (358 lines, all enums & DTOs)
- `PersistedRoom.cs` - Saved game room

**Database** (`/Data/`)
- `AppDbContext.cs` - EF Core context, 7 DbSets tracked

**Game Logic** (`/Services/`)
- `GameService.cs` ⭐ **3398 lines** - Core game logic
- `HexService.cs` - Hex grid calculations (static utilities)
- `GlobalMapService.cs` - Persistent global map
- `RoomPersistenceService.cs` - DB persistence
- `TerrainFetchService.cs` - Real-world terrain data
- Supporting services: TroopRegenerationService, RandomEventService, MissionService

**Real-time** (`/Hubs/`)
- `GameHub.cs` ⭐ **849 lines** - SignalR hub with 50+ methods

**REST API** (`/Endpoints/`)
- `AuthEndpoints.cs` - /api/auth
- `AllianceEndpoints.cs` - /api/alliances
- `GlobalMapEndpoints.cs` - /api/global

---

## Key Constants & Bounds

```csharp
DefaultGridRadius = 8              // Spiral grid from map center
DefaultTileSizeMeters = 25        // Default hex size
MaxFootprintMeters = 1_000        // Max game area physical size
MinimumDrawnHexCount = 7          // Min for custom maps
MaxEventLogEntries = 100          // Event log cap
MaxPlayers = 30                   // Per room
MaxEventLogEntries = 100          // Event log max
Colors = 16 player colors
AllianceColors = 8 alliance colors

// Tile size constraints
Min: 15m
Default: 25m
Max: Calculated from footprint (15-1000m)

// Hex distance
HexDistance(q, r) = max(|q|, |r|, |-q-r|)

// Coordinate system
Axial coordinates (q, r)
Flat-top hexagons
6 neighbors per hex
```

---

## Claim Mode Logic (Critical for Tile Placement!)

```csharp
enum ClaimMode {
    PresenceOnly,        // Just walk into hex to claim
    PresenceWithTroop,   // Need ≥1 troop to claim (costs 1 troop)
    AdjacencyRequired    // Must be adjacent to owned territory
}
```

### PresenceOnly
```csharp
var troopsPlaced = player.CarriedTroops > 0 ? player.CarriedTroops : 1;
SetCellOwner(cell, player);
cell.Troops = troopsPlaced;
ResetCarriedTroops(player);
```

### PresenceWithTroop
```csharp
if (player.CarriedTroops < 1)
    return "You must be carrying at least 1 troop...";
SetCellOwner(cell, player);
cell.Troops = 1;
player.CarriedTroops -= 1;
```

### AdjacencyRequired
```csharp
bool isAdjacent = HexService.IsAdjacentToOwned(grid, q, r, playerId, allianceId);

// Phase 5: Beacon extends range to 2 hexes
if (!isAdjacent && Beacon mode active) {
    isAdjacent = state.Players.Any(p => p.IsBeacon
        && HexDistance(beaconHex - targetHex) <= 2
        && sameAlliance);
}

if (!isAdjacent)
    return "This room requires neutral claims to border your territory.";

var adjacentTroopsPlaced = player.CarriedTroops > 0 ? player.CarriedTroops : 1;
SetCellOwner(cell, player);
cell.Troops = adjacentTroopsPlaced;
ResetCarriedTroops(player);
```

---

## Player Location Validation (PlaceTroops)

```csharp
// 1. GPS coordinates must be valid
ValidateCoordinates(playerLat, playerLng)

// 2. Convert GPS to hex coordinates
var playerHex = HexService.LatLngToHexForRoom(
    playerLat, playerLng,
    mapLat, mapLng,
    tileSizeMeters);

// 3. Must match target hex exactly
if (playerHex.q != q || playerHex.r != r)
    return "You must be physically inside that hex...";

// 4. Cannot be detained (Hostage mode)
if (player.HeldByPlayerId != null)
    return "You are detained and cannot take actions.";
```

---

## GPS to Hex Conversion (Most Important!)

```csharp
public static (int q, int r) LatLngToHexForRoom(
    double lat, double lng, 
    double mapLat, double mapLng, 
    int tileSizeMeters)
{
    var yMeters = (lat - mapLat) * MetersPerDegreeLat;  // 111_320
    var cosLat = Math.Cos(mapLat * Math.PI / 180d);
    var xMeters = (lng - mapLng) * MetersPerDegreeLat * Math.Max(Math.Abs(cosLat), 1e-9d);
    
    // Axial coordinates from cartesian
    var q = (2d / 3d * xMeters) / tileSizeMeters;
    var r = (-1d / 3d * xMeters + Math.Sqrt(3d) / 3d * yMeters) / tileSizeMeters;
    
    return HexRound(q, r);  // Convert float to int
}
```

---

## Combat System

```csharp
var effectiveAttack = deployedTroops + attackerBonus;
var effectiveDefence = cell.Troops + defenderBonus;

if (effectiveAttack <= effectiveDefence)
    return "You need more effective strength...";

// ATTACKER BONUSES
if (PresenceBonus mode) attackerBonus += 1;
if (FrontLine mode) attackerBonus += (count of adjacent hexes with allied players);
if (Commander in attacking hex) attackerBonus += 1;
if (Underdog: defender >60% hexes) attackerBonus += 2;

// DEFENDER BONUSES  
if (Terrain: Building | Hills) defenderBonus += 1;
if (Terrain: Steep) defenderBonus += 2;
if (Rally mode && fortified) defenderBonus += 1;
if (Fort present) defenderBonus += 1;

// Result
cell.Troops = deployedTroops - defendingTroops;
player.CarriedTroops -= deployedTroops;
CaptureHex(cell, player);
```

---

## HexService Static Methods (Reference)

```csharp
// Grid operations
Neighbors(q, r)                      // 6 neighbors
AreAdjacent(q1, r1, q2, r2)         // Check adjacency
Spiral(radius)                       // Generate spiral coordinates
BuildGrid(radius)
BuildGrid(coordinates)

// Distance & metrics
HexDistance(q, r)                    // From origin
InferRadius(coordinates)
GetFootprintMetrics(coordinates, tileSizeMeters)
GetMaxTileSizeForFootprint(coordinates, maxMeters)

// Geometry
IsConnected(coordinates)             // All hexes connected?
IsAdjacentToOwned(grid, q, r, playerId, allianceId)
CountAllyBorderHexes(grid, q, r, defenderId, defenderAllianceId)

// Territory
TerritoryCount(grid, playerId)
AllianceTerritoryCount(grid, allianceId)

// Coordinate conversion
HexToLatLng(q, r, mapLat, mapLng, tileSizeMeters)
LatLngToHexForRoom(lat, lng, mapLat, mapLng, tileSizeMeters)
IsPlayerInHex(playerLat, playerLng, q, r, mapLat, mapLng, tileSizeMeters)

// Ring distribution
GetEvenlySpacedRing(count, ringRadius, gridRadius)
SpiralSearch(startQ, startR, maxRadius)
```

---

## SignalR Hub - Main Methods

**Room Management:**
- `CreateRoom()` - New game
- `JoinRoom(roomCode)` - Join existing
- `RejoinRoom(roomCode)` - Reconnect
- `ReturnToLobby()` - Leave game
- `GetMyRooms()` - List player's games

**Game Setup (Lobby):**
- `SetMapLocation(lat, lng)` - Set center
- `SetTileSize(meters)` - Set hex size
- `SetClaimMode(mode)` - Choose ClaimMode
- `SetAlliance(name)` - Assign to alliance
- `SetCopresencePreset(preset)` - Quick mode selection
- `SetGameDynamics(dynamics)` - Configure all modes
- `StartGame()` - Begin playing

**Playing:**
- `UpdatePlayerLocation(lat, lng)` - Update GPS position
- `PickUpTroops(q, r, count, lat, lng)` - Pick up troops
- `PlaceTroops(q, r, lat, lng, troopCount?, claimForSelf?)` ⭐ **Main action**
  - Validates player in hex
  - Handles claiming/reinforcement/combat
- `ReClaimHex(q, r, mode)` - Reclaim territory
- `ActivateBeacon()` - Phase 5 mode
- `ActivateStealth()` - Phase 6 mode
- `AttackGlobalHex(fromQ, fromR, toQ, toR)` - Global map combat

---

## Database Schema (AppDbContext)

```csharp
DbSet<User>
DbSet<Alliance>
DbSet<AllianceMember>
DbSet<GlobalHex>                    // (Q,R) composite key
DbSet<GameEvent>
DbSet<PasswordResetToken>
DbSet<PersistedRoom>                // Code as key
```

**Relationships:**
- User ↔ AllianceMember → Alliance (many-to-many)
- AllianceMember.OnDelete = Cascade
- GlobalHex indexes on OwnerUserId, OwnerAllianceId

**Connection String:** SQL Server (configured in appsettings.json)

---

## REST API Summary

```
POST   /api/auth/register                    // Register
POST   /api/auth/login                       // Login (JWT)
POST   /api/auth/forgot-password             // Request reset
POST   /api/auth/reset-password              // Reset password

GET    /api/alliances/                       // My alliances
POST   /api/alliances/                       // Create alliance
POST   /api/alliances/{id}/join              // Join
DELETE /api/alliances/{id}/leave             // Leave

GET    /api/global/hexes?lat=x&lng=y&radius=n    // Nearby hexes
GET    /api/global/leaderboard               // Top 20 players
GET    /api/global/myterritories             // My hexes

SignalR /hub/game                            // Real-time game
```

---

## Important Game Flow

1. **Lobby Phase:**
   - Host creates room
   - Players join and configure
   - Host sets map location, tile size, claim mode, etc.
   - Host starts game

2. **Playing Phase:**
   - Players update location via GPS (UpdatePlayerLocation)
   - Players place troops in hexes (PlaceTroops)
   - Game validates claim mode, proximity, combat
   - State broadcasts to all players

3. **Game Over Phase:**
   - Win condition checked after tile captures
   - Winner declared, game ends
   - Room optionally persisted to DB

4. **Persistence:**
   - Rooms saved to DB periodically
   - Restored on startup if active
   - Stale rooms (>14 days) deactivated

---

## Error Codes (GameHub)

```csharp
MapErrorCode(message):
  "ROOM_NOT_FOUND"        // Room not found
  "ROOM_FULL"             // 30 players max
  "ROOM_NOT_JOINED"       // Not in a room
  "ROOM_ALREADY_JOINED"   // Already in room
  "HOST_REQUIRED"         // Only host can do this
  "GENERAL"               // Other errors
```

---

## Configuration (appsettings.json)

```json
{
  "Jwt": {
    "Secret": "...",               // Via environment variable
    "Issuer": "landgrab",
    "Audience": "landgrab"
  },
  "ConnectionStrings": {
    "DefaultConnection": "Server=...;Database=landgrab;User Id=sa;..."
  },
  "AllowedOrigins": [              // CORS
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  "Azure": {
    "SignalR": { "ConnectionString": "" }  // Optional
  }
}
```

---

## Key Insights

1. **Axial Hex System** - Uses (q, r) coordinates, flat-top hexagons
2. **GPS Integration** - Converts GPS to hex coords for proximity validation
3. **Modular Dynamics** - 20+ optional game modes (copresence)
4. **ClaimMode** - Critical: defines how territories can be claimed
5. **Combat System** - Dice-less, strength-based with multiple bonus types
6. **Real-time** - SignalR broadcasts state changes to all players
7. **Persistence** - Game rooms saved to SQL Server, restored on startup
8. **Global Map** - Separate persistent map outside of game rooms
