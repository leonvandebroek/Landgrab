# Frontend Architecture Analysis

_Authored by: Vermeer · Date: 2026-07-15_

---

## Executive Summary

The Landgrab frontend is a mature, well-structured React 19 + Zustand + SignalR application whose core patterns (eventsRef, sub-hook composition, grid normalisation) are sound. The most pressing structural concerns are `App.tsx` doing too much orchestration (721 lines, 26+ store reads), `PlayingHud.tsx` acting as a 1018-line kitchen-sink, and the `SignalRInvoke`/`LocationPoint` types being duplicated across four files each. The `useMemo` wrapping in `useSignalRHandlers.ts` with `gameState` as a dependency is a subtle performance drain. Twelve out of fifteen pending squad decisions touch the frontend in some way, making this a live, high-velocity codebase where architectural debt compounds quickly.

---

## 1. Component Architecture & Separation of Concerns

### Current State

| Component | Lines | Responsibility |
|---|---|---|
| `App.tsx` | 721 | Auth, hook wiring, store reads, JSX routing |
| `PlayingHud.tsx` | 1018 | Tile info, ability cards, help overlay, minimap, info ledge, player panel, modals |
| `GameMap.tsx` | 1108 | Leaflet canvas layer, keyboard controls, location sync |
| `GameView.tsx` | 283 | Thin Playing-phase wrapper |
| `LobbyView.tsx` | 172 | Thin Lobby-phase wrapper |
| `GameLobby.tsx` | 305 | Lobby inner coordinator |

`App.tsx` reads from **five** stores (gameStore × 8, gameplayStore × 3, uiStore × 9, playerPreferences × 2, infoLedgeStore implicitly via hooks), initialises nine hooks, computes three derived values (`myPlayer`, `isHostOnLocationSetupStep`, `shouldEnableGeolocation`), and renders conditional JSX. Prop drilling reaches four levels deep from `App → GameView → PlayingHud → ability cards`.

`GameView.tsx` has a `GameViewActions` interface with **62 members** that is essentially a mirror of `UseGameActionsResult` from `useGameActions.shared.ts`.

`PlayingHud.tsx` props interface has **74 members**, most of which are optional callbacks.

### Strengths

- Clear phase-based split: `AuthPage`, `LobbyView`, `GameView`, `GameOver` — each phase has one entry point.
- `GameView` and `LobbyView` correctly accept action props via named interfaces, not via hook calls.
- Lazy loading of `GameMap`, `PlayingHud`, and `GameLobby` is correctly configured in `GameView.tsx`.
- `ErrorBoundary.tsx` wraps the application with proper error reporting.

### Recommendations

1. **Extract `AppOrchestrator` hook from `App.tsx`** — move all hook wiring, store subscription, and derived state into `useAppOrchestrator()` (or similar). `App.tsx` becomes a thin renderer that calls one hook and switches on `view`. Estimated effort: **Med**.

2. **Split `PlayingHud.tsx` into sub-panels** — `AbilityPanelArea`, `HudInfoArea`, `ModalArea`. `PlayingHud` becomes a layout coordinator. The 74-member props interface will naturally shrink. Estimated effort: **Med**.

3. **Eliminate `GameViewActions`** by passing `useGameActions` result directly to `GameView` — or keep the interface but derive it from `UseGameActionsResult` with `type GameViewActions = Pick<UseGameActionsResult, ...>`. Eliminates duplicate 62-member interface. Estimated effort: **Low**.

---

## 2. State Management (Zustand)

### Current State

Seven stores in `stores/`:

| Store | Lines | Scope |
|---|---|---|
| `gameStore.ts` | 188 | Server game state, session persistence, room list |
| `gameplayStore.ts` | 280 | In-game UI state machine (prompts, ability mode, dialog queue) |
| `uiStore.ts` | 86 | View routing, debug tools, map camera, UI metrics |
| `infoLedgeStore.ts` | 214 | Toast queue with priority sorting and auto-dismiss timers |
| `notificationStore.ts` | 78 | Push notifications (host message, troop transfer, field battle) |
| `effectsStore.ts` | 35 | Contested edges, troop movement animations |
| `playerLayerStore.ts` | 55 | Player positions for Leaflet layer |

### Strengths

- `gameplayStore`'s `setCombatResult`/`setNeutralClaimResult` implement a modal-stacking queue with a discriminated union (`QueuedOutcomeDialog`) — clean implementation of Decision #13.
- `gameStore.normalizeGrid` preserves object identity for unchanged hex cells — solid performance optimisation that prevents needless Leaflet re-renders.
- `playerLayerStore.setPlayers` normalises player arrays (`hasPlayerChanged`) to avoid re-renders from unchanged player positions.
- `infoLedgeStore` manages its own timer lifecycle (`ledgeTimers` Map) and properly handles eviction of oldest-transient items.

### Issues

1. **Module-level singleton timers**: `mapFeedbackTimer` in `gameplayStore.ts` (line 88) and `notificationTimers` in `notificationStore.ts` are module-level closures. In HMR (Vite dev) these persist across hot reloads, causing phantom timer leaks. They should be store-internal state or at minimum wrapped in a factory.

2. **`infoLedgeStore` missing from `stores/index.ts`**: All other stores export from `stores/index.ts` but `infoLedgeStore` must be imported directly from `stores/infoLedgeStore.ts`. Inconsistent import pattern across the codebase.

3. **`uiStore` mixes frequencies**: `debugLocation` and `mainMapBounds` change on every location update; `view` and `error` are low-frequency. Any component subscribing to `view` also re-runs on location updates. Consider splitting `uiStore` into `routingStore` (view, error) and keeping high-frequency map data in `uiStore`.

4. **Cross-store imperative coupling**: `useSignalRHandlers.ts` calls `useGameStore.getState()`, `useGameplayStore.getState()`, `useUiStore.getState()`, `useInfoLedgeStore.getState()`, `useNotificationStore.getState()` — 5 direct store accesses inside event handlers. This is deliberately imperative to avoid stale closures (correct pattern), but it means stores are tightly coupled to this handler. A cross-store event bus or domain actions pattern would make dependencies explicit.

### Recommendations

4. **Move timer closures inside store factory functions** — use module-scoped Maps keyed by a store-instance symbol to prevent HMR leaks. Estimated effort: **Low**.

5. **Add `infoLedgeStore` to `stores/index.ts`** — one-line fix. Estimated effort: **Low**.

---

## 3. Hooks Architecture

### Current State

The hook hierarchy is:

```
App.tsx
├── useAuth
├── useAutoResume (303 lines) — session recovery state machine
├── useSignalR (240 lines) — connection lifecycle + eventsRef
├── useSignalRHandlers (605 lines) — returns GameEvents via useMemo
├── useGeolocation (99 lines)
├── useDeviceOrientation (31 lines)
├── usePlayerPreferences (61 lines)
├── useSound (365 lines)
└── useGameActions (80 lines) — facade
    ├── useGameActionsLobby (406 lines)
    ├── useGameActionsAbilities (312 lines)
    ├── useGameActionsHost (58 lines)
    └── useGameActionsGameplay (717 lines)
```

### Strengths

- `useGameActions.ts` is a pure composition facade — 80 lines of structured delegation, no logic.
- `useSignalR` correctly implements the `eventsRef` stale-closure pattern via `useLayoutEffect(() => { eventsRef.current = events; })`.
- `useGameActionsGameplay` uses `useInfoLedgeStore.getState()` inside callbacks for stale-closure-safe store reads (aligned with Decision #19).
- `useAutoResume` clearly documents its call-order contract in JSDoc.
- `useMapOrchestrator` cleanly separates map layer dispatch from game state management.

### Issues

1. **`useSignalRHandlers` wraps everything in `useMemo` with `gameState` as a dependency** (line 210). The entire `GameEvents` object is rebuilt on every `StateUpdated` event. While `useSignalR`'s `eventsRef` absorbs the cost at registration time, it still allocates 28 arrow functions per state change. The `gameState` capture exists because `shouldClearPickupPrompt` etc. use it — but these helpers could read from `useGameplayStore.getState()` instead, removing the `gameState` dep and making `GameEvents` truly stable.

2. **`useGameActionsGameplay.ts` at 717 lines violates single responsibility** — it owns: (a) location broadcasting throttle loop with heartbeat, (b) tile click dispatch, (c) pickup/reinforce/attack/claim confirmation flows, (d) combat preview management. Each of these is a candidate for its own sub-hook.

3. **`useGameActionsAbilities.ts` is highly repetitive** — 12+ handlers share the identical pattern: `if (!invoke) return false; try { await invoke(...); return true; } catch { setError(String(error)); return false; }`. A generic `invokeAbility<T>` wrapper would eliminate this repetition.

4. **`useSound.ts` at 365 lines likely initialises audio objects** — should be verified that it doesn't block the main render thread.

### Recommendations

6. **Remove `gameState` from `useSignalRHandlers` memo deps** — replace `gameState` captures with `useGameplayStore.getState()` / `useGameStore.getState()` reads inside handlers where needed. Stabilises `GameEvents` permanently. Estimated effort: **Med**.

7. **Extract `useLocationBroadcast` from `useGameActionsGameplay`** — move the throttle loop, heartbeat, `sendPendingLocation`, and `UpdatePlayerLocation` invoke into its own hook. Reduces `useGameActionsGameplay` from 717 to ~450 lines. Estimated effort: **Med**.

8. **Add `invokeAbility<T>` helper to `useGameActionsAbilities`** — eliminates the 12× copy-paste pattern. Estimated effort: **Low**.

---

## 4. DRY Violations

### Current State

**Type duplication:**

| Type | Defined in |
|---|---|
| `SignalRInvoke` | `App.tsx` (line 41), `useGameActions.shared.ts` (exported), `useSignalRHandlers.ts`, `useAutoResume.ts` |
| `LocationPoint` | `App.tsx` (line 43), `useGameActions.shared.ts` (exported), `GameView.tsx` |

`useGameActions.shared.ts` already exports both of these. The three shadow definitions add confusion and risk divergence.

**Logic duplication in `useSignalRHandlers.ts`:**

`shouldClearPickupPrompt`, `shouldClearAttackPrompt`, `shouldClearCombatPreview`, `shouldClearReinforcePrompt` share identical structure: null-check prompt → get prev/next hex → check changed conditions. Could be collapsed into a generic `shouldClearHexPrompt(prompt, prev, next, testFn)` with the condition as a parameter.

**Ability handler boilerplate** (see §3 above).

**`isMissingRejoinMethodFailure` and `isMissingHubMethodFailure` in `gameHelpers.ts`** share identical string checks — one delegates to the other or they should be unified.

### Recommendations

9. **Remove shadow `SignalRInvoke` and `LocationPoint` definitions** in `App.tsx`, `useSignalRHandlers.ts`, `useAutoResume.ts`, `GameView.tsx` — import from `useGameActions.shared.ts` or a shared `types/signalr.ts`. Estimated effort: **Low**.

10. **Merge `isMissingRejoinMethodFailure` / `isMissingHubMethodFailure`** — both do the same string checks. One is a superset; unify to single function. Estimated effort: **Low**.

---

## 5. SOLID Principles

### Single Responsibility

- **`App.tsx`** — orchestration + rendering in one file. See §1.
- **`PlayingHud.tsx`** — 74-prop component with 1018 lines is the worst offender. It renders ability cards, modals, minimap, help overlay, info ledge, player HUD, tile info, rules page simultaneously.
- **`useGameActionsGameplay.ts`** — location broadcasting + tile interaction + combat flows (see §3).

### Open/Closed

Adding a new ability currently requires changes to **seven** files:
1. `types/abilities.ts` — add to `AbilityKey` union
2. `useGameActionsAbilities.ts` — add handler
3. `useGameActions.shared.ts` — add to `UseGameActionsResult` interface
4. `useGameActions.ts` — add to delegation map
5. `PlayingHud.tsx` — add to props and render
6. `GameView.tsx` — add to `GameViewActions` and pass-through
7. `AbilityBar.tsx` / ability cards — add display

An ability registry pattern (e.g., a `AbilityDefinition[]` array that maps `AbilityKey` → handler factory + card component) would make most of these changes additive rather than modifications.

### Interface Segregation

- `PlayingHud.tsx` props interface: 74 members, most optional — callers must pass many `undefined` props.
- `UseGameActionsOptions`: 13 members but sub-hooks correctly use `Pick<>` to narrow — good practice.
- `GameViewActions`: 62 members — partially redundant with `UseGameActionsResult`.

### Dependency Inversion

- Good: all sub-hooks depend on `UseGameActionsOptions` interfaces, not concrete App state.
- `useSignalRHandlers.ts` directly calls `useGameStore`, `useGameplayStore`, `useUiStore`, `useInfoLedgeStore`, `useNotificationStore` store singletons — not injected, not testable in isolation.

---

## 6. TypeScript Strictness & Type Safety

### Current State

| Issue | Location | Count |
|---|---|---|
| `as never` casts for i18n keys | `useSignalRHandlers.ts` lines 531, 552, 562, 570–571, 579, 587–588 | 8 |
| `unknown` type for global map events | `useSignalR.ts` `onGlobalHexUpdated`, `onGlobalMapLoaded` | 2 |
| Very large flat interface (50+ props) | `Player` in `types/game.ts` | 1 |

The 8× `as never` casts all correspond to i18n keys that exist in `en.ts`/`nl.ts` but are not registered in i18next's TypeScript resource type. This is an i18n type configuration gap, not a genuine type hole.

`GlobalHex` type exists in `types/game.ts` but the two global-map SignalR events bypass it entirely with `unknown`. These events are used in the Map Editor path.

The `Player` interface has 50+ properties mixing all role-specific fields flat. There is no discriminated union for Commander-only fields vs Scout-only vs Engineer-only. This means TypeScript cannot prevent accessing `commandoRaidCooldownUntil` on a Scout player.

### Strengths

- `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` — build is clean.
- `QueuedOutcomeDialog` in `gameplayStore.ts` is a well-designed discriminated union.
- `GamePhase`, `PlayerRole`, `AbilityKey` are all string union types (not enums) — correct for JSON interop.
- `HexCell.visibilityTier` uses a string union `'Visible' | 'Remembered' | 'Hidden'`.

### Recommendations

11. **Register i18n resource keys in the TypeScript i18next module augmentation** — eliminates all 8× `as never` casts and makes i18n key typos a compile error. See [i18next TypeScript guide](https://www.i18next.com/overview/typescript). Estimated effort: **Med**.

12. **Type `onGlobalHexUpdated` / `onGlobalMapLoaded` with `GlobalHex`** — the type already exists. Estimated effort: **Low**.

13. **Consider role-specific Player sub-types** — `CommanderPlayer`, `ScoutPlayer`, `EngineerPlayer` as discriminated union on `role` — at minimum document which fields belong to which role. Estimated effort: **High** (pervasive type change).

---

## 7. Performance

### Current State

- `normalizeGrid` in `gameStore.ts` preserves object identity for unchanged hex cells — prevents Leaflet tile re-renders.
- `playerLayerStore.setPlayers` has its own `hasPlayerChanged` normalisation.
- Vendor code splitting in `vite.config.ts`: react, signalr, leaflet, i18n, zustand all separate chunks.
- Lazy loading for `GameMap`, `PlayingHud`, `GameLobby` reduces initial bundle.
- `LOCATION_BROADCAST_THROTTLE_MS = 750` and `MIN_MOVEMENT_METRES = 5` prevent excessive `UpdatePlayerLocation` calls.
- `useHexGeometries` wraps geometry computation in `useMemo` correctly.

### Issues

1. **`useSignalRHandlers` recreates 28 arrow functions on every `StateUpdated`** — see §3 issue #1. Every `StateUpdated` triggers `useMemo` → new `GameEvents` → `useLayoutEffect` sync. In a 6-player game with frequent state updates, this compounds.

2. **`mapFeedbackTimer` is a module-level singleton** (line 88 in `gameplayStore.ts`) — survives HMR, cannot be GC'd. Low-frequency concern in production but causes confusing behaviour in dev.

3. **`PlayingHud.tsx` is not wrapped in `React.memo`** — at 1018 lines this component will re-render on any parent change. `App.tsx` changes (e.g., location updates) propagate down. Most of `PlayingHud`'s state is in Zustand stores (read directly), so this may not be a hot path in practice, but it is a risk.

4. **`useSound.ts` at 365 lines** — if it holds `HTMLAudioElement` instances in refs, these are fine; if it instantiates them on each call, there may be audio context exhaustion.

### Recommendations

14. **Memoize `PlayingHud` with `React.memo`** and ensure its props are stable (action callbacks should already be `useCallback`-wrapped in `App.tsx`). Estimated effort: **Low**.

---

## 8. SignalR Integration Patterns

### Current State

`useSignalR.ts` correctly implements the gold-standard stale-closure protection:
```ts
useLayoutEffect(() => { eventsRef.current = events; });
// All listeners: conn.on('X', (...args) => eventsRef.current.onX?.(...args))
```

Manual reconnect loop with 40 attempts × 15s (600s max back-off) as a fallback to SignalR's built-in auto-reconnect with the `AUTO_RECONNECT_DELAYS` schedule.

`onReconnected` uses `getInvoke()` factory to avoid stale invoke reference — correct.

### Issues

1. **`useSignalRHandlers` `useMemo` with `gameState` dep** — as analysed in §3, the `gameState` dependency makes `GameEvents` unstable. Every state update → new events object → `useLayoutEffect` fires → `eventsRef.current` is updated. This is safe (no lost events) but wastes allocations. See Recommendation #6.

2. **`onGlobalHexUpdated` / `onGlobalMapLoaded` are typed `unknown`** — the Map Editor path casts internally; better to type at the boundary. See Recommendation #12.

3. **`onReconnected` in `useSignalRHandlers` imperatively reads `savedSessionRef.current`** — this is correct (ref read is always fresh) but the `getInvoke()` indirection layer adds complexity; could accept `invoke` as a dep since `useSignalR`'s `invoke` callback is already stable (`useCallback` with no deps).

### Strengths

- `eventsRef` pattern applied consistently throughout `useSignalR`.
- Connection teardown in `useEffect` cleanup properly disposes timers and sets `disposed = true`.
- `isExpectedStartAbort` correctly filters negotiation aborts from error paths.

---

## 9. i18n Completeness

### Current State

`en.ts` is 1468 lines, `nl.ts` mirrors it. Browser-language auto-detection with English fallback is clean. `gameLogFormat.ts` was extended in Decision #20 to cover 28 structured event types.

### Issues

1. **8× `as never` casts** in `useSignalRHandlers.ts` indicate i18n TypeScript module augmentation is not configured. The keys exist in `en.ts`/`nl.ts` but are not type-registered. See Recommendation #11.

2. **Pending Decision #11 (server-generated event log messages)** — `HostAction`, `RandomEvent`, `HostMessage` event types intentionally fall through to raw server messages in `gameLogFormat.ts`. These are English server strings in Dutch UI. The decision is tracked but not yet actionable without backend contract changes.

3. **`game.toast.drainTick` key** — cast with `as never` suggests it may be missing from the type registration; confirm it exists in both `en.ts` and `nl.ts` (it does appear to exist based on `en.ts` scan but type augmentation isn't set up).

### Strengths

- All user-facing UI strings are in `en.ts`/`nl.ts`.
- Wizard steps, error messages, ability descriptions, lobby flow — all appear covered.
- `gameLogFormat.ts` with 28 localised event cases is comprehensive.

---

## 10. Test Coverage Gap

### Current Coverage

- **E2E (Playwright)**: `debug-gps.gameplay.spec.ts`, `scalable.gameplay.spec.ts`, `multiplayer.gameplay.spec.ts`, `localization.spec.ts` — integration-level, requires running server.
- **Unit tests**: None (no Vitest/Jest in devDependencies).

### Highest-Value Unit Test Targets (ranked)

| Rank | Target | File | Why |
|---|---|---|---|
| 1 | `normalizeGrid` | `gameStore.ts` | Pure function; correctness directly impacts re-render prevention. Object identity semantics are subtle and easily broken. |
| 2 | `outcomeDialogQueue` state machine | `gameplayStore.ts` | Discriminated union queue with promotion logic; 6 code paths in setCombatResult/setNeutralClaimResult. Critical UX correctness. |
| 3 | `enforceMaxItems` | `infoLedgeStore.ts` | Pure function with transient/persistent eviction logic; edge cases around MAX_ITEMS boundary and persistent item preservation. |
| 4 | `normalizeGameState` | `utils/gameHelpers.ts` | Pure function; default dynamics injection, grid normalisation, eventLog preservation. Called on every SignalR state event. |
| 5 | `resolveActionCoordinates` | `useGameActions.shared.ts` | Pure function; host-bypass vs GPS coordinate resolution. Determines what coordinate is sent with every game action. |
| 6 | `localizeLobbyError` | `utils/gameHelpers.ts` | Pure string matching; coverage would catch regressions from server error message changes. |
| 7 | `shouldClearPickupPrompt` et al. | `useSignalRHandlers.ts` | 4 pure functions; easy to unit-test, difficult to cover via E2E. Guards against stale prompt UX bugs. |
| 8 | `hasHexChanged` / `hasPlayerChanged` | `utils/gridDiff.ts`, `playerLayerStore.ts` | Object identity diffing; correctness matters for performance optimisations. |
| 9 | `useGeolocation` throttling | `hooks/useGeolocation.ts` | Throttle logic (MIN_UPDATE_INTERVAL_MS, MIN_DISTANCE_METRES) can be tested with fake geolocation events. |
| 10 | `parseHexKey` delimiter handling | `hooks/useHexGeometries.ts` | Dual-delimiter support (`,` and `:`) is a subtle behaviour gap — unit test would document the contract. |

Setting up Vitest (`npm i -D vitest @testing-library/react @testing-library/hooks jsdom`) would provide the fastest path to covering items 1–8 as pure-function unit tests.

---

## Priority Improvement List

| Rank | Improvement | File(s) | Effort |
|---|---|---|---|
| 1 | Remove `gameState` dep from `useSignalRHandlers` `useMemo` — stabilise `GameEvents` | `useSignalRHandlers.ts` | Low |
| 2 | Add `infoLedgeStore` to `stores/index.ts` | `stores/index.ts` | Low |
| 3 | Remove shadow `SignalRInvoke` + `LocationPoint` types (4 files) | `App.tsx`, `useSignalRHandlers.ts`, `useAutoResume.ts`, `GameView.tsx` | Low |
| 4 | Register i18n resource types → eliminate 8× `as never` casts | `i18n/` + `src/env.d.ts` | Med |
| 5 | Extract `useLocationBroadcast` from `useGameActionsGameplay` | `hooks/useGameActionsGameplay.ts` | Med |
| 6 | Add `invokeAbility<T>` helper in `useGameActionsAbilities` | `hooks/useGameActionsAbilities.ts` | Low |
| 7 | Memoize `PlayingHud` with `React.memo` | `components/game/PlayingHud.tsx` | Low |
| 8 | Move module-level timers inside store factory (HMR safety) | `gameplayStore.ts`, `notificationStore.ts` | Low |
| 9 | Type `onGlobalHexUpdated`/`onGlobalMapLoaded` with `GlobalHex` | `hooks/useSignalR.ts` | Low |
| 10 | Add Vitest + unit tests for `normalizeGrid`, `outcomeDialogQueue`, `enforceMaxItems` | `stores/`, `utils/` | Med |
