# BUG #3: Debug GPS Persistence for Guest Players

## Problem Statement
When a **guest player** enables debug GPS location during the lobby wizard (LocationStep), the debug location **does NOT persist** after the game transitions to the Playing phase. The host's debug GPS works correctly because they stay in the same client state.

## Root Cause
- **Debug location state** (`debugLocationEnabled`, `debugLocation`) is stored in Zustand `uiStore` (client-side, ephemeral only)
- **No persistence mechanism** exists (no localStorage, sessionStorage, or backend sync)
- When guest joins, they get a **fresh uiStore** with `debugLocationEnabled=false`
- **SignalR GameState** has no debug location field, so it can't sync this state
- No automatic restoration on phase transition

## Critical Files

### Files Requiring Changes:
1. **frontend/landgrab-ui/src/App.tsx** (479 lines)
   - Lines 54-61: Debug state management
   - Lines 148-157: Debug location logic
   - Lines 265-299: `applyDebugLocation()`, `disableDebugLocation()`, `stepDebugLocationByHex()`

2. **frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts** (153 lines)
   - Lines 70-80: `onGameStarted()` - **MISSING**: Restore debug state
   - Lines 52-69: `onPlayerJoined()` - Guest joins handler
   - Lines 81-96: `onStateUpdated()` - Periodic sync

### Files for Context (Examined):
3. **frontend/landgrab-ui/src/stores/uiStore.ts** (61 lines)
   - Lines 27-28: `debugLocationEnabled`, `debugLocation` fields
   - Lines 36-37, 56-57: Setters with no persistence

4. **frontend/landgrab-ui/src/components/lobby/LocationStep.tsx** (120 lines)
   - Lines 33-45: Location setter (used by guest wizard)

## State Transitions Involved

| Transition | File | Function | Issue |
|-----------|------|----------|-------|
| Guest enables GPS | App.tsx | applyDebugLocation (265) | Doesn't persist |
| Guest joins room | useSignalRHandlers.ts | onPlayerJoined (52) | Doesn't restore |
| Game starts (Lobby→Playing) | useSignalRHandlers.ts | onGameStarted (70) | **MISSING**: Restore logic |
| State update during Playing | useSignalRHandlers.ts | onStateUpdated (81) | Preserves (correct) |

## Why Host Works, Guest Doesn't

**Host Scenario:**
1. Creates room → uiStore initialized
2. Enables debug GPS → `debugLocationEnabled=true` in memory
3. Game starts → same uiStore, state preserved ✓

**Guest Scenario:**
1. Loads page → uiStore initialized with `debugLocationEnabled=false`
2. Joins room → receives GameState via SignalR (no debug info)
3. Enables debug GPS → `debugLocationEnabled=true` in THEIR client only
4. Game starts → **Missing restoration code** → state lost ✗
   - Guest's uiStore still has `debugLocationEnabled=false`
   - No sync mechanism to restore from storage

## Recommended Fix: Option 2 (Session-Scoped Persistence)

### Implementation Plan

**1. Modify `App.tsx` - `applyDebugLocation()` [Line 265]:**
```typescript
const applyDebugLocation = useCallback((lat: number, lng: number) => {
  setDebugLocation({ lat, lng });
  setDebugLocationEnabled(true);
  setError('');
  // ADDED: Persist to sessionStorage
  const roomCode = gameState?.roomCode;
  if (roomCode) {
    sessionStorage.setItem(
      `lg-debug-location-${roomCode}`,
      JSON.stringify({ enabled: true, lat, lng })
    );
  }
}, [setDebugLocation, setDebugLocationEnabled, setError, gameState?.roomCode]);
```

**2. Modify `App.tsx` - `disableDebugLocation()` [Line 271]:**
```typescript
const disableDebugLocation = useCallback(() => {
  setDebugLocationEnabled(false);
  setDebugLocation(null);
  setError('');
  // ADDED: Clear sessionStorage
  const roomCode = gameState?.roomCode;
  if (roomCode) {
    sessionStorage.removeItem(`lg-debug-location-${roomCode}`);
  }
}, [setDebugLocationEnabled, setDebugLocation, setError, gameState?.roomCode]);
```

**3. Modify `useSignalRHandlers.ts` - `onGameStarted()` [Line 70]:**
```typescript
onGameStarted: (state) => {
  const normalizedState = normalizeGameState(state, gameState);
  resolveResumeFromState(normalizedState);
  if (normalizedState.roomCode) {
    saveSession(normalizedState.roomCode);
    
    // ADDED: Restore debug location from session
    const saved = sessionStorage.getItem(
      `lg-debug-location-${normalizedState.roomCode}`
    );
    if (saved) {
      try {
        const { enabled, lat, lng } = JSON.parse(saved);
        if (enabled && lat !== undefined && lng !== undefined) {
          useUiStore.getState().setDebugLocation({ lat, lng });
          useUiStore.getState().setDebugLocationEnabled(true);
        }
      } catch (e) {
        // Silently ignore parse errors
      }
    }
  }
  useGameStore.getState().setGameState(normalizedState);
  useGameplayStore.getState().setPickupPrompt(null);
  useUiStore.getState().setView('game');
  useUiStore.getState().clearError();
},
```

### Why This Option?

| Aspect | Option 1 (localStorage) | Option 2 (sessionStorage) | Option 3 (Backend) |
|--------|------------------------|--------------------------|-------------------|
| Backend changes | No | No | **Yes** |
| Files affected | 1 | 2 | 5+ |
| Cross-room leak | **Yes** | No | No |
| Implementation time | 30 min | 1-2 hrs | 4-6 hrs |
| Persistence across reload | Yes | Per-room | Yes |
| Complexity | Low | Medium | High |
| Recommended | ❌ | ✅ **BEST** | ✅ Future |

## Testing Scenario

**E2E Test: `guest-debug-gps-persists.spec.ts`**
```
1. Host creates room → location step
2. Host enables debug GPS → set to (40.7128, -74.0060) NYC
3. Guest joins room (different browser)
4. Guest enables debug GPS → set to (51.5074, -0.1278) London
5. Host starts game → transition to Playing
6. VERIFY: Host still at NYC coords, Guest still at London coords
7. Move host north → verify host location updates
8. Move guest east → verify guest location updates
```

Expected result: Both players maintain their debug GPS locations through the phase transition.

## Blocking Factors / Dependencies

⚠️ Currently **BLOCKED** pending:
- [ ] Decision on persistence strategy (Option 1/2/3)
- [ ] Agreement on scope (client-only vs backend-driven)
- [ ] E2E test implementation for multi-client scenario

## How to Mark Complete

### Current Status:
```bash
cd /Users/leonvandebroek/Projects/Github/Landgrab
sqlite3 .todos.db "SELECT * FROM todos WHERE id = 'fix-bug3-gps';"
# Output: fix-bug3-gps|blocked
```

### When Starting Implementation:
```bash
sqlite3 .todos.db "UPDATE todos SET status = 'in-progress' WHERE id = 'fix-bug3-gps';"
```

### When Complete and Tested:
```bash
sqlite3 .todos.db "UPDATE todos SET status = 'done' WHERE id = 'fix-bug3-gps';"
```

### Verify Completion:
```bash
sqlite3 .todos.db "SELECT id, status FROM todos WHERE id = 'fix-bug3-gps';"
# Expected output: fix-bug3-gps|done
```

## Summary

| Item | Value |
|------|-------|
| **Root Cause** | Missing persistence layer for client-side debug state |
| **Affected Players** | Guest players who enable debug GPS in lobby |
| **Affected Phase** | Lobby → Playing transition |
| **Files to Change** | 2 (App.tsx + useSignalRHandlers.ts) |
| **Code Lines to Add** | ~25 lines |
| **Est. Dev Time** | 1-2 hours |
| **Est. Test Time** | 30 minutes |
| **Complexity** | Medium |
| **Risk Level** | Low (isolated feature, session-scoped) |

