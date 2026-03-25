# Landgrab Platform Analysis
*Conducted: 2026-03-25 | Team: Rembrandt (Lead), Vermeer, De Ruyter, Grotius, Huygens, Tasman, Spinoza*

---

## Executive Summary

Landgrab is a real-time multiplayer hex territory game built on a technically solid foundation: strict JWT validation, BCrypt factor 12, comprehensive SignalR input validation, clean dual-mode architecture (in-memory Alliances / persistent FFA), and 276 passing unit tests with a well-designed `GameStateBuilder` fixture. The codebase is the output of a high-velocity sprint team and it shows — core patterns are sound and the product is playable today.

The primary concern is concentrated complexity. Four services (`GameplayService` at 1440 lines, `AbilityService` at 1331 lines, `GameHub` total at 2160 lines across four partial classes, `PlayingHud.tsx` at 1018 lines) account for a disproportionate share of both functionality and risk surface. These are not merely cosmetic issues — the hub has zero test coverage and the services are heading toward untestability.

Two issues require immediate attention regardless of roadmap priorities: the rate limiter is misconfigured at 3,600 req/min instead of the intended 10 req/min (providing virtually no brute-force protection), and `GlobalHex.Owner` always returns null due to an EF Core shadow-property bug (breaking FFA ownership display). Both are one-line fixes with zero design work required.

The recommended focus order: (1) fix the two critical bugs this week, (2) invest one sprint in splitting the oversized services and adding test coverage to the hub and visibility service, (3) plan an infrastructure sprint for Azure SignalR Service provisioning and Key Vault integration before any horizontal scale-out.

---

## Analysis Scope & Method

All six domain experts conducted independent read-only analyses of the Landgrab codebase (`backend/`, `frontend/`, `infrastructure/`, `azure-pipelines.yml`, `docker-compose.yml`) between 2026-03-22 and 2026-03-25. No production files were modified during analysis. Findings were cross-referenced across domains; issues appearing in multiple reports are explicitly noted. The analysis covers the full stack: frontend TypeScript/React, backend C#/ASP.NET Core, EF Core data layer, Azure infrastructure as code (Bicep), CI/CD pipeline, and testing architecture.

---

## Platform Strengths

The team has done genuinely good work in the following areas — these are strengths worth preserving as the codebase evolves:

- **`GameService` thin-facade pattern** — all hub code imports one aggregate service; domain boundaries are correct even if some services are oversized.
- **`eventsRef` stale-closure fix in `useSignalR`** — the `useLayoutEffect(() => { eventsRef.current = events; })` pattern is correctly applied throughout, preventing a subtle and common React/SignalR bug.
- **Two-level concurrency model** — `ConcurrentDictionary` for room lookup + `lock(room.SyncRoot)` for state mutations is sound and appropriately granular. 73 lock call sites are all consistent.
- **Server is the source of truth** — the frontend never mutates game state; all state flows in via SignalR. This discipline is consistently maintained.
- **Comprehensive hub input validation** — `ValidateCoordRange`, `ValidateLatLng`, `ValidateRoomCode`, `ValidateHexKeyPayload`, `SanitizeGameDynamics`, `ValidateEnumString<T>` are well-designed and consistently applied.
- **`HubExceptionFilter`** — all unhandled exceptions are caught, logged with structured context, and returned as generic messages. No stack traces ever reach clients.
- **Zero raw SQL** — 100% EF Core LINQ queries throughout the backend. No injection risk.
- **BCrypt work factor 12** — hardcoded, not configurable. Correct choice for password hashing.
- **HttpOnly + SameSite=Strict cookies** — auth cookies are correctly secured.
- **Security headers** — `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy`, `Permissions-Policy` all present in middleware.
- **`AsNoTracking()` on read queries** — consistently applied in `GlobalMapService`; prevents unnecessary change-tracking overhead.
- **276 unit tests with clean infrastructure** — `GameStateBuilder` fluent fixture, `ServiceTestContext` with mocked `IGameRoomProvider`, `FluentAssertions` throughout. Test naming convention (`Method_Scenario_ExpectedBehavior`) is excellent.
- **`normalizeGrid` object-identity optimization** — `gameStore.ts` preserves object identity for unchanged hex cells, preventing spurious Leaflet re-renders.
- **Multi-stage Docker builds** — both backend and frontend containers use multi-stage builds with non-root runtime users.
- **CI vulnerability scanning** — `dotnet list package --vulnerable` and `npm audit --audit-level=high` both present in the pipeline.
- **`QueuedOutcomeDialog` discriminated union** — modal-stacking queue in `gameplayStore.ts` is a clean implementation.

---

## Critical Issues (Fix Immediately)

These are bugs, security holes, or data correctness problems. Each can cause real harm in production today.

**1. 🔴 CRITICAL — Rate limiter misconfigured: 60 req/sec instead of 10 req/min**
`Program.cs:129–133` configures `Window = TimeSpan.FromSeconds(1), PermitLimit = 60`. This permits **3,600 requests per minute per IP** — 360× more permissive than the documented 10 req/min. The "auth" policy applies to all `/api/auth/*` endpoints including login, register, and password reset. There is no account lockout either. Combined, this means password brute-forcing is currently unconstrained.
*Fix: `Window = TimeSpan.FromMinutes(1), PermitLimit = 10`.*
*Confirmed independently by: De Ruyter, Grotius, Huygens.*

**2. 🔴 CRITICAL — `GlobalHex.Owner` navigation always returns `null` (EF Core shadow-property bug)**
`AppDbContext` configures the `GlobalHex → User` relationship without specifying the FK column. EF Core auto-generates a shadow `OwnerId` property as the FK. Meanwhile, the model has a separate `OwnerUserId` column (populated by all write paths) which EF Core does not associate with the navigation. Every `Include(h => h.Owner)` call — used in `GetHexesForUserAsync` and `GetHexesNearAsync` — returns null even when `OwnerUserId` is populated. FFA ownership display is broken.
*Fix: add `.HasForeignKey(h => h.OwnerUserId)` in `AppDbContext.OnModelCreating`, add a migration to drop the orphaned `OwnerId` shadow column.*
*Confirmed by: Huygens.*

**3. 🔴 HIGH — No JWT revocation on logout**
`AuthEndpoints.cs:106–117` deletes the HttpOnly cookie on logout but does not invalidate the JWT itself. A stolen token remains valid for its full 24-hour lifetime. There is no server-side token blocklist.
*Fix: implement an in-memory token blocklist (ConcurrentDictionary keyed by `Jti`, cleaned up on expiry), or Redis for multi-instance deployments.*
*Confirmed by: Grotius.*

**4. 🔴 HIGH — No account lockout after failed login attempts**
`AuthEndpoints.cs:78–103` returns `401 Unauthorized` with no failed-attempt tracking. Combined with issue #1 (misconfigured rate limiter), password brute-forcing is currently feasible.
*Fix: track failed login counts per username in-memory or in DB; lock after 5 failures for 15 minutes.*
*Confirmed by: Grotius.*

**5. 🟠 MEDIUM — `GlobalHex.OwnerUserId` has no FK constraint**
The `GlobalHexes` table stores `OwnerUserId` as a plain nullable column with no database FK to `Users`. If a user account is deleted, all their claimed hexes retain a dangling GUID. Similarly, `OwnerAllianceId` has no FK to `Alliances`.
*Fix: add FK constraints with `OnDelete(DeleteBehavior.SetNull)` via migration.*
*Confirmed by: Huygens.*

**6. 🟠 MEDIUM — Documentation says SQL Server; `.env` says PostgreSQL**
The root `.env` file contains a PostgreSQL-format connection string (`Host=localhost;Port=5432`). The actual stack is SQL Server throughout (`UseSqlServer()` in `Program.cs`, SQL Server 2022 in `docker-compose.yml`, Azure SQL in `infrastructure/main.bicep`). Multiple documentation files also refer to PostgreSQL. A new developer following the `.env` will get a broken backend on first run.
*Fix: replace PostgreSQL connection string in `.env` with SQL Server format; correct all documentation references.*
*Confirmed by: Huygens, Tasman.*

---

## Architecture & Design Findings

### Backend Architecture

*(Synthesized from De Ruyter's report)*

**Service design** is architecturally sound in concept — `GameService` is a thin one-liner facade, clear domain boundaries exist, and `GameStateCommon` centralizes constants and snapshot logic. The problem is concentrated size. `GameplayService` at 1440 lines handles GPS location updates, hex coordinate resolution, troop pick-up/placement, three combat modes, fort/sabotage/demolish progress tracking, rally point expiry, commando raid resolution, and troop regeneration. It also functions as a utility library for `AbilityService` — a class-level dual responsibility that is architecturally unsound. `AbilityService` at 1331 lines contains all nine abilities for all three roles in a single class.

A four-liner boilerplate block (`GetRoom`, `SnapshotState`, `AppendEventLog`, `QueuePersistence`) is duplicated identically across at least seven domain services. A protected `RoomScopedService` base class would eliminate this.

**Hub design** — the four-partial-class split is mostly well-reasoned, but the boundaries are inconsistent. Host-config methods (`SetBeaconEnabled`, `SetTileDecayEnabled`, `SetGameDynamics`, `SetClaimMode`, `SetWinCondition`) live in `GameHub.Lobby.cs` but are host-only operations that belong in `GameHub.Host.cs`. A room-lookup guard pattern (`var room = gameService.GetRoomByConnection(...); if (room == null) { await SendError(...); return; }`) is repeated 59 times verbatim across the three hub files. Error code handling is inconsistent — `PlaceTroops` sends `SendError("Not in a room.")` with no error code while other methods use `MapErrorCode()`. `MapErrorCode` itself is brittle: it string-matches on error message content to produce structured codes.

**In-memory state** — the two-level concurrency model (`ConcurrentDictionary` + `SyncRoot`) is sound, but `TroopRegenerationService` executes four sequential operations (raid/rally/sabotage/regen) each acquiring and releasing the lock independently. This window allows hub actions to interleave between tick operations. The 30-second `Task.Run` in `InitiateFieldBattle` is untracked and silently swallows resolution errors.

**`QueuePersistence`** has a duplicate implementation in both `RoomService` and `GameStateService`. All callers should route through `GameStateService`.

**Logging** — `GameplayService` and `AbilityService` (combined 2771 lines) contain zero `ILogger` calls. Game-significant events (combat, ability activation, win condition) are written to the in-memory `EventLog` but never to structured server logs.

### Frontend Architecture

*(Synthesized from Vermeer's report)*

The React/Zustand architecture is mature. Core patterns — `eventsRef`, sub-hook composition, Zustand store isolation — are correctly implemented. The high-velocity sprint cadence has introduced two concentration problems.

**`App.tsx` (721 lines)** reads from five stores (26+ subscriptions), initialises nine hooks, computes three derived values, and renders conditional JSX. It should be reduced to a thin renderer via an `useAppOrchestrator` extraction. **`PlayingHud.tsx` (1018 lines)** renders ability cards, modals, minimap, help overlay, info ledge, player HUD, and tile info simultaneously through a 74-member props interface, most optional. Splitting into `AbilityPanelArea`, `HudInfoArea`, and `ModalArea` sub-components would collapse the interface naturally.

**`useGameActionsGameplay.ts` (717 lines)** owns four distinct responsibilities: location broadcasting throttle loop, tile click dispatch, pickup/reinforce/attack/claim confirmation flows, and combat preview management. `useGameActionsAbilities.ts` repeats an identical 5-line try/catch pattern 12 times for every ability invocation.

**Type duplication**: `SignalRInvoke` and `LocationPoint` are each defined in four separate files. Both already exist as exports in `useGameActions.shared.ts`.

**`useSignalRHandlers.ts` wraps all 28 event handlers in `useMemo` with `gameState` as a dependency**, causing the entire `GameEvents` object to be reallocated on every `StateUpdated` event. The `gameState` captures could be replaced with `useGameplayStore.getState()` reads inside handlers, making `GameEvents` stable.

**Adding a new ability requires changes in seven files** (types, handler, shared interface, delegation map, PlayingHud props, GameView actions, ability card). An ability registry pattern would make most of these additive.

The frontend has no unit test runner installed — no Vitest, Jest, or equivalent. Four Playwright e2e specs cover room setup and GPS panel UI only; no gameplay moves, SignalR state updates, or win condition flows are covered.

### Data & Database

*(Synthesized from Huygens' report)*

**The database is SQL Server 2022** — not PostgreSQL as several documentation files claim. This is a factual error that needs correction throughout `CLAUDE.md` and related docs.

The schema is otherwise well-designed: composite PK `(Q, R)` on `GlobalHex`, natural PK on `PersistedRooms` using room code, `MapTemplate.HexCoordinatesJson` as flexible JSON storage, cascade-delete from `User` to `AllianceMember` and `PasswordResetToken`.

**The `Owner` navigation bug** (see Critical Issue #2) is the most significant data correctness problem. The fix is one line in `OnModelCreating`.

**`GlobalHex.OwnerAllianceId` also has no FK constraint** (Critical Issue #5). Both dangling-FK risks require migrations adding FK constraints with appropriate cascade behaviour.

**`GameEvents` table has zero writers** — no service code writes to it. It adds schema complexity, migration overhead, and confusion for no benefit. Recommend wiring it up or removing it.

**Rooms are never evicted from `_rooms` at runtime.** `RemoveConnection` marks players disconnected but never removes the `GameRoom`. In a long-running server with many short games, `_rooms` grows without bound. A background hosted service should evict `GameOver` rooms after N hours of inactivity.

**`GetRoomByConnection` scans all rooms linearly** (`O(n)` over `_rooms.Values`). A reverse `ConcurrentDictionary<connectionId, roomCode>` index would make this `O(1)`.

**`ForgotPassword` loads all outstanding tokens in C# then loops them** to set `Used = true`. EF Core 7+ `ExecuteUpdateAsync` would make this a single SQL statement.

**Password reset token HMAC key is `Jwt:Secret`** — rotating the JWT signing key silently invalidates all outstanding password reset tokens. A dedicated `ResetToken:HmacSecret` config key would decouple the rotation cycles.

### Security Posture

*(Synthesized from Grotius' report)*

Landgrab's security foundations are solid. JWT validation is strict (issuer, audience, lifetime, zero clock skew), BCrypt factor 12 is hardcoded, HttpOnly/SameSite=Strict cookies are used, SSRF surface is zero, and `HubExceptionFilter` prevents information leakage. Host-only actions are consistently verified server-side across all service classes. Room isolation via `ConnectionId`-based resolution is correctly implemented.

**Gaps:**
- Rate limiter misconfiguration (Critical Issue #1) — the most urgent fix.
- No JWT revocation and no account lockout (Critical Issues #3 and #4).
- No `Content-Security-Policy` header — the one missing security header from an otherwise complete set.
- CORS always includes localhost origins even in production (`Program.cs:112`). These should be conditional on environment.
- Response compression enabled for HTTPS (`EnableForHttps = true`) — BREACH-style side-channel risk, low severity for a game app but not best practice.
- `dangerouslySetInnerHTML` is used in 4 frontend components (`TroopBadge.tsx`, `HexTooltipOverlay.tsx`, `HexTile.tsx`, `GameIcon.tsx`) — all currently render developer-controlled static content, not user input. Low risk today, but each site needs a code comment documenting this constraint so it doesn't regress when content sources evolve.
- JWT is stored in React state (needed for SignalR `accessTokenFactory`) and passed as a URL query string on WebSocket upgrade — both are standard SignalR patterns but warrant documentation.
- No Azure Key Vault integration — secrets (`jwtSecret`, SQL admin password) flow as pipeline variables → ARM parameters. Adequate now; Key Vault is the right long-term target.

### Infrastructure & DevOps

*(Synthesized from Tasman's report)*

The CI/CD pipeline is functional: lint, build, and test run before deploy; NuGet and npm vulnerability scans are present; Bicep infrastructure-as-code is deployed from the pipeline. Docker multi-stage builds are correct with non-root runtime users and proper health-checked dependency ordering.

**Gaps:**
- **No Azure SignalR Service resource in Bicep.** The app supports Azure SignalR conditionally but the Bicep template doesn't provision it. Any horizontal scale-out (adding a second App Service instance) will break all in-flight game sessions because SignalR groups are not shared across instances.
- **No Key Vault.** JWT secret and SQL password are Bicep `@secure()` parameters, which is better than hardcoded but worse than Key Vault (no rotation, no audit trail, no access policy).
- **No staging environment.** All deployments go directly to production. No approval gate, no slot swap, no zero-downtime deploy.
- **EF Core has no retry policy** — `UseSqlServer` without `EnableRetryOnFailure` means Azure SQL transient connectivity issues (throttling, failover) cause hard errors.
- **`TroopRegenerationService` has no exception guard** around its timer loop — an unhandled exception will crash the host.
- **No Application Insights** — no request traces, no SQL dependency tracking, no live metrics. Only basic console logging is present.
- **`ASPNETCORE_ENVIRONMENT=Production` in `docker-compose.yml`** — Swagger and developer exception pages are suppressed in local Docker runs, making local debugging harder than needed.
- **`parameters.prod.json` commits an empty `jwtSecret`** — misleading and should use a clear placeholder.
- **B1 App Service Plan** (1 vCore, 1.75 GB RAM) with many concurrent SignalR connections and in-memory game rooms will become a bottleneck under real load.

### Test Coverage & Quality

*(Synthesized from Spinoza's report)*

276 unit tests across 17 test files, expanding to ~300 cases with `[Theory]` InlineData. The test infrastructure is exemplary: `GameStateBuilder` fluent fixture covers all state axes, `ServiceTestContext` wires real services with mocked infrastructure, `FluentAssertions` makes failures readable, and the `Method_Scenario_ExpectedBehavior` naming convention is followed throughout. All tests are deterministic with no `Thread.Sleep` or `DateTime.Now` direct usage.

**Well-covered (≥80%):** `JwtService`, `PasswordService`, `HexService`, `WinConditionService`, `LobbyService`, `RoomService`, `GameplayService`, `AbilityService`, `AllianceConfigService`, `GameConfigService`, `HostControlService`, `MapAreaService`, `GameStateCommon`.

**Partial coverage:** `VisibilityService` (5 tests, ~35% — beacon paths only; fog-of-war owned-territory radius is untested), `VisibilityBroadcastHelper` (3 tests, ~50%), `TroopRegenerationService` (2 tests, ~30% — MaxTroops cap, decay mechanic, and pause-suppressed regen uncovered).

**Zero coverage:** `DerivedMapStateService` (~70 LOC, contains contested-edge alliance-exclusion logic), `GlobalMapService` (~150 LOC, FFA combat + EF writes), `GameTemplateService` (~120 LOC), and all four `GameHub` partial classes (2,160 LOC total — zero hub coverage means auth guards, broadcast routing, and all hub method signatures are invisible to the test suite).

**Specific ability gaps:** `CancelFortConstruction`, `CancelSabotage`, `RespondToTroopTransfer` decline path, `ResolveFieldBattle` defender-wins branch, and `JoinFieldBattle` have zero test coverage. The paused-game guard (`IsPaused`) exists on every hot-path service method but is untested.

**Frontend:** No unit test runner installed. Playwright covers room setup lifecycle and debug GPS panel only — no gameplay moves, SignalR state update rendering, win condition flow, or ability activation UX paths are tested.

---

## Cross-Cutting Concerns

These themes surfaced in multiple domain reports independently:

**1. Rate limiter misconfiguration** (De Ruyter §8, Grotius §4, Huygens §8) — All three analysts flagged the same `Program.cs` configuration producing 3,600 req/min instead of 10 req/min. This is a single-line fix that unblocks security posture improvements.

**2. SQL Server vs PostgreSQL documentation inconsistency** (Huygens §1, Tasman §4) — The actual database engine is SQL Server. Root `.env` references PostgreSQL. Multiple docs say PostgreSQL. This actively misleads new developers.

**3. Oversized service classes invite bugs** (De Ruyter §1, §9; Spinoza §2) — `GameplayService` and `AbilityService` are large enough that their zero-logging status (De Ruyter §8) combined with their zero-test-coverage gaps (Spinoza §2) creates an untestable, unobservable production risk.

**4. GameHub has zero test coverage at 2160 LOC** (De Ruyter §10, Spinoza §2) — Both the backend architect and the QA engineer independently flagged this. The hub contains all auth guards, broadcast orchestration, and parameter validation. A routing regression here would be invisible until production.

**5. Azure SignalR Service absent from Bicep** (Tasman §3, §5) — The codebase conditionally supports Azure SignalR but it's not provisioned. This is a scalability blocker that should be resolved before any production load increase.

**6. No secrets management beyond environment variables** (Grotius §9, Tasman §3) — Both security and DevOps analysts recommend Azure Key Vault. The current approach (pipeline variables → ARM parameters) is adequate for low traffic but doesn't support secret rotation or audit logging.

**7. Frontend has no unit test runner** (Vermeer §10, Spinoza §5) — Both analysts independently flagged this. Vitest setup is a one-time 30-minute investment that unlocks pure-function coverage for `normalizeGrid`, `tileInteraction.ts`, `outcomeDialogQueue`, and `enforceMaxItems`.

---

## Improvement Roadmap

### Phase 1 — Immediate Fixes (1–3 days, no design required)

These are one-liner or near-trivial fixes that resolve critical bugs or security gaps.

1. **Fix rate limiter**: `Window = TimeSpan.FromMinutes(1), PermitLimit = 10` in `Program.cs:129`. *Owner: De Ruyter. Effort: 5 min.*
2. **Fix `GlobalHex.Owner` shadow FK**: add `.HasForeignKey(h => h.OwnerUserId)` in `AppDbContext.OnModelCreating`; add migration dropping `OwnerId` shadow column. *Owner: Huygens/De Ruyter. Effort: 1h.*
3. **Fix root `.env`**: replace PostgreSQL connection string with SQL Server format; correct all PostgreSQL references in `CLAUDE.md` and docs. *Owner: Tasman. Effort: 30 min.*
4. **Add `GlobalHex.OwnerUserId` FK constraint**: migration adding FK with `SetNull` cascade. *Owner: Huygens. Effort: 30 min.*
5. **Add Content-Security-Policy header**: add to security headers middleware. *Owner: Grotius/De Ruyter. Effort: 30 min.*
6. **Conditionalise localhost CORS origins**: wrap `http://localhost:5173` and `http://localhost:3000` in `if (env.IsDevelopment())`. *Owner: Grotius/De Ruyter. Effort: 15 min.*
7. **Add EF Core retry policy**: add `.EnableRetryOnFailure(maxRetryCount: 5)` to `UseSqlServer`. *Owner: De Ruyter. Effort: 5 min.*
8. **Guard `TroopRegenerationService` timer loop**: wrap tick body in `try/catch` to prevent host crash on unhandled exception. *Owner: De Ruyter. Effort: 15 min.*
9. **Add missing hub validations**: `ValidateEnumString<FieldBattleResolutionMode>` in `SetFieldBattleResolutionMode`; `ValidateIdentifier` for `recipientId` in `InitiateTroopTransfer`. *Owner: De Ruyter. Effort: 30 min.*
10. **Verify / disable Swagger in production**: confirm `app.UseSwaggerUI()` is environment-gated. *Owner: De Ruyter. Effort: 15 min.*

### Phase 2 — Structural Improvements (1–2 sprints)

Design decisions are clear; execution is engineering work.

1. **Split `AbilityService`** into `CommanderAbilityService` (~400 lines: raid, tactical strike, rally, troop transfer, field battle), `ScoutAbilityService` (~350 lines: beacon, intel, intercept), `EngineerAbilityService` (~350 lines: fort, sabotage, demolish). Introduce `IRoleAbilityService` interface. *Owner: De Ruyter. Effort: 2–3 days.*
2. **Extract role-progress tracking from `GameplayService`** into `RoleProgressService` (`UpdateFortConstructionProgress`, `UpdateSabotageProgress`, `UpdateDemolishProgress`, `CleanupExpiredSabotageBlockedTiles`, `UpdateScoutSabotageAlert`). *Owner: De Ruyter. Effort: 1 day.*
3. **Extract `RoomScopedService` base class**: eliminate 7× repeated four-liner service boilerplate. *Owner: De Ruyter. Effort: 3h.*
4. **Hub room-lookup helper**: reduce 59 three-line guard blocks to a single reusable method. *Owner: De Ruyter. Effort: 2h.*
5. **Consolidate `QueuePersistence`**: remove duplicate in `RoomService`; route all calls through `GameStateService`. *Owner: De Ruyter. Effort: 1h.*
6. **Replace `MapErrorCode` string-matching** with typed `ServiceError` record from domain services. *Owner: De Ruyter. Effort: 1–2 days.*
7. **Extract `AppOrchestrator` hook from `App.tsx`**: move all hook wiring and store subscriptions. *Owner: Vermeer. Effort: 1 day.*
8. **Split `PlayingHud.tsx`** into `AbilityPanelArea`, `HudInfoArea`, `ModalArea` sub-components. *Owner: Vermeer. Effort: 1–2 days.*
9. **Remove `gameState` from `useSignalRHandlers` memo deps**: replace captures with `useGameplayStore.getState()` reads. *Owner: Vermeer. Effort: 2–3h.*
10. **Remove shadow type definitions**: delete `SignalRInvoke` and `LocationPoint` from 3 files; import from `useGameActions.shared.ts`. *Owner: Vermeer. Effort: 1h.*
11. **Add account lockout** after 5 failed login attempts. *Owner: De Ruyter/Grotius. Effort: 2–4h.*
12. **Add JWT revocation on logout** (in-memory blocklist keyed by `Jti`). *Owner: De Ruyter/Grotius. Effort: 2–4h.*
13. **Add test coverage for priority gaps**: `DerivedMapStateService.ComputeContestedEdges`, `CancelFortConstruction`, `CancelSabotage`, `RespondToTroopTransfer` decline path, `ResolveFieldBattle` defender-wins branch, `JoinFieldBattle`, `VisibilityService` non-beacon paths. *Owner: Spinoza. Effort: ~8h total.*
14. **Install Vitest + first frontend unit tests**: `normalizeGrid`, `outcomeDialogQueue`, `tileInteraction.ts`. *Owner: Spinoza/Vermeer. Effort: 3–4h.*
15. **Room eviction background service**: evict `GameOver` rooms and rooms with no connected players after N hours. *Owner: De Ruyter. Effort: 2–3h.*
16. **Add structured logging to `GameplayService` and `AbilityService`**: log game-significant events at `Debug`/`Information` level. *Owner: De Ruyter. Effort: 2–3h.*
17. **Separate `ResetToken:HmacSecret` from `Jwt:Secret`** config key. *Owner: De Ruyter. Effort: 30 min.*

### Phase 3 — Architectural Evolution (1–2 months)

These require planning, infrastructure provisioning, and coordinated rollout.

1. **Provision Azure SignalR Service in Bicep**: add `Microsoft.SignalR` resource; wire `Azure:SignalR:ConnectionString` app setting. Required before any App Service scale-out. *Owner: Tasman. Effort: 1 day (Bicep) + pipeline update.*
2. **Add Azure Key Vault**: store `jwtSecret` and SQL password in Key Vault; reference from App Service config and pipeline variable group. *Owner: Tasman. Effort: 2–3 days.*
3. **Add Application Insights**: `Microsoft.ApplicationInsights.AspNetCore` NuGet + `APPLICATIONINSIGHTS_CONNECTION_STRING` in Bicep; add Serilog structured logging sinks. Zero code-change telemetry on request traces and SQL dependencies. *Owner: Tasman. Effort: 1 day.*
4. **Add staging environment**: second App Service (or deployment slot), second pipeline stage, manual approval gate for production promotion. *Owner: Tasman. Effort: 2–3 days.*
5. **Hub smoke-test coverage**: at minimum, xUnit integration tests verifying hub method dispatch to service layer using `TestServer` + `HubConnection`. *Owner: Spinoza. Effort: 1–2 days.*
6. **`GlobalMapService` test coverage**: in-memory EF Core or TestContainers for `AttackHexAsync` combat math and write paths. *Owner: Spinoza. Effort: 1 day.*
7. **Ability registry pattern** (frontend): map `AbilityKey → handler factory + card component` to reduce the 7-file modification cost of adding a new ability. *Owner: Vermeer. Effort: 2–3 days.*
8. **Upgrade App Service Plan** from B1 to P1v3 with auto-scale rules (min 1, max 3, CPU threshold). *Owner: Tasman. Effort: Bicep change, 1h.*
9. **Add Log Analytics Workspace + diagnostic settings**: forward App Service HTTP logs and SQL audit logs to central workspace; configure baseline alerts (5xx rate, CPU %). *Owner: Tasman. Effort: 1 day.*
10. **GPS anti-spoofing heuristics**: server-side movement plausibility checks (max speed, coordinate sanity). Game design decision required before implementation. *Owner: Grotius/De Ruyter. Effort: 1–2 days.*

---

## Effort Estimates

| Finding | Owner | Effort | Phase |
|---------|-------|--------|-------|
| Fix rate limiter (`Program.cs`) | De Ruyter | 5 min | 1 |
| Fix `GlobalHex.Owner` shadow FK bug | De Ruyter | 1h | 1 |
| Fix PostgreSQL → SQL Server in docs/env | Tasman | 30 min | 1 |
| Add `OwnerUserId` FK constraint migration | De Ruyter | 30 min | 1 |
| Add Content-Security-Policy header | De Ruyter | 30 min | 1 |
| Conditionalise localhost CORS to development | De Ruyter | 15 min | 1 |
| EF Core retry on failure | De Ruyter | 5 min | 1 |
| `TroopRegenerationService` exception guard | De Ruyter | 15 min | 1 |
| Missing hub validations (FieldBattle, TroopTransfer) | De Ruyter | 30 min | 1 |
| Verify Swagger disabled in production | De Ruyter | 15 min | 1 |
| Split `AbilityService` into 3 role services | De Ruyter | 2–3 days | 2 |
| Extract `RoleProgressService` from `GameplayService` | De Ruyter | 1 day | 2 |
| `RoomScopedService` base class | De Ruyter | 3h | 2 |
| Hub room-lookup helper (59 guard blocks) | De Ruyter | 2h | 2 |
| Consolidate `QueuePersistence` | De Ruyter | 1h | 2 |
| Replace `MapErrorCode` string-matching with typed errors | De Ruyter | 1–2 days | 2 |
| Extract `useAppOrchestrator` from `App.tsx` | Vermeer | 1 day | 2 |
| Split `PlayingHud.tsx` into sub-components | Vermeer | 1–2 days | 2 |
| Remove `gameState` dep from `useSignalRHandlers` memo | Vermeer | 3h | 2 |
| Remove shadow `SignalRInvoke`/`LocationPoint` types | Vermeer | 1h | 2 |
| Account lockout after failed logins | De Ruyter | 2–4h | 2 |
| JWT revocation blocklist on logout | De Ruyter | 2–4h | 2 |
| Backend test gap coverage (8 priorities) | Spinoza | ~8h | 2 |
| Install Vitest + frontend unit tests | Vermeer | 3–4h | 2 |
| Room eviction background service | De Ruyter | 3h | 2 |
| Structured logging in GameplayService + AbilityService | De Ruyter | 3h | 2 |
| Separate `ResetToken:HmacSecret` config | De Ruyter | 30 min | 2 |
| Provision Azure SignalR Service in Bicep | Tasman | 1 day | 3 |
| Azure Key Vault integration | Tasman | 2–3 days | 3 |
| Application Insights + Serilog | Tasman | 1 day | 3 |
| Staging environment + pipeline stage | Tasman | 2–3 days | 3 |
| Hub smoke-test coverage (xUnit + TestServer) | Spinoza | 1–2 days | 3 |
| `GlobalMapService` test coverage | Spinoza | 1 day | 3 |
| Ability registry pattern (frontend) | Vermeer | 2–3 days | 3 |
| App Service B1 → P1v3 + auto-scale | Tasman | 1h | 3 |
| Log Analytics + diagnostic settings + alerts | Tasman | 1 day | 3 |
| GPS anti-spoofing heuristics | De Ruyter | 1–2 days | 3 |

---

*Analysis conducted 2026-03-25 by Rembrandt (Lead), Vermeer (Frontend), De Ruyter (Backend), Grotius (Security), Huygens (Data/DB), Tasman (DevOps), Spinoza (Testing)*
