# Game Dynamics Testing — Results Index

All phases of the Landgrab game dynamics were tested via Node.js SignalR scripts against
a live local backend (`http://localhost:5001`).

## Summary

| Phase | Mechanics | Tests | Bugs |
|-------|-----------|-------|------|
| [Phase 3](./phase3-issues.md) | Scout, Rally, FrontLine, Shepherd | 17/17 | 0 |
| [Phase 4](./phase4-issues.md) | Commander, Saboteur, Engineer, HQ | 14/14 | 0 |
| [Phase 5](./phase5-issues.md) | Beacon, Ambush, Toll | 12/12 | 0 |
| [Phase 6](./phase6-issues.md) | Stealth, CommandoRaid, JagerProoi | 12/12 | 0 |
| [Phase 7](./phase7-issues.md) | FogOfWar, SupplyLines | 10/10 | 0 |
| [Phase 8](./phase8-issues.md) | UnderdogPact, TimedEscalation, RushHour, RandomEvents | 11/11 | 0 |
| [Phase 9](./phase9-issues.md) | Missions, VisitedHexes | 10/10 | 1 |
| [Phase 10](./phase10-issues.md) | PresenceBattle, Duel, Hostage, NeutralNPC | 14/14 | 2 |
| **Total** | | **100/100** | **3** |

## Open Bugs

### HIGH — Duel mode non-functional: `InitiateDuel` never called

`InitiateDuel` is defined in `GameService` but never invoked from `GameHub.UpdatePlayerLocation`.
When two hostile players enter the same hex with Duel mode active, no duel is triggered.
`AcceptDuel`/`DeclineDuel` hub methods exist but are unreachable without a trigger.

**File:** `backend/Landgrab.Api/Hubs/GameHub.cs` — missing duel trigger in `UpdatePlayerLocation`

→ See [phase10-issues.md](./phase10-issues.md#bug-1-duel-mode-cannot-be-initiated--initiateduel-is-never-called)

---

### MEDIUM — `visitedHexes` only tracked with Scout mode active

`player.visitedHexes` is only updated inside the `if (Contains(CopresenceMode.Scout))` block
in `GameService.UpdatePlayerLocation`. The `VisitHexes:8` mission objective is therefore
impossible to complete without Scout mode enabled.

**File:** `backend/Landgrab.Api/Services/GameService.cs` (~line 1424)

→ See [phase9-issues.md](./phase9-issues.md#bug-visitedHexes-only-tracked-when-scout-copresence-mode-is-active)

---

### LOW (Design Gap) — NeutralNPC has no effect without OSM Building terrain data

`NeutralNPCEnabled` only assigns NPC hexes when `TerrainType == Building` hexes exist.
Without real OSM terrain data (i.e., without `TerrainEnabled` + map location with buildings),
enabling `NeutralNPCEnabled` has no effect.

**File:** `backend/Landgrab.Api/Services/GameService.cs` (StartGame, ~line 1337)

→ See [phase10-issues.md](./phase10-issues.md#bug-2-design-gap-neutralnpc-has-no-effect-without-real-osm-terrain-data)
