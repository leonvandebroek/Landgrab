# Project Context

- **Project:** Landgrab
- **Created:** 2026-03-22

## Core Context

Agent Scribe initialized and ready for work. Team has successfully resolved 9 major UX issues across backend and frontend in this phase.

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

## Learnings

- Dialog stacking fixed by queuing outcomes rather than discarding or consolidating
- Queue approach preserves all player-relevant information
- Single-file implementation reduces merge risk and maintains backward compatibility
