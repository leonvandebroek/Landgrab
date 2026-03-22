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
