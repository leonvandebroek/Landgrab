# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Landgrab

A real-world territory game that overlays a hex grid on a neighborhood map. Players claim territory, move troops, trigger abilities, and fight for control in real time. Two modes: **Alliances** (room-based, local grid) and **Free-for-All** (persistent global map).

## Commands

### Backend

```bash
cd backend/Landgrab.Api
dotnet run
# HTTP: http://localhost:5001
# SignalR hub: ws://localhost:5001/hub/game
```

```bash
cd backend/Landgrab.Tests
dotnet test
```

### Frontend

```bash
cd frontend/landgrab-ui
npm install
npm run dev       # http://localhost:5173 — /api and /hub proxy to localhost:5001
npm run build     # tsc -b && vite build
npm run lint      # eslint
```

## Architecture

### Backend (`backend/Landgrab.Api/`)

- **`GameService`** is the main façade over all game operations. Domain services (`RoomService`, `LobbyService`, `GameplayService`, `AbilityService`, `WinConditionService`, `HostControlService`, `GameStateService`) are all **singletons** that hold in-memory game room state. `GlobalMapService` is scoped (per-request).
- **SignalR `GameHub`** is split into four partial classes: base hub/lifecycle (`GameHub.cs`), lobby actions (`GameHub.Lobby.cs`), gameplay actions (`GameHub.Gameplay.cs`), and host-only controls (`GameHub.Host.cs`).
- REST endpoints are under `Endpoints/` (auth, alliance config, global map, map templates). JWT authentication via `Auth/JwtService`.
- EF Core migrations under `Migrations/`. Connection string key: `ConnectionStrings__DefaultConnection`. JWT secret key: `Jwt__Secret` (minimum 64 chars).

### Frontend (`frontend/landgrab-ui/src/`)

- **Zustand stores** (`stores/`): `gameStore` (room/game state), `gameplayStore` (in-play state), `notificationStore`, `uiStore`, `infoLedgeStore`. All exported from `stores/index.ts`.
- **Hook hierarchy**: `useGameActions` is the main façade combining `useGameActionsLobby`, `useGameActionsGameplay`, `useGameActionsAbilities`, and `useGameActionsHost`. SignalR connection via `useSignalR`; incoming events via `useSignalRHandlers`. Session recovery via `useAutoResume`.
- **Code splitting**: `GameMap`, `PlayingHud`, and `GameLobby` are lazy-loaded chunks.
- **i18n**: English and Dutch via `i18next`. Translation keys live in `i18n/en.ts` and `i18n/nl.ts`. Browser language auto-detected; defaults to English if not Dutch.
- **Hex map rendering**: Canvas-based via Leaflet custom layers under `components/game/map/`. Tile interaction logic is in `tileInteraction.ts`.

### Infrastructure

- CI/CD via Azure Pipelines (`azure-pipelines.yml`). Deploys backend to Azure Container Apps and frontend to Azure Static Web Apps.
- Docker full-stack: `docker compose up --build`. Frontend on port 80, backend on port 7000, SQL Server on 1433. Requires `JWT_SECRET` env var.
