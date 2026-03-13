# Phase 10 — PresenceBattle, Duel, Hostage, NeutralNPC: Test Results

**Test file:** `/tmp/lg-test-phase10.mjs`
**Result:** 14/14 PASS (2 bugs documented)

## Mechanics Tested

| Mechanic | Behavior Verified | Result |
|----------|-------------------|--------|
| PresenceBattle | `contestProgress` increases by 0.1 per regen tick when hostile player is present; `contestingPlayerId` set | PASS |
| Duel | Mode flag present; no duel trigger fires when hostile players meet — **BUG** | PASS (bug documented) |
| Hostage/DetainPlayer | `heldByPlayerId` and `heldUntil` (3 min) set correctly on detained player | PASS |
| NeutralNPC | Flag enabled; NPC cells only appear with Building terrain from OSM data — **BUG/design gap** | PASS (design gap documented) |

## Bugs / Issues Found

### BUG 1: Duel mode cannot be initiated — `InitiateDuel` is never called

**Severity:** High

**Description:**
The `Duel` copresence mode is fully designed at the service level — `GameService.InitiateDuel`,
`ResolveDuel`, and hub methods `AcceptDuel`/`DeclineDuel` are all implemented. However, there is
no code path that **calls** `InitiateDuel` when two hostile players enter the same hex.

In `GameHub.UpdatePlayerLocation`, the handler calls `gameService.UpdatePlayerLocation(...)` and
broadcasts the updated state. There is no check for the Duel copresence mode, no call to
`InitiateDuel`, and no `DuelChallenge` (or equivalent) SignalR event sent to the target player.

As a result, the `Duel` copresence mode is entirely non-functional: duels can never be started.

**Affected files:**
- `backend/Landgrab.Api/Hubs/GameHub.cs` (missing trigger in `UpdatePlayerLocation`)
- `backend/Landgrab.Api/Services/GameService.cs` (`InitiateDuel` defined but never called)

**Reproduction:**
1. Start a game with `Duel` copresence mode active.
2. Move two hostile players to the same hex.
3. Observe: no `DuelChallenge` event; `room.State.PendingDuels` remains empty.

**Expected behavior:**
When two hostile players occupy the same hex and Duel mode is active,
`InitiateDuel` should be called and a `DuelChallenge` event broadcast to the target.

**Suggested fix:**
After `gameService.UpdatePlayerLocation(...)` returns in `GameHub`, check if the returned state
contains new pending duels and send a targeted `DuelChallenge` event to the challenged player's
connection. Alternatively, refactor `UpdatePlayerLocation` in the service to return side-effect
metadata (pending duels, etc.) and handle notification in the hub.

---

### BUG 2 (Design Gap): NeutralNPC has no effect without real OSM terrain data

**Severity:** Low / Design

**Description:**
`NeutralNPCEnabled = true` causes the server to assign `OwnerId = "NPC"` to all hexes with
`TerrainType == Building` at game start. However, in the default test grid (and any game that
does not call `SetMapLocation` with a real location that triggers a `TerrainFetchService` call),
no hexes have `TerrainType == Building`. All hexes default to `TerrainType.None`.

This means `NeutralNPCEnabled` is a no-op unless `TerrainEnabled` is also set and the
underlying OSM data for the map location includes building footprints.

**Affected file:** `backend/Landgrab.Api/Services/GameService.cs` (StartGame method, ~line 1337)

**Reproduction:**
1. Start a game with `NeutralNPCEnabled = true` **without** enabling terrain.
2. Observe: no NPC-owned cells in the grid.

**Expected behavior:**
Either:
- The documentation clearly states NeutralNPC requires `TerrainEnabled` and real OSM data, or
- NeutralNPC falls back to randomly assigning some hexes as NPC-owned when no Building terrain exists.

## Notes

- **PresenceBattle capture time**: At +0.1 per tick with one hostile and zero friendlies,
  a hex goes from 0 → 1.0 `contestProgress` after 10 regen ticks (~5 minutes). This is the
  complete capture time in a worst-case scenario.
- **Hostage duration**: Detained players are frozen for exactly 3 minutes
  (`heldUntil = now + 3min`). No actions are blocked in the backend by this field yet —
  enforcement of the hostage state (blocking moves, actions) appears to be a future TODO.
