# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React 19 + TypeScript)                                │
│                                                                 │
│  ┌──────────────┐   HTTP (fetch)   ┌─────────────────────────┐ │
│  │   useAuth    │ ──────────────►  │  /api/auth/*            │ │
│  └──────────────┘                  │  /api/alliances/*       │ │
│                                    │  /api/global/*          │ │
│  ┌──────────────┐  WebSocket       │                         │ │
│  │ useSignalR   │ ◄────────────►   │  /hub/game              │ │
│  └──────────────┘   SignalR        └──────────┬──────────────┘ │
│                                               │                │
└───────────────────────────────────────────────┼────────────────┘
                            ASP.NET Core 8       │
                            ┌────────────────────▼───────────────┐
                            │  GameHub  (SignalR)                │
                            │  GameService  (Singleton)          │
                            │  GlobalMapService  (Scoped)        │
                            │  HexService  (Static helpers)      │
                            │  JwtService / PasswordService      │
                            │  EmailService                      │
                            └────────────────┬───────────────────┘
                                             │  EF Core 8
                                  ┌──────────▼─────────┐
                                  │   PostgreSQL 16     │
                                  │  (persistent FFA    │
                                  │   data only)        │
                                  └─────────────────────┘
```

---

## Two Game Modes

### Alliances (Room-based, In-memory)

- Host calls `CreateRoom` → server creates a `GameRoom` in a `ConcurrentDictionary`
- Room is identified by a 6-character alphanumeric code (no ambiguous characters)
- Game state lives entirely in memory — **no database involvement**
- Supports 2–4 players; up to 4 alliances per game
- On every state change, server pushes `StateUpdated` to all members of that room's SignalR group
- Rooms disappear if the server restarts

### Free-for-All (Global Map, Persistent)

- Single shared map for all registered users
- One hex ≈ 1 km² at the real-world location the player is in
- Hex ownership (`GlobalHex` rows) persists in PostgreSQL
- On joining, the server drops the player on the nearest unclaimed hex (within 5-hex radius, 3 starting troops)
- Attack has a 5-minute cooldown after failure
- Leaderboard available via HTTP endpoint

---

## Request / Real-time Split

| Concern | Transport | Notes |
|---------|-----------|-------|
| Register / Login / Password reset | HTTP (`/api/auth/*`) | Rate-limited (10 req/min/IP) |
| Alliance management | HTTP (`/api/alliances/*`) | Persistent FFA alliances only |
| Global hex reads & leaderboard | HTTP (`/api/global/*`) | Paginated |
| All game actions | SignalR WebSocket (`/hub/game`) | Invoke method → broadcast state |

---

## Authentication

1. Client registers or logs in via HTTP → receives `{ token, username, userId }`
2. Token is stored in `localStorage` under key `landgrab_auth`
3. For SignalR, `HubConnectionBuilder` passes the token via `accessTokenFactory`; the WebSocket URL becomes `/hub/game?access_token=<token>`
4. `OnMessageReceived` in `Program.cs` extracts the query-string token so `[Authorize]` works on the hub
5. JWT is HS256, signed with `Jwt:Secret`, expires in 7 days

---

## Backend Architecture

### Service Lifetimes

| Service | Lifetime | Notes |
|---------|----------|-------|
| `GameService` | Singleton | Owns all in-memory room state |
| `GlobalMapService` | Scoped | EF Core context per request |
| `HexService` | Static | Pure math helpers — no DI |
| `JwtService` | Singleton | Token generation |
| `PasswordService` | Singleton | BCrypt hash/verify |
| `EmailService` | Scoped | ACS integration |

### Endpoint Registration

Each domain registers its endpoints via an extension method on `WebApplication`:

```csharp
app.MapAuthEndpoints();        // /api/auth/*
app.MapAllianceEndpoints();    // /api/alliances/*
app.MapGlobalMapEndpoints();   // /api/global/*
```

### Startup Auto-migration

`db.Database.MigrateAsync()` runs every startup. Failures are logged as warnings — the app still starts so a single DB outage does not permanently brick the service.

---

## Frontend Architecture

### State Management

All state lives in `App.tsx` as plain `useState`. No external state management library. Props drilling is intentional — there is no context or store.

| Variable | Purpose |
|----------|---------|
| `auth` | Current user (from localStorage) |
| `gameState` | Full game state from server |
| `combatResult` | Last combat result (shown in modal) |
| `selectedHex` | Hex selected as attack origin |
| `error` | Last error message from server |
| `rolling` | Dice animation in-progress flag |
| `view` | Current top-level view (`lobby / game / gameover`) |

**The server is the single source of truth.** The frontend never mutates `gameState` locally; every change is a SignalR broadcast from the server.

### Component Tree

```
App.tsx  (all useState, all handlers)
├── <AuthPage>           — login/register tabs
├── <GameLobby>          — room creation, joining, map location, start
│   └── useGeolocation   — browser GPS
├── <GameMap>            — Leaflet map + SVG hex grid overlay
├── <PlayerPanel>        — turn status, phase actions, scoreboard
│   └── <DiceRoller>     — animated unicode dice (⚀–⚅)
├── <CombatModal>        — attack/defend dice + troop losses overlay
│   └── <DiceRoller>
├── <GameOver>           — final scoreboard + play again
└── <GlobalMap>          — FFA mode Leaflet map (circleMarkers per hex)
```

### useSignalR Hook

The hook builds a `HubConnection` with automatic reconnect and wraps all event registration. Event handlers are stored in a `useRef` (`eventsRef`) and updated on every render, avoiding stale closure bugs:

```typescript
// listeners always call the current handler, not the captured one
connection.on('StateUpdated', (...args) => eventsRef.current.onStateUpdated?.(...args));
```

---

## Hex Grid System

Both backend and frontend use **flat-top axial coordinates** `(q, r)`.

Grid keys are formatted `"q,r"` (e.g. `"3,-2"`).

### Alliances Grid (in-memory)

- `HexService.BuildGrid(radius=8)` → 217 hexes in a hex-shaped area
- Pixel math: `x = size * 1.5 * q`, `y = size * (√3/2 * q + √3 * r)`
- Rendered as SVG polygons inside a Leaflet `L.svgOverlay`, repositioned on zoom/pan

### Global Map (PostgreSQL)

- Scale: 1 hex ≈ 1 km
- `LatLngToHex(lat, lng)`:
  - `y = lat * 111.32`
  - `x = lng * 111.32 * cos(lat°)`
  - Apply flat-top pixel→hex inverse, then `HexRound`
- `hexToLatLng(q, r)` is the exact inverse (lat clamped to ±85°)
- Rendered as `L.circleMarker` (radius 8) per hex

---

## Deployment

See [docker-compose.yml](../docker-compose.yml) for the full service definitions.

| Service | Exposed Port | Image |
|---------|-------------|-------|
| `db` | 5432 | `postgres:16-alpine` |
| `backend` | 7000 (→ internal 8080) | `./backend/Landgrab.Api/Dockerfile` |
| `frontend` | 80 | `./frontend/landgrab-ui/Dockerfile` (Nginx) |

`JWT_SECRET` must be set as an environment variable; Docker Compose will fail-fast if it is absent.

Optional: Set `Azure:SignalR:ConnectionString` to use Azure SignalR Service instead of the self-hosted hub.
