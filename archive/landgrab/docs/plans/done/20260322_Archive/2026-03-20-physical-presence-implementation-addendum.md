# Physical Presence Implementation Addendum

**Date:** 2026-03-20  
**Branch:** `feature/physical-presence-mechanics`

This addendum captures the implementation decisions for removing stay-in-place mechanics from player roles. It complements:

- `docs/plans/2026-03-17-physical-presence-mechanics.md`
- `docs/plans/2026-03-17-physical-presence-game-dynamics-design.md`

## Context

**Design principle:** Every meaningful action requires physically moving. Standing still is anti-fun.

## Locked-in decisions

### Engineer: Fort Construction

- **Decision:** Encirclement. The Engineer must physically walk all 6 neighboring hexes of the target hex.
- **Progress tracking:** Store visited neighbors as a set on `PlayerDto`.
- **State change:** Replace `HexCell.EngineerBuiltAt` plus time-based fort checks with:
  - `PlayerDto.FortTargetQ`
  - `PlayerDto.FortTargetR`
  - `PlayerDto.FortPerimeterVisited: List<string>`
- **Frontend:** Show a progress ring from `0` to `1` as `visitedNeighborCount / requiredNeighborCount`.

- **Deferred follow-up:** Per-viewer state projection. `FortPerimeterVisited` currently leaks to enemies just like other Engineer state and should later be filtered in the tricorder visibility pass.

### Engineer: Sabotage

- **Decision:** Partial encirclement of a hostile target hex.
- **Requirement:** Visit 3 of the 6 neighboring hexes around the target enemy hex.
- **State change:** Replace `SabotageActive` / `SabotageStartedAt` continuous-presence logic with:
  - `SabotageTargetQ`
  - `SabotageTargetR`
  - `SabotagePerimeterVisited: List<string>`
- Track up to 3 distinct visited neighbors.
- On the 3rd unique neighbor visit:
  - apply `SabotagedUntil = now.AddMinutes(10)` to the target `HexCell`
  - clear `SabotageTargetQ`
  - clear `SabotageTargetR`
  - clear `SabotagePerimeterVisited`
- **Frontend:** Replace the time-based sabotage ring with a red progress ring showing `visitedNeighborCount / 3`.

### Engineer: Demolish

- **Decision:** Breach assault.
- **Requirement:** Enter and leave the fort hex itself from 3 distinct approach directions.
- Each approach direction is the neighboring hex the Engineer came **from** when entering the fort.
- Each approach direction counts at most once.
- **Additional rule:** The approach-direction hex must have **no enemy player present at the time of entry**.
- **State change:** Replace `DemolishActive`, `DemolishTargetKey`, and `DemolishStartedAt` with:
  - `DemolishTargetKey`
  - `DemolishApproachDirectionsMade: List<string>`
- On the 3rd unique valid approach:
  - set `IsFort = false` on the target `HexCell`
  - clear demolish tracking state
- **Backend tracking needed:** In `UpdatePlayerLocation`, detect when the player just entered a fort hex and derive the previous hex key from movement history.
- **Frontend:** Show a purple progress ring using `approachCount / 3`.

### Scout: Beacon (Re-ping Model)

- **Decision:** Reveal radius follows the Scout freely.
- No tether to the original activation point.
- No stand-still requirement.
- **State change:** Remove the auto-deactivation distance check from `GameplayService`.
- `IsBeacon`, `BeaconLat`, and `BeaconLng` stay in place, but `BeaconLat` and `BeaconLng` should update on every GPS tick instead of remaining locked to the activation point.
- **Frontend:** The beacon circle should follow the Scout marker in real time.

## Target files

### Backend

- `backend/Landgrab.Api/Services/AbilityService.cs` — ability activation logic
- `backend/Landgrab.Api/Services/GameplayService.cs` — movement-driven checks in `UpdatePlayerLocation`
- `backend/Landgrab.Api/Models/GameState.cs` — `PlayerDto` state fields
- `backend/Landgrab.Api/Models/HexCell.cs` — remove old engineer timer field usage, retain fort/sabotage state as needed

### Frontend

- `frontend/landgrab-ui/src/i18n/en.ts` — updated role and ability descriptions
- `frontend/landgrab-ui/src/components/map/tricorderTileState.ts` — remove old fort build duration assumptions
- Frontend UI components that render progress rings for fort build, sabotage, demolish, and beacon visuals

## Implementation notes

- Replace time-based or stationary-progress mechanics with movement-derived progress.
- Prefer player-owned transient tracking state on `PlayerDto` over hex-local construction timers.
- Keep backend as the source of truth; frontend should only visualize derived progress.
- The tricorder visibility leak for Engineer progress remains a known follow-up, not part of this addendum’s immediate scope.
