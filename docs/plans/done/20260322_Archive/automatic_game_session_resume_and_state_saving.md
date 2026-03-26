# Plan: Game Session Resume & Reconnection

## TL;DR
Allow users to seamlessly resume their game session after phone lock, browser close, or server restart. The frontend persists the room code to `localStorage` and auto-rejoins after reconnection. The backend gains a `RejoinRoom` hub method (find room by userId) and persists room state to PostgreSQL so rooms survive server restarts. SignalR reconnection is hardened with an aggressive retry policy.

---

## Phase 1: Frontend — Session Persistence & Auto-Rejoin

**Goal:** Save room code to localStorage; auto-rejoin on page reload or SignalR reconnection.

### Steps

1. **Add session storage helpers in `App.tsx`**
   - New localStorage key `'landgrab_session'` storing `{ roomCode: string }`
   - `saveSession(roomCode)` — called whenever `gameState` updates with a valid `roomCode`
   - `clearSession()` — called on: game over "play again", explicit logout, or when `JoinRoom`/`RejoinRoom` returns an error indicating room no longer exists
   - On mount, load saved session into a ref/state

2. **Extend `useSignalR` hook to support a rejoin callback**
   - Add optional `onReconnected?: () => void` to the `GameEvents` interface
   - In the `conn.onreconnected()` handler, call `eventsRef.current.onReconnected?.()`
   - This lets `App.tsx` know when to auto-rejoin

3. **Auto-rejoin logic in `App.tsx`**  
   - New `useEffect` that fires when `connected` transitions to `true`:
     - Read `'landgrab_session'` from localStorage
     - If a `roomCode` exists, invoke `JoinRoom(roomCode)` (the backend already handles existing-player reconnection)
     - If JoinRoom fails (room gone), try `RejoinRoom()` (Phase 3 hub method) as fallback
     - If both fail, `clearSession()` and land user on lobby
   - This covers: page reload, phone lock/unlock, tab close/reopen, SignalR reconnect after network blip

4. **Update event handlers to save session**
   - `onRoomCreated` → `saveSession(state.roomCode)`
   - `onPlayerJoined` → `saveSession(state.roomCode)` (for the joiner)
   - `onStateUpdated` → `saveSession(state.roomCode)` (keeps it fresh)
   - `handlePlayAgain` → `clearSession()`
   - `logout` → `clearSession()`

**Files to modify:**
- `frontend/landgrab-ui/src/App.tsx` — session save/load/clear, auto-rejoin effect, event handler updates
- `frontend/landgrab-ui/src/hooks/useSignalR.ts` — `onReconnected` callback in `GameEvents`

---

## Phase 2: Frontend — Resilient SignalR Reconnection

**Goal:** Handle intermittent drops and long disconnects (phone lock, subway, etc.) without giving up.

### Steps

5. **Custom retry policy in `useSignalR`**
   - Replace `.withAutomaticReconnect()` with `.withAutomaticReconnect(retryDelays)` where `retryDelays` = `[0, 1000, 2000, 5000, 10000, 15000, 30000, 30000, 30000, 30000, 60000, 60000, 60000]` (~4 min of retries covering most phone-lock scenarios)
   - Alternative: pass a custom `IRetryPolicy` object with `nextRetryDelayInMilliseconds` that retries indefinitely with capped delay (e.g. every 30s up to 10 min)

6. **Manual reconnect fallback on `onclose`**
   - When `onclose` fires (all auto-retries exhausted), start a periodic timer (every 15 seconds) that calls `conn.start()`
   - On success: `setConnected(true)`, stop timer — the auto-rejoin effect from Phase 1 step 3 kicks in
   - On unmount: clear timer
   - Cap total manual retry time at ~10 minutes, then give up and show "Connection lost" UI

7. **Add `reconnecting` state (optional but recommended)**
   - Expose `reconnecting: boolean` from `useSignalR` alongside `connected`
   - Set via `conn.onreconnecting()` callback
   - `App.tsx` can show a subtle banner: "Reconnecting..." so users know the app is trying

**Files to modify:**
- `frontend/landgrab-ui/src/hooks/useSignalR.ts` — custom retry policy, manual reconnect loop, `reconnecting` state

---

## Phase 3: Backend — RejoinRoom Hub Method

**Goal:** Let the frontend rejoin without needing the room code (find room by userId). Also serves as fallback if localStorage is cleared.

### Steps

8. **Add `GetRoomByUserId(string userId)` to `GameService`**
   - Scan `_rooms.Values` for a room where `State.Players.Any(p => p.Id == userId)`
   - Return the first match (a user can only be in one active room)

9. **Add `RejoinRoom()` hub method to `GameHub`**
   - Calls `gameService.GetRoomByUserId(UserId)`
   - If found: call `gameService.JoinRoom(room.Code, UserId, Username, ConnectionId)` to register the new connection
   - Add connection to SignalR group
   - Send `StateUpdated` to caller with current snapshot
   - If not found: send `Error("No active room found.")`
   - Returns the room code to the caller so the frontend can save it to localStorage

**Files to modify:**
- `backend/Landgrab.Api/Services/GameService.cs` — new `GetRoomByUserId()` method
- `backend/Landgrab.Api/Hubs/GameHub.cs` — new `RejoinRoom()` method

---

## Phase 4: Backend — Room State Persistence (survive server restarts)

**Goal:** Persist room state to PostgreSQL so active games survive backend restarts/redeploys.

### Steps

10. **New `PersistedRoom` entity**
    - `Code` (string, PK) — room code
    - `HostUserId` (Guid)
    - `StateJson` (string, JSONB column) — serialized `GameState`
    - `Phase` (string) — denormalized for querying (Lobby/Playing/GameOver)
    - `IsActive` (bool, default true) — false when game ends
    - `CreatedAt` (DateTime)
    - `UpdatedAt` (DateTime)

11. **Register `PersistedRoom` in `AppDbContext`**
    - Add `DbSet<PersistedRoom>`
    - Configure in `OnModelCreating`: PK on Code, JSONB column type for StateJson

12. **Add EF Core migration**
    - `dotnet ef migrations add AddPersistedRooms`

13. **Create `RoomPersistenceService` (Singleton)**
    - Injected with `IServiceScopeFactory` (since GameService is singleton, we need scoped DbContext)
    - `PersistRoomAsync(GameRoom room)` — serialize `room.State` to JSON, upsert `PersistedRoom` using `Code` as key. Use debouncing: buffer writes and flush at most once per second per room to avoid DB hammering during rapid state changes
    - `DeactivateRoomAsync(string code)` — set `IsActive = false`, `UpdatedAt = now`
    - `RestoreActiveRoomsAsync()` — load all `IsActive == true` rows, deserialize `StateJson` back to `GameState`, return list of reconstituted `GameRoom` objects (with empty `ConnectionMap` since all connections are dead after restart)

14. **Wire persistence into `GameService`**
    - Inject `RoomPersistenceService` into `GameService` constructor
    - After each state-mutating method (JoinRoom, SetMapLocation, StartGame, PlaceTroops, etc.), call `PersistRoomAsync(room)` (fire-and-forget with error logging — don't block gameplay on DB writes)
    - On room creation, call `PersistRoomAsync(room)`
    - When game ends (Phase → GameOver), call `DeactivateRoomAsync(code)`

15. **Restore rooms on startup in `Program.cs`**
    - After `MigrateAsync()`, call `RoomPersistenceService.RestoreActiveRoomsAsync()`
    - Pass results to `GameService.RestoreRooms(rooms)` — new method that populates `_rooms` dictionary
    - Log count of restored rooms

16. **Cleanup stale rooms**
    - Add cleanup logic: on startup, deactivate any room with `UpdatedAt` older than 24 hours (configurable)
    - Or run as a periodic `BackgroundService` that cleans up nightly

**Files to create:**
- `backend/Landgrab.Api/Models/PersistedRoom.cs` — new entity
- `backend/Landgrab.Api/Services/RoomPersistenceService.cs` — persistence logic

**Files to modify:**
- `backend/Landgrab.Api/Data/AppDbContext.cs` — add DbSet and configuration
- `backend/Landgrab.Api/Services/GameService.cs` — inject persistence service, call persist after mutations, add `RestoreRooms()` method
- `backend/Landgrab.Api/Program.cs` — register `RoomPersistenceService`, restore rooms on startup
- New migration file (auto-generated)

---

## Verification

1. **Phone lock test:** Join a room → lock phone for 30s → unlock → verify game state is restored and location updates resume
2. **Tab close test:** Join a room in progress → close browser tab → reopen `localhost:5173` → verify auto-rejoin to the same room
3. **Network blip test:** Join a playing game → disable Wi-Fi for 10s → re-enable → verify reconnection and state sync
4. **Server restart test (Phase 4):** Start a game → restart the backend (`dotnet run`) → wait for frontend to reconnect → verify room exists and game continues
5. **Stale session test:** Save a session in localStorage manually for a non-existent room → reload → verify graceful fallback to lobby (no crash/infinite loop)
6. **Multi-device test:** Log in on two tabs for the same user → close one tab → verify the other continues working
7. **Build verification:** `dotnet build` passes, `npm run build` passes, `npm run lint` passes

---

## Decisions

- **localStorage over sessionStorage** — sessionStorage is cleared on tab close, defeating the purpose. localStorage persists across browser sessions.
- **`JoinRoom` for rejoin (not a separate method)** — the backend `JoinRoom` already handles existing players gracefully. The new `RejoinRoom` is a convenience fallback that doesn't require knowing the room code.
- **Fire-and-forget persistence** — DB writes don't block gameplay. If a write fails, the next mutation will retry. Acceptable risk: up to 1 second of state loss on crash.
- **JSONB for state** — serializing the entire `GameState` is simpler than modeling 20+ columns. Queries only need `Code`, `IsActive`, and `Phase`.
- **GameRoom already has `[JsonIgnore]` on `SyncRoot` and `ConnectionMap`** — these transient fields won't be persisted, which is correct (connections are ephemeral).
- **Scope:** Only Alliances (room-based) mode. FFA mode is already persistent via `GlobalHex` table.

## Resolved Considerations

1. **Connection status UI:** Yes — show a "Reconnecting…" banner using the exposed `reconnecting` state.
2. **Persistence scope:** Only persist on important mutations (join, start, troop place/pickup, game over). No location-only updates persisted.
3. **JWT lifetime:** Already 7 days — no issue.

**Status: APPROVED — ready for implementation.**
