# Landgrab — Documentation

> **Conquer Your Neighborhood.** A real-world hex-grid territory game overlaid on PDOK base maps.

---

## What Is Landgrab?

Landgrab is a browser-based, turn-based strategy game in the style of Risk, played on a hex grid that is anchored to the real world via GPS. Players claim territory, form alliances, and battle each other for dominance on a map centred on a real geographic location.

There are two distinct modes of play:

| Mode | Description |
|------|-------------|
| **Alliances (Room-based)** | Private games. A host creates a room, shares a 6-character code, and players join. The grid is a fixed 8-radius hexagon (~217 cells) anchored to any real-world location the host chooses. State is fully in-memory and disappears when the server restarts. |
| **Free-for-All (Global Map)** | A single persistent map shared by all users. One hex ≈ 1 km². Players are dropped near their GPS location and battle for territory that persists in PostgreSQL. |

---

## Quick Start

### Running locally

```bash
# 1. Copy and fill in required secrets
cp .env.example .env          # set JWT_SECRET (min 32 chars)

# 2. Start the database
docker compose up db -d

# 3. Start the backend  (from backend/Landgrab.Api/)
dotnet run

# 4. Start the frontend  (from frontend/landgrab-ui/)
npm install && npm run dev
```

Open **http://localhost:5173** in your browser.

DB migrations run automatically on every backend startup.

### Running with Docker

```bash
JWT_SECRET=<your-secret-here> docker compose up --build
```

| URL | Service |
|-----|---------|
| http://localhost:80 | Frontend (Nginx) |
| http://localhost:7000 | Backend API (internal) |
| localhost:5432 | PostgreSQL (dev only) |

---

## Documentation Index

| File | Contents |
|------|---------|
| [architecture.md](architecture.md) | System design, tech stack, two-mode overview |
| [api.md](api.md) | All HTTP REST endpoints |
| [signalr.md](signalr.md) | Real-time hub methods and events |
| [database.md](database.md) | PostgreSQL schema (6 tables) |
| [game-rules.md](game-rules.md) | Game phases, combat resolution, win conditions |
| [configuration.md](configuration.md) | Environment variables and appsettings keys |
| [development.md](development.md) | Local dev setup, migrations, tips |

---

## Tech Stack (Summary)

| Layer | Technology |
|-------|-----------|
| Backend | .NET 8 / ASP.NET Core 8 (Minimal API) |
| Real-time | ASP.NET Core SignalR (WebSockets) |
| Database ORM | Entity Framework Core 8 + Npgsql |
| Database | PostgreSQL 16 |
| Auth | Custom JWT HS256 (BCrypt w=12, 7-day expiry) |
| Frontend | React 19 + TypeScript + Vite |
| Map | Leaflet.js + PDOK TOP25raster WMS by default |
| Email | Azure Communication Services (optional; logs in dev) |
| Containerisation | Docker + Docker Compose |
