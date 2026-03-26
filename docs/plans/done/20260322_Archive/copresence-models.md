# Copresence Models — Design Document

This document captures all designed co-presence interaction models for the Alliances game mode. Co-presence refers to the situation where multiple players are physically inside the same hex tile at the same time.

Currently there is no specific handling for this scenario — the server applies a first-come-first-served rule based on action order. The models below give the host a deliberate choice of how to handle this.

---

## Architecture

### New enum: `CopresenceMode`

Add to `Models/GameState.cs`:

```csharp
public enum CopresenceMode
{
    None,           // Status quo — no special handling
    Standoff,       // Model 1
    PresenceBattle, // Model 2
    PresenceBonus,  // Model 3
    Ambush,         // Model 4
    Toll,           // Model 6
    Duel,           // Model 7
    Rally,          // Model 8
    Drain,          // Model 9
    Stealth,        // Model 10
    Hostage,        // Model 11
    Scout,          // Model 12
    Beacon,         // Model 13
    FrontLine,      // Model 14
    Relay,          // Model 15
    JagerProoi,     // Model 16
    Shepherd,       // Model 17
    CommandoRaid,   // Model 18
}
```

`GameState` gets a new field:

```csharp
public CopresenceMode CopresenceMode { get; set; } = CopresenceMode.None;
```

Optionally, support a **preset** selection (see Presets section below) that activates multiple compatible models simultaneously via a `CopresencePreset` string stored on `GameState`.

### Three implementation layers

Models fall into one of three technical layers. Models in different layers are almost always combinable.

| Layer | Trigger point | Models |
|-----|-------------|------|
| **A — Location event** | Player enters/leaves hex (`UpdatePlayerLocation`) | 1, 2, 3, 6, 8, 9, 12, 13, 16, 17 |
| **B — Action interrupt** | Player performs an action (`PickUpTroops`, `PlaceTroops`) | 4, 7, 11, 14, 15, 18 |
| **C — Background tick** | Periodic server timer (`TroopRegenerationService`) | 2, 9, 17 |

### Shared helper

All models that need to know whether a specific player is sharing a tile with an enemy should use a single shared helper:

```csharp
// GameService or HexService
private static List<PlayerDto> GetPlayersInHex(GameState state, int q, int r)
// Uses HexService.IsPlayerInHex per player with their CurrentLat/CurrentLng
```

### Hub method

Add to `GameHub.cs` (same pattern as `SetClaimMode`):

```csharp
public async Task SetCopresenceMode(string mode) { ... }
```

And a corresponding `SetCopresenceMode` method in `GameService`.

---

## Individual Models

### Model 1 — Standoff

When a hostile player is present on a tile you want to claim or attack, the server blocks the action until one player leaves.

**Behaviour:**

- Check added in `ValidateRealtimeAction`
- Returns an error if a hostile player is detected in the target hex
- Recommended: add a 60-second timeout or host override to prevent infinite blocking

**Data changes:** None

**Conflicts with:** Model 2, 6, 7 (all resolve the same copresence event differently)

---

### Model 2 — Presence Battle

A tile has a `ContestProgress` (0.0–1.0) that shifts every few seconds toward the present player. Two hostile players on the same tile cancel each other out. First to reach 1.0 captures the tile.

**Behaviour:**

- Background tick (every ~2 seconds) iterates contested tiles
- Progress speed is configurable (e.g. 0.1 per tick per player advantage)
- Alliance members combine their presence to shift progress faster
- At 100%, ownership transfers and `TileCaptured` event is broadcast

**Data changes on `HexCell`:**

```csharp
public double? ContestProgress { get; set; }   // 0.0–1.0
public string? ContestingPlayerId { get; set; }
```

**Implementation notes:**

- Background service or extended `TroopRegenerationService`
- Must use `lock(room.SyncRoot)` — same as existing regen tick
- Frontend: contested tiles show a progress ring or colour blend between owner and contester

**Conflicts with:** Model 1, 6, 7, 11

---

### Model 3 — Presence Bonus

When an attacker is physically present on the tile they are attacking from, they gain +1 attack die. When a defender is physically present on their own tile being attacked, they gain +1 defence die.

**Behaviour:**

- Single check added to the combat resolution path in `PlaceTroops` (attack branch)
- Uses `GetPlayersInHex` to detect presence at the source (attacker) and target (defender) tiles
- Dice counts adjusted before rolling

**Data changes:** None

**Conflicts with:** Nothing — stacks additively with other combat modifiers

---

### Model 4 — Ambush

If a hostile player is standing on a tile when the owner tries to pick up troops from it, the pickup is cancelled and automatically triggers combat instead — the owner "walks into" the ambush.

**Behaviour:**

- Added to `PickUpTroops` before the standard pickup logic
- If a hostile is detected in the same hex: return an `AmbushResult` event (new SignalR event) rather than a normal error
- The ambusher wins if they have more carried troops than the tile has troops
- Recommended: new `AmbushResult` SignalR event so the frontend can display it distinctly from a normal pickup rejection

**Data changes:** None

**Conflicts with:** Model 7 (both intercept the same trigger moment — pick one)

---

### Model 6 — Toll

When a hostile player enters a tile you own *and you are also standing on it*, they automatically pay a toll: 1 carried troop (or a configurable percentage) is transferred to your tile.

**Behaviour:**

- Check in `UpdatePlayerLocation` when a new hex is entered
- Only triggers if the tile owner is also present
- Toll amount: configurable (e.g. 1 troop or 10% of carried troops, minimum 0)

**Data changes:** None

**Conflicts with:** Model 1 (Standoff assumes the player cannot enter), Model 7

---

### Model 7 — Duel

When two hostile players are on the same tile, both receive a duel challenge notification (30-second window). If both accept, special 1v1 combat resolves — the loser forfeits all carried troops. If either refuses, they pay a cowardice penalty (lose 2 carried troops).

**Behaviour:**

- Pending duel stored server-side: `PendingDuel` per room (playerId pair + tile + expiry timestamp)
- New hub calls: `AcceptDuel`, `DeclineDuel`
- After resolution: broadcast `DuelResult` SignalR event
- Auto-expires server-side after 30 seconds with cowardice penalty for non-respondents

**Data changes:** New `PendingDuel` state (can be a dictionary on `GameState` or `GameRoom`)

**Conflicts with:** Model 1, 2, 4, 6, 11

---

### Model 8 — Rally

When two or more allied players are on the same tile simultaneously, that tile gains a `IsFortified` flag. Attackers pay +1 extra attack die requirement to capture it. The flag drops when fewer than two allies remain on the tile.

**Behaviour:**

- Set/clear `IsFortified` in `UpdatePlayerLocation`
- Check `IsFortified` in the combat resolver — add 1 to the effective defender dice count

**Data changes on `HexCell`:**

```csharp
public bool IsFortified { get; set; }
```

**Conflicts with:** Nothing — stacks cleanly with most other models

---

### Model 9 — Drain

While a hostile player is physically present on your tile, that tile is skipped by the regen tick — it receives no troop regeneration.

**Behaviour:**

- In `AddReinforcementsToAllHexes`, check `GetPlayersInHex` for each tile
- If any enemy of the owner is present → skip regeneration for that tile

**Data changes:** None

**Conflicts with:** Nothing — stacks additively with Shepherd (Model 17)

---

### Model 10 — Stealth

A player can activate Stealth mode via a hub action. For a configurable duration (default: 2 minutes, once per game or once per N minutes), their `CurrentLat`/`CurrentLng` are excluded from the broadcasted `GameState` snapshot, so opponents cannot see them on the map. Stealth breaks if a hostile player enters the same hex.

**Behaviour:**

- New hub action: `ActivateStealth`
- `PlayerDto` gains `StealthUntil` and `StealthCooldownUntil` timestamps
- `SnapshotState` strips `CurrentLat`/`CurrentLng` for stealthed players *except* for the player themselves (they still see their own position)

**Data changes on `PlayerDto`:**

```csharp
public DateTime? StealthUntil { get; set; }
public DateTime? StealthCooldownUntil { get; set; }
```

**Conflicts with:** Nothing — pairs well with Model 18

---

### Model 11 — Hostage

If you are standing on your own tile and a hostile player also enters it, you can "detain" them via a hub action. While detained, the hostage cannot act on other tiles and their tiles slowly drain. Escape: an ally enters the same tile, or a timer expires (default: 5 minutes).

**Behaviour:**

- New hub action: `DetainPlayer(targetPlayerId)`
- `ValidateRealtimeAction` blocks all actions on other tiles for detained players
- Background tick applies troop drain to detained player's tiles
- Release triggered by: ally copresence, timer, or detained player bribing with troops (optional)

**Data changes on `PlayerDto`:**

```csharp
public string? HeldByPlayerId { get; set; }
public DateTime? HeldUntil { get; set; }
```

**Conflicts with:** Model 2, 7 (all claim full control over the copresent player)

---

### Model 12 — Scout Bonus

Each hex a player enters for the first time awards a bonus (e.g. +2 troops) to the nearest friendly tile. Per-player visited hex sets are tracked. Movement → reward.

**Behaviour:**

- On `UpdatePlayerLocation`, if the new hex key is not in `VisitedHexes`: apply bonus, add to set
- Bonus placed on nearest owned tile (use `HexService` spiral search)

**Data changes on `PlayerDto`:**

```csharp
public HashSet<string> VisitedHexes { get; set; } = [];
```

**Conflicts with:** Nothing — fully independent

---

### Model 13 — Beacon

One player per team can be designated as Beacon. While standing still (< 1 tile of movement per minute), all teammates within a configurable radius gain extended claim range (+1 tile adjacency). The bonus drops immediately if the Beacon moves.

**Behaviour:**

- New hub actions: `ActivateBeacon` / `DeactivateBeacon`
- On `UpdatePlayerLocation`, if the player is a Beacon and has moved more than 1 tile from their beacon position → clear Beacon status
- Adjacency check in `ClaimNeutralHex` extended by 1 ring for teammates of an active Beacon

**Data changes on `PlayerDto`:**

```csharp
public bool IsBeacon { get; set; }
public DateTime? BeaconActivatedAt { get; set; }
public double? BeaconLat { get; set; }
public double? BeaconLng { get; set; }
```

**Conflicts with:** Nothing — pairs well with Model 6 (Toll)

---

### Model 14 — Front Line

An attacking tile gains +1 attack die for each allied player physically present in an *adjacent* tile. A coordinated attack from three sides is dramatically stronger than soloing.

**Behaviour:**

- In the combat resolver (attack branch of `PlaceTroops`): count adjacent tiles that have an allied player present
- Add that count to the attacker's dice pool

**Data changes:** None

**Conflicts with:** Nothing — stacks with Model 8 (Rally) and Model 3 (Presence Bonus)

---

### Model 15 — Relay

Troops can only be transported by physical presence chains. A player can only drop/pick up troops on a tile that is *adjacent to a tile where a teammate is standing*, or on their own current tile. This makes unoccupied gaps in the supply line impassable for troop transport.

**Behaviour:**

- Added to `PickUpTroops` and the reinforce/drop-off branch of `PlaceTroops`
- Before allowing the action, check that either: the source/destination tile is the player's current hex, or a teammate is present in an adjacent hex

**Data changes:** None

**Conflicts with:** Model 18 only — define which takes precedence for the adjacency override

---

### Model 16 — Jager & Prooi (Hunter & Prey)

Each round, one player per team is designated as Prey (rotates, e.g. lowest score contributor). If a hostile player enters the Prey's tile, the Prey's team loses 5 troops distributed across their tiles. But if the Prey reaches a designated safe tile uncontested, the team wins a large bonus.

**Behaviour:**

- `PlayerDto` gets `IsPrey` flag, set each round (or per configurable interval)
- On `UpdatePlayerLocation`: check if a hostile enters the same tile as the Prey → apply penalty + broadcast `PreyCaught` event
- On reaching the safe tile: apply bonus + broadcast `PreyEscaped` event + rotate Prey

**Data changes on `GameState`:**

```csharp
public int? PreyTargetQ { get; set; }
public int? PreyTargetR { get; set; }
```

**Conflicts with:** Nothing — pairs well with Model 12 (Scout Bonus)

---

### Model 17 — Shepherd

Tiles that go unvisited by any teammate for longer than a configurable interval (default: 3 minutes) lose 1 troop per regen tick. Large territories require more players actively patrolling.

**Behaviour:**

- Updated on `UpdatePlayerLocation` when a team member enters the tile
- In `AddReinforcementsToAllHexes`: if a non-null owner's tile has `LastVisitedAt` older than the threshold → subtract instead of add

**Data changes on `HexCell`:**

```csharp
public DateTime? LastVisitedAt { get; set; }
```

**Conflicts with:** Nothing — stacks cleanly with Model 9 (Drain)

---

### Model 18 — Commando Raid

One player per team has a Commando ability (once per 10 minutes). On activation, they may claim a tile up to 3 hexes away — but must physically run there and arrive within 90 seconds. If they fail to arrive in time, carried troops are lost and the claim is cancelled.

**Behaviour:**

- New hub actions: `ActivateCommandoRaid(targetQ, targetR)`, auto-resolved on `UpdatePlayerLocation` or server-side timeout
- Target tile range validated server-side (≤ 3 hex distance)
- On arrival at target tile before deadline: claim resolves bypassing adjacency requirement
- On timeout: carried troops lost, `CommandoFailed` event broadcast
- Background tick handles expired commando raids

**Data changes on `PlayerDto`:**

```csharp
public bool IsCommandoActive { get; set; }
public int? CommandoTargetQ { get; set; }
public int? CommandoTargetR { get; set; }
public DateTime? CommandoDeadline { get; set; }
public DateTime? CommandoCooldownUntil { get; set; }
```

**Conflicts with:** Model 15 only — define precedence for adjacency override

---

## Conflict Map

| | 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **1 Standoff** | — | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **2 PresenceBattle** | ✗ | — | ✓ | ✓ | ⚠ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **3 PresenceBonus** | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **4 Ambush** | ✓ | ✓ | ✓ | — | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **6 Toll** | ✗ | ⚠ | ✓ | ✓ | — | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **7 Duel** | ✗ | ✗ | ✓ | ✗ | ✗ | — | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **8 Rally** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **9 Drain** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **10 Stealth** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **11 Hostage** | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **12 Scout** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **13 Beacon** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| **14 FrontLine** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| **15 Relay** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ⚠ |
| **16 JagerProoi** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| **17 Shepherd** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| **18 CommandoRaid** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ⚠ | ✓ | ✓ | — |

**✗ = conflicteert** | **⚠ = combineerbaar maar vergt expliciete volgorderegel** | **✓ = probleemloos combineerbaar**

---

## Highlighted Combinations

### Uitputting — 17 + 9

Tiles verliezen troepen als er niemand van je team in de buurt is (Shepherd), én als een vijand er staat krijgen ze geen regen (Drain). Twee onafhankelijke timers die samen druk creëren om voortdurend actief te zijn en vijanden weg te drijven.

### Formatie — 14 + 8

Rally geeft verdedigingsbonus als twee bondgenoten samen op een tile staan. Frontlinie geeft aanvalsbonus als twee bondgenoten aangrenzend zijn. Samen maakt het elke individuele actie zwakker dan de gecoördineerde groep.

### Tolwachter — 13 + 6

De Vuurtoren staat bewust stil op een chokepoint, vergroot het claimradius van zijn team, en int tegelijkertijd tol van vijanden die passeren. Geeft een bewuste niet-renner een unieke, waardevolle rol.

### Spookoperatie — 10 + 18

Stealth voor onzichtbare repositionering, dan een Commando Raid activeren voor het verrassingselement. Niemand ziet de aanval aankomen tot de speler al bijna is aangekomen.

### Survival Run — 12 + 16

De Prooi moet rennen naar veiligheid terwijl hij scout-bonussen opbouwt via onbekend terrein. Jagers die achternarennen, verkennen per ongeluk ook nieuw gebied voor hun eigen team.

### Logistiek Oorlog — 17 + 15 + 14

Tiles verouderen zonder patrouille (Shepherd), troepen reizen via menselijke ketens (Relay), defensieve aanvallen vereisen flankers (Front Line). Dwingt een volledig militair logistiek systeem af: bevoorradingslijn, patrouilleposten en aanvalseenheden.

---

## Presets

In plaats van losse modellen te laten configureren kan de host een preset kiezen. Presets activeren een curated combinatie.

| Preset | Actieve modellen | Gevoel |
|------|----------------|------|
| **Klassiek** | — (None) | Drempelvrij, simpel |
| **Territorium** | 17 + 9 | Actief blijven verplicht, vijanden wegdrijven |
| **Formatie** | 14 + 8 | Teamcoördinatie, positionele scirmish |
| **Logistiek** | 17 + 15 + 14 | Volledige militaire planning |
| **Infiltratie** | 10 + 18 + 12 | Snelheid, sloop, verkenning |
| **Chaos** | 16 + 7 + 3 | Hoog drama, directe confrontaties |
| **Tolweg** | 13 + 6 + 9 | Economisch, chokepoints, geduld |
| **Aangepast** | Vrije keuze | Host selecteert per laag |

In de UI toont de "Aangepast" optie welke modellen conflicteren zodat ongeldige combinaties niet geselecteerd kunnen worden.

---

## Implementation Priority

| Prioriteit | Modellen | Reden |
|----------|--------|-----|
| **1 — Fundament** | State/enum + `SetCopresenceMode` hub/service | Vereist voor alles |
| **2 — Laagdrempelig** | 1 (Standoff), 3 (PresenceBonus), 9 (Drain) | Kleine wijzigingen, meteen speelbaar |
| **3 — Teamspel** | 8 (Rally), 14 (FrontLine), 17 (Shepherd) | Weinig state, grote spelimpact |
| **4 — Actief bewegen** | 12 (Scout), 13 (Beacon), 4 (Ambush) | Motiveren individuen |
| **5 — Dynamische acties** | 18 (CommandoRaid), 10 (Stealth), 16 (JagerProoi) | Spectaculaire momenten |
| **6 — Complex** | 2 (PresenceBattle), 7 (Duel), 11 (Hostage), 15 (Relay) | Vereisen extra state en SignalR events |
