# De Ruyter Orchestration Log — Backend Movement Optimization

**Timestamp:** 2026-03-23T13:40:42Z  
**Agent:** de-ruyter-visibility (Backend)  
**Task:** Reverted unnecessary full `BroadcastState` on simple movement; `UpdatePlayerLocation` now uses lightweight `PlayersMoved` unless grid actually changed.

## Work Summary

- **Removed `LastVisitedAt` trigger** for full state broadcast in `GameplayService.cs`
  - `LastVisitedAt` metadata is server-side only (used by `TroopRegenerationService` for decay)
  - Frontend doesn't need immediate notification; value included in next natural broadcast
  - This prevents majority of movement-triggered full broadcasts

- **Separated broadcast logic** in `GameHub.Gameplay.cs` (`UpdatePlayerLocation` method)
  - When `gridChanged = true`: full `BroadcastState` (terrain changes, combat, fortifications, etc.)
  - When only `movedToDifferentHex = true`: lightweight `PlayersMoved` broadcast (pure position updates)
  - Frontend derives visibility from updated player positions client-side

- **Deleted obsolete helper** `HasPlayerChangedHex` method (no longer used)

- **Validated** mechanics still working
  - Shepherd decay: `TroopRegenerationService` reads directly from server state, not broadcasts
  - Build: `dotnet build --configuration Debug` ✅
  - Tests: `dotnet test` ✅ (295 total, 294 passed, 1 skipped)

## Performance Impact

- **Eliminates O(N×M) recomputation** on every hex boundary crossing
- **Maintains backward compatibility** — `PlayersMoved` event already existed
- **Zero impact on frontend rendering** — frontend already computed visibility locally

## Related Outputs

- Decision: `.squad/decisions/inbox/de-ruyter-movement-broadcast.md`
- Code: Backend `Landgrab.Api` services and hubs
