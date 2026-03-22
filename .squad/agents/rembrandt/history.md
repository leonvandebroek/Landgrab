# Rembrandt — History

## Core Context
Lead on Landgrab — a real-time multiplayer hex territory game. Stack: React 19 + TypeScript frontend, ASP.NET Core 8 + SignalR backend, SQL Server/PostgreSQL, Azure hosting. Owner: Léon van de Broek.

Key patterns:
- GameService is the main façade; domain services are singletons holding in-memory game state
- SignalR hub split into 4 partial classes (base, lobby, gameplay, host)
- Frontend uses Zustand stores; no external state library beyond that
- Server is the source of truth — frontend never mutates state locally
- JWT claims from both ClaimTypes.NameIdentifier and JwtRegisteredClaimNames.Sub
- Hex coordinates: axial (Q, R), grid key format "q,r"

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
- Dutch Golden Age universe
