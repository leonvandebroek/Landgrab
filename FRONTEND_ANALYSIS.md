# Landgrab Frontend - Complete Analysis

## 📋 Quick Reference
**Frontend Path:** `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui`

---

## 1. COMPONENT FILES (8 REQUIRED)

### 1.1 AuthPage.tsx
**Path:** `src/components/auth/AuthPage.tsx` (205 lines)

**Purpose:** User authentication (login/register) with tab switching

**Props:**
- `onLogin(usernameOrEmail, password): Promise<unknown>`
- `onRegister(username, email, password): Promise<unknown>`

**State:**
- `mode: 'login' | 'register'` - Current auth mode
- `username, email, password, error` - Form data
- `fieldErrors: Record<string, string>` - Per-field validation errors
- `loading: boolean` - Form submission state

**Interactive Elements:**
- **Tab Switcher:** `.auth-tabs` with two buttons
  - "Sign In" and "Sign Up" toggle mode
  - Active state: `className={mode === 'login' ? 'active' : ''}`
- **Form Fields:**
  - Username: `type="text"`, `autoComplete="username"`, cleared errors on change
  - Email: `type="email"`, `autoComplete="email"` (register only), regex validation
  - Password: `type="password"`, `minLength={8}`, `autoComplete="current-password"` or `"new-password"`
- **Buttons:**
  - Submit: `btn-primary auth-submit`, disabled during loading
- **Error Display:**
  - Global error: `.error-msg`
  - Field errors: `.error-msg field-error` (mapped below inputs)
  - Server field errors: from `AuthApiError.fieldErrors`

**Validation Function:**
```typescript
validateFields(mode, username, email, password, t): Record<string, string>
// Validates: username required, email format, password min 8 chars
```

**CSS Classes:**
- `.auth-page`, `.auth-card`, `.auth-shell` - Layout
- `.auth-hero-panel`, `.auth-form-panel` - Two-column split
- `.auth-logo`, `.auth-hero-copy` - Branding
- `.auth-benefit-card` - Trust badges
- `.auth-form`, `.field` - Form structure
- `.btn-primary`, `.btn-ghost` - Buttons

---

### 1.2 GameLobby.tsx
**Path:** `src/components/lobby/GameLobby.tsx` (290 lines)

**Purpose:** Main lobby hub (entry screen OR setup wizard dispatcher)

**Props:** ~50 game setup callbacks + state
- `gameState: GameState | null` - If null, show entry screen; if set, show wizard
- `myUserId: string`, `connected: boolean`
- `currentLocation`, `locationError`, `locationLoading`
- `recentRooms: RoomSummary[]`
- Setup callbacks: `onCreateRoom`, `onJoinRoom`, `onSetAlliance`, `onSetMapLocation`, etc.

**Two Rendering Modes:**

**A. Entry Screen (no game state)**
- **Layout:** `.lobby-page` > `.lobby-card is-entry` > `.lobby-entry-layout`
  - Left: `.lobby-entry-main` (create/join panels)
  - Right: `.lobby-entry-side` (recent rooms, logout)
- **Create Room Panel:**
  - Card: `.setting-card entry-panel entry-panel-primary`
  - Button: `btn-primary big` with `onClick={onCreateRoom}`
  - Disabled when `!connected`
- **Join Room Panel:**
  - Card: `.setting-card entry-panel`
  - Input: `maxLength={6}`, `toUpperCase()` on change
  - Button: `btn-secondary`, disabled unless code is 6 chars AND connected
  - Helper text: `.section-note` with join disabled reason
- **Recent Rooms:**
  - Card: `.setting-card entry-panel entry-panel-secondary`
  - Buttons: `.recent-room-button` per room (click to join)
  - Connected status: `.recent-room-status`
  - Empty state: spotlight card with "no templates" message
- **Footer Actions:**
  - Error: `.error-msg` if present
  - Logout: `btn-ghost` to sign out

**B. In Room (setup wizard dispatcher)**
- Delegates to:
  - `SetupWizard` if `isHost` (host setup flow)
  - `GuestWizardView` if guest (waiting for host)

**Key Logic:**
- `canSubmitJoinCode = connected && joinCode.trim().length === 6`
- `me = gameState?.players.find(p => p.id === myUserId)`
- `isHost = me?.isHost ?? false`

---

### 1.3 SetupWizard.tsx
**Path:** `src/components/lobby/SetupWizard.tsx` (290 lines)

**Purpose:** 5-step host setup wizard for room configuration

**Props:** ~40 callbacks + game state, auth, location

**5 Steps:**
```
0: LocationStep       (set map center lat/lng)
1: TeamsStep         (assign alliances/roles)
2: RulesStep         (tile size, claim mode, win condition)
3: DynamicsStep      (copresence, game dynamics)
4: ReviewStep        (draw game area, start game)
```

**Key Features:**
- **Observer Mode Toggle** (host only, step 0+):
  - `.observer-mode-toggle` with two `.observer-mode-btn` buttons
  - "Player Mode" vs "Observer Mode"
  - Button active state: `className={!gameState.hostObserverMode ? ' active' : ''}`
- **Step Indicator:**
  - `.wizard-step-indicator` with `.wizard-dot` buttons
  - States: `.is-active` (current), `.is-done` (completed)
  - Click handler: `if (i <= step || (i === step + 1 && canGoNext)) setStep(i)`
  - Step count: `Step {current}/{total}` (1/5 format)
- **Navigation:**
  - Back: `.btn-ghost` (or "Return to Lobby" on step 0)
  - Next: `.btn-primary`, disabled when `!canGoNext`
  - Logout: `.btn-ghost` (secondary)
- **Completion Logic:**
  ```typescript
  stepComplete = {
    location: gameState.hasMapLocation && mapLat && mapLng,
    teams: alliances.length > 0 && players.length >= 2 && all have allianceId,
    rules: true, // always valid (defaults)
    dynamics: true, // always valid (Klassiek preset)
    review: false // never "complete"
  }
  ```
- **Auto-Advance:** LocationStep → TeamsStep on successful location set
- **Derived Initial Step:** Based on what's incomplete
  - If !location → 0
  - Else if !teams → 1
  - Else → 2 (default to rules)

**CSS Classes:**
- `.wizard-page`, `.wizard-container` - Full-page layout
- `.wizard-header`, `.wizard-footer` - Top/bottom bars
- `.wizard-content` - Step content area
- `.wizard-step-label` - "Step X/5" text
- `.wizard-error` - Error message
- `.wizard-secondary-actions` - Logout button section

---

### 1.4 DebugLocationPanel.tsx
**Path:** `src/components/game/DebugLocationPanel.tsx` (75 lines)

**Purpose:** GPS debug controls (dev environment only)

**Props:**
- `enabled: boolean` - Panel active state
- `canStepByHex: boolean` - Enable hex stepping
- `mapCenter: LocationPoint | null` - Current map center
- `onApply(lat, lng): void` - Apply debug location
- `onDisable(): void` - Disable debug mode
- `onStepByHex(dq, dr): LocationPoint | null` - Step by hex offset

**Interactive Elements:**
- **Toggle Button:**
  - `.btn-secondary small`
  - Text: `enabled ? "Disable Location" : "Enable Location"`
  - Disabled when `!enabled && !mapCenter`
  - `onClick={handleToggle}`: toggles between apply/disable
- **Hex Step Grid:** `.debug-gps-step-grid compact`
  - Layout: 3×3 grid with compass directions
  - North button: `onStepByHex(0, 1)`, disabled when !canStepByHex
  - West button: `onStepByHex(-1, 0)`
  - East button: `onStepByHex(1, 0)`
  - South button: `onStepByHex(0, -1)`
  - Center label: "Center"
  - Spacers: empty grid cells
- **Styling:**
  - `.debug-gps-panel` - Container
  - `.is-active` class when enabled
  - `aria-labelledby="debug-gps-title"` for accessibility

**HEX_STEP_DIRECTIONS constant:**
```typescript
[
  { key: 'north', dq: 0, dr: 1 },
  { key: 'west', dq: -1, dr: 0 },
  { key: 'east', dq: 1, dr: 0 },
  { key: 'south', dq: 0, dr: -1 }
]
```

---

### 1.5 GameView.tsx
**Path:** `src/components/GameView.tsx` (230 lines)

**Purpose:** Main in-game UI container (lazy-loaded)

**Props:** Comprehensive game & UI data
- `userId, connectionBanner, currentLocation, currentHex`
- `effectiveLocationError, currentPlayerName, playerDisplayPrefs`
- `mapNavigateRef: MutableRefObject<(lat, lng) => void | null>`
- `onNavigateMap(lat, lng)` - Mini-map pan
- `debugToggle, debugPanel` - Debug UI nodes
- `toasts: GameToast[], onDismissToast(id)`
- `actions: GameViewActions` - All game callbacks

**Zustand Reads:**
```typescript
gameState = useGameStore(state => state.gameState)
selectedHex = useGameplayStore(state => state.selectedHex)
combatResult = useGameplayStore(state => state.combatResult)
hasAcknowledgedRules = useUiStore(state => state.hasAcknowledgedRules)
error = useUiStore(state => state.error)
mainMapBounds, selectedHexScreenPos = useUiStore(...)
```

**Rendering Logic:**
1. **Gate: Rules Acknowledgment**
   - If !hasAcknowledgedRules: show `GameRulesPage`
   - Stored in sessionStorage: `lg-rules-ack-{roomCode}`
   - Button callback: `setHasAcknowledgedRules(true)`
2. **Gate: Observer Mode**
   - If `myPlayer?.isHost && gameState.hostObserverMode`:
     - Show `HostControlPlane` with embedded GameMap
3. **Standard Playing Mode**
   - Show `PlayingHud` with embedded GameMap
4. **Combat Modal Overlay**
   - If `combatResult`, overlay `CombatModal`
   - Close: `setCombatResult(null)`

**Lazy Imports:**
```typescript
const GameMap = lazy(() => import('./map/GameMap').then(...))
const PlayingHud = lazy(() => import('./game/PlayingHud').then(...))
```

---

### 1.6 HexGridLayer.ts
**Path:** `src/components/game/map/HexGridLayer.ts` (494 lines)

**Purpose:** Leaflet hex grid rendering (non-React logic)

**Main Export:**
```typescript
function renderHexGridLayers(options: RenderHexGridLayerOptions): void
```

**Rendering Pipeline:**
1. **World Dim Mask** (if `layerPrefs.worldDimMask`)
   - Dark overlay covering non-playable world area
   - Uses polygon with inverse ring logic

2. **Per-Cell Rendering** (for each hex):
   - Terrain icon (if visible at zoom)
   - Polygon with styled fill/border
   - Tooltip on hover
   - Contest effects (red circle if contested)
   - Troop badges (count or "?")
   - Building icons (master tile ✦, fort 🏰, HQ 🏛️)

3. **Supply Lines** (if enabled)
   - Dashed lines between HQ hex centers
   - Colored by alliance
   - Low opacity (0.4)

4. **Contested Edges** (if enabled)
   - Red polylines on contested hex borders
   - Intensity-based coloring

**CSS Classes Generated:**
- `.hex-polygon` - Base
- `.hex-polygon--inactive` - Grayed out
- `.hex-polygon--current` - Player's location (bright border)
- `.hex-polygon--selected` - Selected on map
- `.hex-polygon--contested` - Multiple owners on border
- `.hex-polygon--frontier` - Friendly alliance boundary
- `.hex-polygon--mine` - Owned by current player
- `.hex-polygon--supply-disconnected` - Disconnected from HQ
- `.hex-disconnected-overlay` - Dashed overlay on disconnected
- `.hex-terrain-icon` - Terrain emoji
- `.hex-label-wrapper` - Troop count badge
- `.hex-building-icon` - Building emoji
- `.contested-edge`, `.contested-edge-intense` - Border lines
- `.supply-line` - Supply connection line

**Styling Logic:**
```typescript
getHexFillStyle({cell, hasTerrain, isFogHidden, isInactive, ownerColor, terrainType})
getHexBorderStyle({cell, isCurrentHex, isSelected, isHQ, isInactive, isFogHidden})
getHexPolygonClassName({...all states...})
```

**Zoom-Based Visibility:**
```typescript
showTerrainIcons(currentZoom) - terrain emoji at zoom > X
showTroopBadges(currentZoom) - troop count at zoom > Y
showBorderEffects(currentZoom) - fancy borders at zoom > Z
// etc.
```

---

### 1.7 LobbyView.tsx
**Path:** `src/components/LobbyView.tsx` (168 lines)

**Purpose:** Lobby page wrapper (lazy-loads GameLobby)

**Props:**
- `connectionBanner, username, userId, authToken, connected`
- `currentLocation, effectiveLocationError, effectiveLocationLoading`
- `visibleRecentRooms, invoke` (SignalR)
- `onLogout, debugPanel, debugToggle`
- `actions: LobbyViewActions` (all game setup callbacks)

**Zustand Reads:**
```typescript
gameState = useGameStore(state => state.gameState)
error = useUiStore(state => state.error)
setView = useUiStore(state => state.setView)
```

**Rendering:**
1. **ConnectionBanner** (if connectionBanner is truthy)
2. **Suspense Fallback** → LoadingFallback
3. **GameLobby** (lazy-loaded)
   - Passes all props through
   - Renders entry screen OR wizard based on gameState
4. **Map Editor Toggle** (if !gameState)
   - Button: `.btn-secondary map-editor-toggle`
   - Text: "🗺️ {t('mapEditor.title')}"
   - Click: `setView('mapEditor')`
   - Only shows when NOT in a game
5. **Debug Nodes** (debugPanel, debugToggle)

**Lazy Import:**
```typescript
const GameLobby = lazy(() =>
  import('./lobby/GameLobby').then(m => ({ default: m.GameLobby }))
)
```

---

### 1.8 App.tsx
**Path:** `src/App.tsx` (479 lines)

**Purpose:** Root app orchestrator (routing, auth, state, effects)

**View Routing:**
```typescript
if (!authReady) return null; // Loading
if (!auth) return <AuthPage />; // Not logged in
if (view === 'mapEditor') return <MapEditorPage />;
if (view === 'gameover' && gameState) return <GameOver />;
if (view === 'game' && gameState) return <GameView />;
return <LobbyView />; // Default
```

**SignalR Setup (Complex Dependency Cycle):**
```typescript
// 1. Create stable wrapper functions
savedSessionRef, autoResumeRef → stable wrappers
stableSaveSession, stableResolveFromState, stableResolveFromError

// 2. Call in order:
const signalRHandlers = useSignalRHandlers({
  getInvoke, saveSession, resolveResumeFromState, resolveResumeFromError, ...
})
const { connected, reconnecting, invoke } = useSignalR(auth?.token, signalRHandlers)
invokeRef.current = invoke
const { saveSession, clearSession, ... } = useAutoResume({ auth, connected, invoke, ... })
autoResumeRef.current = { saveSession, ... } // Populate synchronously
```

**State Reads:**
```typescript
// gameStore
gameState, savedSession, myRooms, autoResuming
setGameState, setMyRooms, setSavedSession, ...

// gameplayStore
setPickupPrompt, clearGameplayUi

// uiStore
view, showDebugTools, debugLocationEnabled, debugLocation
setView, setError, setShowDebugTools, setDebugLocationEnabled, setDebugLocation

// playerPreferences (custom hook)
[playerDisplayPrefs, setPlayerDisplayPrefs]

// Hooks
{ auth, authReady, login, register, logout }
{ connected, reconnecting, invoke }
{ location, error, loading } = useGeolocation(Boolean(auth))
{ toasts, pushToast, dismissToast } = useToastQueue()
{ playSound } = useSound()
```

**Location & GPS:**
```typescript
liveLocation = { lat: location.lat, lng: location.lng } // Real GPS
usingDebugLocation = DEBUG_GPS_AVAILABLE && debugLocationEnabled && debugLocation !== null
currentLocation = usingDebugLocation ? debugLocation : liveLocation
effectiveLocationError = usingDebugLocation ? null : location.error
effectiveLocationLoading = usingDebugLocation ? false : location.loading

// Debug helpers
applyDebugLocation(lat, lng)
disableDebugLocation()
stepDebugLocationByHex(dq, dr) → calculate next hex, apply location
```

**GetMyRooms Effect:**
```typescript
useEffect(() => {
  if (!auth || !connected || gameState || autoResuming) return;
  invoke<RoomSummary[]>('GetMyRooms').then(setMyRooms).catch(err => setError(...))
}, [auth, autoResuming, connected, gameState, invoke, t])
```

**Debug GPS:**
- Flag: `DEBUG_GPS_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_GPS === 'true'`
- Panel: Shown when `auth && DEBUG_GPS_AVAILABLE && showDebugTools && view !== 'gameover'`
- Toggle: Shown when `auth && DEBUG_GPS_AVAILABLE && view !== 'gameover'`

**Action Groupings:**
```typescript
gameViewActions: GameViewActions = {
  onHexClick, onConfirmPickup, onReturnToLobby, currentHexActions, ...
}
lobbyViewActions: LobbyViewActions = {
  onCreateRoom, onJoinRoom, onSetAlliance, onSetMapLocation, ...
}
```

**Logout Handler:**
```typescript
handleLogout() {
  clearSession()           // SignalR
  disableDebugLocation()   // Debug
  setShowDebugTools(false)
  setMyRooms([])
  logout()                 // Auth
  setGameState(null)       // Game
  setPickupPrompt(null)    // Gameplay
  clearGameplayUi()
  setView('lobby')
}
```

---

## 2. ZUSTAND STORES (4 STORES)

### 2.1 gameStore.ts
**Path:** `src/stores/gameStore.ts` (105 lines)

```typescript
interface SavedSession {
  roomCode: string;
  userId: string;
}

interface GameStore {
  gameState: GameState | null;
  savedSession: SavedSession | null;
  myRooms: RoomSummary[];
  autoResuming: boolean;
  
  setGameState(state: GameState | null): void;
  updateGameState(updater: (prev) => GameState | null): void;
  setSavedSession(session: SavedSession | null): void;
  setMyRooms(rooms: RoomSummary[]): void;
  setAutoResuming(resuming: boolean): void;
  saveSession(roomCode: string, userId: string): void;
  clearSession(): void;
  loadSession(): SavedSession | null;
}
```

**Persistence:**
- Key: `'landgrab_session'` in localStorage
- Functions: `readSavedSession()`, `persistSavedSession(session)`
- Normalization: `normalizeSavedSession()` ensures valid roomCode & userId

**Initialization:**
```typescript
gameState: null,
savedSession: readSavedSession(),
myRooms: [],
autoResuming: false
```

---

### 2.2 uiStore.ts
**Path:** `src/stores/uiStore.ts` (61 lines)

```typescript
type AppView = 'lobby' | 'game' | 'gameover' | 'mapEditor';

interface DebugLocationPoint { lat: number; lng: number; }
interface MainMapBounds { north, south, east, west: number; }
interface ScreenPosition { x: number; y: number; }

interface UiStore {
  view: AppView;
  error: string;
  hasAcknowledgedRules: boolean;
  showDebugTools: boolean;
  debugLocationEnabled: boolean;
  debugLocation: DebugLocationPoint | null;
  mainMapBounds: MainMapBounds | null;
  selectedHexScreenPos: ScreenPosition | null;
  
  setView(view: AppView): void;
  setError(error: string): void;
  clearError(): void;
  setHasAcknowledgedRules(ack: boolean): void;
  setShowDebugTools(show: boolean): void;
  setDebugLocationEnabled(enabled: boolean): void;
  setDebugLocation(loc: DebugLocationPoint | null): void;
  setMainMapBounds(bounds: MainMapBounds | null): void;
  setSelectedHexScreenPos(pos: ScreenPosition | null): void;
}
```

**Initialization:** All falsy except `view: 'lobby'`

---

### 2.3 gameplayStore.ts
**Path:** `src/stores/gameplayStore.ts` (85 lines)

```typescript
interface GameplayStore {
  selectedHex: [number, number] | null;
  mapFeedback: MapInteractionFeedback | null;
  pickupPrompt: PickupPrompt | null;
  pickupCount: number;
  attackPrompt: AttackPrompt | null;
  attackCount: number;
  combatResult: CombatResult | null;
  commandoTargetingMode: boolean;
  selectedHexKey: string | null; // Computed property
  
  setSelectedHex(hex: [number, number] | null): void;
  setMapFeedback(feedback: MapInteractionFeedback | null): void;
  setPickupPrompt(prompt: PickupPrompt | null): void;
  setPickupCount(count: number): void;
  setAttackPrompt(prompt: AttackPrompt | null): void;
  setAttackCount(count: number): void;
  setCombatResult(result: CombatResult | null): void;
  setCommandoTargetingMode(mode: boolean): void;
  clearGameplayUi(): void; // Reset all to defaults
}
```

**Computed Property:**
```typescript
get selectedHexKey() {
  const selectedHex = get().selectedHex;
  return selectedHex ? `${selectedHex[0]},${selectedHex[1]}` : null;
}
```

**Auto-Timer:**
```typescript
setMapFeedback: (mapFeedback) => {
  clearMapFeedbackTimer();
  set({ mapFeedback });
  if (!mapFeedback) return;
  mapFeedbackTimer = setTimeout(() => {
    set({ mapFeedback: null });
    mapFeedbackTimer = null;
  }, 3500); // Clear after 3.5 seconds
}
```

---

### 2.4 notificationStore.ts
**Path:** `src/stores/notificationStore.ts` (45 lines)

```typescript
interface NotificationStore {
  hostMessage: HostMessage | null;
  setHostMessage(message: HostMessage | null): void;
  clearAll(): void;
}
```

**Auto-Timer:**
```typescript
setHostMessage: (hostMessage) => {
  clearNotificationTimer('hostMessage');
  set({ hostMessage });
  if (!hostMessage) return;
  scheduleNotificationClear('hostMessage', 10000, () => set({ hostMessage: null }));
}
```

---

## 3. SIGNALR INTEGRATION

### 3.1 useSignalR Hook
**Path:** `src/hooks/useSignalR.ts` (209 lines)

**Returns:**
```typescript
{
  connected: boolean;
  reconnecting: boolean;
  invoke: <T = void>(method: string, ...args: unknown[]) => Promise<T>;
}
```

**Hub Setup:**
```typescript
new HubConnectionBuilder()
  .withUrl('/hub/game', {
    transport: HttpTransportType.WebSockets,
    accessTokenFactory: () => token
  })
  .withAutomaticReconnect({
    nextRetryDelayInMilliseconds: ({ previousRetryCount }) =>
      AUTO_RECONNECT_DELAYS[previousRetryCount] ?? null
  })
  .configureLogging(LogLevel.Warning)
  .build()
```

**Auto-Reconnect Delays:**
```typescript
[0, 1000, 2000, 5000, 10000, 15000, 30000, 30000, 30000, 30000, 60000, 60000, 60000]
// 13 attempts, then null (stop auto-reconnect)
```

**Manual Reconnect (Fallback):**
- Triggered when auto-reconnect exhausted
- Delay: 15000ms between attempts
- Max attempts: 40
- Total max retry duration: ~15 minutes

**Events (onXXX callbacks):**
- `onRoomCreated(code, state)`
- `onPlayerJoined(state)`
- `onGameStarted(state)`
- `onStateUpdated(state)`
- `onCombatResult(result)`
- `onGameOver(winnerId, winnerName, isAllianceVictory)`
- `onTileLost(q, r, attackerName)`
- `onGlobalHexUpdated(hex)`
- `onGlobalMapLoaded(hexes[])`
- `onError(message)`
- `onReconnected()`
- `onHostMessage(message, fromHost)`
- `onTemplateSaved(templateId, name)`

**Connection Lifecycle:**
```
token provided
  → build connection
  → register event handlers
  → conn.onreconnecting() → setConnected(false), setReconnecting(true)
  → conn.onreconnected() → setConnected(true), setReconnecting(false), onReconnected?()
  → conn.onclose() → scheduleManualReconnect()
  → conn.start()
     → success: setConnected(true), setReconnecting(false)
     → fail: scheduleManualReconnect()
```

---

## 4. CONFIGURATION FILES

### 4.1 playwright.config.ts
**Path:** `frontend/landgrab-ui/playwright.config.ts`

**Key Settings:**
```typescript
{
  testDir: './e2e',                           // Test location
  fullyParallel: true,                        // Run tests in parallel
  forbidOnly: !!process.env.CI,               // Fail if focused test
  retries: process.env.CI ? 2 : 0,            // Retry on CI
  workers: process.env.CI ? 1 : undefined,    // 1 worker on CI
  reporter: 'html',                           // HTML report output
  use: {
    baseURL: 'http://localhost:5173',         // Vite dev server
    trace: 'on-first-retry',                  // Record trace on retry
  },
  webServer: {
    command: 'npm run dev',                   // Auto-start server
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,     // Reuse dev server locally
    timeout: 30000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ],
}
```

**Test Execution:**
- Tests in `./e2e/` directory
- Runs on chromium only
- Auto-starts `npm run dev` (Vite server at :5173)
- HTML test report generated
- Traces recorded on first retry for debugging

---

### 4.2 package.json
**Path:** `frontend/landgrab-ui/package.json`

**Key Dependencies:**
```json
{
  "@microsoft/signalr": "^10.0.0",      // WebSocket connection
  "react": "^19.2.0",                   // UI framework
  "react-dom": "^19.2.0",               // DOM rendering
  "react-i18next": "^16.5.8",           // i18n integration
  "i18next": "^25.8.18",                // Internationalization
  "zustand": "^5.0.11",                 // State management
  "leaflet": "^1.9.4",                  // Map rendering
  "react-router-dom": "^7.13.1",        // Routing (if used)
  "axios": "^1.13.6"                    // HTTP client
}
```

**Dev Dependencies:**
```json
{
  "@playwright/test": "^1.58.2",        // E2E testing
  "typescript": "~5.9.3",               // Type checker
  "vite": "^7.3.1",                     // Build tool
  "eslint": "^9.39.1",                  // Linting
  "@vitejs/plugin-react": "^5.1.1",     // Vite React plugin
  "@types/react": "^19.2.7",            // React types
  "@types/leaflet": "^1.9.21"           // Leaflet types
}
```

**Scripts:**
- `npm run dev` - Start Vite dev server at :5173
- `npm run build` - `tsc -b && vite build` (type-check then build)
- `npm run lint` - `eslint .`
- `npm run preview` - Preview production build locally

---

### 4.3 tsconfig.json
**Path:** `frontend/landgrab-ui/tsconfig.json`

```json
{
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

**Purpose:** Project references for build layering

---

### 4.4 tsconfig.app.json
**Path:** `frontend/landgrab-ui/tsconfig.app.json`

```typescript
{
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    jsx: 'react-jsx',
    
    // Bundler settings
    moduleResolution: 'bundler',
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    moduleDetection: 'force',
    noEmit: true,
    
    // Strict mode
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noFallthroughCasesInSwitch: true,
    noUncheckedSideEffectImports: true,
    erasableSyntaxOnly: true
  },
  include: ['src']
}
```

**Settings Highlights:**
- ES2022 target (modern browsers)
- JSX: react-jsx (no `React` import needed)
- Strict TypeScript
- No emit (Vite handles compilation)

---

## 5. PLAYWRIGHT TEST FILE

### 5.1 e2e/localization.spec.ts
**Path:** `frontend/landgrab-ui/e2e/localization.spec.ts` (416 lines)

**Test Coverage:** Internationalization (i18n) validation

**Test Groups:**

**Group 1-2: Auth Page**
- English: "Sign In", "Sign Up", "Username or Email", "Password"
- Dutch: "Inloggen", "Registreren", "Gebruikersnaam of e-mail", "Wachtwoord"
- Tagline: "Conquer your neighborhood!" vs "Verover je omgeving! (letterlijk)"

**Group 3-4: Lobby Page**
- English: "Welcome, {username}!", "Map Editor"
- Dutch: "Welkom, {username}!", "Kaarteditor"
- Requires fake auth in localStorage before load

**Group 5-6: Map Editor - Template Manager (empty)**
- English: "Map Editor", "No templates yet", "Create Your First Template"
- Dutch: "Kaarteditor", "Nog geen sjablonen", "Maak je eerste sjabloon"
- Mocks empty map template list

**Group 7-8: Map Editor - Template Cards (with data)**
- English: "Test Map", "19 hexes", "25m tiles", Edit/Duplicate/Delete buttons
- Dutch: "19 hexen", "25m tegels", Bewerken/Dupliceren/Verwijderen buttons
- Mocks single template in list

**Group 9-10: Map Editor - Editor Toolbar**
- English: "New Template", "Template Name", "Create Template"
- Dutch: "Nieuw sjabloon", "Sjabloonnaam", "Sjabloon maken"
- Tests form labels and button states

**Helper Functions:**
```typescript
setFakeAuth(page)                    // Inject auth into localStorage
mockSignalR(page)                    // Mock /hub/** requests
mockMapTemplates(page, body)         // Mock GET /api/map-templates
assertNoRawKeys(page)                // Verify no untranslated keys leak
contextWithLocale(browser, locale)   // Create context with browser locale
```

**Test Pattern:**
```typescript
test('shows English text when browser locale is en-US', async ({ browser }) => {
  const context = await contextWithLocale(browser, 'en-US');
  const page = await context.newPage();
  
  // Setup mocks/auth if needed
  await setFakeAuth(page);
  await mockSignalR(page);
  
  // Navigate and wait
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Assert visible text
  await expect(page.getByText('Expected Text')).toBeVisible();
  
  // Assert no raw keys
  await assertNoRawKeys(page);
  await context.close();
});
```

---

## 6. KEY INTEGRATION POINTS

### 6.1 Rules Acknowledgment Gate
**File:** `GameView.tsx`

```typescript
const rulesKey = gameState?.roomCode ? `lg-rules-ack-${gameState.roomCode}` : '';

useEffect(() => {
  if (!rulesKey) {
    setHasAcknowledgedRules(false);
    return;
  }
  setHasAcknowledgedRules(sessionStorage.getItem(rulesKey) === 'true');
}, [rulesKey, setHasAcknowledgedRules]);

const handleAcknowledgeRules = useCallback(() => {
  if (rulesKey) {
    sessionStorage.setItem(rulesKey, 'true');
  }
  setHasAcknowledgedRules(true);
}, [rulesKey, setHasAcknowledgedRules]);

// Render:
if (!hasAcknowledgedRules) {
  return <GameRulesPage gameState={gameState} onContinue={handleAcknowledgeRules} />;
}
```

**Storage:**
- Key: `lg-rules-ack-{roomCode}` in sessionStorage
- Value: `"true"` when acknowledged
- Clears on page reload (sessionStorage) but persists during session

### 6.2 Debug Location Priority
**File:** `App.tsx`

```typescript
const usingDebugLocation = DEBUG_GPS_AVAILABLE && debugLocationEnabled && debugLocation !== null;

const currentLocation = useMemo<LocationPoint | null>(() => {
  if (usingDebugLocation) return debugLocation;
  return liveLocation;
}, [debugLocation, liveLocation, usingDebugLocation]);

const effectiveLocationError = usingDebugLocation ? null : location.error;
const effectiveLocationLoading = usingDebugLocation ? false : location.loading;
```

**Priority:**
1. Debug location (if enabled)
2. Real GPS location
3. Show error only from real GPS

### 6.3 Step Completion Logic
**File:** `SetupWizard.tsx`

```typescript
const stepComplete = useMemo(() => ({
  location: gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null,
  teams: gameState.alliances.length > 0 
    && gameState.players.length >= 2 
    && gameState.players.every(p => p.allianceId),
  rules: true, // always valid
  dynamics: true, // always valid
  review: false, // never "complete"
}), [gameState]);

const canGoNext = useMemo(() => {
  switch (step) {
    case 0: return stepComplete.location;
    case 1: return stepComplete.teams;
    case 2: return true;
    case 3: return true;
    default: return false;
  }
}, [step, stepComplete]);

const canStart = useMemo(() => {
  return gameState.players.length >= 2
    && gameState.hasMapLocation
    && gameState.players.every(p => p.allianceId);
}, [gameState]);
```

---

## 7. CSS CLASS ARCHITECTURE

**Button Classes:**
- `.btn-primary` - Primary action (blue/main color)
- `.btn-secondary` - Secondary action (outline)
- `.btn-ghost` - Tertiary/minimal (text-only)
- `.btn-primary.big` - Large primary button
- `.btn-secondary.small` - Small secondary button
- `.btn-ghost.small` - Small ghost button

**Card/Panel Classes:**
- `.setting-card` - Elevated card container
- `.entry-panel` - Lobby entry section
- `.entry-panel-primary` - Primary entry panel
- `.entry-panel-secondary` - Secondary entry panel
- `.map-editor-card` - Template card
- `.stage-spotlight-card` - Feature/empty-state card

**Layout Classes:**
- `.lobby-page` - Full page container
- `.lobby-card` - Main card wrapper
- `.lobby-entry-layout` - Two-column grid
- `.lobby-entry-main` - Left column
- `.lobby-entry-side` - Right column
- `.wizard-page` - Full wizard page
- `.wizard-container` - Wizard content wrapper
- `.wizard-header`, `.wizard-footer` - Fixed header/footer

**State Classes:**
- `.is-active` - Active/selected state
- `.is-done` - Completed state
- `.is-ready` - Ready state
- `.is-entry` - Entry screen variant

**Utility Classes:**
- `.section-kicker` - Badge/label above title
- `.section-note` - Helper text/subtext
- `.section-title` - Major heading
- `.room-code` - Room code badge
- `.phase-badge` - Phase/status badge
- `.status-chip` - Connection status
- `.error-msg` - Error message
- `.field-error` - Field-level error

---

## 8. DIRECTORY STRUCTURE

```
frontend/landgrab-ui/
├── e2e/
│   └── localization.spec.ts          # Playwright E2E tests
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   └── AuthPage.tsx          # ✓ Login/register UI
│   │   ├── editor/                   # Map editor components
│   │   ├── game/
│   │   │   ├── DebugLocationPanel.tsx # ✓ Debug GPS panel
│   │   │   ├── map/
│   │   │   │   ├── HexGridLayer.ts   # ✓ Hex rendering logic
│   │   │   │   ├── GameMap.tsx
│   │   │   │   └── ...
│   │   │   └── ...
│   │   ├── lobby/
│   │   │   ├── GameLobby.tsx         # ✓ Main lobby UI
│   │   │   ├── SetupWizard.tsx       # ✓ Setup wizard (host)
│   │   │   └── ...
│   │   ├── global/                   # Global map (editor)
│   │   ├── GameView.tsx              # ✓ In-game view
│   │   ├── LobbyView.tsx             # ✓ Lobby wrapper
│   │   ├── ConnectionBanner.tsx
│   │   └── ...
│   ├── hooks/
│   │   ├── useSignalR.ts             # ✓ SignalR connection
│   │   ├── useAuth.ts
│   │   ├── useGameActions.ts
│   │   └── ...
│   ├── stores/
│   │   ├── gameStore.ts              # ✓ Game state
│   │   ├── uiStore.ts                # ✓ UI state
│   │   ├── gameplayStore.ts          # ✓ Gameplay state
│   │   ├── notificationStore.ts      # ✓ Notifications
│   │   └── index.ts
│   ├── types/
│   │   ├── game.ts                   # Game type definitions
│   │   └── ...
│   ├── utils/
│   │   ├── gameHelpers.ts
│   │   ├── terrainColors.ts
│   │   └── ...
│   ├── i18n/
│   │   ├── en.ts                     # English translations
│   │   ├── nl.ts                     # Dutch translations
│   │   └── index.ts
│   ├── styles/
│   │   └── index.css                 # Global styles
│   ├── App.tsx                       # ✓ Root component
│   └── main.tsx
├── playwright.config.ts              # ✓ Test configuration
├── package.json                      # ✓ Dependencies
├── tsconfig.json                     # ✓ TS config refs
├── tsconfig.app.json                 # ✓ App TS config
└── vite.config.ts
```

---

## 9. COMPONENT LIFECYCLE NOTES

### Route Entry Points (App.tsx)
1. **Not authenticated** → `AuthPage` (login/register)
2. **Map Editor mode** → `MapEditorPage`
3. **Game over** → `GameOver` (win screen)
4. **In game** → `GameView` (full game UI)
5. **In lobby** → `LobbyView` (default)

### Game Lobby States (GameLobby.tsx)
1. **No room** → Entry screen (create/join)
2. **In room, host** → `SetupWizard` (5-step config)
3. **In room, guest** → `GuestWizardView` (wait for host)

### Game View Gates (GameView.tsx)
1. **Rules not acknowledged** → `GameRulesPage` (gate)
2. **Observer mode** → `HostControlPlane` (no playing)
3. **Standard mode** → `PlayingHud` + `GameMap`
4. **Combat result** → `CombatModal` (overlay)

---

## 10. KEY ENVIRONMENT VARIABLES

**Development:**
- `import.meta.env.DEV` - True in dev mode
- `import.meta.env.VITE_ENABLE_DEBUG_GPS` - Enable GPS debug panel

**Vite:**
- Base URL: http://localhost:5173
- API: Relative paths (backend on same host or proxied)

---

**Document Generated:** Complete frontend analysis with all 8 components, 4 stores, SignalR integration, configs, and test suite specifications.

