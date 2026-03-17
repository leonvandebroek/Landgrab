using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameplayService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    WinConditionService winConditionService)
{
    private const int BalancedCombatRounds = 3;
    private const double MinCombatHitProbability = 0.2;
    private const double MaxCombatHitProbability = 0.8;

    public sealed record DrainTickNotification(
        int q,
        int r,
        int troopsLost,
        string? allianceId,
        string? allianceName);

    public sealed record ReinforcementTickResult(
        GameState? state,
        string? error,
        IReadOnlyList<DrainTickNotification> drainTicks);

    private sealed record CombatStats(
        CombatMode CombatMode,
        int AttackerTroops,
        int DefenderTroops,
        int EffectiveAttack,
        int EffectiveDefence,
        double AttackerWinProbability,
        bool TacticalStrikeUsed,
        List<CombatBonusDetail> AttackerBonuses,
        List<CombatBonusDetail> DefenderBonuses,
        string DefenderName,
        string? DefenderAllianceName,
        string DefenderTerrainType);

    private sealed record CombatResolution(
        bool AttackerWon,
        int AttackerTroopsLost,
        int DefenderTroopsLost,
        int AttackerTroopsRemaining,
        int DefenderTroopsRemaining,
        int[] AttackDice,
        int[] DefendDice);

    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);
    private void QueuePersistenceIfGameOver(GameRoom room, GameState stateSnapshot, GamePhase previousPhase) => gameStateService.QueuePersistenceIfGameOver(room, stateSnapshot, previousPhase);

    public (GameState? state, string? error, bool gridChanged) UpdatePlayerLocation(string roomCode, string userId,
        double lat, double lng)
    {
        var error = ValidateCoordinates(lat, lng);
        if (error != null)
            return (null, error, false);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.", false);

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Player locations are only tracked while the game is playing.", false);

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.", false);

            var previousPhase = room.State.Phase;
            var gridChanged = false;
            SetPlayerLocation(room.State, player, lat, lng);

            if (room.State.Dynamics.PlayerRolesEnabled)
                gridChanged |= UpdateDemolishProgress(room.State, player);

            // ── Phase 3: Rally — update IsFortified for all hexes ──
            var ownedCells = room.State.Grid.Values
                .Where(c => c.OwnerId != null)
                .ToList();
            var previousFortifiedStates = ownedCells.ToDictionary(
                cell => HexService.Key(cell.Q, cell.R),
                cell => cell.IsFortified);

            foreach (var cell in ownedCells)
            {
                var playersInCell = GetPlayersInHex(room.State, cell.Q, cell.R);
                var alliedCount = playersInCell.Count(p =>
                    cell.OwnerAllianceId != null && p.AllianceId == cell.OwnerAllianceId);
                cell.IsFortified = alliedCount >= 2;
            }

            gridChanged |= ownedCells.Any(cell =>
                previousFortifiedStates[HexService.Key(cell.Q, cell.R)] != cell.IsFortified);

            // ── Phase 3: Shepherd — update LastVisitedAt for hexes player is in ──
            if (room.State.Dynamics.TileDecayEnabled)
            {
                foreach (var cell in room.State.Grid.Values.Where(c => c.OwnerId != null))
                {
                    if (HexService.IsPlayerInHex(lat, lng, cell.Q, cell.R,
                        room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters))
                    {
                        var isTeamMember = cell.OwnerId == userId
                            || (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId);
                        if (isTeamMember)
                        {
                            cell.LastVisitedAt = DateTime.UtcNow;
                            gridChanged = true;
                        }
                    }
                }
            }

            // Phase 4: Engineer — staying in own hex builds fort over time
            if (room.State.Dynamics.PlayerRolesEnabled && player.Role == PlayerRole.Engineer
                && room.State.HasMapLocation)
            {
                var engHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var engKey = HexService.Key(engHex.q, engHex.r);
                if (room.State.Grid.TryGetValue(engKey, out var engCell)
                    && (engCell.OwnerId == userId
                        || (player.AllianceId != null && engCell.OwnerAllianceId == player.AllianceId)))
                {
                    if (engCell.EngineerBuiltAt == null)
                    {
                        engCell.EngineerBuiltAt = DateTime.UtcNow;
                        gridChanged = true;
                    }

                    // Check if engineer has been building for ≥10 minutes
                    if (!engCell.IsFort && engCell.EngineerBuiltAt.HasValue
                        && (DateTime.UtcNow - engCell.EngineerBuiltAt.Value).TotalMinutes >= 10)
                    {
                        engCell.IsFort = true;
                        gridChanged = true;
                        AppendEventLog(room.State, new GameEventLogEntry
                        {
                            Type = "FortBuilt",
                            Message = $"{player.Name} (Engineer) built a fort at ({engHex.q}, {engHex.r}).",
                            PlayerId = userId,
                            PlayerName = player.Name,
                            Q = engHex.q,
                            R = engHex.r
                        });
                    }
                }
            }

            // Phase 5: Beacon auto-deactivate — if player moves >1 hex from beacon position
            if (player.IsBeacon && player.BeaconLat.HasValue && player.BeaconLng.HasValue
                && room.State.HasMapLocation)
            {
                var beaconHex = HexService.LatLngToHexForRoom(player.BeaconLat.Value, player.BeaconLng.Value,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var currentPlayerHex = HexService.LatLngToHexForRoom(lat, lng,
                    room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                var dist = HexService.HexDistance(beaconHex.q - currentPlayerHex.q, beaconHex.r - currentPlayerHex.r);
                if (dist > 1)
                {
                    player.IsBeacon = false;
                    player.BeaconLat = null;
                    player.BeaconLng = null;
                }
            }

            winConditionService.ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistenceIfGameOver(room, snapshot, previousPhase);
            gridChanged |= snapshot.Phase != previousPhase;
            return (snapshot, null, gridChanged);
        }
    }

    public (GameState? state, string? error) PickUpTroops(string roomCode, string userId,
        int q, int r, int count, double playerLat, double playerLng)
    {
        if (count < 1)
            return (null, "Pick-up count must be at least 1.");

        var error = ValidateCoordinates(playerLat, playerLng);
        if (error != null)
            return (null, error);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        if (room.State.IsPaused)
            return (null, "Game is paused.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateRealtimeAction(room.State, userId, q, r, playerLat, playerLng,
                out var player, out var cell);
            if (validationError != null)
                return (null, validationError);
            if (cell.IsMasterTile)
                return (null, "The master tile cannot be used for troop pick-up.");

            if (cell.OwnerId != userId)
                return (null, "You can only pick up troops from your own hexes.");
            if (cell.Troops < count)
                return (null, "That hex does not have enough troops.");

            cell.Troops -= count;
            player.CarriedTroops += count;
            player.CarriedTroopsSourceQ = q;
            player.CarriedTroopsSourceR = r;
            SetPlayerLocation(room.State, player, playerLat, playerLng);
            winConditionService.ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (CombatPreviewDto? preview, string? error) GetCombatPreview(string roomCode, string userId, int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        if (room.State.IsPaused)
            return (null, "Game is paused.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Combat preview is only available while the game is playing.");
            if (!room.State.HasMapLocation || room.State.MapLat is null || room.State.MapLng is null)
                return (null, "This room does not have a valid map location configured.");

            var player = room.State.Players.FirstOrDefault(candidate => candidate.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var cell))
                return (null, "Invalid hex.");

            var previewError = ValidateCombatPreview(room.State, player, cell, q, r);
            if (previewError != null)
                return (null, previewError);

            var combatStats = CalculateCombatStats(room.State, player, cell, q, r, player.CarriedTroops);
            return (new CombatPreviewDto
            {
                AttackerTroops = combatStats.AttackerTroops,
                DefenderTroops = combatStats.DefenderTroops,
                EffectiveAttack = combatStats.EffectiveAttack,
                EffectiveDefence = combatStats.EffectiveDefence,
                AttackerWinProbability = combatStats.AttackerWinProbability,
                AttackerBonuses = combatStats.AttackerBonuses.Select(CloneBonusDetail).ToList(),
                DefenderBonuses = combatStats.DefenderBonuses.Select(CloneBonusDetail).ToList(),
                CombatMode = combatStats.CombatMode.ToString(),
                DefenderName = combatStats.DefenderName,
                DefenderAllianceName = combatStats.DefenderAllianceName
            }, null);
        }
    }

    public (GameState? state, string? error, string? previousOwnerId, CombatResult? combatResult) PlaceTroops(
        string roomCode, string userId, int q, int r, double playerLat, double playerLng,
        int? troopCount = null)
    {
        var error = ValidateCoordinates(playerLat, playerLng);
        if (error != null)
            return (null, error, null, null);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.", null, null);

        if (room.State.IsPaused)
            return (null, "Game is paused.", null, null);

        lock (room.SyncRoot)
        {
            var validationError = ValidateRealtimeAction(room.State, userId, q, r, playerLat, playerLng,
                out var player, out var cell);
            if (validationError != null)
                return (null, validationError, null, null);
            if (cell.IsMasterTile)
                return (null, "The master tile is invincible and cannot be conquered.", null, null);

            SetPlayerLocation(room.State, player, playerLat, playerLng);

            var sameAllianceHex = player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId;

            // ── Dynamics: Water blocking (non-own/non-allied hexes only) ──
            if (cell.OwnerId != userId && !sameAllianceHex)
            {
                // Water terrain is impassable
                if (room.State.Dynamics.TerrainEnabled && cell.TerrainType == TerrainType.Water)
                    return (null, "Water terrain is impassable.", null, null);
            }

            if (cell.OwnerId == userId || sameAllianceHex)
            {
                if (player.CarriedTroops <= 0)
                    return (null, "You are not carrying any troops.", null, null);

                if (troopCount == 0)
                {
                    var zeroDeploySnapshot = SnapshotState(room.State);
                    QueuePersistence(room, zeroDeploySnapshot);
                    return (zeroDeploySnapshot, null, null, null);
                }

                var reinforcedTroops = troopCount ?? player.CarriedTroops;
                if (troopCount.HasValue && (troopCount.Value < 1 || troopCount.Value > player.CarriedTroops))
                    return (null, "Troop count must be between 1 and your carried troops.", null, null);

                cell.Troops += reinforcedTroops;
                player.CarriedTroops -= reinforcedTroops;
                if (player.CarriedTroops == 0)
                    ResetCarriedTroops(player);
                winConditionService.ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
                var reinforceSnapshot = SnapshotState(room.State);
                QueuePersistence(room, reinforceSnapshot);
                return (reinforceSnapshot, null, null, null);
            }

            if (cell.OwnerId == null)
            {
                var neutralClaimError = ClaimNeutralHex(room.State, player, cell, q, r);
                if (neutralClaimError != null)
                    return (null, neutralClaimError, null, null);

                winConditionService.RefreshTerritoryCount(room.State);
                winConditionService.ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
                var neutralClaimSnapshot = SnapshotState(room.State);
                QueuePersistence(room, neutralClaimSnapshot);
                return (neutralClaimSnapshot, null, null, null);
            }

            if (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId)
                return (null, "You cannot attack an allied hex.", null, null);

            // HQ tiles are immune to normal combat — must be captured via CommandoRaid
            if (room.State.Dynamics.HQEnabled)
            {
                var isHQHex = room.State.Alliances.Any(a => a.HQHexQ == q && a.HQHexR == r);
                if (isHQHex)
                    return (null, "This is an HQ hex — it can only be captured via a CommandoRaid.", null, null);
            }

            var deployedTroops = troopCount ?? player.CarriedTroops;
            if (troopCount.HasValue && (troopCount.Value < 1 || troopCount.Value > player.CarriedTroops))
                return (null, "Troop count must be between 1 and your carried troops.", null, null);
            var combatStats = CalculateCombatStats(room.State, player, cell, q, r, deployedTroops);
            var combatResolution = ResolveCombat(combatStats);
            var previousOwnerId = cell.OwnerId;
            var previousOwnerName = cell.OwnerName;
            var previousCarriedTroops = player.CarriedTroops;
            var undeployedTroops = previousCarriedTroops - deployedTroops;

            player.CarriedTroops = undeployedTroops + combatResolution.AttackerTroopsRemaining;
            if (player.CarriedTroops == 0)
            {
                ResetCarriedTroops(player);
            }
            else if (combatResolution.AttackerWon && player.CarriedTroops == combatResolution.AttackerTroopsRemaining)
            {
                player.CarriedTroopsSourceQ = q;
                player.CarriedTroopsSourceR = r;
            }

            cell.Troops = combatResolution.DefenderTroopsRemaining;

            if (combatResolution.AttackerWon)
            {
                SetCellOwner(cell, player);

                // The winner carries all surviving troops and chooses later how many to drop.
                cell.Troops = 0;
                winConditionService.RefreshTerritoryCount(room.State);
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "TileCaptured",
                    Message = $"{player.Name} captured hex ({q}, {r}) from {previousOwnerName ?? "another player"} after losing {combatResolution.AttackerTroopsLost} troops.",
                    PlayerId = player.Id,
                    PlayerName = player.Name,
                    TargetPlayerId = previousOwnerId,
                    TargetPlayerName = previousOwnerName,
                    Q = q,
                    R = r
                });
            }
            else
            {
                previousOwnerId = null;
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "CombatRepelled",
                    Message = $"{player.Name} was repelled at hex ({q}, {r}) by {previousOwnerName ?? "another player"}.",
                    PlayerId = player.Id,
                    PlayerName = player.Name,
                    TargetPlayerId = cell.OwnerId,
                    TargetPlayerName = previousOwnerName,
                    Q = q,
                    R = r
                });
            }

            if (combatStats.TacticalStrikeUsed)
            {
                player.TacticalStrikeActive = false;
                player.TacticalStrikeExpiry = null;
            }

            // Phase 4: HQ capture check
            if (combatResolution.AttackerWon && room.State.Dynamics.HQEnabled && previousOwnerId != null)
            {
                var capturedAlliance = room.State.Alliances.FirstOrDefault(a =>
                    a.HQHexQ == q && a.HQHexR == r);
                if (capturedAlliance != null)
                {
                    capturedAlliance.ClaimFrozenUntil = DateTime.UtcNow.AddMinutes(5);
                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "HQCaptured",
                        Message = $"{player.Name} captured {capturedAlliance.Name}'s HQ! Their claims are frozen for 5 minutes.",
                        PlayerId = userId,
                        PlayerName = player.Name,
                        AllianceId = capturedAlliance.Id,
                        AllianceName = capturedAlliance.Name,
                        Q = q,
                        R = r
                    });
                }
            }

            winConditionService.ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var attackSnapshot = SnapshotState(room.State);
            QueuePersistence(room, attackSnapshot);
            var combatResult = new CombatResult
            {
                AttackerWon = combatResolution.AttackerWon,
                HexCaptured = combatResolution.AttackerWon,
                AttackDice = combatResolution.AttackDice,
                DefendDice = combatResolution.DefendDice,
                AttackerLost = combatResolution.AttackerTroopsLost,
                DefenderLost = combatResolution.DefenderTroopsLost,
                Q = q,
                R = r,
                PreviousOwnerName = previousOwnerName,
                NewState = attackSnapshot,
                AttackerBonus = combatStats.AttackerBonuses.Sum(bonus => bonus.Value),
                DefenderBonus = combatStats.DefenderBonuses.Sum(bonus => bonus.Value),
                DefenderTerrainType = combatStats.DefenderTerrainType,
                EffectiveAttack = combatStats.EffectiveAttack,
                EffectiveDefence = combatStats.EffectiveDefence,
                AttackerTroopsLost = combatResolution.AttackerTroopsLost,
                DefenderTroopsLost = combatResolution.DefenderTroopsLost,
                AttackerTroopsRemaining = combatResolution.AttackerTroopsRemaining,
                DefenderTroopsRemaining = combatResolution.DefenderTroopsRemaining,
                AttackerWinProbability = combatStats.AttackerWinProbability,
                CombatModeUsed = combatStats.CombatMode.ToString(),
                AttackerBonuses = combatStats.AttackerBonuses.Select(CloneBonusDetail).ToList(),
                DefenderBonuses = combatStats.DefenderBonuses.Select(CloneBonusDetail).ToList()
            };
            return (attackSnapshot, null, previousOwnerId, combatResult);
        }
    }

    private static string? ValidateCombatPreview(GameState state, PlayerDto player, HexCell cell, int q, int r)
    {
        if (cell.IsMasterTile)
            return "The master tile is invincible and cannot be conquered.";
        if (player.CarriedTroops <= 0)
            return "You are not carrying any troops.";
        if (cell.OwnerId == null)
            return "Combat preview is only available for enemy-held hexes.";
        if (cell.OwnerId == player.Id)
            return "Combat preview is only available for enemy-held hexes.";
        if (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId)
            return "You cannot attack an allied hex.";

        if (player.IsHost && state.HostBypassGps)
            return null;

        if (player.CurrentLat.HasValue && player.CurrentLng.HasValue)
        {
            var isInHex = HexService.IsPlayerInHex(
                player.CurrentLat.Value,
                player.CurrentLng.Value,
                q,
                r,
                state.MapLat!.Value,
                state.MapLng!.Value,
                state.TileSizeMeters);
            if (isInHex)
                return null;
        }

        if (TryGetCurrentHex(state, player, out var currentQ, out var currentR) && currentQ == q && currentR == r)
            return null;

        return "You must be physically inside that hex to preview combat.";
    }

    private static CombatStats CalculateCombatStats(GameState state, PlayerDto player, HexCell cell, int q, int r, int deployedTroops)
    {
        var combatMode = NormalizeCombatMode(state.Dynamics.CombatMode);
        var attackerBonuses = new List<CombatBonusDetail>();
        var defenderBonuses = new List<CombatBonusDetail>();
        var tacticalStrikeUsed = state.Dynamics.PlayerRolesEnabled && player.TacticalStrikeActive;

        if (state.Dynamics.TerrainEnabled)
        {
            var terrainBonus = cell.TerrainType switch
            {
                TerrainType.Building or TerrainType.Hills => 1,
                TerrainType.Steep => 2,
                _ => 0
            };
            AddBonus(defenderBonuses, "Terrain", terrainBonus);
        }

        if (cell.IsFortified && !tacticalStrikeUsed)
            AddBonus(defenderBonuses, "Rally", 1);

        if (cell.IsFort && !tacticalStrikeUsed)
            AddBonus(defenderBonuses, "Fort", 1);

        if (state.Dynamics.PlayerRolesEnabled)
        {
            var commanderPresent = GetPlayersInHex(state, q, r).Any(candidate =>
                candidate.Role == PlayerRole.Commander &&
                candidate.AllianceId == player.AllianceId);
            if (commanderPresent)
                AddBonus(attackerBonuses, "Commander", 1);

        }

        if (state.Dynamics.UnderdogPactEnabled && cell.OwnerAllianceId != null)
        {
            var totalOwnedHexes = state.Grid.Values.Count(candidate => candidate.OwnerId != null);
            if (totalOwnedHexes > 0)
            {
                var targetAllianceHexes = state.Grid.Values.Count(candidate => candidate.OwnerAllianceId == cell.OwnerAllianceId);
                if ((double)targetAllianceHexes / totalOwnedHexes > 0.6)
                    AddBonus(attackerBonuses, "Underdog Pact", 2);
            }
        }

        var effectiveAttack = deployedTroops + attackerBonuses.Sum(bonus => bonus.Value);
        var baseDefence = cell.Troops + defenderBonuses.Sum(bonus => bonus.Value);
        if (combatMode == CombatMode.Siege)
        {
            var siegeBonus = (int)Math.Ceiling(baseDefence * 0.25);
            AddBonus(defenderBonuses, "Siege Defender Advantage", siegeBonus);
        }

        var effectiveDefence = cell.Troops + defenderBonuses.Sum(bonus => bonus.Value);
        var attackerWinProbability = CalculateAttackerWinProbability(effectiveAttack, effectiveDefence, combatMode);
        var defenderAllianceName = cell.OwnerAllianceId == null
            ? null
            : state.Alliances.FirstOrDefault(alliance => alliance.Id == cell.OwnerAllianceId)?.Name;

        return new CombatStats(
            combatMode,
            deployedTroops,
            cell.Troops,
            effectiveAttack,
            effectiveDefence,
            attackerWinProbability,
            tacticalStrikeUsed,
            attackerBonuses,
            defenderBonuses,
            cell.OwnerName ?? "Unknown defender",
            defenderAllianceName,
            cell.TerrainType.ToString());
    }

    private static CombatResolution ResolveCombat(CombatStats combatStats)
    {
        return combatStats.CombatMode switch
        {
            CombatMode.Classic => ResolveClassicCombat(combatStats),
            CombatMode.Balanced or CombatMode.Siege => ResolveDiceCombat(combatStats),
            _ => ResolveDiceCombat(combatStats)
        };
    }

    private static CombatResolution ResolveClassicCombat(CombatStats combatStats)
    {
        if (combatStats.EffectiveAttack > combatStats.EffectiveDefence)
        {
            var attackerTroopsRemaining = Math.Max(1, combatStats.AttackerTroops - combatStats.DefenderTroops);
            var attackerTroopsLost = combatStats.AttackerTroops - attackerTroopsRemaining;
            return new CombatResolution(
                true,
                attackerTroopsLost,
                combatStats.DefenderTroops,
                attackerTroopsRemaining,
                0,
                [],
                []);
        }

        var lossCap = (int)Math.Ceiling(combatStats.AttackerTroops * 0.5);
        var attackerTroopsLostOnFailure = Math.Min(combatStats.AttackerTroops, Math.Max(1, Math.Min(lossCap, combatStats.DefenderTroops)));
        return new CombatResolution(
            false,
            attackerTroopsLostOnFailure,
            0,
            combatStats.AttackerTroops - attackerTroopsLostOnFailure,
            combatStats.DefenderTroops,
            [],
            []);
    }

    private static CombatResolution ResolveDiceCombat(CombatStats combatStats)
    {
        var attackerTroopsRemaining = combatStats.AttackerTroops;
        var defenderTroopsRemaining = combatStats.DefenderTroops;
        var attackDice = new List<int>(BalancedCombatRounds);
        var defendDice = new List<int>(BalancedCombatRounds);
        var defenderHitProbability = 1d - combatStats.AttackerWinProbability;

        for (var round = 0; round < BalancedCombatRounds && attackerTroopsRemaining > 0 && defenderTroopsRemaining > 0; round++)
        {
            var attackerHits = RollHits(attackerTroopsRemaining, combatStats.AttackerWinProbability);
            var defenderHits = RollHits(defenderTroopsRemaining, defenderHitProbability);
            attackDice.Add(attackerHits);
            defendDice.Add(defenderHits);

            defenderTroopsRemaining = Math.Max(0, defenderTroopsRemaining - attackerHits);
            attackerTroopsRemaining = Math.Max(0, attackerTroopsRemaining - defenderHits);
        }

        return new CombatResolution(
            defenderTroopsRemaining == 0 && attackerTroopsRemaining > 0,
            combatStats.AttackerTroops - attackerTroopsRemaining,
            combatStats.DefenderTroops - defenderTroopsRemaining,
            attackerTroopsRemaining,
            defenderTroopsRemaining,
            attackDice.ToArray(),
            defendDice.ToArray());
    }

    private static int RollHits(int troopCount, double hitProbability)
    {
        var hits = 0;
        for (var index = 0; index < troopCount; index++)
        {
            if (Random.Shared.NextDouble() < hitProbability)
                hits++;
        }

        return hits;
    }

    private static double CalculateAttackerWinProbability(int effectiveAttack, int effectiveDefence, CombatMode combatMode)
    {
        if (combatMode == CombatMode.Classic)
            return effectiveAttack > effectiveDefence ? 1d : 0d;

        var totalPower = effectiveAttack + effectiveDefence;
        if (totalPower <= 0)
            return 0.5;

        var rawProbability = (double)effectiveAttack / totalPower;
        return Math.Clamp(rawProbability, MinCombatHitProbability, MaxCombatHitProbability);
    }

    private static CombatMode NormalizeCombatMode(CombatMode combatMode)
    {
        return Enum.IsDefined(combatMode) ? combatMode : CombatMode.Balanced;
    }

    private static void AddBonus(List<CombatBonusDetail> bonuses, string source, int value)
    {
        if (value == 0)
            return;

        bonuses.Add(new CombatBonusDetail
        {
            Source = source,
            Value = value
        });
    }

    private static CombatBonusDetail CloneBonusDetail(CombatBonusDetail detail)
    {
        return new CombatBonusDetail
        {
            Source = detail.Source,
            Value = detail.Value
        };
    }


    public (GameState? state, string? error) ResolveExpiredCommandoRaids(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var now = DateTime.UtcNow;
            var expired = room.State.ActiveRaids.Where(r => r.Deadline <= now).ToList();
            if (expired.Count == 0) return (null, null);

            foreach (var raid in expired)
            {
                ResolveRaid(room.State, raid, now);
                room.State.ActiveRaids.Remove(raid);
            }

            winConditionService.RefreshTerritoryCount(room.State);
            winConditionService.ApplyWinConditionAndLog(room.State, now);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    private static void ResolveRaid(GameState state, ActiveCommandoRaid raid, DateTime now)
    {
        var key = HexService.Key(raid.TargetQ, raid.TargetR);
        if (!state.Grid.TryGetValue(key, out var cell)) return;

        var attackers = GetPlayersInHex(state, raid.TargetQ, raid.TargetR)
            .Where(p => p.AllianceId == raid.InitiatorAllianceId)
            .ToList();
        var defenders = GetPlayersInHex(state, raid.TargetQ, raid.TargetR)
            .Where(p => p.AllianceId != raid.InitiatorAllianceId)
            .ToList();

        var attackerWins = attackers.Count >= 2 && attackers.Count > defenders.Count;

        if (attackerWins)
        {
            var spoils = cell.Troops;
            var newOwner = attackers.First();

            cell.OwnerId = newOwner.Id;
            cell.OwnerName = newOwner.Name;
            cell.OwnerAllianceId = raid.InitiatorAllianceId;
            cell.OwnerColor = newOwner.AllianceColor ?? newOwner.Color;
            cell.Troops = spoils;

            if (raid.IsHQRaid)
            {
                var losingAlliance = state.Alliances.FirstOrDefault(a =>
                    a.HQHexQ == raid.TargetQ && a.HQHexR == raid.TargetR);
                if (losingAlliance != null)
                    losingAlliance.ClaimFrozenUntil = now.AddMinutes(5);
            }

            AppendEventLog(state, new GameEventLogEntry
            {
                Type = "CommandoRaidSuccess",
                Message = $"Commando raid succeeded! {raid.InitiatorPlayerName}'s team captured ({raid.TargetQ}, {raid.TargetR}) and took {spoils} troops!",
                AllianceId = raid.InitiatorAllianceId,
                Q = raid.TargetQ,
                R = raid.TargetR
            });
        }
        else
        {
            AppendEventLog(state, new GameEventLogEntry
            {
                Type = "CommandoRaidFailed",
                Message = $"Commando raid failed at ({raid.TargetQ}, {raid.TargetR}) — defenders held their ground.",
                Q = raid.TargetQ,
                R = raid.TargetR
            });
        }
    }

    public void ResolveActiveSabotages(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null) return;

        lock (room.SyncRoot)
        {
            var now = DateTime.UtcNow;
            var engineers = room.State.Players
                .Where(p => p.SabotageActive && p.SabotageTargetQ.HasValue)
                .ToList();

            foreach (var engineer in engineers)
            {
                var key = HexService.Key(engineer.SabotageTargetQ!.Value, engineer.SabotageTargetR!.Value);
                if (!room.State.Grid.TryGetValue(key, out var cell)) { engineer.SabotageActive = false; continue; }

                var stillPresent = TryGetCurrentHex(room.State, engineer, out var eq, out var er)
                    && eq == engineer.SabotageTargetQ && er == engineer.SabotageTargetR;

                if (!stillPresent)
                {
                    engineer.SabotageActive = false;
                    engineer.SabotageStartedAt = null;
                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "SabotageCancelled",
                        Message = $"{engineer.Name}'s sabotage was interrupted.",
                        Q = engineer.SabotageTargetQ, R = engineer.SabotageTargetR
                    });
                    continue;
                }

                if (engineer.SabotageStartedAt.HasValue &&
                    (now - engineer.SabotageStartedAt.Value).TotalMinutes >= 1)
                {
                    cell.SabotagedUntil = now.AddMinutes(10);
                    engineer.SabotageActive = false;
                    engineer.SabotageStartedAt = null;
                    engineer.SabotageTargetQ = null;
                    engineer.SabotageTargetR = null;

                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "SabotageComplete",
                        Message = $"Sabotage complete! ({cell.Q}, {cell.R}) will not regenerate troops for 10 minutes.",
                        Q = cell.Q, R = cell.R
                    });
                }
            }
        }
    }

    public void ResolveExpiredRallyPoints(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null) return;

        lock (room.SyncRoot)
        {
            var now = DateTime.UtcNow;
            var commanders = room.State.Players
                .Where(p => p.RallyPointActive && p.RallyPointDeadline <= now)
                .ToList();

            foreach (var commander in commanders)
            {
                if (commander.RallyPointQ == null || commander.RallyPointR == null) continue;
                var key = HexService.Key(commander.RallyPointQ.Value, commander.RallyPointR.Value);
                if (!room.State.Grid.TryGetValue(key, out var cell)) continue;

                var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == commander.AllianceId);
                var platoonSize = alliance?.MemberIds.Count ?? 1;
                var maxTroops = platoonSize * 2;

                var alliesAtRally = GetPlayersInHex(room.State, commander.RallyPointQ.Value, commander.RallyPointR.Value)
                    .Where(p => p.AllianceId == commander.AllianceId)
                    .ToList();

                var troopsToAdd = Math.Min(alliesAtRally.Count * 2, maxTroops);
                cell.Troops += troopsToAdd;

                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "RallyPointResolved",
                    Message = $"Rally Point complete — {alliesAtRally.Count} scouts arrived, +{troopsToAdd} troops at ({commander.RallyPointQ}, {commander.RallyPointR}).",
                    Q = commander.RallyPointQ, R = commander.RallyPointR
                });

                commander.RallyPointActive = false;
                commander.RallyPointDeadline = null;
                commander.RallyPointQ = null;
                commander.RallyPointR = null;
            }
        }
    }

    public ReinforcementTickResult AddReinforcementsToAllHexes(string roomCode)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return new ReinforcementTickResult(null, "Room not found.", []);

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return new ReinforcementTickResult(null, "Reinforcements only apply while the game is playing.", []);

            ExpireTimedAbilities(room.State, DateTime.UtcNow);

            var terrainEnabled = room.State.Dynamics.TerrainEnabled;

            // Phase 8: Timed Escalation — increase regen after time thresholds
            var escalationBonus = 0;
            if (room.State.Dynamics.TimedEscalationEnabled && room.State.GameStartedAt.HasValue)
            {
                var elapsed = DateTime.UtcNow - room.State.GameStartedAt.Value;
                escalationBonus = (int)(elapsed.TotalMinutes / 30); // +1 per 30 min
            }

            var drainTicks = new List<DrainTickNotification>();

            foreach (var cell in room.State.Grid.Values.Where(cell => cell.OwnerId != null || cell.IsMasterTile))
            {
                // Drain: skip regen if hostile player physically present
                if (cell.OwnerId != null && !cell.IsMasterTile)
                {
                    var playersInHex = GetPlayersInHex(room.State, cell.Q, cell.R);
                    var hostilePresent = playersInHex.Any(p => p.Id != cell.OwnerId
                        && (cell.OwnerAllianceId == null || p.AllianceId != cell.OwnerAllianceId));
                    if (hostilePresent)
                    {
                        var affectedAlliance = cell.OwnerAllianceId == null
                            ? null
                            : room.State.Alliances.FirstOrDefault(alliance => alliance.Id == cell.OwnerAllianceId);
                        drainTicks.Add(new DrainTickNotification(
                            cell.Q,
                            cell.R,
                            0,
                            affectedAlliance?.Id,
                            affectedAlliance?.Name));
                        continue;
                    }
                }

                // Phase 3: Shepherd — owned tile unvisited >3 min decays instead of regenerating
                if (room.State.Dynamics.TileDecayEnabled
                    && cell.OwnerId != null && !cell.IsMasterTile)
                {
                    var unvisitedThreshold = DateTime.UtcNow.AddMinutes(-3);
                    if (cell.LastVisitedAt.HasValue && cell.LastVisitedAt.Value < unvisitedThreshold)
                    {
                        if (cell.Troops > 0)
                            cell.Troops--;
                        continue; // skip normal regen
                    }
                    if (!cell.LastVisitedAt.HasValue)
                    {
                        // Never visited since Shepherd enabled — don't decay yet, just skip bonus regen
                        // Normal regen still applies
                    }
                }

                // Phase: Sabotage — sabotaged hexes skip regen
                if (cell.SabotagedUntil.HasValue)
                {
                    if (cell.SabotagedUntil > DateTime.UtcNow)
                        continue;
                    cell.SabotagedUntil = null;
                }

                // Presence bonus: 3× regen if a friendly player is physically on this hex
                var friendlyPresent = GetPlayersInHex(room.State, cell.Q, cell.R)
                    .Any(p => IsFriendlyCell(p, cell));
                var presenceMultiplier = friendlyPresent ? 3 : 1;
                cell.Troops += presenceMultiplier;

                // Phase 8: Timed Escalation bonus
                cell.Troops += escalationBonus;

                // Building terrain bonus: +1 extra regen
                if (terrainEnabled && cell.TerrainType == TerrainType.Building)
                    cell.Troops++;

            }

            winConditionService.ApplyWinConditionAndLog(room.State, DateTime.UtcNow);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return new ReinforcementTickResult(snapshot, null, drainTicks);
        }
    }

    private static string? ClaimNeutralHex(GameState state, PlayerDto player, HexCell cell, int q, int r)
    {
        // Phase 4: HQ claim freeze check
        if (state.Dynamics.HQEnabled && player.AllianceId != null)
        {
            var playerAlliance = state.Alliances.FirstOrDefault(a => a.Id == player.AllianceId);
            if (playerAlliance?.ClaimFrozenUntil != null && playerAlliance.ClaimFrozenUntil > DateTime.UtcNow)
                return "Your alliance's claims are frozen — your HQ was captured!";
        }

        switch (state.ClaimMode)
        {
            case ClaimMode.PresenceOnly:
                SetCellOwner(cell, player);
                cell.Troops = 0;
                return null;
            case ClaimMode.PresenceWithTroop:
                if (player.CarriedTroops < 1)
                    return "You must be carrying at least 1 troop to claim a neutral hex in this room.";

                SetCellOwner(cell, player);
                cell.Troops = 1;
                player.CarriedTroops -= 1;
                if (player.CarriedTroops == 0)
                    ResetCarriedTroops(player);
                return null;
            case ClaimMode.AdjacencyRequired:
                var isAdjacent = HexService.IsAdjacentToOwned(state.Grid, q, r, player.Id, player.AllianceId);
                // Phase 5: Beacon — teammate beacon within 2 hexes extends adjacency
                if (!isAdjacent && state.Dynamics.BeaconEnabled)
                {
                    isAdjacent = state.Players.Any(p => p.IsBeacon
                        && p.Id != player.Id
                        && p.AllianceId == player.AllianceId
                        && p.BeaconLat.HasValue && p.BeaconLng.HasValue
                        && state.MapLat.HasValue && state.MapLng.HasValue
                        && HexService.HexDistance(
                            HexService.LatLngToHexForRoom(p.BeaconLat.Value, p.BeaconLng.Value,
                                state.MapLat.Value, state.MapLng.Value, state.TileSizeMeters).q - q,
                            HexService.LatLngToHexForRoom(p.BeaconLat.Value, p.BeaconLng.Value,
                                state.MapLat.Value, state.MapLng.Value, state.TileSizeMeters).r - r) <= 2);
                }
                if (!isAdjacent)
                    return "This room requires neutral claims to border your territory.";

                SetCellOwner(cell, player);
                cell.Troops = 0;
                return null;
            default:
                return "Unsupported claim mode.";
        }
    }

    private static string? ValidateRealtimeAction(GameState state, string userId, int q, int r,
        double playerLat, double playerLng, out PlayerDto player, out HexCell cell)
    {
        player = null!;
        cell = null!;

        if (state.Phase != GamePhase.Playing)
            return "This action is only available while the game is playing.";
        if (!state.HasMapLocation || state.MapLat is null || state.MapLng is null)
            return "This room does not have a valid map location configured.";

        player = state.Players.FirstOrDefault(p => p.Id == userId)!;
        if (player == null)
            return "Player not in room.";
        if (!state.Grid.TryGetValue(HexService.Key(q, r), out var targetCell))
            return "Invalid hex.";
        cell = targetCell;

        // GPS bypass — treat player as being at hex center when enabled
        if (player.IsHost && state.HostBypassGps)
        {
            var (hexLat, hexLng) = HexService.HexToLatLng(q, r,
                state.MapLat.Value, state.MapLng.Value, state.TileSizeMeters);
            SetPlayerLocation(state, player, hexLat, hexLng);
        }
        else if (!HexService.IsPlayerInHex(playerLat, playerLng, q, r,
                state.MapLat.Value, state.MapLng.Value, state.TileSizeMeters))
            return "You must be physically inside that hex to interact with it.";

        return null;
    }

    internal static List<PlayerDto> GetPlayersInHex(GameState state, int q, int r) =>
        state.Players
            .Where(player => TryGetCurrentHex(state, player, out var playerQ, out var playerR)
                && playerQ == q
                && playerR == r)
            .ToList();

    internal static bool TryGetCurrentHex(GameState state, PlayerDto player, out int q, out int r)
    {
        if (player.CurrentHexQ.HasValue && player.CurrentHexR.HasValue)
        {
            q = player.CurrentHexQ.Value;
            r = player.CurrentHexR.Value;
            return true;
        }

        if (player.CurrentLat.HasValue && player.CurrentLng.HasValue && state.HasMapLocation)
        {
            var currentHex = HexService.LatLngToHexForRoom(
                player.CurrentLat.Value,
                player.CurrentLng.Value,
                state.MapLat!.Value,
                state.MapLng!.Value,
                state.TileSizeMeters);
            q = currentHex.q;
            r = currentHex.r;
            return true;
        }

        q = 0;
        r = 0;
        return false;
    }

    internal static bool IsFriendlyCell(PlayerDto player, HexCell cell)
    {
        return cell.OwnerId == player.Id
            || (player.AllianceId != null && cell.OwnerAllianceId == player.AllianceId);
    }

    internal static string? ValidateCoordinates(double lat, double lng)
    {
        if (!double.IsFinite(lat) || lat < -90 || lat > 90)
            return "Latitude must be a finite number between -90 and 90.";
        if (!double.IsFinite(lng) || lng < -180 || lng > 180)
            return "Longitude must be a finite number between -180 and 180.";
        return null;
    }

    internal static void SetPlayerLocation(GameState state, PlayerDto player, double? lat, double? lng)
    {
        player.CurrentLat = lat;
        player.CurrentLng = lng;

        if (!lat.HasValue || !lng.HasValue || !state.HasMapLocation)
        {
            player.CurrentHexQ = null;
            player.CurrentHexR = null;
            return;
        }

        var currentHex = HexService.LatLngToHexForRoom(
            lat.Value,
            lng.Value,
            state.MapLat!.Value,
            state.MapLng!.Value,
            state.TileSizeMeters);

        player.CurrentHexQ = currentHex.q;
        player.CurrentHexR = currentHex.r;
    }

    private static bool UpdateDemolishProgress(GameState state, PlayerDto player)
    {
        if (!player.DemolishActive || player.DemolishTargetKey == null || player.DemolishStartedAt == null)
            return false;

        if (!TryGetCurrentHex(state, player, out var currentQ, out var currentR))
            return false;

        var currentHexKey = HexService.Key(currentQ, currentR);
        if (currentHexKey != player.DemolishTargetKey)
        {
            player.DemolishActive = false;
            player.DemolishTargetKey = null;
            player.DemolishStartedAt = null;
            return false;
        }

        if ((DateTime.UtcNow - player.DemolishStartedAt.Value).TotalMinutes < 2)
            return false;

        if (state.Grid.TryGetValue(player.DemolishTargetKey, out var targetCell) && targetCell.IsFort)
        {
            targetCell.IsFort = false;
            AppendEventLog(state, new GameEventLogEntry
            {
                Type = "DemolishCompleted",
                Message = $"{player.Name} demolished the fort at ({targetCell.Q}, {targetCell.R}).",
                PlayerId = player.Id,
                PlayerName = player.Name,
                Q = targetCell.Q,
                R = targetCell.R
            });
        }

        player.DemolishActive = false;
        player.DemolishTargetKey = null;
        player.DemolishStartedAt = null;
        return true;
    }

    private static void ExpireTimedAbilities(GameState state, DateTime now)
    {
        foreach (var player in state.Players)
        {
            if (player.TacticalStrikeActive && player.TacticalStrikeExpiry <= now)
            {
                player.TacticalStrikeActive = false;
                player.TacticalStrikeExpiry = null;
            }

        }
    }


    internal static void SetCellOwner(HexCell cell, PlayerDto player)
    {
        cell.OwnerId = player.Id;
        cell.OwnerAllianceId = player.AllianceId;
        cell.OwnerName = player.Name;
        cell.OwnerColor = player.AllianceColor ?? player.Color;
    }

    internal static void ResetCarriedTroops(PlayerDto player)
    {
        player.CarriedTroops = 0;
        player.CarriedTroopsSourceQ = null;
        player.CarriedTroopsSourceR = null;
    }

    internal static void ReturnCarriedTroops(GameState state, PlayerDto player)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(player);

        if (player.CarriedTroops <= 0)
        {
            ResetCarriedTroops(player);
            return;
        }

        if (player.CarriedTroopsSourceQ is null || player.CarriedTroopsSourceR is null)
        {
            var ownedCell = state.Grid.Values.FirstOrDefault(cell => cell.OwnerId == player.Id);
            if (ownedCell != null)
            {
                player.CarriedTroopsSourceQ = ownedCell.Q;
                player.CarriedTroopsSourceR = ownedCell.R;
            }
        }
    }

    internal static void RefreshTerritoryCount(GameState state) => WinConditionService.RefreshTerritoryCountCore(state);
    internal static void ApplyWinCondition(GameState state, DateTime now) => WinConditionService.ApplyWinConditionCore(state, now);
    internal static void ApplyTerritoryPercentWinCondition(GameState state) => WinConditionService.ApplyTerritoryPercentWinConditionCore(state);
    internal static void ApplyEliminationWinCondition(GameState state) => WinConditionService.ApplyEliminationWinConditionCore(state);
    internal static bool TrySetTerritoryLeaderAsWinner(GameState state) => WinConditionService.TrySetTerritoryLeaderAsWinnerCore(state);
    internal static void ApplyWinConditionAndLog(GameState state, DateTime now) => WinConditionService.ApplyWinConditionAndLogCore(state, now);
}
