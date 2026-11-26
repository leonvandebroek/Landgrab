using System.Text.RegularExpressions;
using VirtuBattle.Server.Geo;

namespace VirtuBattle.Server.Rooms;

/// <summary>
/// In-memory rooms keyed by join code. One connection is one player.
/// Thread-safe: SignalR invokes hub methods concurrently from many connections.
/// </summary>
public sealed partial class RoomRegistry(TimeProvider timeProvider)
{
    public const int MaxDisplayNameLength = 24;

    /// <summary>Positions older than this no longer count when picking a rate mode.</summary>
    public static readonly TimeSpan PositionStaleAfter = TimeSpan.FromMinutes(2);

    private readonly Lock _gate = new();
    private readonly Dictionary<string, Dictionary<string, PlayerState>> _rooms = new(StringComparer.Ordinal);
    private readonly Dictionary<string, PlayerState> _byConnection = new(StringComparer.Ordinal);

    private sealed class PlayerState(string connectionId, Player player)
    {
        public string ConnectionId { get; } = connectionId;
        public Player Player { get; } = player;
        public GeoPosition? Position { get; set; }
        public RateMode Mode { get; set; } = RateMode.Idle;
    }

    /// <summary>Normalizes and validates a room code: 4 to 8 letters or digits, case-insensitive.</summary>
    public static string NormalizeRoomCode(string? roomCode)
    {
        var code = (roomCode ?? string.Empty).Trim().ToUpperInvariant();
        if (!RoomCodePattern().IsMatch(code))
        {
            throw new ArgumentException("Room code must be 4 to 8 letters or digits.", nameof(roomCode));
        }

        return code;
    }

    public static string NormalizeDisplayName(string? displayName)
    {
        var name = (displayName ?? string.Empty).Trim();
        if (name.Length == 0 || name.Length > MaxDisplayNameLength)
        {
            throw new ArgumentException($"Name must be 1 to {MaxDisplayNameLength} characters.", nameof(displayName));
        }

        return name;
    }

    /// <summary>
    /// Adds the connection to a room. If the connection was already in a room it leaves that one first,
    /// and the previous room code is returned so callers can notify it.
    /// </summary>
    public JoinResult Join(string connectionId, string? roomCode, string? displayName)
    {
        var code = NormalizeRoomCode(roomCode);
        var name = NormalizeDisplayName(displayName);

        lock (_gate)
        {
            string? previousRoom = null;
            IReadOnlyList<RateModeChange> previousRoomChanges = [];
            if (_byConnection.TryGetValue(connectionId, out var existing))
            {
                if (existing.Player.RoomCode == code)
                {
                    return new JoinResult(existing.Player, RosterOf(code), PositionsOf(code), existing.Mode, null, []);
                }

                RemoveLocked(connectionId);
                previousRoom = existing.Player.RoomCode;
                previousRoomChanges = RecomputeModesLocked(previousRoom);
            }

            var player = new Player(
                PlayerId: Guid.NewGuid().ToString("N"),
                DisplayName: name,
                RoomCode: code,
                JoinedAt: timeProvider.GetUtcNow());

            if (!_rooms.TryGetValue(code, out var room))
            {
                room = new Dictionary<string, PlayerState>(StringComparer.Ordinal);
                _rooms[code] = room;
            }

            var state = new PlayerState(connectionId, player);
            room[connectionId] = state;
            _byConnection[connectionId] = state;
            return new JoinResult(player, RosterOf(code), PositionsOf(code), state.Mode, previousRoom, previousRoomChanges);
        }
    }

    /// <summary>Removes the connection from its room. Returns null when it was not in a room.</summary>
    public LeaveResult? Leave(string connectionId)
    {
        lock (_gate)
        {
            var state = RemoveLocked(connectionId);
            if (state is null)
            {
                return null;
            }

            var code = state.Player.RoomCode;
            return new LeaveResult(state.Player, RosterOf(code), RecomputeModesLocked(code));
        }
    }

    /// <summary>
    /// Stores a player's position and recomputes rate modes in the room. Returns null when the connection
    /// is not in a room.
    /// </summary>
    public PositionResult? UpdatePosition(string connectionId, double latitude, double longitude, double horizontalAccuracy, long clientTimestampMs)
    {
        GeoPosition.Validate(latitude, longitude, horizontalAccuracy);

        lock (_gate)
        {
            if (!_byConnection.TryGetValue(connectionId, out var state))
            {
                return null;
            }

            var position = new GeoPosition(latitude, longitude, horizontalAccuracy, clientTimestampMs, timeProvider.GetUtcNow());
            state.Position = position;
            return new PositionResult(state.Player, position, RecomputeModesLocked(state.Player.RoomCode));
        }
    }

    public IReadOnlyList<Player> GetRoster(string roomCode)
    {
        lock (_gate)
        {
            return RosterOf(roomCode);
        }
    }

    public int RoomCount
    {
        get
        {
            lock (_gate)
            {
                return _rooms.Count;
            }
        }
    }

    private PlayerState? RemoveLocked(string connectionId)
    {
        if (!_byConnection.Remove(connectionId, out var state))
        {
            return null;
        }

        if (_rooms.TryGetValue(state.Player.RoomCode, out var room))
        {
            room.Remove(connectionId);
            if (room.Count == 0)
            {
                _rooms.Remove(state.Player.RoomCode);
            }
        }

        return state;
    }

    /// <summary>Sets each player's mode from the distance to their nearest fresh opponent; returns the ones that changed.</summary>
    private IReadOnlyList<RateModeChange> RecomputeModesLocked(string roomCode)
    {
        if (!_rooms.TryGetValue(roomCode, out var room))
        {
            return [];
        }

        var freshAfter = timeProvider.GetUtcNow() - PositionStaleAfter;
        var located = room.Values.Where(s => s.Position is { } p && p.ReceivedAt >= freshAfter).ToArray();
        var changes = new List<RateModeChange>();

        foreach (var state in room.Values)
        {
            double? nearest = null;
            if (state.Position is { } mine && mine.ReceivedAt >= freshAfter)
            {
                foreach (var other in located)
                {
                    if (ReferenceEquals(other, state))
                    {
                        continue;
                    }

                    var d = GeoMath.DistanceMeters(mine.Latitude, mine.Longitude, other.Position!.Latitude, other.Position.Longitude);
                    nearest = nearest is { } n ? Math.Min(n, d) : d;
                }
            }

            var mode = RateModePolicy.Decide(nearest, state.Mode);
            if (mode != state.Mode)
            {
                state.Mode = mode;
                changes.Add(new RateModeChange(state.ConnectionId, state.Player.PlayerId, mode, nearest));
            }
        }

        return changes;
    }

    private IReadOnlyList<Player> RosterOf(string roomCode) =>
        _rooms.TryGetValue(roomCode, out var room)
            ? room.Values.Select(s => s.Player).OrderBy(p => p.JoinedAt).ThenBy(p => p.PlayerId, StringComparer.Ordinal).ToArray()
            : [];

    private IReadOnlyList<PlayerPosition> PositionsOf(string roomCode) =>
        _rooms.TryGetValue(roomCode, out var room)
            ? room.Values.Where(s => s.Position is not null).Select(s => new PlayerPosition(s.Player, s.Position!)).ToArray()
            : [];

    [GeneratedRegex("^[A-Z0-9]{4,8}$")]
    private static partial Regex RoomCodePattern();
}

public sealed record PlayerPosition(Player Player, GeoPosition Position);

public sealed record JoinResult(
    Player Player,
    IReadOnlyList<Player> Roster,
    IReadOnlyList<PlayerPosition> Positions,
    RateMode Mode,
    string? PreviousRoomCode,
    IReadOnlyList<RateModeChange> PreviousRoomModeChanges);

public sealed record LeaveResult(Player Player, IReadOnlyList<Player> Roster, IReadOnlyList<RateModeChange> ModeChanges);

public sealed record PositionResult(Player Player, GeoPosition Position, IReadOnlyList<RateModeChange> ModeChanges);
