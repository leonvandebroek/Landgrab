# Pluggable Abilities & Roles Architecture Spec
*Author: Rembrandt | Date: 2026-03-25*

---

## Executive Summary

`AbilityService.cs` (1331 LOC) and the frontend ability wiring in `App.tsx` / `PlayingHud.tsx` are both monoliths: adding a new ability currently requires surgery across 6+ files on each side. This spec defines a **role-scoped service split** on the backend and an **ability registry** on the frontend that together reduce new-ability friction to 2–4 targeted files, with zero changes required in `GameHub`, `GameView`, or `App.tsx`.

---

## Design Decisions

1. **Abstract base class, not interface.** `RoleAbilityServiceBase` is an `abstract class` rather than a `IRoleAbilityService` interface. The private helpers shared across all ability logic (`GetRoom`, `TryGetCurrentHex`, `IsFriendlyCell`, `SnapshotState`, etc.) need concrete implementation, not just a contract. A thin `IRoleAbilityService` marker interface is still applied to all concrete services to enable DI enumeration in future tooling.

2. **Explicit facade delegation, not runtime role lookup.** `GameService` delegates to each concrete service by name (`_commanderService.ActivateTacticalStrike(…)`), not via a `Dictionary<PlayerRole, IRoleAbilityService>`. The role→service mapping is self-evident from the method name. Runtime dictionary lookup would require a polymorphic `Execute(…)` interface that is impossible to type-safely define across heterogeneous method signatures.

3. **Role-agnostic abilities live in `SharedAbilityService`.** `TroopTransfer` and `FieldBattle` are not gated on a role and are currently scattered through `AbilityService`. They belong in `SharedAbilityService` alongside any future role-agnostic abilities.

4. **Role-progress tracking moves to `RoleProgressService`.** `UpdateSabotageProgress`, `UpdateDemolishProgress`, and fort construction invalidation logic are called from `GameplayService.UpdatePlayerLocation` (every movement tick). They belong to the Engineer's domain but are triggered by a non-ability code path. A dedicated `RoleProgressService` carries them; `GameplayService` takes it as a constructor parameter and calls it from the movement tick. `EngineerAbilityService` uses the same service to start/cancel progress. This is the only cross-service dependency added.

5. **Frontend registry is metadata-only; card rendering stays explicit.** The `abilityRegistry` stores role membership, hub method name, i18n key, and map focus preset per ability. `PlayingHud` uses the registry for **role-based button/card visibility** and for dispatching to a static card import map. Cards are **not** dynamically imported from the registry — TypeScript static analysis is preserved. Adding a new ability requires: one registry entry, one card component, one line in `PlayingHud`'s card import map (a deliberate single-file change that keeps traceability).

6. **Standard `AbilityCardProps` eliminates prop-drill through `App.tsx`.** Each card component accepts a single shared interface (`AbilityCardProps`). Cards already read game state from Zustand stores directly; the only injected prop they need is `invoke`. `PlayingHud` receives `invoke` as a new prop (one-time addition). `App.tsx` and `GameView.tsx` pass `invoke` as a single opaque value — no per-ability callback drilling thereafter.

7. **`useGameActionsAbilities` is reduced to a single `createAbilityHandler` factory.** The 19 copy-pasted try/catch blocks collapse into one generic factory. Existing hook API surface is preserved so existing card consumers don't break during migration.

---

## Backend Architecture

### Abstract Base + Marker Interface

```csharp
/// <summary>Marker interface enabling DI enumeration of all role ability services.</summary>
public interface IRoleAbilityService { }

/// <summary>
/// Provides shared helpers for all role ability service implementations.
/// Concrete services inherit this to avoid duplicating room-access and state-snapshot boilerplate.
/// </summary>
public abstract class RoleAbilityServiceBase(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService) : IRoleAbilityService
{
    protected GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    protected static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    protected static void AppendEventLog(GameState state, GameEventLogEntry entry) =>
        GameStateCommon.AppendEventLog(state, entry);
    protected void QueuePersistence(GameRoom room, GameState snapshot) =>
        gameStateService.QueuePersistence(room, snapshot);

    protected static bool TryGetCurrentHex(GameState state, PlayerDto player, out HexCell cell)
    {
        cell = null!;
        if (!GameplayService.TryGetCurrentHex(state, player, out var q, out var r))
            return false;
        return state.Grid.TryGetValue(HexService.Key(q, r), out cell!) && cell is not null;
    }

    protected static bool IsFriendlyCell(PlayerDto player, HexCell cell) =>
        GameplayService.IsFriendlyCell(player, cell);

    protected static bool TryGetPlayerPosition(
        GameState state, PlayerDto player,
        out int q, out int r, out double lat, out double lng)
    {
        // … extracted from current AbilityService.TryGetPlayerPosition …
    }

    protected static (int targetQ, int targetR)? ResolveClosestAdjacentHex(
        GameState state, PlayerDto player, double heading)
    {
        // … extracted from current AbilityService.ResolveClosestAdjacentHex …
    }
}
```

### Concrete Services

#### `CommanderAbilityService`
Owns: `ResolveRaidTarget`, `ActivateCommandoRaid`, `ResolveTacticalStrikeTarget`, `ActivateTacticalStrike`, `ActivateRallyPoint`.

```csharp
public sealed class CommanderAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService)
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    public ((int q, int r)? target, string? error) ResolveRaidTarget(string roomCode, string userId, double heading) { … }
    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId) { … }
    public ((int q, int r)? target, string? error) ResolveTacticalStrikeTarget(string roomCode, string userId, double heading) { … }
    public (GameState? state, string? error) ActivateTacticalStrike(string roomCode, string userId, int targetQ, int targetR) { … }
    public (GameState? state, string? error) ActivateRallyPoint(string roomCode, string userId) { … }
}
```

#### `ScoutAbilityService`
Owns: `ActivateBeacon`, `DeactivateBeacon`, `ShareBeaconIntel`, `AttemptIntercept`.

```csharp
public sealed class ScoutAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    VisibilityService visibilityService)
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId, double heading) { … }
    public (GameState? state, string? error) DeactivateBeacon(string roomCode, string userId) { … }
    public (int sharedCount, string? error) ShareBeaconIntel(string roomCode, string userId) { … }
    public (InterceptAttemptResult? result, string? error) AttemptIntercept(string roomCode, string userId, double heading) { … }
}
```

#### `EngineerAbilityService`
Owns: `StartFortConstruction`, `CancelFortConstruction`, `ActivateSabotage`, `CancelSabotage`, `StartDemolish`, `CancelDemolish`.

```csharp
public sealed class EngineerAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    RoleProgressService roleProgressService)   // ← shared progress tracker
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    public (GameState? state, string? error) StartFortConstruction(string roomCode, string userId) { … }
    public (GameState? state, string? error) CancelFortConstruction(string roomCode, string userId) { … }
    public (GameState? state, string? error) ActivateSabotage(string roomCode, string userId) { … }
    public (GameState? state, string? error) CancelSabotage(string roomCode, string userId) { … }
    public (GameState? state, string? error) StartDemolish(string roomCode, string userId) { … }
    public (GameState? state, string? error) CancelDemolish(string roomCode, string userId) { … }
}
```

#### `SharedAbilityService`
Owns: `ResolveTroopTransferTarget`, `InitiateTroopTransfer`, `RespondToTroopTransfer`, `InitiateFieldBattle`, `JoinFieldBattle`, `ResolveFieldBattle`. (Role-agnostic abilities available to all players.)

```csharp
public sealed class SharedAbilityService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    IHubContext<GameHub> hubContext)
    : RoleAbilityServiceBase(roomProvider, gameStateService)
{
    public ((string id, string name)? target, string? error) ResolveTroopTransferTarget(…) { … }
    public (Guid? transferId, string? error) InitiateTroopTransfer(…) { … }
    public (GameState? state, string? error) RespondToTroopTransfer(…) { … }
    public (ActiveFieldBattle? battle, string? error) InitiateFieldBattle(…) { … }
    public string? JoinFieldBattle(…) { … }
    public (GameState? state, FieldBattleResultDto? result, string? error) ResolveFieldBattle(…) { … }
}
```

### `RoleProgressService`

Extracted from `GameplayService`. Called by both `GameplayService` (movement tick) and `EngineerAbilityService` (ability start/cancel).

```csharp
/// <summary>
/// Evaluates per-player Engineer role progress on every movement tick.
/// Invalidates Fort Construction, Sabotage, and Demolish missions when preconditions are violated.
/// </summary>
public sealed class RoleProgressService
{
    /// <returns>true if any hex grid cell changed state (triggers broadcast).</returns>
    public bool UpdateFortProgress(GameState state, PlayerDto player, string? currentHexKey) { … }
    public bool UpdateSabotageProgress(GameState state, PlayerDto player, string? currentHexKey) { … }
    public bool UpdateDemolishProgress(GameState state, PlayerDto player, string? currentHexKey) { … }
}
```

`GameplayService` constructor gains `RoleProgressService roleProgressService` and calls it from the movement-tick loop:

```csharp
gridChanged |= roleProgressService.UpdateFortProgress(room.State, player, currentHexKey);
gridChanged |= roleProgressService.UpdateSabotageProgress(room.State, player, currentHexKey);
gridChanged |= roleProgressService.UpdateDemolishProgress(room.State, player, currentHexKey);
```

### DI Registration

```csharp
// Program.cs — ability services block (add after existing singleton registrations)
builder.Services.AddSingleton<RoleProgressService>();
builder.Services.AddSingleton<CommanderAbilityService>();
builder.Services.AddSingleton<ScoutAbilityService>();
builder.Services.AddSingleton<EngineerAbilityService>();
builder.Services.AddSingleton<SharedAbilityService>();

// Remove: builder.Services.AddSingleton<AbilityService>();
```

All services are **singletons** — matching the existing pattern for all in-memory game state services.

### `GameService` Facade

`GameService` constructor replaces the single `AbilityService abilityService` parameter with the four new services:

```csharp
public class GameService(
    // … existing params …
    CommanderAbilityService commanderAbilityService,
    ScoutAbilityService scoutAbilityService,
    EngineerAbilityService engineerAbilityService,
    SharedAbilityService sharedAbilityService)
{
    // One-liner delegations — same signature surface as today:
    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId, double heading)
        => scoutAbilityService.ActivateBeacon(roomCode, userId, heading);

    public (GameState? state, string? error) ActivateTacticalStrike(string roomCode, string userId, int q, int r)
        => commanderAbilityService.ActivateTacticalStrike(roomCode, userId, q, r);

    public (GameState? state, string? error) StartFortConstruction(string roomCode, string userId)
        => engineerAbilityService.StartFortConstruction(roomCode, userId);

    public (Guid? transferId, string? error) InitiateTroopTransfer(string roomCode, string userId, int amount, string recipientId)
        => sharedAbilityService.InitiateTroopTransfer(roomCode, userId, amount, recipientId);

    // … etc. for all 20 ability methods …
}
```

`GameHub.Gameplay.cs` is **unchanged** — it calls `gameService.X(…)` exactly as today.

### Adding a New Ability (Backend)

1. Add method(s) to the relevant role's concrete service (e.g. `ScoutAbilityService.ActivateDecoy(…)`).
2. Add one delegation line to `GameService`.
3. Add one hub method to `GameHub.Gameplay.cs` that calls `gameService.ActivateDecoy(…)` and broadcasts state.
4. *(If the ability has movement-side-effects)* Add progress tracking in `RoleProgressService`.

**That is all.** No other files change.

### Adding a New Role (Backend)

1. Add value to `PlayerRole` enum.
2. Create `XxxAbilityService : RoleAbilityServiceBase` with the role's abilities.
3. Register `builder.Services.AddSingleton<XxxAbilityService>()`.
4. Inject into `GameService` and add delegation methods.
5. Add hub methods for each ability in `GameHub.Gameplay.cs`.

---

## Frontend Architecture

### `AbilityCardProps` — Standard Card Contract

All ability card components must implement this interface. Cards already read game state from Zustand stores directly; this is purely the prop surface `PlayingHud` needs to render any card.

```typescript
// src/types/abilities.ts  (append to existing file)

export type InvokeFn = <T = unknown>(method: string, ...args: unknown[]) => Promise<T | undefined>;

export interface AbilityCardProps {
  /** The current user's ID — cards use this to find themselves in the player list from gameStore. */
  myUserId: string;
  /** SignalR invoke function — cards call hub methods directly with this. */
  invoke: InvokeFn | null;
}
```

Existing card components that currently receive specific callbacks (e.g. `onActivateCommandoRaid`) are updated to instead call `invoke('ActivateCommandoRaid')` directly. Cards already import from Zustand stores, so this is a mechanical substitution.

### `AbilityRegistry` Shape

```typescript
// src/config/abilityRegistry.ts

import type { AbilityKey, AbilityCardProps, MapFocusPreset } from '../types/abilities';

export type PlayerRoleValue = 'None' | 'Commander' | 'Scout' | 'Engineer';

export interface AbilityRegistryEntry {
  /** The SignalR hub method name that activates this ability. */
  hubMethod: string;
  /** Roles for which this ability's card and button should appear. Empty = role-agnostic (all roles). */
  roles: PlayerRoleValue[];
  /** i18n translation key for the ability title. */
  titleKey: string;
  /** Map focus mode when this ability is active. */
  mapFocusPreset: MapFocusPreset;
  /** The card component. Receives AbilityCardProps; reads all other state from stores. */
  Card: React.ComponentType<AbilityCardProps>;
}

export const abilityRegistry: Record<AbilityKey, AbilityRegistryEntry> = {
  beacon: {
    hubMethod: 'ActivateBeacon',
    roles: ['Scout'],
    titleKey: 'abilities.beacon.title',
    mapFocusPreset: 'localTracking',
    Card: BeaconCard,
  },
  shareIntel: {
    hubMethod: 'ShareBeaconIntel',
    roles: ['Scout'],
    titleKey: 'abilities.shareIntel.title',
    mapFocusPreset: 'none',
    Card: ShareIntelCard,
  },
  tacticalStrike: {
    hubMethod: 'ActivateTacticalStrike',
    roles: ['Commander'],
    titleKey: 'abilities.tacticalStrike.title',
    mapFocusPreset: 'strategicTargeting',
    Card: TacticalStrikeCard,
  },
  rallyPoint: {
    hubMethod: 'ActivateRallyPoint',
    roles: ['Commander'],
    titleKey: 'abilities.rallyPoint.title',
    mapFocusPreset: 'localTracking',
    Card: RallyPointCard,
  },
  commandoRaid: {
    hubMethod: 'ActivateCommandoRaid',
    roles: ['Commander'],
    titleKey: 'abilities.commandoRaid.title',
    mapFocusPreset: 'strategicTargeting',
    Card: CommandoRaidCard,
  },
  fortConstruction: {
    hubMethod: 'StartFortConstruction',
    roles: ['Engineer'],
    titleKey: 'abilities.fortConstruction.title',
    mapFocusPreset: 'localTracking',
    Card: FortConstructionCard,
  },
  sabotage: {
    hubMethod: 'ActivateSabotage',
    roles: ['Engineer'],
    titleKey: 'abilities.sabotage.title',
    mapFocusPreset: 'localTracking',
    Card: SabotageCard,
  },
  demolish: {
    hubMethod: 'StartDemolish',
    roles: ['Engineer'],
    titleKey: 'abilities.demolish.title',
    mapFocusPreset: 'localTracking',
    Card: DemolishCard,
  },
  intercept: {
    hubMethod: 'AttemptIntercept',
    roles: ['Scout'],
    titleKey: 'abilities.intercept.title',
    mapFocusPreset: 'localTracking',
    Card: InterceptCard,
  },
  troopTransfer: {
    hubMethod: 'InitiateTroopTransfer',
    roles: [],   // role-agnostic
    titleKey: 'abilities.troopTransfer.title',
    mapFocusPreset: 'none',
    Card: TroopTransferCard,
  },
  fieldBattle: {
    hubMethod: 'InitiateFieldBattle',
    roles: [],   // role-agnostic
    titleKey: 'abilities.fieldBattle.title',
    mapFocusPreset: 'none',
    Card: FieldBattleCard,
  },
};

/** Returns the abilities available to the given role (role-agnostic abilities always included). */
export function abilitiesForRole(role: PlayerRoleValue): AbilityKey[] {
  return (Object.keys(abilityRegistry) as AbilityKey[]).filter((key) => {
    const entry = abilityRegistry[key];
    return entry.roles.length === 0 || entry.roles.includes(role);
  });
}
```

### Registry Location

`src/config/abilityRegistry.ts` — imported by `PlayingHud`, `useGameActionsAbilities`, and `abilityUi.ts`.

### `PlayingHud` Integration

`PlayingHud` receives one new prop: `invoke: InvokeFn | null`. All per-ability callback props (`onActivateBeacon`, `onActivateTacticalStrike`, etc.) are **removed** from `PlayingHud`'s interface.

The ability card rendering block collapses from the current 13-branch if/else chain to:

```tsx
// In PlayingHud.tsx — replaces the entire abilityUi.activeAbility === '...' chain

{abilityUi.activeAbility !== null && abilityUi.cardVisible && (() => {
  const entry = abilityRegistry[abilityUi.activeAbility];
  if (!entry) return null;
  const { Card } = entry;
  return <Card myUserId={myUserId} invoke={invoke} />;
})()}
```

Role-based ability button visibility (the "which ability buttons to show in the HUD tray") uses `abilitiesForRole(me.role)` from the registry, replacing any hardcoded role checks in the tray.

### `useGameActionsAbilities` Integration

The 19 copy-pasted try/catch blocks collapse to a single factory:

```typescript
// src/hooks/useGameActionsAbilities.ts

function makeHandler<TArgs extends unknown[], TResult>(
  invoke: InvokeFn | null,
  setError: (msg: string) => void,
  method: string,
  fallback: TResult,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    if (!invoke) return fallback;
    try {
      return (await invoke<TResult>(method, ...args)) ?? fallback;
    } catch (error) {
      setError(String(error));
      return fallback;
    }
  };
}

export function useGameActionsAbilities({ invoke }: Pick<UseGameActionsOptions, 'invoke'>) {
  const setError = useUiStore((state) => state.setError);

  return useMemo(() => ({
    handleActivateBeacon:         makeHandler(invoke, setError, 'ActivateBeacon',           false),
    handleDeactivateBeacon:       makeHandler(invoke, setError, 'DeactivateBeacon',         false),
    handleShareBeaconIntel:       makeHandler(invoke, setError, 'ShareBeaconIntel',         0),
    handleActivateCommandoRaid:   makeHandler(invoke, setError, 'ActivateCommandoRaid',     false),
    resolveRaidTarget:            makeHandler(invoke, setError, 'ResolveRaidTarget',        null),
    handleActivateTacticalStrike: makeHandler(invoke, setError, 'ActivateTacticalStrike',   false),
    resolveTacticalStrikeTarget:  makeHandler(invoke, setError, 'ResolveTacticalStrikeTarget', null),
    resolveTroopTransferTarget:   makeHandler(invoke, setError, 'ResolveTroopTransferTarget',  null),
    handleInitiateTroopTransfer:  makeHandler(invoke, setError, 'InitiateTroopTransfer',    null),
    handleRespondToTroopTransfer: makeHandler(invoke, setError, 'RespondToTroopTransfer',   false),
    handleInitiateFieldBattle:    makeHandler(invoke, setError, 'InitiateFieldBattle',      null),
    handleJoinFieldBattle:        makeHandler(invoke, setError, 'JoinFieldBattle',          false),
    handleActivateRallyPoint:     makeHandler(invoke, setError, 'ActivateRallyPoint',       false),
    handleActivateSabotage:       makeHandler(invoke, setError, 'ActivateSabotage',         false),
    handleCancelFortConstruction: makeHandler(invoke, setError, 'CancelFortConstruction',   false),
    handleCancelSabotage:         makeHandler(invoke, setError, 'CancelSabotage',           false),
    handleCancelDemolish:         makeHandler(invoke, setError, 'CancelDemolish',           false),
    handleStartDemolish:          makeHandler(invoke, setError, 'StartDemolish',            false),
    handleStartFortConstruction:  makeHandler(invoke, setError, 'StartFortConstruction',    false),
    attemptIntercept:             makeHandler(invoke, setError, 'AttemptIntercept',         { status: 'noTarget' }),
  }), [invoke, setError]);
}
```

The **public API surface is identical** to today — no consumers break. `makeHandler` replaces the individual `useCallback` per method. The `useMemo` wrapping means the object is stable across renders when `invoke` and `setError` haven't changed.

> **Note on `attemptIntercept`:** The current implementation intentionally uses `console.warn` not `setError` on failure — this nuance can be encoded by adding an optional `onError` parameter to `makeHandler`, or by keeping `attemptIntercept` as a one-off explicit implementation.

### `abilityUi.ts` and `useSignalRHandlers.ts`

`deriveAbilityUiFromPlayer` in `abilityUi.ts` derives active ability state from `PlayerDto` fields (e.g. `fortTargetQ`, `sabotageTargetQ`). This logic is **not** registry-driven — it inspects concrete model fields. No changes needed for the registry introduction; add a new branch when a new ability with server-tracked state is introduced.

`useSignalRHandlers.ts` reconnect/resume sync is also model-field-driven and unaffected by the registry.

### Adding a New Ability (Frontend)

1. Add the `AbilityKey` union member to `src/types/abilities.ts`.
2. Create the card component in `src/components/game/abilities/YourAbilityCard.tsx` implementing `AbilityCardProps`.
3. Add one entry to `abilityRegistry` in `src/config/abilityRegistry.ts`.

**`PlayingHud`, `GameView`, `App.tsx` require zero changes.**

---

## Migration Notes

### Ordering

De Ruyter should complete backend changes first because:
1. `AbilityService` is the only service being split — no other backend domain is affected.
2. SignalR hub method names are unchanged; Vermeer's frontend doesn't depend on backend refactoring.
3. However, `RoleProgressService` extraction must happen atomically with `GameplayService` update — they cannot be split across two PRs or test failures will occur.

Recommended PR sequence for De Ruyter:
1. **PR 1**: Add `RoleProgressService`, update `GameplayService` to call it, delete duplicated methods from `GameplayService`.
2. **PR 2**: Add `RoleAbilityServiceBase` + four concrete services, move methods from `AbilityService`, update `GameService` delegations, update DI in `Program.cs`, delete `AbilityService.cs`.
3. After PR 2: confirm `dotnet test` passes (299 tests currently) before merging.

### Gotchas

**Backend:**
- `AbilityService` currently has ~15 private static helper methods (`ResolveClosestAdjacentHex`, `TryGetPlayerPosition`, `HasActiveSabotage`, etc.). These move verbatim into `RoleAbilityServiceBase` as protected static members. Do not duplicate them across concrete services.
- `ActivateShieldWall` returns `(null, "Shield Wall has been removed.")` — keep this as a stub in `CommanderAbilityService` and in `GameService` until the hub method is removed. Don't silently drop it.
- `GameplayService` currently holds fort-progress update logic split across `UpdateSabotageProgress` (line 1078), `UpdateDemolishProgress` (line 1138), and an inline fort-invalidation block (line 1282). All three move to `RoleProgressService`. Watch for the fort-invalidation block — it is NOT a named method currently; it's inline in a loop.

**Frontend:**
- `PlayingHud`'s current prop interface has ~74 props. The migration removes all per-ability callback props and adds a single `invoke` prop. Vermeer should update `GameView.tsx` to pass `invoke` down, and strip the per-ability props from the `PlayingHud` interface in a single PR. This is the largest churn point but is mechanical.
- Existing cards (`BeaconCard`, `CommandoRaidCard`, etc.) must be updated to accept `AbilityCardProps` (`myUserId` + `invoke`) and call `invoke(hubMethod, …)` directly instead of receiving callback props. Most cards already use Zustand stores for state — only the action callbacks need updating.
- `TroopTransferReceivedPanel` and `FieldBattleInvitePanel` are notification panels, not ability cards. They are **not** in the registry and continue to be rendered unconditionally in `PlayingHud` based on game state (active transfers/battles). Do not attempt to registry-ify them.
- `abilityUi.ts` `deriveAbilityUiFromPlayer` currently has explicit checks for `fortTargetQ`, `sabotageTargetQ`, `demolishTargetKey`, `activeRaids`, `activeTroopTransfers`, `activeFieldBattles`. These are model-field checks and are unaffected by the registry — they stay as-is.
- The `useMemo` in the new `useGameActionsAbilities` requires `invoke` and `setError` as stable references. Confirm `setError` from `useUiStore` is a stable store selector (it is, via Zustand).
