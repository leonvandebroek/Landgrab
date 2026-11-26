namespace VirtuBattle.Server.Rooms;

/// <summary>
/// How often a phone should send its position, decided by the server from the distance to the nearest
/// other player (the "adaptive rate modes" from the research report).
/// </summary>
public enum RateMode
{
    /// <summary>Nobody else has a known position. Send rarely.</summary>
    Idle,

    /// <summary>Nearest player is far away.</summary>
    Roaming,

    /// <summary>Nearest player is within shooting range.</summary>
    Engaged,

    /// <summary>Nearest player is close; UWB takes over here from M3.</summary>
    CloseCombat,
}

public static class RateModePolicy
{
    /// <summary>Above this distance a player is roaming.</summary>
    public const double EngagedDistanceMeters = 300;

    /// <summary>Below this distance a player is in close combat.</summary>
    public const double CloseCombatDistanceMeters = 40;

    /// <summary>
    /// A mode is only left once the distance is this fraction past its threshold, so GPS jitter
    /// around a boundary does not make the mode flap.
    /// </summary>
    public const double Hysteresis = 0.15;

    public static int IntervalMs(RateMode mode) => mode switch
    {
        RateMode.Idle => 10_000,
        RateMode.Roaming => 5_000,
        RateMode.Engaged => 1_000,
        RateMode.CloseCombat => 500,
        _ => throw new ArgumentOutOfRangeException(nameof(mode)),
    };

    public static RateMode Decide(double? nearestDistanceMeters, RateMode current)
    {
        if (nearestDistanceMeters is not { } d)
        {
            return RateMode.Idle;
        }

        var raw = Classify(d);
        if (raw == current || current == RateMode.Idle)
        {
            return raw;
        }

        // Moving to a closer mode happens at the threshold; moving away needs the hysteresis margin.
        return (current, raw) switch
        {
            (RateMode.CloseCombat, _) when d <= CloseCombatDistanceMeters * (1 + Hysteresis) => RateMode.CloseCombat,
            (RateMode.Engaged, RateMode.Roaming) when d <= EngagedDistanceMeters * (1 + Hysteresis) => RateMode.Engaged,
            _ => raw,
        };
    }

    private static RateMode Classify(double d) =>
        d < CloseCombatDistanceMeters ? RateMode.CloseCombat
        : d <= EngagedDistanceMeters ? RateMode.Engaged
        : RateMode.Roaming;
}
