# Spinoza — History

## Core Context
Tester/QA on Landgrab. xUnit test suite with 353 tests (352 passing, 1 skipped) as of 2026-03-27. 18 test suites. No frontend automated tests yet.

Coverage areas: auth (JWT, bcrypt), hex math/geometry, game mechanics, abilities, duels, win conditions, rooms, lobbies, host controls, visibility, troop regeneration, alliance config, map areas, hub validation (SanitizeGameDynamics).

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
- 2026-03-27: Fixed VisibilityService test failure. Root cause: test expected Remembered tier for hex (1,0) but player was still at (0,0) keeping it in normal visibility radius. Fixed by moving player to (-4,0) in second scenario.
- 2026-03-27: Created new test suite for GameHub.SanitizeGameDynamics validation logic. Ensures all fields including FieldBattleEnabled are preserved, and invalid enum values are reset to defaults.
- VisibilityRadius=1 means hexes adjacent to player position are visible through normal fog-of-war rules, not just beacon sectors or owned territory.

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
