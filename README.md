# Landgrab 🗺️

> **Conquer your neighborhood.** A real-world territory game for kids — Land Grab meets Risk, played on an actual map of your street.

## What is it?

Landgrab overlays a hexagonal grid on **your real neighborhood map** (OpenStreetMap). Players roll dice, claim hexes, and battle for territory using Risk-style combat. Two game modes:

| Mode | Description |
|---|---|
| **Alliances** (room-based) | 2–4 players create a room with a short code, form alliances, and battle on a local hex grid centered on the host's GPS location. |
| **Free-for-All** (global) | Persistent world map. Any logged-in player can claim and attack hexes near their real-world location — territories survive between sessions. |

## Game Mechanics

**Land Grab element:** Roll 2 dice → sum = number of moves. Spend moves claiming empty hexes adjacent to your territory.

**Risk element:**
- Troops on every hex
- Attack enemy hexes with dice combat (attacker: 1–3 dice, defender: 1–2 dice + ally bonus)
- Ties go to the defender
- Earn reinforcements at start of turn: `max(3, territories ÷ 3)`
- Alliance members share territory borders and get a +1 defense die when allied hexes are adjacent

**Win condition (Alliances mode):** First alliance to control ≥60% of hexes, or most territory when all hexes are claimed.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite + Leaflet.js |
| Backend | ASP.NET Core 8 Minimal API + SignalR |
| Realtime | ASP.NET Core SignalR (dev) → Azure SignalR Service (prod) |
| Database | PostgreSQL + Entity Framework Core |
| Auth | Custom JWT — username + email + bcrypt password |
| Map tiles | OpenStreetMap (free, no API key) |
| Hosting | Azure Static Web Apps (frontend) + Azure Container Apps (backend) |

## Getting Started (Local Dev)

### Prerequisites
- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org)
- [PostgreSQL 15+](https://www.postgresql.org) running locally

### 1. Backend

```bash
cd backend/Landgrab.Api
# Edit appsettings.json or set environment variables:
# ConnectionStrings__DefaultConnection = "Host=localhost;Database=landgrab;..."
# Jwt__Secret = "your-256-bit-secret"

dotnet run
# API available at http://localhost:5000
# SignalR hub at ws://localhost:5000/hub/game
```

### 2. Frontend

```bash
cd frontend/landgrab-ui
npm install
npm run dev
# App available at http://localhost:5173
# Proxies /api and /hub to http://localhost:5000
```

### 3. Open in browser

Go to `http://localhost:5173`, create an account, and start a game room.

To test multiplayer: open a second tab (or phone on same WiFi at `http://<your-ip>:5173`) and join with the room code.

## Docker (full stack)

```bash
# Copy and edit environment variables
cp .env.example .env   # set JWT_SECRET etc.

docker compose up --build
# App at http://localhost
```

## Azure Deployment

See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Required secrets:

| Secret | Description |
|---|---|
| `AZURE_CREDENTIALS` | Azure service principal JSON |
| `AZURE_RESOURCE_GROUP` | Resource group name |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | From Azure Static Web Apps |
| `JWT_SECRET` | 32+ char random secret |

### Azure infrastructure checklist
- [ ] Azure Static Web Apps (free tier) — for frontend
- [ ] Azure Container Apps (consumption plan) — for backend
- [ ] Azure Database for PostgreSQL Flexible Server (B1ms, ~$15/mo)
- [ ] Azure SignalR Service (free tier dev → Standard Unit 1 for prod)
- [ ] Azure Communication Services Email (free for <100 emails/day)
- [ ] Azure Key Vault (for secrets in production)

## Project Structure

```
Landgrab/
├── backend/
│   └── Landgrab.Api/          # ASP.NET Core 8 API
│       ├── Auth/              # JWT, bcrypt, email service
│       ├── Data/              # EF Core DbContext
│       ├── Endpoints/         # Minimal API endpoints
│       ├── Hubs/              # SignalR GameHub
│       ├── Models/            # Domain models + DTOs
│       └── Services/          # Game logic, hex math, global map
├── frontend/
│   └── landgrab-ui/           # React + TypeScript + Vite
│       └── src/
│           ├── components/    # Auth, Lobby, Map, Game, Global
│           ├── hooks/         # useSignalR, useAuth, useGeolocation
│           └── types/         # Shared TypeScript types
├── docker-compose.yml
└── .github/workflows/         # CI + Azure deploy
```

## Privacy

Only your **username** is visible to other players. Your email is stored privately (for account recovery only) and never shared or displayed. No real name, phone, or location data is stored.

## Extending the Game

The event-sourced `game_events` table and the clean `GameService` domain model make it easy to add:
- New game modes (Capture the Flag, King of the Hill)
- Power-ups (extra troops, fortify a hex)
- Time-limited rounds
- Push notifications (via Azure Notification Hubs)
- Alliance chat

## License

Apache 2.0 — see [LICENSE](LICENSE).
