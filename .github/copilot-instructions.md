# Copilot Instructions

## Build, Run & Lint

**Backend** (ASP.NET Core 8, from `backend/Landgrab.Api/`):
```bash
dotnet run                          # Start API at http://localhost:5000
dotnet build                        # Build only
dotnet ef migrations add <Name>     # Add EF Core migration
dotnet ef database update           # Apply migrations manually (auto-runs on startup too)
```

**Frontend** (React + Vite, from `frontend/landgrab-ui/`):
```bash
npm run dev       # Dev server at http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```

There is no test suite currently.

## Architecture Overview

Two game modes with distinct persistence models:
- **Alliances (room-based):** Fully in-memory. `GameService` (Singleton) owns all active room state in a `ConcurrentDictionary`. Rooms disappear when the server restarts.
- **Free-for-All (global map):** Persistent via PostgreSQL. `GlobalMapService` (Scoped) reads/writes `GlobalHex` rows.

**Request flow:**
1. Auth (HTTP): `POST /api/auth/*` → returns JWT
2. Game actions (WebSocket): Frontend invokes SignalR hub methods → backend mutates state → broadcasts updated `GameState` to the room group. **No HTTP endpoints for game actions.**
3. Vite dev proxy forwards `/api` and `/hub` to `localhost:5000`, so the frontend never hardcodes the backend URL.

**Startup auto-migration:** `db.Database.MigrateAsync()` runs on every startup. Migrations can fail silently (logged as warning) so the app still starts.

**SignalR authentication:** The JWT is passed as a query string (`?access_token=...`) for WebSocket connections. The `OnMessageReceived` event in `Program.cs` extracts it so `[Authorize]` works on the hub.

## Key Conventions

### Backend

**Endpoint registration** — each domain has an extension method on `WebApplication`:
```csharp
public static void MapAllianceEndpoints(this WebApplication app) { ... }
// Called in Program.cs as: app.MapAllianceEndpoints();
```

**JWT claims extraction in hub** — user identity is read from two possible claims (both are present):
```csharp
context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value
context.User?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
```

**Hex coordinate system** — axial `(Q, R)` throughout. Grid key format is the string `"q,r"` (e.g. `"3,-2"`). `HexService` provides all neighbor/adjacency/spiral math. The global map uses 1 hex ≈ 1 km scale with flat-top orientation.

**In-game alliances vs. persistent alliances** — `AllianceDto` (transient, lives in `GameState`) is separate from the `Alliance` EF entity (persistent, for FFA mode). Do not conflate them.

**Per-game color assignment** — player and alliance colors are auto-assigned by index from fixed arrays in `GameService`. Do not prompt the user to choose colors.

**Rate limiting** — the `"auth"` policy (10 req/min/IP) is applied to all `/api/auth/*` endpoints. New auth endpoints must add `.RequireRateLimiting("auth")`.

**BCrypt work factor** is 12. Password minimum is 8 characters (validated in endpoint, not model).

### Frontend

**Server is the source of truth** — the frontend never mutates game state locally. All state flows in via SignalR events (`StateUpdated`, `CombatResult`, etc.). `App.tsx` holds all `useState`; components are pure display + callback props.

**No state management library** — plain `useState` in `App.tsx`. Props drilling is intentional.

**Stale closure fix in `useSignalR`** — event handlers are stored in a `useRef` (`eventsRef`) and updated on every render. The SignalR listeners always call `eventsRef.current.*` rather than the captured closure. Follow this pattern when adding new hub events.

**`fetch` for HTTP, `invoke` for game actions** — `useAuth` uses native `fetch`. Everything game-related uses `invoke(method, ...args)` from `useSignalR`. `axios` is installed but not used.

**TypeScript strictness** — `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. All code must pass `tsc -b` cleanly.

**Grid key format matches backend** — `gameState.grid` is `Record<string, HexCell>` keyed by `"q,r"`. Use `\`${q},${r}\`` to look up or set hex cells.

### Configuration

Required env/config values:
| Key | Notes |
|-----|-------|
| `ConnectionStrings:DefaultConnection` | PostgreSQL connection string |
| `Jwt:Secret` | Min 32 chars, validated on startup |
| `App:BaseUrl` | Frontend URL used in password-reset emails |
| `Azure:SignalR:ConnectionString` | Optional; omit to use local SignalR |
| `AzureCommunicationServices:ConnectionString` | Optional; omit to skip email sending (logged instead) |
