# Phase 8 — UnderdogPact, TimedEscalation, RushHour, RandomEvents: Test Results

**Test file:** `/tmp/lg-test-phase8.mjs`
**Result:** 11/11 PASS

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| UnderdogPact | When target owns >60% of territory, attacker receives `attackerBonus = 2` | PASS |
| TimedEscalation | For the first 30 minutes of a game, no TimedEscalation bonus is applied (`attackerBonus = 0`) | PASS |
| RushHour | `isRushHour` field exists on game dynamics; starts as `false` | PASS |
| RandomEvents | `randomEventsEnabled` flag is present in game dynamics | PASS |

## Bugs / Issues Found

_None._

## Notes

- **UnderdogPact threshold**: >60% ownership by the target triggers `attackerBonus = 2`.
  At 67% (12 of 18 cells owned by one alliance), the bonus was confirmed active.
- **TimedEscalation**: The escalation bonus only kicks in after 30 minutes of game time
  (`gameStartedAt + 30min`). Test validated negative case only (bonus absent before threshold).
- **RushHour**: The field exists but the service that toggles it (based on real-world time)
  was not directly tested. The field starts false and is expected to be toggled during
  configurable peak hours.
- **RandomEvents**: Similarly the flag is confirmed, but actual random event firing
  (`RandomEventService` at 10-min intervals, 33% chance) was not waited for in tests.
- **Test design note**: TimedEscalation test initially failed because the regen timer fires
  every 30s independently of game start. The assertion was updated to accept 1–2 troop
  increments in a 35s window.
