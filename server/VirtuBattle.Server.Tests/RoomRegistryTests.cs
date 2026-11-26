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

    // About 0.0009 degrees of latitude is 100 m.
    private const double Lat = 51.4416, Lon = 5.4697;

    [Fact]
    public void UpdatePosition_outside_a_room_returns_null() =>
        Assert.Null(_rooms.UpdatePosition("nope", Lat, Lon, 5, 0));

    [Theory]
    [InlineData(91, 0, 5)]
    [InlineData(0, 181, 5)]
    [InlineData(0, 0, -1)]
    [InlineData(double.NaN, 0, 5)]
    public void UpdatePosition_rejects_invalid_values(double lat, double lon, double accuracy)
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        Assert.Throws<ArgumentException>(() => _rooms.UpdatePosition("c1", lat, lon, accuracy, 0));
    }

    [Fact]
    public void Single_player_with_a_position_stays_idle()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        var result = _rooms.UpdatePosition("c1", Lat, Lon, 5, 0);

        Assert.NotNull(result);
        Assert.Empty(result.ModeChanges);
    }

    [Fact]
    public void Two_players_100m_apart_both_become_engaged()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        _rooms.Join("c2", "ABCD", "Ralph");
        _rooms.UpdatePosition("c1", Lat, Lon, 5, 0);

        var result = _rooms.UpdatePosition("c2", Lat + 0.0009, Lon, 5, 0);

        Assert.NotNull(result);
        Assert.Equal(2, result.ModeChanges.Count);
        Assert.All(result.ModeChanges, c => Assert.Equal(RateMode.Engaged, c.Mode));
        Assert.All(result.ModeChanges, c => Assert.InRange(c.NearestDistanceMeters!.Value, 95, 105));
    }

    [Fact]
    public void Walking_close_switches_to_close_combat_and_only_reports_changes()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        _rooms.Join("c2", "ABCD", "Ralph");
        _rooms.UpdatePosition("c1", Lat, Lon, 5, 0);
        _rooms.UpdatePosition("c2", Lat + 0.0009, Lon, 5, 0);

        var stillEngaged = _rooms.UpdatePosition("c2", Lat + 0.0008, Lon, 5, 0);
        Assert.Empty(stillEngaged!.ModeChanges);

        var close = _rooms.UpdatePosition("c2", Lat + 0.0002, Lon, 5, 0);
        Assert.Equal(2, close!.ModeChanges.Count);
        Assert.All(close.ModeChanges, c => Assert.Equal(RateMode.CloseCombat, c.Mode));
    }

    [Fact]
    public void When_the_opponent_leaves_the_remaining_player_goes_idle()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        _rooms.Join("c2", "ABCD", "Ralph");
        _rooms.UpdatePosition("c1", Lat, Lon, 5, 0);
        _rooms.UpdatePosition("c2", Lat + 0.0009, Lon, 5, 0);

        var left = _rooms.Leave("c2");

        var change = Assert.Single(left!.ModeChanges);
        Assert.Equal("c1", change.ConnectionId);
        Assert.Equal(RateMode.Idle, change.Mode);
    }

    [Fact]
    public void Stale_positions_do_not_count()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        _rooms.Join("c2", "ABCD", "Ralph");
        _rooms.UpdatePosition("c2", Lat + 0.0009, Lon, 5, 0);
        _time.Advance(RoomRegistry.PositionStaleAfter + TimeSpan.FromSeconds(1));

        var result = _rooms.UpdatePosition("c1", Lat, Lon, 5, 0);

        Assert.Empty(result!.ModeChanges);
    }

    [Fact]
    public void Late_joiner_gets_existing_positions()
    {
        _rooms.Join("c1", "ABCD", "Léoke");
        _rooms.UpdatePosition("c1", Lat, Lon, 4, 123);

        var joined = _rooms.Join("c2", "ABCD", "Ralph");

        var position = Assert.Single(joined.Positions);
        Assert.Equal("Léoke", position.Player.DisplayName);
        Assert.Equal(123, position.Position.ClientTimestampMs);
    }
}
