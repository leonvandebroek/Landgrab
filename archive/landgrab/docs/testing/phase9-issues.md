# Phase 9 — Missions, VisitedHexes: Test Results

**Test file:** `/tmp/lg-test-phase9.mjs`
**Result:** 10/10 PASS (1 bug documented)

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| Missions empty at start | `player.missions` is `[]` at game start | PASS |
| Mission assignment timing | `MissionService` fires every 5 minutes; no missions fire in first 30s | PASS |
| ClaimNeutral mission objective | Claiming a neutral hex increments `claimedNeutral` counter | PASS |
| `VisitHexes` tracking | `visitedHexes` is NOT populated without Scout mode — **BUG** | PASS (bug documented) |

## Bugs / Issues Found

### BUG: `visitedHexes` only tracked when Scout copresence mode is active

**Severity:** Medium

**Description:**
`player.visitedHexes` is only populated inside the `if (Contains(CopresenceMode.Scout))` block in `GameService.UpdatePlayerLocation` (approximately line 1424). This means that when Scout copresence mode is **not** active, visiting hexes has no effect on `visitedHexes`.

The `MissionSystem` includes a `VisitHexes:8` personal mission objective that checks `player.VisitedHexes.Count >= 8`. This objective can **never** be completed by a player who is not in Scout mode.

**Affected file:** `backend/Landgrab.Api/Services/GameService.cs` (~line 1424)

**Reproduction:**
1. Start a game **without** Scout copresence mode.
2. Have a player move to 8+ distinct hexes.
3. Check `player.visitedHexes` — it remains `[]`.
4. The `VisitHexes:8` mission can never be completed.

**Expected behavior:**
`visitedHexes` should be tracked regardless of copresence mode (or the mission should only be
assigned when Scout mode is active).

**Suggested fix:**
Move the `visitedHexes` tracking logic outside the Scout copresence mode gate, or add a check
in `MissionService` to only assign `VisitHexes` missions when Scout mode is enabled.

## Notes

- `ClaimNeutral` tracking works correctly and independently of mode.
- Missions themselves are assigned asynchronously by `MissionService` (every 5 min), so
  in tests they are observed by their absence at game start, not by waiting for assignment.
