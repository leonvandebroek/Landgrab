# Spinoza — History

## Core Context
Tester/QA on Landgrab. xUnit test suite with 353 tests (352 passing, 1 skipped) as of 2026-03-27. 18 test suites. No frontend automated tests yet.

Coverage areas: auth (JWT, bcrypt), hex math/geometry, game mechanics, abilities, duels, win conditions, rooms, lobbies, host controls, visibility, troop regeneration, alliance config, map areas, hub validation (SanitizeGameDynamics).

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
- 2026-03-27: Fixed VisibilityService test failure. Root cause: test expected Remembered tier for hex (1,0) but player was still at (0,0) keeping it in normal visibility radius. Fixed by moving player to (-4,0) in second scenario.
- 2026-03-27: Created new test suite for GameHub.SanitizeGameDynamics validation logic. Ensures all fields including FieldBattleEnabled are preserved, and invalid enum values are reset to defaults.
- VisibilityRadius=1 means hexes adjacent to player position are visible through normal fog-of-war rules, not just beacon sectors or owned territory.
- 2026-03-28 (Round 2 Bug Hunt): `UpdatePlayerPosition` in `GameplayService.cs` had no grid-existence check — it assigned client-supplied q,r directly to `player.CurrentHexQ/R` even when those coordinates didn't exist in the game grid. Fixed by checking `room.State.Grid.ContainsKey(hexKey)` and nulling the position when off-grid. Flee detection was also corrected to trigger when a player moves off-grid (no longer at the battle hex).
- 2026-03-28: All other hub methods that accept (q, r) parameters DO check the grid via `TryGetValue` in their respective service calls — the gap was isolated to `UpdatePlayerPosition` only.
- 2026-03-28: `ConfigureAlliances` has a strict `Phase != GamePhase.Lobby` guard in `AllianceConfigService.cs` — calling it after game start returns an error and leaves state unchanged. All lobby-config methods share this pattern.
- 2026-03-28: `PlayersMoved` broadcasts full `PlayerDto` objects (via `ClonePlayer` in `VisibilityBroadcastHelper`) including all `*CooldownUntil` fields. The frontend correctly replaces the player array in `updateGameState`; ability card components use `useSecondTick()` + client-side ISO date comparison for live countdowns. No stale-cooldown bug exists.
- 2026-03-28: Test count after Round 2: 353 total (352 passed, 1 skipped). The fix to `UpdatePlayerPosition` is in service code; a dedicated test for the off-grid nulling behaviour is a gap to fill.
- 2026-03-29 (Round 3 Bug Hunt): Investigated BUG 8 (FieldBattleInvitePanel stale invite) and BUG 9 (AttemptIntercept race condition). Both are **not bugs** — frontend panel correctly self-dismisses via timer expiration and `FieldBattleResolved` server event; backend `AttemptIntercept` gracefully handles stale targets (after raid expiration or engineer movement) by checking `HasActiveSabotage(engineer)` and returning `"noTarget"` status. Added 2 new xUnit tests to cover intercept stale-target scenarios. Test count: 360 total (359 passed, 1 skipped).
- 2026-03-29: Fixed test support constructors in `ServiceTestContext.cs` and `TestServiceFactory.cs` — removed obsolete parameters (roleProgressService from EngineerAbilityService, hubContext from SharedAbilityService) to match updated service signatures.

## 2026-03-27 Visibility Bug Hunt & Hub Testing Sprint

**Scope:** Fixed failing VisibilityService test and added comprehensive test coverage for GameHub validation logic.

**Results:** 1 test fixed, 5 new tests added. Total test count: 353 (352 passed, 1 skipped).

**Test Fixes & Additions:**
1. Fixed `BuildStateForViewer_WhenBeaconSectorSeesHostile_SetsLastSeenAndKnownFields` test fixture
2. Added `SanitizeGameDynamics_PreservesAllEnabledFields`
3. Added `SanitizeGameDynamics_ClampsBeaconSectorAngleToValidRange`
4. Added `SanitizeGameDynamics_EnforcesMinimumEnemySightingMemorySeconds`
5. Added `SanitizeGameDynamics_ResetsInvalidCombatModeToDefault`
6. Added `SanitizeGameDynamics_ResetsInvalidFieldBattleResolutionModeToDefault`

**Decisions merged to decisions.md:**
- Decision #41: VisibilityService test fixture corrected
- Decision #42: GameHub validation test suite added

**Orchestration Log:** `.squad/orchestration-log/2026-03-27T15:55:33Z-spinoza-visibility-bug.md`

**Team Coordination:**
- Complements de-ruyter's backend bug fixes with automated test coverage
- Provides regression safety for future changes to GameDynamics sanitization

## 2026-03-29 — Bug Hunt Round 4 (Win Conditions & Lobby Capacity)

**Scope:** Win condition evaluation at 30-player scale, lobby capacity, game start initialization

**Key Findings:**
- All systems pass stress testing — **NO critical bugs found**
- Added 9 new tests in `LargeScaleGameTests.cs` covering 30-player scenarios
- Test count increased from 360 → 369 (all passing)

**Performance Validated:**
- `RefreshTerritoryCount` with 721 hexes (radius 15) completes in <2ms
- `StartGame` with 30 players completes in ~40-50ms
- Win condition evaluation is O(N) but performant at current scale

**Key Architectural Findings:**
- 30-player hard cap enforced correctly in `RoomService.JoinRoom` (line 325-326)
- `ValidateStartingAccess` (LobbyService.cs:544-564) prevents unplayable game starts by blocking when any player would have 0 troops + 0 territory access
- Win condition simultaneous threshold: first alliance in `state.Alliances` list wins (deterministic)
- No alliance seat limits exist, but `ValidateStartingAccess` prevents 30-in-1-alliance scenarios from starting

**Test Coverage Added:**
1. `JoinRoom_31stPlayer_IsRejectedWithMaxCapacityError` — validates hard cap
2. `StartGame_With30Players_SuccessfullyInitializesAllPlayers` — verifies all players get starting positions
3. `StartGame_With30PlayersIn5Alliances_DistributesStartingTilesEvenly` — multi-alliance distribution
4. `StartGame_AllPlayersInOneAlliance_FailsValidationDueToLackOfTerritory` — validates protection logic
5. `ApplyTerritoryPercentWinCondition_30Players10Alliances_ScansAllHexesCorrectly` — large-scale win eval
6. `RefreshTerritoryCount_30PlayersOnLargeGrid_CompletesWithinReasonableTime` — performance test
7. `ApplyEliminationWinCondition_30Players_FindsSoleAllianceSurvivor` — elimination at scale
8. `ApplyWinCondition_MultipleAlliancesHitThresholdSimultaneously_AwardsFirstInList` — race condition
9. `ComputeAchievements_With30Players_CalculatesCorrectLeaders` — achievement calculation at scale

**Recommendations:**
- Document first-wins-on-tie behavior in `ApplyTerritoryPercentWinCondition` XML comments
- Consider lobby UI warning when 20+ players join one alliance (UX improvement, not bug)
- Current O(N) scan performance is acceptable; optimization not needed unless grid exceeds 1000 hexes

**Decisions:** All findings documented in `.squad/decisions/inbox/spinoza-r4-findings.md`
