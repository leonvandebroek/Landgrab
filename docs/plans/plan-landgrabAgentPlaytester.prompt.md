## Plan: Landgrab agent playtester stack

Implement the full recommended setup in the repository by combining a repo-shared custom MCP server, a specialized Copilot agent, focused skills, and the minimum in-app automation affordances needed for reliable multiplayer gameplay and UI/UX review. The recommended shape is: a Node/TypeScript MCP server under a new top-level `tools/landgrab-agent-mcp/` workspace, repo-shared agent and skills under `.github/`, frontend automation hooks and stable selectors in `frontend/landgrab-ui/`, and documentation covering local setup and usage. Design for arbitrary player counts, but verify the first end-to-end flow with a host plus one guest before broadening scenarios.

**Steps**
1. Phase 1 — Define the contracts and repo structure. Create the repository-scoped architecture for the playtester stack: choose the MCP server location, define tool boundaries (browser/session orchestration, auth, room lifecycle, movement, gameplay, screenshots, UX evidence), define the custom agent responsibilities, define which workflows belong in skills, and define which in-app hooks/selectors are required. This step blocks all implementation work.
2. Phase 2 — Add frontend automation affordances in parallel where safe. Modify the React/Vite app so automation can reliably host, join, move, and act without brittle selectors: add stable identifiers for auth, lobby, setup wizard, review/start flow, gameplay controls, debug GPS panel, and rendered hexes; expose any minimal non-production test hooks needed for structured inspection; preserve current gameplay behavior and keep the frontend server-authoritative. This depends on step 1.
3. Phase 3 — Build the multiplayer browser harness. Extend the existing Playwright setup from localization-only coverage into a real reusable multiplayer harness that can spin up host and guest browser contexts, register/login users, share room codes, toggle debug GPS, synchronize on `StateUpdated`, and capture screenshots plus console/network evidence. This depends on steps 1 and 2.
4. Phase 4 — Implement the MCP server. Create a dedicated MCP workspace that wraps the browser harness and exposes high-level tools for Landgrab playtesting instead of low-level click-only operations. Core tools should cover session lifecycle, user auth/session seeding, room creation/join/start, player movement, legal action execution, game-state snapshot retrieval, screenshot capture, and UX evidence collection. This depends on steps 1 through 3.
5. Phase 5 — Add repo-shared Copilot customizations. Create a specialized custom agent that prefers the Landgrab MCP tools, uses the browser only for visible verification, and follows a deterministic playtest workflow. Add focused skills for hosting/starting a room, joining as guest(s), playing a turn cycle, and producing a UX review report. This depends on step 4, and parts of the skills can be authored in parallel once the MCP tool names/contracts are stable.
6. Phase 6 — Add scenario coverage for scalable multiplayer. Implement reusable abstractions so the stack is not hard-coded to two players: player registry, context pooling, room-code sharing, ready-state synchronization, and action dispatch by player identity. Verify initially with host + 1 guest, then add at least one small-group scenario (host + 2 or 3 guests) if time permits. This depends on steps 3 through 5.
7. Phase 7 — Document setup and operation. Add repo documentation for the MCP server, custom agent, skills, environment flags, startup commands, and recommended workflows for “play the game”, “run a multiplayer smoke test”, and “perform a UI/UX review”. This depends on steps 4 through 6.
8. Phase 8 — Verify comprehensively. Validate the stack by running the backend and frontend locally, executing targeted Playwright gameplay scenarios, exercising the MCP tools through the custom agent workflow, and confirming the agent can host, have guests join, start, play, and collect UX evidence without manual intervention. This depends on all prior steps.

**Relevant files**
- `/Users/leonvandebroek/Projects/Github/Landgrab/.github/copilot-instructions.md` — Update repo-wide guidance with the new playtester stack, verification commands, and any conventions for using the MCP-backed agent.
- `/Users/leonvandebroek/Projects/Github/Landgrab/.github/agents/landgrab-playtester.agent.md` — New primary custom agent for multiplayer gameplay and UX review using the Landgrab MCP server.
- `/Users/leonvandebroek/Projects/Github/Landgrab/.github/skills/landgrab-host-and-start/SKILL.md` — New skill for host setup, room creation, and game start workflow.
- `/Users/leonvandebroek/Projects/Github/Landgrab/.github/skills/landgrab-join-and-sync/SKILL.md` — New skill for guest join, lobby sync, and readiness verification.
- `/Users/leonvandebroek/Projects/Github/Landgrab/.github/skills/landgrab-playturn/SKILL.md` — New skill for structured gameplay turn execution via MCP tools.
- `/Users/leonvandebroek/Projects/Github/Landgrab/.github/skills/landgrab-ux-review/SKILL.md` — New skill for screenshot/evidence-driven UI/UX review and reporting.
- `/Users/leonvandebroek/Projects/Github/Landgrab/tools/landgrab-agent-mcp/package.json` — New MCP workspace manifest and scripts.
- `/Users/leonvandebroek/Projects/Github/Landgrab/tools/landgrab-agent-mcp/tsconfig.json` — MCP workspace TypeScript config.
- `/Users/leonvandebroek/Projects/Github/Landgrab/tools/landgrab-agent-mcp/src/server.ts` — MCP entry point, tool registration, and server bootstrap.
- `/Users/leonvandebroek/Projects/Github/Landgrab/tools/landgrab-agent-mcp/src/tools/` — New high-level MCP tool implementations for auth, room orchestration, movement, gameplay, screenshots, and UX evidence.
- `/Users/leonvandebroek/Projects/Github/Landgrab/tools/landgrab-agent-mcp/src/lib/` — Shared orchestration primitives such as browser/session registry, user provisioning, SignalR helpers, state normalization, and evidence collection.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/playwright.config.ts` — Expand from frontend-only mock-friendly config to a real local full-stack gameplay harness and reusable projects/fixtures.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/e2e/` — Add reusable multiplayer gameplay specs and helpers that the MCP server can reuse or mirror.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/auth/AuthPage.tsx` — Add stable automation affordances for auth flow.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/LobbyView.tsx` — Add stable automation affordances for lobby shell and entry actions.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/GameLobby.tsx` — Add stable automation affordances for room join/create and role-specific views.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/SetupWizard.tsx` — Add stable hooks for host setup progression and observer/player mode selection.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/lobby/RulesStep.tsx` — Keep the GPS bypass and advanced settings automation-friendly.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/DebugLocationPanel.tsx` — Make debug GPS controls easy for automation to target; this is the preferred non-production movement seam.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/GameView.tsx` — Add stable hooks for gameplay mode, observer mode, and UX evidence collection.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/map/GameMap.tsx` — Preserve map interaction while supporting automation and inspection.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/components/game/map/HexGridLayer.ts` — Add stable per-hex identifiers and any safe metadata needed for reliable hex targeting.
- `/Users/leonvandebroek/Projects/Github/Landgrab/frontend/landgrab-ui/src/App.tsx` — Central place for debug GPS gating, current-location handling, and any app-level test mode toggles.
- `/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Api/Hubs/GameHub.Lobby.cs` — Reference only; gameplay orchestration must continue to use existing hub methods for room lifecycle.
- `/Users/leonvandebroek/Projects/Github/Landgrab/backend/Landgrab.Api/Hubs/GameHub.Gameplay.cs` — Reference only; MCP/browser workflows should reuse existing gameplay hub methods rather than bypassing them.
- `/Users/leonvandebroek/Projects/Github/Landgrab/docs/` — Add or update docs for playtester architecture, setup, and usage. A new file such as `/Users/leonvandebroek/Projects/Github/Landgrab/docs/agent-playtester.md` is a likely target.
- `/Users/leonvandebroek/Projects/Github/Landgrab/README.md` — Optionally link the new playtester docs if the repo’s main entry point should advertise the capability.

**Verification**
1. Run the existing local services stack and confirm the backend and frontend start cleanly using the repository’s current commands and tasks.
2. Run targeted Playwright gameplay scenarios that prove a host can create a room, a guest can join, the host can start the game, both players can move with debug GPS or equivalent test movement, and at least one claim and one attack complete successfully.
3. Validate that console errors, connection banners, and stuck loading states are captured as evidence rather than silently ignored.
4. Exercise the MCP server directly with a minimal scripted smoke flow: create player sessions, create/join room, start game, move, act, capture screenshot, and fetch a structured state snapshot.
5. Validate the custom agent can use the MCP-backed workflow end-to-end inside the repo without requiring ad hoc manual browser steps.
6. Confirm the skills resolve the correct workflows from their descriptions and do not conflict with existing repo customizations.
7. Verify the scalable abstraction by running at least one scenario with more than two player contexts or, if time-limited, by proving the harness APIs are player-indexed rather than host/guest-hardcoded.
8. Re-run focused frontend lint/build validation and any relevant backend test/build checks touched by implementation.

**Decisions**
- Implement the full recommended setup now, not a documentation-only or agent-only subset.
- Keep the customization repo-shared under `.github/` so the team can reuse it.
- Design the stack for scalable player counts, but use host + 1 guest as the first hard verification slice to keep the rollout reliable.
- Prefer a dedicated top-level Node/TypeScript MCP workspace because it can naturally host Playwright/browser orchestration and stay decoupled from the ASP.NET runtime.
- Reuse existing backend hub methods and current frontend debug GPS seams instead of introducing a separate gameplay protocol.
- Keep production behavior unchanged; any automation hooks should be stable selectors or non-production/debug affordances, not alternate game logic.
- Do not change live gameplay rules, hub contracts, or normal human player flows; new capabilities must be passive metadata, test-only, or explicitly debug-gated.

**Production Safety Checklist**
1. All new gameplay automation capabilities must be additive only; they must not alter win conditions, combat, troop flow, room lifecycle semantics, or any other live gameplay rule.
2. Any new frontend affordances used by automation must be passive metadata (`data-*`, ARIA labels, stable selectors) or explicitly non-production/debug-gated behavior.
3. Existing hub methods and payload contracts used by human players must remain backward-compatible; do not repurpose, weaken, or special-case them for bots.
4. Any optional inspection or test surfaces must be unavailable by default in production and enabled only through development or explicit test configuration.
5. The MCP server and custom agent must live outside the runtime-critical gameplay path; a failure in the playtester stack must never block normal app startup or gameplay.
6. Verification must include a regression pass that confirms the normal host/guest human flow still works without enabling test flags or debug tooling.

**Further Considerations**
1. If the MCP server eventually needs faster state introspection than browser-only observation provides, add a thin test-safe inspection surface later, but keep phase-one execution path aligned with real app behavior.
2. If multi-guest orchestration proves flaky through pure UI synchronization, promote shared state tracking and room coordination into the MCP library layer rather than duplicating retry logic across skills or prompts.
3. If the team wants separate personas for gameplay and UX critique, split the single playtester agent into two repo agents after the common MCP tools stabilize.
