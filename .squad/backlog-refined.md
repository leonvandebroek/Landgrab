# Landgrab Backlog Refinement
**Author:** Rembrandt (Lead)  
**Date:** 2026-05-15  
**Session:** backlog-refinement  

---

## Audit Summary

Reviewed all 11 Pending decisions (#3, #4, #5, #6, #8, #9, #10, #11, #12, #13, #14) plus Decision #27 (Fix Specification Ready) and key playtester UX inbox items. Cross-referenced each against the codebase, implemented decisions, and inbox plans.

---

## Closed / No Action Required

| Item | Status | Evidence |
|------|--------|----------|
| Decision #8 — Defender combat feedback parity | **Superseded by #17** | `useSignalRHandlers.ts` consumes `CombatRepelled` event |
| Decision #9 — Show all alliances in HUD | **Superseded by #18** | Vermeer removed empty-alliance guard in `PlayingHud.tsx` |
| Decision #13 — Modal stacking prevention | **Implemented** | `outcomeDialogQueue` in `gameplayStore.ts` lines 143–167 |
| Decision #27 — Adjacent enemy tile visibility fix | **Implemented** | `tricorderTileState.ts:151` passes `visibilityTierEarly` to `getStrengthUnknownState` |
| Decision #3 — Deterministic non-GPS host setup | **Implemented** | `LocationStep.tsx` has full `showManual` form with lat/lng inputs; GPS-denied card shows "enter manually" button; `wizard.locationRequired` hint fires when location not set |
| Decision #10 — HQ assignment state consistency | **Non-issue** | Backend `AutoAssignAllianceHQs` correctly sets `HQHexQ`/`HQHexR`; frontend type uses matching camelCase `hqHexQ`/`hqHexR`. Original evidence ("hq === null") referenced a non-existent field name |
| Decision #14 — Rules overlay auto-dismiss | **Resolved** | `TutorialOverlay` (first-play auto-show) has skip button + auto-dismiss timeout; `HelpOverlay` is now menu-only, never auto-blocks |
| Memory bug (`rembrandt-memory-audit.md`) | **Confirmed fixed** | `BroadcastPlayersPerViewer` → `CreatePlayersForViewer` → `UpdateMemory` at line 212 confirmed in current code |
| TeamSplash UX item | **Implemented** | `TeamSplash.tsx` wired in `GameView.tsx` lines 110, 129, 141, 291–295 |
| Alliance name display UX item | **Implemented** | `PlayingHud.tsx` lines 536–544 render `myAlliance.name` with color badge (`.scanner-callsign__alliance`) |
| Team color legend UX item | **Implemented** | `TeamLegend.tsx` fully wired inside `.scanner-callsign__alliance` block in `PlayingHud.tsx:544` |
| FieldBattle independent trigger (`de-ruyter-fieldbattle-independent-trigger.md`) | **Implemented** | Inbox file status: "Implemented ✅" |

---

## Active Backlog — Ordered Implementation Plan

### P0 — Fix before next playtesting session

---

#### ITEM 1: Allied pickup UI/backend contract mismatch
**Decisions:** #5, #12  
**Inbox plan:** `de-ruyter-pickup-fix.md` (NOT yet applied)  
**Complexity:** Small (2–3h backend, 1h frontend verification)  
**Agents:** De Ruyter (backend), Vermeer (verify frontend)

**Problem:**  
`tileInteraction.ts:241–295` shows a Pick Up button on allied tiles. The backend rejects the action at `GameplayService.cs:251`:
```csharp
if (cell.OwnerId != userId) return (null, PickUpOwnHexesOnlyError);
```
The user sees the button, taps it, gets an error toast. Bad UX and confusing contract.

**Fix (per de-ruyter-pickup-fix.md):**  
Change the ownership check in `GameplayService.PickUpTroops` to allow allied tile pickup:
```csharp
// Before
if (cell.OwnerId != userId) return (null, PickUpOwnHexesOnlyError);

// After
if (cell.AllianceId != requiredAllianceId) return (null, PickUpOwnHexesOnlyError);
```
Where `requiredAllianceId` is the caller's alliance ID (already available from room state).  
Alternatively, if the design intent is to block allied pickup, remove the button from the frontend allied-tile branch in `tileInteraction.ts`.

**Acceptance criteria:**
- [ ] Tapping a allied tile's Pick Up button either (a) succeeds and adds troops to backpack, OR (b) the button is hidden on allied tiles
- [ ] No error toast fires for the intended interaction path
- [ ] Existing tests `PickUpTroops_FromAlliedHex_Fails` updated or removed to match the chosen path

---

#### ITEM 2: Smooth player marker movement
**Inbox:** `rembrandt-playtester-ux-plan.md` (P1)  
**Complexity:** Small (1h)  
**Agent:** Vermeer

**Problem:**  
`PlayerLayer.tsx:464` sets `<g transform="translate(x,y)">` with no CSS transition. The self-player chevron snaps discretely to each GPS update.

**Fix:**  
Add CSS transition to the `<g>` element, or wrap the `transform` value with a CSS variable and add a transition rule in `tricorder-map.css`:
```css
.player-marker { transition: transform 0.8s linear; }
```
The transition duration should roughly match the GPS update interval (~1s) for smooth gliding.

**Acceptance criteria:**
- [ ] Player's own marker glides smoothly between GPS positions rather than snapping
- [ ] On rapid GPS updates (e.g., fast walking), marker does not visibly lag behind

---

### P1 — Include in next sprint

---

#### ITEM 3: Remaining event message localization
**Decision:** #11  
**Complexity:** Small–Medium (3–4h backend + 1h frontend)  
**Agents:** De Ruyter (backend Message strings), Vermeer (i18n fallthrough keys)

**Problem:**  
Decision #20 added 28 NL i18n case blocks for structured event types in `gameLogFormat.ts`. However, backend-generated `Message` strings passed via `HostAction`, `HostMessage`, and `RandomEvent` event types are still hardcoded English:
- `LobbyService.cs:377`: `$"Alliance {alliance.Name} HQ was auto-assigned at ({hqCell.Q}, {hqCell.R})."`
- Other instances of raw English `Message` strings in `LobbyService`, `GameplayService`, `HostControlService`

**Fix:**  
Option A (preferred): Convert remaining backend-generated messages to structured event subtypes (add `AllianceHQAutoAssigned`, etc.) so the frontend can localize them. Backend sends subtype string + parameters; frontend formats with i18n keys.  
Option B (expedient): Add frontend fallthrough handling in `gameLogFormat.ts` for the known English message patterns.

**Acceptance criteria:**
- [ ] Dutch-language players see no raw English strings in the game event log
- [ ] `HostAction`, `HostMessage`, and `RandomEvent` messages render in the user's selected language
- [ ] At minimum: HQ auto-assignment message is localized

---

#### ITEM 4: In-game geolocation denied recovery messaging
**Decision:** #6  
**Complexity:** Small (2h)  
**Agent:** Vermeer (frontend), Hals (copy/guidance text)

**Problem:**  
When geolocation is denied during play, `PlayerPanel.tsx:235` shows a passive error string. There's no actionable guidance: players don't know they can use arrow keys, or that they should re-enable permissions and reload.

The `effectiveLocationError` in `App.tsx` is correctly nulled for host bypass and debug mode, but non-host non-debug players with denied GPS receive no instructions.

**Fix:**  
When `locationError` is non-null and not suppressed:
1. Show an info callout (not just a red error) in `PlayerPanel` or as an `InfoLedge` entry
2. Include: "GPS denied — use arrow keys to move" (keyboard fallback from Decision #7)
3. Optionally: "Enable location in browser settings and reload to restore GPS"

**Acceptance criteria:**
- [ ] A player who denies geolocation mid-game sees actionable text, not just a red error string
- [ ] The callout mentions arrow key movement as a fallback
- [ ] The callout is localized (EN + NL)

---

#### ITEM 5: Movement fallback guarantee in Playing phase
**Decision:** #4  
**Complexity:** Small (1–2h validation + possible guard)  
**Agents:** Steen (validation), De Ruyter (if backend guard needed)

**Problem:**  
Decision #7 added arrow key movement as a fallback path. The question is whether `StartGame` or the hub enforces that GPS-denied players cannot start, leaving others stranded. Also: is there an in-game gate that blocks all actions when geolocation is null (other than the passive error)?

**Required validation:**
1. Confirm arrow key movement (`MovePlayer` from keyboard) works when `geolocation.error` is set
2. Confirm that the host cannot start a game if their own GPS is denied (or that bypass is explicitly required)
3. Confirm no hub method silently fails for non-GPS users mid-game

If gaps found, De Ruyter adds a guard. If arrow key path fully covers the fallback, close this item.

**Acceptance criteria:**
- [ ] A player with GPS denied can still move via arrow keys (Steen playtest confirmation)
- [ ] Host cannot accidentally start without GPS unless bypass is explicitly toggled
- [ ] Spinoza validates or marks accepted risk

---

### P2 — Backlog (no sprint yet)

---

#### ITEM 6: FieldBattle second-arrival auto-join
**Decision:** N/A (identified in `rembrandt-fieldbattle-independent-trigger-arch.md`)  
**Complexity:** Small–Medium (2h backend)  
**Agent:** De Ruyter

**Problem:**  
When a second enemy moves onto a hex that already has an active FieldBattle, `TryTriggerFieldBattle` returns null (battle already exists). The second enemy receives no `FieldBattleInvite` and cannot join.

**Fix:**  
After `autoTriggeredBattle == null` in the hub's `UpdatePlayerLocation` handler, check for an existing unresolved FieldBattle at `(q, r)` and send `FieldBattleInvite` directly to the caller if they are an eligible hostile player with troops.

**Acceptance criteria:**
- [ ] Second hostile player arriving at active battle hex receives `FieldBattleInvite`
- [ ] Unit test: `UpdatePlayerLocation_SecondEnemy_JoinsActiveBattle`

---

### Deferred (not in near-term sprints)

| Item | Reason |
|------|--------|
| Backend service decomposition (Decisions #28–#34) | Large architectural sprint; no immediate blocker |
| Azure SignalR provisioning (Decision #26) | Phase 3 infrastructure; not blocking gameplay |
| Performance optimizations (Decision #46) | Explicitly LOW priority; scalability validated by Bug Hunt Round 4 |
| Progressive HUD / beginner mode (Playtester P3/P4) | Nice-to-have; tutorial overlay covers first-play |
| Vitest frontend unit runner setup | 30-min investment; low priority until test gaps identified |

---

## Inbox Files — Status after this refinement

| File | Action |
|------|--------|
| `de-ruyter-pickup-fix.md` | Active — plan is sound, apply in ITEM 1 |
| `rembrandt-memory-audit.md` | **Stale** — confirmed fixed in code; can be archived |
| `rembrandt-playtester-ux-plan.md` | Partially resolved (alliance name, team legend, TeamSplash, tutorial all done); remaining: smooth marker (ITEM 2) |
| `de-ruyter-fieldbattle-independent-trigger.md` | **Implemented** — can be archived |
| `rembrandt-fieldbattle-independent-trigger-arch.md` | **Superseded** — Léon confirmed correct fix was in `UpdatePlayerLocation`, not new endpoint; can be archived |
