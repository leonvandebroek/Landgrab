# Landgrab Frontend - Quick Reference

## File Locations (Absolute Paths)

### Type Definitions
- **Game Types:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/types/game.ts` (264 lines)
- **Player Prefs:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/types/playerPreferences.ts` (23 lines)

### Hooks (State & Connection)
- **Auth State:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useAuth.ts` (133 lines)
  - Methods: `login()`, `register()`, `logout()`
  - Storage: localStorage key `'landgrab_auth'`
  
- **SignalR:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useSignalR.ts` (234 lines)
  - URL: `/hub/game`
  - Returns: `{ connected, reconnecting, invoke }`
  - 20+ event listeners
  
- **Geolocation:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useGeolocation.ts`
  - Returns: `{ lat, lng, loading, error }`
  
- **Player Prefs:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/usePlayerPreferences.ts`
  - Storage: localStorage key `'lg-player-display-prefs'`

### Main Components

#### App (State Orchestrator)
- **File:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/App.tsx` (1000+ lines)
- **State:** All game state + UI state (useState)
- **Session:** localStorage key `'landgrab_session'` → `{ roomCode, userId }`
- **Views:** 'lobby' | 'game' | 'gameover'
- **Key Callbacks:** 45+ handle* functions that call `invoke()`

#### Map & Hex Rendering
- **GameMap:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/map/GameMap.tsx` (900+ lines)
  - Library: Leaflet 1.9.4
  - Base layers: PDOK TOP25, BRT Standard, BRT Gray
  - Renders: 6-pointed hexes, player markers, terrain, fog of war
  - Features: zoom-based detail, time-based overlay, frontier detection
  
- **HexMath:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/map/HexMath.ts` (128 lines)
  - Functions: hexToPixel, pixelToHex, roomHexToLatLng, latLngToRoomHex, hexNeighbors, etc.
  - Coordinate system: Axial (q, r) with room-based origin

#### Lobby & Setup
- **GameLobby:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/GameLobby.tsx` (272 lines)
  - Shows: recent rooms, create/join UI, or setup wizard
  
- **SetupWizard:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/SetupWizard.tsx` (250 lines)
  - 5 Steps: Location → Teams → Rules → Dynamics → Review
  
- **LocationStep:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/LocationStep.tsx` (115 lines)
  - GPS button + manual lat/lng input
  
- Other Steps: TeamsStep, RulesStep, DynamicsStep, ReviewStep

#### Game HUD
- **PlayingHud:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/PlayingHud.tsx`
  - Player panel, event log, guidance banner, help overlay
  
- **TileActionPanel:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/TileActionPanel.tsx`
  - Claim, attack, reinforce, pickup actions
  
- **CombatModal:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/CombatModal.tsx`
  - Dice rolls, combat result, reclaim logic
  
- **GameOver:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/GameOver.tsx`

#### Game Logic
- **Tile Interaction:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/tileInteraction.ts` (363 lines)
  - Functions: `getTileActions()`, `getTileInteractionStatus()`
  - Calculates: available actions, bonuses, blocking conditions

---

## SignalR Method Calls (Complete List)

### Room Management
```
CreateRoom()
JoinRoom(code)
RejoinRoom(code)
ReturnToLobby()
GetMyRooms()
```

### Game Configuration
```
SetAlliance(name)
ConfigureAlliances(names[])
DistributePlayers()
SetMapLocation(lat, lng)
SetTileSize(meters)
UseCenteredGameArea()
SetPatternGameArea(pattern)
SetCustomGameArea(coordinates[])
SetClaimMode(mode)
SetAllowSelfClaim(allow)
SetWinCondition(type, value)
SetCopresenceModes(modes[])
SetCopresencePreset(preset)
SetGameDynamics(dynamics)
SetMasterTile(lat, lng)
SetMasterTileByHex(q, r)
AssignStartingTile(q, r, playerId)
AssignAllianceStartingTile(q, r, allianceId)
StartGame()
```

### Game Play
```
UpdatePlayerLocation(lat, lon)           // Throttled 3s
PlaceTroops(q, r, lat, lng, count?, claimForSelf?)
PickUpTroops(q, r, count, lat, lng)
ReClaimHex(q, r, mode)                   // Alliance|Self|Abandon
```

### Special Abilities (Phase-gated)
```
SetPlayerRole(role)                      // Phase 4
SetAllianceHQ(q, r, allianceId)          // Phase 4
ActivateBeacon()                         // Phase 5
DeactivateBeacon()                       // Phase 5
ActivateStealth()                        // Phase 6
ActivateCommandoRaid(targetQ, targetR)   // Phase 6
AcceptDuel(duelId)                       // Phase 10
DeclineDuel(duelId)                      // Phase 10
DetainPlayer(targetPlayerId)             // Phase 10
```

---

## SignalR Events (Complete List)

### Core Game
```
RoomCreated(code, state)
PlayerJoined(state)
GameStarted(state)
StateUpdated(state)
GameOver({ winnerId, winnerName, isAllianceVictory })
TileLost({ Q, R, AttackerName })
Error(message)
```

### Map/Global
```
GlobalHexUpdated(hex)
GlobalMapLoaded(hexes[])
```

### Gameplay Phases
```
CombatResult(result)                     // Combat outcome
AmbushResult(result)                     // Phase 5: Ambush
TollPaid({ payerId, amount, hexQ, hexR }) // Phase 5: Toll
PreyCaught({ hunterId, preyId, reward }) // Phase 6: Jäger/Prooi
PreyEscaped({ preyId, reward })          // Phase 6: Jäger/Prooi
EventWarning(event)                      // Phase 8: Random Events
RandomEvent(event)                       // Phase 8: Random Events
MissionAssigned(mission)                 // Phase 9: Missions
MissionCompleted(mission)                // Phase 9: Missions
MissionFailed(mission)                   // Phase 9: Missions
DuelChallenge(duel)                      // Phase 10: Duels
DuelResult({ duelId, winnerId, loserId }) // Phase 10: Duels
Reconnected                              // Connection restored
```

---

## Key Data Structures

### GameState (Central Game State)
```typescript
{
  roomCode: string
  phase: 'Lobby' | 'Playing' | 'GameOver'
  gameMode: 'Alliances' | 'FreeForAll'
  players: Player[]
  alliances: AllianceDto[]
  grid: Record<"q,r", HexCell>
  mapLat: number | null
  mapLng: number | null
  tileSizeMeters: number
  gridRadius: number
  gameAreaMode: 'Centered' | 'Drawn' | 'Pattern'
  gameAreaPattern?: 'WideFront' | 'TallFront' | 'Crossroads' | 'Starburst'
  claimMode: 'PresenceOnly' | 'PresenceWithTroop' | 'AdjacencyRequired'
  dynamics: GameDynamics
  winConditionType: 'TerritoryPercent' | 'Elimination' | 'TimedGame'
  winConditionValue: number
  masterTileQ: number | null
  masterTileR: number | null
  missions?: Mission[]
  [more fields for phase-specific data]
}
```

### HexCell (Grid Tile)
```typescript
{
  q: number, r: number
  ownerId?: string
  ownerAllianceId?: string
  ownerName?: string
  ownerColor?: string
  troops: number
  isMasterTile: boolean
  terrainType?: TerrainType
  [phase-specific: isFortified, lastVisitedAt, isFort, contestProgress, etc.]
}
```

### Player
```typescript
{
  id: string
  name: string
  color: string
  allianceId?: string
  allianceName?: string
  allianceColor?: string
  carriedTroops: number
  currentLat?: number | null
  currentLng?: number | null
  isHost: boolean
  isConnected: boolean
  territoryCount: number
  role?: PlayerRole
  [phase-specific: visitedHexes, isBeacon, beaconLat/Lng, stealthUntil, etc.]
}
```

---

## Key Constants & Config

### Map
```typescript
DEFAULT_MAP_ZOOM = 16
MAP_MAX_ZOOM = 24
TERRAIN_ICON_MIN_ZOOM = 15
FALLBACK_CENTER = [51.505, -0.09]  // Amsterdam-ish
```

### Location
```typescript
LOCATION_BROADCAST_THROTTLE_MS = 3000
```

### Session
```typescript
RESUME_TIMEOUT_MS = 5000
SESSION_STORAGE_KEY = 'landgrab_session'
```

### SignalR Retry
```typescript
AUTO_RECONNECT_DELAYS = [0, 1000, 2000, 5000, 10000, 15000, 30000, 30000, 30000, 30000, 60000, 60000, 60000]
MANUAL_RECONNECT_DELAY_MS = 15000
MANUAL_RECONNECT_MAX_ATTEMPTS = 40
```

### Hex Math
```typescript
METERS_PER_DEG_LAT = 111_320
HEX_DIRS = [[1,0], [1,-1], [0,-1], [-1,0], [-1,1], [0,1]]
```

---

## State Management Architecture

**Zero external libraries.** All state in App.tsx using React hooks:

1. **Game State**
   - `gameState: GameState | null`
   - Updated from SignalR events (onStateUpdated, onCombatResult, etc.)

2. **UI State** (18+ useState calls)
   - view, selectedHex, mapFeedback, pickupPrompt, attackPrompt, etc.

3. **Auth State** (useAuth hook)
   - Stored: localStorage `'landgrab_auth'`
   - Methods: login, register, logout

4. **Session State** (App.tsx)
   - Stored: localStorage `'landgrab_session'`
   - Used: auto-rejoin on reconnect

5. **Player Prefs** (usePlayerPreferences hook)
   - Stored: localStorage `'lg-player-display-prefs'`
   - Controls: marker style/size, labels

6. **Location State** (useGeolocation hook)
   - Real-time: GPS updates (if allowed)
   - Debug: manual location override available

---

## Dependencies
- **React** 19.2.0
- **Leaflet** 1.9.4 (map library)
- **@microsoft/signalr** 10.0.0 (WebSocket connection)
- **i18next** 25.8.18 + react-i18next 16.5.8 (translations)
- **react-router-dom** 7.13.1 (installed but NOT used)
- **axios** 1.13.6 (installed but NOT used; using fetch instead)

---

## Quick Navigation

### To understand game logic:
→ `/src/components/game/tileInteraction.ts` (getTileActions, getTileInteractionStatus)

### To understand map rendering:
→ `/src/components/map/GameMap.tsx` (full Leaflet implementation)

### To understand hex math:
→ `/src/components/map/HexMath.ts` (coordinate conversions)

### To understand state flow:
→ `/src/App.tsx` (lines 200-900 for main game loop)

### To understand real-time sync:
→ `/src/hooks/useSignalR.ts` (event listeners & reconnection logic)

### To understand setup flow:
→ `/src/components/lobby/SetupWizard.tsx` (5-step wizard)

---

## Build & Dev

Framework: Vite + TypeScript + React 19
Config files:
- `vite.config.ts` - Vite bundler config
- `tsconfig.app.json` - TypeScript compiler options
- `tsconfig.node.json` - Node-specific TS config
- `.eslintrc.js` - Linting rules

---

Generated: 2024-03-13
Frontend Location: `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/`
