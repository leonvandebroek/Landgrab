# Tricorder Enemy Visibility Code Mapping

## Purpose

This document maps the finalized enemy-visibility doctrine onto the current Landgrab codebase.

It identifies:

- the current backend broadcast and snapshot spine,
- the current frontend state-ingress and render spine,
- which existing files already own related behavior,
- where the enemy-visibility system naturally belongs,
- and which parts of the current contract are still too omniscient for the intended design.

This is a code-mapping document, not an implementation plan.

## Current backend state and broadcast spine

The live alliances game currently flows through this backend path:

- `backend/Landgrab.Api/Models/GameState.cs`
- `backend/Landgrab.Api/Models/HexCell.cs`
- `backend/Landgrab.Api/Services/GameStateCommon.cs`
- `backend/Landgrab.Api/Services/GameStateService.cs`
- `backend/Landgrab.Api/Services/GameService.cs`
- `backend/Landgrab.Api/Services/DerivedMapStateService.cs`
- `backend/Landgrab.Api/Hubs/GameHub.cs`

## What each current backend piece owns

### `Models/GameState.cs`

Owns the main room payload shape that is currently sent to all clients.

Important currently-broadcast fields include:

- `Players`
- `Alliances`
- `ActiveRaids`
- `EventLog`
- `Grid`
- `ContestedEdges`
- `HostObserverMode`
- `Dynamics`

This is the main place where a future viewer-specific projection either:

- replaces the current universal room payload, or
- is wrapped by a new projected DTO.

### `Models/HexCell.cs`

Owns the current tile-level truth contract.

Important visibility-relevant fields already present:

- `OwnerId`
- `OwnerAllianceId`
- `OwnerName`
- `OwnerColor`
- `Troops`
- `IsMasterTile`
- `IsFortified`
- `EngineerBuiltAt`
- `IsFort`
- `SabotagedUntil`

This is currently a live-truth cell model, not a viewer-filtered cell model.

### `Services/GameStateCommon.cs`

Owns snapshot cloning through `SnapshotState(...)`.

It currently clones the full room state into a new `GameState`, including:

- all players,
- all alliances,
- full event log entries,
- full grid ownership and troop counts,
- active raids,
- host observer state,
- contested edges.

This is the strongest current code anchor for the fact that the backend still thinks in terms of one shared truth model.

### `Services/DerivedMapStateService.cs`

Owns map-derived enrichment currently attached after snapshotting.

Right now it only computes:

- `ContestedEdges`

This makes it the most natural existing anchor for additional derived viewer-safe map projection work, but today it is not viewer-aware.

### `Hubs/GameHub.cs`

Owns state broadcast.

Key methods:

- `BroadcastState(string roomCode, GameState state, string? aliasEvent = null)`
- `SendStateToCaller(GameState state)`

Current behavior:

- calls `derivedMapStateService.ComputeAndAttach(state)`
- sends the same `StateUpdated` payload to `Clients.Group(roomCode)`

This is the main backend choke point where omniscient group broadcast must eventually give way to viewer-specific projection.

## Current frontend ingress spine

The main frontend receive-and-dispatch path today is:

- `frontend/landgrab-ui/src/hooks/useSignalR.ts`
- `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`
- `frontend/landgrab-ui/src/utils/gameHelpers.ts`
- `frontend/landgrab-ui/src/stores/gameStore.ts`
- `frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`

## What each current frontend ingress piece owns

### `hooks/useSignalR.ts`

Owns SignalR event subscriptions.

Important visibility-relevant subscriptions:

- `StateUpdated`
- `PlayersMoved`
- `CombatResult`
- `GameOver`
- `TileLost`
- `DrainTick`
- `HostMessage`

This hook is transport-only; it does not currently understand hostile visibility tiers.

### `hooks/useSignalRHandlers.ts`

Owns payload normalization and routing into stores/UI surfaces.

Important current behavior:

- `normalizeGameState(state, gameState)`
- `useGameStore.getState().setGameState(normalizedState)`
- `dispatchStateToLayers(normalizedState)`
- generates toasts from newly-arrived event-log entries
- routes combat results and tile-loss feedback into gameplay UI

This is the main frontend gate where projected viewer-specific state starts influencing all downstream UI.

### `utils/gameHelpers.ts`

Owns `normalizeGameState(...)`.

Current normalization is light:

- preserve previous `eventLog` if missing,
- ensure `dynamics` fallback.

It does not currently normalize any visibility tiers, remembered values, or hidden-state markers.

### `stores/gameStore.ts`

Owns the canonical `gameState` in the client.

Important detail:

- `setGameState(...)` preserves previous grid object identity when cells are unchanged.

This means any future projected hex model should remain structurally stable enough to avoid unnecessary render churn.

### `hooks/useMapOrchestrator.ts`

Owns dispatch to derived visual stores.

Current behavior:

- writes `contestedEdges` into `effectsStore`
- writes `players` into `playerLayerStore`
- derives troop-movement effects from grid diffs

This is a critical fan-out point: if hostile players or hostile tile truth are not filtered before here, downstream visual layers will remain omniscient.

## Current frontend render spine

The main visible map/UI path today is:

- `frontend/landgrab-ui/src/components/map/GameMap.tsx`
- `frontend/landgrab-ui/src/components/map/layers/GameOverlayLayer.tsx`
- `frontend/landgrab-ui/src/components/map/HexTile.tsx`
- `frontend/landgrab-ui/src/components/map/tricorderTileState.ts`
- `frontend/landgrab-ui/src/components/map/TroopBadge.tsx`
- `frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/WorldDimMask.tsx`
- `frontend/landgrab-ui/src/components/map/HexTooltipOverlay.tsx`
- `frontend/landgrab-ui/src/components/game/TileInfoCard.tsx`
- `frontend/landgrab-ui/src/components/game/GameEventLog.tsx`

## What each current render piece owns

### `GameMap.tsx`

Owns map-wide orchestration.

Important visibility-relevant responsibilities:

- pushes `currentHexKey` and `selectedHexKey` into `gameplayStore`
- pushes players into `playerLayerStore`
- pushes contested edges into `effectsStore`
- mounts `GameOverlayLayer`, `PlayerLayer`, `HexTooltipOverlay`, and optionally `WorldDimMask`

This is the top-level map surface that will consume a visibility-aware state, but it should not own hostile secrecy logic.

### `GameOverlayLayer.tsx`

Owns mounting per-tile renderers.

Important current responsibilities:

- mounts every `HexTile`
- passes `isCurrent` and `isSelected`
- draws selection and current overlays
- mounts `WorldDimMask`

This is a good place for map-wide visible/hidden presentation modes, but not for calculating hostile truth.

### `HexTile.tsx`

Owns tile-local semantic rendering.

Current responsibilities include:

- relation and ownership styling,
- raid overlay,
- contested overlay,
- regen-blocked indicator,
- structure glyphs,
- troop badge rendering,
- progress rings.

It currently consumes full `HexCell` truth and full `players` data through `deriveTileState(...)`.

This is the main tile surface that will eventually render:

- visible hostile truth,
- remembered hostile truth,
- hidden hostile absence.

### `tricorderTileState.ts`

Owns client-side per-tile derivation.

Current derived concepts include:

- `baseState`
- `relationState`
- `urgencyState`
- `progressState`
- `structureState`
- `chips`
- `badge`
- `regenBlocked`

Important current limitation:

- it derives tactical and urgency state directly from full `players`, `activeRaids`, and `grid`
- it has no concept of `visible`, `remembered`, or `hidden`

This is the best frontend anchor for presentation-layer visibility interpretation once the payload contract becomes viewer-safe.

### `TroopBadge.tsx`

Owns troop badge rendering.

Important current capability:

- already supports hidden troop presentation through `isForestBlind`
- renders `?` instead of exact count when `isForestBlind` is true

This is a strong existing anchor for remembered or concealed troop display.

### `PlayerLayer.tsx`

Owns player and beacon rendering.

Current responsibilities:

- render player markers from `playerLayerStore.players`
- render active beacon markers
- render beacon radius circles
- cluster players by hex

Important current limitation:

- it renders from the full player list
- it renders visible beacon circles from the full player list
- it does not distinguish visible hostile players from hidden hostile players

This is the main frontend anchor for hostile-player and hostile-beacon filtering effects.

### `WorldDimMask.tsx`

Owns the map-wide dimming mask outside the active game grid.

It currently does not represent hostile fog-of-war; it represents a world or grid mask.

This is useful as a visual precedent for map-wide visibility treatments, but not as the actual hostile-visibility engine.

### `HexTooltipOverlay.tsx`

Owns hover and tap tooltip disclosure.

Important current behavior:

- reads hovered `HexCell` directly from grid
- shows exact troop counts
- shows owner name
- shows fort/master status
- shows contested state

This is currently a side-channel risk surface if hostile tile payloads remain omniscient.

### `TileInfoCard.tsx`

Owns selected tile detail disclosure.

Important current behavior:

- re-derives tile state via `deriveTileState(...)`
- shows exact owner name
- shows exact troop counts
- shows sabotage/demolish/rally state
- shows regen-blocked countdown
- shows reachability state

This is another key side-channel surface that must stay consistent with tile visibility tier.

### `GameEventLog.tsx`

Owns event-log rendering.

It currently renders whatever `eventLog` arrives in `GameState`.

This means event secrecy is a backend contract problem first, not just a frontend rendering problem.

## Mapping the enemy-visibility doctrine onto current code

## 1. Viewer-specific projection boundary

### Projection boundary anchors

Backend:

- `GameHub.BroadcastState(...)`
- `GameHub.SendStateToCaller(...)`
- `GameStateCommon.SnapshotState(...)`
- `GameStateService.SnapshotState(...)`
- `GameService.SnapshotStatePublic(...)`

### Projection boundary mapping

This doctrine belongs first at the backend projection boundary.

The codebase currently has a single shared-state snapshot model.

The visibility system should conceptually sit between:

- room-state mutation,
- and SignalR broadcast.

### Projection boundary limitation

No existing method currently accepts a viewer identity when shaping `GameState`.

That means this is the main area where new viewer-aware projection logic will have to attach.

## 2. Hex visibility tier mapping

### Hex visibility anchors

Backend:

- `Models/GameState.cs`
- `Models/HexCell.cs`
- `Services/DerivedMapStateService.cs`

Frontend:

- `types/game.ts`
- `components/map/tricorderTileState.ts`
- `components/map/HexTile.tsx`
- `components/game/TileInfoCard.tsx`

### Hex visibility mapping

The spec's three hostile visibility tiers map naturally to tile-level projected state.

Today, `HexCell` is a live-truth cell model.

A future visibility-aware mapping will need either:

- a projected hex DTO,
- explicit visibility fields attached to each outgoing hex,
- or a parallel visibility projection map keyed by hex key.

### Hex visibility limitation

No current backend or frontend hex contract contains fields such as:

- `visibilityTier`
- `isRemembered`
- `lastKnownOwner...`
- `lastKnownTroops`
- `hiddenReason`

## 3. Ownership memory mapping

### Ownership memory anchors

- `HexCell.OwnerId`
- `HexCell.OwnerAllianceId`
- `HexCell.OwnerName`
- `HexCell.OwnerColor`
- `HexTile.tsx`
- `TileInfoCard.tsx`
- `HexTooltipOverlay.tsx`

### Ownership memory mapping

Ownership is already deeply wired into the tile render path.

This is good news: remembered ownership likely maps onto the same presentation surfaces, but with:

- remembered value fields,
- remembered styling,
- and no assumption that current hostile ownership is always known.

### Ownership memory limitation

All ownership values currently read as live truth.

## 4. Troop memory and hidden-strength mapping

### Troop memory anchors

Backend:

- `HexCell.Troops`

Frontend:

- `TroopBadge.tsx`
- `HexTile.tsx`
- `TileInfoCard.tsx`
- `HexTooltipOverlay.tsx`

### Troop memory mapping

The stale troop-memory rule maps naturally onto existing badge and detail surfaces.

`TroopBadge.tsx` already contains a hidden-strength affordance via `isForestBlind`, which makes it the best existing badge-level anchor for:

- unknown hostile troop counts,
- remembered hostile troop counts with stale styling,
- or mixed live/remembered badge presentation.

### Troop memory limitation

Current tile and detail surfaces still consume `cell.troops` as live truth.

## 5. Enemy player sighting mapping

### Enemy player sighting anchors

Backend:

- `PlayerDto.CurrentLat`
- `PlayerDto.CurrentLng`
- `PlayerDto.CurrentHexQ`
- `PlayerDto.CurrentHexR`
- `GameState.Players`

Frontend:

- `PlayerLayer.tsx`
- `useMapOrchestrator.ts`
- `usePlayerLayerStore`

### Enemy player sighting mapping

The spec's hostile player visibility rules map directly onto `players` projection.

`PlayerLayer.tsx` is the actual marker renderer, but the secrecy boundary must be enforced before players are dispatched into `playerLayerStore`.

### Enemy player sighting limitation

`PlayersMoved` and `StateUpdated` both keep hostile player movement broadly available to the client if the backend sends it.

## 6. Beacon / reveal-source mapping

### Beacon visibility anchors

Backend:

- `PlayerDto.IsBeacon`
- `PlayerDto.BeaconLat`
- `PlayerDto.BeaconLng`
- `GameDynamics.BeaconEnabled`

Frontend:

- `PlayerLayer.tsx`
- `PlayerHUD.tsx`
- `types/game.ts`

### Beacon visibility mapping

The hostile beacon doctrine maps onto the player projection path, not just tile rendering.

`PlayerLayer.tsx` currently renders:

- beacon marker,
- beacon radius circle.

Under the new doctrine, hostile viewers should only receive enough projected data to render:

- current visible hostile beacon marker,
- remembered hostile beacon location when allowed,
- and never the hidden live radius truth.

### Beacon visibility limitation

The current player payload is rich enough for full hostile beacon rendering.

## 7. Tactical hostile operation mapping

### Tactical operation anchors

Backend:

- `GameState.ActiveRaids`
- player sabotage fields in `PlayerDto`
- player demolish fields in `PlayerDto`
- player rally fields in `PlayerDto`
- `HexCell.SabotagedUntil`

Frontend:

- `tricorderTileState.ts`
- `HexTile.tsx`
- `TileInfoCard.tsx`
- `PlayerHUD.tsx`

### Tactical operation mapping

The tactical-operation doctrine maps onto multiple existing sources:

- raid state is game-level,
- sabotage/demolish/rally state is currently player-level,
- regen-block state is currently tile-level.

`tricorderTileState.ts` is the best frontend anchor for deciding whether any of those operations should produce a visible tile overlay.

### Tactical operation limitation

Because the frontend currently receives full player and raid state, it can derive hostile tactical state even when the intended doctrine says it should not.

## 8. Event secrecy mapping

### Event secrecy anchors

Backend:

- `GameState.EventLog`
- `GameStateCommon.AppendEventLog(...)`
- `GameStateCommon.SnapshotState(...)`
- hub events in `GameHub.cs`

Frontend:

- `useSignalRHandlers.ts`
- `GameEventLog.tsx`
- `InfoLedgeStore` toasts sourced from new event-log entries

### Event secrecy mapping

The doctrine's event-filtering rules map to backend event projection first.

Frontend surfaces currently treat incoming events as authoritative and displayable.

This means the safe place to enforce enemy-event secrecy is:

- before `EventLog` is snapshotted for a viewer,
- before event-driven toasts are emitted from viewer-visible state.

### Event secrecy limitation

There is no current event visibility tier or event projection model.

## 9. Observer-mode mapping

### Observer-mode anchors

Backend:

- `GameState.HostObserverMode`

Frontend:

- `types/game.ts`
- `GameMap.tsx`
- `WorldDimMask.tsx`

### Observer-mode mapping

Observer-mode exception already has a state flag in the contract.

That makes it the natural discriminator for:

- full omniscient host view,
- versus viewer-filtered normal player view.

### Observer-mode limitation

The current codebase already sends omniscient state broadly, so observer mode is not yet a meaningful separation boundary.

## 10. Frontend normalization and compatibility mapping

### Normalization anchors

- `normalizeGameState(...)`
- `useGameStore.setGameState(...)`
- `useMapOrchestrator.dispatchStateToLayers(...)`

### Normalization mapping

Once viewer-specific payloads exist, these files become the main compatibility layer for:

- preserving structural stability,
- defaulting optional projection fields,
- and preventing older surfaces from assuming hidden hostile data still exists.

### Normalization limitation

The current normalization layer is intentionally minimal and does not yet interpret visibility-aware contracts.

## What is already reusable

The current codebase already contains several reusable foundations for the visibility system:

### Backend reuse

- `GameStateCommon.SnapshotState(...)` as the current snapshot boundary
- `DerivedMapStateService` as the current derived-map attachment point
- `GameHub.BroadcastState(...)` as the current broadcast choke point

### Frontend reuse

- `TroopBadge.tsx` hidden-strength affordance via `isForestBlind`
- `tricorderTileState.ts` as the tile-semantic projection layer
- `PlayerLayer.tsx` as the hostile player / beacon render surface
- `HexTile.tsx` as the main hostile tile renderer
- `TileInfoCard.tsx` and `HexTooltipOverlay.tsx` as detail surfaces that must remain visibility-consistent
- `GameEventLog.tsx` as the main event-log surface
- `WorldDimMask.tsx` as a precedent for map-wide visibility treatments

## Where the current contract is too omniscient

The following current payload regions are too rich for the intended hostile-visibility doctrine when sent unchanged to ordinary enemy players:

- `GameState.Players`
- `GameState.EventLog`
- `GameState.ActiveRaids`
- `GameState.Grid[*].Troops`
- `GameState.Grid[*].Owner...` fields when a tile should be hidden rather than remembered
- hostile beacon coordinates in player state
- hostile sabotage/demolish/rally state in player state

## Best code anchors for the enemy-visibility system

If you want one short mapping summary, the most important code anchors are:

### Backend anchors

- `backend/Landgrab.Api/Hubs/GameHub.cs`
- `backend/Landgrab.Api/Services/GameStateCommon.cs`
- `backend/Landgrab.Api/Services/DerivedMapStateService.cs`
- `backend/Landgrab.Api/Models/GameState.cs`
- `backend/Landgrab.Api/Models/HexCell.cs`

### Frontend ingress anchors

- `frontend/landgrab-ui/src/hooks/useSignalR.ts`
- `frontend/landgrab-ui/src/hooks/useSignalRHandlers.ts`
- `frontend/landgrab-ui/src/stores/gameStore.ts`
- `frontend/landgrab-ui/src/utils/gameHelpers.ts`
- `frontend/landgrab-ui/src/hooks/useMapOrchestrator.ts`

### Frontend render anchors

- `frontend/landgrab-ui/src/components/map/GameMap.tsx`
- `frontend/landgrab-ui/src/components/map/layers/GameOverlayLayer.tsx`
- `frontend/landgrab-ui/src/components/map/HexTile.tsx`
- `frontend/landgrab-ui/src/components/map/tricorderTileState.ts`
- `frontend/landgrab-ui/src/components/map/TroopBadge.tsx`
- `frontend/landgrab-ui/src/components/map/layers/PlayerLayer.tsx`
- `frontend/landgrab-ui/src/components/map/HexTooltipOverlay.tsx`
- `frontend/landgrab-ui/src/components/game/TileInfoCard.tsx`
- `frontend/landgrab-ui/src/components/game/GameEventLog.tsx`

## Final mapping statement

In the current codebase, enemy visibility is not primarily a styling problem.

It is a projection problem that begins at the backend snapshot and
broadcast boundary, passes through the frontend SignalR ingestion layer,
and only then fans out into tile, player, tooltip, info-card, and
event-log surfaces.

The codebase already has strong render anchors for visible, remembered,
and hidden hostile intel, but it does not yet have a viewer-specific
contract that limits what truth reaches those renderers in the first
place.
