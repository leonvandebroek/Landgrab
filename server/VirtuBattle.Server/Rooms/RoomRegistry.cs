using System.Text.RegularExpressions;

namespace VirtuBattle.Server.Rooms;

/// <summary>
/// In-memory rooms keyed by join code. One connection is one player.
/// Thread-safe: SignalR invokes hub methods concurrently from many connections.
/// </summary>
public sealed partial class RoomRegistry(TimeProvider timeProvider)
{
    public const int MaxDisplayNameLength = 24;

    private readonly Lock _gate = new();
    private readonly Dictionary<string, Dictionary<string, Player>> _rooms = new(StringComparer.Ordinal);
    private readonly Dictionary<string, Player> _byConnection = new(StringComparer.Ordinal);

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
            if (_byConnection.TryGetValue(connectionId, out var existing))
            {
                if (existing.RoomCode == code)
                {
                    return new JoinResult(existing, RosterOf(code), PreviousRoomCode: null);
                }

                RemoveLocked(connectionId);
                previousRoom = existing.RoomCode;
            }

            var player = new Player(
                PlayerId: Guid.NewGuid().ToString("N"),
                DisplayName: name,
                RoomCode: code,
                JoinedAt: timeProvider.GetUtcNow());

            if (!_rooms.TryGetValue(code, out var room))
            {
                room = new Dictionary<string, Player>(StringComparer.Ordinal);
                _rooms[code] = room;
            }

            room[connectionId] = player;
            _byConnection[connectionId] = player;
            return new JoinResult(player, RosterOf(code), previousRoom);
        }
    }

    /// <summary>Removes the connection from its room. Returns null when it was not in a room.</summary>
    public LeaveResult? Leave(string connectionId)
    {
        lock (_gate)
        {
            var player = RemoveLocked(connectionId);
            return player is null ? null : new LeaveResult(player, RosterOf(player.RoomCode));
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

    private Player? RemoveLocked(string connectionId)
    {
        if (!_byConnection.Remove(connectionId, out var player))
        {
            return null;
        }

        if (_rooms.TryGetValue(player.RoomCode, out var room))
        {
            room.Remove(connectionId);
            if (room.Count == 0)
            {
                _rooms.Remove(player.RoomCode);
            }
        }

        return player;
    }

    private IReadOnlyList<Player> RosterOf(string roomCode) =>
        _rooms.TryGetValue(roomCode, out var room)
            ? room.Values.OrderBy(p => p.JoinedAt).ThenBy(p => p.PlayerId, StringComparer.Ordinal).ToArray()
            : [];

    [GeneratedRegex("^[A-Z0-9]{4,8}$")]
    private static partial Regex RoomCodePattern();
}

public sealed record JoinResult(Player Player, IReadOnlyList<Player> Roster, string? PreviousRoomCode);

public sealed record LeaveResult(Player Player, IReadOnlyList<Player> Roster);
