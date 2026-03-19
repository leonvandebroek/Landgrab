# Map UI/UX Outdoor Visibility Improvement Plan

## Summary

The Landgrab game map has 10 confirmed UX issues that make outdoor mobile gameplay difficult. Players physically running around in sunlight cannot distinguish hex states, read troop badges, see supply disconnections, or understand what map elements mean without a legend. This plan addresses all issues across 3 phases: Phase 1 tackles the legend component and critical visibility fixes (borders, badges, overlays); Phase 2 fixes icon sizing, terrain improvements, and interaction indicators; Phase 3 polishes terrain colors and adds verification. Phases are structured so that independent tasks within each phase can be parallelized.

---

## Architecture Context

| Layer | File | Responsibility |
|-------|------|----------------|
| Hex SVG rendering | `components/map/HexTile.tsx` | Renders SVG polygons, overlays, foreignObject icons/badges |
| Style descriptors | `components/game/map/hexRendering.ts` | Pure functions: `getHexBorderStyle()`, `getHexFillStyle()`, `getTroopBadgeDescriptor()`, `shouldRenderTerrainIcon()` |
| Troop badge | `components/map/TroopBadge.tsx` | React component for circular troop count badge |
| Terrain colors | `utils/terrainColors.ts` | `terrainFillColors` and `terrainFillOpacity` lookup tables |
| Animations | `styles/index.css` | `border-pulse`, `current-hex-pulse`, `hq-hex-glow`, `master-shimmer` keyframes |
| HUD layout | `components/game/PlayingHud.tsx` | Top status bar → InfoLedge → Map area → Bottom HUD overlay → PlayerHUD |
| Help system | `components/game/HelpOverlay.tsx` | Modal with game mechanic descriptions (no visual color legend) |
| Display settings | `components/game/PlayerDisplaySettings.tsx` | Marker style/size only—no contrast/visibility toggles |
| Design tokens | `styles/index.css :root` | `--bg`, `--surface`, `--surface2`, `--accent`, `--accent2`, `--danger`, `--text`, `--muted`, `--radius` |
| Icon system | `components/common/GameIcon.tsx` | 40 SVG icons, sizes `sm`/`md`/`lg`, uses `currentColor` |

**Key insight—dual badge rendering**: `TroopBadge.tsx` renders its own dark glass gradient (`rgba(30,41,59,0.95)` → `rgba(15,23,42,0.95)`), while `getTroopBadgeDescriptor()` in hexRendering.ts computes an owner-color-based gradient. The TroopBadge component's inline styles take precedence. Changes to badge appearance must target `TroopBadge.tsx` directly.

---

## Phase 1: Legend Component + Critical Visibility Fixes

**Goal**: Make the game playable outdoors. Fix the 4 critical issues that cause misreads of game state.

### Step 1.1 — Map Legend Component (New)

**Issue**: #1 — No Map Legend. Players have zero visual reference for what hex colors, border styles, and icons mean. The existing `HelpOverlay.tsx` only describes mechanics in text—it has no color swatches, no border samples, no icon previews.

**What to build**: A compact, collapsible legend panel showing visual samples of all hex states.

**Task type**: Designer (design) → Coder (implement)

**Files**:
- Create: `components/game/MapLegend.tsx`
- Create: `styles/map-legend.css`
- Modify: `components/game/PlayingHud.tsx` (add toggle button + render MapLegend)
- Modify: `styles/index.css` (import map-legend.css)

**Specifications**:

1. **Toggle button**: Small `(?)` or legend icon button in the top-right of the `top-stats-row` (next to existing `hud-menu-btn-flat`). Size: minimum 44×44px touch target. Z-index: 1000 (same as `top-status-bar`).

2. **Panel layout**: Positioned as a floating panel anchored top-right, below the toggle button. Width: 260px max, auto height. Max-height: 60vh with overflow-y scroll. Background: `var(--surface)` with `backdrop-filter: blur(12px)`. Border: `1px solid rgba(255,255,255,0.12)`. Border-radius: `var(--radius)` (24px). Padding: 16px.

3. **Legend sections** (each is a row with visual sample + label):

   **Hex Ownership**:
   - Your hex: Small hex swatch filled with player color, white border (weight 4) → "Your territory"
   - Teammate hex: Same style with team color → "Teammate"
   - Enemy hex: Same style with enemy color → "Enemy territory"
   - Neutral hex: Dark fill `#0f172a` at 0.6 opacity, slate border → "Unclaimed"

   **Special States**:
   - Current location: Green pulsing border swatch → "You are here"
   - Selected hex: Cyan glow swatch → "Selected hex"
   - Supply disconnected: Dashed red/orange swatch → "Cut off from HQ"
   - Contested: Pulsing border swatch → "Border under attack"

   **Buildings** (conditional on dynamics):
   - HQ icon + amber border → "Headquarters"
   - Fort icon + fuchsia border → "Fort"
   - Fortified icon + amber border → "Fortified"
   - Master tile icon + gold border → "Capture point"

   **Terrain** (conditional on `terrainEnabled`):
   - Row per terrain type with `GameIcon` + color swatch + label
   - Only show: Forest, Hills, Steep, Water, Park, Building, Road

4. **Conditional rendering**: Each section only renders if the corresponding dynamic is enabled (read from game store's `dynamics` object). Mirror the pattern used in `HelpOverlay.tsx` which already checks `terrainEnabled`, `hqEnabled`, `supplyLinesEnabled`, etc.

5. **Interaction**: Tap toggle to open/close. Tap outside or tap toggle again to close. No drag, no resize. Auto-close after 10 seconds of no interaction (optional, designer decision).

6. **Responsive**: At screen width ≤ 375px, panel goes full-width with 12px margin on each side. At > 375px, anchored to right with 12px margin.

7. **Animation**: Slide-in from top-right with 200ms ease-out. Match `enter-active` pattern used by GuidanceBanner.

**Why not extend HelpOverlay**: HelpOverlay is a full-screen modal with text paragraphs. A legend needs to be a quick-glance floating panel that doesn't obscure the map. Different interaction model entirely.

---

### Step 1.2 — Fix Supply Disconnected Overlay

**Issue**: #2 — Supply disconnected overlay is nearly invisible. `strokeWidth=2`, dashed `"6 5"`, color `rgba(214, 225, 240, 0.72)`. A light blue dashed line on a dark map in sunlight is unreadable.

**Task type**: Coder

**File**: `components/map/HexTile.tsx` (lines 274-287, the supply disconnected overlay polygon)

**Current values**:
```
stroke: rgba(214, 225, 240, 0.72)  — light blue, 72% opacity
strokeWidth: 2
strokeDasharray: "6 5"
fillOpacity: 0  — transparent fill
```

**Change to**:
```
stroke: #ef4444  — Red-500 (danger color, matches --danger token)
strokeWidth: 4
strokeDasharray: "8 4"  — wider dashes, smaller gaps
strokeOpacity: 0.9
fill: rgba(239, 68, 68, 0.08)  — very subtle red tint fill
fillOpacity: 0.08
```

**Rationale**: Supply disconnection is a critical gameplay state (you lose troops over time). Red communicates danger universally. Thicker stroke with smaller gaps ensures the pattern reads as a continuous warning border. The subtle red fill tint adds a second visual channel.

**Edge case**: Ensure the red supply-disconnected stroke doesn't visually conflict with the existing raid marker overlay which also uses `#ef4444`. The raid marker uses a solid fill at 0.15 opacity—differentiation comes from the dashed vs solid pattern. Consider using `#f97316` (Orange-500) instead if playtesting reveals confusion between raids and supply disconnection. The legend (Step 1.1) will disambiguate.

---

### Step 1.3 — Fix Neutral Hex Borders

**Issue**: #3 — Neutral hex borders (`#475569`, weight 3, opacity 0.6) are invisible in bright outdoor conditions. Players can't see the hex grid on unclaimed territory.

**Task type**: Coder

**File**: `components/game/map/hexRendering.ts` — `getHexBorderStyle()` function, the neutral/unowned branch

**Current values** (neutral, non-inactive):
```
borderColor: #475569  — Slate-600
borderWeight: 3
borderOpacity: 0.6
```

**Change to**:
```
borderColor: #64748b  — Slate-500 (one step lighter)
borderWeight: 3  — keep at 3 (neutral shouldn't be as prominent as owned)
borderOpacity: 0.8  — bump from 0.6 to 0.8
```

**Rationale**: Neutral hexes need to be visible enough to see the grid, but not so bold that they compete with owned territory borders (weight 4-8). Bumping from Slate-600 to Slate-500 and from 0.6 to 0.8 opacity creates a noticeable grid without visual dominance. The owned hexes still have white borders at opacity 1.0 with higher weight, maintaining clear hierarchy.

**Also fix inactive hex borders** (same function):
```
Current: #334155 (Slate-700), weight 2, opacity 0.3
Change to: #475569 (Slate-600), weight 2, opacity 0.5
```
Inactive hexes should still be the most subtle, but 0.3 opacity is below the 0.7 minimum. 0.5 is a compromise—they're truly out-of-play hexes, so they shouldn't compete with the active grid. This is an exception to the 0.7 rule since inactive hexes are intentionally de-emphasized and not critical game state.

---

### Step 1.4 — Fix TroopBadge Outdoor Readability

**Issue**: #4 — TroopBadge uses a dark glass gradient (`rgba(30,41,59,0.95)` → `rgba(15,23,42,0.95)`) with a thin 2.5px colored border. In outdoor sunlight on a dark map, dark badges on dark hexes disappear.

**Task type**: Designer (approve direction) → Coder (implement)

**File**: `components/map/TroopBadge.tsx` — badge container styles (line ~44 onward)

**Current values** in TroopBadge.tsx:
```
background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))
borderWidth: 2.5px
borderColor: ownerColor (dynamic)
color: #f1f5f9 (Slate-100)
boxShadow: 0 0 12px ${ownerColor}, 0 4px 8px rgba(0,0,0,0.5)
```

**Change to**:
```
background: linear-gradient(135deg, 
  hsl(${badgeHue}, ${badgeSaturation}%, 60%) 0%, 
  hsl(${badgeHue}, ${badgeSaturation}%, 40%) 100%)
borderWidth: 3px
borderColor: #ffffff (white)
color: #ffffff
textShadow: 0 1px 3px rgba(0,0,0,0.8)
boxShadow: 0 0 10px rgba(255,255,255,0.3), 0 2px 6px rgba(0,0,0,0.5)
```

**What this means**: Replace the dark glass gradient with an owner-color-based gradient (matching what `getTroopBadgeDescriptor()` in hexRendering.ts already computes). The badge becomes a bright, colored circle that matches the hex's owner color. White border provides contrast against any background. Text shadow ensures the troop count number is readable against the colored background.

**Implementation detail**: `TroopBadge.tsx` currently receives `ownerColor` as a prop (default `#4f8cff`). Convert it to HSL using a utility function (check if one already exists in the codebase, or create a small `hexToHsl()` helper in `utils/`). Apply the gradient using the HSL hue and saturation at fixed lightness values (60% → 40%) for consistent contrast.

**Also update `getTroopBadgeDescriptor()` in hexRendering.ts** to match—this function already computes the owner-color gradient. Ensure both code paths produce the same visual result. The descriptor's computed `badgeBg` gradient should be the source of truth.

**Edge case — zero troops**: When troops === 0, keep the badge more subdued. Use the owner color at lower saturation (30%) and lightness (35% → 25%). The text should show "0" in `rgba(255,255,255,0.6)`.

**Edge case — forest blind**: When `isForestBlind` is true, badge shows "?" instead of a number. Keep the background as a neutral dark gradient since the owner color is unknown: `linear-gradient(135deg, rgba(71,85,105,0.9), rgba(51,65,85,0.9))` (Slate-600 → Slate-500). This is intentionally dark/mysterious.

---

## Phase 2: Icon Sizing, Terrain, and Interaction Indicators

**Goal**: Ensure all interactive and informational elements are appropriately sized and visible for outdoor mobile use.

**Dependencies**: Phase 2 can start immediately—it has no dependency on Phase 1. All steps within Phase 2 are independent and parallelizable.

### Step 2.1 — Fix Selected Hex Overlay

**Issue**: #5 — Selected hex overlay fill at `rgba(34,211,238,0.12)` is barely visible. Players tap a hex and can't tell it's selected.

**Task type**: Coder

**File**: `components/map/HexTile.tsx` (line ~252, the selected hex overlay polygon)

**Current values**:
```
fill: rgba(34, 211, 238, 0.12)  — Cyan at 12% opacity
stroke: #22d3ee
strokeWidth: 4
strokeOpacity: 0.95
```

**Change to**:
```
fill: rgba(34, 211, 238, 0.25)  — Cyan at 25% opacity
stroke: #22d3ee  — keep
strokeWidth: 5  — bump from 4 to 5
strokeOpacity: 1.0  — bump from 0.95 to 1.0
```

**Rationale**: Doubling the fill opacity from 0.12 to 0.25 makes the cyan tint visible in sunlight without obscuring the hex content beneath. The stroke bump is minor but helps complete the "this is selected" signal.

**Note**: The border style system in `getHexBorderStyle()` also has a selected branch that sets `Math.max(borderWeight, 6)` and uses Red-500 for hostile / Sky-400 for friendly. This overlay in HexTile.tsx is in addition to that border. Both should be consistent—the overlay fill reinforces the border.

---

### Step 2.2 — Fix Current Location Hex Indicator

**Issue**: #6 — Current location hex uses `strokeDasharray="10 6"` which creates gaps in the "you are here" indicator. A dashed line is harder to see than solid, and the gaps can coincide with hex vertices creating visual ambiguity.

**Task type**: Coder

**File**: `components/map/HexTile.tsx` (lines 260-272, the current player hex overlay polygon)

**Current values**:
```
fill: rgba(46, 204, 113, 0.16)
stroke: #2ecc71 (Green-500)
strokeWidth: 5
strokeOpacity: 0.95
strokeDasharray: "10 6"
```

**Change to**:
```
fill: rgba(46, 204, 113, 0.2)  — bump from 0.16 to 0.2
stroke: #2ecc71  — keep
strokeWidth: 6  — bump from 5 to 6
strokeOpacity: 1.0  — bump from 0.95 to 1.0
strokeDasharray: remove (solid line)
```

**Rationale**: "You are here" is the single most important indicator in the game. It should be unmistakable. A solid green border is more readable than a dashed one, especially at a glance while moving. The CSS animation `current-hex-pulse` (which pulses from 8px to 12px stroke width) already provides the "attention" signal—the dashes add nothing and reduce clarity.

**Interaction with CSS**: The `.hex-polygon.is-current-player-hex` CSS rule sets `stroke-width: 8px` and the `current-hex-pulse` animation pulses to 12px. This CSS class takes precedence over the SVG overlay's 6px width for the main polygon. The overlay polygon (this fix) is a separate SVG element layered on top. Verify that both the main polygon border (via CSS) and this overlay border don't create a "double border" visual artifact. If they do, the overlay should be fill-only (remove its stroke entirely and let the CSS-animated polygon border handle the border).

---

### Step 2.3 — Increase Building/Fort/HQ Icon Sizes

**Issue**: #7 — Fort icon: 18px, Building/HQ: 28px, scaled by factor 0.5–1.0 based on hex radius. At minimum scale, Fort is 9px and Building/HQ is 14px—illegible on mobile.

**Task type**: Coder

**File**: `components/map/HexTile.tsx` (lines 335-360, the foreignObject elements for building icons)

**Current values**:
```
Fort: 18px × 18px container, icon size 'sm'
Building/HQ: 28px × 28px container
Scale factor: Math.min(1.0, Math.max(0.5, radius / 35))
```

**Change to**:
```
Fort: 24px × 24px container, icon size 'md'  — 33% larger
Building/HQ: 34px × 34px container  — 21% larger
Scale factor minimum: Math.min(1.0, Math.max(0.65, radius / 35))  — raise floor from 0.5 to 0.65
```

**Resulting minimum sizes**:
- Fort: 24 × 0.65 = 15.6px (was 9px) — 73% improvement
- Building/HQ: 34 × 0.65 = 22.1px (was 14px) — 58% improvement

**Also update the foreignObject offset calculations** which are half the container size (used for centering):
```
Fort offset: 12 * scale (was 9 * scale)
Building/HQ offset: 17 * scale (was 14 * scale)
```

**Rationale**: Minimum icon sizes should be at least 16px for readability on mobile (Apple HIG recommends 17px minimum for text). Raising the scale floor ensures icons remain visible at all zoom levels.

**Edge case**: At maximum zoom-out (smallest hexes), icons may start to overlap hex boundaries. This is acceptable—icons should bleed slightly rather than become invisible. The foreignObject has `overflow: visible` already.

---

### Step 2.4 — Show Terrain Icons on Unowned Hexes

**Issue**: #8 — `shouldRenderTerrainIcon()` in hexRendering.ts explicitly returns `false` for unowned hexes (lines 316-325). Players cannot see terrain types before claiming, making tactical decisions uninformed.

**Task type**: Coder

**File**: `components/game/map/hexRendering.ts` — `shouldRenderTerrainIcon()` function (lines 316-325)

**Current logic** (lines 316-325):
```typescript
// Premium cleanup: Don't show terrain icons on neutral/unowned hexes to reduce clutter
if (!cell.ownerId && terrainType !== 'Building') {
  return false;
}
if (!cell.ownerId && terrainType === 'Building' && !cell.isMasterTile && !cell.isFort) {
  return false;
}
```

**Change to**: Remove these two blocks entirely. Terrain icons should render on all hexes where terrain is non-None, regardless of ownership.

**However**, to address the original "clutter" concern that motivated this code, add a **reduced opacity** for terrain icons on unowned hexes:

**File**: `components/map/HexTile.tsx` — the terrain icon foreignObject

Add an opacity modifier: if the hex is unowned (`!cell.ownerId`), set the terrain icon's opacity to `0.6`. If owned, opacity stays at `1.0`. This gives unowned terrain a "preview" feel while keeping owned terrain icons crisp.

**Implementation**: The terrain icon foreignObject already has class `hex-fo-terrain hex-terrain-icon`. Add a conditional class `hex-terrain-unowned` when the hex has no owner. Style in CSS:
```css
.hex-terrain-icon.hex-terrain-unowned { opacity: 0.6; }
```

**Fog of War interaction**: If `isFogHidden` is true, terrain icons should still NOT render (fog hides everything). The existing `isInactive` and `isFogHidden` checks at the top of `shouldRenderTerrainIcon()` already handle this—they return false before reaching the ownership check. No change needed there.

**Edge case — zoom level clutter**: At zoomed-out views with hundreds of hexes visible, terrain icons on all hexes could be visually noisy. The existing `shouldShowTerrainIcons` and `shouldShowBuildingIcons` flags (from zoom-level thresholds) already gate icon rendering. These should continue to apply. Only the ownership gate is being removed.

---

### Step 2.5 — Fix Contested Border Animation

**Issue**: #9 — The `border-pulse` animation fades contested hex borders from `strokeWidth: 4, opacity: 1` down to `strokeWidth: 2.5, opacity: 0.55`. At minimum, the border nearly disappears.

**Task type**: Coder

**File**: `styles/index.css` — `@keyframes border-pulse` (lines ~4878-4894)

**Current values**:
```css
@keyframes border-pulse {
  0%, 100% { stroke-opacity: 1; stroke-width: 4; }
  50% { stroke-opacity: 0.55; stroke-width: 2.5; }
}
```

**Change to**:
```css
@keyframes border-pulse {
  0%, 100% { stroke-opacity: 1; stroke-width: 5; }
  50% { stroke-opacity: 0.75; stroke-width: 3.5; }
}
```

**Rationale**: The animation's minimum values now stay above the 3px stroke / 0.7 opacity thresholds. The pulse still "breathes" (5 → 3.5 is a 30% reduction), communicating activity, but never drops to an unreadable state. Starting at 5 instead of 4 also makes the contested state more prominent overall.

**Also check**: The `.hex-polygon.is-contested` selector that applies this animation. Ensure it also sets a base `stroke-width: 5` to match the animation's starting value, preventing a FOUC (flash of unstyled content) before the animation kicks in.

---

## Phase 3: Polish and Verification

**Goal**: Improve terrain differentiation and verify all changes work together.

**Dependencies**: Phase 3 should start after Phase 1 and 2 are complete, since it includes integration testing.

### Step 3.1 — Improve Terrain Fill Color Differentiation

**Issue**: #10 — Terrain fill colors are all dark tones at 0.35-0.55 opacity. In bright conditions, they blend together.

**Task type**: Designer (approve new palette) → Coder (implement)

**File**: `utils/terrainColors.ts` — `terrainFillColors` and `terrainFillOpacity` objects

**Current values**:
```
None:     #3b4252 @ 0.40    Water:    #1e3a5f @ 0.55
Building: #4a4e57 @ 0.40    Road:     #5c5040 @ 0.40
Path:     #4a4640 @ 0.35    Forest:   #2d4a35 @ 0.45
Park:     #345a3c @ 0.42    Hills:    #5a4a30 @ 0.42
Steep:    #4a3a28 @ 0.45
```

**Proposed new values** (increase saturation and opacity, widen hue separation):
```
None:     #3b4252 @ 0.45    — unchanged hue, slight opacity bump
Water:    #1a4a7a @ 0.60    — more saturated blue, higher opacity
Building: #5a5560 @ 0.45    — slightly lighter, warm gray
Road:     #6b5a3a @ 0.50    — more saturated khaki, bumped opacity
Path:     #5a5040 @ 0.45    — bumped opacity (was too invisible at 0.35)
Forest:   #1a5c2a @ 0.55    — more saturated green, higher opacity
Park:     #2a6a35 @ 0.50    — brighter green, differentiate from Forest
Hills:    #7a5a20 @ 0.50    — more saturated amber, bumped opacity
Steep:    #6a3a18 @ 0.55    — richer brown, bumped opacity
```

**Design principle**: Each terrain type should be distinguishable at arm's length on a phone in sunlight. The key pairs that must be clearly different:
- Forest vs Park (both green—differentiate by saturation)
- Hills vs Steep (both brown—differentiate by warmth)
- Road vs Path (both khaki—differentiate by opacity)
- Water should be obviously blue and different from all others

**Note**: These are starting values. Final values should be tuned with real device testing outdoors. Consider providing 2 options (subtle and bold) for the designer to choose from.

---

### Step 3.2 — Add Outdoor Mode Toggle to Display Settings

**Task type**: Designer (design) → Coder (implement)

**Files**:
- Modify: `components/game/PlayerDisplaySettings.tsx` — add new toggle section
- Modify: Zustand game store or create new `displayPrefsStore.ts` — persist the setting
- Modify: `components/game/map/hexRendering.ts` — consume the preference
- Modify: `components/map/HexTile.tsx` — consume the preference
- Modify: `utils/terrainColors.ts` — export a second "bold" palette

**What**: Add an "Outdoor Mode" toggle to Display Settings that:
1. Increases all terrain fill opacities by +0.15 (capped at 0.8)
2. Increases all border weights by +1
3. Increases all border opacities by +0.15 (capped at 1.0)
4. Increases badge font sizes by 2px
5. Adds a white 1px outline (text-stroke or paint-order stroke) to all badge text

**This is optional/nice-to-have**. The base values from Phases 1-2 should already be outdoor-viable. This toggle is for extreme brightness conditions.

**Implementation pattern**: Use a CSS class `.outdoor-mode` on the game layout root. Override specific CSS custom properties:
```css
.game-layout.outdoor-mode {
  --hex-border-weight-boost: 1;
  --hex-opacity-boost: 0.15;
  --badge-font-boost: 2px;
}
```

Consume these in the rendering functions. This keeps the toggle lightweight—no re-rendering needed, just CSS variable changes.

---

### Step 3.3 — Visual Verification Checklist

**Task type**: Playtester / QA

**Not a code task—this is a testing protocol**. After all changes are deployed, verify:

| # | Check | Method | Pass Criteria |
|---|-------|--------|---------------|
| 1 | Neutral hex grid visible in sunlight | Device outdoors, max brightness | Can count hexes at arm's length |
| 2 | Owned vs neutral distinction | Side-by-side hexes, bright conditions | Instantly distinguishable |
| 3 | Supply disconnected hexes obvious | Create disconnection in-game | Red dashed border visible without squinting |
| 4 | Troop badge numbers readable | Various troop counts (1, 10, 100) | Numbers readable at arm's length |
| 5 | Selected hex clearly indicated | Tap hex in sunlight | Cyan overlay visible |
| 6 | Current location unmistakable | Walk to a hex | Green border visible while walking |
| 7 | Fort/HQ/Building icons recognizable | Various zoom levels | Icons distinguishable at all zoom levels |
| 8 | Terrain types distinguishable | Area with mixed terrain | Can tell Forest from Park, Hills from Steep |
| 9 | Legend panel usable | Open legend, glance at it | Can learn one element in < 3 seconds |
| 10 | Contested border visible | Create contested zone | Pulsing border visible in sunlight |
| 11 | No visual regressions in dark/indoor | Play indoors, normal brightness | Elements not oversaturated or garish |
| 12 | Terrain icons on unowned hexes | Navigate to neutral area | Can see terrain types before claiming |

---

## Execution Order & Parallelization

```
Phase 1 (can all run in parallel):
  ├── 1.1 Map Legend Component          [Designer → Coder]  ~4-6 hours
  ├── 1.2 Supply Disconnected Overlay   [Coder]             ~30 min
  ├── 1.3 Neutral Hex Borders           [Coder]             ~30 min
  └── 1.4 TroopBadge Readability        [Designer → Coder]  ~2-3 hours

Phase 2 (can all run in parallel, no dependency on Phase 1):
  ├── 2.1 Selected Hex Overlay          [Coder]             ~15 min
  ├── 2.2 Current Location Hex          [Coder]             ~30 min
  ├── 2.3 Building/Fort/HQ Icon Sizes   [Coder]             ~30 min
  ├── 2.4 Terrain Icons on Unowned      [Coder]             ~45 min
  └── 2.5 Contested Border Animation    [Coder]             ~15 min

Phase 3 (after Phase 1 + 2 complete):
  ├── 3.1 Terrain Fill Colors           [Designer → Coder]  ~1-2 hours
  ├── 3.2 Outdoor Mode Toggle           [Designer → Coder]  ~2-3 hours
  └── 3.3 Visual Verification           [Playtester]        ~2 hours
```

**Critical path**: Phase 1 + Phase 3 verification = ~8 hours elapsed (with parallelization).  
**Total effort**: ~15-20 hours across all tasks.

---

## Edge Cases & Risks

1. **Color clash between supply-disconnected (red) and raid markers (red)**: Both use `#ef4444`. Mitigation: supply uses dashed stroke, raids use solid fill. Legend disambiguates. If playtesting reveals confusion, switch supply-disconnected to `#f97316` (Orange-500).

2. **Double-border artifact on current hex**: The CSS `.is-current-player-hex` sets stroke-width 8px on the main polygon, and the overlay polygon in HexTile.tsx adds another border. If these visually overlap badly, make the overlay fill-only. Test in browser first.

3. **Performance impact of terrain icons on all unowned hexes**: With 100-225 hexes, this could add ~100 more foreignObject elements. These are lightweight (just an icon div), and the existing zoom-level gating prevents rendering at zoomed-out views. Should be negligible, but monitor.

4. **Badge color accessibility**: Owner-color-based badge backgrounds need sufficient contrast against white text. Colors with lightness > 70% (yellows, cyans) may need a dark text variant. Add a contrast check: if computed luminance of badge background > 0.6, use dark text (`#1e293b`).

5. **Legend panel occluding map on small screens**: At 375px width, the legend panel is full-width. It overlays the map, which is fine for a quick glance, but should auto-close or be easily dismissable. The 10-second auto-close + tap-outside-to-close mitigate this.

6. **Existing layered map refactor plan**: The `plans/layered-map-refactor.md` describes a major architectural change (React components in SVG layers, layer-based Zustand stores). This UX plan modifies the same files (HexTile.tsx, hexRendering.ts). **If the refactor happens first**, the file paths and code structure will change, but the *values* being modified (colors, opacities, sizes) will carry over to the new architecture. These are visual constants, not structural code. Changes should be straightforward to port.

7. **Internationalization**: The legend text labels should use the existing i18n system (`t()` function from react-i18next). Add translation keys like `legend.yourTerritory`, `legend.unclaimed`, etc.

---

## Open Questions

1. **Supply disconnected: red or orange?** Red matches `--danger` but overlaps with raid markers. Orange is unique but doesn't match the design token system. Needs playtesting. **Recommendation**: Start with red, switch to orange only if confusion is observed.

2. **Legend: always-available or context-sensitive?** Should the legend show ALL possible states, or only states currently visible on screen? Always-available is simpler to implement and more useful for learning. Context-sensitive is less cluttered but requires scanning visible hexes. **Recommendation**: Always-available with conditional sections based on game dynamics (not visible hexes).

3. **Terrain icon opacity on unowned hexes**: 0.6 was chosen as a "preview" feel. Should this be configurable, or is 0.6 the right value? **Recommendation**: Hardcode 0.6, adjust in Phase 3 based on playtesting.

4. **Should the "Outdoor Mode" toggle affect the satellite map base layer?** Could increase Leaflet tile layer brightness/contrast. This is more complex (CSS filter on `.leaflet-tile-pane`). **Recommendation**: Defer to a separate investigation—CSS filters on map tiles can have performance implications.
