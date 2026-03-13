# Landgrab Frontend - Complete Analysis

## 1. PROJECT STRUCTURE

### Directory Tree
```
/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/
├── src/
│   ├── App.tsx                          # Main app container + state orchestration
│   ├── main.tsx                         # React entry point
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthPage.tsx
│   │   ├── game/
│   │   │   ├── CombatModal.tsx
│   │   │   ├── DebugLocationPanel.tsx
│   │   │   ├── DiceRoller.tsx
│   │   │   ├── GameEventLog.tsx
│   │   │   ├── gameLogFormat.ts
│   │   │   ├── GameOver.tsx
│   │   │   ├── GameRulesPage.tsx
│   │   │   ├── GuidanceBanner.tsx
│   │   │   ├── HelpOverlay.tsx
│   │   │   ├── PlayerDisplaySettings.tsx
│   │   │   ├── PlayerPanel.tsx
│   │   │   ├── PlayingHud.tsx
│   │   │   ├── TileActionPanel.tsx
│   │   │   └── tileInteraction.ts
│   │   ├── lobby/
│   │   │   ├── CustomSelect.tsx
│   │   │   ├── DynamicsStep.tsx
│   │   │   ├── gameAreaShapes.ts
│   │   │   ├── GameLobby.tsx
│   │   │   ├── GuestWizardView.tsx
│   │   │   ├── LocationStep.tsx
│   │   │   ├── ReviewStep.tsx
│   │   │   ├── RulesStep.tsx
│   │   │   ├── SetupWizard.tsx
│   │   │   └── TeamsStep.tsx
│   │   ├── map/
│   │   │   ├── GameMap.tsx              # Main Leaflet map component
│   │   │   ├── HexMath.ts               # Hex coordinate math
│   │   │   └── pdokLayers.ts            # PDOK base map layers
│   │   └── global/
│   │       └── GlobalMap.tsx
│   ├── hooks/
│   │   ├── useAuth.ts                   # Auth state + fetch login/register
│   │   ├── useGeolocation.ts
│   │   ├── usePlayerPreferences.ts      # Display prefs storage
│   │   ├── useSignalR.ts                # SignalR connection
│   │   └── useSound.ts
│   ├── types/
│   │   ├── game.ts                      # Game state types
│   │   └── playerPreferences.ts
│   ├── utils/
│   │   ├── terrainColors.ts
│   │   ├── terrainIcons.ts
│   │   └── timeOfDay.ts
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── en.ts
│   │   └── nl.ts
│   ├── styles/
│   │   └── index.css
│   └── assets/
├── public/
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 2. ROUTER & PAGES

**No dedicated router file.** App.tsx uses simple view state management:
```typescript
const [view, setView] = useState<'lobby' | 'game' | 'gameover'>('lobby');
```

**Views/Pages:**
- `'lobby'`: GameLobby + SetupWizard (when gameState exists)
- `'game'`: GameMap + PlayingHud + CombatModal
- `'gameover'`: GameOver component
- Auth fallback: AuthPage (when not authenticated)

No React Router, no traditional routing.

---

## 3. TYPE DEFINITIONS

### File: `/src/types/game.ts` (264 lines)

**Game Phase & Modes:**
```typescript
export type GamePhase = 'Lobby' | 'Playing' | 'GameOver';
export type GameMode = 'Alliances' | 'FreeForAll';
export type ClaimMode = 'PresenceOnly' | 'PresenceWithTroop' | 'AdjacencyRequired';
export type WinConditionType = 'TerritoryPercent' | 'Elimination' | 'TimedGame';
export type GameAreaMode = 'Centered' | 'Drawn' | 'Pattern';
export type GameAreaPattern = 'WideFront' | 'TallFront' | 'Crossroads' | 'Starburst';
```

**Copresence Modes:**
```typescript
export type CopresenceMode =
  | 'None' | 'Standoff' | 'PresenceBattle' | 'PresenceBonus'
  | 'Ambush' | 'Toll' | 'Duel' | 'Rally' | 'Drain'
  | 'Stealth' | 'Hostage' | 'Scout' | 'Beacon'
  | 'FrontLine' | 'Relay' | 'JagerProoi' | 'Shepherd' | 'CommandoRaid';
```

**Terrain & Roles:**
```typescript
export type TerrainType = 'None' | 'Water' | 'Building' | 'Road' | 'Path' | 'Forest' | 'Park' | 'Hills' | 'Steep';
export type PlayerRole = 'None' | 'Commander' | 'Scout' | 'Defender' | 'Saboteur' | 'Engineer';
```

**Core Interfaces:**

1. **GameDynamics** - Feature toggles
2. **HexCoordinate** - `{ q: number, r: number }`
3. **HexCell** - Hex grid tile with owner, troops, terrain, special states
4. **Player** - Player with location, alliance, troops, role, special states
5. **AllianceDto** - Team info with HQ location and frozen claim status
6. **GameState** - Central game state with players, grid, map location, config
7. **Achievement** - Player achievements
8. **CombatResult** - Combat dice rolls and outcome
9. **Mission** - Mission objectives with progress
10. **PendingDuel** - Duel challenge state
11. **RandomEvent** - Event type/description
12. **AuthState** - `{ token, username, userId }`
13. **RoomSummary** - Room metadata
14. **GlobalHex** - Global map hex

### File: `/src/types/playerPreferences.ts` (23 lines)

```typescript
export type MarkerStyle = 'dot' | 'pin' | 'avatar' | 'flag';
export type MarkerSize = 'small' | 'medium' | 'large';

export interface PlayerDisplayPreferences {
  markerStyle: MarkerStyle;
  markerSize: MarkerSize;
  showNameLabel: boolean;
}

export const DEFAULT_PLAYER_PREFS: PlayerDisplayPreferences = {
  markerStyle: 'dot',
  markerSize: 'medium',
  showNameLabel: false
};

export const MARKER_SIZE_MULTIPLIER: Record<MarkerSize, number> = {
  small: 0.7,
  medium: 1.0,
  large: 1.5
};

export const STORAGE_KEY = 'lg-player-display-prefs';
```

---

## 4. SIGNALR CONNECTION

### File: `/src/hooks/useSignalR.ts` (234 lines)

**URL:** `/hub/game`
**Transport:** WebSockets only
**Auth:** Token via `accessTokenFactory: () => token`

**Retry Strategy:**
```typescript
const AUTO_RECONNECT_DELAYS = [0, 1000, 2000, 5000, 10000, 15000, 30000, 30000, 30000, 30000, 60000, 60000, 60000];
const MANUAL_RECONNECT_DELAY_MS = 15000;
const MANUAL_RECONNECT_MAX_ATTEMPTS = 40;
```

**Events Listened To:**
```typescript
export interface GameEvents {
  onRoomCreated?: (code: string, state: GameState) => void;
  onPlayerJoined?: (state: GameState) => void;
  onGameStarted?: (state: GameState) => void;
  onStateUpdated?: (state: GameState) => void;
  onCombatResult?: (result: CombatResult) => void;
  onGameOver?: (data: { winnerId: string; winnerName: string; isAllianceVictory: boolean }) => void;
  onTileLost?: (data: { Q: number; R: number; AttackerName: string }) => void;
  onGlobalHexUpdated?: (hex: unknown) => void;
  onGlobalMapLoaded?: (hexes: unknown[]) => void;
  onError?: (message: string) => void;
  onReconnected?: () => void;
  
  // Phase 5: Ambush
  onAmbushResult?: (result: AmbushResult) => void;
  onTollPaid?: (data: { payerId: string; amount: number; hexQ: number; hexR: number }) => void;
  
  // Phase 6: JagerProoi
  onPreyCaught?: (data: { hunterId: string; preyId: string; reward: number }) => void;
  onPreyEscaped?: (data: { preyId: string; reward: number }) => void;
  
  // Phase 8: Random Events
  onEventWarning?: (event: RandomEvent) => void;
  onRandomEvent?: (event: RandomEvent) => void;
  
  // Phase 9: Missions
  onMissionAssigned?: (mission: Mission) => void;
  onMissionCompleted?: (mission: Mission) => void;
  onMissionFailed?: (mission: Mission) => void;
  
  // Phase 10: Duel
  onDuelChallenge?: (duel: PendingDuel) => void;
  onDuelResult?: (data: { duelId: string; winnerId: string; loserId: string }) => void;
}
```

**Event Registration (lines 134-154):**
```typescript
conn.on('RoomCreated', (code: string, state: GameState) => eventsRef.current.onRoomCreated?.(code, state));
conn.on('PlayerJoined', (state: GameState) => eventsRef.current.onPlayerJoined?.(state));
conn.on('GameStarted', (state: GameState) => eventsRef.current.onGameStarted?.(state));
conn.on('StateUpdated', (state: GameState) => eventsRef.current.onStateUpdated?.(state));
conn.on('CombatResult', (result: CombatResult) => eventsRef.current.onCombatResult?.(result));
conn.on('GameOver', (data) => eventsRef.current.onGameOver?.(data));
conn.on('TileLost', (data) => eventsRef.current.onTileLost?.(data));
conn.on('GlobalHexUpdated', (hex) => eventsRef.current.onGlobalHexUpdated?.(hex));
conn.on('GlobalMapLoaded', (hexes) => eventsRef.current.onGlobalMapLoaded?.(hexes));
conn.on('Error', (msg) => eventsRef.current.onError?.(msg));
conn.on('AmbushResult', (result) => eventsRef.current.onAmbushResult?.(result));
conn.on('TollPaid', (data) => eventsRef.current.onTollPaid?.(data));
conn.on('PreyCaught', (data) => eventsRef.current.onPreyCaught?.(data));
conn.on('PreyEscaped', (data) => eventsRef.current.onPreyEscaped?.(data));
conn.on('EventWarning', (event) => eventsRef.current.onEventWarning?.(event));
conn.on('RandomEvent', (event) => eventsRef.current.onRandomEvent?.(event));
conn.on('MissionAssigned', (mission) => eventsRef.current.onMissionAssigned?.(mission));
conn.on('MissionCompleted', (mission) => eventsRef.current.onMissionCompleted?.(mission));
conn.on('MissionFailed', (mission) => eventsRef.current.onMissionFailed?.(mission));
conn.on('DuelChallenge', (duel) => eventsRef.current.onDuelChallenge?.(duel));
conn.on('DuelResult', (data) => eventsRef.current.onDuelResult?.(data));
```

**Connection Lifecycle:**
- Auto-reconnect with exponential backoff
- Manual reconnect fallback (15s delay, max 40 attempts)
- Tracks connection state and notifies on reconnected
- Cleanup on unmount or when token clears

**Hook Returns:**
```typescript
return { connected, reconnecting, invoke };
```

The `invoke(method, ...args)` function is used to call SignalR hub methods.

---

## 5. API SERVICE LAYER

**No dedicated API service file.** Instead:

1. **Authentication** via `useAuth()` hook:
   - POST `/api/auth/login`
   - POST `/api/auth/register`
   - Uses native `fetch()`

2. **Game operations** via `useSignalR().invoke()`:
   - All game actions go through SignalR methods
   - No REST API for game logic

### Auth Hook: `/src/hooks/useAuth.ts` (133 lines)

```typescript
const login = useCallback(async (usernameOrEmail: string, password: string) => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password })
  });
  if (!res.ok) {
    throw await parseAuthApiError(res, i18n.t('auth.loginFailed'));
  }
  const data: AuthState & { token: string; username: string; userId: string } = await res.json();
  setAuth({ token: data.token, username: data.username, userId: data.userId });
  return data;
}, [setAuth]);

const register = useCallback(async (username: string, email: string, password: string) => {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  if (!res.ok) {
    throw await parseAuthApiError(res, i18n.t('auth.registrationFailed'));
  }
  const data: AuthState & { token: string; username: string; userId: string } = await res.json();
  setAuth({ token: data.token, username: data.username, userId: data.userId });
  return data;
}, [setAuth]);
```

**Storage:** Auth state persisted to localStorage with key `'landgrab_auth'`

---

## 6. STATE MANAGEMENT

**Architecture:** No Context API, no Zustand, no Redux.

**State Management in App.tsx (line 58+):**
All state is local to the main App component using `useState()`:

```typescript
const [gameState, setGameState] = useState<GameState | null>(null);
const [error, setError] = useState('');
const [view, setView] = useState<'lobby' | 'game' | 'gameover'>('lobby');
const [selectedHex, setSelectedHex] = useState<[number, number] | null>(null);
const [mapFeedback, setMapFeedback] = useState<MapInteractionFeedback | null>(null);
const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null);
const [pickupCount, setPickupCount] = useState(1);
const [autoResuming, setAutoResuming] = useState(false);
const [savedSession, setSavedSession] = useState<SavedSession | null>(loadSavedSession);
const [myRooms, setMyRooms] = useState<RoomSummary[]>([]);
const [showDebugTools, setShowDebugTools] = useState(false);
const [debugLocationEnabled, setDebugLocationEnabled] = useState(false);
const [debugLocation, setDebugLocation] = useState<LocationPoint | null>(null);
const [attackPrompt, setAttackPrompt] = useState<{ q: number; r: number; max: number; defenderTroops: number } | null>(null);
const [attackCount, setAttackCount] = useState(1);
const [combatResult, setCombatResult] = useState<CombatResult | null>(null);
const [randomEvent, setRandomEvent] = useState<RandomEvent | null>(null);
const [eventWarning, setEventWarning] = useState<RandomEvent | null>(null);
const [missionNotification, setMissionNotification] = useState<{ mission: Mission; type: 'assigned' | 'completed' | 'failed' } | null>(null);
const [pendingDuel, setPendingDuel] = useState<PendingDuel | null>(null);
const [playerDisplayPrefs, setPlayerDisplayPrefs] = usePlayerPreferences();
const [hasAcknowledgedRules, setHasAcknowledgedRules] = useState(false);
```

**Auth State:** `useAuth()` hook maintains `{ auth, login, register, logout }`

**Persistent Session:** `localStorage` with key `'landgrab_session'` stores `{ roomCode, userId }`

**Player Preferences:** `usePlayerPreferences()` manages display settings with localStorage

---

## 7. GAME SETUP COMPONENTS

### GameLobby: `/src/components/lobby/GameLobby.tsx` (272 lines)

**Props:**
```typescript
interface Props {
  username: string;
  myUserId: string;
  gameState: GameState | null;
  connected: boolean;
  currentLocation: LocationPoint | null;
  locationError: string | null;
  locationLoading: boolean;
  recentRooms: RoomSummary[];
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onSetAlliance: (name: string) => void;
  onSetMapLocation: (lat: number, lng: number) => void;
  onSetTileSize: (meters: number) => void;
  onUseCenteredGameArea: () => void;
  onSetPatternGameArea: (pattern: GameAreaPattern) => void;
  onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
  onSetClaimMode: (mode: ClaimMode) => void;
  onSetAllowSelfClaim: (allow: boolean) => void;
  onSetWinCondition: (type: WinConditionType, value: number) => void;
  onSetCopresenceModes: (modes: CopresenceMode[]) => void;
  onSetCopresencePreset: (preset: string) => void;
  onSetGameDynamics: (dynamics: GameDynamics) => void;
  onSetMasterTile: (lat: number, lng: number) => void;
  onSetMasterTileByHex: (q: number, r: number) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onConfigureAlliances: (names: string[]) => void;
  onDistributePlayers: () => void;
  onAssignAllianceStartingTile: (q: number, r: number, allianceId: string) => void;
  onStartGame: () => void;
  onReturnToLobby: () => void;
  onLogout: () => void;
  error: string;
}
```

**When gameState.phase === 'Lobby':**
- Shows SetupWizard if user is host
- Shows GuestWizardView if user is not host
- Lists recent rooms for quick join

### SetupWizard: `/src/components/lobby/SetupWizard.tsx` (250 lines)

**Steps (5 total):**
1. **LocationStep** - Set game map location via GPS or manual input
2. **TeamsStep** - Configure alliances and assign players
3. **RulesStep** - Select claim mode, win condition, etc.
4. **DynamicsStep** - Enable copresence modes, terrain, etc.
5. **ReviewStep** - Confirm and start game

**Step Completion Logic:**
```typescript
const stepComplete = useMemo(() => ({
  location: gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null,
  teams: gameState.alliances.length > 0 && gameState.players.length >= 2 && gameState.players.every(p => p.allianceId),
  rules: true,
  dynamics: true,
  review: true
}), [gameState]);
```

### LocationStep: `/src/components/lobby/LocationStep.tsx` (115 lines)

```typescript
interface Props {
  currentLocation: LocationPoint | null;
  locationLoading: boolean;
  locationError: string | null;
  mapLat: number | null;
  mapLng: number | null;
  onSetMapLocation: (lat: number, lng: number) => void;
}
```

**Features:**
- GPS button to set from current location
- Manual input for latitude/longitude
- Displays confirmation when set

### Other Setup Components:
- **TeamsStep.tsx** - Alliance configuration, player distribution
- **RulesStep.tsx** - Claim mode, self-claim toggle, win condition, tile size
- **DynamicsStep.tsx** - Copresence presets, feature toggles
- **ReviewStep.tsx** - Final review before game start
- **GuestWizardView.tsx** - Read-only view for non-host players

---

## 8. HEX MAP RENDERING

### GameMap: `/src/components/map/GameMap.tsx` (>900 lines, uses Leaflet)

**Props:**
```typescript
interface Props {
  state: GameState;
  myUserId: string;
  currentLocation: LocationPoint | null;
  onHexClick?: (q: number, r: number, cell: HexCell | undefined) => void;
  selectedHex?: [number, number] | null;
  constrainViewportToGrid?: boolean;
  gridOverride?: Record<string, HexCell>;
  inactiveHexKeys?: string[];
  playerDisplayPrefs?: PlayerDisplayPreferences;
}
```

**Features:**

1. **Base Maps (PDOK Layers):**
   - TOP25 (topographic - default)
   - BRT Standard (satellite-style)
   - BRT Gray (grayscale)

2. **Hex Rendering:**
   - World-dimming mask (0.55 opacity #0a1220)
   - Hex holes reveal bright map beneath
   - Terrain underlays (fillColor + opacity)
   - Terrain icons (emoji) at zoom 15+
   - Fog of war (hidden hexes = #1a1a2e, 0.4 opacity)

3. **Hex Colors/Styling:**
   - Master tile: host color (#f1c40f fallback)
   - Owned tiles: owner color
   - Neutral: light blue (#9fc4e8), inactive gray (#e5edf6)
   - Fog-hidden: dark (#1a1a2e)

4. **Visual Indicators:**
   - Frontier detection: hexes with non-team neighbors
   - Contested hexes: multiple team borders
   - Friendly alliance cells: same alliance color
   - Selected hex: bright yellow outline
   - Current location: blue circle

5. **Player Markers:**
   - Configurable styles: dot, pin, avatar, flag
   - Sizes: small (0.7x), medium (1.0x), large (1.5x)
   - Color = player alliance color or player color
   - Labels optional

6. **Time Overlay:**
   - Dynamic background based on time of day
   - Mix blend mode for atmospheric effect

7. **Map Controls:**
   - "Zoom to Me" button
   - Layer switcher
   - Zoom constraints for game area

**Key Functions:**

**Map Initialization (lines 102-136):**
```typescript
const map = L.map(containerRef.current, {
  center: initialCenterRef.current,
  maxZoom: MAP_MAX_ZOOM,
  maxBoundsViscosity: constrainViewportToGrid ? 1 : undefined,
  zoom: DEFAULT_MAP_ZOOM,
  zoomControl: false
});
```

**Hex Rendering Loop (lines 301-450+):**
For each hex in grid:
- Calculate corner LatLngs
- Determine ownership and styling
- Detect frontier/contested status
- Render terrain underlay
- Add hex outline polygon
- Add player markers
- Add terrain icons
- Apply fog of war

**Hex-to-LatLng Conversion (via HexMath.ts):**
```typescript
roomHexToLatLng(q, r, mapLat, mapLng, tileSizeMeters): [number, number]
```

**Click Handler:**
- Detects if click is tap (vs pan/zoom) via pointerdown tracking
- Invokes `onHexClick(q, r, cell)`

---

## 9. HEX MATH LIBRARY

### File: `/src/components/map/HexMath.ts` (128 lines)

**Core Functions:**

```typescript
// Hex coordinate key for map lookups
hexKey(q: number, r: number): string // "q,r"

// Get 6 neighbors
hexNeighbors(q: number, r: number): [number, number][]

// Check adjacency
hexAreAdjacent(q1: number, r1: number, q2: number, r2: number): boolean

// Axial to pixel
hexToPixel(q: number, r: number, size: number): [number, number]

// Pixel to axial (with rounding)
pixelToHex(px: number, py: number, size: number): [number, number]
hexRound(q: number, r: number): [number, number]

// Axial to geographic (global hexes)
hexToLatLng(q: number, r: number): [number, number]

// Room hexes (with origin at map center)
roomHexToLatLng(q, r, mapLat, mapLng, tileSizeMeters): [number, number]
latLngToRoomHex(lat, lng, mapLat, mapLng, tileSizeMeters): [number, number]

// Corner points
roomHexCornerLatLngs(q, r, mapLat, mapLng, tileSizeMeters): [number, number][]

// Spiral for area fill
hexSpiral(radius: number): [number, number][]
```

**Coordinate System:**
- Axial: (q, r) - cube coordinates implicit: s = -q - r
- Room hexes: origin at (mapLat, mapLng), sized in meters
- Conversion: degree lat/lng ↔ meters ↔ hex coordinates

**Constants:**
```typescript
const METERS_PER_DEG_LAT = 111_320;
const HEX_DIRS = [[1,0], [1,-1], [0,-1], [-1,0], [-1,1], [0,1]];
```

---

## 10. SIGNALR METHOD INVOCATIONS

**Game Setup/Config:**
- `CreateRoom()` → room code + initial state
- `JoinRoom(code)` → join existing room
- `RejoinRoom(code)` → rejoin after disconnect
- `SetAlliance(name)` → create/set player alliance
- `ConfigureAlliances(names[])` → batch alliance setup
- `DistributePlayers()` → auto-assign players to alliances
- `SetMapLocation(lat, lng)` → set game area center
- `SetTileSize(meters)` → hex size in meters
- `UseCenteredGameArea()` → circular area around center
- `SetPatternGameArea(pattern)` → predefined area patterns
- `SetCustomGameArea(coordinates[])` → custom hex list
- `SetClaimMode(mode)` → PresenceOnly|PresenceWithTroop|AdjacencyRequired
- `SetAllowSelfClaim(allow)` → toggle self vs alliance claim
- `SetWinCondition(type, value)` → TerritoryPercent|Elimination|TimedGame
- `SetCopresenceModes(modes[])` → active gameplay modes
- `SetCopresencePreset(preset)` → named preset (e.g. 'Klassiek')
- `SetGameDynamics(dynamics)` → enable terrain, roles, fog of war, etc.
- `SetMasterTile(lat, lng)` → special master hex location
- `SetMasterTileByHex(q, r)` → master hex by coordinates
- `AssignStartingTile(q, r, playerId)` → give starting hex to player
- `AssignAllianceStartingTile(q, r, allianceId)` → starting hex to alliance
- `StartGame()` → begin game phase

**Game Play:**
- `UpdatePlayerLocation(lat, lon)` → broadcast player location (throttled 3s)
- `PlaceTroops(q, r, lat, lng, count?, claimForSelf?)` → claim hex or reinforce
- `PickUpTroops(q, r, count, lat, lng)` → pick up troops from hex
- `ReClaimHex(q, r, mode)` → after combat, alliance|self|abandon
- `GetMyRooms()` → fetch rooms player can rejoin

**Special Abilities (Phase-gated):**
- `SetPlayerRole(role)` → assign role to self (phase 4)
- `SetAllianceHQ(q, r, allianceId)` → HQ placement (phase 4)
- `ActivateBeacon()` → become beacon (phase 5)
- `DeactivateBeacon()` → turn off beacon (phase 5)
- `ActivateStealth()` → activate stealth mode (phase 6)
- `ActivateCommandoRaid(targetQ, targetR)` → commando raid (phase 6)
- `AcceptDuel(duelId)` → accept duel challenge (phase 10)
- `DeclineDuel(duelId)` → reject duel challenge (phase 10)
- `DetainPlayer(targetPlayerId)` → hostage ability (phase 10)

**Game Control:**
- `ReturnToLobby()` → leave game, return to lobby
- `GetMyRooms()` → fetch room summaries

---

## 11. KEY STATE FLOWS

### Game Initialization Flow:
1. User auth (useAuth)
2. SignalR connected (useSignalR)
3. CreateRoom or JoinRoom invoke
4. Receive onRoomCreated/onPlayerJoined event → update gameState
5. Move to 'lobby' view
6. Setup wizard steps → invoke game config methods
7. Receive onStateUpdated events → update gameState after each config
8. Host presses StartGame
9. Receive onGameStarted → move to 'game' view

### Game Playing Flow:
1. Players update location (throttled 3s) → invoke UpdatePlayerLocation
2. Map renders current hex (latLngToRoomHex)
3. Click hex → getTileActions → show action panel
4. Select action → invoke PlaceTroops/PickUpTroops
5. Receive onStateUpdated → update grid, players
6. Combat: receive onCombatResult → show CombatModal
7. Pickup/reinforce at own hex or reclaim after capture

### Session Resume Flow:
1. On reconnect, check savedSession (localStorage key 'landgrab_session')
2. If saved: try RejoinRoom
3. If RejoinRoom unavailable: try JoinRoom
4. On success: restore gameState
5. If room gone: clear session, show error

---

## 12. DEPENDENCIES

```json
"@microsoft/signalr": "^10.0.0",
"axios": "^1.13.6",
"i18next": "^25.8.18",
"leaflet": "^1.9.4",
"react": "^19.2.0",
"react-dom": "^19.2.0",
"react-i18next": "^16.5.8",
"react-router-dom": "^7.13.1"
```

**Note:** react-router-dom is installed but NOT used. Simple view state (string) instead.

---

## 13. STYLING & UI

- CSS-in-JS: No (just CSS files)
- Global styles: `/src/styles/index.css`
- Component-specific: inline styles and CSS classes
- Tailwind: No
- CSS Modules: No
- BEM naming: Some (e.g. `wizard-step`, `btn-primary`)

**Key CSS Elements:**
- `.wizard-*` - Setup wizard steps
- `.btn-primary`, `.btn-ghost` - Buttons
- `.hex-*` - Hex map elements
- `.map-feedback-*` - Toast notifications
- `.game-*` - Game HUD elements

---

## 14. i18n & LOCALIZATION

**Languages:** English (en), Dutch (nl)
**Keys in:** `/src/i18n/en.ts`, `/src/i18n/nl.ts`
**Usage:** `useTranslation()` hook from react-i18next

---

## SUMMARY

**Landgrab Frontend is a location-based territory control game with:**
- **Zero state management library** (pure useState in App.tsx)
- **Leaflet-based hex map rendering** with real-world coordinates
- **SignalR real-time updates** for multi-player sync
- **No REST API** for game logic (all SignalR methods)
- **Modular component structure** (auth, lobby, game, map)
- **Phase-gated game mechanics** with 10+ gameplay modes
- **Configurable setup wizard** for game customization
- **Session persistence** via localStorage
- **Internationalization** (i18next)

