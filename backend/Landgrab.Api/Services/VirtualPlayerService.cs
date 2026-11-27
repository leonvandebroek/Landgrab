using System.Collections.Concurrent;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

/// <summary>
/// Test mode: server-side virtual (bot) players that a host can add to their own lobby so the game
/// can be played solo. During play the bots walk around the game area like real people, pick up
/// troops, claim neutral hexes and attack enemy hexes through the same rules as human players.
/// </summary>
public class VirtualPlayerService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    GameplayService gameplayService,
    ILogger<VirtualPlayerService> logger)
    : RoomScopedServiceBase(roomProvider, gameStateService)
{
    public const int MaxVirtualPlayers = 8;
    internal const string VirtualPlayerEmoji = "🤖";

    private static readonly string[] BotNames =
        ["Alfa", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];

    private readonly ConcurrentDictionary<string, BotBrain> _brains = new(StringComparer.Ordinal);

    // ── Lobby ────────────────────────────────────────────────────────────

    /// <summary>Adds or removes virtual players in the lobby until the room has <paramref name="count"/> of them.</summary>
    public (GameState? state, string? error) SetVirtualPlayerCount(string roomCode, string userId, int count)
    {
        if (count < 0 || count > MaxVirtualPlayers)
            return (null, $"You can add between 0 and {MaxVirtualPlayers} virtual players.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can add virtual players.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Virtual players can only be changed in the lobby.");

            var state = room.State;
            var bots = state.Players.Where(p => p.IsVirtual).ToList();

            while (bots.Count > count)
            {
                var bot = bots[^1];
                bots.RemoveAt(bots.Count - 1);
                RemoveVirtualPlayer(state, bot);
            }

            while (bots.Count < count)
            {
                if (state.Players.Count >= 30)
                    return (null, "Room is full (max 30 players).");

                var bot = CreateVirtualPlayer(state);
                state.Players.Add(bot);
                bots.Add(bot);
                AssignToAlliance(state, bot);
                GameStateCommon.SyncBeaconStateForRole(state, bot);
                AppendEventLog(state, new GameEventLogEntry
                {
                    Type = "PlayerJoined",
                    Message = $"{bot.Name} (virtual player) joined the room.",
                    PlayerId = bot.Id,
                    PlayerName = bot.Name
                });
            }

            GameplayService.RefreshTerritoryCount(state);
            var snapshot = SnapshotState(state);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    /// <summary>Puts every virtual player that has no alliance into the smallest alliance.</summary>
    internal static void AssignUnallocatedVirtualPlayers(GameState state)
    {
        foreach (var bot in state.Players.Where(p => p.IsVirtual && string.IsNullOrWhiteSpace(p.AllianceId)))
            AssignToAlliance(state, bot);
    }

    private static PlayerDto CreateVirtualPlayer(GameState state)
    {
        var usedNames = state.Players.Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var name = BotNames
            .Select(n => $"Bot {n}")
            .FirstOrDefault(n => !usedNames.Contains(n))
            ?? $"Bot {state.Players.Count + 1}";

        return new PlayerDto
        {
            Id = Guid.NewGuid().ToString(),
            Name = name,
            Color = GameStateCommon.Colors[state.Players.Count % GameStateCommon.Colors.Length],
            Emoji = VirtualPlayerEmoji,
            IsVirtual = true,
            IsConnected = true
        };
    }

    private static void AssignToAlliance(GameState state, PlayerDto bot)
    {
        if (state.Alliances.Count == 0)
            return;

        var hostAllianceId = state.Players.FirstOrDefault(p => p.IsHost)?.AllianceId;
        // Balance the teams; on a tie prefer an alliance the host is not in so there is an opponent.
        var alliance = state.Alliances
            .OrderBy(a => state.Players.Count(p => p.AllianceId == a.Id))
            .ThenBy(a => a.Id == hostAllianceId ? 1 : 0)
            .First();

        foreach (var existing in state.Alliances)
            existing.MemberIds.Remove(bot.Id);

        alliance.MemberIds.Add(bot.Id);
        bot.AllianceId = alliance.Id;
        bot.AllianceName = alliance.Name;
        bot.AllianceColor = alliance.Color;
        bot.Color = alliance.Color;
    }

    private void RemoveVirtualPlayer(GameState state, PlayerDto bot)
    {
        state.Players.Remove(bot);
        foreach (var alliance in state.Alliances)
            alliance.MemberIds.Remove(bot.Id);

        foreach (var cell in state.Grid.Values.Where(c => c.OwnerId == bot.Id))
        {
            cell.OwnerId = null;
            cell.OwnerAllianceId = null;
            cell.OwnerName = null;
            cell.OwnerColor = null;
            cell.Troops = 0;
        }

        _brains.TryRemove(BrainKey(state.RoomCode, bot.Id), out _);
    }

    // ── Gameplay ─────────────────────────────────────────────────────────

    /// <summary>Advances every virtual player in the room by <paramref name="elapsed"/>.</summary>
    public VirtualPlayerTickResult Tick(string roomCode, TimeSpan elapsed, DateTime? utcNow = null)
    {
        var result = new VirtualPlayerTickResult();
        var room = GetRoom(roomCode);
        if (room == null)
            return result;

        lock (room.SyncRoot)
        {
            var state = room.State;
            if (state.Phase != GamePhase.Playing || state.IsPaused || !state.HasMapLocation)
                return result;

            var bots = state.Players.Where(p => p.IsVirtual).ToList();
            if (bots.Count == 0)
                return result;

            result.HasVirtualPlayers = true;
            var now = utcNow ?? DateTime.UtcNow;
            var seconds = Math.Clamp(elapsed.TotalSeconds, 0.1d, 5d);

            foreach (var bot in bots)
            {
                if (state.Phase != GamePhase.Playing)
                    break;

                try
                {
                    TickBot(room, bot, now, seconds, result);
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Virtual player {BotId} tick failed in {RoomCode}", bot.Id, roomCode);
                }
            }

            result.State = SnapshotState(state);
        }

        return result;
    }

    private void TickBot(GameRoom room, PlayerDto bot, DateTime now, double seconds, VirtualPlayerTickResult result)
    {
        var state = room.State;
        var mapLat = state.MapLat!.Value;
        var mapLng = state.MapLng!.Value;
        var brain = _brains.GetOrAdd(BrainKey(state.RoomCode, bot.Id), _ => new BotBrain());
        bot.IsConnected = true;

        // Spawn (e.g. after a server restart cleared positions) on the bot's own territory.
        if (!bot.CurrentLat.HasValue || !bot.CurrentLng.HasValue)
        {
            var spawn = state.Grid.Values.FirstOrDefault(c => c.OwnerId == bot.Id)
                ?? state.Grid.Values.FirstOrDefault(c => c.OwnerAllianceId != null && c.OwnerAllianceId == bot.AllianceId)
                ?? state.Grid.Values.OrderBy(_ => brain.Random.Next()).FirstOrDefault();
            if (spawn == null)
                return;

            var (spawnLat, spawnLng) = HexService.HexToLatLng(spawn.Q, spawn.R, mapLat, mapLng, state.TileSizeMeters);
            GameplayService.SetPlayerLocation(state, bot, spawnLat, spawnLng);
            brain.PauseUntil = now.AddSeconds(brain.Random.Next(1, 5));
        }

        if (brain.PauseUntil > now)
            return;

        if (brain.Target == null || !state.Grid.ContainsKey(HexService.Key(brain.Target.Value.q, brain.Target.Value.r)))
            ChooseGoal(state, bot, brain);

        if (brain.Target == null)
            return;

        var (tq, tr) = brain.Target.Value;
        var (targetLat, targetLng) = HexService.HexToLatLng(tq, tr, mapLat, mapLng, state.TileSizeMeters);
        targetLat += brain.TargetOffsetLat;
        targetLng += brain.TargetOffsetLng;

        var lat = bot.CurrentLat!.Value;
        var lng = bot.CurrentLng!.Value;
        var (dx, dy) = MetersBetween(lat, lng, targetLat, targetLng);
        var distance = Math.Sqrt(dx * dx + dy * dy);
        var step = brain.SpeedMetersPerSecond * seconds;
        var arrived = distance <= step;

        double newLat, newLng;
        if (arrived)
        {
            newLat = targetLat;
            newLng = targetLng;
        }
        else
        {
            // Walk towards the target with a little sideways wobble, like a person on foot.
            var wobble = (brain.Random.NextDouble() - 0.5d) * 0.35d;
            var ux = dx / distance;
            var uy = dy / distance;
            var mx = (ux - uy * wobble) * step;
            var my = (uy + ux * wobble) * step;
            (newLat, newLng) = OffsetMeters(lat, lng, mx, my);
        }

        var heading = HexService.BearingDegrees(lat, lng, newLat, newLng);
        var (moveState, moveError, gridChanged, _, fledBattle) =
            gameplayService.UpdatePlayerLocation(state.RoomCode, bot.Id, newLat, newLng, heading);
        if (moveError != null || moveState == null)
        {
            brain.Target = null;
            return;
        }

        result.AnyMoved = true;
        result.GridChanged |= gridChanged;
        if (fledBattle != null)
            result.FledBattleIds.Add(fledBattle.Id);

        if (!arrived)
            return;

        ActOnArrival(state, bot, brain, tq, tr, newLat, newLng, result);
        brain.Target = null;
        // Stand still for a moment, as if tapping the phone.
        brain.PauseUntil = now.AddSeconds(2 + brain.Random.NextDouble() * 5);
    }

    private void ActOnArrival(GameState state, PlayerDto bot, BotBrain brain, int q, int r, double lat, double lng,
        VirtualPlayerTickResult result)
    {
        if (!state.Grid.TryGetValue(HexService.Key(q, r), out var cell))
            return;

        switch (brain.Goal)
        {
            case BotGoal.PickUp:
                if (cell.Troops >= 2 && (cell.OwnerId == bot.Id || (bot.AllianceId != null && cell.OwnerAllianceId == bot.AllianceId)))
                {
                    var (pickState, pickError) = gameplayService.PickUpTroops(state.RoomCode, bot.Id, q, r, cell.Troops - 1, lat, lng);
                    result.GridChanged |= pickError == null && pickState != null;
                }
                break;

            case BotGoal.Claim:
            case BotGoal.Attack:
            case BotGoal.Reinforce:
                if (bot.CarriedTroops <= 0 && state.ClaimMode == ClaimMode.PresenceWithTroop)
                    break;
                if (brain.Goal != BotGoal.Claim && bot.CarriedTroops <= 0)
                    break;

                var (placeState, placeError, previousOwnerId, _) =
                    gameplayService.PlaceTroops(state.RoomCode, bot.Id, q, r, lat, lng);
                if (placeError != null || placeState == null)
                {
                    logger.LogDebug("Virtual player {Bot} could not act on ({Q},{R}): {Error}", bot.Name, q, r, placeError);
                    break;
                }

                result.GridChanged = true;
                if (previousOwnerId != null)
                {
                    result.TilesLost.Add(new VirtualPlayerTileLost(previousOwnerId, q, r, bot.Name));
                }
                break;
        }
    }

    private static void ChooseGoal(GameState state, PlayerDto bot, BotBrain brain)
    {
        var random = brain.Random;
        brain.TargetOffsetLat = 0;
        brain.TargetOffsetLng = 0;
        if (!GameplayService.TryGetCurrentHex(state, bot, out var bq, out var br))
            return;

        bool IsOwn(HexCell c) => c.OwnerId == bot.Id || (bot.AllianceId != null && c.OwnerAllianceId == bot.AllianceId);
        bool IsHq(HexCell c) => state.Dynamics.HQEnabled && state.Alliances.Any(a => a.HQHexQ == c.Q && a.HQHexR == c.R);
        int Dist(HexCell c) => HexService.HexDistance(c.Q, c.R, bq, br);

        HexCell? Pick(IEnumerable<HexCell> candidates)
        {
            // Mostly go for one of the nearest options, sometimes something further away.
            var ordered = candidates.OrderBy(Dist).ThenBy(_ => random.Next()).Take(4).ToList();
            return ordered.Count == 0 ? null : ordered[random.Next(ordered.Count)];
        }

        HexCell? target = null;
        var goal = BotGoal.Wander;

        if (bot.CarriedTroops > 0)
        {
            var attackable = state.Grid.Values.Where(c =>
                c.OwnerId != null && !IsOwn(c) && !c.IsMasterTile && !IsHq(c) && c.Troops < bot.CarriedTroops);
            var claimable = state.Grid.Values.Where(c =>
                c.OwnerId == null && !c.IsMasterTile &&
                (state.ClaimMode != ClaimMode.AdjacencyRequired || HexService.IsAdjacentToOwned(state.Grid, c.Q, c.R, bot.Id, bot.AllianceId)));

            // Real opponents go after the people they play against: prefer hexes held by a human
            // (also when it is an even fight), then any other enemy hex they can beat.
            var humanIds = state.Players.Where(p => !p.IsVirtual).Select(p => p.Id).ToHashSet(StringComparer.Ordinal);
            var humanTargets = state.Grid.Values.Where(c =>
                c.OwnerId != null && humanIds.Contains(c.OwnerId) && !IsOwn(c) && !c.IsMasterTile && !IsHq(c)
                && c.Troops <= bot.CarriedTroops);

            var roll = random.NextDouble();
            if (roll < 0.6d && (target = Pick(humanTargets)) != null)
                goal = BotGoal.Attack;
            else if (roll < 0.75d && (target = Pick(attackable)) != null)
                goal = BotGoal.Attack;
            else if (roll < 0.9d && (target = Pick(claimable)) != null)
                goal = BotGoal.Claim;
            else if ((target = Pick(state.Grid.Values.Where(c => IsOwn(c) && !c.IsMasterTile))) != null)
                goal = BotGoal.Reinforce;
        }
        else if (state.ClaimMode != ClaimMode.PresenceWithTroop && random.NextDouble() < 0.35d)
        {
            var claimable = state.Grid.Values.Where(c =>
                c.OwnerId == null && !c.IsMasterTile &&
                (state.ClaimMode != ClaimMode.AdjacencyRequired || HexService.IsAdjacentToOwned(state.Grid, c.Q, c.R, bot.Id, bot.AllianceId)));
            if ((target = Pick(claimable)) != null)
                goal = BotGoal.Claim;
        }

        if (target == null && bot.CarriedTroops == 0)
        {
            target = Pick(state.Grid.Values.Where(c => IsOwn(c) && !c.IsMasterTile && c.Troops >= 2));
            if (target != null)
                goal = BotGoal.PickUp;
        }

        if (target == null)
        {
            // Wander: often towards a human player so bots cross paths with them, otherwise anywhere.
            var humans = state.Players.Where(p => !p.IsVirtual && p.CurrentHexQ.HasValue && p.CurrentHexR.HasValue).ToList();
            if (humans.Count > 0 && random.NextDouble() < 0.5d)
            {
                var human = humans[random.Next(humans.Count)];
                target = state.Grid.Values
                    .Where(c => HexService.HexDistance(c.Q, c.R, human.CurrentHexQ!.Value, human.CurrentHexR!.Value) <= 3)
                    .OrderBy(_ => random.Next())
                    .FirstOrDefault();
            }

            target ??= state.Grid.Values.OrderBy(_ => random.Next()).FirstOrDefault();
            goal = BotGoal.Wander;
            // Don't aim exactly for the centre when just wandering.
            var jitter = state.TileSizeMeters * 0.4d;
            brain.TargetOffsetLat = (random.NextDouble() - 0.5d) * jitter / 111_320d;
            brain.TargetOffsetLng = (random.NextDouble() - 0.5d) * jitter
                / (111_320d * Math.Max(Math.Cos((state.MapLat ?? 0d) * Math.PI / 180d), 1e-9d));
        }

        brain.Target = target == null ? null : (target.Q, target.R);
        brain.Goal = goal;
        brain.SpeedMetersPerSecond = 1.6d + random.NextDouble() * 2.2d;
    }

    private static string BrainKey(string roomCode, string botId) => $"{roomCode}:{botId}";

    private static (double dx, double dy) MetersBetween(double lat1, double lng1, double lat2, double lng2)
    {
        var dy = (lat2 - lat1) * 111_320d;
        var dx = (lng2 - lng1) * 111_320d * Math.Cos(lat1 * Math.PI / 180d);
        return (dx, dy);
    }

    private static (double lat, double lng) OffsetMeters(double lat, double lng, double dx, double dy)
    {
        var newLat = lat + dy / 111_320d;
        var newLng = lng + dx / (111_320d * Math.Max(Math.Cos(lat * Math.PI / 180d), 1e-9d));
        return (newLat, newLng);
    }

    private enum BotGoal
    {
        Wander,
        PickUp,
        Claim,
        Attack,
        Reinforce
    }

    private sealed class BotBrain
    {
        public Random Random { get; } = new();
        public (int q, int r)? Target { get; set; }
        public BotGoal Goal { get; set; }
        public double TargetOffsetLat { get; set; }
        public double TargetOffsetLng { get; set; }
        public double SpeedMetersPerSecond { get; set; } = 2.5d;
        public DateTime PauseUntil { get; set; }
    }
}

public sealed record VirtualPlayerTileLost(string PreviousOwnerId, int Q, int R, string AttackerName);

public sealed class VirtualPlayerTickResult
{
    public bool HasVirtualPlayers { get; set; }
    public bool AnyMoved { get; set; }
    public bool GridChanged { get; set; }
    public GameState? State { get; set; }
    public List<VirtualPlayerTileLost> TilesLost { get; } = [];
    public List<Guid> FledBattleIds { get; } = [];
}
