# Phase 5 — Beacon, Ambush, Toll: Test Results

**Test file:** `/tmp/lg-test-phase5.mjs`
**Result:** 12/12 PASS

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| Beacon | `isBeacon = true` set on cell; auto-deactivates (field becomes false) when player moves away by >1 hex | PASS |
| Ambush | `PickUpTroops` from hostile-occupied cell returns `"Ambush!"` error | PASS |
| Toll | When picking up troops from neutral/enemy hex with Toll mode active, `carriedTroops` reduced and enemy player gains troops | PASS |

## Bugs / Issues Found

_None._

## Notes

- **Beacon auto-deactivate**: triggered when a player moves to a hex that is not adjacent to the beacon hex. The beacon field on the original cell reverts to `false`.
- **Ambush interaction**: Ambush mode blocks `PickUpTroops` specifically. Attacking the hex still works normally.
- **Toll math**: For each troop picked up, the collecting player loses 1 (toll) which is credited to the hex's owner (if hostile). Net result: `carriedTroops - 1`, enemy `troops + 1`.
