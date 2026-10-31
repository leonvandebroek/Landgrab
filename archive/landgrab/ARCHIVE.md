# Landgrab (archived, reference only)

This folder holds the complete Landgrab implementation as it stood when the repository
switched focus to **VirtuBattle**. It is kept **only as reference material**.

- Nothing here is built, tested, linted or deployed. The CI workflows (`.github/workflows/`),
  the Azure Pipelines definition (`azure-pipelines.yml`), the solution file (`Landgrab.sln`)
  and the Docker/devcontainer setup were moved in here with the rest of the code, so they no
  longer run from the repository root.
- Do not add new features or fixes here. If you want to reuse something, copy it into the
  new code and adapt it there.
- History is preserved: the files were moved with `git mv`, so `git log --follow <path>`
  still shows each file's full history.

## What is in here

| Path | Contents |
|---|---|
| `backend/` | ASP.NET Core 8 API, SignalR `GameHub`, EF Core, xUnit tests |
| `frontend/` | React 19 + TypeScript + Vite UI (Zustand, Leaflet hex map, i18n) |
| `tools/landgrab-agent-mcp/` | MCP server used by AI agents to playtest the game |
| `infrastructure/` | Azure Bicep templates |
| `docs/`, `*.md`, `*.txt` | Design notes, analyses, game mechanics references |
| `.squad/`, `.github/agents/`, `.github/skills/` | Landgrab-specific AI team and agent config |
| `.github/workflows/`, `azure-pipelines.yml` | Former CI/CD (inactive here) |
| `README.md`, `CLAUDE.md` | The original project README and agent guide |

Useful starting points for reference: `CLAUDE.md` (architecture overview),
`GAME_MECHANICS_QUICK_REFERENCE.md`, and `backend/Landgrab.Api/Services/`.

## Running it anyway

If you really need to run the old game locally, do it from inside this folder, following
`README.md` (paths in it are relative to `archive/landgrab/`).
