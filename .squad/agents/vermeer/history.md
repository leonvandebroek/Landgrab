# Vermeer — History

## Core Context
Frontend Dev on Landgrab. React 19 + TypeScript + Vite + Zustand + Leaflet + i18next. Strict TypeScript mode. EN/NL i18n. Canvas-based hex map via Leaflet custom layers.

Key patterns:
- All useState in App.tsx; props drilling is intentional
- eventsRef pattern in useSignalR for stale closure prevention
- Zustand stores: gameStore, gameplayStore, notificationStore, uiStore, infoLedgeStore
- Build: `npm run lint && npm run build` from frontend/landgrab-ui/

## Learnings
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
