# Frontend Analysis - Quick Access Guide

## 📄 Main Document
**Complete Analysis:** [`FRONTEND_ANALYSIS.md`](./FRONTEND_ANALYSIS.md) (1,118 lines, 34 KB)

---

## 🗺️ Component Quick Links

| Component | Path | Lines | Purpose |
|-----------|------|-------|---------|
| **AuthPage.tsx** | `src/components/auth/AuthPage.tsx` | 205 | Login/Register form |
| **GameLobby.tsx** | `src/components/lobby/GameLobby.tsx` | 290 | Main lobby hub |
| **SetupWizard.tsx** | `src/components/lobby/SetupWizard.tsx` | 290 | 5-step host setup |
| **DebugLocationPanel.tsx** | `src/components/game/DebugLocationPanel.tsx` | 75 | GPS debug controls |
| **GameView.tsx** | `src/components/GameView.tsx` | 230 | In-game UI container |
| **HexGridLayer.ts** | `src/components/game/map/HexGridLayer.ts` | 494 | Hex rendering engine |
| **LobbyView.tsx** | `src/components/LobbyView.tsx` | 168 | Lobby wrapper |
| **App.tsx** | `src/App.tsx` | 479 | Root orchestrator |

---

## 📦 Store Quick Links

| Store | Path | Lines | Purpose |
|-------|------|-------|---------|
| **gameStore.ts** | `src/stores/gameStore.ts` | 105 | Game state + rooms |
| **uiStore.ts** | `src/stores/uiStore.ts` | 61 | View routing + UI state |
| **gameplayStore.ts** | `src/stores/gameplayStore.ts` | 85 | Gameplay interactions |
| **notificationStore.ts** | `src/stores/notificationStore.ts` | 45 | Host messages |

---

## 🔗 Hooks & Integration

| Hook | Path | Purpose |
|------|------|---------|
| **useSignalR** | `src/hooks/useSignalR.ts` | WebSocket connection |
| **useSignalRHandlers** | `src/hooks/useSignalRHandlers.ts` | Event binding |
| **useAutoResume** | `src/hooks/useAutoResume.ts` | Session recovery |
| **useGameActions** | `src/hooks/useGameActions.ts` | Game callbacks |
| **useAuth** | `src/hooks/useAuth.ts` | Authentication |
| **useGeolocation** | `src/hooks/useGeolocation.ts` | GPS location |
| **usePlayerPreferences** | `src/hooks/usePlayerPreferences.ts` | User settings |

---

## ⚙️ Configuration Files

| File | Path | Purpose |
|------|------|---------|
| **playwright.config.ts** | `playwright.config.ts` | E2E test setup |
| **package.json** | `package.json` | Dependencies + scripts |
| **tsconfig.json** | `tsconfig.json` | TypeScript config (refs) |
| **tsconfig.app.json** | `tsconfig.app.json` | App TypeScript config |

---

## 🧪 Tests

| Test File | Path | Coverage |
|-----------|------|----------|
| **localization.spec.ts** | `e2e/localization.spec.ts` | i18n (English + Dutch) |

**Test Groups:**
- Tests 1-2: Auth page
- Tests 3-4: Lobby page
- Tests 5-6: Map Editor (empty)
- Tests 7-8: Map Editor (template cards)
- Tests 9-10: Map Editor (toolbar)

---

## 🎯 Key Features

### Rules Acknowledgment Gate
```
SessionStorage: lg-rules-ack-{roomCode}
Location: GameView.tsx, lines 108-124
```

### Debug GPS System
```
Enabled: DEV || VITE_ENABLE_DEBUG_GPS='true'
Priority: Debug GPS > Real GPS > Show error
UI: DebugLocationPanel + toggle button
```

### SignalR Connection
```
URL: /hub/game
Transport: WebSockets
Auto-reconnect: 13 attempts, then manual (40 attempts)
Max duration: ~15 minutes
```

### View Routing
```
lobby      → Entry screen or setup wizard
game       → In-game play UI
gameover   → Win/loss screen
mapEditor  → Template editor
```

---

## 📊 State Flow

```
App.tsx (orchestrator)
  ├─ useAuth() → auth state
  ├─ useSignalR() → connected, reconnecting, invoke
  ├─ useAutoResume() → session recovery
  ├─ useGeolocation() → GPS location
  ├─ useGameStore() → gameState, savedSession, myRooms
  ├─ useGameplayStore() → selectedHex, combatResult
  ├─ useUiStore() → view, error, debugLocation
  └─ usePlayerPreferences() → displayPrefs

View Router:
  ├─ AuthPage (when !auth)
  ├─ MapEditorPage (when view==='mapEditor')
  ├─ GameOver (when view==='gameover')
  ├─ GameView (when view==='game')
  │   ├─ GameRulesPage (gate: !hasAcknowledgedRules)
  │   ├─ HostControlPlane (if observer mode)
  │   └─ PlayingHud + GameMap
  └─ LobbyView (default)
      └─ GameLobby
          ├─ Entry screen (no gameState)
          ├─ SetupWizard (host)
          └─ GuestWizardView (guest)
```

---

## 🎨 CSS Class Reference

### Buttons
- `.btn-primary` - Main action
- `.btn-secondary` - Secondary action
- `.btn-ghost` - Minimal action
- `.btn-primary.big` - Large primary
- `.btn-secondary.small` - Small secondary

### Cards
- `.setting-card` - Standard card
- `.entry-panel` - Lobby panel
- `.map-editor-card` - Template card

### Layout
- `.wizard-page` - Wizard container
- `.lobby-entry-layout` - Lobby two-column

### States
- `.is-active` - Active state
- `.is-done` - Completed state
- `.is-entry` - Entry screen variant

### Hex Rendering
- `.hex-polygon` - Hex base
- `.hex-polygon--current` - Player location
- `.hex-polygon--selected` - Selected hex
- `.hex-polygon--contested` - Contested territory
- `.hex-terrain-icon` - Terrain emoji
- `.hex-label-wrapper` - Troop badge
- `.contested-edge` - Battle edge

---

## 📝 Interactive Elements Summary

### Forms
- **AuthPage**: Username, email, password inputs with validation
- **SetupWizard**: Multi-step form across 5 views
- **DebugLocationPanel**: GPS location controls

### Navigation
- **Tab switchers**: Auth mode toggle
- **Step indicators**: Wizard progress dots
- **Button groups**: Back/Next/Logout actions

### Game Interaction
- **Hex selection**: Click to select, visual feedback
- **Zoom controls**: Show/hide elements at different zoom levels
- **Overlay layers**: Supply lines, contested edges, fog of war

### Status Display
- **Connection banner**: Reconnecting/Restoring messages
- **Error messages**: Global and field-level errors
- **Status chips**: Connection status, phase badges

---

## 🔧 Development

### Start Dev Server
```bash
npm run dev
# Server runs at http://localhost:5173
```

### Build for Production
```bash
npm run build
# Runs: tsc -b && vite build
```

### Run E2E Tests
```bash
npx playwright test
# Tests in e2e/
# Auto-starts dev server
# Runs on chromium
```

### Lint Code
```bash
npm run lint
# ESLint on all files
```

### Enable Debug GPS
```typescript
// Option 1: Development mode (auto-enabled)
npm run dev

// Option 2: Production with flag
VITE_ENABLE_DEBUG_GPS=true npm run build
VITE_ENABLE_DEBUG_GPS=true npm run preview
```

---

## 🌍 Internationalization

**Locales:** English (en), Dutch (nl)

**Files:**
- `src/i18n/en.ts` - English translations
- `src/i18n/nl.ts` - Dutch translations

**Usage:**
```typescript
const { t } = useTranslation();
t('auth.signIn')    // "Sign In" or "Inloggen"
t('lobby.welcome')  // "Welcome, {username}!" with interpolation
```

**Namespaces:**
- `auth.*` - Authentication
- `lobby.*` - Lobby
- `mapEditor.*` - Map editor
- `phase7.*` - Game phases
- `debugGps.*` - Debug tools
- etc.

---

## 📌 Important Notes

### Rules Acknowledgment
- Per-room basis: stored in sessionStorage
- Key: `lg-rules-ack-{roomCode}`
- Clears on page reload (but persists during session)
- Blocks gameplay until acknowledged

### Session Persistence
- Saved to localStorage: `landgrab_session`
- Used for auto-resume on reconnect
- Contains: roomCode, userId
- Cleared on logout

### Hex Coordinate System
- Format: `[q, r]` (axial coordinates)
- Used in: selectedHex, currentHex, hex interactions
- Conversion: latLng ↔ qr via HexMath utilities

### Zoom-Based Visibility
- Terrain icons show at zoom > X
- Troop badges show at zoom > Y
- Border effects show at zoom > Z
- Hex tooltips show at zoom > W
- Configure in: `src/utils/zoomThresholds.ts`

---

## 📚 Further Reading

See **[FRONTEND_ANALYSIS.md](./FRONTEND_ANALYSIS.md)** for:
- Detailed component structures
- Complete Zustand store definitions
- SignalR event handlers
- Playwright test patterns
- CSS class architecture
- Component lifecycle notes

---

**Document Version:** 1.0  
**Last Updated:** March 2025  
**Scope:** Frontend UI components, state management, integration, testing
