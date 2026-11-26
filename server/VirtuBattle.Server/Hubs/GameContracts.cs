using VirtuBattle.Server.Rooms;

namespace VirtuBattle.Server.Hubs;

// Wire contracts for the game hub. JSON is camelCase and enums are camelCase strings; the iOS client
// mirrors these in ios/Packages/VirtuBattleCore/Sources/GameClient/GameMessages.swift. Keep both in sync.

public sealed record PlayerDto(string PlayerId, string DisplayName)
{
    public static PlayerDto From(Player player) => new(player.PlayerId, player.DisplayName);
}

public sealed record JoinRoomResponse(
    string PlayerId,
    string RoomCode,
    IReadOnlyList<PlayerDto> Players,
    IReadOnlyList<PlayerPositionDto> Positions,
    RateModeChangedEvent RateMode,
    long ServerTimeMs);

public sealed record RosterChangedEvent(string RoomCode, IReadOnlyList<PlayerDto> Players);

public sealed record PongResponse(long ClientTimeMs, long ServerTimeMs);

/// <summary>A position fix from the phone. <c>TimestampMs</c> is when the fix was taken, phone clock.</summary>
public sealed record PositionUpdate(double Latitude, double Longitude, double HorizontalAccuracy, long TimestampMs);

/// <summary>A player's position as relayed to the rest of the room.</summary>
public sealed record PlayerPositionDto(
    string PlayerId,
    double Latitude,
    double Longitude,
    double HorizontalAccuracy,
    long TimestampMs,
    long ServerTimeMs)
{
    public static PlayerPositionDto From(Player player, GeoPosition position) => new(
        player.PlayerId,
        position.Latitude,
        position.Longitude,
        position.HorizontalAccuracy,
        position.ClientTimestampMs,
        position.ReceivedAt.ToUnixTimeMilliseconds());
}

/// <summary>Tells one phone how often to send its position.</summary>
public sealed record RateModeChangedEvent(RateMode Mode, int IntervalMs, double? NearestDistanceMeters)
{
    public static RateModeChangedEvent From(RateMode mode, double? nearest) => new(mode, RateModePolicy.IntervalMs(mode), nearest);
}

/// <summary>Server-to-client methods. Names are the SignalR method names the clients listen for.</summary>
public interface IGameClient
{
    Task RosterChanged(RosterChangedEvent evt);

    Task PlayerMoved(PlayerPositionDto position);

    Task RateModeChanged(RateModeChangedEvent evt);
}
