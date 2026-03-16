# LandGrab Backend Game Dynamics - Comprehensive Analysis

## Executive Summary
LandGrab is a location-based territory control game with extensive customizable game dynamics. The backend implements a complex system of game mechanics organized across **20+ services**, a **SignalR hub**, and numerous **game models**. The game supports both **single-player** and **alliance-based** gameplay with real-time multiplayer synchronization.

---

## 1. CORE GAME PHASES & FLOWS

### Game Phases (3 states):
- **Lobby**: Room setup, player configuration, pre-game settings
- **Playing**: Active gameplay, real-time location tracking
- **GameOver**: Winner determined, game concluded

**File**: `/backend/Landgrab.Api/Models/GameState.cs` (lines 1-12)

---

## 2. HEX GRID SYSTEM

### Hex Coordinate System
- **Type**: Cubic hex coordinates (Q, R coordinates with implicit S = -Q-R)
- **Grid Structure**: Spiral-based generation around center
- **Key Methods**: 
  - `HexService.LatLngToHexForRoom()` - Converts GPS coords to hex coordinates
  - `HexService.HexToLatLng()` - Reverse conversion
  - `HexService.IsPlayerInHex()` - Player collision detection
  - `HexService.HexDistance()` - Calculate distance between hexes
  - `HexService.Neighbors()` - Get adjacent hexes
  - `HexService.SpiralSearch()` - Find nearest tiles in expanding rings

**File**: `/backend/Landgrab.Api/Services/HexService.cs` (lines 1-283)

### Hex Cell Properties
Each hex (`HexCell`) tracks:
- `Q, R`: Coordinates
- `OwnerId`: Player who owns it
- `OwnerAllianceId`: Alliance affiliation
- `Troops`: Military units (1-N)
- `IsMasterTile`: Central neutral zone (invincible)
- `IsFortified`: Rally bonus (2+ allied players present)
- `IsFort`: Engineer-built permanent structure
- `TerrainType`: Elevation/terrain defense bonus
- `LastVisitedAt`: Shepherd tracking
- `ContestProgress`: PresenceBattle capture progress
- `EngineerBuiltAt`: Fort construction timer

**File**: `/backend/Landgrab.Api/Models/HexCell.cs`

---

## 3. GAME CONFIGURATION & SETUP

### Map Configuration
1. **Map Location Setup** - GPS center point + tile size
2. **Game Area Modes**:
   - **Centered**: Circular area from master tile
   - **Pattern**: Predefined patterns (WideFront, TallFront, Crossroads, Starburst)
   - **Drawn**: Custom hex coordinates
   - **Custom**: User-defined areas

3. **Master Tile**: Central neutral hex (invincible, no troops depleted)

**File**: `/backend/Landgrab.Api/Services/MapAreaService.cs` (lines 1-150+)

### Claim Mode Configuration
- **PresenceOnly**: Place troops to claim (no adjacency required)
- **PresenceWithTroop**: Must carry ≥1 troop
- **AdjacencyRequired**: Must border owned territory (except Beacon extends 2 hexes)

**File**: `/backend/Landgrab.Api/Services/GameConfigService.cs` (lines 11-32, 98-125)

### Win Conditions (3 types)
1. **TerritoryPercent**: Claim X% of claimable hexes (1-100%)
2. **Elimination**: Last alliance/player standing
3. **TimedGame**: Highest territory after N minutes

**File**: `/backend/Landgrab.Api/Services/WinConditionService.cs` (lines 172-230)

---

## 4. ALLIANCE SYSTEM

### Alliance Management
- Max 8 alliances per game
- Players join via `SetAlliance()` (dynamically create or join existing)
- Host can configure pre-defined alliances via `ConfigureAlliances()`
- Alliance colors auto-assigned from palette

### Alliance Properties
```
- Id, Name, Color
- MemberIds: List of player IDs
- TerritoryCount: Cached count (refreshed after claims/captures)
- HQHexQ/HQHexR: Headquarters location
- ClaimFrozenUntil: Timer if HQ captured
- UnderdogBoostUntil: Underdog Pact boost expiry
```

### Key Actions
- **SetAlliance()**: Player joins/creates alliance
- **ConfigureAlliances()**: Host pre-defines alliances
- **DistributePlayersRandomly()**: Auto-assign players to alliances
- **SetAllianceHQ()**: Designate alliance headquarters
- **AssignAllianceStartingTile()**: Give starting hex to alliance

**File**: `/backend/Landgrab.Api/Services/AllianceConfigService.cs` (lines 1-250+)

---

## 5. TROOP MANAGEMENT SYSTEM

### Troop Mechanics
- **Carried Troops**: Player inventory (0-N)
- **Placed Troops**: Hexes store troops (1-N minimum for ownership)
- **Reinforcement**: Place carried troops on owned/allied hexes
- **Pick-up**: Extract troops from owned hex (max per hex)

### Troop Actions
1. **PickUpTroops(hex, count)**: Extract from own hex
   - Validation: Must be in hex, own it, have enough troops
   - Ambush check: Hostile present → fails, lose 1 troop
   - Returns: `AmbushResult` if interrupted

2. **PlaceTroops(hex, count)**: Deploy troops (attack or reinforce)
   - Neutral hex: Claim with troops
   - Own hex: Reinforce
   - Enemy hex: Combat (deterministic strength comparison)
   
3. **Combat Resolution**:
   - Attacker strength = `carried_troops + bonuses`
   - Defender strength = `hex_troops + bonuses`
   - Win if attacker > defender
   - Survivor troops = `attacker_strength - defender_strength`

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 391-695)

### Troop Regeneration
- **Base**: +1 per regen tick (~30 sec)
- **Bonuses**:
  - Building terrain: +1
  - Defender role present: +1 (doubles total)
  - Timed Escalation: +N (1 per 30 min elapsed)
- **Penalties**:
  - Shepherd mode unvisited >3 min: -1 (decay instead)
  - Drain mode hostile present: skip regen
  - Supply Lines isolated: skip regen

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 752-968)

---

## 6. COMBAT SYSTEM

### Combat Mechanics
- **No dice rolls** (simplified deterministic system)
- **Effective Strength Calculation**:
  
```
Attacker = carried_troops + PresenceBonusIfActive + CommanderIfPresent + FrontLineIfActive
Defender = hex_troops + TerrainBonus + RallyIfFortified + FortPermanentBonus + UnderdogPactBonus
```

### Combat Bonuses

| Bonus Type | Value | Condition | Phase |
|-----------|-------|-----------|-------|
| Presence | +1 attacker | Attacker physically in hex | PresenceBonus |
| Terrain (Building/Hills) | +1 defender | Hex terrain | TerrainEnabled |
| Terrain (Steep) | +2 defender | Hex terrain | TerrainEnabled |
| Rally | +1 defender | ≥2 allied players in hex | Rally |
| FrontLine | +1 attacker per ally | Allied player in adjacent hex | FrontLine |
| Commander | +1 attacker | Commander role in attack hex | PlayerRoles |
| Fort | +1 defender | Engineer-built structure | PlayerRoles |
| Underdog Pact | +2 attacker | Target alliance >60% territory | UnderdogPact |

### Combat Capture
- Attacker wins only if `effective_attack > effective_defense`
- Captured hex: Owner → Attacker, Troops = `attacker_strength - defender_strength`
- Previous owner loses the hex
- Event logged: `TileCaptured`

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 478-695)

---

## 7. HEADQUARTERS (HQ) SYSTEM

### HQ Mechanics (Phase 4)
- Each alliance designates one HQ hex
- **Capture penalty**: 5-minute claim freeze on alliance
- After capture, alliance cannot claim neutrals for 5 min
- HQ must be set before game starts

### Methods
- **SetAllianceHQ(q, r, allianceId)**: Designate HQ (host only)
- **HQ Capture Check**: Triggered in `PlaceTroops()` if hex owner captured

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 652-672)
**File**: `/backend/Landgrab.Api/Services/AllianceConfigService.cs` (lines 200+)

---

## 8. PLAYER ROLES SYSTEM (Phase 4)

### Roles (5 types)
Each player can have one role during gameplay:

#### 1. **Commander**
- **Effect**: Provides +1 attack bonus if present in attacking hex
- **Activation**: Set in lobby via `SetPlayerRole()`
- **File**: `GameplayService.cs` lines 597-604

#### 2. **Scout**
- **Effect**: First visit to new hex → +2 troops to nearest owned tile
- **Activation**: Automatic via `UpdatePlayerLocation()` visits
- **Visited Hexes**: Tracked in `player.VisitedHexes` set
- **File**: `GameplayService.cs` lines 83-102

#### 3. **Defender**
- **Effect**: Double regeneration when physically present (+1 extra regen)
- **Activation**: Automatic during regen tick
- **File**: `GameplayService.cs` lines 889-895

#### 4. **Saboteur**
- **Effect**: Enemy hexes lose -1 troop per location update (drains)
- **Activation**: Automatic on each `UpdatePlayerLocation()` call
- **File**: `GameplayService.cs` lines 105-128

#### 5. **Engineer**
- **Effect**: Build forts - stay in own hex ≥10 min → permanent +1 defense
- **Activation**: Automatic once 10 min threshold in hex met
- **Fort Duration**: Permanent until captured
- **File**: `GameplayService.cs` lines 130-160

**Model**: `/backend/Landgrab.Api/Models/GameState.cs` lines 85-93

---

## 9. COPRESENCE MODES (Multiplayer Interactions)

### Overview
Copresence modes are location-based game mechanics triggered when players share a hex. **18 modes** activate conditionally.

### Modes Implemented

#### **Standoff** (Phase 2)
- **Effect**: Hostile player presence blocks tile actions (pickup/place)
- **Condition**: Enemy player in same hex
- **Resolution**: Must leave hex or wait for enemy to leave
- **File**: `GameplayService.cs` lines 514-520

#### **PresenceBattle** (Phase 10)
- **Effect**: Hostile copresence gradually converts territory (0-1.0 progress)
- **Mechanics**: 
  - Progress = (hostile_count - friendly_count) * 0.1 per tick
  - Capture at 1.0 progress
  - Decay -0.05 when no hostiles
- **File**: `GameplayService.cs` lines 898-957

#### **PresenceBonus** (Phase 2)
- **Effect**: Physical presence = +1 attack bonus
- **Calculation**: Attacker must be in hex
- **File**: `GameplayService.cs` lines 566-567

#### **Ambush** (Phase 5)
- **Effect**: Hostile presence during troop pickup → lose 1 carried troop
- **Trigger**: PickUpTroops() with enemy present
- **Result**: Returns `AmbushResult` to frontend
- **File**: `GameplayService.cs` lines 416-454

#### **Toll** (Phase 5)
- **Effect**: Entering enemy hex with owner present → lose 1 carried troop
- **Condition**: Must carry troops, owner physically present
- **Trigger**: Automatic on `UpdatePlayerLocation()`
- **Result**: Toll goes to hex owner
- **File**: `GameplayService.cs` lines 162-197

#### **Duel** (Phase 10)
- **Effect**: Hostile copresence initiates 30-second duel challenge
- **Resolution**: 
  - Score = territory_count + carried_troops + 1d6 random
  - Winner takes hex
  - Loser in same hex can accept/decline
- **File**: `GameplayService.cs` lines 359-382
- **Service**: `DuelService.cs` (lines 12-99)

#### **Rally** (Phase 3)
- **Effect**: ≥2 allied players in hex → `IsFortified = true` → +1 defense
- **Condition**: Copresence of teammates
- **Duration**: Dynamic - while players present
- **File**: `GameplayService.cs` lines 46-56, 580-582

#### **Drain** (Phase 8)
- **Effect**: Hostile presence in owned hex → skip normal regeneration
- **Condition**: Checked per regen tick
- **File**: `GameplayService.cs` lines 843-851

#### **Stealth** (Phase 6)
- **Effect**: Become invisible to other players for 3 min
- **Activation**: `ActivateStealth()` hub method
- **Cooldown**: 8 min total (3 active + 5 cooldown)
- **Break**: Hostile copresence ends stealth
- **File**: `AbilityService.cs` lines 71-107
- **File**: `GameplayService.cs` lines 216-238

#### **Hostage** (Phase 10)
- **Effect**: Detain hostile player for 3 min (they can't act)
- **Activation**: `DetainPlayer()` requires same hex
- **Release**: Timer expires OR allied player in hex
- **File**: `DuelService.cs` lines 102-197

#### **Scout** (Phase 3)
- **Effect**: Visit new hex → +2 troops to nearest owned tile
- **Tracking**: `player.VisitedHexes` set
- **File**: `GameplayService.cs` lines 74-103

#### **Beacon** (Phase 5)
- **Effect**: Mark position to extend adjacency +2 hexes for allies
- **Activation**: `ActivateBeacon()` stores current lat/lng
- **Range**: +2 hex range for claim checks
- **Auto-Deactivate**: Move >1 hex away
- **File**: `AbilityService.cs` lines 12-47
- **File**: `GameplayService.cs` lines 199-214

#### **FrontLine** (Phase 3)
- **Effect**: +1 attack per adjacent hex with allied player present
- **Calculation**: Count neighbors with teammates
- **File**: `GameplayService.cs` lines 584-595

#### **Relay** (Phase 5)
- **Status**: TODO - Planned but not implemented
- **Design**: Allow remote reinforce when ally in adjacent hex
- **File**: `GameplayService.cs` line 530 (comment)

#### **JagerProoi** (Phase 6 - Hunter/Prey)
- **Effect**: One player designated as "prey" - hunter catches → +3 bonus troops, prey rotates
- **Mechanics**:
  - Auto-assign prey to lowest territory player
  - Hunter same hex as prey → prey captured
  - Hunter gets +3 troops, next lowest becomes prey
- **File**: `GameplayService.cs` lines 292-357

#### **Shepherd** (Phase 3)
- **Effect**: 
  - Update `LastVisitedAt` when player in own hex
  - Unvisited >3 min → decay (-1 troop) instead of regen
- **Condition**: Player must be in hex
- **File**: `GameplayService.cs` lines 58-72, 853-869

#### **CommandoRaid** (Phase 6)
- **Effect**: Bypass adjacency - claim distant neutral hex
- **Range**: Up to 3 hexes away
- **Duration**: 5 min deadline
- **Failure**: Deadline expires → raid fails, no hex claimed
- **File**: `AbilityService.cs` lines 109-164
- **File**: `GameplayService.cs` lines 240-290

### Copresence Preset System
Named presets combine modes:
- Defined in `GameStateCommon.CopresencePresets`
- Host selects via `SetCopresencePreset()`
- Custom mode: "Aangepast" (Dutch for "Customized")

**File**: `/backend/Landgrab.Api/Services/GameConfigService.cs` (lines 127-150)

---

## 10. ABILITY SYSTEM (Special Powers)

### Beacon (Phase 5)
- **Cost**: None (cooldown-based)
- **Effect**: Extends ally adjacency +2 hexes for claims
- **Duration**: Indefinite until deactivated
- **Auto-Break**: Move >1 hex away
- **File**: `/backend/Landgrab.Api/Services/AbilityService.cs` (lines 12-69)

### Stealth (Phase 6)
- **Duration**: 3 minutes active
- **Cooldown**: 8 minutes total (3 active + 5 cooldown)
- **Break Condition**: Hostile copresence in same hex
- **File**: `/backend/Landgrab.Api/Services/AbilityService.cs` (lines 71-107)

### CommandoRaid (Phase 6)
- **Range**: Up to 3 hexes
- **Duration**: 5 minutes to reach target
- **Cooldown**: 15 minutes
- **Success**: Reach target hex → claim it
- **Failure**: Timeout → raid expires
- **File**: `/backend/Landgrab.Api/Services/AbilityService.cs` (lines 109-164)

---

## 11. SUPPLY LINES SYSTEM (Phase 7)

### Mechanics
- **Purpose**: Isolated hexes don't regenerate (must stay connected)
- **Connection**: BFS from any owned hex in alliance territory
- **Master Tile**: Counts as connected
- **Check Per Tick**: Each regen applies connection test

### Implementation
- Breadth-first search from each alliance's owned hexes
- Hex in `connectedHexes` set = regenerates
- Hex not in set = skips regen

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 782-839)

---

## 12. TERRAIN SYSTEM

### Terrain Types (9 types)
```
None, Water, Building, Road, Path, Forest, Park, Hills, Steep
```

### Defense Bonuses
| Terrain | Defense Bonus | Note |
|---------|---------------|------|
| Water | Impassable | Can't attack through water |
| Building | +1 defense | +1 extra regen |
| Hills | +1 defense | - |
| Steep | +2 defense | Strongest |
| Others | None | Road, Path, Forest, Park |

### Fetch Source
- OSM Overpass API (queried via `TerrainFetchService`)
- Lazy-loaded on first game start
- Cached in game state

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 570-578)

---

## 13. FOG OF WAR SYSTEM (Phase 7)

### Implementation
- **Per-Player Filtering**: Each player sees filtered grid state
- **Hidden Cells**: Enemy territory beyond view range
- **Broadcast Method**: Individual snapshots per player during gameplay
- **Observer Mode**: Host can see all (observer mode toggle)

### Calculation
- `GameService.CreateHiddenFogCellsForBroadcast()` - Generate hidden cells
- `GameService.GetPlayerSnapshot()` - Filter state per player
- Applied during `BroadcastState()` if FogOfWar enabled

**File**: `/backend/Landgrab.Api/Hubs/GameHub.cs` (lines 89-129)

---

## 14. HQ CAPTURE MECHANICS (Phase 4)

### Mechanics
1. **Set HQ**: Alliance designates one hex as headquarters
2. **Capture**: Enemy captures HQ hex
3. **Penalty**: Alliance claim-frozen for 5 minutes
4. **Duration**: Until 5 min timer expires

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 652-672)

---

## 15. DUEL SYSTEM (Phase 10)

### Duel Flow
1. **Initiate**: Automatic when hostile players same hex (30s window)
2. **Notification**: Challenged player receives `DuelChallenge` message
3. **Accept/Decline**: 
   - Accept: Combat resolved immediately
   - Decline: Duel expires
4. **Resolution**:
   - Score = territory + carried troops + 1d6
   - Winner gets hex
   - Event logged

### Pending Duels
- Stored in `GameRoom.PendingDuels` (dict by ID)
- Expire after 30 seconds
- Cleanup via `ProcessDuelExpiry()`

**File**: `/backend/Landgrab.Api/Services/DuelService.cs` (lines 1-210)

---

## 16. MISSIONS SYSTEM (Phase 9)

### Mission Types
- **Team Missions**: Alliance-wide objectives
- **Personal Missions**: Individual player tasks
- **Interim Missions**: Time-limited special events

### Mission Examples
| Mission | Type | Objective | Reward |
|---------|------|-----------|--------|
| Scout Patrol | Recon | Visit 8 hexes | +2 troops to all |
| Frontline Fighter | Territorial | Win 2 attacks | +3 troops random |
| Divide and Conquer | Territorial | Own hexes in 3 quadrants | +3 troops random |
| Flag Planting | TimeBound | Claim 3 neutrals in 10 min | +3 troops random |
| Last Defender | TimeBound | No losses 5 min | +5 troops random |

### Generation
- Generated every 5 minutes (background tick)
- Tracked progress per mission
- Completion rewards troops to hexes
- Expiry handling

**File**: `/backend/Landgrab.Api/Services/MissionService.cs` (lines 1-100+)

---

## 17. RANDOM EVENTS SYSTEM (Phase 8)

### Events (4 types)
Fired ~every 30 min (33% chance per 10-min tick)

#### 1. **Calamity**
- Random owned hex loses all troops
- File: `RandomEventService.cs` lines 64-82

#### 2. **Epidemic**
- Largest alliance loses 2 troops on random hex
- File: `RandomEventService.cs` lines 85-111

#### 3. **BonusTroops**
- All alliances +2 troops to random hex
- File: `RandomEventService.cs` lines 114-129

#### 4. **RushHour**
- Claimed hexes count double for 5 minutes
- File: `RandomEventService.cs` lines 132-142

**File**: `/backend/Landgrab.Api/Services/RandomEventService.cs` (lines 1-164)

---

## 18. DYNAMIC GAME FEATURES

### Timed Escalation (Phase 8)
- **Effect**: +1 regen bonus per 30 min elapsed
- **Calculation**: `escalation = int(elapsed_minutes / 30)`
- **File**: `GameplayService.cs` lines 774-780

### Underdog Pact (Phase 8)
- **Effect**: +2 attack bonus when attacking alliance >60% territory
- **Check**: Per `PlaceTroops()` combat
- **Calculation**: `target_alliance_hexes / total_hexes > 0.6`
- **File**: `GameplayService.cs` lines 610-620

### Neutral NPC (Phase 7)
- **Status**: Placeholder for NPC-controlled neutral faction
- **Activation**: `NeutralNPCEnabled` flag
- **File**: `GameplayService.cs` line 135 (assignment only)

### Rush Hour (Phase 8)
- **Effect**: Claimed hexes count double toward win condition
- **Duration**: 5 minutes (one regen cycle)
- **Flag**: `room.State.IsRushHour`
- **File**: `GameplayService.cs` lines 763-769

---

## 19. WIN CONDITIONS & ACHIEVEMENTS

### Win Condition Types
1. **TerritoryPercent**: Alliance/Player reaches X% (1-100)
2. **Elimination**: Last alliance/player with hexes wins
3. **TimedGame**: Highest territory after N minutes

**File**: `/backend/Landgrab.Api/Services/WinConditionService.cs` (lines 172-230)

### Achievement System (4 achievements)
Computed on game over:

| Achievement | Criteria | Value |
|-------------|----------|-------|
| Territory Leader | Highest `TerritoryCount` | Territory count |
| Army Commander | Most total troops on map | Troop total |
| Conqueror | Most `TileCaptured` events | Capture count |
| First Strike | Earliest `TileCaptured` event | - |

**File**: `/backend/Landgrab.Api/Services/WinConditionService.cs` (lines 46-142)

---

## 20. GLOBAL MAP SYSTEM

### Global Map Layer
- **Separate persistence**: Global hexes stored in DB
- **Scale**: 1 hex ≈ 1km
- **Purpose**: Persistent world map vs game-room local maps
- **Mechanics**:
  - Adjacent hex attacks only
  - Attack roll vs defend roll (d6 + advantage/disadvantage)
  - 5-minute attack cooldown on failed attacks
  - Auto-starting hexes for new players

**File**: `/backend/Landgrab.Api/Services/GlobalMapService.cs` (lines 1-232)

---

## 21. GAME HUBS & SIGNALR ENDPOINTS

### Main Hub: GameHub
- **Auth**: Required (JWT)
- **Connection Events**: 
  - `OnConnectedAsync()` - Log connection
  - `OnDisconnectedAsync()` - Clean up room connection

### Hub Methods

#### Lobby Methods (GameHub.Lobby.cs)
- `CreateRoom()` - Create new room
- `JoinRoom()` - Join existing room
- `LeaveRoom()` - Disconnect from room
- `SetAllianceName()` - Change alliance
- `SetPlayerRole()` - Assign role
- `StartGame()` - Begin game

#### Gameplay Methods (GameHub.Gameplay.cs)
- `UpdatePlayerLocation(lat, lng)` - Report GPS position
- `PickUpTroops(q, r, count, playerLat, playerLng)` - Extract troops
- `PlaceTroops(q, r, playerLat, playerLng, count?, claimForSelf?)` - Deploy troops
- `ReClaimHex(q, r, mode)` - Change ownership type
- `ActivateBeacon()` - Set beacon
- `DeactivateBeacon()` - Remove beacon
- `ActivateStealth()` - Start invisibility
- `ActivateCommandoRaid(targetQ, targetR)` - Launch raid
- `AcceptDuel(duelId)` - Accept duel challenge
- `DeclineDuel(duelId)` - Reject duel
- `DetainPlayer(targetPlayerId)` - Hostage mode
- `AttackGlobalHex(fromQ, fromR, toQ, toR)` - Global map attack
- `JoinGlobalMap(lat, lng)` - Load global map

#### Host Methods (GameHub.Host.cs)
- `SetHostObserverMode(enabled)` - Toggle observer
- `UpdateGameDynamicsLive(dynamics)` - Change settings mid-game
- `TriggerGameEvent(eventType, targetQ, targetR, targetAllianceId)` - Manual events
- `SendHostMessage(message, targetAllianceIds)` - Host broadcast
- `PauseGame(paused)` - Pause/resume

**Files**: 
- `/backend/Landgrab.Api/Hubs/GameHub.cs` (main, 248 lines)
- `/backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs` (381 lines)
- `/backend/Landgrab.Api/Hubs/GameHub.Host.cs` (lines 1-150+)
- `/backend/Landgrab.Api/Hubs/GameHub.Lobby.cs` (lines 1-400+)

---

## 22. REST ENDPOINTS

### Endpoints Implemented
1. **AllianceEndpoints.cs**: Global alliance leaderboard/management
2. **AuthEndpoints.cs**: JWT login/registration
3. **GlobalMapEndpoints.cs**: Global map API
4. **MapTemplateEndpoints.cs**: Saved game area templates

**Files**: 
- `/backend/Landgrab.Api/Endpoints/AllianceEndpoints.cs`
- `/backend/Landgrab.Api/Endpoints/AuthEndpoints.cs`
- `/backend/Landgrab.Api/Endpoints/GlobalMapEndpoints.cs`
- `/backend/Landgrab.Api/Endpoints/MapTemplateEndpoints.cs`

---

## 23. TESTING INFRASTRUCTURE

### Test Project
- **Location**: `/backend/Landgrab.Tests/`
- **Framework**: xUnit
- **Status**: Partial coverage (6 test classes)

### Test Files
1. **GameplayServiceTests.cs** - Troop pickup/placement, combat
2. **AbilityServiceTests.cs** - Beacon, stealth, commando raid
3. **HexServiceTests.cs** - Hex conversions, distance, adjacency
4. **WinConditionTests.cs** - Win condition logic
5. **GameStateCommonTests.cs** - State snapshots, event logs
6. **DuelServiceTests.cs** - Duel mechanics
7. **PasswordServiceTests.cs** - Auth hashing
8. **JwtServiceTests.cs** - Token generation

### Test Support
- `ServiceTestContext.cs` - DI setup
- `GameStateBuilder.cs` - Fluent state construction
- `TestServiceFactory.cs` - Service mocking

**Files**: `/backend/Landgrab.Tests/Services/` and `/backend/Landgrab.Tests/Auth/`

---

## 24. GAME SERVICES DEPENDENCY MAP

```
GameService (facade)
├── RoomService (room creation/joining)
├── LobbyService (pre-game setup)
├── AllianceConfigService (alliance management)
├── MapAreaService (map configuration)
├── GameTemplateService (saved areas)
├── GameConfigService (game settings)
├── GameplayService (core gameplay)
│   ├── HexService (hex calculations)
│   ├── GameStateService (persistence)
│   └── DuelService (combat resolution)
├── AbilityService (special abilities)
├── DuelService (duel mechanics)
├── HostControlService (host admin)
├── GameStateService (persistence)
├── WinConditionService (victory logic)
├── MissionService (background missions)
├── RandomEventService (background events)
├── TroopRegenerationService (background regen)
├── GlobalMapService (persistent world)
└── TerrainFetchService (OSM terrain)
```

---

## 25. KEY GAME MODELS

### GameState (Main State Container)
```csharp
- RoomCode, Phase, GameMode
- Players[], Alliances[]
- Grid (Dictionary<string, HexCell>)
- MapLat/Lng, TileSizeMeters, GridRadius
- ClaimMode, WinConditionType, WinConditionValue
- GameDynamics (all feature flags)
- EventLog (all game history)
- Missions[], Achievements[]
- WinnerId/Name, IsAllianceVictory
```

### HexCell
```csharp
- Q, R (coordinates)
- OwnerId, OwnerAllianceId, OwnerName, OwnerColor
- Troops (military units)
- IsMasterTile, IsFortified, IsFort
- TerrainType
- LastVisitedAt (Shepherd)
- ContestProgress, ContestingPlayerId (PresenceBattle)
- EngineerBuiltAt (Fort tracking)
```

### PlayerDto
```csharp
- Id, Name, Color, IsHost
- AllianceId, AllianceName, AllianceColor
- CurrentLat/Lng (GPS position)
- CarriedTroops, CarriedTroopsSourceQ/R
- TerritoryCount (cached)
- VisitedHexes (Scout tracking)
- Role (Commander/Scout/Defender/Saboteur/Engineer)
- IsBeacon, BeaconLat/Lng
- StealthUntil, StealthCooldownUntil
- IsCommandoActive, CommandoTarget, CommandoDeadline
- IsPrey (JagerProoi)
- HeldByPlayerId, HeldUntil (Hostage)
```

### GameDynamics (Feature Flags)
```csharp
- ActiveCopresenceModes[] (up to 18 modes)
- TerrainEnabled, PlayerRolesEnabled, FogOfWarEnabled
- SupplyLinesEnabled, HQEnabled
- TimedEscalationEnabled, UnderdogPactEnabled
- NeutralNPCEnabled, RandomEventsEnabled, MissionSystemEnabled
- CopresencePreset (named or custom)
```

**File**: `/backend/Landgrab.Api/Models/GameState.cs` (lines 1-350+)

---

## 26. CRITICAL GAME MECHANICS CHECKLIST

### ✅ Implemented
- [x] Hex grid system (Q,R coordinates)
- [x] Troop placement & pickup
- [x] Combat system (strength-based)
- [x] Hex claiming (3 modes)
- [x] Alliance system (max 8, with colors)
- [x] Territory counting & scoring
- [x] Win conditions (3 types)
- [x] HQ capture & freeze mechanic
- [x] Player roles (5 types)
- [x] Copresence modes (18 modes)
- [x] Beacon ability
- [x] Stealth ability
- [x] CommandoRaid ability
- [x] Duel system
- [x] Hostage detention
- [x] Supply lines connectivity
- [x] Terrain system (9 types)
- [x] Fog of War filtering
- [x] Troop regeneration with bonuses
- [x] Random events (4 types)
- [x] Missions system
- [x] Achievements (4 types)
- [x] Timed escalation
- [x] Underdog pact
- [x] Global map persistence
- [x] Event logging (full audit trail)

### ⏳ TODO/In Progress
- [ ] Prey Escape condition (Phase 6, commented at line 308)
- [ ] Relay mode remote reinforcement (Phase 5, commented at line 530)
- [ ] Neutral NPC faction (Phase 7, placeholder only)
- [ ] Event warning pre-notification (Phase 8, commented at line 56)

---

## 27. COMPLEX LOGIC PATTERNS

### Location Update Processing (UpdatePlayerLocation)
One method processes 15+ mechanics sequentially:
1. Rally fortification check
2. Shepherd visit tracking & decay
3. Scout hex visit bonus
4. Saboteur enemy drain
5. Engineer fort building
6. Toll collection
7. Beacon auto-deactivate
8. Stealth break on hostile
9. CommandoRaid target check
10. JagerProoi prey hunting
11. Duel auto-initiate
12. Win condition check

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 17-389)

### Reinforcement Tick (AddReinforcementsToAllHexes)
Processes all hexes with 12+ bonus systems:
1. Drain check (skip if hostile)
2. Shepherd decay check
3. Supply line connectivity check
4. Base regeneration +1
5. Escalation bonus
6. Building terrain bonus
7. Defender role bonus
8. PresenceBattle progress/capture
9. Hostage release processing

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 752-968)

### Combat Bonus Stacking
Attackers & defenders accrue independent bonus pools:
- Attackers: PresenceBonus, FrontLine (per ally), Commander
- Defenders: TerrainType, Rally, Fort, UnderdogPact
- Applied to final strength calculation

**File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (lines 561-623)

---

## 28. DATA FLOW & PERSISTENCE

### State Snapshot System
- **Immutable snapshots**: Full game state copied before mutations
- **Persistence queue**: Changed states queued for DB save
- **Background flush**: RoomPersistenceService saves batched

**File**: `/backend/Landgrab.Api/Services/GameStateService.cs`

### Event Logging
- **Append-only**: All actions logged to `GameState.EventLog`
- **Types**: `TileCaptured`, `AllianceChanged`, `GameOver`, `RandomEvent`, etc.
- **Audit trail**: Complete game history accessible

**File**: `/backend/Landgrab.Api/Services/GameStateCommon.cs` (lines 1-150+)

### Room Synchronization
- **Lock (room.SyncRoot)**: All mutations protected by lock
- **Broadcast**: State sent to all players after mutation
- **Per-player filtering**: Fog of War applied per client

---

## 29. EDGE CASES & VALIDATIONS

### Coordinate Validation
- Latitude: -90 to +90, finite
- Longitude: -180 to +180, finite
- Hex coords: Max ±1000

### State Validation
- Phase checks: Most actions only in Lobby or Playing
- Host checks: Admin actions require host flag
- Grid checks: Hex must exist in grid
- Capability checks: Feature must be enabled

### Troop Validation
- Minimum: 1 troop for ownership
- Master tile: Invincible, no troop drain
- Carried: Max per player (unlimited by design)
- Adjacency: Required unless mode disabled

---

## 30. FILE STRUCTURE SUMMARY

```
/backend/Landgrab.Api/
├── Services/
│   ├── GameService.cs (facade, 97 lines)
│   ├── GameplayService.cs (1147 lines, CORE)
│   ├── GameStateService.cs (state management)
│   ├── GameStateCommon.cs (shared logic)
│   ├── WinConditionService.cs (victory logic, 263 lines)
│   ├── AbilityService.cs (special powers, 165 lines)
│   ├── DuelService.cs (combat/hostage, 210 lines)
│   ├── AllianceConfigService.cs (alliance management)
│   ├── GameConfigService.cs (settings, 182 lines)
│   ├── MapAreaService.cs (map config)
│   ├── LobbyService.cs (pre-game)
│   ├── HostControlService.cs (host admin, 250+ lines)
│   ├── HexService.cs (geometry, 283 lines)
│   ├── GlobalMapService.cs (persistent world, 232 lines)
│   ├── MissionService.cs (missions, 300+ lines)
│   ├── RandomEventService.cs (events, 163 lines)
│   ├── TroopRegenerationService.cs (background tick)
│   ├── TerrainFetchService.cs (OSM queries)
│   ├── GameTemplateService.cs (saved areas)
│   ├── RoomService.cs (room management)
│   └── RoomPersistenceService.cs (DB persistence)
├── Hubs/
│   ├── GameHub.cs (main, 248 lines)
│   ├── GameHub.Gameplay.cs (381 lines)
│   ├── GameHub.Host.cs (250+ lines)
│   ├── GameHub.Lobby.cs (400+ lines)
│   └── HubExceptionFilter.cs
├── Endpoints/
│   ├── AllianceEndpoints.cs
│   ├── AuthEndpoints.cs
│   ├── GlobalMapEndpoints.cs
│   └── MapTemplateEndpoints.cs
├── Models/
│   ├── GameState.cs (350+ lines, enums + DTOs)
│   ├── HexCell.cs
│   ├── Alliance.cs
│   ├── User.cs
│   ├── PersistedRoom.cs
│   ├── MapTemplate.cs
│   └── HubErrorDto.cs
├── Migrations/ (EF Core)
├── Data/ (AppDbContext)
└── Program.cs (DI setup)

/backend/Landgrab.Tests/
├── Services/
│   ├── GameplayServiceTests.cs
│   ├── AbilityServiceTests.cs
│   ├── HexServiceTests.cs
│   ├── WinConditionTests.cs
│   ├── GameStateCommonTests.cs
│   └── DuelServiceTests.cs
├── Auth/
│   ├── PasswordServiceTests.cs
│   └── JwtServiceTests.cs
├── TestSupport/
│   ├── ServiceTestContext.cs
│   ├── GameStateBuilder.cs
│   └── TestServiceFactory.cs
└── GlobalUsings.cs
```

---

## 31. OUTSTANDING DESIGN NOTES

### TODO Items Found
1. **PreyEscaped event** (line 308 GameplayService.cs)
   - Needs escape condition design (e.g., survive X minutes, reach safe zone)

2. **Relay mode** (line 530 GameplayService.cs)
   - Allow remote reinforce when ally in adjacent hex

3. **EventWarning** (line 56 RandomEventService.cs)
   - Pre-event notification before effects apply

4. **Neutral NPC** (partial implementation)
   - Flag exists but no active logic

### Potential Improvements
- Master tile could optionally regenerate troops for balance
- Missions could have difficulty/reward scaling
- Player skill ratings for matchmaking
- Match recording/replay system

---

## SUMMARY STATISTICS

| Metric | Count |
|--------|-------|
| Game Services | 19 |
| Copresence Modes | 18 |
| Player Roles | 5 |
| Win Conditions | 3 |
| Terrain Types | 9 |
| Combat Bonuses | 8 |
| Random Events | 4 |
| Achievements | 4 |
| Special Abilities | 3 |
| Hex Claim Modes | 3 |
| Game Phases | 3 |
| Game Area Modes | 3 |
| Test Files | 8 |
| Main Hub Methods | 20+ |
| REST Endpoints | 4 |
| **Total Lines (Services)** | ~**7,500+** |
| **Total Lines (Tests)** | ~**1,500+** |

