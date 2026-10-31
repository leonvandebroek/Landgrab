# Rembrandt Orchestration Log — Visibility Architecture Review

**Timestamp:** 2026-03-23T13:40:42Z  
**Agent:** rembrandt-visibility-architect (Lead)  
**Task:** Investigated current visibility architecture, confirmed backend sends full state, planned and coordinated client-side visibility generalisation.

## Work Summary

- **Investigated** visibility architecture across backend and frontend
  - Confirmed backend does NOT strip raw tile data from Hidden cells — only sets `VisibilityTier` metadata
  - Verified `BroadcastPerViewer` performs full per-viewer state projection on significant events
  - Identified that player movement triggers unnecessary full broadcasts due to `movedToDifferentHex` check

- **Planned** three-part coordination
  - Vermeer (Frontend): Generalize beacon cone pattern to full client-side visibility derivation
  - De Ruyter (Backend): Reduce unnecessary broadcasts on movement; use `PlayersMoved` when only hex changes
  - Architecture: Keep server-side projection as authoritative fallback; frontend derives visibility locally

- **Documented** decision in `.squad/decisions/inbox/rembrandt-architecture-decision.md`

- **Coordinated** commits
  - Commit `37ba69c`: Completed visibility investigation and architecture decision

## Related Outputs

- Architecture decision: `.squad/decisions/inbox/rembrandt-architecture-decision.md`
- Session log: `.squad/log/2026-03-23T13:19:09Z-visibility-rearchitecture.md`
- Task delegation to Vermeer and De Ruyter
