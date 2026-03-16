# LandGrab Game Mechanics - Quick Reference Index

## 🎯 Core Mechanics at a Glance

### Hex Grid & Territory
- **File**: `HexService.cs` (283 lines)
- **Key Methods**: `LatLngToHexForRoom()`, `HexDistance()`, `IsPlayerInHex()`
- **Mechanics**: Q,R cubic coordinates, spiral-based grid generation, GPS to hex conversion

### Troop Management
- **File**: `GameplayService.cs` (1147 lines) - CORE FILE
- **Methods**: `PickUpTroops()`, `PlaceTroops()`
- **Mechanics**: Carry limit, pickup/placement validation, ambush interruption

### Combat Resolution
- **File**: `GameplayService.cs` lines 478-695
- **Formula**: `Effective Strength = Troops + Bonuses`
- **Win**: `Attacker Strength > Defender Strength`
- **Casualty**: `Survivor Troops = Attacker Strength - Defender Strength`
- **8 Bonus Types**: PresenceBonus, Terrain, Rally, FrontLine, Commander, Fort, UnderdogPact, None

### Alliance System
- **File**: `AllianceConfigService.cs`
- **Limit**: Max 8 alliances per game
- **Feature**: HQ with 5-minute capture freeze, color auto-assignment

### Win Conditions
- **File**: `WinConditionService.cs` (263 lines)
- **Types**: 
  - `TerritoryPercent` (1-100%)
  - `Elimination` (last player/alliance standing)
  - `TimedGame` (highest territory after N minutes)

---

## 📍 Location-Based Mechanics (Copresence Modes)

| Mode | Effect | File | Line |
|------|--------|------|------|
| **Standoff** | Block tile actions | GameplayService.cs | 514-520 |
| **PresenceBattle** | Gradual conquest | GameplayService.cs | 898-957 |
| **PresenceBonus** | +1 attack if present | GameplayService.cs | 566-567 |
| **Ambush** | -1 troop on pickup | GameplayService.cs | 416-454 |
| **Toll** | -1 troop entering hex | GameplayService.cs | 162-197 |
| **Duel** | Challenge combat | DuelService.cs | 12-99 |
| **Rally** | +1 defense if 2+ allies | GameplayService.cs | 46-56 |
| **Drain** | Skip regen if hostile | GameplayService.cs | 843-851 |
| **Stealth** | Invisible 3 min | AbilityService.cs | 71-107 |
| **Hostage** | Detain 3 min | DuelService.cs | 102-153 |
| **Scout** | +2 troops on first visit | GameplayService.cs | 83-102 |
| **Beacon** | +2 hex claim range | AbilityService.cs | 12-47 |
| **FrontLine** | +1 attack per ally neighbor | GameplayService.cs | 584-595 |
| **JagerProoi** | Hunter/prey +3 reward | GameplayService.cs | 292-357 |
| **Shepherd** | Visit tracking decay | GameplayService.cs | 58-72 |
| **CommandoRaid** | Distant claim 5 min | AbilityService.cs | 109-164 |
| **Relay** | TODO: Remote reinforce | GameplayService.cs | 530 |

---

## 🎮 Player Roles

| Role | Effect | File | Line |
|------|--------|------|------|
| **Commander** | +1 attack if in hex | GameplayService.cs | 597-604 |
| **Scout** | +2 troops on hex visit | GameplayService.cs | 83-102 |
| **Defender** | Double regen when present | GameplayService.cs | 889-895 |
| **Saboteur** | Enemy hex -1 troop/update | GameplayService.cs | 105-128 |
| **Engineer** | Fort after 10 min stay | GameplayService.cs | 130-160 |

---

## ⚡ Special Abilities

### Beacon
- **File**: `AbilityService.cs` lines 12-47
- **Cost**: None (cooldown)
- **Effect**: Extends ally adjacency +2 hexes
- **Duration**: Until deactivated or move >1 hex away

### Stealth
- **File**: `AbilityService.cs` lines 71-107
- **Duration**: 3 minutes active
- **Cooldown**: 8 minutes total
- **Break**: Hostile copresence

### CommandoRaid
- **File**: `AbilityService.cs` lines 109-164
- **Range**: Up to 3 hexes
- **Duration**: 5 minutes deadline
- **Cooldown**: 15 minutes

---

## 🌍 Game Configuration

### Claim Modes
- `PresenceOnly` - Place to claim, no troop cost
- `PresenceWithTroop` - Must carry ≥1 troop
- `AdjacencyRequired` - Border owned hex (Beacon extends to ±2)

### Game Area Modes
- `Centered` - Circular from master tile
- `Pattern` - Predefined shape (WideFront, TallFront, Crossroads, Starburst)
- `Drawn` - Custom coordinates
- `Custom` - User-defined

### Feature Flags (GameDynamics)
- `TerrainEnabled` - Terrain bonuses apply
- `PlayerRolesEnabled` - Role mechanics active
- `FogOfWarEnabled` - Per-player visibility filtering
- `SupplyLinesEnabled` - Isolated hexes skip regen
- `HQEnabled` - HQ capture mechanics
- `TimedEscalationEnabled` - +1 regen per 30 min
- `UnderdogPactEnabled` - +2 attack vs dominant alliance
- `RandomEventsEnabled` - Calamity/Epidemic/BonusTroops
- `MissionSystemEnabled` - Mission objectives

---

## 🔄 Background Systems

### Troop Regeneration Tick (~30 sec)
**File**: `GameplayService.cs` lines 752-968

**Base**: +1 troop
**Bonuses**:
- Building terrain: +1
- Defender role: +1 (doubles total)
- Timed Escalation: +N (per 30 min)

**Penalties**:
- Shepherd unvisited >3 min: decay -1 (skip regen)
- Drain hostile present: skip regen
- Supply Lines isolated: skip regen

### Random Events (~every 30 min, 33% chance per 10-min tick)
**File**: `RandomEventService.cs` lines 52-163

- **Calamity**: Random hex loses all troops
- **Epidemic**: Largest alliance -2 troops
- **BonusTroops**: All alliances +2 troops
- **RushHour**: Hexes count double 5 min

### Missions (every 5 min check)
**File**: `MissionService.cs` lines 56-200+

**Types**: Team, Personal, Interim (time-bound)
**Rewards**: Troops to hexes
**Tracking**: Progress per objective

---

## 📊 Win Conditions & Achievements

### Win Conditions
1. **TerritoryPercent** (1-100%): Reach X% of claimable hexes
2. **Elimination**: Last alliance/player with territory
3. **TimedGame**: Highest territory after N minutes

**File**: `WinConditionService.cs` lines 144-230

### Achievements (computed on game over)
1. **Territory Leader**: Highest territory count
2. **Army Commander**: Most total troops on map
3. **Conqueror**: Most tiles captured
4. **First Strike**: Earliest capture event

**File**: `WinConditionService.cs` lines 46-142

---

## 🛡️ Terrain System

**File**: `GameplayService.cs` lines 570-578

| Terrain | Defense | Regen | Note |
|---------|---------|-------|------|
| Water | Impassable | - | Block attacks |
| Building | +1 | +1 | Strong combo |
| Hills | +1 | None | - |
| Steep | +2 | None | Strongest |
| Road/Path/Forest/Park | None | None | - |

---

## 🔐 HQ Mechanics (Phase 4)

**File**: `GameplayService.cs` lines 652-672

1. Alliance designates 1 HQ hex
2. Enemy captures HQ
3. 5-minute claim freeze applied
4. Cannot claim neutrals during freeze

---

## 🗺️ Global Map (Persistent World)

**File**: `GlobalMapService.cs` (232 lines)

- Adjacent hex attacks only
- d6 roll + advantage/disadvantage
- 5-minute cooldown on failed attacks
- Auto-start hex for new players

---

## 📡 SignalR Hub Methods

### Gameplay (GameHub.Gameplay.cs)
```
- UpdatePlayerLocation(lat, lng)
- PickUpTroops(q, r, count, playerLat, playerLng)
- PlaceTroops(q, r, playerLat, playerLng, count?, claimForSelf?)
- ReClaimHex(q, r, mode)
- ActivateBeacon()
- DeactivateBeacon()
- ActivateStealth()
- ActivateCommandoRaid(targetQ, targetR)
- AcceptDuel(duelId)
- DeclineDuel(duelId)
- DetainPlayer(targetPlayerId)
- AttackGlobalHex(fromQ, fromR, toQ, toR)
- JoinGlobalMap(lat, lng)
```

### Host (GameHub.Host.cs)
```
- SetHostObserverMode(enabled)
- UpdateGameDynamicsLive(dynamics)
- TriggerGameEvent(eventType, targetQ?, targetR?, targetAllianceId?)
- SendHostMessage(message, targetAllianceIds?)
- PauseGame(paused)
```

### Lobby (GameHub.Lobby.cs)
```
- CreateRoom()
- JoinRoom(roomCode, username)
- LeaveRoom()
- SetAllianceName(allianceName)
- SetPlayerRole(role)
- StartGame()
```

---

## 📋 Key Models & Classes

### GameState
- Room code, phase, game mode
- Players[], Alliances[]
- Grid (Dictionary<string, HexCell>)
- GameDynamics (feature flags)
- EventLog (full history)
- Missions[], Achievements[]

### HexCell
- Q, R (coordinates)
- OwnerId, OwnerAllianceId, Troops
- IsMasterTile, IsFortified, IsFort
- TerrainType
- LastVisitedAt, ContestProgress, EngineerBuiltAt

### PlayerDto
- Id, Name, Color, Role
- AllianceId, CurrentLat/Lng
- CarriedTroops, TerritoryCount
- VisitedHexes, IsBeacon, StealthUntil
- IsCommandoActive, IsPrey, HeldByPlayerId

---

## 🧪 Test Coverage

| Test Class | Focus |
|-----------|-------|
| GameplayServiceTests.cs | Troop pickup/place, combat |
| AbilityServiceTests.cs | Beacon, stealth, commando |
| HexServiceTests.cs | Coordinates, distance, adjacency |
| WinConditionTests.cs | Victory logic |
| GameStateCommonTests.cs | Snapshots, logs |
| DuelServiceTests.cs | Duel mechanics |
| PasswordServiceTests.cs | Auth hashing |
| JwtServiceTests.cs | Token generation |

**File**: `/backend/Landgrab.Tests/Services/` and `/Auth/`

---

## 🔧 Service Dependency Graph

```
GameService (main facade)
├── RoomService (create/join)
├── LobbyService (lobby setup)
├── GameplayService (CORE - 1147 lines)
│   ├── HexService (geometry)
│   ├── GameStateService (persistence)
│   └── DuelService (combat)
├── AllianceConfigService (alliance mgmt)
├── GameConfigService (game settings)
├── AbilityService (special abilities)
├── HostControlService (host admin)
├── WinConditionService (victory logic)
├── MapAreaService (map config)
├── MissionService (background missions)
├── RandomEventService (background events)
├── TroopRegenerationService (regen tick)
├── GlobalMapService (persistent world)
└── TerrainFetchService (OSM queries)
```

---

## 📁 Critical Files by Size

| File | Lines | Purpose |
|------|-------|---------|
| GameplayService.cs | 1147 | **Core game mechanics** |
| MissionService.cs | 300+ | Mission system |
| GameStateService.cs | 200+ | State persistence |
| GameStateCommon.cs | 200+ | Shared utilities |
| LobbyService.cs | 250+ | Lobby setup |
| HostControlService.cs | 250+ | Host admin |
| GameHub.Gameplay.cs | 381 | Gameplay endpoints |
| GameHub.Lobby.cs | 400+ | Lobby endpoints |
| GlobalMapService.cs | 232 | Global map |
| DuelService.cs | 210 | Duel mechanics |
| WinConditionService.cs | 263 | Victory logic |
| HexService.cs | 283 | Hex geometry |

---

## ✅ Implementation Status

### Fully Implemented (✓)
- Hex grid system
- Troop management
- Combat system
- Alliance system (max 8)
- 18 copresence modes
- 5 player roles
- 3 special abilities
- HQ mechanics with freeze
- Supply lines connectivity
- Terrain defense bonuses
- Fog of War filtering
- Duel system
- Hostage detention
- 4 random events
- Mission system (3 types)
- 4 achievements
- Timed escalation
- Underdog pact
- Global persistent map
- Full event logging

### In Progress / TODO (⏳)
- Prey Escape condition (line 308)
- Relay mode remote reinforce (line 530)
- EventWarning pre-notification (line 56)
- Neutral NPC faction (placeholder)

---

## 🎯 Quick Game Flow

1. **Lobby Phase**: Setup alliances, configure dynamics, set map
2. **Game Start**: Players assigned starting hexes, master tile set
3. **Playing Phase**: 
   - Players report GPS locations (UpdatePlayerLocation)
   - Pick up/place troops (PickUpTroops/PlaceTroops)
   - Background: Regen tick, missions tick, events tick
   - Location triggers: Toll, Duel, Ambush, Stealth break, etc.
4. **Game Over**: Winner determined, achievements computed
5. **Archive**: Full event log persisted, room archived

---

## 📚 Documentation References

- **Full Analysis**: `/GAME_DYNAMICS_ANALYSIS.md` (1016 lines)
- **This File**: `/GAME_MECHANICS_QUICK_REFERENCE.md`
- **Core File**: `/backend/Landgrab.Api/Services/GameplayService.cs` (1147 lines)
- **Models**: `/backend/Landgrab.Api/Models/GameState.cs` (350+ lines)
- **Hubs**: `/backend/Landgrab.Api/Hubs/GameHub*.cs` (1000+ lines combined)
- **Tests**: `/backend/Landgrab.Tests/Services/` (8 test classes)

---

## Summary Statistics

- **Total Game Services**: 19
- **Total Copresence Modes**: 18
- **Total Player Roles**: 5
- **Total Combat Bonuses**: 8
- **Hex Cell Tracked States**: 10+
- **Player Tracked States**: 15+
- **Win Conditions**: 3
- **Game Phases**: 3
- **Terrain Types**: 9
- **Random Events**: 4
- **Achievements**: 4
- **Feature Flags**: 10+
- **SignalR Methods**: 20+
- **REST Endpoints**: 4

---

**Last Updated**: 2024-03-15
**Analysis Scope**: 100% backend game mechanics
**Coverage**: All services, models, hubs, endpoints documented
