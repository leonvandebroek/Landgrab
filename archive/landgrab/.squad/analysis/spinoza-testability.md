# Test Architecture & Coverage Analysis

**Author:** Spinoza (Tester/QA)
**Date:** 2026-03-25
**Scope:** Backend xUnit suite + Playwright e2e; read-only, no tests run

---

## Executive Summary

The Landgrab test suite is in **good shape for a project of this scale**: 276 test entries across 17 test files, expanding to ~300+ cases with `[Theory]` inline data. The unit-test layer is well-structured, the `GameStateBuilder` + `ServiceTestContext` infrastructure is clean and reused consistently, and FluentAssertions make failures readable. Coverage is strong for domain logic (abilities, gameplay, hex math, win conditions, lobby, rooms). The primary gaps are: **`DerivedMapStateService` is completely untested**, `GlobalMapService` and `GameTemplateService` have no tests at all, `TroopRegenerationService` has only 2 tests, `VisibilityService` has 5 tests covering only beacon/border paths, and **all 4 hub partial classes (2,160 LOC) have zero test coverage**. The frontend has no unit test runner installed; Playwright covers room lifecycle and UI surface only.

---

## 1. Test Structure & Organization

### Current State

```
backend/Landgrab.Tests/
├── Auth/
│   ├── JwtServiceTests.cs          (8 tests)
│   └── PasswordServiceTests.cs     (7 tests)
├── Services/
│   ├── AbilityServiceTests.cs      (37 tests)
│   ├── AllianceConfigServiceTests.cs (15 tests)
│   ├── GameConfigServiceTests.cs   (15 tests)
│   ├── GameplayServiceTests.cs     (38 tests)
│   ├── GameStateCommonTests.cs     (7 tests)
│   ├── HexServiceBearingTests.cs   (2 theory-expanded tests)
│   ├── HexServiceTests.cs          (16 tests)
│   ├── HostControlServiceTests.cs  (16 tests)
│   ├── LobbyServiceTests.cs        (40 tests)
│   ├── MapAreaServiceTests.cs      (22 tests)
│   ├── RoomServiceTests.cs         (23 tests)
│   ├── TroopRegenerationTests.cs   (2 tests)
│   ├── VisibilityBroadcastHelperTests.cs (3 tests)
│   ├── VisibilityServiceTests.cs   (5 tests)
│   └── WinConditionTests.cs        (20 tests)
└── TestSupport/
    ├── GameStateBuilder.cs
    ├── ServiceTestContext.cs
    └── TestServiceFactory.cs
```

**Total: 276 `[Fact]`/`[Theory]` markers → ~300 cases after InlineData expansion (29 InlineData rows across theories)**

### Strengths

- **Folder mirrors domain**: `Auth/` and `Services/` separation is clear; one file per service.
- **Naming convention is excellent**: `MethodUnderTest_Scenario_ExpectedBehavior` followed consistently across all files. No ambiguous test names found.
- **`GameStateBuilder`** is a fluent builder that covers all meaningful configuration axes: grid radius, players, alliances, ownership, positions, roles, dynamics flags, paused state, carried troops. It is used in every service test file — no test creates state from scratch.
- **`ServiceTestContext`** wires real services with a Moq `IGameRoomProvider`, disabling persistence via a throwing `IServiceScopeFactory`. This is the right architecture: tests exercise real service logic without a DB.
- **`TestServiceFactory`** offers an alternative pattern for tests needing multiple rooms — used sparingly but correctly.
- **FluentAssertions throughout** — assertions are readable and produce diff-friendly failure messages.
- **`GlobalUsings.cs`** keeps `using Xunit;` out of every file.
- **xUnit 2.x** — solid, actively maintained.

### Recommendations

- **Add a `[assembly: CollectionBehavior(DisableTestParallelization = false)]` baseline** or document the current parallelism posture. Currently tests run in parallel by default; all tests appear safe, but it's not explicit.
- **`TestServiceFactory` vs `ServiceTestContext` overlap**: both exist and both build real services. A note in code or README documenting when to use each would help new contributors. `ServiceTestContext` is preferred for single-room scenarios; `TestServiceFactory` for multi-room or connection-map inspection.
- **`GameStateBuilder.WithPaused` has a formatting inconsistency** — the opening brace is not indented correctly. Minor, but worth cleaning when editing that file.

---

## 2. Coverage Assessment

### Well-covered (≥80% behavior paths)

| Service | Test File | Test Count |
|---------|-----------|-----------|
| `JwtService` | `JwtServiceTests.cs` | 8 |
| `PasswordService` | `PasswordServiceTests.cs` | 7 |
| `HexService` (math) | `HexServiceTests.cs` + `HexServiceBearingTests.cs` | 18 |
| `WinConditionService` | `WinConditionTests.cs` | 20 |
| `LobbyService` | `LobbyServiceTests.cs` | 40 |
| `RoomService` | `RoomServiceTests.cs` | 23 |
| `GameplayService` | `GameplayServiceTests.cs` | 38 |
| `AbilityService` | `AbilityServiceTests.cs` | 37 |
| `AllianceConfigService` | `AllianceConfigServiceTests.cs` | 15 |
| `GameConfigService` | `GameConfigServiceTests.cs` | 15 |
| `HostControlService` | `HostControlServiceTests.cs` | 16 |
| `MapAreaService` | `MapAreaServiceTests.cs` | 22 |
| `GameStateCommon` | `GameStateCommonTests.cs` | 7 |

### Partial coverage (gaps exist)

| Service | Test File | Test Count | Notable Gaps |
|---------|-----------|-----------|--------------|
| `VisibilityService` | `VisibilityServiceTests.cs` | 5 | `ComputeVisibleHexKeys` for non-beacon paths (owned-territory visibility, proximity), `BuildStateForViewer` with `Fog` tier, expiry paths for `EnemySightingMemorySeconds` |
| `VisibilityBroadcastHelper` | `VisibilityBroadcastHelperTests.cs` | 3 | Reconnecting/disconnected player broadcast, host-observer-only path (1 of 3 tests covers it) |
| `TroopRegenerationService` | `TroopRegenerationTests.cs` | 2 | Capped regen (MaxTroops), decay mechanic, master-tile triple-rate, presence-suppressed-regen when paused |

### No tests (critical gaps)

| Service/Layer | Lines of Code | Risk |
|---------------|--------------|------|
| `DerivedMapStateService` | ~70 | Medium — `ComputeContestedEdges` contains alliance-exclusion logic |
| `GlobalMapService` | ~150 | High — persistent EF Core write path, `AttackHexAsync` combat logic |
| `GameTemplateService` | ~120 | Medium — template load/save with EF Core dependency |
| `GameHub` (all 4 partial classes) | 2,160 | High — all route-level guards, auth checks, broadcast orchestration |
| `HubExceptionFilter` | ~39 | Low |

### New abilities coverage

| Ability | Tests Exist? | Quality |
|---------|-------------|---------|
| Troop Transfer (`InitiateTroopTransfer`, `RespondToTroopTransfer`) | ✅ Yes (2 tests) | Acceptance path tested; decline path missing |
| Field Battle (`InitiateFieldBattle`, `ResolveFieldBattle`) | ✅ Yes (2 tests) | Acceptance path; attacker-loses path missing; `JoinFieldBattle` has zero tests |
| Commando Raid | ✅ Yes (5 tests) | Good coverage including failure/cooldown |
| Tactical Strike | ✅ Yes (3 tests) | Good; cross-hex targeting and distance-fail covered |
| `CancelFortConstruction` | ❌ No | Zero tests — only `StartFortConstruction` is covered |
| `CancelSabotage` | ❌ No | Zero tests — only `ActivateSabotage` is covered |
| `CancelDemolish` | ✅ Yes (1 test) | Minimal — only clears facing-lock fields |
| `ResolveTroopTransferTarget` | ❌ No | Zero tests |

---

## 3. Test Quality

### Determinism
All tests are **deterministic**. No `Thread.Sleep`, `Task.Delay`, `DateTime.Now` (always injected via builder), or random data in service tests. The one concurrent test (`AppendEventLog_WhenCallsAreExternallySynchronized_SupportsConcurrentUsage`) uses `Parallel.For` with an explicit loop, which is acceptable.

### Edge cases
- **Empty input / null guards**: Tested well in auth (`Constructor_SecretTooShort`), game config (`SetWinCondition_InvalidValue`), and lobby (`StartGame_LessThanTwoPlayers`). 
- **Boundary values**: Win condition threshold tests (`ApplyTerritoryPercentWinCondition_AtExactThreshold`, `UsesBoundary` timed boundary) show awareness of off-by-one risk.
- **Concurrent access**: Only 1 test explicitly addresses concurrency (`AppendEventLog`). The `ConcurrentDictionary`-backed `RoomService` is not stress-tested for concurrent join/leave; the existing single-threaded tests suffice for behavior, but thread safety of `PlaceTroops`/`PickUpTroops` is exercised only implicitly.

### Behaviour vs implementation
Tests are **predominantly behavior-focused** — they test outcomes (state changes, returned errors, owned counts) not internals. One exception worth reviewing: `StartFortConstruction_OnOwnedHex_StartsPerimeterTracking` asserts on `FortPerimeterHexes` list size — this is a concrete state assertion, which is appropriate, but the list ordering is not asserted (correct, as ordering is not contractual).

### Negative paths
Negative paths are **thoroughly covered**: every major service method has at least one `_WhenNotHost_Fails`, `_RoomNotFound_ReturnsError`, or `_WhenGameIsNotPlaying_Fails` counterpart. Notable missing negatives:
- `PlaceTroops` when game is **paused** (no test)
- `RespondToTroopTransfer` when **declined** (no test)
- `ResolveFieldBattle` when **attacker loses** (defender superiority — no test)

---

## 4. Integration vs Unit Balance

### Current balance: Excellent
All 276 tests are **pure unit tests**: no database, no HTTP client, no SignalR hub wiring. Services are instantiated directly with Moq-backed dependencies. This gives sub-millisecond test execution and zero infrastructure setup.

### Appropriate use of DI
`ServiceTestContext` and `TestServiceFactory` correctly use real service implementations with mocked `IGameRoomProvider`. No test spins up the full ASP.NET Core DI container — this is the right choice for domain logic.

### What should stay unit tests
Everything currently unit-tested should remain so. Hub logic (`GameHub.*`) is the right candidate for integration tests — but integration tests for SignalR hubs are non-trivial in xUnit and are not currently present.

### What might benefit from integration tests
- `GlobalMapService` — requires EF Core `DbContext`; in-memory EF or TestContainers would be appropriate
- `GameTemplateService` — same EF dependency
- `GameHub` — at minimum, a smoke test that a message dispatches to the correct service method would catch routing regressions

---

## 5. Frontend Testing Gap

### Unit test infrastructure
**None.** No `vitest`, `jest`, `@testing-library/react`, or equivalent is installed (`package.json` devDependencies contain only Playwright, TypeScript, Vite, and ESLint). The `src/testing/` directory exists but contains only `agentBridge.ts` — a runtime MCP bridge for the playtester agent, not a test helper.

### Playwright e2e (what exists)
Four spec files covering:
- **`multiplayer.gameplay.spec.ts`**: Room creation, join, wizard navigation, three-player scenario — 6 tests, all requiring live backend + frontend
- **`debug-gps.gameplay.spec.ts`**: Debug GPS panel visibility and toggle — 4 tests
- **`scalable.gameplay.spec.ts`**: Player pool creation/destruction utilities — 2 tests (infrastructure tests, not gameplay)
- **`localization.spec.ts`**: i18n key absence checks and language detection — mock-based, no live backend needed

**Playwright config notes**: All gameplay tests run with `headless: false` and `workers: 1`, which is intentional for determinism but makes CI slow. The `setup` project seeds auth cookies (3 players) before gameplay tests run.

### What Playwright does NOT cover
- Actual gameplay moves (hex claiming, troop placement, combat resolution) via the UI
- SignalR event handling (state updates received and rendered correctly)
- Win condition display / game-over screen
- Visibility fog rendering
- Ability activation flows through the HUD
- Alliance configuration wizard steps (beyond step 0 navigation)

### Highest-value frontend unit test targets
1. **`tileInteraction.ts`** — pure function determining available actions per hex state; no React, easily unit-testable
2. **`HexMath.ts`** (map component) — coordinate conversions already unit-tested on backend, but the TS version `latLngToRoomHex` / `roomHexToLatLng` has no tests
3. **Zustand store reducers** — particularly `gameStore`'s `setGameState`, which merges server state
4. **i18n completeness** — a unit test asserting every key in `en.ts` exists in `nl.ts` would catch translation gaps (currently no such guard)

---

## 6. Missing Test Cases (Prioritized)

| # | What's Missing | Why It Matters | Effort |
|---|---------------|----------------|--------|
| 1 | `DerivedMapStateService.ComputeContestedEdges` — basic contested edge detection, alliance-exclusion, intensity calculation | Completely untested; feeds visual display; alliance-same-team exclusion has a subtle bug risk | Low (30 min) |
| 2 | `VisibilityService.ComputeVisibleHexKeys` — non-beacon paths: owned-territory radius, proximity-only, `Fog` tier assignment, sighting-memory expiry | 5 existing tests only cover beacon + border adjacency; core fog-of-war logic paths are implicit | Medium (2h) |
| 3 | `RespondToTroopTransfer_WhenDeclined_RefundsTroops` | Decline path is a user-facing action with troop accounting; zero coverage | Low (45 min) |
| 4 | `ResolveFieldBattle_WhenDefenderWins_DefenderRetainsTile` | Attacker-loses branch is untested; troop math differs from win path | Low (45 min) |
| 5 | `JoinFieldBattle_WhenBattleExists_AddsParticipant` + `JoinFieldBattle_WhenBattleExpired_Fails` | `JoinFieldBattle` has zero tests; it's the gating call before `ResolveFieldBattle` | Low (1h) |
| 6 | `CancelFortConstruction_WhenPlayerOwnsHex_ClearsPerimeterState` | Cancellation path is entirely untested; only construction-start is covered | Low (30 min) |
| 7 | `CancelSabotage_WhenActiveSabotage_ClearsState` | Same gap as fort cancellation | Low (30 min) |
| 8 | `TroopRegenerationService` — capped regen at `MaxTroops`, decay mechanic, pause-suppressed regen | Only 2 tests exist; the service has several conditional paths | Medium (1.5h) |
| 9 | `PlaceTroops_WhenGameIsPaused_Fails` + similar paused-game guards on `PickUpTroops`, `UpdatePlayerLocation` | The `IsPaused` check is in every hot-path method but no test exercises it | Low (1h) |
| 10 | `ResolveTroopTransferTarget_WhenTargetIsAlly_ReturnsTarget` + `WhenNoAllyInRange_ReturnsNull` | `ResolveTroopTransferTarget` has zero tests; it is the targeting resolution for a newer ability | Low (45 min) |

---

## 7. Test Infrastructure & Tooling

### xUnit setup
- **`xunit 2.*`** — the version pin allows 2.x minor upgrades; fine for stability.
- **`FluentAssertions 6.*`** — pinned to v6; note that v7 dropped some APIs. Upgrading to v7 requires work but provides better null-safe assertions.
- **`Moq 4.20.72`** — pinned to a specific patch; could be `4.*` for patch flexibility.
- **No code coverage tooling** in `Landgrab.Tests.csproj** — no `coverlet.collector` or `Microsoft.CodeCoverage`. Adding `<PackageReference Include="coverlet.collector" Version="6.*" />` and running `dotnet test --collect:"XPlat Code Coverage"` would give concrete coverage percentages.
- **No `[assembly: TestFramework]` or custom `ITestOutputHelper` logging** — tests are silent on success; acceptable but `ITestOutputHelper` would aid debugging flaky tests if they emerge.

### Mocking strategy
Consistent: only `IGameRoomProvider` is mocked (Moq). All domain services are instantiated as real objects. This is the correct inversion — mock at the infrastructure boundary, not the domain boundary.

### Test data builders/factories
`GameStateBuilder` is **well-designed** and covers essentially all state axes. Two improvement opportunities:
- **No `PlayerBuilder`** — players are added inline via `AddPlayer(id, name, ...)`. For tests needing players with many custom fields (role, carried troops, position), the chain gets long. A nested builder or a default `PlayerDto` factory helper would reduce verbosity.
- **`GameStateBuilder.WithCarriedTroops`** exists but `WithBeaconState` does not — beacon setup is manual in each test (set `IsBeacon`, `BeaconLat`, etc. directly on the `PlayerDto`). Extracting this to `WithBeaconPosition(playerId, q, r, heading)` would eliminate 5-line boilerplate in all beacon tests.

---

## 8. Regression Risk Assessment

### Highest risk areas (weak/no test coverage)

| Area | Regression Risk | Reason |
|------|----------------|--------|
| `GameHub.*` (all 4 files, 2,160 LOC) | 🔴 HIGH | Zero test coverage; contains auth guards, broadcast routing, all hub method signatures. Any method rename or parameter change is invisible to the test suite. |
| `GlobalMapService.AttackHexAsync` | 🔴 HIGH | 80+ lines of combat math and EF writes; zero tests; any change to troop formula breaks silently. |
| `VisibilityService` (non-beacon paths) | 🟠 MEDIUM-HIGH | Fog-of-war is core to Alliances mode; beacon paths are covered but the base owned-territory visibility radius is not. |
| `DerivedMapStateService.ComputeContestedEdges` | 🟠 MEDIUM | Alliance exclusion logic (skip edges between same-alliance owned hexes) — one wrong condition breaks the contested-edge overlay. |
| Ability cancellation flows (`CancelFortConstruction`, `CancelSabotage`) | 🟠 MEDIUM | State cleanup on cancel is detail-rich; silently broken cleanup corrupts game state for the rest of the session. |
| Troop transfer / field battle new paths | 🟡 LOW-MEDIUM | Happy-path covered; decline and defender-wins paths are not. These are newer features and more likely to change. |
| `TroopRegenerationService` capped/decay paths | 🟡 LOW-MEDIUM | Only 2 tests; the MaxTroops cap and `TileDecayEnabled` branch could regress silently. |

### Lower risk (well-covered, stable)
- Hex math (`HexService`) — 18 tests, pure functions, unlikely to change
- Auth (JWT, bcrypt) — 15 tests, stable cryptography wrappers
- `WinConditionService` — 20 tests including timed-game boundary, tie-breaking, achievement calculation
- `LobbyService` — 40 tests, most lifecycle paths covered
- `RoomService` — 23 tests including reconnect and disconnect edge cases

---

## Coverage Heat Map

| Service / Feature | Test File | Tests | Coverage Estimate | Risk Level |
|------------------|-----------|-------|-------------------|-----------|
| `JwtService` | `Auth/JwtServiceTests.cs` | 8 | ~95% | 🟢 Low |
| `PasswordService` | `Auth/PasswordServiceTests.cs` | 7 | ~90% | 🟢 Low |
| `HexService` (math/geometry) | `HexServiceTests.cs` + `HexServiceBearingTests.cs` | 18 | ~85% | 🟢 Low |
| `WinConditionService` | `WinConditionTests.cs` | 20 | ~90% | 🟢 Low |
| `LobbyService` | `LobbyServiceTests.cs` | 40 | ~85% | 🟢 Low |
| `RoomService` | `RoomServiceTests.cs` | 23 | ~80% | 🟢 Low |
| `GameplayService` | `GameplayServiceTests.cs` | 38 | ~80% | 🟢 Low |
| `AbilityService` | `AbilityServiceTests.cs` | 37 | ~75% | 🟡 Low-Med |
| `AllianceConfigService` | `AllianceConfigServiceTests.cs` | 15 | ~80% | 🟢 Low |
| `GameConfigService` | `GameConfigServiceTests.cs` | 15 | ~85% | 🟢 Low |
| `HostControlService` | `HostControlServiceTests.cs` | 16 | ~85% | 🟢 Low |
| `MapAreaService` | `MapAreaServiceTests.cs` | 22 | ~80% | 🟢 Low |
| `GameStateCommon` | `GameStateCommonTests.cs` | 7 | ~85% | 🟢 Low |
| `VisibilityBroadcastHelper` | `VisibilityBroadcastHelperTests.cs` | 3 | ~50% | 🟠 Medium |
| `VisibilityService` | `VisibilityServiceTests.cs` | 5 | ~35% | 🟠 Medium-High |
| `TroopRegenerationService` | `TroopRegenerationTests.cs` | 2 | ~30% | 🟠 Medium |
| `DerivedMapStateService` | _(none)_ | 0 | 0% | 🟠 Medium |
| `GameStateService` | _(none, via integration in others)_ | 0 direct | ~60% indirect | 🟡 Low-Med |
| `GameTemplateService` | _(none)_ | 0 | 0% | 🟠 Medium |
| `GlobalMapService` | _(none)_ | 0 | 0% | 🔴 High |
| `GameHub.*` (all 4 partial classes) | _(none)_ | 0 | 0% | 🔴 High |
| Frontend unit logic | _(none — no runner)_ | 0 | 0% | 🟠 Medium |
| Playwright e2e (UI surface) | 4 spec files | ~15 | Lobby + GPS panel only | 🟠 Medium |

---

## Priority Test Additions

Top 10 additions ordered by value-to-effort ratio:

1. **`DerivedMapStateServiceTests.cs`** — `ComputeContestedEdges` basic path + alliance exclusion + intensity calculation. Pure function, no mocking needed. **Effort: 30 min.**

2. **`AbilityServiceTests` — `CancelFortConstruction` + `CancelSabotage`** — two tests, state-reset assertions. Existing builder + context suffice. **Effort: 45 min.**

3. **`GameplayServiceTests` — `PlaceTroops_WhenGameIsPaused_Fails`** + same guard for `PickUpTroops`. Only requires `.WithPaused()` on builder. **Effort: 30 min.**

4. **`AbilityServiceTests` — `RespondToTroopTransfer_WhenDeclined_RefundsTroops`**. Uses existing `InitiateTroopTransfer` setup as baseline. **Effort: 45 min.**

5. **`AbilityServiceTests` — `JoinFieldBattle_*` (2 tests)**. `JoinFieldBattle` is the mandatory precursor to `ResolveFieldBattle`; currently tested only indirectly. **Effort: 1h.**

6. **`AbilityServiceTests` — `ResolveFieldBattle_WhenDefenderWins_DefenderRetainsTile`**. Mirror of existing `WhenEnemyJoins_ResolvesAndClearsBattle` with inverted troop counts. **Effort: 30 min.**

7. **`VisibilityServiceTests` expansion** — 3–4 tests: `ComputeVisibleHexKeys_WhenOwningHex_RevealsSurroundingRadius`, `_WhenPlayerIsOnUnownedHex_RevealsProximityOnly`, `BuildStateForViewer_ExpiredEnemySighting_DemotesToFog`. **Effort: 2h.**

8. **`TroopRegenerationTests` expansion** — `AddReinforcements_WhenHexAtMaxTroops_DoesNotExceedCap`, `_WhenTileDecayEnabled_DecrementsTroopsOnEnemyHexes`, `_WhenGameIsPaused_SkipsRegen`. **Effort: 1.5h.**

9. **`AbilityServiceTests` — `ResolveTroopTransferTarget_*` (2 tests)** — target resolution with ally in range vs. no ally. Uses existing multi-player builder patterns. **Effort: 45 min.**

10. **Frontend: add Vitest + `@testing-library/react` + tests for `tileInteraction.ts`** — `getTileActions` is a pure function with ~10 conditional branches (own hex, enemy hex, neutral hex, roles, abilities). Zero dependencies. This alone would catch the most likely frontend regressions. **Effort: 3h (setup + 5–8 test cases).**

---

## Skipped Test Registry

| File | Test | Reason |
|------|------|--------|
| `AllianceConfigServiceTests.cs` | `ConfigureAlliances_WhenAllianceNamesContainDuplicates_Fails` | Implementation does not validate duplicate names yet. Test body is empty — should be completed when validation is added. |

