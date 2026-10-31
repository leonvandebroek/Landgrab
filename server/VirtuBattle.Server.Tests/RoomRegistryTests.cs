using Microsoft.Extensions.Time.Testing;
using VirtuBattle.Server.Rooms;

namespace VirtuBattle.Server.Tests;

public class RoomRegistryTests
{
    private readonly FakeTimeProvider _time = new(DateTimeOffset.Parse("2026-11-01T10:00:00Z"));
    private readonly RoomRegistry _rooms;

    public RoomRegistryTests() => _rooms = new RoomRegistry(_time);

    [Theory]
    [InlineData("abcd", "ABCD")]
    [InlineData("  scout1 ", "SCOUT1")]
    [InlineData("A1B2C3D4", "A1B2C3D4")]
    public void NormalizeRoomCode_accepts_valid_codes(string input, string expected) =>
        Assert.Equal(expected, RoomRegistry.NormalizeRoomCode(input));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("abcdefghi")]
    [InlineData("ab-cd")]
    public void NormalizeRoomCode_rejects_invalid_codes(string? input) =>
        Assert.Throws<ArgumentException>(() => RoomRegistry.NormalizeRoomCode(input));

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("1234567890123456789012345")]
    public void Join_rejects_invalid_names(string name) =>
        Assert.Throws<ArgumentException>(() => _rooms.Join("c1", "ABCD", name));

    [Fact]
    public void Join_adds_players_in_join_order()
    {
        _rooms.Join("c1", "abcd", "Léoke");
        _time.Advance(TimeSpan.FromSeconds(1));
        var second = _rooms.Join("c2", "ABCD", "Ralph");

        Assert.Equal(["Léoke", "Ralph"], second.Roster.Select(p => p.DisplayName));
        Assert.Equal("ABCD", second.Player.RoomCode);
        Assert.Null(second.PreviousRoomCode);
    }

    [Fact]
    public void Join_same_room_twice_keeps_the_player()
    {
        var first = _rooms.Join("c1", "ABCD", "Léoke");
        var again = _rooms.Join("c1", "abcd", "Léoke");

        Assert.Equal(first.Player.PlayerId, again.Player.PlayerId);
        Assert.Single(again.Roster);
    }

    [Fact]
    public void Join_other_room_moves_the_player_and_reports_the_old_room()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        var moved = _rooms.Join("c1", "WXYZ", "Léoke");

        Assert.Equal("ABCD", moved.PreviousRoomCode);
        Assert.Empty(_rooms.GetRoster("ABCD"));
        Assert.Single(_rooms.GetRoster("WXYZ"));
        Assert.Equal(1, _rooms.RoomCount);
    }

    [Fact]
    public void Leave_removes_player_and_empty_room()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        _rooms.Join("c2", "ABCD", "Ralph");

        var left = _rooms.Leave("c1");

        Assert.NotNull(left);
        Assert.Equal("Léoke", left.Player.DisplayName);
        Assert.Equal(["Ralph"], left.Roster.Select(p => p.DisplayName));

        _rooms.Leave("c2");
        Assert.Equal(0, _rooms.RoomCount);
    }

    [Fact]
    public void Leave_unknown_connection_returns_null() => Assert.Null(_rooms.Leave("nope"));
}
