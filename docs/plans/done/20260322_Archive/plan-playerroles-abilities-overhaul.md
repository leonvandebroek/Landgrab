# Player Roles & Abilities Overhaul — Full Implementation Plan

**Created:** 17 maart 2026  
**Status:** Approved, ready for implementation  
**Scope:** Remove copresence system, redesign and fully implement player roles with active abilities, visual feedback, and host role management.

---

## Background & Problem Statement

Three core issues make the current gameplay confusing:

1. **Player roles are barely implemented.** All four roles have a single passive effect, many of which are silent. Players don't know what their role does or that it's doing anything.
2. **Host cannot manage roles.** There's no way to assign roles to other players or randomize them. Players self-select, leading to imbalance or duplicate roles.
3. **The copresence mode system is confusing and not well implemented.** It adds three layers of complexity (enum values → presets → per-game config) that players never understand. Most mechanics are invisible; the two interactive abilities (Beacon, CommandoRaid) logically belong to the role system anyway.

---

## Redesigned Role & Ability Set

### Design principle
Every ability must reward or require **physical movement**. This is a location-based physical game. Passive perks fire automatically based on where you stand. Active abilities trigger from a button but have physical preconditions.

### Commander 🫡 — Battle Leader
> *"I lead by example. Where I stand, we win."*

| # | Ability | Type | Description | Cooldown |
|---|---------|------|-------------|----------|
| 1 | **War Bonus** | Passive | +1 attack when physically present in combat hex | — |
| 2 | **Tactical Strike** | Active | Your next attack (within 5 min) ignores all defense bonuses (forts, fortification) | 20 min |
| 3 | **Reinforce** | Active | Standing on a friendly hex: instantly add +3 troops to it | 15 min |

### Scout 🧭 — Explorer
> *"I go where nobody dares. I find weaknesses."*

| # | Ability | Type | Description | Cooldown |
|---|---------|------|-------------|----------|
| 1 | **Extended Vision** | Passive | +3 fog-of-war radius | — |
| 2 | **First Strike** | Passive | First visit to any hex → +2 troops to nearest owned tile | — |
| 3 | **Commando Raid** | Active | Claim a hex up to 3 hexes away by physically walking to it, bypassing adjacency | 30 min |

*CommandoRaid is Scout-exclusive. The `beaconEnabled` game flag retains the commando raid on/off toggle, but the hub now verifies `player.Role == Scout`.*

### Defender 🛡️ — Guardian
> *"I hold the line. Nothing gets past me while I'm here."*

| # | Ability | Type | Description | Cooldown |
|---|---------|------|-------------|----------|
| 1 | **Presence Shield** | Passive | Double troop regen every tick while standing on own hex | — |
| 2 | **Shield Wall** | Active | While active (5 min), any enemy attack on your current hex needs +2 extra troops. Visible to all players on map. | 20 min |
| 3 | **Last Stand** | Passive | If enemy captures a hex you're standing on, you're relocated to the nearest friendly hex instead of being stranded | — |

### Engineer 🛠️ — Builder
> *"I build infrastructure. My fortifications outlast everyone."*

| # | Ability | Type | Description | Cooldown |
|---|---------|------|-------------|----------|
| 1 | **Fort Construction** | Passive | Stay 10 min on own hex → permanent fort (+1 defense in combat) | — |
| 2 | **Emergency Repair** | Active | Instantly restore +3 troops to current hex | 15 min |
| 3 | **Demolish** | Active | Standing on an enemy fortified hex: remove their fort (+1 defense) after 2 min physical presence. Shows progress ring on map. | 30 min |

---

## Simplified GameDynamics (after Phase 0)

```csharp
public class GameDynamics
{
    public bool TerrainEnabled { get; set; }
    public bool PlayerRolesEnabled { get; set; }
    public bool FogOfWarEnabled { get; set; }
    public bool BeaconEnabled { get; set; }       // replaces CopresenceMode.Beacon
    public bool TileDecayEnabled { get; set; }    // replaces CopresenceMode.Shepherd
    // ... any other existing feature flags ...
}
```

---

## Execution Order

```
Phase 0  — Remove CopresenceMode (prerequisite for all other phases)
Phase 1  — Fix fort: defense bonus + map icon + build progress ring
Phase 2  — Host role assignment + random role distribution
Phase 2b — Lock CommandoRaid to Scout role
Phase 3  — New active abilities: Tactical Strike, Shield Wall, Emergency Repair, Demolish
Phase 4  — Role explanation modal in lobby after assignment
Phase 5  — Map visual effects for active abilities
Phase 6  — Ability description subtitles + in-game help bottom-sheet
Phase 7  — Rules page per-role card layout + i18n keys
```

---

## Phase 0 — Remove CopresenceMode System

### Why

The copresence mode system has 3 layers of complexity (enum → presets → per-game config) players never understand. Most mechanics (Rally, Shepherd, Drain, Standoff, PresenceBonus, FrontLine) are invisible with no UI feedback. The two interactive abilities (Beacon, CommandoRaid) are absorbed into the role system. Removing it cleans ~400 lines of backend logic and an entire lobby configuration step.

### Fate of each copresence mechanic

| Old mode | New fate |
|----------|----------|
| **Beacon** | `beaconEnabled` boolean toggle in `GameDynamics`. Host toggle in DynamicsStep. |
| **CommandoRaid** | Scout role active ability (Phase 2b). Gated by `PlayerRolesEnabled && player.Role == Scout`. |
| **Rally** (`IsFortified`) | Promoted to **always-on**: 2+ allied players on a hex → always fortified. No toggle. |
| **Shepherd** (tile decay) | `tileDecayEnabled` boolean toggle. |
| **Drain** (hostile blocks regen) | Promoted to **always-on**. |
| **Standoff** | **Removed entirely.** Frustrating UX without visual feedback. |
| **PresenceBonus** | **Removed entirely.** Opaque, no UI feedback. |
| **FrontLine** | **Removed entirely.** Same reason. |

### Task list

**Backend**

- [ ] `GameState.cs` — Delete `CopresenceMode` enum. Remove `ActiveCopresenceModes` + `CopresencePreset` from `GameDynamics`. Add `BeaconEnabled` + `TileDecayEnabled` booleans.
- [ ] `GameStateCommon.cs` — Delete `CopresencePresets` dictionary. Update `SnapshotState` to copy new boolean fields.
- [ ] `GameConfigService.cs` — Delete `SetCopresenceModes` + `SetCopresencePreset`. Add `SetBeaconEnabled(roomCode, userId, bool)` + `SetTileDecayEnabled(roomCode, userId, bool)` following the `SetTerrainEnabled` pattern.
- [ ] `HostControlService.cs` — Remove preset resolution block. `ApplyGameDynamics` reduces to applying simple boolean fields.
- [ ] `GameService.cs` — Remove copresence passthrough methods. Add `SetBeaconEnabled`, `SetTileDecayEnabled` passthroughs.
- [ ] `LobbyService.cs` — Remove `CopresencePresets` reference.
- [ ] `GameHub.Lobby.cs` — Delete `SetCopresenceModes` + `SetCopresencePreset` hub methods. Add `SetBeaconEnabled(bool)` + `SetTileDecayEnabled(bool)`.
- [ ] `GameHub.cs` — Delete `RemovedCopresenceModes` HashSet + all 4 copresence validation helpers. Simplify `SanitizeGameDynamics`.
- [ ] `GameplayService.cs` — Replace every `ActiveCopresenceModes.Contains(CopresenceMode.X)` check:
  - `Rally` → unconditional (remove the guard)
  - `Shepherd` → `room.State.Dynamics.TileDecayEnabled`
  - `Drain` → unconditional (remove the guard)
  - `Standoff` → delete entire block
  - `PresenceBonus` → delete entire block
  - `FrontLine` → delete entire block
  - `Beacon` → `room.State.Dynamics.BeaconEnabled`
  - `CommandoRaid` → remove check (will become role-gated in Phase 2b)
- [ ] `AbilityService.cs` — Replace `ActiveCopresenceModes.Contains(CopresenceMode.Beacon)` with `BeaconEnabled`. Replace `CopresenceMode.CommandoRaid` check with `PlayerRolesEnabled` (temporary until Phase 2b).
- [ ] **Tests** — Delete `GameConfigServiceTests` copresence tests. Delete `HostControlServiceTests` preset tests. Replace all `WithCopresenceModes(...)` calls with `WithBeaconEnabled()` / `WithTileDecayEnabled()`. Delete `GameStateBuilder.WithCopresenceModes()`.

**Frontend**

- [ ] `game.ts` — Remove `CopresenceMode` type, `activeCopresenceModes`, `copresencePreset` from `GameDynamics`. Add `beaconEnabled` + `tileDecayEnabled` booleans.
- [ ] `useGameActionsLobby.ts` + `useGameActions.shared.ts` + `useGameActions.ts` — Remove `handleSetCopresenceModes`, `handleSetCopresencePreset`. Add `handleSetBeaconEnabled`, `handleSetTileDecayEnabled`.
- [ ] `dynamics.ts` — Delete `DYNAMICS_PRESETS`, `PRESET_MODES`, `COPRESENCE_MODES`. Update `FEATURE_KEYS`.
- [ ] `gameHelpers.ts` — Remove `activeCopresenceModes: []` from default state.
- [ ] `DynamicsStep.tsx` — Delete preset radio group + custom mode checkbox section. Step becomes a clean list of feature toggles only.
- [ ] `AbilityBar.tsx` — Replace `modes.includes('Beacon')` with `dynamics.beaconEnabled`. Replace `modes.includes('CommandoRaid')` with `dynamics.playerRolesEnabled`.
- [ ] `tileInteraction.ts` — Delete all `Standoff`, `PresenceBonus`, `Rally`, `FrontLine` checks. `Beacon` reference becomes `dynamics.beaconEnabled`.
- [ ] `HelpOverlay.tsx` + `PlayerHUD.tsx` + `GameRulesPage.tsx` — Remove copresence mode display sections.
- [ ] `App.tsx` → `LobbyView.tsx` → `GameLobby.tsx` → `SetupWizard.tsx` — Remove `onSetCopresenceModes`/`onSetCopresencePreset` prop chain. Add `onSetBeaconEnabled`/`onSetTileDecayEnabled`.
- [ ] `en.ts` + `nl.ts` — Delete all `dynamics.preset.*` and `dynamics.mode.*` keys. Add `dynamics.feature.beaconEnabled.*` and `dynamics.feature.tileDecayEnabled.*`.

---

## Phase 1 — Fix Fort (Quick Win, High Impact)

**Problem:** Engineer forts are built (the 10-min timer works) but `isFort` is never checked in combat and there's no visual on the map.

### Task list

- [ ] **Backend: `GameplayService.cs`** — In the attack calculation, check `targetCell.IsFort` and add +1 to the defender's effective troop count (same pattern as the existing `IsFortified` check).
- [ ] **Frontend: hex tile component** — Render a fort icon (🏰 or SVG overlay) on tiles where `isFort === true`.
- [ ] **Frontend: Engineer hex overlay** — While `engineerBuiltAt` is set but `isFort` is still `false`, show a circular progress ring on the Engineer's current hex. Derive `progress = (now - engineerBuiltAt) / 600000` (600 000 ms = 10 min). Implement as a CSS `conic-gradient` mask.

---

## Phase 2 — Host Role Management

**Problem:** The lobby only exposes self-selection. The host has no way to assign roles to other players or distribute them fairly.

### New backend surface

```
AssignPlayerRole(roomCode, hostId, targetPlayerId, role)
RandomizeRoles(roomCode, hostId)
```

`RandomizeRoles` shuffles the four roles (Commander, Scout, Defender, Engineer) across connected players in round-robin order. Players beyond the 4th role receive `None`.

### Task list

- [ ] **Backend: `LobbyService.cs`** — Add `AssignPlayerRole(string roomCode, string hostId, string targetPlayerId, string role)`: validate caller is host, validate target is in room, set `player.Role`.
- [ ] **Backend: `LobbyService.cs`** — Add `RandomizeRoles(string roomCode, string hostId)`: shuffle roles across connected players round-robin.
- [ ] **Backend: `GameHub.Lobby.cs`** — Expose `AssignPlayerRole(string targetPlayerId, string role)` and `RandomizeRoles()` hub methods, both guarded by host check.
- [ ] **Frontend: `TeamsStep.tsx`** — When `isHost === true`, each `PlayerRow` becomes a `HostPlayerRoleRow` with a role dropdown. Add "🎲 Randomize Roles" button next to the existing "Distribute Players" button.
- [ ] **Frontend: hooks** — Add `handleAssignPlayerRole(targetPlayerId, role)` and `handleRandomizeRoles()` to `useGameActionsLobby`.
- [ ] **i18n** — Add `wizard.assignRole`, `wizard.randomizeRoles`, `wizard.randomizeRolesDesc` keys.

---

## Phase 2b — Lock CommandoRaid to Scout Role

**Problem:** Any player can currently activate CommandoRaid regardless of role.

### Task list

- [ ] **Backend: `AbilityService.ActivateCommandoRaid`** — After the `PlayerRolesEnabled` check, add: `if (player.Role != PlayerRole.Scout) return (null, "Commando raids can only be performed by Scouts.");`
- [ ] **Frontend: `AbilityBar.tsx`** — Only render the Commando Raid button when `player.role === 'Scout'`.

---

## Phase 3 — New Active Role Abilities

**Problem:** All roles are passive. Players have no agency and don't feel the impact of their role.

### New player state fields (backend)

Following the existing `CommandoRaid` pattern in `GameState.cs / PlayerDto`:

```csharp
// Commander
public bool TacticalStrikeActive { get; set; }
public DateTime? TacticalStrikeExpiry { get; set; }
public DateTime? TacticalStrikeCooldownUntil { get; set; }
// Commander
public DateTime? ReinforceCooldownUntil { get; set; }
// Defender
public bool ShieldWallActive { get; set; }
public DateTime? ShieldWallExpiry { get; set; }
public DateTime? ShieldWallCooldownUntil { get; set; }
// Engineer
public DateTime? EmergencyRepairCooldownUntil { get; set; }
public bool DemolishActive { get; set; }
public string? DemolishTargetKey { get; set; }
public DateTime? DemolishStartedAt { get; set; }
public DateTime? DemolishCooldownUntil { get; set; }
```

### Task list

**Backend**

- [ ] `GameState.cs / PlayerDto` — Add all new per-player ability state fields above.
- [ ] `AbilityService.cs` — Add `ActivateTacticalStrike`, `ActivateReinforce` (Commander), `ActivateShieldWall` (Defender), `ActivateEmergencyRepair`, `StartDemolish` (Engineer). Each validates the player's role before proceeding.
- [ ] `GameplayService.cs` (attack calc) — Check `player.TacticalStrikeActive`: if true, skip fort and fortification defense bonuses. Clear flag after use.
- [ ] `GameplayService.cs` (attack calc) — Check `targetCell` for a Defender with `ShieldWallActive` standing on it: require +2 extra attacker troops.
- [ ] `GameplayService.cs` (`UpdatePlayerLocation`) — While `player.DemolishActive`, check if player has been standing on the target hex for ≥2 min. If so, set `targetCell.IsFort = false`, clear demolish state, append event log entry.
- [ ] `GameHub.Gameplay.cs` — Expose new hub methods: `ActivateTacticalStrike`, `ActivateReinforce`, `ActivateShieldWall`, `ActivateEmergencyRepair`, `StartDemolish`. Each guarded by correct role.

**Frontend**

- [ ] `game.ts / Player` — Add all new ability state fields to the `Player` interface.
- [ ] `AbilityBar.tsx` — Show only abilities matching `player.role`:
  - Commander: Tactical Strike + Reinforce buttons
  - Scout: Commando Raid button (existing)
  - Defender: Shield Wall button
  - Engineer: Emergency Repair + Demolish buttons
  - Beacon button: shown when `dynamics.beaconEnabled` regardless of role (the Beacon is a shared team tool, not role-locked)
- [ ] `useGameActionsAbilities.ts` — Add invoke handlers for all new hub methods.
- [ ] **i18n** — Add structured ability keys: `roles.{Role}.abilities.{name}.title`, `.description`, `.cooldown` for all new abilities in `en.ts` and `nl.ts`.

---

## Phase 4 — Role Explanation Modal (Lobby)

**Problem:** When a role is assigned or selected, players don't know what it does.

### UX design

After role confirmation in the lobby (self-select or host-assigned), show a dismissible modal:

```
🛡️ Defender
──────────────────────────────────────────
🔁  Presence Shield   (passive)
    Stand on your own hex — it regens twice as fast.

⚔️  Shield Wall       [ACTIVATE]  20 min cooldown
    Your current hex needs 2 extra troops to break
    while active (5 minutes).

🏃  Last Stand        (passive)
    If your hex is captured while you're here,
    you're rescued to the nearest friendly hex.
──────────────────────────────────────────
[ Got it! ]
```

### Task list

- [ ] **Frontend: `RoleModal.tsx`** (new component) — Full-screen/bottom-sheet modal. Props: `role: PlayerRole`, `onDismiss: () => void`. Renders three ability cards per role using i18n keys.
- [ ] **Frontend: `TeamsStep.tsx`** — Show `RoleModal` when `me.role` changes from `None` to any role.
- [ ] **Frontend: `GuestWizardView.tsx`** — Same trigger for guest players.
- [ ] **i18n** — Add `roles.{Role}.title`, `roles.{Role}.intro` (one sentence flavour text), and per-ability keys (reused from Phase 3).

---

## Phase 5 — Map Visual Effects

**Problem:** Ability effects are invisible on the map. Players can't tell if their ability is active, or if an enemy has activated one.

### Effect table

| Effect | Visual |
|--------|--------|
| **Fort built** | 🏰 icon at hex centre + darker/thicker hex border |
| **Fort under construction** | Semi-transparent progress ring (CSS `conic-gradient`) on Engineer's current hex |
| **Demolish in progress** | Red shrinking ring around the target fort hex |
| **Shield Wall active** | Blue shield icon on defended hex, visible to **all** players (enemies must see this to make tactical decisions) |
| **Tactical Strike active** | Golden glow on Commander's position dot + ⚡ floating badge |
| **Scout Commando Raid active** | Animated dashed arrow from Scout's position to target hex + red target ring + countdown timer |
| **Reinforce used** | Green "+3" number splash + brief pulse on the hex |
| **Emergency Repair used** | Green "+3" number splash on the hex |
| **First Visit Bonus** | Brief "+2" ripple on the nearest owned tile |
| **Beacon active** | Pulsing ring centred on beacon position |

### Implementation approach

1. **Static overlays** (forts, Shield Wall): flag on `HexCell` → render as absolutely-positioned icon/SVG layer in the hex tile component.
2. **Timed pulsing effects** (Tactical Strike, Beacon): CSS `@keyframes` animation class applied to the player dot when the relevant player state flag is `true`.
3. **Animated progress rings** (fort construction, demolish): derive `progress` from timestamps sent in player state → CSS `conic-gradient` mask.
4. **Pop-up numbers** (+2, +3): short-lived React state driven by new event log entry types → absolute positioned, fades out in 1.5 s via CSS animation.

### Task list

- [ ] **Frontend: hex tile component** — Add `isFort` icon layer + `shieldWallActive` icon layer (conditionally shown for defender's current hex).
- [ ] **Frontend: hex tile component** — Add construction progress ring for Engineer's current hex when `engineerBuiltAt` is set.
- [ ] **Frontend: hex tile component** — Add demolish progress ring when `player.demolishActive && player.demolishTargetKey === thisHexKey`.
- [ ] **Frontend: player dot component** — Add Tactical Strike glow + ⚡ badge when `player.tacticalStrikeActive`.
- [ ] **Frontend: map overlay layer** — Render commando raid arrow + target ring when `player.isCommandoActive`.
- [ ] **Frontend: troop-count splash component** (new) — Short-lived "+N" overlay triggered by event log entries (`ScoutFirstVisitBonus`, `EmergencyRepair`, `Reinforce`, `CommandoRaidSuccess`).
- [ ] **Backend: `GameplayService.cs`** — Append `ScoutFirstVisitBonus` event log entry when +2 troops are awarded (currently fires silently).

---

## Phase 6 — Ability Button UX

**Problem:** Ability buttons in `AbilityBar` are opaque. Players don't know what an ability does until they accidentally press it.

### UX design

Each button pill in `AbilityBar`:
- Role-coloured icon + ability name
- State label: "Activate" / "Active (3:22)" / "Cooldown (14:08)"
- Single-line subtitle below the button: *"Ignores forts on next attack"*
- Pulse animation while active
- Long-press or `?` icon → bottom-sheet with full description (reuses `RoleModal` ability card layout)

### Task list

- [ ] **Frontend: `AbilityBar.tsx`** — Add subtitle text below each pill using `roles.{Role}.abilities.{name}.shortDesc` i18n key.
- [ ] **Frontend: `AbilityBar.tsx`** — Add pulse CSS animation while ability is in active (not cooldown) state.
- [ ] **Frontend: `AbilityInfoSheet.tsx`** (new) — Bottom-sheet shown on long-press of any ability pill. Uses same ability card layout as `RoleModal`.
- [ ] **i18n** — Add `roles.{Role}.abilities.{name}.shortDesc` (≤6 words) for all abilities.

---

## Phase 7 — Rules Page Per-Role Cards

**Problem:** The `GameRulesPage` shows a single generic text blob for roles, not actionable information.

### Task list

- [ ] **Frontend: `GameRulesPage.tsx`** — Replace the `rules.roles.body` i18n text blob with a per-role card loop. Each card shows: emoji, role name, 3 ability rows (icon + name + one-line description).
- [ ] **Frontend: `GameRulesPage.tsx`** — Only show the roles section when `dynamics.playerRolesEnabled` (existing guard stays).
- [ ] **i18n** — Remove `rules.roles.body`. The per-role card loop reuses `roles.{Role}.abilities.{name}.description` keys from Phase 3.

---

## Priority Reference

| Priority | Phase | Work item | Effort |
|----------|-------|-----------|--------|
| 🔴 P0 | 0 | Remove CopresenceMode system | Large |
| 🔴 P0 | 1 | Fix fort defense bonus + map icon | Small |
| 🔴 P0 | 1 | Engineer build progress ring | Small |
| 🟠 P1 | 2 | Host assign roles + randomize | Medium |
| 🟠 P1 | 2b | Lock CommandoRaid to Scout | Small |
| 🟡 P2 | 3 | New active abilities (Tactical Strike, Shield Wall, Emergency Repair, Demolish) | Large |
| 🟡 P2 | 4 | Role explanation modal in lobby | Medium |
| 🟢 P3 | 5 | Map visual effects for all abilities | Medium |
| 🟢 P3 | 6 | Ability button subtitles + in-game help sheet | Small |
| 🟢 P3 | 7 | Rules page per-role card layout | Small |
