# Steen — History

## Core Context
Playtester on Landgrab. Uses Playwright MCP (playwright-browser_* tools) to play through the game. Key skills: landgrab-host-and-start, landgrab-join-and-sync, landgrab-playturn, landgrab-ux-review. Dev server at http://localhost:5173, backend at http://localhost:5001.

Always read .github/agents/landgrab-playtester.agent.md before starting a playtest session. Never bypass SignalR — always go through the real UI.

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
- 2026-03-22: 6-player Alliances playtest reached full lobby sync (host + 5 guests) with room code propagation and join stability, but setup wizard blocked at Step 1 (Location) when geolocation denied; manual-coordinate path did not reliably unlock Next/Start. This is a critical UX bottleneck for desktop/privacy-conscious users.
- 2026-03-22: In pre-auth state, `/api/auth/me` consistently logs 401 errors in browser console before login across sessions; technically expected but noisy during first-load UX and can obscure real errors during playtests.
- 2026-03-22: At 6 players, lobby information density remained readable enough for joining verification, but host setup progression feedback was weak when blocked (insufficient guidance on what requirement still prevents continuing).
- 2026-03-22 (continued): Wizard Step 1 blocker was resolved by manual coordinates (52.3676, 4.9041) after geolocation denial; "Opnieuw proberen" still failed with `User denied Geolocation` and did not surface any permission-recovery guidance.
- 2026-03-22 (continued): 6-player flow reached Playing with stable phase sync, but deterministic gameplay actions were blocked because all players had `currentHexQ/currentHexR = null` and debug GPS controls were not available in-game (`[data-testid="debug-gps-step-*"]` missing), making movement-dependent actions non-executable.
- 2026-03-22 (continued): Gameplay action feedback is inconsistent: claim/pickup helpers can return `success: true` while carried troops and territory do not change in meaningful ways for non-owner players, while event stream simultaneously reports `You must be physically inside that hex to interact with it.` This creates high ambiguity about action validity.
- 2026-03-22 (continued): Attempting to recover via rules toggle in Playing (`hostBypassGps`) returns runtime error `GPS bypass can only be changed in the lobby.` This is logically valid, but there is no in-game recovery UX when a room is started with denied geolocation and no debug movement path.

## Session 2 — 2026-03-22 (Keyboard Movement 6-Player)

### Blocker Resolution Status
- ✅ BLOCKER RESOLVED: `currentHexQ/currentHexR = null` issue from Session 1 is FIXED. With `hostBypassGps: true` in lobby rules, all 6 players receive valid currentHex positions at game start.
- ✅ BLOCKER RESOLVED: Wizard Step 0 (Location) manual coordinates path now works reliably. Entering Amsterdam coords (52.3676, 4.9041) via "Voer coördinaten handmatig in" and clicking "Handmatig toepassen" advances wizard to Step 1 immediately. Decision 1+2 (backend atomicity + optimistic flag) confirmed working.

### Keyboard Movement — CONFIRMED CORRECT METHOD
- Arrow keys (ArrowUp/Down/Left/Right) ARE the correct desktop movement method. They are bound in App.tsx via `window.addEventListener('keydown', ...)` and call `stepDebugLocationByHex` when `canStepDebugByHex` is true.
- All 4 arrow keys confirmed working on both host AND guest sessions: ArrowRight (+1Q), ArrowLeft (-1Q), ArrowUp (+1R), ArrowDown (-1R).
- Arrow keys SELF-ACTIVATE debug GPS on first press — no manual debug GPS toggle required before using arrows.
- `player_enable_debug_gps` tool fails in-game because the debug panel toggle button is not accessible via testId. Use `session_press_key("ArrowRight")` directly instead.
- Q/E keys for heading adjustment are NOT implemented — no binding exists, `currentHeading` stays null. The task description mentioning Q/E is aspirational/future scope.

### Gameplay Findings (Session 2)
- Enter key confirms the primary enabled action on the current hex (claim, attack) — confirmed working.
- Troop pickup from a hex works, but single-source constraint: cannot pick up from a second hex while carrying troops from the first source. Pickup returns `success: true` with unchanged `carriedTroopsAfter` when blocked by source constraint (Decision #5 bug still present).
- Combat: attacker sees full "Neerlaag/Overwinning" dialog with Winkans%, Aanvalskracht, Verdedigingskracht, losses, survivors. Defender sees NO combat result — `combatResult: null` on defender side.
- `player_attack_hex` tool can bypass the disabled-button check (UI shows "insufficient troops" but API processes attack anyway, attacker loses troops).
- Rules help overlay shows on first game entry for each player and must be dismissed before playing. This blocked steenp4 and steenp5 from observing combat in real-time.

### 6-Player Specific Findings (Session 2)
- Player panel only shows alliances the current player has interacted with. Charlie (isolated alliance) was invisible in Alpha/Bravo panels and vice versa throughout the session.
- Event log system messages are in ENGLISH despite UI language being Dutch: "Alliance Alpha HQ was auto-assigned at (-4, 4)." — localization gap in server-generated events.
- "Timeout expired ▼" status notification appeared for Charlie player (steenp5) — cause unclear, possibly guidance timeout.
- Charlie alliance HQ shows as `null` in alliances state despite event log confirming auto-assignment at (0,-4). Possible server state persistence bug.
- Multiple dialogs stack simultaneously (e.g., "Gebied Veroverd!" + "Neerlaag") without clearing previous dialogs.
- Win condition progress visible (10/217 = 4.6%, 30% = 65 hexes needed), but progress toward 30% is slow in PresenceOnly mode with isolated alliance interaction.
- React Hooks violation during Vite HMR (hot reload) at game start — ErrorBoundary caught and recovered, but indicates a conditional hook in `useGameActionsGameplay.ts`.

## Session 2 Outcomes — Cross-Agent Confirmations

### ✅ Keyboard Controls Confirmed Working
- Arrow keys (↑↓←→) are **the** correct desktop movement method for all playtesting.
- No Q/E heading controls implemented (aspirational scope).
- F key for map re-centering works as documented.
- Mobile viewport requirement (iPhone 390×844) confirmed critical for accurate UI testing.
- All documentation updates merged into Steen's charter (.squad/agents/steen/charter.md).

### ✅ De-Ruyter's Backend Fix Confirmed
- `LobbyService.StartGame` now assigns starting hex to each player before Playing phase.
- All 6 players received valid `currentHexQ/currentHexR` at game start with `hostBypassGps: true`.
- Spawn priority (player-owned → alliance-owned → master → fallback) working as designed.
- dotnet build + dotnet test passed; no breaking changes to SignalR contracts.

### ✅ Vermeer's Frontend Error Feedback Confirmed
- Gameplay action helpers (claim, pickup, attack) now call `useInfoLedgeStore.push()` with error severity when position is null.
- GuidanceBanner.tsx added for contextual position guidance; no more silent action failures.
- `errors.noPositionForAction` i18n keys added (EN/NL); npm run lint + npm run build passed.

### 🔴 7 New UX Issues Identified (Pending)
1. **Defender combat feedback parity** — Defender sees `combatResult: null` while attacker gets full dialog (decisions.md § 8)
2. **Player panel alliance visibility** — Hidden alliances in multi-alliance HUD (decisions.md § 9)
3. **HQ assignment state inconsistency** — Event shows auto-assignment but `alliance.hq` remains null (decisions.md § 10)
4. **Server event log localization** — English messages in Dutch UI (decisions.md § 11)
5. **Troop pickup false success** — Returns `success: true` when blocked by source constraint (decisions.md § 12)
6. **Modal stacking** — Outcome dialogs overlap without clearing (decisions.md § 13)
7. **Rules overlay blocks combat observation** — Help overlay must be dismissed before gameplay (decisions.md § 14)

All findings documented in `.squad/log/20260322T135050Z-keyboard-playtest-session.md` and moved to decisions.md as proposed items (§ 7-14).

### Orchestration Records
- `.squad/orchestration-log/20260322T135050Z-de-ruyter.md` — Backend initialization fix
- `.squad/orchestration-log/20260322T135050Z-vermeer.md` — Frontend error feedback improvements
- `.squad/orchestration-log/20260322T135050Z-steen.md` — 6-player playtest completion + 7 issues
- `.squad/orchestration-log/20260322T135050Z-coordinator.md` — Charter updates + decision consolidation
- 2026-03-22: Ran a fresh 6-player manual-coordinates playtest (room CQKB5Z) using mobile viewport 390x844. Confirmed currentHex on start, alliance/HQ sync, alliance visibility, and pickup carrying feedback; still saw a false-success pickup on a second source (`success: true` with unchanged carried count), Q/E heading remained unchanged, and combat/defender feedback/dialog stacking could not be fully exercised because attack calls stayed in preview/no-combat mode.
