# Squad Decisions

## Active Decisions

### 1. Backend: Auto-advance wizard step on map location set (2026-03-22)
**Status:** Implemented  
**Agent:** de-ruyter-wizard-fix  
**Change:** MapAreaService.SetMapLocation now atomically advances CurrentWizardStep from 0→1 when location is successfully set, eliminating frontend-backend timing race.  
**Rationale:** Deterministic wizard progression; single authoritative state update includes both location and step.  
**SignalR Impact:** None — no message format changes.

### 2. Frontend: Add optimistic location flag + i18n hints (2026-03-22)
**Status:** Implemented  
**Agent:** vermeer-wizard-fix  
**Change:** SetupWizard.tsx now uses `locationApplied` optimistic flag; Next button unlocks immediately after SetMapLocation call. Added `wizard.locationRequired` i18n key (EN/NL) with footer hint when blocked.  
**Rationale:** User feedback is immediate while backend state converges; reduces perceived lag and guides user toward solution.  
**SignalR Impact:** None — no message format changes.

### 3. Deterministic non-GPS host setup path (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** Make manual coordinates a first-class, always-available path; add explicit blocker diagnostics when Next/Start is disabled (e.g., "Map center not set", "Master tile missing").  
**Rationale:** Unblocks sessions in privacy-restrictive environments; improves playtest signal by surfacing root causes.  
**Dependent on:** Completion of Items 1–2 (already done).

### 4. Guarantee movement fallback in Playing when geolocation denied (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** Ensure debug GPS controls exist in Playing UI or host bypass precondition guard is enforced before start; all players must have actionable location state.  
**Rationale:** 6-player playtest reached Playing but all players had null currentHex; no recovery path when geolocation denied at start.  
**Evidence:** All players: `currentHexQ/currentHexR = null`, debug GPS step controls missing (`[data-testid="debug-gps-step-*"]`).

### 5. Unify action-result contracts for claim/pickup/attack (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** Align frontend action success feedback with authoritative server outcomes; never report `success: true` when no effective state change occurred.  
**Rationale:** Action feedback must match actual game state change; prevents user confusion and false success signals.  
**Evidence:** Pickup/claim helpers report `success: true` for non-owner or out-of-position contexts while territory/troops do not progress.

### 6. Improve in-game recovery messaging for geolocation lock states (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** When geolocation denied and movement impossible, show explicit actionable guidance (e.g., return to lobby for bypass, browser permission instructions, retry path).  
**Rationale:** Current passive notification (info-ledge "User denied Geolocation") offers no remediation path; active guidance improves UX.  
**Evidence:** Players receive persistent "User denied Geolocation" notification but cannot recover without host abort.

### 7. Keyboard controls as official desktop baseline (2026-03-22)
**Status:** Confirmed  
**Agent:** steen  
**Decision:** Arrow keys (↑↓←→) are official desktop movement method for all playtesting and debug scenarios. Q/E heading controls are aspirational (not yet implemented).  
**Rationale:** Keyboard movement is reliable, low-friction, and works identically on host and guest sessions. Confirmed correct via 6-player playtest.  
**Evidence:** All 6 players successfully completed setup → lobby → Playing → combat using keyboard arrow keys only. Keys auto-activate debug GPS on first press.  
**Documentation:** Updated in Steen's charter; use `session_press_key("ArrowRight")` in test scripts instead of tool-based debug panel toggle.

### 8. Defender combat feedback parity (proposed)
**Status:** Pending  
**Agent:** steen (6-player keyboard playtest finding)  
**Decision:** Broadcast equivalent combat outcome UX to both attacker and defender. Defender currently receives `combatResult: null` while attacker sees full dialog.  
**Rationale:** Information asymmetry creates unfair gameplay; defender should know outcome immediately upon resolution.  
**Evidence:** 6-player session: Defender side sees no combat result while attacker receives full "Neerlaag/Overwinning" dialog with win %, attack/defense strength, losses, survivors.

### 9. Show all alliances in player HUD (proposed)
**Status:** Pending  
**Agent:** steen (6-player keyboard playtest finding)  
**Decision:** Player panel should always display all alliances in multi-alliance matches, not just previously interacted ones. Isolates new alliances and hides strategic information.  
**Rationale:** Multi-alliance strategy requires full visibility; hidden alliance presence creates fog-of-war that breaks emergent gameplay.  
**Evidence:** 6-player session: Charlie (isolated alliance) was invisible in Alpha/Bravo panels throughout game; players unaware of third alliance's progress.

### 10. HQ assignment state consistency (proposed)
**Status:** Pending  
**Agent:** steen (6-player keyboard playtest finding)  
**Decision:** Enforce event/state consistency: when event log shows "HQ auto-assigned at (Q,R)", alliance HQ must be non-null in gameState at same time. Add integrity assertion on game start.  
**Rationale:** Game state sync bug; HQ value is logged but not persisted, creating authoritative-state confusion.  
**Evidence:** 6-player session: Event log "Alliance Alpha HQ was auto-assigned at (-4, 4)" but `gameState.alliances[alpha].hq === null`.

### 11. Localize server-generated event messages (proposed)
**Status:** Pending  
**Agent:** steen (6-player keyboard playtest finding)  
**Decision:** Route all server-generated event log messages through i18n localization contract. No English system messages in Dutch UI.  
**Rationale:** Mixed-language event log breaks i18n polish and player immersion.  
**Evidence:** 6-player session (NL locale): Event log shows "Alliance Alpha HQ was auto-assigned at (-4, 4)." in English despite UI language set to Dutch.

### 12. Troop pickup success feedback accuracy (proposed)
**Status:** Pending  
**Agent:** steen (6-player keyboard playtest finding)  
**Decision:** Return explicit blocked status when pickup is rejected by single-source constraint. Do not return `success: true` when no state change occurred. Align UI + API success semantics.  
**Rationale:** Action feedback must match actual game outcome; prevents false-success confusion.  
**Evidence:** 6-player session: Pickup from second hex while carrying troops from first returned `success: true` with unchanged `carriedTroopsAfter`; silent block with false positive.

### 13. Modal stacking prevention (proposed)
**Status:** Pending  
**Agent:** steen (6-player keyboard playtest finding)  
**Decision:** Implement queue/replace modal strategy for action outcome dialogs. Do not stack "Territory captured" + "defeat" modals simultaneously.  
**Rationale:** Overlapping text makes dialogs unreadable; unclear which outcome applies to which action.  
**Evidence:** 6-player session: "Gebied Veroverd!" and "Neerlaag" dialogs appeared simultaneously without clearing previous modals.

### 14. Rules overlay auto-dismiss or skip option (proposed)
**Status:** Pending  
**Agent:** steen (6-player keyboard playtest finding)  
**Decision:** Make rules help overlay non-blocking, skippable, or auto-dismiss after 30s. Current behavior blocks players from observing first-turn combat in real-time.  
**Rationale:** New players learn-by-watching; overlay blocks initial strategic observation.  
**Evidence:** 6-player session: steenp4/steenp5 had to dismiss help overlay on game entry before they could observe ongoing alliance combat.

### 15. Action feedback explicit error signaling (2026-03-22)
**Status:** Implemented  
**Agent:** vermeer  
**Decision:** All gameplay action helpers that call `resolveActionCoordinates()` must call `useInfoLedgeStore.push()` with `severity: 'error'` before silent return. No null-position action fails silently.  
**Rationale:** Silent action failures (button press → nothing happens) destroy player trust. Error-ledge is visible, already styled for error severity, and auto-dismisses.  
**Implementation:** Centralized pattern in `useGameActionsGameplay.ts` with `playSound('error')` and `t('errors.noPositionForAction')` i18n key (EN/NL).  
**Related:** Vermeer's GuidanceBanner.tsx + frontend build passed.

### 16. HQ event/state mismatch consistency (2026-03-22, P0 Critical)
**Status:** Implemented  
**Agent:** de-ruyter-p0-fixes  
**Change:** `AllianceConfigService.SetAllianceHQ` now validates that the HQ tile is owned by the selected alliance, then appends an `AllianceHQAssigned` event after state mutation using identical `(q,r)` values written to `alliance.HQHexQ/HQHexR`.  
**Rationale:** Event log and game state must be consistent; prevents misleading event history when invalid tiles are selected. Manual HQ assignment was already accepted by backend; the fix ensures atomic state + event transition.  
**Verification:** Tests confirm success-path event payload and rejection of non-owned tile assignments.  
**SignalR Impact:** None — no message format changes.

### 17. Defender combat feedback parity (2026-03-22, P0 Critical)
**Status:** Implemented  
**Agent:** vermeer-p0-fixes  
**Change:** `useSignalRHandlers.ts` `onStateUpdated` event log loop now checks for `CombatRepelled` entries where `targetPlayerId === myUserId` and pushes info-ledge toast `game.toast.attackRepelledYou`. Also updated `game.toast.tileLost` to include hex coordinates.  
**Rationale:** Defender should receive equivalent combat outcome feedback as attacker. Previously: attacker got full dialog, defender got nothing when repelling attack. Backend already emits `CombatRepelled` event; frontend just needed to consume it.  
**i18n keys added:** `game.toast.attackRepelledYou` (EN/NL), `game.toast.tileLost` (updated to include `{{q}},{{r}}`).  
**SignalR Impact:** None — consumes existing event types.

### 18. Show all alliances in player HUD (2026-03-22, P0 Critical)
**Status:** Implemented  
**Agent:** vermeer-p0-fixes  
**Change:** Removed `if (alliancePlayers.length === 0) return null;` guard in `PlayingHud.tsx` players modal. All alliances from `state.alliances` now always render (name, color, territory count). Added fallback for orphan `allianceId` references.  
**Rationale:** Transient state mismatches (ID mismatch, stale snapshot) were causing alliances to disappear entirely. Showing empty alliance sections is safe UI and prevents hidden strategic information in multi-alliance matches.  
**SignalR Impact:** None — state consumption pattern only.

### 19. Troop pickup carrying total accuracy (2026-03-22, P1 Major)
**Status:** Implemented  
**Agent:** vermeer-p0-fixes  
**Change:** `useGameActionsGameplay.ts` `handleConfirmPickup` now reads `previousCarried` via `useGameStore.getState()` inside `.then()` callback, computes optimistic `newCarried`, passes `carrying: newCarried` to toast. Updated i18n keys: `game.mapFeedback.pickedUp_one/other` → `'+{{count}} troop(s) picked up · Carrying: {{carrying}}'` (EN + NL).  
**Rationale:** Success feedback was incomplete (showed pickup count but not final total). Store read at callback-execution time is authoritative (avoids stale closure). Optimistic feedback is corrected by next `StateUpdated`.  
**Pattern:** For stale-closure-safe reads in async callbacks, use `useGameStore.getState()` rather than closure-captured props.  
**SignalR Impact:** None — frontend-only feedback enhancement.

### 20. Q/E Heading Always-On + Dutch Event Log Localisation (2026-03-22, P1 Major)
**Status:** Implemented  
**Agent:** vermeer-p1-fixes  
**Change:** (a) Removed `isCompassRotationEnabled` guard from Q/E keydown effect in `GameMap.tsx`; heading adjustment now always active in Playing phase. Used `debugCompassHeadingRef` (ref-tracked state) to avoid stale closures. Q/E writes to both `debugCompassHeading` (visual) and `uiStore.debugHeading` (backend via `currentHeadingRef → UpdatePlayerLocation`). (b) Added 28 case blocks to `gameLogFormat.ts` with NL i18n keys for structured event types (CombatRepelled, HQCaptured, CommandoRaidSuccess, CommandoRaidFailed, RallyPointResolved, FortConstructionInvalidated, FortBuilt, SabotageInvalidated, SabotageComplete, DemolishInvalidated, DemolishCompleted, GameAreaUpdated, AlliancesConfigured, PlayersDistributed, AllianceStartingTileAssigned, AllianceHQAssigned, AllianceHQAutoAssigned, BeaconActivated, CommandoRaidStarted, TacticalStrikeActivated, RallyPointActivated, FortConstructionStarted, FortConstructionCancelled, SabotageStarted, SabotageCancelled, DemolishStarted, DemolishCancelled).  
**Rationale:** (a) Heading adjustment should always respond to keyboard input; compass rotation display is opt-in, but heading control is baseline. (b) All structured event types now localize properly; HostAction, RandomEvent, HostMessage intentionally fallthrough to raw message (server-generated content).  
**Verification:** lint + build clean.  
**SignalR Impact:** None — frontend consumption only.

### 21. Scout-Gated Alliance Intel Model (2026-03-22, Design Phase)
**Status:** Implemented  
**Agent:** vondel-intel-design (design), de-ruyter-visibility (implementation)  
**Design Decision:** Five options evaluated: Open Skies, Dark Map, Proximity Radio, Fading Memory, Eyes of the Scout. Selected **Eyes of the Scout** with always-fresh alliance borders.  
**Implementation:** Updated `VisibilityService` in backend:
- **Personal-Only Beacon Sector:** `ComputeVisibleHexKeys` adds beacon sector keys only when viewing player has `IsBeacon == true`. Teammates no longer see allied beacon sectors automatically.
- **Always-Fresh Alliance-Border Visibility:** Added border-intel source that scans all alliance-owned tiles and marks enemy-owned neighbors as visible. These border hostiles refresh with every fog-of-war update.
- **Auto-Share Filter:** `UpdateMemory` computes `beaconSectorKeys` for the viewer and excludes them from auto-share gate (`hostilesSharedToAlliance = visibleHostileKeys - beaconSectorKeys`). Border and proximity hostiles still auto-share.
- **Edge Case Guard:** Proximity-hostile skips when player current hex is null or `(0,0)`.
**Test Updates:** `VisibilityServiceTests` updated to reflect new model; 289 total tests, 288 passed, 1 skipped.  
**Rationale:** Preserves scout gameplay autonomy (beacon intel is scout-controlled) while maintaining minimum alliance coordination (border intel always visible/fresh). Beacon intel requires explicit Share action.  
**SignalR Impact:** None — visibility layer only; no message format changes.

### 22. Amber Archive — Staleness Visual for Enemy Hex Tiles (2026-03-22, Implementation)
**Status:** Implemented  
**Agent:** vermeer-amber-archive (implementation), hals-staleness-design (design), vondel-staleness-reqs (requirements)  
**Design Proposal:** Hals proposed 5 options for staleness differentiation; team selected Amber Archive (cool cyan → warm amber shift).  
**Requirements:** Vondel specified 3-tier model: **live** (no treatment), **fading** (0–120s), **stale** (120s+). Threshold: 120s hardcoded in `tricorderTileState.ts`.  
**Implementation:**  
- **Frontend field mapping:** Backend `HexCell.LastSeenAt: DateTime?` → frontend `HexCell.lastSeenAt: string | undefined`  
- **Files changed:** (1) `tricorderTileState.ts` — added missing `computeStalenessTier()` function; (2) `tricorder-map.css` — replaced `.hex-remembered` flat desaturate with `.hex-fading`/`.hex-stale` amber tiers; (3) `HexTile.tsx` — stalenessTier-driven CSS classes + amberStroke SVG stroke color (opacity 0.25 fading, 0.5 stale); (4) `TileInfoCard.tsx` — amber header on stale/fading cards, ARCHIVED pill (amber badge), `📡 Last seen: Xm ago` row using formatRelativeTime(); (5) `i18n/{en,nl}.ts` — added `archived` and `lastSeen` keys  
- **Gating:** Amber treatment only applies to remembered enemy tiles (`visibilityTier === 'Remembered'`); own/ally tiles always remain Visible.  
- **Missing timestamp fallback:** When `lastSeenAt` absent, returns `'stale'` (no fading tier) — matches spec.  
**Build:** lint (0 errors) + tsc -b + vite build clean.  
**Rationale:** Visually distinguishes fresh intel from memory. Amber glow matches tricorder aesthetic. 3-tier model provides clear temporal feedback without clutter.  
**SignalR Impact:** None — data field already present, frontend renders optionally.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
