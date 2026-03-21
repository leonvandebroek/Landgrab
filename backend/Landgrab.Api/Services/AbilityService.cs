using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class AbilityService(IGameRoomProvider roomProvider, GameStateService gameStateService)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);

    private static bool TryGetCurrentHex(GameState state, PlayerDto player, out HexCell cell)
    {
        cell = null!;

        if (!GameplayService.TryGetCurrentHex(state, player, out var q, out var r))
            return false;

        if (!state.Grid.TryGetValue(HexService.Key(q, r), out var currentCell) || currentCell is null)
            return false;

        cell = currentCell;
        return true;
    }

    private static bool IsFriendlyCell(PlayerDto player, HexCell cell)
    {
        return GameplayService.IsFriendlyCell(player, cell);
    }

    private static bool TryGetPlayerPosition(
        GameState state,
        PlayerDto player,
        out int currentQ,
        out int currentR,
        out double currentLat,
        out double currentLng)
    {
        currentLat = 0d;
        currentLng = 0d;

        if (!GameplayService.TryGetCurrentHex(state, player, out currentQ, out currentR)
            || !player.CurrentLat.HasValue
            || !player.CurrentLng.HasValue)
        {
            return false;
        }

        currentLat = player.CurrentLat.Value;
        currentLng = player.CurrentLng.Value;
        return true;
    }

    private static bool TryGetPlayerCoordinates(
        GameState state,
        PlayerDto player,
        out double currentLat,
        out double currentLng)
    {
        currentLat = 0d;
        currentLng = 0d;

        if (player.CurrentLat.HasValue && player.CurrentLng.HasValue)
        {
            currentLat = player.CurrentLat.Value;
            currentLng = player.CurrentLng.Value;
            return true;
        }

        if (!state.HasMapLocation || !GameplayService.TryGetCurrentHex(state, player, out var currentQ, out var currentR))
            return false;

        (currentLat, currentLng) = HexService.HexToLatLng(
            currentQ,
            currentR,
            state.MapLat!.Value,
            state.MapLng!.Value,
            state.TileSizeMeters);
        return true;
    }

    private static bool HasActiveSabotage(PlayerDto player)
    {
        return player.SabotageTargetQ.HasValue && player.SabotageTargetR.HasValue;
    }

    private static void CleanupExpiredSabotageBlockedTiles(PlayerDto player, DateTime now)
    {
        if (player.SabotageBlockedTiles.Count == 0)
            return;

        var expiredKeys = player.SabotageBlockedTiles
            .Where(entry => entry.Value <= now)
            .Select(entry => entry.Key)
            .ToList();

        foreach (var expiredKey in expiredKeys)
            player.SabotageBlockedTiles.Remove(expiredKey);
    }

    private static string FormatRemainingDuration(TimeSpan remaining)
    {
        var clampedRemaining = remaining <= TimeSpan.Zero ? TimeSpan.Zero : remaining;
        var totalSeconds = Math.Max(1, (int)Math.Ceiling(clampedRemaining.TotalSeconds));
        var minutes = totalSeconds / 60;
        var seconds = totalSeconds % 60;

        return minutes > 0
            ? $"{minutes}m {seconds}s"
            : $"{seconds}s";
    }

    private static void ClearSabotageTracking(PlayerDto player)
    {
        player.SabotageTargetQ = null;
        player.SabotageTargetR = null;
        player.SabotagePerimeterVisited.Clear();
    }

    private static void ClearInterceptTracking(PlayerDto player)
    {
        player.InterceptTargetId = null;
        player.InterceptLockStartAt = null;
    }

    private static double GetDistanceScore(double fromLat, double fromLng, double toLat, double toLng)
    {
        var latDiff = fromLat - toLat;
        var lngDiff = fromLng - toLng;
        return latDiff * latDiff + lngDiff * lngDiff;
    }

    private static (int targetQ, int targetR)? ResolveClosestAdjacentHex(
        GameState state,
        PlayerDto player,
        double heading)
    {
        if (!state.HasMapLocation
            || !TryGetPlayerPosition(state, player, out var currentQ, out var currentR, out var currentLat, out var currentLng))
        {
            return null;
        }

        var normalizedHeading = HexService.NormalizeHeading(heading);
        double? closestDiff = null;
        (int q, int r)? closestHex = null;

        foreach (var (candidateQ, candidateR) in HexService.Neighbors(currentQ, currentR))
        {
            if (!state.Grid.ContainsKey(HexService.Key(candidateQ, candidateR)))
                continue;

            var (candidateLat, candidateLng) = HexService.HexToLatLng(
                candidateQ,
                candidateR,
                state.MapLat!.Value,
                state.MapLng!.Value,
                state.TileSizeMeters);
            var candidateBearing = HexService.BearingDegrees(currentLat, currentLng, candidateLat, candidateLng);
            var headingDiff = HexService.HeadingDiff(normalizedHeading, candidateBearing);

            if (closestDiff is not null && headingDiff >= closestDiff.Value)
                continue;

            closestDiff = headingDiff;
            closestHex = (candidateQ, candidateR);
        }

        return closestDiff <= 30d ? closestHex : null;
    }

    public (GameState? state, string? error) ActivateBeacon(string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Beacons only work during gameplay.");
            if (!room.State.Dynamics.BeaconEnabled)
                return (null, "Beacon mode is not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (room.State.Dynamics.PlayerRolesEnabled && player.Role != PlayerRole.Scout)
                return (null, "Only a Scout can activate the Beacon.");
            if (player.CurrentLat == null || player.CurrentLng == null)
                return (null, "Your location is required to activate a beacon.");
            if (!double.IsFinite(heading))
                return (null, "A valid heading is required to activate a beacon.");

            player.IsBeacon = true;
            player.BeaconLat = player.CurrentLat;
            player.BeaconLng = player.CurrentLng;
            player.BeaconHeading = HexService.NormalizeHeading(heading);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "BeaconActivated",
                Message = $"{player.Name} activated a beacon.",
                PlayerId = userId,
                PlayerName = player.Name
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) DeactivateBeacon(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            player.IsBeacon = false;
            player.BeaconLat = null;
            player.BeaconLng = null;
            player.BeaconHeading = null;

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public ((int targetQ, int targetR)? target, string? error) ResolveRaidTarget(string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Commando raids only work during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");
            if (!room.State.HasMapLocation)
                return (null, "This room does not have a valid map location configured.");
            if (!double.IsFinite(heading))
                return (null, "A valid heading is required to resolve a raid target.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Only a Commander can resolve a commando raid target.");
            if (!TryGetPlayerPosition(room.State, player, out _, out _, out _, out _))
                return (null, "Your location is required to resolve a commando raid target.");

            return (ResolveClosestAdjacentHex(room.State, player, heading), null);
        }
    }

    public (GameState? state, string? error) ActivateCommandoRaid(string roomCode, string userId, int targetQ, int targetR)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Commando raids only work during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null) return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Only a Commander can activate a commando raid.");
            if (player.CommandoRaidCooldownUntil.HasValue && player.CommandoRaidCooldownUntil > DateTime.UtcNow)
                return (null, "Commando raid is on cooldown.");
            if (room.State.ActiveRaids.Any(r => r.InitiatorAllianceId == player.AllianceId))
                return (null, "Your alliance already has an active commando raid.");
            if (!GameplayService.TryGetCurrentHex(room.State, player, out var currentQ, out var currentR))
                return (null, "Your location is required to activate a commando raid.");

            var key = HexService.Key(targetQ, targetR);
            if (!room.State.Grid.TryGetValue(key, out _))
                return (null, "Invalid target hex.");
            if (HexService.HexDistance(currentQ, currentR, targetQ, targetR) != 1)
                return (null, "Commando raid target must be adjacent to your current hex.");

            var isHQRaid = room.State.Alliances.Any(a =>
                a.HQHexQ == targetQ && a.HQHexR == targetR);
            if (isHQRaid)
            {
                var totalHexes = room.State.Grid.Count;
                var claimedHexes = room.State.Grid.Values.Count(c => c.OwnerId != null && !c.IsMasterTile);
                if (totalHexes > 0 && (double)claimedHexes / totalHexes < 0.40)
                    return (null, "The battle hasn't reached its peak yet — HQ raids unlock when 40% of the map is claimed.");
            }

            var raid = new ActiveCommandoRaid
            {
                TargetQ = targetQ,
                TargetR = targetR,
                InitiatorAllianceId = player.AllianceId ?? "",
                InitiatorPlayerId = userId,
                InitiatorPlayerName = player.Name,
                Deadline = DateTime.UtcNow.AddMinutes(5),
                IsHQRaid = isHQRaid
            };
            room.State.ActiveRaids.Add(raid);
            player.CommandoRaidCooldownUntil = DateTime.UtcNow.AddMinutes(15);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "CommandoRaidStarted",
                Message = $"{player.Name} launched a commando raid on ({targetQ}, {targetR})! Everyone converge!",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = targetQ,
                R = targetR
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public ((int targetQ, int targetR)? target, string? error) ResolveTacticalStrikeTarget(string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Tactical strike only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");
            if (!room.State.HasMapLocation)
                return (null, "This room does not have a valid map location configured.");
            if (!double.IsFinite(heading))
                return (null, "A valid heading is required to resolve a tactical strike target.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Only a Commander can resolve a tactical strike target.");
            if (!TryGetPlayerPosition(room.State, player, out _, out _, out _, out _))
                return (null, "Your location is required to resolve a tactical strike target.");

            return (ResolveClosestAdjacentHex(room.State, player, heading), null);
        }
    }

    public (GameState? state, string? error) ActivateTacticalStrike(string roomCode, string userId, int targetQ, int targetR)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Tactical strike only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Tactical strike can only be performed by Commanders.");
            if (player.TacticalStrikeCooldownUntil.HasValue && player.TacticalStrikeCooldownUntil > DateTime.UtcNow)
                return (null, "Tactical strike is on cooldown.");
            if (!GameplayService.TryGetCurrentHex(room.State, player, out var currentQ, out var currentR))
                return (null, "Your location is required to activate Tactical Strike.");

            var targetKey = HexService.Key(targetQ, targetR);
            if (!room.State.Grid.ContainsKey(targetKey))
                return (null, "Invalid target hex.");
            if (HexService.HexDistance(currentQ, currentR, targetQ, targetR) > 1)
                return (null, "Tactical Strike target must be your current hex or an adjacent hex.");

            player.TacticalStrikeActive = true;
            player.TacticalStrikeExpiry = DateTime.UtcNow.AddMinutes(5);
            player.TacticalStrikeCooldownUntil = DateTime.UtcNow.AddMinutes(20);
            player.TacticalStrikeTargetQ = targetQ;
            player.TacticalStrikeTargetR = targetR;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "TacticalStrikeActivated",
                Message = $"{player.Name} activated Tactical Strike on ({targetQ}, {targetR}).",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = targetQ,
                R = targetR
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateRallyPoint(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Rally Point only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null) return (null, "Player not in room.");
            if (player.Role != PlayerRole.Commander)
                return (null, "Rally Point can only be activated by a Commander.");
            if (player.RallyPointCooldownUntil.HasValue && player.RallyPointCooldownUntil > DateTime.UtcNow)
                return (null, "Rally Point is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to activate a Rally Point.");
            if (!IsFriendlyCell(player, currentCell))
                return (null, "Rally Point must be activated on a friendly hex.");

            player.RallyPointActive = true;
            player.RallyPointDeadline = DateTime.UtcNow.AddMinutes(3);
            player.RallyPointCooldownUntil = DateTime.UtcNow.AddMinutes(15);
            player.RallyPointQ = currentCell.Q;
            player.RallyPointR = currentCell.R;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "RallyPointActivated",
                Message = $"{player.Name} called a rally at ({currentCell.Q}, {currentCell.R})! Converge for bonus troops!",
                PlayerId = userId, PlayerName = player.Name,
                Q = currentCell.Q, R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateShieldWall(string roomCode, string userId)
        => (null, "Shield Wall has been removed.");

    public (GameState? state, string? error) StartFortConstruction(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Fort construction only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Engineer)
                return (null, "Only an Engineer can start fort construction.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to start fort construction.");
            if (currentCell.OwnerId != userId)
                return (null, "Fort construction must start on one of your own hexes.");
            if (currentCell.IsFort)
                return (null, "This hex is already a fort.");
            if (player.FortTargetQ.HasValue)
                return (null, "You are already constructing a fort.");

            player.FortTargetQ = currentCell.Q;
            player.FortTargetR = currentCell.R;
            player.FortPerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "FortConstructionStarted",
                Message = $"Fort construction started at ({currentCell.Q}, {currentCell.R}).",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = currentCell.Q,
                R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) CancelFortConstruction(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (!player.FortTargetQ.HasValue || !player.FortTargetR.HasValue)
                return (null, "You do not have a fort construction mission in progress.");

            var targetQ = player.FortTargetQ;
            var targetR = player.FortTargetR;
            player.FortTargetQ = null;
            player.FortTargetR = null;
            player.FortPerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "FortConstructionCancelled",
                Message = $"{player.Name} cancelled fort construction.",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = targetQ,
                R = targetR
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ActivateSabotage(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Sabotage only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null) return (null, "Player not in room.");
            if (player.Role != PlayerRole.Engineer)
                return (null, "Sabotage can only be performed by an Engineer.");
            if (player.SabotageCooldownUntil.HasValue && player.SabotageCooldownUntil > DateTime.UtcNow)
                return (null, "Sabotage is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to sabotage a hex.");

            var now = DateTime.UtcNow;
            CleanupExpiredSabotageBlockedTiles(player, now);
            var targetKey = HexService.Key(currentCell.Q, currentCell.R);
            if (player.SabotageBlockedTiles.TryGetValue(targetKey, out var blockedUntil) && blockedUntil > now)
            {
                var remaining = blockedUntil - now;
                return (null, $"Sabotage is blocked on this hex for another {FormatRemainingDuration(remaining)}.");
            }

            if (IsFriendlyCell(player, currentCell) || currentCell.OwnerId == null)
                return (null, "You can only sabotage an enemy hex.");

            player.SabotageTargetQ = currentCell.Q;
            player.SabotageTargetR = currentCell.R;
            player.SabotagePerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "SabotageStarted",
                Message = $"{player.Name} is sabotaging ({currentCell.Q}, {currentCell.R})! Defend it!",
                PlayerId = userId, PlayerName = player.Name,
                Q = currentCell.Q, R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) CancelSabotage(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (!player.SabotageTargetQ.HasValue || !player.SabotageTargetR.HasValue)
                return (null, "You do not have a sabotage mission in progress.");

            var targetQ = player.SabotageTargetQ;
            var targetR = player.SabotageTargetR;
            player.SabotageTargetQ = null;
            player.SabotageTargetR = null;
            player.SabotagePerimeterVisited.Clear();

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "SabotageCancelled",
                Message = $"{player.Name} cancelled sabotage.",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = targetQ,
                R = targetR
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) StartDemolish(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Demolish only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (player.Role != PlayerRole.Engineer)
                return (null, "Demolish can only be performed by Engineers.");
            if (player.DemolishCooldownUntil.HasValue && player.DemolishCooldownUntil > DateTime.UtcNow)
                return (null, "Demolish is on cooldown.");
            if (!TryGetCurrentHex(room.State, player, out var currentCell))
                return (null, "Your location is required to use Demolish.");
            if (!currentCell.IsFort)
                return (null, "Demolish requires an enemy fort.");
            if (IsFriendlyCell(player, currentCell) || currentCell.OwnerId == null)
                return (null, "Demolish requires an enemy fort.");

            player.DemolishTargetKey = HexService.Key(currentCell.Q, currentCell.R);
            player.DemolishApproachDirectionsMade.Clear();
            player.DemolishFacingLockStartAt = null;
            player.DemolishFacingHexKey = null;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "DemolishStarted",
                Message = $"{player.Name} started demolishing the fort at ({currentCell.Q}, {currentCell.R}).",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = currentCell.Q,
                R = currentCell.R
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) CancelDemolish(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");
            if (string.IsNullOrEmpty(player.DemolishTargetKey))
                return (null, "You do not have a demolish mission in progress.");

            int? targetQ = null;
            int? targetR = null;
            if (room.State.Grid.TryGetValue(player.DemolishTargetKey, out var targetCell))
            {
                targetQ = targetCell.Q;
                targetR = targetCell.R;
            }

            player.DemolishTargetKey = null;
            player.DemolishApproachDirectionsMade.Clear();
            player.DemolishFacingLockStartAt = null;
            player.DemolishFacingHexKey = null;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "DemolishCancelled",
                Message = $"{player.Name} cancelled demolish.",
                PlayerId = userId,
                PlayerName = player.Name,
                Q = targetQ,
                R = targetR
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (InterceptAttemptResult? result, string? error) AttemptIntercept(string roomCode, string userId, double heading)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Intercept only works during gameplay.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not active.");
            if (!double.IsFinite(heading))
                return (null, "A valid heading is required to attempt an intercept.");

            var scout = room.State.Players.FirstOrDefault(player => player.Id == userId);
            if (scout == null)
                return (null, "Player not in room.");
            if (scout.Role != PlayerRole.Scout)
                return (null, "Only a Scout can attempt an intercept.");
            if (!GameplayService.TryGetCurrentHex(room.State, scout, out var scoutQ, out var scoutR)
                || !TryGetPlayerCoordinates(room.State, scout, out var scoutLat, out var scoutLng))
            {
                return (null, "Your location is required to attempt an intercept.");
            }

            PlayerDto? engineer = null;
            if (string.IsNullOrWhiteSpace(scout.InterceptTargetId))
            {
                engineer = room.State.Players
                    .Where(candidate => candidate.Id != scout.Id
                        && GameplayService.TryGetCurrentHex(room.State, candidate, out var candidateQ, out var candidateR)
                        && candidateQ == scoutQ
                        && candidateR == scoutR
                        && HasActiveSabotage(candidate)
                        && (scout.AllianceId == null || candidate.AllianceId != scout.AllianceId))
                    .OrderBy(candidate => TryGetPlayerCoordinates(room.State, candidate, out var candidateLat, out var candidateLng)
                        ? GetDistanceScore(scoutLat, scoutLng, candidateLat, candidateLng)
                        : double.MaxValue)
                    .FirstOrDefault();

                if (engineer == null)
                    return (new InterceptAttemptResult("noTarget"), null);

                scout.InterceptTargetId = engineer.Id;
                scout.InterceptLockStartAt = null;
            }
            else
            {
                engineer = room.State.Players.FirstOrDefault(candidate => candidate.Id == scout.InterceptTargetId);
            }

            if (engineer == null
                || !HasActiveSabotage(engineer)
                || !GameplayService.TryGetCurrentHex(room.State, engineer, out var engineerQ, out var engineerR)
                || engineerQ != scoutQ
                || engineerR != scoutR)
            {
                ClearInterceptTracking(scout);
                return (new InterceptAttemptResult("noTarget"), null);
            }

            if (!TryGetPlayerCoordinates(room.State, engineer, out var engineerLat, out var engineerLng))
            {
                ClearInterceptTracking(scout);
                return (new InterceptAttemptResult("noTarget"), null);
            }

            var normalizedHeading = HexService.NormalizeHeading(heading);
            var bearingToEngineer = HexService.BearingDegrees(scoutLat, scoutLng, engineerLat, engineerLng);
            var scoutFacingEngineer = HexService.HeadingDiff(normalizedHeading, bearingToEngineer) <= 20d;
            var reverseBearing = HexService.BearingDegrees(engineerLat, engineerLng, scoutLat, scoutLng);
            var engineerFacingScout = engineer.CurrentHeading.HasValue
                && HexService.HeadingDiff(HexService.NormalizeHeading(engineer.CurrentHeading.Value), reverseBearing) <= 90d;

            if (!scoutFacingEngineer || engineerFacingScout)
            {
                scout.InterceptLockStartAt = null;
                return (new InterceptAttemptResult("broken"), null);
            }

            var now = DateTime.UtcNow;
            if (!scout.InterceptLockStartAt.HasValue)
            {
                scout.InterceptLockStartAt = now;
                return (new InterceptAttemptResult("locking", 0d), null);
            }

            var elapsedSeconds = (now - scout.InterceptLockStartAt.Value).TotalSeconds;
            if (elapsedSeconds < 5d)
                return (new InterceptAttemptResult("locking", elapsedSeconds), null);

            var targetHexKey = HexService.Key(engineer.SabotageTargetQ!.Value, engineer.SabotageTargetR!.Value);
            ClearSabotageTracking(engineer);
            engineer.SabotageBlockedTiles[targetHexKey] = now.AddMinutes(5);
            ClearInterceptTracking(scout);

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (new InterceptAttemptResult("success"), null);
        }
    }
}
