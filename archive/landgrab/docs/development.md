# Development Guide

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| .NET SDK | 8.0+ | [Download](https://dotnet.microsoft.com/download) |
| Node.js | 18+ | LTS recommended |
| Docker | Any recent | For PostgreSQL (or use a local install) |
| `dotnet-ef` tool | Latest | `dotnet tool install -g dotnet-ef` |

---

## First-Time Setup

### 1. Clone and configure secrets

```bash
git clone <repo-url>
cd Landgrab

# Create the root .env file (used by Docker Compose and can be sourced manually)
cp .env.example .env
# Edit .env — set JWT_SECRET to any string ≥ 32 characters
```

### 2. Start the database

```bash
docker compose up db -d
```

Or if you have a local PostgreSQL instance, update `ConnectionStrings:DefaultConnection` in `backend/Landgrab.Api/appsettings.Development.json`.

### 3. Start the backend

```bash
cd backend/Landgrab.Api
dotnet run
# or for hot-reload:
dotnet watch run --urls http://0.0.0.0:5001
```

The API listens on **http://localhost:5001** in development. DB migrations run automatically on startup.

### 4. Start the frontend

```bash
cd frontend/landgrab-ui
npm install
npm run dev
```

The dev server runs at **http://localhost:5173** and proxies `/api` and `/hub` to `http://localhost:5001`.

---

## Daily Development

All four services can be started at once using the VS Code task **"dev: start all"** (defined in `.vscode/tasks.json`), or individually:

```bash
# Terminal 1 — database
docker compose up db -d

# Terminal 2 — backend (hot-reload)
cd backend/Landgrab.Api && dotnet watch run --urls http://0.0.0.0:5001

# Terminal 3 — frontend
cd frontend/landgrab-ui && npm run dev
```

---

## Database Migrations

### Add a new migration

```bash
cd backend/Landgrab.Api
dotnet ef migrations add <MigrationName>
```

This creates a new migration file under the `Migrations/` folder.

### Apply migrations manually

```bash
cd backend/Landgrab.Api
dotnet ef database update
```

Migrations also run automatically every time the backend starts (`db.Database.MigrateAsync()` in `Program.cs`). Failures are logged as warnings — the app still starts.

### Revert to a previous migration

```bash
dotnet ef database update <TargetMigrationName>
```

---

## Adding a New HTTP Endpoint

1. Create or open the relevant endpoints file in `backend/Landgrab.Api/Endpoints/`
2. Add your route inside the existing extension method pattern:

```csharp
public static void MapMyEndpoints(this WebApplication app)
{
    app.MapPost("/api/my-resource", async (...) => { ... })
       .RequireAuthorization();
}
```

3. Register it in `Program.cs`:

```csharp
app.MapMyEndpoints();
```

Auth endpoints must also add `.RequireRateLimiting("auth")`.

---

## Adding a New SignalR Hub Method

1. Open `backend/Landgrab.Api/Hubs/GameHub.cs`
2. Add a public method:

```csharp
public async Task MyAction(string param)
{
    var userId = UserId; // reads from JWT claims
    // ... validate, mutate state, broadcast
    await Clients.Group(roomCode).SendAsync("StateUpdated", state);
}
```

3. In `frontend/landgrab-ui/src/hooks/useSignalR.ts`, add the new event to `eventsRef` if it produces a server→client event:

```typescript
connection.on('MyEvent', (...args) => eventsRef.current.onMyEvent?.(...args));
```

4. Add the handler prop to the `App.tsx` events object and wire it to state.

---

## TypeScript Build & Lint

```bash
cd frontend/landgrab-ui

npm run build    # tsc -b && vite build (strict: true, noUnusedLocals, noUnusedParameters)
npm run lint     # ESLint
```

TypeScript `strict: true` is enforced. All code must compile cleanly before committing.

---

## Port Reference

| Service | Dev Port | Docker Port |
|---------|----------|-------------|
| Frontend (Vite) | 5173 | 80 |
| Backend (ASP.NET) | 5001 | 7000 → internal 8080 |
| PostgreSQL | 5432 | 5432 |

> **macOS note:** Port 5000 is used by AirPlay Receiver. The backend is configured to use 5001 to avoid conflicts.

---

## Project Structure

```
Landgrab/
├── .env                            # Secrets (git-ignored)
├── docker-compose.yml
├── Landgrab.sln
├── docs/                           # This documentation
│
├── backend/Landgrab.Api/
│   ├── Program.cs                  # DI, middleware, CORS, JWT, endpoint registration
│   ├── Auth/
│   │   ├── JwtService.cs           # HS256 token generation
│   │   ├── PasswordService.cs      # BCrypt hash / verify
│   │   └── EmailService.cs         # ACS email (console fallback in dev)
│   ├── Data/AppDbContext.cs         # EF Core context + Fluent API config
│   ├── Endpoints/
│   │   ├── AuthEndpoints.cs        # /api/auth/*
│   │   ├── AllianceEndpoints.cs    # /api/alliances/*
│   │   └── GlobalMapEndpoints.cs   # /api/global/*
│   ├── Hubs/GameHub.cs             # All SignalR hub methods
│   ├── Models/                     # EF entities (User, Alliance, GlobalHex, etc.)
│   ├── Services/
│   │   ├── GameService.cs          # In-memory Alliance game logic
│   │   ├── GlobalMapService.cs     # Persistent FFA map logic
│   │   └── HexService.cs           # Hex math utilities
│   ├── Migrations/                 # EF Core migration history
│   └── Properties/launchSettings.json
│
└── frontend/landgrab-ui/
    ├── vite.config.ts              # Dev proxy: /api + /hub → localhost:5001
    ├── src/
    │   ├── App.tsx                 # Root component: all useState, all handlers
    │   ├── main.tsx
    │   ├── types/game.ts           # TypeScript interfaces (GameState, HexCell, etc.)
    │   ├── hooks/
    │   │   ├── useAuth.ts          # Login / register / logout + localStorage
    │   │   ├── useSignalR.ts       # SignalR connection + eventsRef pattern
    │   │   └── useGeolocation.ts   # Browser GPS wrapper
    │   └── components/
    │       ├── auth/AuthPage.tsx
    │       ├── lobby/GameLobby.tsx
    │       ├── map/GameMap.tsx      # Leaflet + SVG hex overlay
    │       ├── map/HexMath.ts       # Hex ↔ pixel / latLng math
    │       ├── game/PlayerPanel.tsx
    │       ├── game/CombatModal.tsx
    │       ├── game/DiceRoller.tsx
    │       ├── game/GameOver.tsx
    │       └── global/GlobalMap.tsx # FFA mode map
```

---

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Backend fails to start with `Jwt:Secret` error | `JWT_SECRET` not set | Add it to `.env` or `appsettings.Development.json` |
| CORS errors in browser | `AllowedOrigins` typo in `appsettings.Development.json` | Ensure value is `"http://localhost:5173"` |
| SignalR enums appear as numbers (e.g. `1` instead of `"Reinforce"`) | `JsonStringEnumConverter` missing | Verify it's added to `AddJsonProtocol` in `Program.cs` |
| Port 5000 refused on macOS | AirPlay Receiver uses 5000 | Backend is configured to use 5001; check `launchSettings.json` and `vite.config.ts` |
| DB migration fails on startup | Schema already up-to-date or out of sync | Run `dotnet ef database update` manually; check migration history |
| Email not sent in dev | ACS not configured | Expected — emails are logged to console when `AzureCommunicationServices:ConnectionString` is absent |
