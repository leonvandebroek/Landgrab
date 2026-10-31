namespace Landgrab.Api.Models;

/// <summary>
/// Represents the last confirmed hostile state for a remembered hex.
/// </summary>
public sealed record RememberedHex(
    string? OwnerId,
    string? OwnerName,
    string? OwnerColor,
    string? OwnerAllianceId,
    int Troops,
    bool IsFort,
    bool IsMasterTile,
    DateTime SeenAt);

/// <summary>
/// Represents the last confirmed hostile player sighting.
/// </summary>
public sealed record PlayerSighting(
    double Lat,
    double Lng,
    int HexQ,
    int HexR,
    DateTime SeenAt);

/// <summary>
/// Stores per-player remembered hostile intelligence for fog-of-war projection.
/// </summary>
public class PlayerVisibilityMemory
{
    public Dictionary<string, RememberedHex> RememberedHexes { get; } =
        new(StringComparer.Ordinal);

    public Dictionary<string, PlayerSighting> PlayerSightings { get; } =
        new(StringComparer.Ordinal);
}