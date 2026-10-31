# Landgrab 🗺️

> **Conquer your neighborhood.** A real-world territory game: Land Grab meets Risk on top of a real map.

## What is it?

Landgrab overlays a hex grid on a neighborhood map. Players claim territory, move troops, trigger abilities, and fight for control in real time.

| Mode | Description |
|---|---|
| **Alliances** | 2–4 players create a room, configure the map, form alliances, and play on a host-centered local grid. |
| **Free-for-All** | A persistent global map where logged-in players can claim and attack nearby hexes. |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Zustand, Leaflet |
| Backend | ASP.NET Core 8 Minimal API, SignalR, Entity Framework Core |
| Database | SQL Server |
| Auth | Custom JWT, bcrypt |
| Realtime | ASP.NET Core SignalR locally, Azure SignalR in production |
| Hosting | Azure Static Web Apps + Azure Container Apps |

## Getting Started

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org)
- SQL Server 2022+ locally, or Docker for the full stack

### Backend

```bash
cd backend/Landgrab.Api
# Set environment variables or appsettings values:
# ConnectionStrings__DefaultConnection="Server=localhost;Database=landgrab;..."
# Jwt__Secret="your-32+-character-secret"

dotnet run
# HTTP profile listens on http://localhost:5001
# SignalR hub: ws://localhost:5001/hub/game
```

### Frontend

```bash
cd frontend/landgrab-ui
npm install
npm run dev
# App: http://localhost:5173
# /api and /hub proxy to http://localhost:5001
```

Open `http://localhost:5173`, create an account, and start or join a room.

## Architecture

### Backend

- `GameService` is the main façade for game operations.
- It coordinates domain services including `RoomService`, `LobbyService`, `GameplayService`, `AbilityService`, `DuelService`, `WinConditionService`, `HostControlService`, `GameStateService`, and `MissionService`.
- Supporting services cover hex math, terrain fetching, global map behavior, and room persistence.
- SignalR `GameHub` is split into partial classes:
  - `GameHub.cs` - base hub, DI, connection lifecycle
  - `GameHub.Lobby.cs` - room setup, alliances, templates, lobby actions
  - `GameHub.Gameplay.cs` - gameplay actions, abilities, duels
  - `GameHub.Host.cs` - host-only controls, pauses, events, observer flows

### Frontend

- State is organized with Zustand stores:
  - `gameStore`
  - `gameplayStore`
  - `notificationStore`
  - `uiStore`
- Core hooks:
  - `useAuth`
  - `useSignalR`
  - `useSignalRHandlers`
  - `useGameActions` as the main façade over domain hooks (`useGameActionsLobby`, `useGameActionsGameplay`, `useGameActionsAbilities`, `useGameActionsHost`)
  - `useAutoResume` for saved-session recovery
- Large UI surfaces are code-split with lazy-loaded chunks for `GameMap`, `PlayingHud`, and `GameLobby`.

## Testing

- Backend coverage includes **96 xUnit tests** across auth, hex math, win conditions, gameplay, abilities, and duels.
- Run the test suite with:

```bash
cd backend/Landgrab.Tests
dotnet test
```

## Docker

```bash
# Required: set JWT_SECRET
docker compose up --build
```

- Frontend: `http://localhost`
- Backend container port: `http://localhost:7000`
- SQL Server: `localhost:1433`

## Azure Deployment

Deployment is defined in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Required secrets:

| Secret | Description |
|---|---|
| `AZURE_CREDENTIALS` | Azure service principal JSON |
| `AZURE_RESOURCE_GROUP` | Resource group name |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Azure Static Web Apps token |
| `JWT_SECRET` | Application JWT secret |

## Project Structure

```text
Landgrab/
├── backend/
│   ├── Landgrab.Api/      # API, SignalR hub, domain services
│   └── Landgrab.Tests/    # xUnit test suite
├── frontend/
│   └── landgrab-ui/       # React app
├── docs/                  # Documentation and intentional screenshots
├── resources/             # App assets
├── infrastructure/        # Infra and deployment files
└── docker-compose.yml
```

## Privacy

Only usernames are shown to other players. Email is stored for account handling and is not displayed publicly.

## License

Apache 2.0 — see [LICENSE](LICENSE).
