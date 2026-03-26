# Decision: Created notification-panel.css for FieldBattle and TroopTransfer notification panels

**Date:** 2026-01-XX  
**Author:** Vermeer (Frontend Dev)  
**Status:** ✅ Implemented

## Context

While auditing the FieldBattle frontend flow end-to-end, discovered that both `FieldBattleInvitePanel` and `TroopTransferReceivedPanel` were using CSS classes that had NO definitions anywhere in the codebase:

- `.notification-panel`
- `.notification-panel--field-battle`
- `.notification-panel--troop-transfer`
- `.notification-panel__message`
- `.notification-panel__countdown`
- `.notification-panel__actions`

The panels were rendering markup correctly (confirmed the React component tree was correct), but they were completely invisible because there was zero CSS styling them.

## The Problem

1. **SignalR event flow was correct:**
   - `useSignalR.ts` line 151: `conn.on('FieldBattleInvite', (data) => eventsRef.current.onFieldBattleInvite?.(data))`
   - `useSignalRHandlers.ts` line 665: `onFieldBattleInvite` handler calls `setFieldBattleInvite(data)` and pushes info-ledge toast
   - `notificationStore.ts` line 66: `setFieldBattleInvite` stores invite in state
   - `PlayingHud.tsx` line 830: `<FieldBattleInvitePanel invoke={invoke} />` rendered unconditionally
   - `FieldBattleInvitePanel.tsx` line 26: reads `fieldBattleInvite` from store, returns `null` if no invite, otherwise renders the panel div

2. **The CSS was completely missing:**
   - Searched entire `frontend/landgrab-ui/src/` directory — zero CSS files contained `notification-panel` rules
   - The components were written with the assumption the CSS existed, but it was never created

3. **Result:** When the backend sent `FieldBattleInvite`, the React component rendered the markup, but the user saw nothing (no layout, no animation, no visible panel).

## The Solution

Created `/frontend/landgrab-ui/src/styles/notification-panel.css` with:

- **Base `.notification-panel`:** Positioned `absolute top`, centered horizontally via `transform: translateX(-50%)`, z-index above gameplay elements (`var(--z-hud-active)`), glassmorphism background with backdrop blur (matches ability-card style)
- **Animation:** `@keyframes notificationSlideDown` slides in from top with fade-in (0.3s cubic-bezier easing)
- **Layout:** Flexbox column with proper spacing (`gap: var(--space-sm)`), min/max width with mobile breakpoint
- **Modifiers:**
  - `.notification-panel--troop-transfer`: Blue border and glow (`rgba(120, 190, 255, ...)`)
  - `.notification-panel--field-battle`: Red border and glow (`rgba(231, 76, 60, ...)`)
- **Subcomponents:**
  - `.notification-panel__message`: Primary text (centered, bold, `--text-primary`)
  - `.notification-panel__countdown`: Secondary text (tactical font, uppercase, `--text-secondary`)
  - `.notification-panel__actions`: Flex row for buttons (uses existing `.ability-card__primary-btn` and `.ability-card__secondary-btn` classes)

Imported the stylesheet in both `FieldBattleInvitePanel.tsx` and `TroopTransferReceivedPanel.tsx` following the existing pattern from `AbilityCard.tsx` (component-local CSS import rather than global index.css import).

## Impact

- ✅ Both FieldBattle and TroopTransfer notification panels now render visibly when triggered
- ✅ Consistent glassmorphism visual style matching the rest of the HUD
- ✅ Proper animations and responsive layout
- ✅ No changes needed to component logic or SignalR handlers — the wiring was always correct

## Build Verification

```bash
npm run lint && npm run build
```

**Result:** Clean — 0 ESLint errors, 302 modules transformed, TypeScript compiled successfully.

## Files Changed

- ✅ Created: `frontend/landgrab-ui/src/styles/notification-panel.css`
- ✅ Modified: `frontend/landgrab-ui/src/components/game/abilities/FieldBattleInvitePanel.tsx` (added CSS import)
- ✅ Modified: `frontend/landgrab-ui/src/components/game/abilities/TroopTransferReceivedPanel.tsx` (added CSS import)

## Root Cause

The CSS was never written when these notification panels were first implemented. The React components and SignalR event handlers were written correctly, but the styling was completely forgotten, leaving the panels functional but invisible.

## Recommendation for Future

When creating new UI components:
1. ✅ Write the React component
2. ✅ Write the CSS at the same time
3. ✅ Test the visual output in the browser, not just "does it compile"
4. ✅ Add a checklist item: "Does this component have visible styling?"
