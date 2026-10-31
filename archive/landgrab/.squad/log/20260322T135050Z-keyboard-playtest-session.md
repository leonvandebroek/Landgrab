# Session Log — Keyboard Movement 6-Player Playtest (2026-03-22)

**Date:** 2026-03-22  
**Participants:** 6 players (host + 5 guests across 3 alliances)  
**Primary Focus:** Keyboard-based movement as official desktop control method  
**Environment:** Local dev server (http://localhost:5173 + http://localhost:5001)  

---

## Session Summary

### Objectives
1. ✅ Confirm keyboard arrow keys as correct desktop movement method
2. ✅ Test 6-player alliance gameplay with keyboard control
3. ✅ Identify remaining UX friction points in multi-alliance, multi-player scenarios

### Outcome
**Keyboard controls confirmed as correct desktop baseline.** All players successfully played through setup → lobby → Playing → combat with keyboard movement as primary control. Arrow keys work reliably and auto-activate debug GPS on first press.

7 new UX issues identified (see below).

---

## Blockers Resolved Since Session 1

✅ **`currentHexQ/currentHexR = null` at game start** — De-ruyter's spawn-initialization fix now working. All 6 players received valid starting positions with `hostBypassGps: true`.

✅ **Wizard Step 0 manual coordinates blocker** — Vermeer's optimistic location flag + atomic backend step advance now working. Manual coordinate entry (52.3676, 4.9041) with "Handmatig toepassen" button reliably advances wizard.

---

## Issues Identified (7 Total)

### Issue 1: Defender combat feedback parity 🔴 P1
- **Finding:** Attacker sees full "Neerlaag/Overwinning" dialog (Win%, Attack Strength, Defense Strength, losses, survivors). Defender sees NO combat result — `combatResult: null`.
- **Impact:** Information asymmetry in player experience; defender is unaware of outcome until friendly army is captured.
- **Related Decision:** decisions.md § 2

### Issue 2: Player panel alliance visibility 🔴 P1
- **Finding:** Player panel only displays alliances the current player has interacted with. Isolated alliances (e.g., Charlie at turn 1) are invisible to other players in HUD.
- **Impact:** Multi-alliance strategy requires visual scoreboard; hidden alliances create fog-of-war confusion.
- **Related Decision:** decisions.md § 3

### Issue 3: HQ state inconsistency 🔴 P1
- **Finding:** Event log reports "Alliance Alpha HQ was auto-assigned at (-4, 4)." but `gameState.alliances[alpha].hq` remains null.
- **Impact:** Game state integrity issue; HQ value is lost between event logging and persistence.
- **Related Decision:** decisions.md § 4

### Issue 4: Server event log localization gap 🔴 P0
- **Finding:** Server-generated system messages appear in English ("Alliance Alpha HQ was auto-assigned...") despite UI language set to Dutch.
- **Impact:** Mixed-language event log degrades i18n polish and player experience.
- **Related Decision:** decisions.md § 5

### Issue 5: Troop pickup success ambiguity 🟡 P2
- **Finding:** Pickup from a second hex while carrying troops from first returns `success: true` with unchanged `carriedTroopsAfter`. No error feedback; silent block.
- **Impact:** Player expects troops to be transferred; receives false success signal instead.
- **Related Decision:** decisions.md § 6

### Issue 6: Modal stacking during rapid actions 🟡 P2
- **Finding:** "Gebied Veroverd!" and "Neerlaag" dialogs appeared simultaneously without clearing previous modals.
- **Impact:** Overlapping text makes dialogs unreadable; unclear which outcome applies to which action.
- **Related Decision:** decisions.md § 7

### Issue 7: Rules overlay blocks first-turn combat observation 🟡 P2
- **Finding:** Help overlay auto-shows on first game entry for each player and must be manually dismissed. Blocks players from observing real-time combat in progress.
- **Impact:** New players cannot learn-by-watching; steenp4/steenp5 missed initial alliance combat due to overlay.
- **Related Decision:** decisions.md § 8

---

## Other Observations

- **Keyboard responsiveness:** Arrow keys respond immediately with ~1 keystroke latency. No input lag detected.
- **Q/E heading controls:** Not implemented. Task description is aspirational; Q/E keys have no binding currently.
- **Enter key for action confirmation:** Confirmed working — advances primary action (claim/attack) on current hex.
- **`player_enable_debug_gps` tool limitation:** Cannot be used in-game (toggle button not accessible via testId); use `session_press_key("ArrowRight")` directly instead.
- **Single-source troop constraint:** Backend correctly rejects pickup from second source while carrying troops; UI success feedback is incorrect (Issue #5).
- **Attacker tool bypass:** `player_attack_hex` tool can bypass disabled-button check; UI shows insufficient troops but API processes attack anyway.
- **Win condition visibility:** Progress toward 30% visible (10/217 hexes = 4.6%, 65 hexes needed). Progress slow in PresenceOnly mode with limited inter-alliance conflict.
- **Timeout notification:** "Timeout expired ▼" appeared for steenp5 (Charlie player); cause unclear, possibly guidance timer.

---

## Recommendations

1. **Immediate (P0):** Localize server event log messages to active UI language
2. **High (P1):** Implement defender combat feedback; show HQ/alliance state correctly in all player panels
3. **Medium (P2):** Queue modal overlays; make rules overlay skippable or auto-dismiss after 30s
4. **Follow-up:** Document Q/E heading scope (implement or remove from task descriptions)

---

## Session Conclusion

Keyboard controls are confirmed as the correct method for all desktop playtesting. All 6-player gameplay flows work end-to-end (setup → lobby → Playing → combat). Identified issues are improvements to existing features, not blockers to core gameplay. Next session can focus on decision implementation and issue fixes.
