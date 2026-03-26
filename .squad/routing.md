# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|---------|
| Architecture, scope, decisions, code review | Rembrandt | Tech design, PRs, trade-offs, priorities |
| Frontend (React/TypeScript/UI) | Vermeer | Components, hooks, Zustand stores, Leaflet maps, i18n, CSS |
| Backend (C#/.NET/SignalR) | De Ruyter | Hub methods, domain services, EF Core, REST endpoints, JWT |
| Testing & quality | Spinoza | xUnit tests, edge cases, test coverage, regressions |
| DevOps & infra | Tasman | Azure Pipelines, Bicep IaC, Docker, deployment, env config |
| Design & UX | Hals | UI/UX design, visual systems, accessibility, component design |
| Security | Grotius | Auth, OWASP, secrets management, access control, JWT config |
| Database & data | Huygens | EF Core migrations, schema design, query performance, indexes |
| Documentation & DevRel | Erasmus | READMEs, API docs, changelogs, onboarding guides |
| Game design & balance | Vondel | Mechanics, ability balance, game flow, feature design |
| Playtesting & game validation | Steen | Playwright MCP, game flow testing, UX evidence, bug reproduction |
| Async issue work (bugs, tests, small features) | @copilot 🤖 | Well-defined tasks matching capability profile |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, evaluate @copilot fit, assign `squad:{member}` label | Rembrandt |
| `squad:{name}` | Pick up issue and complete the work | Named member |
| `squad:copilot` | Assign to @copilot for autonomous work (if enabled) | @copilot 🤖 |

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn Spinoza to write test cases simultaneously, and Steen to validate game flow.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. Rembrandt handles all `squad` (base label) triage.
