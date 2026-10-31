# Ability playtest notes — 2026-03-21

## Scope

Live visible-browser validation of role abilities using in-game movement controls and debug GPS, with a running log of confusing or strange behavior encountered during testing.

## Ability inventory under test

### Commander

- Passive: `warBonus`
- Active: `tacticalStrike`
- Active: `reinforce` / Rally Point
- Active: `commandoRaid`

### Scout

- Passive: `extendedVision`
- Passive: `firstStrike`
- Active: `Beacon` (when beacon mode is enabled)

### Engineer

- Active: `fortConstruction`
- Active: `sabotage`
- Active: `demolish`

## Running observations

1. **Role assignment is awkward to drive deterministically through the visible lobby UI.**
   - I had to rely on random role distribution to get a clean Scout/Commander pair in a fresh room.
   - This makes targeted live validation slower and less predictable than it should be.

2. **Scenario injection for Engineer setups is unreliable in practice.**
   - Multiple injected-state attempts timed out with the frontend still visually stuck in lobby state even when the session was connected.
   - Some bridge snapshots showed `auth.token` as empty after flows that otherwise looked authenticated.
   - This makes precise mid-game Engineer setup much harder than Commander/Scout setup.

3. **`combatMode: \"Balanced\"` caused injected-state enum parsing failures.**
   - The injected payload path appears stricter or differently shaped than expected.
   - Worth documenting because it blocked a faster path to Engineer coverage.

4. **Engineer mission state can silently get in the way of testing another Engineer ability.**
   - I reached a valid enemy tile for Sabotage, but Fort Construction was still active from earlier and had to be explicitly aborted first.
   - The UI does support abort, but this state dependency is easy to miss during testing.

5. **Manual keyboard movement is reliable, but long-distance movement is slow and brittle.**
   - Reaching Engineer test positions with repeated arrow presses works, but it is easy to lose time and context during long traversals across the map.

6. **A visible button can still require a forced click in live testing.**
   - The `Start Sabotage` CTA was visibly rendered and enabled.
   - A normal click failed because the browser automation reported the button as outside the viewport.
   - A forced click succeeded immediately and activated the mission.

7. **Recovered injected sessions can contain valid backend player state but still lack usable frontend location state.**
   - In a recovered injected room, the host had `role: Engineer`, `currentLat`, and `currentLng` in state.
   - The visible UI still showed `Enable location to play`, with `currentHex` unresolved.
   - This blocked a clean visible Demolish validation even after roles were enabled.

8. **Recovered injected rooms may need manual repair before they resemble the requested scenario.**
   - A failed injected-state attempt still created a returnable recent room.
   - Reopening that room restored the match, but not all requested dynamics arrived in a usable way on first load.
   - I had to manually enable `playerRolesEnabled` afterward just to restore Engineer ability access.

9. **Fresh mobile sessions behave much more predictably than reusing already-playing ones.**
   - Reinjecting into sessions that were already inside another match kept them visually latched to the old room.
   - Creating fresh mobile sessions and manually joining the injected room gave a much cleaner validation path.

10. **The first manual room-join path after injection is still oddly fragile.**

   Auto-resume after `scenario_inject_state` still timed out even when the backend room existed. Reopening the room from the recent-rooms list was more reliable than waiting for automatic resume.

## Live results captured so far

- Scout Beacon: activated and deactivated successfully in a visible session.
- Commander Tactical Strike: armed successfully.
- Commander Rally Point: correctly blocked on a neutral hex and succeeded on a friendly hex.
- Commander Commando Raid: target selection, confirm, and launch all succeeded.
- Engineer Fort Construction: started successfully and perimeter progress increased from `0/6` to `1/6` after movement.
- Engineer Sabotage: activated successfully on a real enemy hex, and progress increased from `0/3` to `1/3` after one keyboard movement step.
- Engineer Demolish: mobile visible validation now succeeds through mission
   start. In a fresh injected mobile room, the Engineer correctly resolved onto
   the enemy fort at `Q1, R0`, the `Slopen` sheet recognized the target as
   `Vijandelijk fort klaar`, `Start slopen` was enabled and succeeded, the event
   log recorded `demhost0321 started demolishing the fort at (1, 0)`, and after
   stepping out to `Q0, R0` and back into the fort on mobile, progress
   increased from `0/3` to `1/3`.

## Fixes made during this playtest

- Backend scenario injection now initializes injected players with
  `CurrentHexQ` and `CurrentHexR` immediately instead of only storing
  lat/lng.
- Frontend in-game hex resolution now prefers the server-reported current hex
  when it exists.
- Frontend current-location fallback now uses the server-reported player
  position when browser geolocation is absent, which makes injected mobile
  sessions and debug stepping behave sensibly.

## To update during playtesting

- Continue Demolish to `3/3` approaches in a fresh mobile room to fully close the loop.
- Capture any future fix to injected-session auto-resume, because manual reopen/join is still the main orchestration workaround.
