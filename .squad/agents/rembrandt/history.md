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
- **2026-03-23 (beacon-redesign):** Led Scout beacon redesign architecture. Beacon changes from manual toggle to passive role trait (always-on when Scout has valid GPS). Share Intel becomes explicit 60s-cooldown ability for broadcasting beacon intel to alliance. Auto-activation hook: `GameplayService.UpdatePlayerLocation` (right place because beacon already requires location, and existing code maintains beacon fields when `IsBeacon` is true). Guards on manual toggle prevent Scouts from deactivating beacon. Server-side cone computation via `VisibilityService.ComputeBeaconSectorKeys` eliminates client drift. All role-specific logic gated on `PlayerRolesEnabled`; non-role games fully backward compatible. De Ruyter implemented backend changes (dotnet build + test ✅), Vermeer implemented frontend (npm build ✅) with concurrent rendering fixes (invisible cone tiles, `?` badge, instant reveal UX, pixel radius corrections). Merged decision #23 into `.squad/decisions.md`.
- **2026-03-23 (client-side-visibility):** Investigated visibility architecture end-to-end. Key findings: (1) Backend does NOT strip raw tile data from Hidden cells — only stamps `VisibilityTier`. Frontend already has all data needed. (2) `BroadcastState` fires on EVERY hex change due to `movedToDifferentHex` check + Shepherd `LastVisitedAt` setting `gridChanged=true`. (3) This means per-player visibility recomputation (O(N×M)) runs on every movement. (4) The beacon fix already proved client-side visibility derivation works (`computeBeaconCone` in `beaconCone.ts`). Architecture decision: generalize the beacon pattern — frontend derives visibility locally from allied positions + owned territory + grid data. Backend reduces unnecessary full broadcasts. Plan in `.squad/decisions/inbox/rembrandt-visibility-architecture.md`.
