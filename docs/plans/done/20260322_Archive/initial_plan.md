# Plan: Real-Time Concurrent Alliances Game Mode

## Summary
Replace the turn-based Alliances game mode with concurrent real-time gameplay driven by physical player presence (GPS geofencing). The Global FFA mode is left unchanged. Key pillars: configurable tile size (50m–1km), physical presence required for all interactions, server-tracked carried troops, troop regeneration every 30s, master tile (invincible lobby tile), configurable room rules (claim mode, win condition), and host-assigned starting tiles.

---

## Phase 1 — Core Data Models

**Goal:** Update backend models and frontend types to capture new game state.

### Steps

1. **`GameState.cs`** — update `GamePhase` enum: remove `Reinforce`, `Roll`, `Claim`; add `Playing`. Add new room-config fields:
   - `TileSizeMeters` (int, default 100, 50–1000)
   - `ClaimMode` (enum: `PresenceOnly | PresenceWithTroop | AdjacencyRequired`)
   - `WinConditionType` (enum: `TerritoryPercent | Elimination | TimedGame`)
   - `WinConditionValue` (int — e.g. 60 for %, minutes for timed)
   - `GameDurationMinutes` (int?, for TimedGame mode)
   - `MasterTileQ` / `MasterTileR` (int?, nullable)
   - `GameStartedAt` (DateTime?, for timed win condition)
   - Remove: `CurrentPlayerIndex`, `MovesRemaining`, `LastDiceRoll`, `TurnNumber`

2. **`PlayerDto` (in `GameState.cs`)** — add `CarriedTroops` (int). Remove `TroopsToPlace`.

3. **`HexCell.cs`** — add `IsMasterTile` (bool).

4. **`types/game.ts` (frontend)** — mirror all model changes:
   - New `GamePhase` union: `'Lobby' | 'Playing' | 'GameOver'`
   - Add `ClaimMode`, `WinConditionType` enums/string literals
   - Add new `GameState` fields; remove old ones
   - Add `carriedTroops` to `Player`; remove `troopsToPlace`
   - Add `isMasterTile` to `HexCell`; remove `movesRemaining`, `lastDiceRoll`

---

## Phase 2 — HexService Geography Math

**Goal:** Enable lat/lng ↔ axial hex conversion and hex bounds check, parameterised by room-specific tile size and map centre. Parallel with Phase 1.

5. **`HexService.cs`** — add three methods:
   - `HexToLatLng(q, r, mapLat, mapLng, tileSizeMeters)` → `(double lat, double lng)` for hex centre  
     Formula: x_m = tileSizeMeters * 1.5 * q; y_m = tileSizeMeters * sqrt(3) * (r + q/2.0); lat = mapLat + y_m/111320; lng = mapLng + x_m/(111320 * cos(mapLat * π/180))
   - `LatLngToHexForRoom(lat, lng, mapLat, mapLng, tileSizeMeters)` → `(int q, int r)` — inverse of above using same matrix as GlobalMapService but with variable scale
   - `IsPlayerInHex(playerLat, playerLng, q, r, mapLat, mapLng, tileSizeMeters)` → bool — converts player position using `LatLngToHexForRoom` and checks if result equals (q,r)

---

## Phase 3 — Troop Regeneration Background Service

**Goal:** Add +1 troop to every owned hex every 30 seconds, broadcast `StateUpdated` to all active rooms. Parallel with Phase 1.

6. **New file `Services/TroopRegenerationService.cs`** — `BackgroundService` with a `PeriodicTimer` (30s).  
   - Injected with `IServiceScopeFactory` (to access the singleton `GameService`)  
   - Iterates all rooms in `Playing` phase; for each: calls `GameService.AddReinforcementsToAllHexes(roomCode)` then broadcasts `StateUpdated`
   - Master tile is included (it gets troops but can't be conquered)

7. **`GameService.cs`** — add `AddReinforcementsToAllHexes(roomCode)`: loops grid, increments `Troops` on any hex where `OwnerId != null`

8. **`Program.cs`** — register `TroopRegenerationService` as `builder.Services.AddHostedService<TroopRegenerationService>()`

---

## Phase 4 — Room Configuration & Lobby Flow

**Goal:** Let host configure tile size, claim mode, win condition; set master tile via GPS; distribute starting tiles.

9. **`GameHub.cs`** — new lobby-phase hub methods (validated: only host, only in Lobby phase):
   - `SetTileSize(int meters)` — clamp to 50–1000, update `GameState.TileSizeMeters`, broadcast `StateUpdated`
   - `SetClaimMode(string mode)` — parse to enum, update, broadcast
   - `SetWinCondition(string type, int value)` — parse, update, broadcast
   - `SetMasterTile(double lat, double lng)` — convert using `LatLngToHexForRoom`, set `MasterTileQ/R` on state, set `IsMasterTile = true` on that hex, broadcast
   - `AssignStartingTile(int q, int r, string targetPlayerId)` — host only; sets hex owner to `targetPlayer` with 3 initial troops, broadcast. Validates target player is in room. Validates hex is not already owned.

10. **`GameService.cs`** — update `StartGame()`: no longer requires placement phase; transitions directly to `Playing` phase; validates master tile is set; sets `GameStartedAt`.

---

## Phase 5 — Concurrent Gameplay Actions

**Goal:** Replace turn-based hub methods with presence-validated concurrent actions. Depends on Phases 1, 2.

11. **`GameHub.cs`** — remove old methods: `PlaceReinforcement`, `RollDice`, `ClaimHex`, `AttackHex`, `EndTurn`. Add new ones (all validated: `Playing` phase, player connected):
    - `PickUpTroops(int q, int r, int count, double playerLat, double playerLng)` — validates physical presence, validates hex is owned by caller, validates `Troops >= count`, removes troops from hex, adds to `PlayerDto.CarriedTroops`
    - `PlaceTroops(int q, int r, double playerLat, double playerLng)` — validates physical presence; logic branches:
      - Own hex → deposit all `CarriedTroops` onto hex
      - Master tile → error (cannot place on master tile to conquer; master tile is never conquerable)
      - Enemy/neutral hex → apply `ClaimMode` + troop rules:
        - Neutral: per `ClaimMode` (`PresenceOnly` auto-claims, `PresenceWithTroop` deducts 1 carried, `AdjacencyRequired` also checks adjacency to own territory)
        - Enemy: requires `CarriedTroops > hex.Troops`; if true, sets ownership and transfers troops; if not, error
      - In all cases: check win condition after state mutation

12. **`GameService.cs`** — implement business logic for above actions. `CheckWinCondition` updated to handle all three win types:
    - `TerritoryPercent`: same as existing 60% logic, uses configurable threshold
    - `Elimination`: game ends when only 1 player/alliance has territory
    - `TimedGame`: check on every state change if `DateTime.UtcNow >= GameStartedAt + GameDurationMinutes`; winner is whoever has most territory at that point

---

## Phase 6 — Frontend: Room Config & Lobby Map

**Goal:** Expose new room settings in lobby UI; show map in lobby for master tile + starting tile assignment. Depends on Phase 1.

13. **Lobby UI** — add a "Room Settings" section visible to the host in `GameLobby.tsx` (or current lobby component):
    - Tile size: range slider 50–1000m, with label showing real-world size
    - Claim mode: radio buttons with descriptions
    - Win condition: dropdown (Territory %, Elimination, Timed) + value input
    - "Set Master Tile" button → calls `SetMasterTile` with player's current GPS (uses `useGeolocation`)
    - Settings invoke corresponding hub methods; `StateUpdated` reflects them back

14. **Starting Tile Assignment map** — show a simplified Leaflet map in the lobby (same as `GameMap` but no game-action callbacks) once master tile is set. Host clicks a hex → selects player from a dropdown → clicks "Assign". Invokes `AssignStartingTile(q, r, playerId)`.

---

## Phase 7 — Frontend: Continuous GPS & Game Map

**Goal:** Track player GPS continuously; update game map for new real-time mechanics. Depends on Phases 1, 5, 6.

15. **`useGeolocation.ts`** — replace `getCurrentPosition` with `watchPosition`. Return `{lat, lng, error, loading}`. Clear watch on unmount. Used app-wide during `Playing` phase.

16. **`App.tsx`** — update:
    - Remove `rolling`, `selectedHex` (attack selection), turn-based event handlers
    - Add `carriedTroops` display (derived from current player in `gameState.players`)
    - Continuous GPS passed as prop to `GameMap`
    - Wire new hub events/methods: `PickUpTroops`, `PlaceTroops`, `AssignStartingTile`, config methods
    - Remove wiring for `RollDice`, `PlaceReinforcement`, `ClaimHex`, `AttackHex`, `EndTurn`

17. **`GameMap.tsx`** — update hex interaction:
    - Show live player location as a dot/marker on the map (derived from continuous GPS)
    - Highlight the hex the player is currently standing in (physical presence)
    - Show master tile with a distinct style (crown icon / gold border)
    - Click own hex while present → `PickUpTroops` prompt (how many? slider/max)
    - Click target hex while present → `PlaceTroops`
    - Hex tooltip shows troops, owner, and whether master tile

18. **`PlayerPanel.tsx`** — replace dice/phase/moves UI with:
    - "Carried Troops: N" display
    - Current tile info (based on GPS-derived current hex)
    - Game timer countdown (if `TimedGame` win condition active)
    - Scoreboard (unchanged, already shows territory %)

19. **`DiceRoller.tsx`** — remove (no longer needed). Remove all references from `App.tsx`.

---

## Relevant Files

- `backend/Landgrab.Api/Models/GameState.cs` — add fields, new enum values
- `backend/Landgrab.Api/Models/HexCell.cs` — add `IsMasterTile`
- `backend/Landgrab.Api/Services/HexService.cs` — add geography math
- `backend/Landgrab.Api/Services/GameService.cs` — major refactor (remove turn logic, add concurrent actions, new win conditions)
- `backend/Landgrab.Api/Services/TroopRegenerationService.cs` — new background service
- `backend/Landgrab.Api/Hubs/GameHub.cs` — replace turn methods, add new config/action methods
- `backend/Landgrab.Api/Program.cs` — register new background service
- `frontend/landgrab-ui/src/types/game.ts` — mirror data model changes
- `frontend/landgrab-ui/src/App.tsx` — state + hub wiring overhaul
- `frontend/landgrab-ui/src/hooks/useGeolocation.ts` — continuous GPS
- `frontend/landgrab-ui/src/components/game/GameMap.tsx` — new map interactions
- `frontend/landgrab-ui/src/components/game/PlayerPanel.tsx` — new HUD
- `frontend/landgrab-ui/src/components/game/DiceRoller.tsx` — to be deleted
- `frontend/landgrab-ui/src/components/lobby/GameLobby.tsx` (approx) — room config UI

---

## Verification

1. `dotnet build` in `backend/Landgrab.Api/` — must compile cleanly
2. `npm run lint` + `tsc -b` in `frontend/landgrab-ui/` — no type errors
3. Manual: Create room → set master tile (from GPS) → configure tile size/claim mode/win condition → assign starting tiles → start game → verify game transitions to `Playing` (not `Reinforce`)
4. Manual: Two browser windows logged in as different players; verify both can act simultaneously (no "waiting for your turn" message)
5. Manual: Wait 30s in `Playing` phase — verify all owned tiles gain +1 troop (visible in hex)
6. Manual: Player picks up troops from a tile → troops deducted on hex, shown as carried; place troops on enemy tile with deficit → no conquest; place troops with surplus → conquest
7. Manual: Attempt to conquer master tile via `PlaceTroops` → should receive error
8. Manual: Test all 3 claim modes by changing room config and observing claim behaviour on neutral tiles
9. Manual: Test all 3 win conditions (Territory 60%, Elimination, Timed)

---

## Decisions

- **FFA/GlobalMap mode is untouched** — only Alliances room-based mode is affected
- **Alliances are teams only** — players still join an alliance; alliance affiliation affects win condition (territory pooled); no complex alliance combat mechanics (support dice etc removed)
- **Carried troops are server-side** — prevents cheating; `PlayerDto.CarriedTroops` in `GameState`
- **No troop carry cap** (for now) — can add later
- **Starting troops per assigned hex: 3** (same as original reinforcement default)
- **Master tile always shows as host-team coloured / indestructible** — it earns troops but cannot be conquered
- **Troop regeneration does NOT fire during Lobby phase** — only during `Playing`

## Resolved Further Considerations

1. **Troop pickup granularity**: Player chooses how many troops to carry via a count input (max = hex troop count). `PickUpTroops` takes an explicit `count` parameter.
2. **Carried troops on disconnect**: Server tracks the source hex per carried batch. On disconnect (`OnDisconnectedAsync`), any carried troops are returned to the source hex. Add `CarriedTroopsSourceQ` / `CarriedTroopsSourceR` (int?) to `PlayerDto`.
3. **Player visibility**: All players' real-time GPS positions are broadcast to the room and shown as labelled dots on the game map for everyone.
