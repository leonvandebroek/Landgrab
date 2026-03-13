# Phase 3 — Scout, Rally, FrontLine, Shepherd: Test Results

**Test file:** `/tmp/lg-test-phase3.mjs`
**Result:** 17/17 PASS

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| Scout | `stealthUntil` set; visible in own hex; 3-ring vision | PASS |
| Rally | `rallyBonusUntil` set; attackerBonus applied in combat | PASS |
| FrontLine | Player at edge of territory; bonus computed correctly | PASS |
| Shepherd | `carriedTroops` transfers; `PlaceTroops` works; `PickUpTroops` caps at cell.troops | PASS |

## Bugs / Issues Found

_None._

## Notes

- Phase 3 infrastructure work: discovered `StartGame` had a validation bug requiring each player to individually have territory. Fixed so alliances can co-own territory (two players in same alliance). This fix is the only backend change made during Phase 3 testing.
