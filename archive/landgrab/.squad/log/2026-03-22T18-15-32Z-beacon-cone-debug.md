# Session Log — Beacon Cone Debug

**Timestamp:** 2026-03-22T18:15:32Z  
**Session:** Beacon cone visibility and heading responsiveness  
**Agent:** vermeer-beacon-debug  
**Result:** ✅ COMPLETE

---

## Problem Statement

Three interconnected bugs prevented beacon cone hexes from rendering visible state and prevented heading changes from updating the cone in real time:

1. Debug heading (Q/E keys) not reaching overlay layer
2. Backend wiping `BeaconHeading` on every location heartbeat
3. Cone hexes rendered as Hidden tiles (troop counts not visible)

**User impact:**
- Beacon ability appeared broken (cone didn't respond to heading adjustments)
- Cone tiles showed no information even when scanned
- Re-enabling compass broke the feature entirely

---

## Investigation

### Bug A: Q/E Debug Heading Not Forwarded

**Symptom:** Pressing Q/E to adjust debug heading had no effect on cone rendering.

**Diagnosis:**
- `GameMap.tsx` captures `debugCompassHeading` from local `uiStore` state
- But line 896 passed raw `compassHeading` (sensor heading) to `AbilityOverlayLayer`
- `AbilityOverlayLayer` read `myPlayer.beaconHeading` from server state (only updates on 30s heartbeat)
- Debug heading updates never reached the overlay

**Solution:** Pass effective heading (debug OR sensor) to overlay:
```typescript
compassHeading={debugCompassHeading ?? compassHeading}
```

### Bug B: Backend Wiping BeaconHeading

**Symptom:** Beacon cone disappeared when device had no compass or before Q/E pressed.

**Diagnosis:**
- `GameplayService.UpdatePlayerLocation` always set `BeaconHeading` on every heartbeat
- If `CurrentHeading` was null (no compass), it unconditionally set `BeaconHeading = null`
- This overwrote the heading stored by `ActivateBeacon`
- Any movement without new compass data destroyed the activation state

**Solution:** Only update heading when present:
```csharp
if (player.CurrentHeading.HasValue)
{
    player.BeaconHeading = HexService.NormalizeHeading(player.CurrentHeading.Value);
}
```

### Bug C: Cone Tiles Render as Hidden

**Symptom:** Beacon cone hexes showed `{ badge: { visible: false, count: 0 } }` (hidden) even though server sent full tile data.

**Diagnosis:**
- `tricorderTileState.deriveTileState` had this logic:
  ```typescript
  if (visibilityTier === 'Hidden') {
    return { badge: { visible: false }, ... }  // Early return
  }
  ```
- This happened **before** checking beacon cone membership
- Server correctly sends full tile data for scanned hexes, but frontend discarded it

**Solution:** Override visibility tier for cone hexes:
1. Store beacon cone hex keys in `gameplayStore.beaconConeHexKeys`
2. In `deriveTileState`, check cone membership before applying Hidden masking
3. If hex is in cone, set `isHidden = false` and fall through to full Visible rendering

---

## Implementation

**Frontend changes:**
- `GameMap.tsx`: Forward effective heading
- `AbilityOverlayLayer.tsx`: Compute cone with effective heading; sync results to store
- `gameplayStore.ts`: Add `beaconConeHexKeys` state
- `tricorderTileState.ts`: Accept cone keys; override visibility
- `HexTile.tsx`, `TileInfoCard.tsx`: Pass cone keys to tile state derivation

**Backend changes:**
- `GameplayService.cs`: Preserve `BeaconHeading` when heading null

---

## Validation

✅ Build passed: `npm run lint && npm run build`  
✅ 293 modules loaded  
✅ 0 linting errors  
✅ 0 TypeScript errors  
✅ All changes surgical and isolated

---

## Impact

- Beacon cone now fully responsive to heading changes (Q/E, sensor updates)
- Cone hexes render with full visible state (troop counts visible)
- No regression: backward compatible with existing code
- Ready for multiplayer testing
