# De Ruyter — History

## Core Context
Backend Dev on Landgrab. ASP.NET Core 8, SignalR, EF Core, SQL Server/PostgreSQL. All game state is in-memory (singletons). GameService is the main façade. Hub split into 4 partial classes.

Key patterns:
- Endpoint extension methods on WebApplication
- JWT: ClaimTypes.NameIdentifier + JwtRegisteredClaimNames.Sub both present
- BCrypt factor 12, password min 8 chars
- Rate limiting "auth" policy on /api/auth/*
- AllianceDto (transient) ≠ Alliance EF entity (persistent)

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
- 2026-03-22: Setup wizard location gating can get stuck due to frontend-side race (SetWizardStep(1) sent optimistically before SetMapLocation state update lands). Backend accepted manual coordinates already (lat/lng only), but wizard progression depended on subsequent state timing. Added backend guard in MapAreaService.SetMapLocation: when map location is set while CurrentWizardStep == 0, auto-advance to step 1 in the same authoritative state snapshot. This keeps manual coordinate flow and GPS flow both deterministic without changing SignalR message shape.
- **2026-03-22 (steen-continued-ux cross-reference):** Wizard fix was validated in 6-player playtest, but downstream gameplay reveals 4 critical/major blockers that require follow-up: null currentHex on game start, no debug movement fallback, false-success action feedback, no in-game location recovery. See .squad/decisions.md items 4–6.
- 2026-03-22: Fixed null `currentHex` at game start by initializing each player's position during `LobbyService.StartGame`. Spawn selection is deterministic and uses priority order: player-owned tile → alliance-owned tile → master tile → nearest grid fallback; this sets `CurrentLat/CurrentLng` and `CurrentHexQ/CurrentHexR` before entering Playing so location-gated actions no longer fail on first interaction. Kept SignalR payload shape unchanged and preserved existing mobile GPS + desktop keyboard update paths.
