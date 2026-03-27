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
