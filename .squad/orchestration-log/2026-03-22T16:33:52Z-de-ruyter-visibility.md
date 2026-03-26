# De Ruyter — Visibility Service: Scout-Gated Intel Model (2026-03-22)

## Agent: de-ruyter-visibility
**Mode:** background (gpt-5.3-codex)  
**Focus:** Backend VisibilityService implementation for Eyes-of-the-Scout intel model

## Changes Made

### `backend/Landgrab.Api/Services/VisibilityService.cs`

1. **Personal-Only Beacon Sector Visibility**
   - `ComputeVisibleHexKeys`: Changed beacon sector contribution from union of all allied beacons to only the viewing player's own beacon sector when `IsBeacon == true`.
   - Effect: Teammate beacons no longer feed visibility to the viewer unless the viewer is also a beacon owner.

2. **Always-Fresh Alliance-Border Hostile Visibility**
   - `ComputeVisibleHexKeys`: Added new border-intel source that scans all alliance-owned tiles and marks enemy-owned neighbors as visible.
   - Effect: Enemy hexes adjacent to any alliance territory are always fresh/current for all alliance members (no staleness, no sharing gate).

3. **Auto-Share Filter Excludes Beacon-Derived Hostiles**
   - `UpdateMemory`: Added `beaconSectorKeys` computation for the current viewer using `ComputeBeaconSectorKeys`.
   - Auto-share gate: `hostilesSharedToAlliance = visibleHostileKeys - beaconSectorKeys`.
   - Effect: Beacon-sector intel is never auto-broadcast; only explicit `ShareBeaconIntel` action moves it to ally memory.

4. **Position Edge Case Guard**
   - Proximity-hostile contribution skipped when player current hex is null or `(0,0)`.

### Test Updates (`backend/Landgrab.Tests/Services/VisibilityServiceTests.cs`)

- Beacon sector visibility applies only to beacon-owner viewer (assertion includes model-change comment).
- Allied beacon no longer contributes to teammate visible set.
- Added alliance-border hostile visibility coverage.
- Added memory-sharing test confirming beacon-derived hostile intel is not auto-shared.

## Validation

- `dotnet build` ✅ (Debug)
- `dotnet test` ✅ (289 total, 288 passed, 1 skipped)

## SignalR Impact

None — visibility layer only; no message format changes.
