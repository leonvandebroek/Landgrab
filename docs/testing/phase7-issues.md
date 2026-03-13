# Phase 7 — FogOfWar, SupplyLines: Test Results

**Test file:** `/tmp/lg-test-phase7.mjs`
**Result:** 10/10 PASS

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| FogOfWar | Each player only receives their own territory + visible neighbors; enemy hexes are scrubbed (`ownerId=null`, `troops=0`) | PASS |
| SupplyLines | Isolated hex (not BFS-reachable from first-owned hex) does not regenerate troops; connected hex does regenerate | PASS |

## Bugs / Issues Found

_None._

## Notes

- **FogOfWar per-player broadcast**: `BroadcastState` in `GameHub` iterates the room's `ConnectionMap` and calls `GetPlayerSnapshot` per player when `FogOfWarEnabled && phase == Playing`.
- **Visibility radius**: Default is 1 ring around owned hexes. Scout role extends to 3 rings (tested in Phase 3).
- **SupplyLines BFS origin**: Starting hex used in BFS is `firstOwned` — the first hex each alliance has ever owned. If an alliance loses this hex, the supply chain may break entirely even if they own other hexes. This is by design.
- **SupplyLines test timing**: regen tick fires every 30 seconds independently of game start. Test waited 35 seconds and used a `[1, 2]` increment range to handle the case of 2 ticks firing.
