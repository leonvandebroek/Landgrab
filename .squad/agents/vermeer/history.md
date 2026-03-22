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


- **2026-07-xx (vermeer-p1-fixes — Q/E heading + Dutch event log):**
  - **Fix 1 (Q/E heading gating, P1):** The Q/E keydown handler in `GameMap.tsx` was inside a `useEffect` gated by `isCompassRotationEnabled`. When the compass toggle was off (default), the effect returned early and the listener was never registered. Fix: removed the guard entirely. Added `debugCompassHeadingRef` (a `useRef` tracking `debugCompassHeading` state) to safely read current heading inside the effect closure without stale closure issues. Q/E now also calls `useUiStore.getState().setDebugHeading(newHeading)`, propagating the value into `currentHeadingRef` so the heading is included in the next `UpdatePlayerLocation` hub call. Added an input/textarea target guard.
  - **Fix 2 (Dutch event log, P1):** `gameLogFormat.ts` had a switch statement handling ~10 event types; all others fell through to `event.message` (raw English). Added 28 new `case` blocks covering every structured event type emitted by the backend. Added matching i18n keys in `en.ts` and `nl.ts`. `HostAction`, `RandomEvent`, and `HostMessage` intentionally return `event.message` as they contain dynamic server-generated or user-generated English content that cannot be statically translated. Pattern: always check `event.allianceName ?? t('gameLog.unknownAlliance')` for alliance name fields.
  - **Two sources of truth for heading:** `debugCompassHeading` (local `useState` in `GameMap.tsx`) controls the visual compass needle and map rotation. `uiStore.debugHeading` controls what heading is sent to the backend via `currentHeadingRef`. Q/E now keeps both in sync. The DebugSensorPanel slider also writes to `uiStore.debugHeading` — the two controls are compatible (last write wins).

- **2026-03-22 (vermeer-p1-fixes — Production playtest fixes):**
  - **Orchestration:** Merged Q/E heading + Dutch event log fixes. Written orchestration log and decision. All frontend/ changes linted + built clean.


- **2026-07-xx (vermeer-p2-dialog):** Fixed P2 dialog stacking/overlap. Root cause: `combatResult` and `neutralClaimResult` are independent nullable state fields in `gameplayStore`. When both arrive simultaneously (e.g., a combat outcome while a claim result is shown), both `CombatModal` and `TroopDeployModal` rendered at once. Fix: implemented Option A (queue) entirely inside `gameplayStore.ts`. Added `QueuedOutcomeDialog` discriminated union type and `outcomeDialogQueue: QueuedOutcomeDialog[]` state field. Changed `setCombatResult` and `setNeutralClaimResult` to enqueue new arrivals if another dialog is currently visible, and to promote the next queued item on dismissal (null call). Also added `outcomeDialogQueue: []` to `clearGameplayUi`. No changes needed in GameView, SignalRHandlers, or agentBridge — full backward compatibility preserved. Build: `npm run lint && npm run build` passes (0 errors).
