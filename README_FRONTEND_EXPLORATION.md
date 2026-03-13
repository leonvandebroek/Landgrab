# Landgrab Frontend - Complete Exploration & Analysis

## 📋 Documentation Generated

This exploration has produced **two comprehensive documents** for the Landgrab frontend:

### 1. **FRONTEND_ANALYSIS.md** (25 KB, 14 sections)
**Detailed technical breakdown:**
- Complete project structure & directory tree
- Router/page configuration (simple view state, no React Router)
- All type definitions (game.ts, playerPreferences.ts)
- Full SignalR setup (connection, events, reconnection logic)
- API service layer (fetch-based auth, SignalR for game logic)
- State management architecture (zero external libraries)
- All game setup components (GameLobby, SetupWizard, LocationStep, etc.)
- Complete hex map rendering (Leaflet implementation, 900+ lines)
- Dependencies & styling approach

### 2. **FRONTEND_QUICK_REFERENCE.md** (11 KB, 10 sections)
**Quick lookup guide:**
- All absolute file paths with line counts
- Complete list of SignalR methods (22 config, 3 play, 9 special abilities)
- Complete list of SignalR events (25 total)
- Key data structures (GameState, HexCell, Player)
- Constants & configuration values
- State management quick reference
- Navigation shortcuts for key files
- Dependencies summary

---

## 🎯 Quick Answers to Your Requirements

### 1. Full Project Structure ✅
See FRONTEND_ANALYSIS.md § 1
- **src/types/** → Game and player preference types
- **src/hooks/** → Auth, SignalR, geolocation, preferences
- **src/components/** → auth, game, lobby, map, global
- **src/utils/** → terrain colors/icons, time of day
- **src/i18n/** → English and Dutch translations
- **src/styles/** → Global CSS

### 2. Router/Pages ✅
See FRONTEND_ANALYSIS.md § 2
**No traditional router.** Simple view state:
```typescript
const [view, setView] = useState<'lobby' | 'game' | 'gameover'>('lobby');
```
- AuthPage (when not authenticated)
- GameLobby + SetupWizard (phase = 'Lobby')
- GameMap + PlayingHud + CombatModal (phase = 'Playing')
- GameOver (phase = 'GameOver')

### 3. TypeScript Types ✅
See FRONTEND_ANALYSIS.md § 3 & FRONTEND_QUICK_REFERENCE.md
**Core files:**
- `/src/types/game.ts` (264 lines) - All game domain types
- `/src/types/playerPreferences.ts` (23 lines) - Display preferences

**Major interfaces:**
- GameState (central game state)
- HexCell (grid tile with ownership, troops, terrain)
- Player (with location, alliance, carried troops, special states)
- GameDynamics (feature toggles)
- CombatResult, Mission, PendingDuel, RandomEvent, etc.

### 4. SignalR Connection ✅
See FRONTEND_ANALYSIS.md § 4 & FRONTEND_QUICK_REFERENCE.md
**File:** `/src/hooks/useSignalR.ts` (234 lines)
- **URL:** `/hub/game`
- **Transport:** WebSockets
- **Auth:** Token via accessTokenFactory
- **Reconnection:** Exponential backoff (auto) + manual fallback (15s, max 40 attempts)
- **Return:** `{ connected, reconnecting, invoke }`

**20 Event Listeners:**
Core: RoomCreated, PlayerJoined, GameStarted, StateUpdated, CombatResult, GameOver, TileLost, GlobalHexUpdated, GlobalMapLoaded, Error
Gameplay Phases: AmbushResult, TollPaid, PreyCaught, PreyEscaped, EventWarning, RandomEvent, MissionAssigned, MissionCompleted, MissionFailed, DuelChallenge, DuelResult

### 5. API Service Layer ✅
See FRONTEND_ANALYSIS.md § 5
**Architecture:** No dedicated service layer
- **Auth:** Native `fetch()` to `/api/auth/login` and `/api/auth/register`
  - Returns: { token, username, userId }
  - Stored: localStorage key `'landgrab_auth'`
- **Game Logic:** All via SignalR `invoke()` (22 methods)
  - No REST endpoints for gameplay

**SignalR Methods (Complete List):**
```
Room: CreateRoom, JoinRoom, RejoinRoom, ReturnToLobby, GetMyRooms
Config: SetAlliance, SetMapLocation, SetTileSize, SetWinCondition, SetCopresenceModes, etc. (14 total)
Gameplay: UpdatePlayerLocation, PlaceTroops, PickUpTroops, ReClaimHex
Special: SetPlayerRole, ActivateBeacon, ActivateStealth, AcceptDuel, DetainPlayer, etc.
```

### 6. State Management ✅
See FRONTEND_ANALYSIS.md § 6 & FRONTEND_QUICK_REFERENCE.md § "State Management Architecture"
**Architecture: Zero external libraries**
- **All state:** Local to App.tsx via React's `useState()`
- **Game state:** Updated from SignalR events
- **Auth state:** useAuth hook (localStorage key `'landgrab_auth'`)
- **Session state:** localStorage key `'landgrab_session'` → `{ roomCode, userId }`
- **Player prefs:** usePlayerPreferences (localStorage key `'lg-player-display-prefs'`)
- **UI state:** 18+ useState calls (selectedHex, mapFeedback, pickupPrompt, etc.)

No Context API, no Zustand, no Redux.

### 7. Game Setup Components ✅
See FRONTEND_ANALYSIS.md § 7 & FRONTEND_QUICK_REFERENCE.md
**Components:**
1. **GameLobby.tsx** (272 lines) - Entry point: shows recent rooms or setup wizard
2. **SetupWizard.tsx** (250 lines) - 5-step setup flow
3. **LocationStep.tsx** (115 lines) - GPS + manual location input
4. **TeamsStep.tsx** - Alliance creation, player assignment
5. **RulesStep.tsx** - Claim mode, win condition, tile size
6. **DynamicsStep.tsx** - Copresence presets, feature toggles
7. **ReviewStep.tsx** - Final confirmation before game start
8. **GuestWizardView.tsx** - Read-only view for non-host players

**Full content of each available in FRONTEND_ANALYSIS.md § 7**

### 8. Hex Map Rendering ✅
See FRONTEND_ANALYSIS.md § 8 & § 9
**Main Component:** `/src/components/map/GameMap.tsx` (900+ lines)
- **Library:** Leaflet 1.9.4
- **Base Layers:** PDOK TOP25 (default), BRT Standard, BRT Gray
- **Rendering:**
  - World-dimming mask with hex holes
  - Terrain underlays (color + opacity)
  - Terrain icons (emoji, zoom 15+)
  - Fog of war (hidden hexes dark)
  - Frontier/contested detection
  - Player markers (dot, pin, avatar, flag)
  - Time-based overlay
  - Master tile highlighting
  
**Hex Math Library:** `/src/components/map/HexMath.ts` (128 lines)
- Functions: hexToPixel, pixelToHex, roomHexToLatLng, latLngToRoomHex, hexNeighbors, hexSpiral, etc.
- Coordinate system: Axial (q, r) with room-based origin

---

## 🔑 Key Files by Purpose

### Understand Game Flow
1. **App.tsx** - Main orchestrator (lines 500-900 for game loop)
2. **useSignalR.ts** - Connection & events
3. **GameMap.tsx** - Map rendering & interaction

### Understand Game Logic
1. **tileInteraction.ts** - Action validation & calculations
2. **GameState interface** (game.ts) - Central schema
3. **App.tsx** - Handler functions (lines 650-900)

### Understand Map Math
1. **HexMath.ts** - Coordinate conversion functions
2. **GameMap.tsx** - Rendering implementation

### Understand Setup
1. **SetupWizard.tsx** - Main orchestrator
2. **LocationStep.tsx** - Location configuration
3. **TeamsStep.tsx** - Alliance & player setup

### Understand State
1. **App.tsx** - All useState calls (lines 61-82)
2. **useAuth.ts** - Auth state
3. **usePlayerPreferences.ts** - Display prefs

### Understand Auth
1. **useAuth.ts** - Login/register logic
2. **AuthPage.tsx** - UI component

---

## 🏗️ Architecture Decisions

### Why No State Management Library?
- Frontend is relatively simple: mostly reactive to SignalR events
- State tree not deeply nested
- No complex cross-component sharing needs
- Direct useState sufficient for 45+ handlers in App.tsx

### Why No REST API for Game Logic?
- Real-time multiplayer requires push (SignalR)
- Server must broadcast state changes to all players
- Pull-based HTTP wouldn't work for simultaneous player updates
- SignalR provides both request/response AND pub/sub

### Why No React Router?
- Only 3 top-level views (lobby, game, gameover)
- View determined by gameState.phase
- Simple string state (view) sufficient
- No deep routing needed

### Why Leaflet Over Alternatives?
- Mature, battle-tested map library
- Native support for custom geometries (hexes)
- Good performance with many markers
- Active community, excellent documentation

---

## 📦 Dependencies Summary

| Package | Version | Purpose |
|---------|---------|---------|
| react | 19.2.0 | UI framework |
| react-dom | 19.2.0 | DOM rendering |
| leaflet | 1.9.4 | Map library |
| @microsoft/signalr | 10.0.0 | WebSocket connection |
| i18next | 25.8.18 | Translations |
| react-i18next | 16.5.8 | React i18n integration |
| react-router-dom | 7.13.1 | ⚠️ Installed but NOT used |
| axios | 1.13.6 | ⚠️ Installed but NOT used |

---

## 🎮 Game Flow Summary

```
1. Auth
   └─ useAuth().login/register → /api/auth/login|register
   └─ Store token in localStorage

2. Lobby (phase = 'Lobby')
   ├─ Show recent rooms (GetMyRooms)
   ├─ CreateRoom or JoinRoom
   └─ Host runs SetupWizard:
      ├─ LocationStep: SetMapLocation
      ├─ TeamsStep: ConfigureAlliances, DistributePlayers
      ├─ RulesStep: SetClaimMode, SetWinCondition
      ├─ DynamicsStep: SetCopresenceModes, SetGameDynamics
      └─ ReviewStep: StartGame

3. Playing (phase = 'Playing')
   ├─ Continuous: UpdatePlayerLocation (throttled 3s)
   ├─ Click hex: getTileActions
   ├─ Select action:
   │  ├─ Claim: PlaceTroops
   │  ├─ Reinforce: PlaceTroops
   │  ├─ Attack: PlaceTroops
   │  └─ Pickup: PickUpTroops
   ├─ After combat: ReClaimHex (alliance/self/abandon)
   └─ SignalR broadcasts StateUpdated to all players

4. GameOver (phase = 'GameOver')
   └─ Show winner, achievements, option to return to lobby
```

---

## 💡 Important Notes

### Location Throttling
```typescript
LOCATION_BROADCAST_THROTTLE_MS = 3000;
```
Player location updates are batched and sent every 3 seconds max (not on every GPS update).

### Session Resume
On reconnect, frontend attempts:
1. `RejoinRoom(savedRoomCode)` - Primary method
2. Fallback to `JoinRoom(savedRoomCode)` if RejoinRoom unavailable
3. Clear session if room gone, show error

### Hex Coordinate System
- **Axial:** (q, r) where s = -q - r (implicit)
- **Room-based:** Origin at (mapLat, mapLng), hexes sized in meters
- **Neighbors:** 6 directions via HEX_DIRS constant
- **Key format:** `"q,r"` for grid lookups

### Claimed Tiles & Ownership
- HexCell.ownerId = individual player OR
- HexCell.ownerAllianceId = team (when in alliance)
- Both can be set; logic handles alliance vs individual ownership

---

## 📍 Full File Paths (Quick Copy)

```
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/App.tsx
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/types/game.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/types/playerPreferences.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useAuth.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useSignalR.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useGeolocation.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/usePlayerPreferences.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/hooks/useSound.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/map/GameMap.tsx
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/map/HexMath.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/map/pdokLayers.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/GameLobby.tsx
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/SetupWizard.tsx
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/LocationStep.tsx
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/tileInteraction.ts
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/PlayingHud.tsx
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/CombatModal.tsx
```

---

## 📊 Statistics

- **Total TypeScript/TSX files:** 38
- **Total lines of code (src only):** ~8,000
- **Core components:** 16
- **Type definitions:** 20+ interfaces
- **SignalR methods:** 34
- **SignalR events:** 25
- **useState hooks in App.tsx:** 21
- **useCallback handlers:** 45+
- **i18n language files:** 2 (en, nl)

---

**Documentation Generated:** 2024-03-13  
**Base Directory:** `/Users/leonvandebroek/Projects/Github/Landgrab/`  
**Frontend Location:** `frontend/landgrab-ui/`

---

## Next Steps for Planning

With this exploration complete, you now have:
✅ Full type schemas (Game state, Hex, Player, Alliance, etc.)
✅ Complete API surface (SignalR methods & events)
✅ Architecture pattern (state management, routing, etc.)
✅ Component hierarchy (setup flow, game HUD, map)
✅ Integration points (Auth, Location, SignalR)

Ready to:
- [ ] Plan backend API changes
- [ ] Design new features
- [ ] Plan component refactoring
- [ ] Document database schema
- [ ] Plan test coverage
