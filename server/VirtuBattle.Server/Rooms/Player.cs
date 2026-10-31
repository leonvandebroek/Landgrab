namespace VirtuBattle.Server.Rooms;

/// <summary>A connected player in a room. Positions and game state arrive in later milestones.</summary>
public sealed record Player(string PlayerId, string DisplayName, string RoomCode, DateTimeOffset JoinedAt);
