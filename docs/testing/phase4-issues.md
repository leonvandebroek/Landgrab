# Phase 4 — Commander, Saboteur, Engineer, HQ: Test Results

**Test file:** `/tmp/lg-test-phase4.mjs`
**Result:** 14/14 PASS

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| Commander | `attackerBonus = 1` applied to attacker's role | PASS |
| Saboteur | Target cell troops decremented by 1 on `SabotageHex` | PASS |
| Engineer | `engineerBuiltAt` set on claimed hex | PASS |
| HQ | `claimFrozenUntil` set for 5 minutes after claiming | PASS |

## Bugs / Issues Found

_None._

## Notes

- Commander bonus stacks correctly with UnderdogPact and other bonuses.
- Saboteur does not capture the hex; it only decrements troops, requiring follow-up attacks.
- Engineer flag is stored per cell, enabling terrain defense bonuses (related to Phase 3 TerrainEnabled).
- HQ freeze duration: exactly 5 minutes (`claimFrozenUntil = now + 5min`).
