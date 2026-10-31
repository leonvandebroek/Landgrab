using VirtuBattle.Server.Rooms;

namespace VirtuBattle.Server.Hubs;

// Wire contracts for the game hub. JSON is camelCase; the iOS client mirrors these in
// ios/Packages/VirtuBattleCore/Sources/GameClient/GameMessages.swift. Keep both in sync.

public sealed record PlayerDto(string PlayerId, string DisplayName)
{
    public static PlayerDto From(Player player) => new(player.PlayerId, player.DisplayName);
}

public sealed record JoinRoomResponse(string PlayerId, string RoomCode, IReadOnlyList<PlayerDto> Players, long ServerTimeMs);

public sealed record RosterChangedEvent(string RoomCode, IReadOnlyList<PlayerDto> Players);

public sealed record PongResponse(long ClientTimeMs, long ServerTimeMs);

/// <summary>Server-to-client methods. Names are the SignalR method names the clients listen for.</summary>
public interface IGameClient
{
    Task RosterChanged(RosterChangedEvent evt);
}
