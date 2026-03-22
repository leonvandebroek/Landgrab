# Plan: Game Dynamics Architecture + Full Feature Implementation

**TL;DR**: Add a layered, opt-in game-dynamics system to Alliances mode. The host configures mechanics during lobby via a new *Dynamics* step in SetupWizard. Phase 0 establishes the configuration infrastructure and host UI; each subsequent phase ships a coherent, independently playable feature layer.

---

## Phase 0 — Architectural Foundation
*No gameplay effects yet. Everything else depends on this.*

**Backend:**
1. Add `CopresenceMode` enum to `Models/GameState.cs` — all 17 modes: `None, Standoff, PresenceBattle, PresenceBonus, Ambush, Toll, Duel, Rally, Drain, Stealth, Hostage, Scout, Beacon, FrontLine, Relay, JagerProoi, Shepherd, CommandoRaid`
2. Add `GameDynamics` class with opt-in flags: `List<CopresenceMode> ActiveCopresenceModes`, `string? CopresencePreset`, `bool TerrainEnabled`, `bool PlayerRolesEnabled`, `bool FogOfWarEnabled`, `bool SupplyLinesEnabled`, `bool HQEnabled`, `bool TimedEscalationEnabled`, `bool UnderdogPactEnabled`, `bool NeutralNPCEnabled`, `bool RandomEventsEnabled`, `bool MissionSystemEnabled`
3. Add `GameDynamics Dynamics { get; set; } = new()` to `GameState`
4. Add `TerrainType` enum: `None, Water, Building, Road, Path, Forest, Park, Hills, Steep`
5. Add `PlayerRole` enum: `None, Commander, Scout, Defender, Saboteur, Engineer`
6. Add to `HexCell.cs`: `TerrainType TerrainType { get; set; }`
7. Add `GetPlayersInHex(GameState state, int q, int r) → List<PlayerDto>` private helper in `GameService` — uses `HexService.IsPlayerInHex` per player with `CurrentLat/CurrentLng`
8. Static preset lookup table in `GameService`:
   - `"Klassiek"` → empty modes + all flags false
   - `"Territorium"` → `[Shepherd, Drain]`
   - `"Formatie"` → `[FrontLine, Rally]`
   - `"Logistiek"` → `[Shepherd, Relay, FrontLine]`
   - `"Infiltratie"` → `[Stealth, CommandoRaid, Scout]`
   - `"Chaos"` → `[JagerProoi, Duel, PresenceBonus]`
   - `"Tolweg"` → `[Beacon, Toll, Drain]`
   - `"Aangepast"` → host-selected
9. Hub methods in `GameHub.cs`: `SetCopresenceModes(List<string> modes)`, `SetCopresencePreset(string preset)`, `SetGameDynamics(GameDynamicsDto dto)` — host-only, lobby-only; same pattern as existing `SetClaimMode`
10. Corresponding `GameService` methods mirroring hub

**Frontend:**
11. Update `types/game.ts`: add `CopresenceMode`, `TerrainType`, `PlayerRole` string literal types; `GameDynamics` interface; extend `GameState` with `dynamics: GameDynamics`; add `terrainType?` to `HexCell`; add `role?` to `Player`
12. Create `components/lobby/DynamicsStep.tsx`: preset cards (one per named preset) + "Aangepast" expands to individual copresence toggles with conflict indicators (✗/⚠ from the conflict map) + section toggles for terrain/roles/fog of war etc.
13. Update `components/lobby/SetupWizard.tsx`: insert DynamicsStep as step 4 between RulesStep and ReviewStep (→ 5 steps total)
14. Wire callbacks in `App.tsx`: `onSetCopresenceModes`, `onSetCopresencePreset`, `onSetGameDynamics` → `invoke(...)` calls

---

## Phase 1 — Simple Copresence (Stateless effects)
*Depends on: Phase 0. Models 1, 3, 9 — no new state needed.*

1. **Standoff (1)**: in `ValidateRealtimeAction` — if `ActiveCopresenceModes.Contains(Standoff)`: `GetPlayersInHex` for hostile → return error "A hostile player is blocking this tile"
2. **PresenceBonus (3)**: in `PlaceTroops` attack branch — attacker present → +1 attack die; defender present → +1 defend die; wire into `CombatResult`
3. **Drain (9)**: in `AddReinforcementsToAllHexes` — if `Drain` active and enemy present in hex → skip regen tick for that hex
4. Frontend: distinct Standoff error toast; PresenceBonus indicator in `TileActionPanel`

*Can run in parallel with Phase 2.*

---

## Phase 2 — Terrain Types
*Depends on: Phase 0. Can run in parallel with Phase 1.*

1. New `Services/TerrainFetchService.cs` — called from `StartGame()`:
   - Single OSM Overpass bounding-box query for all hex centres (tags: `highway`, `natural`, `building`, `landuse`, `leisure`)
   - OpenTopoData elevation batch query → relative elevation vs. neighbours
   - Priority rules from design doc (Water > Building > Road > Path > Forest > Park > Hills > Steep) → sets `cell.TerrainType` for every hex
   - Best-effort: on timeout/failure, log warning and default all hexes to `TerrainType.None` (game starts normally)
2. Terrain effects in game logic:
   - Combat (`PlaceTroops` attack branch): Building/Hills → +1 defend die; Steep → +2 defend die; Forest → attacker blind (troop count hidden in CombatResult)
   - Regen (`AddReinforcementsToAllHexes`): Building owned hex → +1 extra troop
   - Claim: Water → `ClaimNeutralHex` returns "impassable terrain" error
3. Frontend: terrain colour overlay in `GameMap.tsx`; terrain legend; forest hexes hide enemy troop count in UI

---

## Phase 3 — Teamplay Copresence Dynamics
*Depends on: Phase 0. Models 8, 17, 14, 12.*

1. **Rally (8)**: Add `IsFortified: bool` to `HexCell`. In `UpdatePlayerLocation`: count allied players in hex; ≥2 → `IsFortified=true`, else clear. In `PlaceTroops` combat: fortified → +1 defender dice
2. **Shepherd (17)**: Add `LastVisitedAt: DateTime?` to `HexCell`. In `UpdatePlayerLocation`: set on team member entry. In regen tick: if `Shepherd` active and owned tile unvisited >3 min → subtract instead of add
3. **FrontLine (14)**: In `PlaceTroops` attack: count adjacent hexes with allied player present (via `HexService.GetNeighbors` + `GetPlayersInHex`); add count to attacker dice pool
4. **Scout Bonus (12)**: Add `HashSet<string> VisitedHexes` to `PlayerDto`. First hex visit → +2 troops to nearest owned tile (HexService spiral search)
5. Frontend: fortified hex visual indicator (shield overlay); Shepherd drain notification via event log

---

## Phase 4 — Player Roles + HQ Mechanic
*Depends on: Phase 0. `PlayerRolesEnabled` + `HQEnabled` flags.*

1. Hub `SetPlayerRole(string role)` — lobby-only; sets `player.Role`
2. Role effects:
   - **Commander**: in `PlaceTroops` attack, Commander physically present in attacking hex → +1 die for all allied troops in that hex
   - **Defender**: in `AddReinforcementsToAllHexes`, Defender physically present in owned hex → double regen for that hex
   - **Saboteur**: in `UpdatePlayerLocation`, Saboteur on enemy hex with no attack active → −1 troop per regen tick
   - **Engineer**: add `EngineerBuiltAt: DateTime?` to `HexCell`; if Engineer stays in own hex ≥10 min → permanent `IsFort=true` (+1 defence bonus)
   - **Scout/Verkenner**: extends fog-of-war visibility radius by 3 (wired in Phase 7)
3. **HQ mechanic**: add `HQHexQ/HQHexR: int?` per `AllianceDto`; hub `SetAllianceHQ(q, r, allianceId)` — lobby-only host command; HQ capture → `HQCaptured` log event + 5-min claim freeze on owning team (`ClaimFrozenUntil: DateTime?` on `AllianceDto`)
4. Frontend: role selector in `GuestWizardView.tsx`; role badges in `PlayerPanel.tsx`; HQ crown icon on map; claim-frozen UI feedback

---

## Phase 5 — Action-Based Copresence
*Depends on: Phase 0. Models 4, 6, 13, 15.*

1. **Ambush (4)**: intercept `PickUpTroops` before standard logic — hostile present → cancel pickup, trigger combat → broadcast `AmbushResult` SignalR event (distinct from normal `CombatResult`)
2. **Toll (6)**: in `UpdatePlayerLocation` on new hex entry — if `Toll` active and hex owned by another team AND that owner is physically present → transfer 1 carried troop (configurable %) to tile → broadcast `TollPaid`
3. **Beacon (13)**: add `IsBeacon: bool`, `BeaconLat/BeaconLng: double?` to `PlayerDto`; hub `ActivateBeacon` / `DeactivateBeacon`; movement >1 tile from beacon position → auto-deactivate; in `ClaimNeutralHex`: teammate beacon within range → +1 ring adjacency
4. **Relay (15)**: in `PickUpTroops` and `PlaceTroops` reinforce branch — validate that either the hex is player's current hex OR a teammate is present in an adjacent hex
5. Frontend: ambush result modal; toll paid notification; beacon indicator on player map marker; relay chain visualization

---

## Phase 6 — Individual Abilities (Stealth, CommandoRaid, JagerProoi)
*Depends on: Phase 0. Models 10, 18, 16.*

1. **Stealth (10)**: add `StealthUntil: DateTime?`, `StealthCooldownUntil: DateTime?` to `PlayerDto`; hub `ActivateStealth`; in `SnapshotState`: strip `CurrentLat/CurrentLng` for stealthed players except for their own copy; stealth breaks on hostile copresence
2. **CommandoRaid (18)**: add `IsCommandoActive`, `CommandoTargetQ/R`, `CommandoDeadline`, `CommandoCooldownUntil` to `PlayerDto`; hub `ActivateCommandoRaid(q, r)` (server validates ≤3 hex distance); on arrival at target before deadline → claim resolves bypassing adjacency; background service cleans expired raids → cancel + log `CommandoFailed`
3. **JagerProoi (16)**: add `IsPrey: bool` to `PlayerDto`; `PreyTargetQ/R: int?` to `GameState`; Prey rotation logic (lowest score contributor or timer); on `UpdatePlayerLocation`: hostile enters Prey's hex → penalty + broadcast `PreyCaught`; Prey reaches safe tile → bonus + broadcast `PreyEscaped` + rotate Prey
4. Frontend: stealth toggle button; ghost/dim visual for own stealthed marker; CommandoRaid target selection UI + countdown timer; prey/hunter indicators on map; caught/escaped events in event log

---

## Phase 7 — Fog of War + Supply Lines
*Depends on: Phase 0. `FogOfWarEnabled` + `SupplyLinesEnabled` flags.*

1. **Fog of War**: extend `GetStateSnapshot(userId?)` — if `FogOfWarEnabled`, filter `Grid` to hexes visible to that player's team (adjacent to owned hexes; Scout role extends radius by 3). Hub broadcasts per-player snapshots instead of group broadcast — add `BroadcastIndividualSnapshots(roomCode)` helper in `GameHub` to avoid duplicating iteration logic across all broadcast sites
2. **Supply Lines**: in `AddReinforcementsToAllHexes` — BFS from each team's starting tile through own hexes; isolated hexes (no path to starting tile) get no regen and −1 defend die
3. Frontend: hidden hexes rendered as dark/unknown tiles; supply line disconnect notification in event log

---

## Phase 8 — Timed Events + Random Events
*Extends `TroopRegenerationService`. New `Services/RandomEventService.cs`.*

1. **Timed Escalation**: track elapsed time per room in tick service; after each 30-min threshold, increase regen bonus or interval; broadcast escalation announcement event
2. **Underdog Pact**: in `ApplyWinConditionAndLog` — if any team controls >60% hexes → temporary attack bonus for others (`UnderdogBoostUntil: DateTime?` on `AllianceDto`)
3. **Random Events** (new `RandomEventService` registered as hosted service): fires every ~30 min per Playing room — 2-min `EventWarning` SignalR broadcast, then applies one of:
   - **Calamity**: random hex loses all troops
   - **Epidemic**: largest team loses 2 troops on a random hex
   - **Diplomatic Opening**: all active ceasefires extended 5 min
   - **Bonus Troops**: every team receives +2 troops to place freely
   - **Rush Hour**: `IsRushHour: bool` flag on `GameState` for 5 min; claimed hexes count double in score
4. Frontend: event announcement banner (2-min warning + trigger); rush hour HUD indicator

---

## Phase 9 — Mission System
*New `Services/MissionService.cs`. `MissionSystemEnabled` flag.*

1. `Mission` model: `Id, Type, Title, Description, Scope (Main/Interim/Team/Personal), TargetTeamId?, TargetPlayerId?, Objective, Progress, Status, ExpiresAt, Reward`
2. `MissionService`: generates missions at game start + generates new interim missions every 30-45 min; evaluates progress in `UpdatePlayerLocation` and `PlaceTroops` hooks
3. Mission types from design docs:
   - **Territorial**: Hold the Hill, Divide and Conquer, Encirclement
   - **Recon**: Espionage, Find the HQ
   - **Time-bound**: Flag Planting, Last Defender, Rush Hour (also a random event)
   - **Role/Skill**: Convoy, Eliminate the Commander, Build the Fort
   - **Personal** (per-player, private): varied small objectives
4. Hub broadcasts `MissionAssigned`, `MissionCompleted`, `MissionFailed` — filtered per player/team scope
5. Add `missions: Mission[]` to `GameState` (server filters to player/team-visible missions only before sending)
6. Frontend: mission tracker panel in `PlayingHud.tsx`; personal mission display (private, own player only); mission notification toasts

---

## Phase 10 — Complex Copresence (PresenceBattle, Duel, Hostage, Neutral NPC)
*Depends on: Phase 0 + Phase 3 data patterns.*

1. **PresenceBattle (2)**: add `ContestProgress: double?`, `ContestingPlayerId: string?` to `HexCell`; in regen tick: for all owned hexes with a contestant, shift progress ±0.1 per tick per dominant side; alliance members compound presence; at 1.0 → capture + broadcast `TileCaptured`
2. **Duel (7)**: add `PendingDuels: Dictionary<string, PendingDuel>` to `GameRoom` (not `GameState`); `PendingDuel` = `{PlayerIds, TileQ/R, ExpiresAt}`; hub `AcceptDuel`, `DeclineDuel`; copresence detection → send duel challenge to both players; auto-expire after 30 s with cowardice penalty for non-respondents; broadcast `DuelResult`
3. **Hostage (11)**: add `HeldByPlayerId: string?`, `HeldUntil: DateTime?` to `PlayerDto`; hub `DetainPlayer(targetPlayerId)`; `ValidateRealtimeAction` blocks detained players on non-current hexes; background tick drains detained player's tiles; release via ally copresence, timer, or optional troop bribe
4. **Neutral NPC Hexes**: at `StartGame()` if `NeutralNPCEnabled` — OSM building hexes assigned `"NPC"` owner + troops; both teams can attack for a permanent fort bonus
5. Frontend: PresenceBattle progress ring on contested tiles; duel challenge modal; detained status indicator; NPC hex visual (grey, with troop count visible to all)

---

## Relevant Files

**Backend:**
- `backend/Landgrab.Api/Models/GameState.cs` — enums, GameDynamics, all new GameState fields
- `backend/Landgrab.Api/Models/HexCell.cs` — TerrainType, IsFortified, LastVisitedAt, ContestProgress, ContestingPlayerId
- `backend/Landgrab.Api/Services/GameService.cs` — GetPlayersInHex, all new Set* methods, all model logic hooks
- `backend/Landgrab.Api/Services/TroopRegenerationService.cs` — Drain, Shepherd, PresenceBattle, escalation
- `backend/Landgrab.Api/Hubs/GameHub.cs` — all new hub methods
- `backend/Landgrab.Api/Services/TerrainFetchService.cs` — new (Phase 2)
- `backend/Landgrab.Api/Services/RandomEventService.cs` — new (Phase 8)
- `backend/Landgrab.Api/Services/MissionService.cs` — new (Phase 9)

**Frontend:**
- `frontend/landgrab-ui/src/types/game.ts` — all extended interfaces
- `frontend/landgrab-ui/src/components/lobby/SetupWizard.tsx` — add DynamicsStep
- `frontend/landgrab-ui/src/components/lobby/DynamicsStep.tsx` — new (Phase 0)
- `frontend/landgrab-ui/src/components/lobby/GuestWizardView.tsx` — role selection (Phase 4)
- `frontend/landgrab-ui/src/components/game/PlayingHud.tsx` — missions, abilities, events panels
- `frontend/landgrab-ui/src/components/game/GameMap.tsx` — terrain rendering, fog of war
- `frontend/landgrab-ui/src/App.tsx` — new SignalR event handlers + invoke calls
- `frontend/landgrab-ui/src/i18n/en.ts` + `nl.ts` — new strings per phase

---

## Verification

1. **Phase 0**: Create room → Dynamics step appears in SetupWizard → select "Territorium" preset → `GameState.dynamics.copresencePreset == "Territorium"` → `activeCopresenceModes == ["Shepherd", "Drain"]`
2. **Phase 1**: Enable Drain → regen tick skips enemy-occupied tile; enable Standoff → tile action returns blocking error
3. **Phase 2**: `StartGame` with `TerrainEnabled` → all hexes have `terrainType` values; Building hex shows +1 defence in `CombatResult`
4. **Phase 3**: Enable Rally → two allied players on same tile → `IsFortified=true` → attacker needs extra die
5. **Phase 6**: `ActivateCommandoRaid(q, r)` → player physically runs to target → arrives before deadline → claim resolves without adjacency check
6. **Phase 7**: `FogOfWarEnabled` → `StateUpdated` payload only includes hexes adjacent to own territory

---

## Decisions

- `GameDynamics` as a nested class on `GameState` (not flat fields) — readable and forward-extensible
- Active modes stored as `List<CopresenceMode>` (not C# flags enum) to allow arbitrary combinations
- Presets resolved server-side: `SetCopresencePreset("Territorium")` populates `ActiveCopresenceModes` and stores preset name for UI highlight
- Terrain fetch is best-effort: OSM/elevation failure logs a warning and defaults all hexes to `TerrainType.None` — same resilience pattern as `db.Database.MigrateAsync()`
- Fog of War requires per-player `StateUpdated` broadcasts: add `BroadcastIndividualSnapshots` helper in `GameHub` so all broadcast sites don't need to duplicate the iteration

---

## Further Considerations

1. **Fog of War broadcast architecture** (Phase 7) is the most invasive change — it touches every broadcast call in `GameHub`. If this phase is deferred, keep group broadcasts but stub the per-player filtering API now so it can be switched later without refactoring all broadcast sites.
2. **OSM API at game start** (Phase 2): Overpass can be slow (2–5 s). Use a 5-second `HttpClient` timeout; if it fires, proceed without terrain. Consider caching results by bounding box for repeated test games on the same location.
3. **Phase execution order**: Phases 1, 2, and 3 have no mutual dependencies and can be implemented in parallel. Phase 4 (Roles) can also start independently after Phase 0 lands.
