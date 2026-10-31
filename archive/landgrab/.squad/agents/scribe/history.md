# Project Context

- **Project:** Landgrab
- **Created:** 2026-03-22

## Core Context

Agent Scribe initialized and ready for work. Team has successfully resolved 9 major UX issues across backend and frontend in this phase, plus 2 critical stability and responsiveness fixes (2026-03-23).

## Recent Updates

📌 Team initialized on 2026-03-22  
📌 **Session Complete (2026-03-22):** Resolved all 7 UX issues from Steen's keyboard playtest + 2 earlier blockers (wizard and currentHex null). **Total: 9 issues fixed.**
   - Wizard blocker (P3 start condition)
   - currentHex null on game start
   - UI state reset race condition (P1)
   - Rapid-fire keypresses breaking game (P2 keyboard)
   - Simultaneous dialogs stacking (P2 dialog queue)
   - And 4 other UX fixes
   - **Agent:** vermeer implemented dialog stacking fix via Option A (queue). Single-file change to gameplayStore.ts.
📌 **Beacon Cone Debug Session (2026-03-22):** Fixed three critical bugs preventing beacon cone from rendering visible tiles and responding to heading changes.
   - **Bug A:** Debug heading (Q/E) not forwarded to overlay layer → forward `debugCompassHeading ?? compassHeading`
   - **Bug B:** `BeaconHeading` unconditionally nulled on every heartbeat → preserve when `CurrentHeading.HasValue` false
   - **Bug C:** Cone hexes rendered as Hidden (no troop reveal) → added `beaconConeHexKeys` to store, override visibility tier
   - **Agent:** vermeer-beacon-debug. Multi-file changes (frontend + backend). Build: ✅ 293 modules, 0 errors.

📌 **Session Complete (2026-03-23):** Compass crash & visibility fixes deployed.
   - **vermeer-compass-crash:** Fixed perpetual rAF loop in `lerpBearing` that drove `setBearing()` at 60fps until OOM. Now converges and self-terminates on diff < 0.3°.
   - **vermeer-proximity-reveal:** Reduced location broadcast throttle 3000ms → 750ms. Players see adjacent tiles within 750ms of movement.
   - **de-ruyter-proximity-reveal:** Backend now triggers full `StateUpdated` on hex change, not just `PlayersMoved`, ensuring immediate visibility recomputation.
   - **Decision logs:** Merged inbox → decisions.md. Orchestration logs written. Agent histories updated.

## Learnings

- Dialog stacking fixed by queuing outcomes rather than discarding or consolidating
- Queue approach preserves all player-relevant information
- Single-file implementation reduces merge risk and maintains backward compatibility
- Compass stability requires early exit on convergence + stable closure refs (lerpBearingRef, compassHeadingRef)
- Proximity reveal latency is a joint backend + frontend concern; frontend throttle (3s) masked backend broadcast path

