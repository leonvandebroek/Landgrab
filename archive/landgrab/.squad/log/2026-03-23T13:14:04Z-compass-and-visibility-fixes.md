# Session: Compass & Visibility Fixes (2026-03-23T13:14:04Z)

**Agents:** Vermeer (Frontend), De Ruyter (Backend)

## Fixes Deployed

1. **Vermeer compass-crash:** Perpetual rAF loop in `lerpBearing` → self-terminates on convergence (diff < 0.3°). Stable refs added to prevent listener churn.

2. **Vermeer proximity-reveal:** Location broadcast throttle 3000ms → 750ms. Players now see enemy tiles within ~750ms of proximity, not 3 seconds.

3. **De Ruyter proximity-reveal:** `UpdatePlayerLocation` now calls `BroadcastState` on hex change, ensuring visibility recomputed and sent to all players before `StateUpdated`. Adjacency-based reveal (radius 1) now immediate.

## Test Status
- Backend: ✅ 294/295 tests passed (1 skipped)
- Frontend: ✅ 0 lint errors, 293 modules, build clean

## Impact
Players will no longer experience:
- App crash 30–60s after enabling compass
- 3–second delay revealing adjacent enemy tiles

---

*Orchestration logs available in `.squad/orchestration-log/`*
