# Squad Decisions

## Active Decisions

### 1. Backend: Auto-advance wizard step on map location set (2026-03-22)
**Status:** Implemented  
**Agent:** de-ruyter-wizard-fix  
**Change:** MapAreaService.SetMapLocation now atomically advances CurrentWizardStep from 0→1 when location is successfully set, eliminating frontend-backend timing race.  
**Rationale:** Deterministic wizard progression; single authoritative state update includes both location and step.  
**SignalR Impact:** None — no message format changes.

### 2. Frontend: Add optimistic location flag + i18n hints (2026-03-22)
**Status:** Implemented  
**Agent:** vermeer-wizard-fix  
**Change:** SetupWizard.tsx now uses `locationApplied` optimistic flag; Next button unlocks immediately after SetMapLocation call. Added `wizard.locationRequired` i18n key (EN/NL) with footer hint when blocked.  
**Rationale:** User feedback is immediate while backend state converges; reduces perceived lag and guides user toward solution.  
**SignalR Impact:** None — no message format changes.

### 3. Deterministic non-GPS host setup path (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** Make manual coordinates a first-class, always-available path; add explicit blocker diagnostics when Next/Start is disabled (e.g., "Map center not set", "Master tile missing").  
**Rationale:** Unblocks sessions in privacy-restrictive environments; improves playtest signal by surfacing root causes.  
**Dependent on:** Completion of Items 1–2 (already done).

### 4. Guarantee movement fallback in Playing when geolocation denied (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** Ensure debug GPS controls exist in Playing UI or host bypass precondition guard is enforced before start; all players must have actionable location state.  
**Rationale:** 6-player playtest reached Playing but all players had null currentHex; no recovery path when geolocation denied at start.  
**Evidence:** All players: `currentHexQ/currentHexR = null`, debug GPS step controls missing (`[data-testid="debug-gps-step-*"]`).

### 5. Unify action-result contracts for claim/pickup/attack (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** Align frontend action success feedback with authoritative server outcomes; never report `success: true` when no effective state change occurred.  
**Rationale:** Action feedback must match actual game state change; prevents user confusion and false success signals.  
**Evidence:** Pickup/claim helpers report `success: true` for non-owner or out-of-position contexts while territory/troops do not progress.

### 6. Improve in-game recovery messaging for geolocation lock states (proposed)
**Status:** Pending  
**Agent:** steen-continued-ux  
**Decision:** When geolocation denied and movement impossible, show explicit actionable guidance (e.g., return to lobby for bypass, browser permission instructions, retry path).  
**Rationale:** Current passive notification (info-ledge "User denied Geolocation") offers no remediation path; active guidance improves UX.  
**Evidence:** Players receive persistent "User denied Geolocation" notification but cannot recover without host abort.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
