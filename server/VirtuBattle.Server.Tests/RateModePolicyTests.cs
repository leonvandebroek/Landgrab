using VirtuBattle.Server.Rooms;

namespace VirtuBattle.Server.Tests;

public class RateModePolicyTests
{
    [Theory]
    [InlineData(null, RateMode.Idle)]
    [InlineData(1000.0, RateMode.Roaming)]
    [InlineData(300.0, RateMode.Engaged)]
    [InlineData(100.0, RateMode.Engaged)]
    [InlineData(39.0, RateMode.CloseCombat)]
    public void Decide_from_idle_uses_the_thresholds(double? nearest, RateMode expected) =>
        Assert.Equal(expected, RateModePolicy.Decide(nearest, RateMode.Idle));

    [Fact]
    public void Leaving_close_combat_needs_the_hysteresis_margin()
    {
        Assert.Equal(RateMode.CloseCombat, RateModePolicy.Decide(44, RateMode.CloseCombat));
        Assert.Equal(RateMode.Engaged, RateModePolicy.Decide(47, RateMode.CloseCombat));
    }

    [Fact]
    public void Leaving_engaged_needs_the_hysteresis_margin()
    {
        Assert.Equal(RateMode.Engaged, RateModePolicy.Decide(330, RateMode.Engaged));
        Assert.Equal(RateMode.Roaming, RateModePolicy.Decide(350, RateMode.Engaged));
    }

    [Fact]
    public void Getting_closer_switches_at_the_threshold()
    {
        Assert.Equal(RateMode.Engaged, RateModePolicy.Decide(299, RateMode.Roaming));
        Assert.Equal(RateMode.CloseCombat, RateModePolicy.Decide(39, RateMode.Engaged));
    }

    [Fact]
    public void Losing_all_opponents_goes_idle() =>
        Assert.Equal(RateMode.Idle, RateModePolicy.Decide(null, RateMode.CloseCombat));

    [Fact]
    public void Intervals_get_shorter_as_players_get_closer() =>
        Assert.True(
            RateModePolicy.IntervalMs(RateMode.Idle) > RateModePolicy.IntervalMs(RateMode.Roaming)
            && RateModePolicy.IntervalMs(RateMode.Roaming) > RateModePolicy.IntervalMs(RateMode.Engaged)
            && RateModePolicy.IntervalMs(RateMode.Engaged) > RateModePolicy.IntervalMs(RateMode.CloseCombat));
}
