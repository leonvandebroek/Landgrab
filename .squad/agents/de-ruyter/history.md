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
