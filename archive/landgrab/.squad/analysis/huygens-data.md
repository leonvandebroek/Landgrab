# Huygens — Data & Database Architecture Analysis

_Completed: 2026-03-22 | Analyst: Huygens (Data/DB Engineer)_  
_Status: READ-ONLY analysis — no application files modified_

---

## 1. Schema Design

### Current State
The schema lives in `AppDbContext.cs` and spans eight tables: `Users`, `Alliances`, `AllianceMembers`, `GlobalHexes`, `GameEvents`, `PasswordResetTokens`, `PersistedRooms`, and `MapTemplates`. Two migrations exist: `20260313131210_InitialSqlServer` and `20260313150025_AddMapTemplates`. The model snapshot (`AppDbContextModelSnapshot`) reveals the deployed shape.

**The actual database engine is SQL Server 2022 (MSSQL)** via `UseSqlServer()` in `Program.cs` and the MSSQL Docker image in `docker-compose.yml`. Several documentation files refer to "PostgreSQL" — this is incorrect and should be corrected to avoid confusion.

### Strengths
- Unique indices on `Users.Username` and `Users.Email` correctly prevent duplicate accounts at the DB level.
- `GlobalHex` uses a natural composite PK `(Q, R)` — appropriate for a fixed hex grid.
- `PersistedRooms` uses the 6-character room code as PK — clean and avoids a surrogate key for this entity.
- `MapTemplate.HexCoordinatesJson` stores arbitrary hex shapes as JSON without requiring a second normalised table — sensible for an evolving feature.
- `PasswordResetToken` cascades on delete from `User` — no orphan tokens.
- `AllianceMember` composite PK `(UserId, AllianceId)` prevents duplicate memberships.

### Recommendations
1. **Correct the PostgreSQL documentation** — all references to PostgreSQL in `CLAUDE.md`, custom instructions, and Huygens history should say SQL Server. The actual stack is MSSQL 2022.
2. **Normalise `GlobalHex.OwnerAllianceId`** — currently nullable with no FK constraint configured in `AppDbContext.OnModelCreating`. If an `Alliance` is deleted, the FK in `GlobalHexes` will become stale (no cascade configured, no explicit constraint). Add `.HasForeignKey(h => h.OwnerAllianceId)` with an appropriate delete behaviour.
3. **`GameEvents` table is dead weight** — no service code writes to it. Either wire it up or remove it from the schema to reduce confusion and migration complexity.

---

## 2. EF Core Usage Patterns

### Current State
`GlobalMapService` (Scoped) is the only service that directly touches EF Core. `RoomPersistenceService` (Singleton) creates its own scopes via `IServiceScopeFactory` to avoid the lifetime mismatch. Auth endpoints inject `AppDbContext` directly.

### Strengths
- All read-only queries in `GlobalMapService` correctly use `.AsNoTracking()` (`GetHexesForUserAsync`, `GetHexesNearAsync`, `EnsurePlayerHasStartingHex`'s occupied-hex lookup, leaderboard, `RestoreActiveRoomsAsync`).
- The leaderboard query translates cleanly to a single SQL `GROUP BY … JOIN` via LINQ — no N+1 risk.
- `RoomPersistenceService` correctly uses `IServiceScopeFactory` to resolve a scoped `AppDbContext` from a singleton, avoiding the classic lifetime injection bug.

### Recommendations
4. **`GlobalHex.Owner` navigation always returns `null` — critical bug.** `GlobalHex` declares `public User? Owner { get; set; }` and `AppDbContext` does not explicitly configure a FK for this relationship. EF Core auto-generates a **shadow `OwnerId` property** as the FK column (confirmed in the snapshot: `b.HasForeignKey("OwnerId")`). Meanwhile, `OwnerUserId` is a separately indexed column that is never linked to the navigation. Result: every `Include(h => h.Owner)` call (used in `GetHexesForUserAsync` and `GetHexesNearAsync`) always returns `null` even when `OwnerUserId` is populated. Fix: in `AppDbContext.OnModelCreating`, add `.HasForeignKey(h => h.OwnerUserId)` to the `GlobalHex → User` relationship (and drop the redundant `OwnerId` shadow column via a migration).
5. **`Include` on read queries loads unnecessary data.** `GetHexesForUserAsync` and `GetHexesNearAsync` include full `Owner` and `OwnerAlliance` navigation objects. For display purposes, projecting to a DTO with `.Select()` would be more efficient and avoids the shadow-column bug entirely.
6. **`ForgotPassword` loads all unused tokens then loops them in C#.** `var oldTokens = await db.PasswordResetTokens.Where(t => t.UserId == user.Id && !t.Used).ToListAsync()` followed by a `foreach` that sets `t.Used = true` is a manual batch update. Replace with `ExecuteUpdateAsync` (EF Core 7+): `await db.PasswordResetTokens.Where(...).ExecuteUpdateAsync(s => s.SetProperty(t => t.Used, true))`.

---

## 3. In-Memory State (Alliances Mode)

### Current State
`RoomService` owns a `ConcurrentDictionary<string, GameRoom> _rooms`. All mutations to a room's `GameState` go through `lock (room.SyncRoot)` which is a plain `object`. `GameRoom.ConnectionMap` and `GameRoom.VisibilityMemory` are themselves `ConcurrentDictionary` instances. `RoomService` is registered as a **Singleton**.

### Strengths
- The two-level concurrency model (ConcurrentDictionary for room lookup + `SyncRoot` lock for state mutation) is sound: room creation/removal is lock-free; within-room state changes are serialised.
- `SnapshotState` in `GameStateCommon` deep-copies `GameState` before serialisation and SignalR broadcast, preventing mutations to live state leaking into the wire representation.
- `EventLog` is capped at 100 entries (`MaxEventLogEntries = 100`) preventing unbounded growth inside each room's state.
- Player reconnection is handled gracefully: stale connections are cleaned up and `IsConnected` is toggled rather than re-adding the player.

### Recommendations
7. **Rooms are never evicted from `_rooms` at runtime.** `RemoveConnection` marks players as disconnected but never removes the `GameRoom`. Rooms in `GameOver` phase are skipped in summary queries but remain in the dictionary indefinitely. On a server with many short games, `_rooms` will grow without bound until restart. Add a background eviction pass (e.g., every hour) to remove rooms that are `GameOver` or have no connected players and were last updated more than N hours ago. Pair this with calling `RoomPersistenceService.DeactivateRoomAsync` so the DB reflects the eviction.
8. **Server restart during an active Alliances game:** Players lose their position (GPS coordinates cleared on restore), carried troops are returned (done correctly in `RestoreActiveRoomsAsync`), and all connections reset. The room is restored from `PersistedRooms` and game can resume when players reconnect. This is an acceptable degraded-recovery story for a real-time game, but players are not notified proactively — they will see a disconnected state until they reload.
9. **`GetRoomByConnection` does a linear scan** (`_rooms.Values.FirstOrDefault(room => room.ConnectionMap.ContainsKey(connectionId))`). For a small number of concurrent rooms this is fine, but at scale a reverse `ConcurrentDictionary<connectionId, roomCode>` would be O(1).

---

## 4. Migration Strategy

### Current State
Auto-migration runs at startup inside a `try/catch` that logs a warning on failure and continues. Only two migrations exist. Both use SQL Server-specific types.

### Strengths
- Startup migration is fail-safe (the app keeps running if the DB is unavailable), which is appropriate for cloud deployments where DB readiness is not guaranteed before app startup.
- Room restore and stale-room deactivation are wrapped in the same `try/catch` block, so a DB outage doesn't crash startup.
- Migration files are minimal and well-structured.

### Recommendations
10. **The fail-silent migration is a production risk.** If a breaking schema change (e.g., a `NOT NULL` column addition) fails silently, the app starts against an incompatible schema and only fails when a query hits the new column. Consider adding a health-check endpoint that reflects migration status, or at minimum log the pending migration count on every startup.
11. **No migration for `OwnerAllianceId` FK constraint on `GlobalHexes`.** The initial migration creates `OwnerAllianceId` as a bare nullable column with no FK constraint. If an Alliance is deleted, no cascade occurs and the hex retains a dangling GUID. A follow-up migration adding the FK would harden this.

---

## 5. Data Integrity

### Current State
Most FK relationships are enforced at DB level via EF Core's Fluent API. Cascade delete is applied for `AllianceMember → User`, `AllianceMember → Alliance`, `PasswordResetToken → User`, and `MapTemplate → User`.

### Strengths
- `User` deletion cascades cleanly through `AllianceMember` and `PasswordResetToken` and `MapTemplate`.
- Password reset tokens are hashed using `HMACSHA256(rawToken, Jwt:Secret)` — raw tokens are never stored.
- `PersistedRooms` has no FK to `Users` — intentional, since rooms outlive user involvement.

### Recommendations
12. **`GlobalHex.OwnerUserId` has no FK constraint.** If a `User` is deleted, their hexes remain claimed in the global map with a dangling `OwnerUserId`. Add a FK with `OnDelete(DeleteBehavior.SetNull)` to reset ownership when a user is deleted.
13. **`GlobalHex.OwnerAllianceId` has no FK constraint** (see §1 and §4). Same risk for alliances.
14. **Password reset uses `Jwt:Secret` as the HMAC key.** This means rotating the JWT signing secret also invalidates all outstanding password reset tokens. Consider a dedicated `ResetToken:HmacSecret` configuration key so the two secrets can be rotated independently.
15. **`Alliance.CreatedBy` is not a FK.** Deleting the creator user leaves `CreatedBy` pointing to a non-existent GUID. If this field ever becomes meaningful (e.g., leadership transfer), add a FK constraint.

---

## 6. Query Performance

### Current State
The FFA map is global-scale (1 hex ≈ 1 km). The `GlobalHexes` table could grow to tens of thousands of rows in a populated deployment.

### Strengths
- `GetHexesNearAsync` uses a bounding box pre-filter `(Q >= centerQ - approxRadius && Q <= centerQ + approxRadius …)` which, with the `(Q, R)` composite PK index, should allow a range scan rather than a full table scan.
- The leaderboard `GroupBy → Take(20) → Join` query translates to a single SQL statement.
- `EnsurePlayerHasStartingHex` queries only the bounding box of candidate hexes, not the whole table.

### Recommendations
16. **`GetHexesNearAsync` bounding box is rectangular, not circular.** At `radiusKm = 50`, the box is 100×100 = 10,000 hex cells (some outside the intended circle). At global scale with many players, this returns unnecessary rows. Consider adding a hex-distance filter in SQL or tightening the radius. At current expected volumes (neighbourhood scale) this is low priority.
17. **The `OwnerUserId` and the shadow `OwnerId` both have indices on `GlobalHexes`.** Once the ghost-column bug is resolved, the redundant `OwnerId` index should be dropped.
18. **`DeactivateStaleRoomsAsync` loads all stale room codes then deactivates them one-by-one**, each acquiring a `RoomWriteLock`. For a large backlog this is sequential round-trips to the DB. An `ExecuteUpdateAsync` batch would be more efficient.

---

## 7. Two-Mode Architecture (In-Memory vs Persistent)

### Current State
- **Alliances mode** — fully in-memory in `RoomService._rooms` (Singleton). Periodically snapshotted to `PersistedRooms` via fire-and-forget `Task.Run` in `RoomService.QueuePersistence`.
- **FFA mode** — fully persistent in `GlobalHexes` via `GlobalMapService` (Scoped).
- The boundary is cleanly enforced: `GlobalMapService` never touches `_rooms`; `GameService` / `RoomService` never touch `GlobalHexes`.

### Strengths
- The duality is architecturally clean: separate service classes, separate DI lifetimes, no shared mutable state.
- Persistence is fire-and-forget for Alliances rooms, so it never blocks the real-time game loop.
- `RoomPersistenceService` uses per-room write locks (`ConcurrentDictionary<string, RoomWriteLock>`) to prevent interleaved writes for the same room code.
- `RestoreActiveRoomsAsync` correctly rebuilds the hex grid from scratch if `Grid.Count == 0`, preventing empty-map restores.

### Recommendations
19. **The fire-and-forget persistence pattern can lose state.** If the server process crashes between a `QueuePersistence` call and the background `Task.Run` completing, the last N seconds of game state are lost. For Lobby and GameOver phases this is low risk. For mid-game this means players reconnect to a slightly stale state. This is a known and acceptable trade-off for a real-time game, but it should be documented explicitly.
20. **`PersistedRooms.StateJson` is unbounded `nvarchar(max)`.** A fully active room with 30 players, hundreds of hex cells, and ability state can generate a JSON blob over 100 KB. Monitor blob sizes as game features grow.

---

## 8. User & Auth Persistence

### Current State
`User` stores: `Id (Guid)`, `Username (30 chars)`, `Email (254 chars)`, `PasswordHash (BCrypt w/ work factor 12)`, `EmailVerified (bool)`, `CreatedAt`. `PasswordResetToken` stores the HMAC-SHA256 hash of the raw token, expiry, used flag, and cascade FK to `User`.

### Strengths
- BCrypt work factor 12 is appropriate (well above the minimum recommended 10).
- Password minimum length (8 chars) enforced in the endpoint layer.
- Reset tokens are single-use (`Used = true` on consumption).
- Email enumeration is prevented — `ForgotPassword` always returns 200 OK.
- Auth cookies are `HttpOnly`, `Secure` (in production), `SameSite=Strict`.
- Username/email uniqueness enforced at both app level (`AnyAsync` check) and DB level (unique indices).

### Recommendations
21. **`PasswordResetToken.TokenHash` has no length constraint.** A `HMACSHA256` hash Base64-encoded is 44 characters. Adding `.HasMaxLength(64)` tightens the column and enables a more efficient index for the lookup in `ResetPassword`.
22. **No index on `PasswordResetToken.ExpiresAt` or `(UserId, Used)`.** The reset-password lookup filters on `(TokenHash, Used, ExpiresAt)`. Currently only `UserId` is indexed. The query scans all tokens for the matching hash with a column predicate on `Used` and `ExpiresAt`. For a table with many tokens this could be slow; a composite index on `(TokenHash, Used)` or `(UserId, Used, ExpiresAt)` would help.
23. **JWT rate limiter comment vs code mismatch.** The `CLAUDE.md` custom instruction documents the `"auth"` rate limit policy as "10 req/min/IP". The actual code (`Program.cs`) configures `Window = TimeSpan.FromSeconds(1), PermitLimit = 60` — which is **3,600 requests/minute per IP**, 360× more permissive than documented. This should either be corrected in the code (if 10/min was intended) or in the documentation (if 60/sec is intentional).

---

## Priority Improvement List

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | **`GlobalHex.Owner` always null (shadow FK bug)** — `AppDbContext` never maps `OwnerUserId` to the `Owner` navigation; EF creates a shadow `OwnerId` column. `Include(h => h.Owner)` always returns null. | High (feature broken) | Low (1 line in `OnModelCreating` + migration to drop `OwnerId`) |
| 2 | **No FK/cascade for `GlobalHex.OwnerUserId` → `User`** — user deletion leaves dangling GUIDs on all their hexes. | Medium (data integrity) | Low (migration + `SetNull` FK) |
| 3 | **Rooms never evicted from `_rooms` at runtime** — memory grows unboundedly across server lifetime. | Medium (ops) | Medium (background hosted service or TTL check in `GetPlayingRoomCodes`) |
| 4 | **`GameEvents` table is dead code** — adds schema complexity, migration overhead, and confusion without any writer. | Low-Medium (maintainability) | Low (remove table + migration, or wire it up) |
| 5 | **Rate limiter 60/sec vs documented 10/min** — either a security gap or a documentation error; needs resolution. | Medium (security or docs) | Low |
| 6 | **`GlobalHex.OwnerAllianceId` has no FK constraint** — alliance deletion leaves stale GUIDs in the map. | Medium (data integrity) | Low (migration) |
| 7 | **`ForgotPassword` uses in-memory loop for token invalidation** — replace with `ExecuteUpdateAsync` for efficiency. | Low (perf at scale) | Low |
| 8 | **`PasswordResetToken` missing indices and column length constraint** — `TokenHash` unbounded; no index on `(TokenHash, Used)`. | Low-Medium (perf/correctness) | Low |

---

_Written by Huygens — Data/DB Engineer_
