# Orchestration Log — De Ruyter (Beacon Backend)

**Date:** 2026-03-22T16:13:15Z  
**Agent:** de-ruyter-beacon  
**Mode:** background (gpt-5.3-codex)  
**Status:** ✅ Completed

## Summary

Implemented backend beacon intel sharing (Share Beacon feature), reducing beacon reveal range from 4 → 3 hexes and extracting shared sector computation to support both fog-of-war visibility and explicit alliance intel persistence.

## Changes

### VisibilityService.cs

- Reduced `BeaconRange` constant from 4 to 3
- **Extracted:** New public method `ComputeBeaconSectorKeys(GameState state, PlayerDto player)` that:
  - Normalizes the player's heading to cardinal directions (N, NE, SE, S, SW, NW)
  - Computes the sector wedge (120° cone) from that heading
  - Gathers all hexes within 3-hex range that fall in the sector
  - Filters to map bounds
  - Returns string set of grid keys `"q,r"`
- **Refactored:** `ComputeVisibleHexKeys` now calls `ComputeBeaconSectorKeys` internally to avoid duplication

### AbilityService.cs

- Added `public async Task<int> ShareBeaconIntel(string roomCode, string userId)`
  - Retrieves the scout player and current `GameState`
  - Calls `visibilityService.ComputeBeaconSectorKeys()` to get enemy-owned hexes in the beacon sector
  - For each alliance member, appends captured hexes to their `PlayerVisibilityMemory.RememberedHexes`
  - Returns the count of unique hexes persisted
  - No broadcast; persists silently into player memory

### GameService.cs

- Added facade method `ShareBeaconIntel(string roomCode, string userId)` → delegates to `AbilityService`

### GameHub.Gameplay.cs

- Added public hub method `[Authorize] public async Task ShareBeaconIntel()`
  - Calls `GameService.ShareBeaconIntel(roomCode, userId)`
  - Broadcasts `StateUpdated` to refresh all clients

## Testing

- **dotnet build** ✅ No errors
- **dotnet test** ✅ 285 passed, 1 skipped

## Decision Link

See `.squad/decisions/inbox/de-ruyter-beacon-share.md` for design rationale (extraction of sector computation to prevent drift between visibility rules and sharing rules).
