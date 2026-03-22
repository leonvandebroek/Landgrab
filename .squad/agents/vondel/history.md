# Vondel — History

## Core Context
Game Designer on Landgrab. Two game modes: Alliances (room-based, local grid) and Free-for-All (persistent global map, 1 hex ≈ 1 km). Ability system has 7 abilities with cooldowns. Fog-of-war with visibility tiers. Troop regeneration. Alliance system for team play.

## Learnings
- Team hired 2026-03-22 by Léon van de Broek
- 2026-03-22: Designed 5 intel-sharing model options for scout-gated visibility: Open Skies (all share all), Dark Map (no share), Proximity Radio (range-gated), Fading Memory (time-decay), Eyes of the Scout (scout-control + explicit Share action). Selected Eyes of the Scout + Always-Fresh Alliance Borders for implementation. No game mechanics changed; pure visibility model. (Cross-ref: de-ruyter-visibility implemented backend VisibilityService changes aligning with Eyes-of-the-Scout design.)
