namespace Landgrab.Api.Models;

public class MapTemplate
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public Guid CreatorUserId { get; set; }
    public string HexCoordinatesJson { get; set; } = "[]";  // JSON array of {Q,R}
    public int HexCount { get; set; }
    public int TileSizeMeters { get; set; } = 25;
    public double? CenterLat { get; set; }
    public double? CenterLng { get; set; }
    public bool IsPublic { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User Creator { get; set; } = null!;
}
