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

### 23. Scout Beacon Always-On + Share Intel Ability (2026-03-23)
**Status:** Implemented  
**Lead:** Rembrandt  
**Backend:** De Ruyter  
**Frontend:** Vermeer  

**Summary:** For Scout players in role-enabled games, the Beacon is no longer a manual toggle — it activates automatically when the Scout has a valid GPS location. The Scout's explicit ability action is **Share Intel** (60s cooldown), which broadcasts the current beacon cone's hex intel to all alliance members.

**Backend Changes:**
- **`GameplayService.UpdatePlayerLocation`** — Auto-activates beacon for Scouts with roles enabled: if `PlayerRolesEnabled && player.Role == Scout && lat/lng valid` → set `player.IsBeacon = true` before updating beacon fields.
- **`AbilityService.ActivateBeacon`** — Guard returns error for role-enabled Scouts: "Scout beacon activates automatically via location update."
- **`AbilityService.DeactivateBeacon`** — Guard returns error for role-enabled Scouts: "Scout beacon cannot be manually deactivated."
- **`AbilityService.ShareBeaconIntel`** — Server-computes beacon cone via `VisibilityService.ComputeBeaconSectorKeys` (ignores client-supplied hex list), enforces 60s cooldown via `PlayerDto.ShareIntelCooldownUntil`, writes remembered intel for alliance members.
- **Model:** Added `PlayerDto.ShareIntelCooldownUntil` field. No changes to existing beacon fields.
- **Validation:** `dotnet build --configuration Debug` ✅, `dotnet test` ✅ (295 total, 294 passed, 1 skipped).

**Frontend Changes:**
- **`AbilityBar.tsx`** — Role-aware split: non-role mode keeps toggle; Scout role mode shows "Share Intel" pill.
- **`BeaconCard.tsx`** — For Scouts: removed activate/deactivate buttons; "Share Intel" CTA sole action (non-role unchanged).
- **`ShareIntelCard.tsx`** — New Scout-specific ability card with cooldown timer and "Share Intel" button.
- **`types/abilities.ts`** — Added `'shareIntel'` to `AbilityKey` union.
- **`types/game.ts`** — Added `shareIntelCooldownUntil?: string` to Player interface.
- **`useGameActionsAbilities.ts`** — `handleShareBeaconIntel` calls `invoke('ShareBeaconIntel')` with no args.
- **i18n:** Added `abilities.beacon.alwaysOn`, `abilities.beacon.waitingForGps`, `abilities.shareIntel.*` keys (EN + NL).
- **Concurrent Fixes:**
  - **Beacon cone rendering:** Fixed invisible tiles (`hex-hidden-hostile` guard), `?` badge (`strengthUnknown` reordering), TileInfoCard "Unknown territory" (added `isInBeaconCone` checks).
  - **Instant reveal:** Optimistic activation (local state before server call) + revert on failure. `AbilityOverlayLayer` checks both `myPlayer?.isBeacon` and `abilityUi.activeAbility === 'beacon'`.
  - **Pixel radius:** Fixed microscopic beacon sector arc; uses `roomHexToLatLng` + `map.latLngToLayerPoint` for accurate scaling (was dividing `tileSizeMeters` by 111320).
- **Validation:** `npm run lint` ✅ (0 errors), `npm run build` ✅ (tsc -b + vite clean).

**Rationale:** Scout beacon as a passive role trait simplifies gameplay: always-on reveals are Scout's team contribution, explicit Share Intel actions create clear coordination signal. Centralizing cone computation on server eliminates client drift. Non-role games fully backward compatible.

**Risks:** Scout with GPS denied stays inactive (existing issue, not worsened). Cold-start heading may be null; cone defaults to 0° (north).

**SignalR Impact:** None — no message format changes.

### 24. Gate beacon and shareIntel behind Scout role + rolesEnabled (2026-03-23)
**Status:** Implemented  
**Agent:** Vermeer  
**Change:** `PlayerHUD.tsx` moved both `beacon` and `shareIntel` ability pushes inside the `rolesEnabled && player?.role === 'Scout'` guard. Removed the erroneous non-Scout beacon block that was unconditionally pushing beacon toggle for non-Scout players.  
**Rationale:** Beacon and shareIntel are Scout-exclusive abilities. Non-Scout players (Commander, Engineer) should never see or invoke these abilities. Mirrors existing Commander/Engineer role-gate pattern.  
**Build:** lint + tsc -b + vite clean.  
**SignalR Impact:** None — frontend-only UI gating.

### 25. Architecture: Client-Side Visibility Derivation with Server Fallback (2026-03-23)
**Status:** Implemented  
**Lead:** Rembrandt  
**Backend:** De Ruyter  
**Frontend:** Vermeer  

**Problem:** Player movement triggered full state broadcasts with O(N×M) visibility recomputation, causing 750ms+ delay for tile reveals.

**Decision:** Generalize the proven beacon cone pattern: frontend derives visibility locally from player positions it already has, with server's `VisibilityTier` as fallback for edge cases.

**Backend Changes:**
- Stop setting `gridChanged = true` for `LastVisitedAt` metadata updates in `GameplayService.cs` — this value is server-side only (used by `TroopRegenerationService` for decay)
- In `GameHub.Gameplay.cs`, separate broadcast logic: when only `movedToDifferentHex = true` (no significant grid changes), send lightweight `PlayersMoved` instead of full `BroadcastState`
- Full `BroadcastState` still fires for actual game mutations (combat, territory claims, etc.)
- Validation: `dotnet build` ✅, `dotnet test` ✅ (295 total, 294 passed, 1 skipped)

**Frontend Changes:**
- Created `src/utils/localVisibility.ts` — `isLocallyVisible()` utility that replicates backend's `VisibilityService.ComputeVisibleHexKeys` logic
- Modified `tricorderTileState.ts` to check local visibility first, falling back to server's `VisibilityTier` for Remembered/Hidden tiers
- Updated `HexTile.tsx` and `TileInfoCard.tsx` to compute and pass `alliedPlayerHexKeys` and `allianceOwnedHexKeys` to tile state derivation
- Validation: `npm run lint` ✅, `npm run build` ✅, TypeScript strict mode ✅

**Architectural Principles Affirmed:**
- Server remains source of truth for all game state mutations
- Frontend derives display state locally from data it already possesses
- Server's projection remains authoritative for edge cases (remembered intel, alliance-shared visibility)
- No new data sent to clients — raw tile data already present; frontend just computes `VisibilityTier` locally
- Fully backward compatible — no SignalR protocol changes

**User Experience Impact:**
- Tiles reveal instantly when player moves adjacent (no round-trip delay)
- Seamless integration with `PlayersMoved` lightweight events
- Server load unchanged (still computes and sends visibility for authoritative broadcasts)

**Risk Mitigation:**
- Client-server position desync acceptable: next `StateUpdated` reconciles; raw data already present, no info leak
- Alliance-shared remembered data: server's Remembered tier used as fallback
- Reconnection: first `StateUpdated` provides full state
- Event log filtering: still handled server-side

**SignalR Impact:** None — `PlayersMoved` event already existed; only reduced unnecessary `BroadcastState` calls.

### 24. Game Manual: Comprehensive player-facing documentation (2026-03-23 to 2026-03-24)

**Status:** Completed & Approved  
**Deliverable:** `docs/game-manual.md` (6,615 words, 13 sections)

**Scope:** 
- All 3 player roles (Scout, Commander, Engineer) with passive/active ability details
- All 9 abilities with exact mechanics, cooldowns, ranges, and tactical guidance
- Both game modes: Alliances (room-based, real-time) and Free-for-All (persistent global map)
- Complete player journey: setup wizard → lobby → gameplay → win conditions
- Fog of War & visibility system
- Combat modes (Classic, Balanced, Siege) with damage/defense formulas
- Troop regeneration mechanics (+1 base, +3 presence, 0 hostile/sabotage, -1 decay)
- HQ capture mechanics (40% unlock threshold, 5-min claim freeze, Commando Raid only)

**Quality Gates:** 3-pass review process
- **Pass 1 (Rembrandt):** Identified 5 critical + 2 minor errors; Vondel applied 7 fixes ✅
- **Pass 2 (Rembrandt):** Verified Vondel's 7 fixes; found 2 new critical errors; De Ruyter applied 2 fixes ✅
- **Pass 3 (Rembrandt):** Verified De Ruyter's 2 fixes; found 1 final consistency error; Coordinator applied 1-word fix ✅

**Key Corrections Applied:**
| # | Error | Fix |
|---|-------|-----|
| 1 | FFA "advantage" mechanic (roll 2d6 take highest) | Single d6 + 1 if attacker has more troops |
| 2 | FFA ties go to attacker (≥ defender) | Ties go to defender (strictly greater) |
| 3 | Fog of War is optional | Always active; host configures EnemySightingMemory duration |
| 4 | HQ claim freeze ends on recapture | Runs full 5 minutes regardless |
| 5 | HQ capturable by direct combat | HQ hexes immune — Commando Raid only |
| 6 | Commando Raid success: "≥50% of alliance" | 2 members minimum + outnumber defenders |
| 7 | Demolish initiation: "adjacent to fort" | Standing ON the fort hex |
| 8 | Enemy sighting memory range: "0–300s" | Actual options: 0, 15, 30, 60, 120s |
| 9 | Elimination tiebreaker: "prior territory" | Current territory count; alphabetical if tied |
| 10 | Engineer role summary: "adjacent to fort" | Standing ON the fort hex |

**Research Foundations:** 
- Vondel (game design): 29,461-word analysis of roles, abilities, mechanics, fog of war
- De Ruyter (backend): 28,590-word extraction of authoritative mechanical values from C# code
- Vermeer (frontend): 32,715-word documentation of player UX journey, ability cards, setup wizard

**Authorship:** Erasmus synthesized three research streams into coherent narrative

**Decision:** Multi-pass review structure with rotating correction agents (Vondel → De Ruyter → Coordinator) prevented groupthink, enabled fresh perspective on each cycle, and caught all cascading errors. Final manual verified against backend code and frontend implementation.

---

### 26. Platform Analysis: Binding Architectural Findings & Roadmap (2026-03-25)

**Status:** Documented (6 independent domain experts)  
**Lead:** Rembrandt  
**Team:** Vermeer, De Ruyter, Grotius, Huygens, Tasman, Spinoza

**Scope:** Comprehensive six-domain platform analysis conducted March 22–25, 2026. All 40 KB of backend C#, 30 KB of frontend TypeScript, infrastructure, and CI/CD reviewed. Six independent read-only analyses cross-referenced for binding findings.

**Key Findings:**

#### Critical Issues (Fix Immediately, This Week)

1. **Rate Limiter Misconfiguration** (De Ruyter, Grotius, Huygens confirmed)
   - Current: `Window = 1s, PermitLimit = 60` = **3,600 req/min** (breaks brute-force protection)
   - Intended: 10 req/min per documented design
   - Fix: `Window = TimeSpan.FromMinutes(1), PermitLimit = 10` (1-line change)
   - Impact: CVSS 5.3 (Medium severity); auth endpoints unprotected

2. **EF Core Shadow Foreign Key Bug** (De Ruyter, Huygens confirmed)
   - `GlobalHex.Owner` always returns null
   - Root cause: Missing `.HasForeignKey(h => h.OwnerUserId)` in `AppDbContext`
   - Consequence: FFA ownership display broken; `OwnerUserId` column ignored
   - Fix: Add FK configuration + migration to drop shadow `OwnerId` column
   - Impact: Blocks FFA mode ownership feature

3. **Database Engine Documentation Mismatch** (Huygens)
   - Actual: SQL Server 2022 via `UseSqlServer()`
   - Documented: PostgreSQL (CLAUDE.md, README, .env)
   - Consequence: Developer onboarding broken; environment incompatibilities
   - Fix: Update all documentation, .env templates

#### Binding Cross-Domain Findings

- **GameHub zero test coverage** (De Ruyter, Spinoza critical): 2160 lines, 0 tests; single largest regression risk
- **Azure SignalR Service not provisioned** (Tasman): blocking horizontal scale-out; in-process rooms not shared across instances
- **Service concentration risks** (De Ruyter detailed, all confirmed): GameplayService (1440 lines), AbilityService (1331 lines), PlayingHud.tsx (1018 lines), App.tsx (721 lines + 26 subscriptions)

#### Architecture Strengths (Cross-Confirmed)

- GameService thin-facade pattern
- eventsRef stale-closure fix preventing React/SignalR closure bugs
- Two-level concurrency model (ConcurrentDictionary + lock)
- Server-is-source-of-truth discipline (no client mutation)
- Hub input validation suite (ValidateCoordRange, ValidateLatLng, etc.)
- 276 passing backend unit tests with GameStateBuilder fixture
- Zero raw SQL (100% EF Core LINQ)

#### Phased Roadmap

**Immediate (This Week):**
- Rate limiter fix (De Ruyter + Grotius confirmation)
- EF Core FK fix (De Ruyter + Huygens confirmation)
- Database docs update (Huygens)

**Phase 1 (1 Sprint):**
- CSP header middleware (Grotius)
- Database resilience: `EnableRetryOnFailure(5)` (Huygens + Tasman)
- Transparent Data Encryption on SQL Server (Tasman)

**Phase 2 (2–3 Sprints):**
- Service decomposition: AbilityService by role (De Ruyter lead)
- GameHub integration tests (Spinoza + De Ruyter)
- Frontend test infrastructure: Vitest (Spinoza + Vermeer)
- JWT revocation blocklist (Grotius + De Ruyter)
- Account lockout after failed logins (Grotius + De Ruyter)
- Frontend HUD split: PlayingHud into AbilityPanelArea, HudInfoArea, ModalArea (Vermeer)
- Optimize useSignalRHandlers allocation (Vermeer)
- Extract useAppOrchestrator hook (Vermeer)

**Phase 3 (Infrastructure Sprint):**
- Azure SignalR Service provisioning (Tasman lead)
- Key Vault integration for secrets (Tasman + Grotius)
- SQL Server geo-replication for HA/DR (Tasman + Huygens)

**Output:** `docs/analysis/platform-analysis-2026-03-25.md` (32 KB consolidated reference document)

**Decisions Triggered:**
- Rate limiter + EF Core FK fixes → approved for immediate implementation
- Service split strategy → De Ruyter proposes, Rembrandt approves
- Frontend HUD split → Vermeer proposes, Rembrandt approves
- Azure SignalR provisioning → Tasman produces Bicep diff, Rembrandt approves before deploy

---

### 27. Frontend Bug Fix: Adjacent Enemy Tiles Troops Not Revealed on PlayersMoved (2026-03-25)

**Status:** Fix Specification Ready  
**Lead:** Rembrandt (Root Cause Analysis)  
**Implementation:** Vermeer (Frontend)  
**Rationale:** Platform analysis identified visibility bug during consolidation

**Root Cause:** `getStrengthUnknownState` in `frontend/landgrab-ui/src/components/map/tricorderTileState.ts` reads stale `cell.visibilityTier` from last `StateUpdated` instead of locally-derived `visibilityTierEarly` value.

**Bug Symptom:** 
- When player moves to hex adjacent to enemy territory, troop count shows as "?" (strengthUnknown)
- Backend correctly stamps visibility, frontend locally computes it correctly
- But render gate uses stale server data, not locally-derived value
- Issue resolves only on next full `StateUpdated`

**Fix (Two Changes):**

1. **In `deriveTileState` (~line 132):** Pass locally-derived visibility tier to function
   ```typescript
   const strengthUnknown = !isInBeaconConeEarly && getStrengthUnknownState({
     cell,
     baseState,
     visibilityTier: visibilityTierEarly,  // Add this line
   });
   ```

2. **In `getStrengthUnknownState` (~line 355):** Update signature and use passed tier
   ```typescript
   function getStrengthUnknownState({
     cell,
     baseState,
     visibilityTier,  // Add to signature
   }: {
     cell: HexCell | undefined;
     baseState: TricorderTileState['baseState'];
     visibilityTier: 'Visible' | 'Remembered' | 'Hidden';  // Add type
   }): boolean {
     if (baseState !== 'enemy' || !cell) {
       return false;
     }
     return visibilityTier === 'Hidden';  // Use derived value instead of cell.visibilityTier
   }
   ```

**Validation:**
- `npm run lint` must pass (TypeScript strict, no unused params)
- `npm run build` must pass (tsc -b clean)
- Smoke test: Move to adjacent enemy tile → troop badge appears immediately

**Impact:** 1 file, 1 function + 1 call site. No store changes, no SignalR changes, no backend changes.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

### 28. Abstract Base Class over Pure Interface (2026-03-25)
**Status:** Binding  
**Lead:** Rembrandt  
**Decision:** `RoleAbilityServiceBase` is an `abstract class`, not a pure interface. A thin `IRoleAbilityService` marker interface is defined but declares no methods.  
**Rationale:** ~15 private static helpers in `AbilityService` (`ResolveClosestAdjacentHex`, `TryGetCurrentHex`, `HasActiveSabotage`, etc.) need to be shared across all concrete services. An interface cannot carry these. A pure interface with an `Execute()` contract is unworkable because each ability has a unique method signature.  
**Impact:** All concrete services inherit from `RoleAbilityServiceBase` and implement `IRoleAbilityService`. DI can still enumerate all role services via `IEnumerable<IRoleAbilityService>` if needed in future.

### 29. Explicit Delegation in GameService (No Runtime Role Dictionary) (2026-03-25)
**Status:** Binding  
**Lead:** Rembrandt  
**Decision:** `GameService` delegates to named service instances explicitly: `_commanderService.ActivateTacticalStrike(…)`. There is **no** `Dictionary<PlayerRole, IRoleAbilityService>` runtime lookup.  
**Rationale:** Runtime lookup requires a polymorphic `Execute(method, args)` pattern which is not type-safe and would require reflection or discriminated unions across heterogeneous return types. Explicit delegation is verifiable at compile time, instantly navigable in an IDE, and matches the existing `GameService` pattern for all other domain services.  
**Impact:** Adding a new ability = 2 new lines in `GameService` (new delegation + existing constructor param). No architectural change needed.

### 30. Four Concrete Services (Commander, Scout, Engineer, Shared) (2026-03-25)
**Status:** Binding  
**Lead:** Rembrandt  
**Decision:** Abilities are split into four services. `SharedAbilityService` is not a role but holds role-agnostic abilities (TroopTransfer, FieldBattle) that cannot meaningfully belong to any one role class.  
**Rationale:** Forcing TroopTransfer and FieldBattle into a role service would misrepresent their design intent and create incorrect role-guard coupling. A `SharedAbilityService` provides a natural home for future role-agnostic abilities.  
**Impact:** `GameService` has four constructor params replacing the single `AbilityService`. All singletons.

### 31. RoleProgressService Extracted from GameplayService (2026-03-25)
**Status:** Binding  
**Lead:** Rembrandt  
**Decision:** `UpdateSabotageProgress`, `UpdateDemolishProgress`, and fort-construction-invalidation logic are extracted to a new singleton `RoleProgressService`. `GameplayService` depends on it; `EngineerAbilityService` also depends on it.  
**Rationale:** This logic is movement-tick–driven (called from `GameplayService.UpdatePlayerLocation`) but semantically belongs to the Engineer role domain. Keeping it in `GameplayService` would mean Engineer-specific logic persists in a non-Engineer service after the split, violating SRP. A shared service avoids duplication while keeping the movement-tick call site clean.  
**Impact:** New `RoleProgressService` singleton. `GameplayService` constructor adds one parameter. `EngineerAbilityService` may call `RoleProgressService` methods at ability-start time to validate preconditions.

### 32. Frontend Registry is Metadata-Only; Card Rendering Stays Explicit (2026-03-25)
**Status:** Binding  
**Lead:** Rembrandt  
**Decision:** `abilityRegistry` stores metadata (roles, hubMethod, titleKey, mapFocusPreset, Card component reference). `PlayingHud` renders `<entry.Card myUserId={…} invoke={…} />` for the active ability. Cards are static imports — not dynamic/lazy loaded from the registry.  
**Rationale:** Dynamic registry-driven card loading would lose TypeScript static analysis on props. Since `AbilityCardProps` is a simple interface (`myUserId` + `invoke`), static imports with a registry lookup is type-safe and sufficient. Lazy loading is an independent optimization concern.  
**Impact:** `PlayingHud`'s 13-branch ability card if/else chain collapses to a single `const entry = abilityRegistry[activeAbility]` + render. All per-ability callback props removed from `PlayingHud`'s interface; single `invoke` prop added.

### 33. Standard AbilityCardProps Contract (2026-03-25)
**Status:** Binding  
**Lead:** Rembrandt  
**Decision:** All ability card components accept `{ myUserId: string; invoke: InvokeFn | null }`. Cards call hub methods directly via `invoke`. They continue to read game state from Zustand stores.  
**Rationale:** Cards already use Zustand stores for state — they are not truly "dumb" components. The only thing they need injected is `invoke` to dispatch SignalR actions. Standardizing on this minimal interface enables the registry pattern without redesigning the card component layer.  
**Impact:** Each existing card component needs a one-time update to replace callback props with `invoke(hubMethod, …)` calls. New cards implement `AbilityCardProps` directly and need no wiring in `App.tsx` or `GameView.tsx`.

### 34. useGameActionsAbilities Reduced via makeHandler Factory (2026-03-25)
**Status:** Binding  
**Lead:** Rembrandt  
**Decision:** A `makeHandler` factory function replaces the 19 duplicated `useCallback + try/catch` blocks. The public hook API surface is preserved unchanged.  
**Rationale:** The duplication is pure noise — each block is identical except for the hub method name and fallback value. The factory makes this structural pattern explicit and removes the risk of inconsistent error handling in one-off blocks. Existing consumers are unaffected.  
**Impact:** `useGameActionsAbilities` shrinks from ~290 lines to ~30. The hook still returns the same named handler functions.


### 35. Enemy Tile Sighting Memory Persistence (2026-03-26)
**Status:** Implemented  
**Lead:** Rembrandt  
**Backend:** De Ruyter  
**Frontend:** Vermeer  
**Decision:** Enforce memory-window expiry at the authoritative projection layer (backend `VisibilityService.BuildStateForViewer`). Frontend adds defensive Hidden→Remembered upgrade safety net and dynamic staleness threshold based on configured `enemySightingMemorySeconds`.

**Problem:** Enemy-owned tiles dropped to `Hidden` immediately after player moved away, despite configured sighting memory window. Tiles failed to persist in `Remembered` state with amber fading overlay.

**Root Causes:**
1. **Backend:** `BroadcastPlayersPerViewer` skipped `UpdateMemory` call on movement-only broadcasts, so sightings were never recorded in `RememberedHexes`.
2. **Frontend:** `serverTier` held pre-approach tier (Hidden) + hardcoded 120s staleness threshold ignored game config.

**Implementation:**
- **Backend:** Added memory cutoff evaluation in `BuildStateForViewer(...)`. Keep remembered tier only while `RememberedHex.SeenAt >= cutoff`. Purge expired entries during projection. If memory disabled (0s), immediately hide and purge.
- **Frontend:** Local sighting memory safety net in `HexTile.tsx` (useRef-based ref mutation); upgrades Hidden→Remembered when `lastSeenAt` within window. Replaced hardcoded 120s with dynamic `memorySeconds * 1000` in `computeStalenessTier`.

**Rationale:** 
- Backend: Projection is the authoritative location for applying game config constraints; enables consistent TTL enforcement across all viewers.
- Frontend: Local memory bridges gap between `PlayersMoved` and next `StateUpdated`; defensive measure with zero impact when backend works correctly.

**Files Changed:** 
- Backend: `Services/VisibilityService.cs`; added tests in `VisibilityServiceTests.cs`
- Frontend: `components/map/tricorderTileState.ts`

**Backward Compatibility:** Yes. Pre-existing game saves unaffected; config-driven behavior applies prospectively.

**SignalR Impact:** None — no message format changes.

### 36. CombatResult fan-out mutation risk (2026-03-27)
**Status:** Implemented  
**Agent:** de-ruyter-bug-hunt  
**Change:** `GameHub.Gameplay.PlaceTroops` now uses `CloneCombatResultForRecipient(...)` to create dedicated attacker/defender payload objects rather than reusing a single mutable `CombatResult`.  
**Rationale:** Mutable object reuse across recipient sends is fragile; although sends are awaited, future async/serialization behavior changes could leak incorrect role context. Per-recipient clones guarantee deterministic `IsAttacker` value per recipient.  
**Impact:** Defender receives `IsAttacker=false` and attacker receives `IsAttacker=true` with absolute certainty.  
**Files Changed:** `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`  
**SignalR Impact:** None — no message format changes.

### 37. Hub methods must send explicit errors on failure paths (2026-03-27)
**Status:** Implemented  
**Agent:** de-ruyter-bug-hunt  
**Change:** `UpdatePlayerPosition`, `JoinFieldBattle`, and `FleeBattle` now send explicit `SendError(...)` responses instead of silent early returns on error/null state paths.  
**Rationale:** Silent failures create client desync and no actionable error telemetry. Explicit error signals enable better client feedback and easier ops debugging.  
**Impact:** Better visibility into why actions fail; clients receive diagnostic information rather than false success silence.  
**Files Changed:** `backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs`  
**SignalR Impact:** Error responses are advisory; no schema changes.

### 38. GameDynamics end-to-end handling verified correct (2026-03-27)
**Status:** Verified (no change)  
**Agent:** de-ruyter-bug-hunt  
**Finding:** `GameDynamics` fields in model, `SanitizeGameDynamics`, and `GameStateCommon.SnapshotState` are aligned; `FieldBattleEnabled` and `FieldBattleResolutionMode` are copied/sanitized/snapshotted correctly across all code paths.  
**Decision:** No fix required; implementation is consistent.  
**Files Analyzed:** `Models/GameDynamics.cs`, `Services/GameStateService.cs`, `Hubs/GameHub.cs`  
**SignalR Impact:** None — validation only.

### 39. GlobalHex Owner shadow-FK bug already resolved (2026-03-27)
**Status:** Verified (historical)  
**Agent:** de-ruyter-bug-hunt  
**Finding:** Migration `20260325103854_FixGlobalHexOwnerFK` already fixed the shadow-FK issue. Current model uses concrete `OwnerUserId` FK (`HexCell.cs` + `AppDbContext`). Reads include `.Include(h => h.Owner)` in `GlobalMapService`.  
**Decision:** No additional backend fix needed; issue is historical and already resolved.  
**Files Analyzed:** `Models/HexCell.cs`, `Data/AppDbContext.cs`, `Services/GlobalMapService.cs`, `Migrations/`  
**SignalR Impact:** None — issue resolved.

### 40. Token blocklist persistence remains a known security gap (2026-03-27)
**Status:** Documented, Deferred  
**Agent:** de-ruyter-bug-hunt  
**Issue:** `TokenBlocklist` is in-memory singleton; revocations are cleared on restart. JWT middleware checks revoked `jti`, but only within process lifetime.  
**Risk:** Restart re-validates previously logged-out tokens until `exp` claim expires.  
**Decision:** Keep as-is for this pass and treat as backlog security item. Requires architecture change (e.g., Redis/distributed cache) to fix properly.  
**Impact:** Security gap acknowledged; mitigation deferred to future sprint.  
**SignalR Impact:** None — affects token validation, not messaging.

### 41. VisibilityService test fixture corrected (2026-03-27)
**Status:** Implemented  
**Agent:** spinoza-visibility-bug  
**Change:** `VisibilityServiceTests.BuildStateForViewer_WhenBeaconSectorSeesHostile_SetsLastSeenAndKnownFields` moved player from (0,0) to (-4,0) in second scenario to ensure hex (1,0) is truly out of normal sight range (VisibilityRadius=1).  
**Root Cause:** Test expected `Remembered` tier but received `Visible` because player remained at (0,0), keeping hex (1,0) in visibility range.  
**Rationale:** Test fixture must place viewer outside normal range to properly validate memory-based visibility.  
**Impact:** Test now correctly validates visibility tier transitions and memory persistence.  
**Files Changed:** `backend/Landgrab.Tests/Services/VisibilityServiceTests.cs`  
**Backward Compatibility:** Yes — test fix only.

### 42. GameHub validation test suite added (2026-03-27)
**Status:** Implemented  
**Agent:** spinoza-visibility-bug  
**Change:** Created new test file `GameHubTests.cs` with 5 comprehensive tests for `SanitizeGameDynamics` private method: field preservation, beacon sector angle clamping [1,360], enemy sighting memory minimum (15s), invalid combat mode reset, and invalid field-battle resolution mode reset.  
**Rationale:** Private method validation using reflection ensures configuration constraints are enforced and future changes are caught by tests.  
**Impact:** Hub validation logic is now testable and verified. New tests pass; total test count: 353 (352 passed, 1 skipped).  
**Files Changed:** `backend/Landgrab.Tests/Hubs/GameHubTests.cs` (new file)  
**Backward Compatibility:** Yes — tests only.

### 43. Frontend combat calculations and closure patterns verified correct (2026-03-27)
**Status:** Verified (no change)  
**Agent:** vermeer-bug-hunt-2  
**Finding:** (1) Combat probability clamping aligned between frontend `combatCalculations.ts` [0.2, 0.8] and backend `GameplayService.cs` [Min/MaxCombatHitProbability]. (2) `CombatResult` type definition includes `isAttacker` and `attackerName`; `CombatResultModal.tsx` uses both for perspective-aware rendering. (3) All `invoke` callbacks use parameters, `useRef.current` values, or `useGameStore.getState()` for fresh state; no stale closure patterns detected. (4) Tricorder `getStrengthUnknownState()` correctly returns true only when `baseState === 'enemy'` AND `visibilityTier === 'Hidden'`.  
**Decision:** All core combat and closure logic is correctly implemented; no code changes needed.  
**Files Analyzed:** `combatCalculations.ts`, `CombatResultModal.tsx`, `useGameActionsGameplay.ts`, `useGameActionsAbilities.ts`, `tricorderTileState.ts`  
**SignalR Impact:** None — verification only.

### 44. Dutch i18n duplicate key removed (2026-03-27)
**Status:** Implemented  
**Agent:** vermeer-bug-hunt-2  
**Change:** Removed duplicate `disconnected` key in `nl.ts` (line 1466: "Afgesneden" — incorrect). Kept original at line 1367: "Niet verbonden" (correct translation for "Disconnected").  
**Root Cause:** Wrong key added during map legend localization; introduced duplicate with different translation.  
**Rationale:** i18n must have one authoritative key per message; duplicates cause unpredictable rendering and hamper maintenance.  
**Impact:** Dutch i18n cleaned up; no missing translations found. Build passes lint and vite compilation cleanly.  
**Files Changed:** `frontend/landgrab-ui/src/i18n/nl.ts`  
**Backward Compatibility:** Yes — translation content unchanged; only duplicate removed.
