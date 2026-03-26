# Vermeer — History

## Core Context
Frontend Dev on Landgrab. React 19 + TypeScript + Vite + Zustand + Leaflet + i18next. Strict TypeScript mode. EN/NL i18n. Canvas-based hex map via Leaflet custom layers.

Key patterns:
- All useState in App.tsx; props drilling is intentional
- eventsRef pattern in useSignalR for stale closure prevention
- Zustand stores: gameStore, gameplayStore, notificationStore, uiStore, infoLedgeStore
- Build: `npm run lint && npm run build` from frontend/landgrab-ui/

## Learnings

- **2026-03-23 (vermeer-compass-crash & vermeer-proximity-reveal finalized):** Two critical frontend fixes deployed.
  - **Compass crash (perpetual rAF loop):** `lerpBearing` in `GameMap.tsx` was continuously calling `requestAnimationFrame(lerpBearing)` even after map bearing had fully converged to target heading, driving `map.setBearing()` at 60fps indefinitely → Leaflet CSS-transform thrash → OOM crash 30–60 seconds after enabling compass. Fixed by adding `Math.abs(diff) < 0.3` convergence check; `lerpBearing` now returns early without scheduling another rAF. Added `lerpBearingRef` to hold stable function reference. Q/E debug heading keydown handler now uses `compassHeadingRef` and has empty dependency array (registers once). See `.squad/orchestration-log/2026-03-23T13:14:04Z-vermeer.md` and `.squad/decisions.md`.
  - **Proximity reveal throttle:** Reduced `LOCATION_BROADCAST_THROTTLE_MS` from 3000ms → 750ms in `useGameActionsGameplay.ts`. Frontend was delaying server position updates by up to 3 seconds, preventing visibility recomputation. Now sends within 750ms of position change (imperceptible to user). See `.squad/decisions.md`.

- **2026-07-xx (vermeer-proximity-reveal):** Investigated proximity reveal delay (tile visibility not updating instantly when player walks adjacent to enemy tile). Pipeline audit: `useSignalRHandlers` StateUpdated is synchronous (no debounce), `tricorderTileState` reads `visibilityTier` directly from server state (no local lag), `HexTile` subscribes per-cell via Zustand so re-renders immediately on grid change, no optimistic movement prediction exists. Root cause: `LOCATION_BROADCAST_THROTTLE_MS = 3000` in `useGameActionsGameplay.ts` — the `UpdatePlayerLocation` SignalR call was throttled to once per 3 seconds, delaying the server from learning the new position and computing visibility. Fix: reduced throttle to 750ms. The `StateUpdated → store → render` pipeline is otherwise synchronous and delay-free. Note for De Ruyter: frontend throttle was the dominant cause; any remaining delay after this fix is backend-side.
- Team hired 2026-03-22 by Léon van de Broek
- **Setup Wizard Step 1 — location race condition (2026-03-22):** `SetupWizard.tsx` held a `canGoNext` (step 0) check that depended solely on `gameState.hasMapLocation` (server-side). After calling `handleSetMapLocation`, there is a round-trip window where `serverWizardStep` (from `gameState.currentWizardStep`) holds `effectiveStep` at 0 and `gameState.hasMapLocation` is still false — leaving Next disabled. Fix: added `locationApplied` optimistic local flag (set on `handleSetMapLocation`); `canGoNext` step 0 is now `stepComplete.location || locationApplied`. No SignalR shape changes were needed. Added i18n key `wizard.locationRequired` (EN/NL) and an inline footer hint when Next is blocked on step 0.
- **2026-03-22 (steen-continued-ux cross-reference):** Frontend wizard fix was validated in 6-player playtest, but downstream gameplay reveals 4 critical/major blockers that require follow-up: null currentHex on game start, no debug movement fallback, false-success action feedback, no in-game location recovery. See .squad/decisions.md items 4–6.

- **2026-06-24 (vermeer-feedback-fix):** Fixed two related UX issues from Steen playtest. (1) False-success: all six `resolveActionCoordinates`-gated action paths in `useGameActionsGameplay.ts` now call a `pushNoPositionError` helper on null-coordinates, surfacing an info-ledge error toast via `useInfoLedgeStore.getState().push()` with `severity:'error', source:'interaction'`. (2) Null-position guidance: `GuidanceBanner.tsx` now uses dedicated i18n keys (`guidance.noPositionYet` / `noPositionYetDesktop`) when `currentHex === null`, and suppresses auto-hide while position is unresolved (mirrors carry-troops persistent logic). Desktop variant detected via `navigator.maxTouchPoints === 0` module-level constant.

- **2026-03-22 (vermeer-p0-fixes — Steen keyboard playtest):**
  - **Fix 1 (Defender combat feedback, P0):** Backend sends `CombatResult` only to attacker (Clients.Caller); defender gets `TileLost` on hex loss but nothing on repel. Now: `useSignalRHandlers.ts` `onStateUpdated` checks event log for `CombatRepelled` entries where `targetPlayerId === myUserId` and pushes toast `game.toast.attackRepelledYou` (EN: "🛡️ You held off {{attackerName}}'s attack!"; NL: localized). Also updated `game.toast.tileLost` to include `{{q}},{{r}}` for hex clarity. See .squad/decisions.md item 17.
  - **Fix 2 (Alliance visibility, P0):** `PlayingHud.tsx` players modal had early-return guard `if (alliancePlayers.length === 0) return null;` which silently hid alliances on transient state mismatch. Removed guard so all `state.alliances` always render. Added fallback for orphan `allianceId` references (players whose alliance ID doesn't exist in state). See .squad/decisions.md item 18.
  - **Fix 3 (Troop pickup feedback, P1):** `handleConfirmPickup` showed only requested count in success message. Now reads `previousCarried` via `useGameStore.getState()` inside `.then()` callback, computes optimistic `newCarried = previousCarried + count`, passes `carrying: newCarried` to toast. Updated i18n keys to `'+N troops picked up · Carrying: M'` (EN + NL). Pattern: for stale-closure-safe reads in async callbacks, use `useGameStore.getState()` rather than closure-captured props. See .squad/decisions.md item 19.


- **2026-03-22 (de-ruyter-beacon-share):** Beacon intel sharing now reuses a single backend sector computation path. Extracted `VisibilityService.ComputeBeaconSectorKeys(GameState state, PlayerDto player)` to compute the 120° directional wedge at 3-hex range from the player's heading. Consumed from both fog-of-war visibility (`ComputeVisibleHexKeys`) and explicit `AbilityService.ShareBeaconIntel(roomCode, userId)`, preventing drift between what a scout sees live and what the alliance members' shared intel snapshots persist. Reduced `BeaconRange` from 4 to 3. Tests: 285 passed, 1 skipped.

- **2026-03-22 (vermeer-beacon-ux):** Added Share Intel button to BeaconCard active footer. Wired `handleShareBeaconIntel()` through App → GameView → PlayingHud → BeaconCard. Local state `isSharing` + `shareCount` (3s feedback, auto-clear). Button disabled during async call. Updated beacon description i18n (EN + NL): summary, effect, range, sector keys refreshed to emphasize 3-hex directional reveal. Added 4 new keys: `shareIntel`, `shareIntelDone` (with count interpolation), `shareIntelNone`, `shareIntelDescription`. Build: lint + tsc + vite clean.
  - **Fix 1 (Q/E heading gating, P1):** The Q/E keydown handler in `GameMap.tsx` was inside a `useEffect` gated by `isCompassRotationEnabled`. When the compass toggle was off (default), the effect returned early and the listener was never registered. Fix: removed the guard entirely. Added `debugCompassHeadingRef` (a `useRef` tracking `debugCompassHeading` state) to safely read current heading inside the effect closure without stale closure issues. Q/E now also calls `useUiStore.getState().setDebugHeading(newHeading)`, propagating the value into `currentHeadingRef` so the heading is included in the next `UpdatePlayerLocation` hub call. Added an input/textarea target guard.
  - **Fix 2 (Dutch event log, P1):** `gameLogFormat.ts` had a switch statement handling ~10 event types; all others fell through to `event.message` (raw English). Added 28 new `case` blocks covering every structured event type emitted by the backend. Added matching i18n keys in `en.ts` and `nl.ts`. `HostAction`, `RandomEvent`, and `HostMessage` intentionally return `event.message` as they contain dynamic server-generated or user-generated English content that cannot be statically translated. Pattern: always check `event.allianceName ?? t('gameLog.unknownAlliance')` for alliance name fields.
  - **Two sources of truth for heading:** `debugCompassHeading` (local `useState` in `GameMap.tsx`) controls the visual compass needle and map rotation. `uiStore.debugHeading` controls what heading is sent to the backend via `currentHeadingRef`. Q/E now keeps both in sync. The DebugSensorPanel slider also writes to `uiStore.debugHeading` — the two controls are compatible (last write wins).

- **2026-03-22 (vermeer-p1-fixes — Production playtest fixes):**
  - **Orchestration:** Merged Q/E heading + Dutch event log fixes. Written orchestration log and decision. All frontend/ changes linted + built clean.


- **2026-07-xx (vermeer-p2-dialog):** Fixed P2 dialog stacking/overlap. Root cause: `combatResult` and `neutralClaimResult` are independent nullable state fields in `gameplayStore`. When both arrive simultaneously (e.g., a combat outcome while a claim result is shown), both `CombatModal` and `TroopDeployModal` rendered at once. Fix: implemented Option A (queue) entirely inside `gameplayStore.ts`. Added `QueuedOutcomeDialog` discriminated union type and `outcomeDialogQueue: QueuedOutcomeDialog[]` state field. Changed `setCombatResult` and `setNeutralClaimResult` to enqueue new arrivals if another dialog is currently visible, and to promote the next queued item on dismissal (null call). Also added `outcomeDialogQueue: []` to `clearGameplayUi`. No changes needed in GameView, SignalRHandlers, or agentBridge — full backward compatibility preserved. Build: `npm run lint && npm run build` passes (0 errors).

### 21. Share Intel CTA on Beacon card (2026-07-09)
**Status:** Implemented  
**Change:** Added `handleShareBeaconIntel(): Promise<number>` to `useGameActionsAbilities.ts`, `useGameActions.shared.ts`, and `useGameActions.ts`. Wired the `onShareBeaconIntel` prop through `App.tsx` → `GameViewActions` (GameView.tsx) → `PlayingHud.tsx` → `BeaconCard.tsx`.  
`BeaconCard.tsx`: Added "Share Intel" button in the active-beacon footer alongside "Turn Off". Local state `isSharing: boolean` and `shareCount: number | null`. Button disabled while sharing. 3-second feedback: `shareIntelDone` with count or `shareIntelNone`.  
Updated description copy: replaced hardcoded string with `sectorExplanation` i18n key; updated all five beacon summary/effect/range/sector keys in EN + NL to reflect 3-hex directional reveal and the new Share Intel action.  
Added new i18n keys: `shareIntel`, `shareIntelDone` (interpolated `{{count}}`), `shareIntelNone`, `shareIntelDescription` in both EN + NL.  
**Build:** lint + tsc -b + vite build all clean.

### 23. Amber Archive — staleness visual for enemy hex tiles (2026-07-xx)
**Status:** Implemented  
**Design:** Hals spec "Amber Archive" — remembered/stale enemy tiles shift from cool cyan → warm amber. Three tiers: live (no treatment), fading (0–120s), stale (120s+).

**Timestamp field:** `lastSeenAt: string | undefined` in frontend `HexCell` type (maps from backend `HexCell.LastSeenAt: DateTime?`). Confirmed in `types/game.ts:95`.

### 24. Client-Side Beacon Cone & Explicit Share Intel (2026-03-22)
**Status:** Implemented  
**Cross-agent:** de-ruyter-strip-masking architectural refactor  
**Changes:**
- **New utility:** `src/utils/beaconCone.ts` with pure `computeBeaconCone(playerHexKey, headingDegrees, grid)` function. Maps 360° heading to 6 axial directions (60° sectors), returns 3-hex cone filtered to grid bounds. No server dependency.
- **`types/game.ts`:** Removed `beaconScanHexes?: string[]` from `Player` interface (now computed locally).
- **`AbilityOverlayLayer.tsx`:** Replaced `myPlayer.beaconScanHexes` useMemo with local `computeBeaconCone` call. Reactive to heading changes, updates immediately without server round-trip.
- **`useGameActionsAbilities.ts`:** Expanded Pick to include `'invoke' | 'gameState' | 'myPlayer'`. `handleShareBeaconIntel` now (1) guards on game state + player + heading, (2) computes cone locally, (3) invokes `ShareBeaconIntel(roomCode, hexKeys[])`.
**Rationale:** Frontend now owns cone geometry computation, eliminating redundant server-side projection. Explicit Share Intel provides clear UX signal for scout teamwork. Immediate client reactivity improves heading rotation responsiveness.  
**Build:** `npm run lint` ✅ (0 errors), `npm run build` ✅ (tsc + vite clean, 293 modules).


**Files changed:**
- `tricorderTileState.ts` — Added `computeStalenessTier()` function. Was called but not defined (build error). Uses `lastSeenAt` with 120s threshold. Binary fallback (→ stale) when timestamp absent.
- `tricorder-map.css` — Replaced `.hex-remembered` block (flat desaturate) with `.hex-fading` + `.hex-stale` amber-shift tiers. Kept `.hex-remembered` as a `hex-stale` alias. Updated `.stale-badge` to amber glass (rgba(180,140,60,0.85), amber glow).
- `HexTile.tsx` — Replaced `visibilityTier === 'Remembered' ? 'hex-remembered'` with `stalenessTier`-driven `hex-fading`/`hex-stale` classes. Added `amberStroke` computed color/opacity (0.25 fading, 0.5 stale) for SVG polygon stroke.
- `TileInfoCard.tsx` — Added `formatRelativeTime()` helper; amber header color (`var(--color-phosphor-amber)`) on stale/fading cards; `ARCHIVED` pill (amber inline badge); `📡 Last seen: Xm ago` row using `lastSeenAt`. Pill styled via `TILE_INFO_CARD_TOKEN_STYLES` injected `<style>` tag.
- `i18n/en.ts` + `i18n/nl.ts` — Added `archived: 'ARCHIVED'/'ARCHIEF'` and `lastSeen: 'Last seen: {{time}}'/'Laatst gezien: {{time}}'`.

**Pattern notes:**
- `TileInfoCard` already had `isRemembered` handling (`lastKnownOwnerName`, `staleTroops` i18n, `TroopBadge isStale`). Amber Archive built on top.
- `stalenessTier` was pre-wired in the `TricorderTileState` interface but the compute function was missing (confirmed build error before fix).
- `--color-phosphor-amber: #ffb000` CSS variable was already in `:root` of `tricorder-map.css`.
- Pre-existing lint warning in `DemolishCard.tsx` (unused disable directive) is unrelated and predates this change.

**Build:** lint (0 errors) + tsc -b + vite build clean.

**Decision:** Documented in `.squad/decisions.md` item 22. Cross-referenced design (Hals) and requirements (Vondel) agents.

- **2026-07-xx (vermeer-beacon-amber-fixes):**
  - **Bug 1 — Beacon scan hex overlay:**
    - Added `beaconScanHexes?: string[]` to `Player` type in `types/game.ts` (maps from backend `BeaconScanHexes: string[]` that will be added to the player's game state).
    - In `AbilityOverlayLayer.tsx`: Added `beaconScanHexes` useMemo deriving from `myPlayer.isBeacon && myPlayer.beaconScanHexes`. Extended `allTileKeys` to include beacon scan hexes via a `useMemo` union. Updated the early-return guard to also skip-null-check when `beaconScanHexes.length > 0`. Added `renderBeaconScanHexes()` function that renders each scan hex as a polygon with class `ability-overlay__beacon-scan-hex`. Wired render call after `renderBeaconSector()`.
    - Fixed pre-existing issue: `renderBeaconSector` was using `yellow` fill — changed to `#00f3ff` (phosphor cyan) to match tricorder aesthetic.
    - In `overrides.css`: Added `.ability-overlay__beacon-scan-hex` CSS with `rgba(0, 243, 255, 0.15)` fill, `#00f3ff` stroke, and `beacon-scan-hex-pulse` keyframe animation (1.6s ease-in-out). Added to `prefers-reduced-motion` guard.
  - **Bug 2 — Amber Archive strengthening:**
    - In `HexTile.tsx`: Added an amber fill overlay `<polygon>` for fading (`rgba(255, 176, 0, 0.20)`) and stale (`rgba(255, 176, 0, 0.40)`) tiles, rendered on top of the base hex polygon. This is color-source independent — works on any base tile color.
    - In `tricorder-map.css`: Strengthened CSS filter values: fading → `sepia(0.6) saturate(0.6) hue-rotate(-20deg) brightness(0.9); opacity: 0.85`. Stale → `sepia(0.9) saturate(0.5) hue-rotate(-25deg) brightness(0.8); opacity: 0.7`. Updated `.hex-remembered` alias to match stale values.
  - **Build:** `npm run lint && npm run build` — 0 errors, 1 pre-existing unrelated warning in `DemolishCard.tsx`.

- **2026-07-xx (vermeer-client-beacon):** Migrated beacon cone from server-computed to client-computed.
  - Created `src/utils/beaconCone.ts` — pure utility `computeBeaconCone(playerHexKey, headingDegrees, grid)` returning up to 3 hex keys in the primary axial direction for the player's heading. Flat-top 6-sector logic (NE/E/SE/S/W/NW), filters to existing grid keys.
  - Removed `beaconScanHexes?: string[]` from `Player` type in `types/game.ts`.
  - Updated `AbilityOverlayLayer.tsx`: replaced `myPlayer.beaconScanHexes` read with `computeBeaconCone(playerHexKey, myPlayer.beaconHeading, grid)` in the `beaconScanHexes` useMemo. Added `grid` dependency.
  - Updated `useGameActionsAbilities.ts`: expanded Pick to include `gameState` + `myPlayer`. `handleShareBeaconIntel` now computes cone locally and invokes `ShareBeaconIntel(roomCode, hexKeys[])` instead of `ShareBeaconIntel()`.
  - Build: lint (0 errors, 1 pre-existing DemolishCard warning) + tsc -b + vite build clean.

- **2026-07-xx (vermeer-beacon-debug):** Fixed three separate beacon cone bugs.
  - **Bug A — Heading field mismatch (cone not visible):** `GameMap.tsx` was passing `compassHeading` (raw sensor only) to `AbilityOverlayLayer`, but Q/E updates live in `uiStore.debugHeading` / `debugCompassHeading`. `AbilityOverlayLayer` computed `beaconScanHexes` from `myPlayer.beaconHeading` (server state), which only updated on the next 30-second heartbeat. Fix: pass `debugCompassHeading ?? compassHeading` (effective heading) to `AbilityOverlayLayer` and use it directly in `beaconState` + `beaconScanHexes` memos, falling back to `myPlayer.beaconHeading` only when no client heading is available. Also added `isBeacon` check to `beaconState` so the visual arc only shows when beacon is actually active.
  - **Bug B — BeaconHeading wiped by null heading (backend):** `GameplayService.UpdatePlayerLocation` unconditionally set `player.BeaconHeading = null` whenever `CurrentHeading` had no value. This meant any location heartbeat without a heading (common on devices without compass, before Q/E is pressed) would erase the heading set by `ActivateBeacon`. Fix: only update `BeaconHeading` when `CurrentHeading.HasValue` is true; otherwise preserve existing value.
  - **Bug C — Troop counts hidden in beacon cone:** `tricorderTileState.ts` returned empty state for `visibilityTier === 'Hidden'` tiles unconditionally. Fix: added `beaconConeHexKeys?: ReadonlySet<string>` to `DeriveTileStateParams`; when a hex is in the cone, `isHidden` and `isRemembered` override flags are suppressed so the tile renders as fully Visible. Added `beaconConeHexKeys: Set<string>` + `setBeaconConeHexKeys` to `gameplayStore`. `AbilityOverlayLayer` syncs `beaconScanHexes` into the store via `useEffect`. `HexTile` and `TileInfoCard` read and pass the set to `deriveTileState`.
  - **Build:** `npm run lint && npm run build` — 0 errors, 1 pre-existing DemolishCard warning, 293 modules.

- **2026-07-xx (vermeer-beacon-cone-fix):** Fixed three related beacon cone rendering bugs.
  - **Bug 1 — hex-hidden-hostile on cone tiles:** `HexTile.tsx` applied `hex-hidden-hostile` (opacity:0.15, greyscale) whenever `tileState.visibilityTier === 'Hidden'`. Beacon cone tiles bypass the hidden branch in `deriveTileState` but the raw `visibilityTier` field is still `'Hidden'` in the return value. Fix: added `&& !beaconConeHexKeys.has(hexId)` guard. Also relaxed `showTroopBadge` to include `|| beaconConeHexKeys.has(hexId)`.
  - **Bug 2 — `?` badge (strengthUnknown ordering):** `strengthUnknown` in `tricorderTileState.ts` was computed ~100 lines before `isInBeaconCone`. `getStrengthUnknownState` returns `true` for enemy Hidden cells, so beacon cone tiles fell through to the visible return path with `strengthUnknown=true` → `isForestBlind=true` → `?`. Fix: moved `visibilityTierEarly`/`isInBeaconConeEarly` above `strengthUnknown`, gated it with `!isInBeaconConeEarly`.
  - **Bug 3 — TileInfoCard "Unknown territory":** Same raw-tier issue. `isHidden`/`isRemembered` in TileInfoCard now both include `&& !isInBeaconCone` guard, using `beaconConeHexKeys` already read from store.
  - **Key pattern:** `deriveTileState` intentionally preserves the raw `visibilityTier` in its return value. Consumers that render visual state (HexTile, TileInfoCard) must independently check `beaconConeHexKeys` before applying Hidden-tier styling. `strengthUnknown` is the one exception that must be gated inside `deriveTileState` itself (because TroopBadge reads it from tileState, not directly from beaconConeHexKeys).
  - **`beaconCone.ts` is correct:** One axial direction, ≤3 keys, hard-stops at 3 steps. The broad "fan" appearance is the intentional `renderBeaconSector` SVG gradient arc (2000px, 45°), not the 3 per-hex polygon overlays.
  - **Build:** `npm run lint && npm run build` — 0 errors, 1 pre-existing DemolishCard warning (unrelated).

- **2026-07-xx (vermeer-beacon-instant-reveal):** Fixed beacon activation delay — cone overlay and tile reveals now appear instantly on tap.
  - **Root cause:** `BeaconCard.tsx` called `activateAbility()` (local UI state) only after `onActivateBeacon()` resolved, meaning the cone and tile reveal waited for a full SignalR round-trip. `AbilityOverlayLayer.tsx` also guarded both `beaconState` and `beaconScanHexes` solely on `myPlayer?.isBeacon` (server flag), so even after `activateAbility()` ran, the overlays wouldn't render until the next server broadcast with `isBeacon: true`.
  - **Fix 1 — `BeaconCard.tsx`:** Moved `activateAbility()` before the `await Promise.resolve(onActivateBeacon(...))` call (optimistic activation). Added `exitAbilityMode()` on `succeeded === false` to revert on server rejection.
  - **Fix 2 — `AbilityOverlayLayer.tsx`:** Extracted `isBeaconActive` local variable in both `beaconState` and `beaconScanHexes` useMemos: `Boolean(myPlayer?.isBeacon) || (abilityUi.activeAbility === 'beacon' && abilityUi.mode === 'active')`. Both memos now react to either the server flag or the local UI state. Added `abilityUi` to both dependency arrays.
  - **Pattern:** For optimistic UI with revert-on-failure: call local state mutation first, `await` server, call revert action if `succeeded === false`. Consumer memos that gate on server state must also check the equivalent local UI state field to avoid waiting for the next broadcast.
  - **Build:** `npm run lint && npm run build` — 0 errors, 1 pre-existing DemolishCard warning, 293 modules.

- **2026-07-xx (vermeer-beacon-pixel-radius):** Fixed beacon sector cone and compass beam rendering — both were microscopic arcs because `beaconPixelRadius` and `compassBeamPixelRadius` were scaling `tileSizeMeters` by `Math.sqrt(3)` and then dividing by 111320 (meters-per-degree lat), but `tileSizeMeters` is in the local projection coordinate system, not geographic meters. Fix: replaced both useMemos to use `roomHexToLatLng` (imported from `../HexMath`) — project the player's current hex center `(q, r)` and adjacent hex `(q, r+1)` to lat/lng, convert both to Leaflet layer points, measure pixel distance (the true 1-hex step size), then multiply by `beaconRange`. Dependencies updated to use `currentHexQ/currentHexR` instead of `currentLat/currentLng`. Build: lint + tsc + vite clean.

- **2025-07-24 (vermeer-beacon-frontend):** Redesigned the beacon feature — Scout always-on cone, ShareIntelCard replaces toggle.
  - **AbilityOverlayLayer.tsx:** All three `isBeaconActive` useMemo computations now include `myPlayer?.role === 'Scout'` as the first check. Scout cones are always rendered regardless of `isBeacon` server flag or `abilityUi` state. Added `myPlayer?.role` to compassBeamPixelRadius deps array.
  - **New `ShareIntelCard.tsx`:** Scout's ability card. No activate/deactivate toggle. Shows description, cooldown timer (driven by `player.shareIntelCooldownUntil`), and a "Share Intel" CTA button. Uses `useSecondTick(callback)` pattern for live countdown. On click: calls `onShareBeaconIntel()`, shows result count feedback.
  - **`types/abilities.ts`:** Added `'shareIntel'` to `AbilityKey` union.
  - **`types/game.ts`:** Added `shareIntelCooldownUntil?: string` (ISO date) to Player interface. Backend must include this in PlayerDto.
  - **`useGameActionsAbilities.ts`:** `handleShareBeaconIntel` now calls `invoke('ShareBeaconIntel')` with no arguments. Removed `computeBeaconCone` import, removed `gameState`/`myPlayer` from Pick (no longer needed).
  - **`PlayerHUD.tsx`:** Scout section now also adds a `shareIntel` ability button when `showBeacon` is enabled. Beacon toggle button is guarded with `player.role !== 'Scout'` — Scouts don't get the toggle since their cone is always on.
  - **`PlayingHud.tsx`:** Added `ShareIntelCard` import; added `abilityUi.activeAbility === 'shareIntel'` branch that renders `ShareIntelCard`.
  - **i18n:** Added `abilities.shareIntel.{title, description, cta, cooldown, shared}` to both `en.ts` and `nl.ts`.
  - **Build:** `npm run build` (tsc -b + vite build) — 0 errors, clean.
  - **Key coordinate:** Backend (De Ruyter) must expose `ShareBeaconIntel` hub method with no arguments and include `shareIntelCooldownUntil` in PlayerDto.

- **2026-03-23 (beacon-redesign):** Completed Scout beacon frontend redesign in parallel with De Ruyter backend work. Implemented role-aware beacon logic: Scout cone always-on (no toggle), Share Intel pill replacing toggle, new ShareIntelCard with cooldown timer. Fixed three concurrent rendering issues: (1) beacon cone tiles were nearly invisible due to `hex-hidden-hostile` CSS applied unconditionally (`tileState.visibilityTier === 'Hidden'`); added `beaconConeHexKeys.has(hexId)` guard; (2) `?` badge on beacon tiles because `strengthUnknown` was computed 100 lines before `isInBeaconCone` check; reordered computation; (3) TileInfoCard showed "Unknown territory" on beacon tiles; added `isInBeaconCone` guard to both `isHidden` and `isRemembered` checks. Implemented optimistic activation for instant reveal: moved `activateAbility()` before server call, added `exitAbilityMode()` revert on failure; `AbilityOverlayLayer` memos now check both `myPlayer?.isBeacon` and `abilityUi.activeAbility === 'beacon'` to avoid broadcast-wait window. Fixed beacon sector arc and compass beam rendering (were microscopic): replaced `tileSizeMeters / 111320` scaling with accurate `roomHexToLatLng` + `map.latLngToLayerPoint` projection. Build: `npm run lint` ✅ (0 errors), `npm run build` ✅ (293 modules clean). Cross-coordination: De Ruyter implements backend Share Intel with server-side cone computation; frontend calls `invoke('ShareBeaconIntel')` with no args. Decision #23 merged into `.squad/decisions.md`.

- **2026-07-xx (vermeer-beacon-scout-gate):** Fixed beacon/shareIntel showing for non-Scout players.
  - **Root cause:** The Scout ability block was gated `if (player?.role === 'Scout')` — missing the `rolesEnabled &&` check that Commander and Engineer blocks both have. A separate `if (showBeacon && player && player.role !== 'Scout')` block was pushing the `beacon` toggle for ALL non-Scout players unconditionally.
  - **Fix:** Collapsed into a single `if (rolesEnabled && player?.role === 'Scout')` block. Moved `beacon` toggle push inside this block (within `if (showBeacon)`), immediately before `shareIntel`. Removed the non-Scout beacon block entirely. Set `role: 'Scout'` on the beacon button config (was `undefined`).
  - **Pattern:** Role-ability gates must always include `rolesEnabled &&` — mirrors Commander/Engineer pattern.
  - **Build:** lint (0 errors, 1 pre-existing DemolishCard warning) + tsc -b + vite build clean (294 modules).

- **2026-07-xx (vermeer-compass-crash):** Fixed app crash/reload after 30–60s of compass heading tracking.
  - **Root cause 1 (critical):** `lerpBearing` rAF loop in `GameMap.tsx` was perpetual — it always rescheduled the next frame even after the map bearing had fully converged to the target. This meant `map.setBearing()` was called at ~60fps indefinitely whenever compass rotation was enabled, causing continuous Leaflet layout thrash that OOM'd the tab after ~30–60s.
  - **Fix 1:** `lerpBearing` now exits (returns without rescheduling) when `Math.abs(diff) < 0.3` (converged). A new `lerpBearingRef` exposes the function so the `effectiveHeading` effect can restart the loop when the heading target changes (kicks off a new rAF frame if `bearingRafRef.current === 0`). The lerp loop now only runs while there is actual rotation work to do.
  - **Root cause 2 (minor):** Q/E keydown handler re-registered on every sensor heading update (~16Hz) because `compassHeading` was in the `useEffect` dependency array. While cleanup was correct, this caused unnecessary listener churn.
  - **Fix 2:** Added `compassHeadingRef` (updated via its own effect). Q/E handler now reads heading from refs and has an empty dependency array — registers once, never re-registers.
  - **Pattern:** Never run an rAF loop unconditionally when compass is enabled. Always exit the loop on convergence and restart it only when the target changes. Use refs to break stale-closure dependencies in event handlers.
  - **Build:** `npm run lint && npm run build` — 0 errors, 1 pre-existing unrelated warning in `DemolishCard.tsx`.

- **2026-03-23 (client-side visibility computation):** Implemented client-side visibility override to eliminate the 750ms delay when tiles reveal upon player movement. Previously, the frontend waited for a backend round-trip to receive updated `visibilityTier` values via `StateUpdated`, causing a noticeable lag when players moved adjacent to hidden territory. The fix generalizes the existing beacon cone pattern: created `isLocallyVisible()` utility in `src/utils/localVisibility.ts` that mirrors the backend's `ComputeVisibleHexKeys` logic (allied player radius-1, alliance-owned territory, hostile hexes adjacent to alliance-owned, beacon cone). In `tricorderTileState.ts`, the `visibilityTierEarly` derivation now checks local visibility first (`locallyVisible ? 'Visible' : serverTier`), instantly revealing tiles without waiting for the server. The sets `alliedPlayerHexKeys` and `allianceOwnedHexKeys` are computed once per component via `useMemo` in both `HexTile.tsx` and `TileInfoCard.tsx`, reacting to player position changes (including the lightweight `PlayersMoved` event). The server's `visibilityTier` remains the fallback for remembered tiles and alliance-shared intel. React Compiler required full `myPlayer` / `currentPlayer` objects in dependency arrays (not just `?.allianceId`) to preserve manual memoization. Build: lint + tsc + vite all clean. Orchestration log: `.squad/orchestration-log/2026-03-23T13:40:42Z-vermeer-visibility.md`.


## 2025-01-26: Game Manual Research

**Context:** Rembrandt (orchestrator) requested comprehensive documentation of player-facing experience for game manual creation.

**Research conducted:**
- Analyzed complete i18n/en.ts file (1400+ lines) — extracted ALL player-facing text
- Reviewed all 9 ability card components (Beacon, Tactical Strike, Rally Point, Commando Raid, Fort Construction, Sabotage, Demolish, Share Intel, Intercept)
- Examined TileInfoCard for hex inspection UX
- Studied PlayerHUD and PlayingHud for HUD layout and interactions
- Analyzed SetupWizard and GameLobby for complete setup flow
- Documented GameView for main game structure

**Key findings:**
1. **Setup wizard is 6 steps:** Location → Teams → Rules → Dynamics → Roles (optional) → Review
2. **3 visibility tiers:** Visible (full info) → Remembered (stale intel with "ARCHIVED" badge) → Hidden (unknown)
3. **Ability cards follow consistent pattern:** Status pill, description, metadata rows, action buttons, back/abort controls
4. **Combat is two-phase:** Preview modal (with retreat option) → Result modal (with troop deployment)
5. **HUD is contextual:** Shows different action buttons based on hex relation (own/team/enemy/neutral)
6. **Map legend has 30+ entries** covering territory, markers, borders, progress, and status indicators
7. **Roles grant 2-4 abilities each:** Commander (4), Scout (4), Engineer (3)
8. **Fog of war is sophisticated:** Uses lastKnownOwner fields, staleness indicators, time-since-seen display
9. **Guest flow is simplified:** No wizard navigation, just waiting screens with progress updates
10. **All validation is inline:** Field-level error messages, disabled states with tooltips

**Deliverable:** Created comprehensive 600+ line research document at `.squad/decisions/inbox/vermeer-game-manual-research.md` with:
- Complete player journey (13 sections)
- Every ability card's UI flow
- All setup wizard options
- Map legend entries
- Fog of war mechanics
- Combat modals
- Error messages
- Visual feedback patterns

This provides authoritative source for player-facing game manual that matches the actual in-game experience word-for-word.

### Abilities Expansion (troopTransfer + fieldBattle)
- Added TroopTransfer and FieldBattle ability types with full SignalR event handling
- CommandoRaidCard simplified: no more bearing-based target selection, raids current position
- TacticalStrikeCard: removed currentHex prop and "Use Current Hex" fallback
- New components: TroopTransferCard, TroopTransferReceivedPanel, FieldBattleCard, FieldBattleInvitePanel
- Notification panels (TroopTransferReceivedPanel, FieldBattleInvitePanel) get invoke via props threaded through PlayingHud
- Valid icon used for "troops": `helmet`; for "victory": `trophy`
- abilityUi.ts extended to restore troopTransfer/fieldBattle active state on reconnect

- 2026-03-24 (abilities-expansion-frontend): Implemented frontend abilities expansion from Rembrandt blueprint. Commando Raid refactored to current-hex-only (removed coordinate UI), Tactical Strike constraint enforced (adjacent-only), Troop Transfer added with bearing-based targeting + name preview + confirmation, Field Battle added with notification banner join flow + 30s countdown + host-configurable resolution modes. Added troopTransfer + fieldBattle to AbilityKey union; extended notificationStore; wired 4 new hub event handlers; added 5 new useGameActionsAbilities callbacks; created 4 new components (TroopTransferCard, TroopTransferReceivedPanel, FieldBattleCard, FieldBattleInvitePanel); updated DynamicsStep with Field Battle mode radio; added 12+ new i18n keys (EN + NL). Validation: `npm run lint` ✅ (0 errors), `npm run build` ✅ (0 errors). Files: 43 changed, +2270/-257 lines. Commit: 0c6e61b. See orchestration log `.squad/orchestration-log/2026-03-24T16:25:04Z-vermeer.md`.


## Learnings

### Enemy Tile Memory (Fog-of-War) — 2025-07-14
- `tricorderTileState.ts` is the single place where server `visibilityTier` + local adjacency combine into the rendered tier. Fixing visibility bugs belongs here, not in `localVisibility.ts` (which is purely a boolean helper).
- `computeStalenessTier()` must use `dynamics.enemySightingMemorySeconds` (from `DeriveTileStateParams`) — not a hardcoded constant — so the amber fading window matches the game's configured value.
- A frontend safety net (Hidden → Remembered upgrade when `lastSeenAt` is within memory window) is valuable as a timing bridge between the player moving and the backend emitting the updated tier. It costs nothing when the backend is correct.
- `normalizeGameState` already preserves `Remembered` tiers from the server; no merging needed in `useSignalRHandlers`.

- **2026-03-26 (enemy-memory-frontend):** Implemented frontend fix for enemy tile memory persistence. Fixed two related bugs: (1) Hidden→Remembered safety net — frontend now upgrades `Hidden` tier to `Remembered` when `cell.lastSeenAt` is present and age is within configured memory window, bridging timing gap between `PlayersMoved` and next `StateUpdated`; (2) Dynamic staleness threshold — replaced hardcoded 120s constant with `(enemySightingMemorySeconds / 2) * 1000`, so full configured interval becomes fading threshold (first half = fading amber, second half = stale dimmed). Both fixes applied in `components/map/tricorderTileState.ts`. Defensive measure with zero visible impact when backend works correctly. Validation: `npm run lint && npm run build` clean. See orchestration log `.squad/orchestration-log/2026-03-26T09:41:37Z-vermeer.md` and decision #35 in `.squad/decisions.md`.

- **2026-07-xx (vermeer-memory-scrutiny-fix):** Found and fixed the actual root cause of enemy tile memory not persisting. Previous fix (decision #35) added a safety net in `tricorderTileState.ts` that upgrades `Hidden → Remembered` when `cell.lastSeenAt` is within the memory window — but `lastSeenAt` is **null** in the failure case because the backend only sets it via `ApplyRememberedCell`, which only runs when `BuildStateForViewer` sees a tile in `RememberedHexes`. `RememberedHexes` is only populated by `UpdateMemory`, which is only called during a full `BroadcastPerViewer` (StateUpdated). Movement without grid changes triggers `BroadcastPlayersPerViewer` (PlayersMoved only) — **no UpdateMemory**. If the player is adjacent briefly and moves away before any regen broadcast, `lastSeenAt` stays null and the safety net never fires.
  - **Fix:** Module-level `_localHexSightingTimestamps: Map<string, number>` added to `localVisibility.ts` with `recordLocalHexSighting(key)` / `getLocalHexSightingMs(key)` helpers. In `useSignalRHandlers.ts` `onPlayersMoved`: computes old vs new allied hex keys, calls `recordLocalHexSighting` for enemy tiles that just left local adjacency. In `tricorderTileState.ts`: `locallySeenAtMs?: number` added to `DeriveTileStateParams`; safety net and `computeStalenessTier` now use `Math.max(serverSeenMs, locallySeenAtMs)`. In `HexTile.tsx` and `TileInfoCard.tsx`: pass `locallySeenAtMs: getLocalHexSightingMs(hexId/hexKey)`. Map is module-level (not React state) so it survives `normalizeGameState` grid replacement and `alliedPlayerHexKeys` dep change triggers re-render at the right time.
  - **Build:** `npm run lint && npm run build` — 0 errors, 300 modules clean.
  - **See:** `.squad/decisions/inbox/vermeer-memory-scrutiny-fix.md`

- **2026-07-xx (vermeer-memory-default):** Removed "Off" (0 seconds) option from the Enemy Sighting Memory lobby setting. Options array changed from `[0, 15, 30, 60, 120]` to `[15, 30, 60, 120]`. Fallback value in `value` prop changed from `?? 0` to `?? 120`. Removed the ternary that rendered "Off" label for 0 — all options now uniformly show the `enemySightingMemorySeconds` label. Removed unused `enemySightingMemoryOff` key from `en.ts` and `nl.ts`. `npm run lint && npm run build` clean. File: `DynamicsStep.tsx`.

- **2026-07-xx (vermeer-radar-sweep):** Implemented `RadarSweepLayer.tsx` — a canvas-based Leaflet layer that renders a rotating radar sweep animation emanating from the player's GPS position. Uses `requestAnimationFrame` loop; sweep arm at 18°/s, 120° fading comet trail built from 40 gradient arc slices, 400m real-world sweep radius via `metersToPixels()` CRS projection, center dot + glow ring. Respects `prefers-reduced-motion`. Only active when `state.phase === 'Playing'` and `currentLocation != null`. Attached to `game-map-hex-pane` (above hex tiles, z-index 350, below player pane). Exported from `layers/index.ts` and wired into `GameMap.tsx`. `npm run lint && npm run build` clean. No i18n keys needed.

- **2026-07-xx (vermeer-radar-sweep-hals-update):** Updated RadarSweepLayer to Hals visual spec. Changes: phosphor cyan palette (`rgba(0,243,255,…)` for arm/bloom/tail); `screen` blend mode for arm, bloom, tail; `source-over` for outer ring; draw order clear→ring→tail→arm→bloom→glow; 4 RPM (15s period) via delta-time; 30fps cap; SCAN_RADIUS_METERS=600 via `latLngToLayerPoint` distance; DPR clamped to 2; `setTransform(dpr,0,0,dpr,0,0)` per frame; radial-gradient wedge fill for comet tail; origin glow breathes with north-crossing flare; dedicated `game-map-radar-pane` at z-index 540 registered in `GameMap.tsx`; player position read from `usePlayerLayerStore` (removes lat/lng props); `radarSweep: boolean` added to `MapLayerPreferences` (default true), added to 'overlays' LAYER_GROUP, wired into `isActive` in GameMap; i18n keys `layerPanel.radarSweep` added (EN: "Radar sweep", NL: "Radarveeg"); CSS `.leaflet-game-map-radar-pane { pointer-events: none }` added; `prefers-reduced-motion` with MQL change listener. `npm run lint && npm run build` clean (0 errors).

## Learnings

### RadarSweepLayer — rotation anchor fix (2025)

**Bug:** The radar sweep drifted from the player's GPS position when the map heading changed.

**Root causes (both present):**
1. **Wrong coordinate method for rotated map (Cause A):** `drawFrame` used `map.latLngToContainerPoint()` to compute the player's canvas position. Because `leaflet-rotate` makes `latLngToContainerPoint` return post-rotation *screen-space* coordinates, and the canvas lives inside `rotatePane` (which already receives the CSS rotation transform), the rotation was applied twice. The sweep appeared correct with no heading but drifted proportionally with any bearing change.

2. **Missing `rotate` event (Cause D):** The `resizeCanvas` handler only subscribed to `resize zoomend moveend viewreset`, missing `rotate`. Not critical for the redraw (the RAF loop redraws every frame) but inconsistent with all other layers.

**Fix pattern for any canvas layer inside `rotatePane`:**
```typescript
// WRONG — returns post-rotation screen coords, applied on top of CSS pane rotation = double rotation
const center = map.latLngToContainerPoint(L.latLng(lat, lng));

// CORRECT — pre-rotation layer coords; subtract pixelOrigin to get canvas-space coords
const lp = map.latLngToLayerPoint(L.latLng(lat, lng));
const pixelOrigin = map.getPixelOrigin();
const cx = lp.x - pixelOrigin.x;
const cy = lp.y - pixelOrigin.y;
```

**Rule:** Any canvas that is a child of `rotatePane` (or any pane appended to it) must use `latLngToLayerPoint - getPixelOrigin()` for geographic-to-canvas coordinate conversion. `latLngToContainerPoint` is only safe in non-rotating maps or in DOM elements that are *not* inside the rotating subtree.

**Events:** always include `rotate` alongside `moveend zoomend viewreset` when listening for projection changes on a rotation-enabled Leaflet map.

- **2026-07-xx (vermeer-radar-invisible-fix):** Fixed RadarSweepLayer rendering completely invisible.
  - **Root cause — double pixelOrigin subtraction:** In `drawFrame`, the code computed `cx = lp.x - pixelOrigin.x` and `cy = lp.y - pixelOrigin.y`, where `lp = map.latLngToLayerPoint(...)`. However, `latLngToLayerPoint` **already** subtracts `getPixelOrigin()` internally (standard Leaflet behaviour: `layerPoint = project(latlng) − pixelOrigin`). Subtracting `pixelOrigin` a second time displaced the center by tens of millions of pixels off-canvas. The off-screen guard (`cx < -radiusPx - 50`) then fired immediately every frame and returned without drawing anything.
  - **Fix:** Removed the redundant subtraction — `cx = lp.x; cy = lp.y;` — using `latLngToLayerPoint` directly as the canvas coordinate. The canvas lives at `top:0, left:0` in the radar pane whose origin IS layer-space (0,0), so the layer point maps 1:1 to canvas pixels.
  - **Other causes checked and cleared:** Phase string `'Playing'` matches the `GamePhase` type. `radarSweep: true` in `DEFAULT_MAP_LAYER_PREFS`. Radar pane created in `useLayoutEffect` before layers mount. `screen` blend mode correct for dark tiles. `prefers-reduced-motion` guard is correct. No issues found — the coordinate math was the sole root cause.
  - **Build:** `npm run lint && npm run build` — 0 errors, 301 modules, clean.

- **2026-07-xx (vermeer-radar-visibility-radius):** Tied radar sweep radius to player's actual visibility range. Backend visibility constants (from `VisibilityService.cs`): base `VisibilityRadius = 1` hex, `BeaconRange = 3` hexes when beacon active. Scout has permanent beacon (`isBeacon` always true). Hex size = `state.tileSizeMeters` (dynamic game config, typically 50-100m). RadarSweepLayer now accepts `visibilityHexes: number` and `hexSizeMeters: number` props. Removed hardcoded `SCAN_RADIUS_METERS = 600` constant; replaced with `const scanRadiusMeters = hexSizeMeters * visibilityHexes`. `computeRadiusPx` now accepts `scanRadiusMeters` parameter. GameMap computes `visibilityHexes` from `myPlayer` via `useMemo`: `(myPlayer?.isBeacon || myPlayer?.role === 'Scout') ? 3 : 1`. Passes both `visibilityHexes` and `hexSizeMeters` to `<RadarSweepLayer />`. Sweep radius now dynamically scales: 1 hex for base visibility, 3 hexes for Scout or any player with active beacon. Build: `npm run lint && npm run build` clean (0 errors, 301 modules).

- **2026-XX-XX (vermeer-fieldbattle-ui):** Fixed FieldBattle UI not surfacing automatically when enemy lands on same neutral tile.
  - **Problem:** When two players on different alliances land on the same neutral tile, the FieldBattleCard (ability card) passively detects eligibility but doesn't auto-surface. Players don't know a battle is available unless they open the ability panel.
  - **Solution 1 (Initiator notification):** Added detection logic to `useSignalRHandlers.ts` `onStateUpdated` handler. Checks if the local player just moved onto a neutral hex where enemy players with troops are present (different alliance). If detected, pushes an info-ledge toast with icon `'contested'` and message `'game.toast.fieldBattleDetected'`. Only fires when the condition newly becomes true (compares player position in previous vs. current state). Detection runs only when `normalizedState.phase === 'Playing'`.
  - **Solution 2 (Enemy panel already wired):** `FieldBattleInvitePanel` was already imported and rendered in `PlayingHud.tsx` (line 830). When the backend sends `FieldBattleInvite`, `onFieldBattleInvite` handler (line 624) sets `notificationStore.fieldBattleInvite` and pushes a toast. The panel renders automatically when invite exists.
  - **i18n keys added:** `game.toast.fieldBattleDetected` in `en.ts` ("Enemy detected on your position — field battle available!") and `nl.ts` ("Vijand gedetecteerd op uw positie — veldslag beschikbaar!").
  - **Pattern:** For initiator auto-notification on StateUpdated: (1) only act if player position changed (compare prev/current hex coords), (2) check hex is neutral, player has troops, enemies are present with troops, (3) push toast once per move (not every StateUpdated broadcast).
  - **Build:** `npm run lint && npm run build` — 0 errors, clean (293 modules).

- **2026-07-xx (vermeer-fieldbattle-position-tracking):** Implemented automatic `UpdatePlayerPosition` hub call on hex change, enabling FieldBattle to fire without requiring an explicit button press.
  - **Problem:** `FieldBattle` was only triggered inside `PlaceTroops` (explicit button press). Moving to a hex where an enemy with carried troops was standing did not auto-trigger the battle.
  - **Solution:** Added `lastReportedHexRef` (string | null) and a new `useEffect` in `useGameActionsGameplay.ts`. The effect watches `currentHex`, `gameState`, `connected`, `invoke`, `currentLocation`, and `isHostBypass`. When the hex key changes (and game is Playing + connected), it calls `invoke('UpdatePlayerPosition', q, r, lat, lng)`, deriving lat/lng via `resolveActionCoordinates` — hex center when `isHostBypass=true`, actual GPS/debug position otherwise. The ref resets to `null` when phase is not 'Playing' so first-move after a new game always fires. Existing `FieldBattleInvite` handler untouched — it handles the server response for both this new path and the existing PlaceTroops path.
  - **Pattern:** Ref-guarded `useEffect` that compares `hexKey` to `lastReportedHexRef.current` before invoking — prevents re-firing when `gameState` or other deps change without the hex changing.
  - **Build:** `npm run lint && npm run build` — 0 errors, 302 modules clean.
  - **See:** `.squad/decisions/inbox/vermeer-fieldbattle-position-tracking.md`
