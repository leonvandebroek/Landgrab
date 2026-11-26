namespace VirtuBattle.Server.Rooms;

/// <summary>A connected player in a room.</summary>
public sealed record Player(string PlayerId, string DisplayName, string RoomCode, DateTimeOffset JoinedAt);

/// <summary>A player's last reported position.</summary>
/// <param name="HorizontalAccuracy">Radius in meters of the 68% confidence circle, as Core Location reports it.</param>
/// <param name="ClientTimestampMs">When the phone took the fix, in the phone's clock (Unix ms).</param>
/// <param name="ReceivedAt">When the server got it.</param>
public sealed record GeoPosition(
    double Latitude,
    double Longitude,
    double HorizontalAccuracy,
    long ClientTimestampMs,
    DateTimeOffset ReceivedAt)
{
    public static void Validate(double latitude, double longitude, double horizontalAccuracy)
    {
        if (!double.IsFinite(latitude) || latitude is < -90 or > 90)
        {
            throw new ArgumentException("Latitude must be between -90 and 90.", nameof(latitude));
        }

        if (!double.IsFinite(longitude) || longitude is < -180 or > 180)
        {
            throw new ArgumentException("Longitude must be between -180 and 180.", nameof(longitude));
        }

        if (!double.IsFinite(horizontalAccuracy) || horizontalAccuracy < 0)
        {
            throw new ArgumentException("Accuracy must be zero or more.", nameof(horizontalAccuracy));
        }
    }
}

/// <summary>A player whose rate mode changed and should be told.</summary>
public sealed record RateModeChange(string ConnectionId, string PlayerId, RateMode Mode, double? NearestDistanceMeters);
