---
name: landgrab-ux-review
description: 'Capture screenshots, record console errors, check connection and loading states, and produce a structured UX review report'
---

# UX Review for Landgrab

This skill captures evidence at each phase of a Landgrab playtest and produces a structured markdown report documenting UX quality, defects, and technical issues.

## When to use this skill

Use this skill when the playtester needs to:

- Capture screenshots at every major state transition
- Record browser console errors, warnings, and failed network requests
- Check for connection banners, loading spinners, and error overlays
- Identify visual regressions, broken layouts, or confusing UI flows
- Produce a final UX report graded by severity

## Prerequisites

- At least one browser session is active and has navigated through some game flow.
- The playtester has been executing a workflow (host-and-start, join-and-sync, or playturn).
- Evidence capture should happen alongside gameplay, not as a separate pass.

## Evidence Capture Checklist

Capture a screenshot and check for console errors at each of these transitions:

### Authentication Phase
- [ ] Auth page initial load
- [ ] Sign-up form with validation errors (if triggered)
- [ ] Successful login — lobby visible

### Lobby Phase
- [ ] Lobby screen with create/join options
- [ ] Room code input with join button state (disabled → enabled)
- [ ] Room created — wizard appears with room code

### Setup Wizard Phase
- [ ] Location step — GPS loading or debug GPS active
- [ ] Teams step — alliance assignment and player list
- [ ] Rules step — configuration controls
- [ ] Dynamics step — preset selection and feature toggles
- [ ] Review step — full settings summary before start

### Game Start Transition
- [ ] Game starting — transition from Lobby to Playing phase
- [ ] Game map initial render with player positions

### Gameplay Phase
- [ ] Player movement via debug GPS — position update on map
- [ ] Hex selection — action panel visible
- [ ] Claim action — hex ownership change
- [ ] Attack action — combat prompt and result
- [ ] Pickup action — troop count change
- [ ] Multi-player state sync — same hex state across sessions

### Connection and Loading States
- [ ] SignalR connection established indicator
- [ ] Connection lost banner (if simulated or observed)
- [ ] Reconnection attempt and recovery
- [ ] Loading spinners and skeleton states during data fetch
- [ ] Error overlays or toast messages

### Game Over (if reached)
- [ ] Win condition met — game over screen
- [ ] Final scores or statistics display

## Console Error Collection

At each evidence checkpoint:

1. Read all browser console messages at the `error` and `warning` levels.
2. Filter out expected noise (e.g., React dev mode warnings in development).
3. Record each unique error with:
   - Message text
   - Source file and line number (if available)
   - Timestamp relative to the playtest
   - Which phase the error occurred in
4. Flag any errors that correlate with visible UI issues.

## Network Request Monitoring

Check for failed or slow network requests:

1. Monitor requests to `/api/*` and `/hub/*` endpoints.
2. Flag any responses with status codes ≥ 400.
3. Flag any requests that took longer than 5 seconds.
4. Record the endpoint, method, status code, and response time.
5. Note any CORS errors or blocked requests.

## UX Issue Classification

Classify each issue found using these severity levels:

| Severity | Description | Example |
|----------|-------------|---------|
| **Critical** | Blocks gameplay or causes data loss | Game state desync, unable to join room, crash |
| **Major** | Significantly impairs experience | Wrong player shown, combat result not displayed, action rejected without feedback |
| **Minor** | Noticeable but non-blocking | Layout shift, slow loading, confusing label |
| **Cosmetic** | Visual polish only | Color inconsistency, alignment, spacing |

## Report Template

Produce the final report in this structure:

```markdown
# Landgrab Playtest UX Report

**Date**: [timestamp]
**Players**: [count and usernames]
**Environment**: Backend [url], Frontend [url]
**Room Code**: [code]
**Duration**: [start to end time]

## 1. Scenario Summary

[Brief description of what was tested and the intended flow.]

## 2. Workflow Results

| Step | Status | Evidence | Notes |
|------|--------|----------|-------|
| Auth (host) | ✅ Pass | screenshot-01.png | — |
| Room creation | ✅ Pass | screenshot-02.png | Code: ABC123 |
| Guest join | ✅ Pass | screenshot-03.png | — |
| Setup wizard | ✅ Pass | screenshot-04–07.png | — |
| Game start | ✅ Pass | screenshot-08.png | — |
| Movement | ⚠️ Issue | screenshot-09.png | See UX-001 |
| Claiming | ✅ Pass | screenshot-10.png | — |
| Attack | ❌ Fail | screenshot-11.png | See UX-002 |

## 3. UX Findings

### UX-001: [Short title]
- **Severity**: Minor
- **Phase**: Gameplay
- **Affected Player**: guest1
- **Description**: [What happened and what was expected]
- **Steps to Reproduce**: [Ordered list]
- **Evidence**: screenshot-09.png
- **Console Errors**: [Any related errors]

### UX-002: [Short title]
- **Severity**: Major
- **Phase**: Gameplay
- **Affected Player**: host
- **Description**: [What happened and what was expected]
- **Steps to Reproduce**: [Ordered list]
- **Evidence**: screenshot-11.png
- **Console Errors**: [Any related errors]

## 4. Console Error Summary

| # | Message | Source | Phase | Related Issue |
|---|---------|--------|-------|---------------|
| 1 | [error text] | [file:line] | Gameplay | UX-002 |

## 5. Network Issues

| Endpoint | Method | Status | Time | Phase |
|----------|--------|--------|------|-------|
| /api/auth/login | POST | 200 | 120ms | Auth |
| /hub/game | WS | — | — | Connected |

## 6. Connection Stability

- SignalR disconnects observed: [count]
- Reconnection successes: [count]
- Connection banners displayed: [yes/no, when]

## 7. Conclusion

### Verified Behaviors
- [List of things that worked correctly]

### Defects Found
- [List with severity and issue ID]

### Recommended Follow-Up
- [Suggested next steps or investigations]
```

## Guidelines

- **Be specific**: reference exact selectors, hex coordinates, and player names.
- **Be evidence-first**: every finding must have a screenshot or console log reference.
- **Be fair**: report what works well, not just what's broken.
- **Be actionable**: each defect should include reproduction steps a developer can follow.
- **Never modify source code** as part of a UX review. Only observe and report.
- **Compare across sessions**: if testing multiplayer, check that the same state appears for all players.

## Integration with Other Skills

This skill runs alongside the other playtester skills:

- During `landgrab-host-and-start`: capture auth, lobby, and wizard screenshots.
- During `landgrab-join-and-sync`: capture join flow and lobby sync screenshots.
- During `landgrab-playturn`: capture movement, claiming, attacking, and state sync screenshots.
- After the playtest completes: compile all evidence into the final report.

Evidence capture should be woven into the gameplay workflow, not deferred to a separate pass.
