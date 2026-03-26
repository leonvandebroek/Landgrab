# Session Log: Beacon Scout Gate (2026-03-23T13:40:00Z)

**Title:** Fix beacon and shareIntel abilities to be Scout-only in PlayerHUD  
**Agent:** Vermeer  
**Status:** Completed  

## Problem

Non-Scout players were seeing the Beacon ability button in PlayerHUD. The component had:
1. Scout ability block using `if (player?.role === 'Scout')` without `rolesEnabled` guard
2. A separate non-Scout beacon block that unconditionally pushed beacon toggle for every non-Scout player

## Solution

Gated both `beacon` and `shareIntel` abilities exclusively inside:
```tsx
if (rolesEnabled && player?.role === 'Scout') {
  if (showBeacon) {
    // beacon and shareIntel abilities only
  }
}
```

Removed the erroneous non-Scout beacon block entirely.

## Results

- Beacon/shareIntel now Scout-exclusive when roles enabled
- Consistent with existing Commander/Engineer role-gate pattern
- Build validation: ✅ Passed
- File: `frontend/landgrab-ui/src/components/game/PlayerHUD.tsx`

## Decision Documented

→ `.squad/decisions/inbox/vermeer-beacon-scout-gate.md`
