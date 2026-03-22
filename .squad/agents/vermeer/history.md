# Vermeer — History

## Core Context
Frontend Dev on Landgrab. React 19 + TypeScript + Vite + Zustand + Leaflet + i18next. Strict TypeScript mode. EN/NL i18n. Canvas-based hex map via Leaflet custom layers.

Key patterns:
- All useState in App.tsx; props drilling is intentional
- eventsRef pattern in useSignalR for stale closure prevention
- Zustand stores: gameStore, gameplayStore, notificationStore, uiStore, infoLedgeStore
- Build: `npm run lint && npm run build` from frontend/landgrab-ui/

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
- **Setup Wizard Step 1 — location race condition (2026-03-22):** `SetupWizard.tsx` held a `canGoNext` (step 0) check that depended solely on `gameState.hasMapLocation` (server-side). After calling `handleSetMapLocation`, there is a round-trip window where `serverWizardStep` (from `gameState.currentWizardStep`) holds `effectiveStep` at 0 and `gameState.hasMapLocation` is still false — leaving Next disabled. Fix: added `locationApplied` optimistic local flag (set on `handleSetMapLocation`); `canGoNext` step 0 is now `stepComplete.location || locationApplied`. No SignalR shape changes were needed. Added i18n key `wizard.locationRequired` (EN/NL) and an inline footer hint when Next is blocked on step 0.
- **2026-03-22 (steen-continued-ux cross-reference):** Frontend wizard fix was validated in 6-player playtest, but downstream gameplay reveals 4 critical/major blockers that require follow-up: null currentHex on game start, no debug movement fallback, false-success action feedback, no in-game location recovery. See .squad/decisions.md items 4–6.
