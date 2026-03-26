# Vondel — Intel Sharing Design Exploration (2026-03-22)

## Agent: vondel-intel-design
**Mode:** background (claude-opus-4.6)  
**Focus:** Game design for Scout-gated alliance intel model

## Deliverable

Produced 5 distinct design options for intel visibility model (without code changes):

1. **Open Skies**  
   - All alliance members share all visible intel in real-time.
   - Simplest UX; no strategic intel asymmetry.

2. **Dark Map**  
   - Alliance members see only their own visibility; no intel sharing.
   - Highest privacy; limits coordination and intel value.

3. **Proximity Radio**  
   - Shared intel is range-gated from player position (e.g., 8-hex radius).
   - In-person communication metaphor; scales with player density.

4. **Fading Memory**  
   - Intel decays over time (e.g., 30s freshness before stale tag).
   - Real-time gameplay with strategic decision windows; staleness indicates age.

5. **Eyes of the Scout**  
   - Beacon sector visible only to beacon owner; explicit Share action required.
   - Scout control + initiative; allies must request intel or rely on border visibility.

## Decision Context

Selected direction: **Eyes of the Scout** (option 5) with **Always-Fresh Alliance Borders**

- Beacon sector: personal-only for scout.
- Border tiles (alliance neighbors): always current for all members.
- Share action: scout-initiated explicit broadcast.
- Rationale: Preserves scout gameplay autonomy while maintaining minimum alliance coordination via border intel.

## Validation

Design review completed; no code conflicts identified. Backend implementation (de-ruyter-visibility) aligns with option 5 + border intel constraint.
