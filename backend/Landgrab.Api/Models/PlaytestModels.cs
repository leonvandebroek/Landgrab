namespace Landgrab.Api.Models;

public class ScenarioPlayerSpec
{
    public string UserId { get; set; } = "";
    public string Username { get; set; } = "";
    public string AllianceName { get; set; } = "";
    public int CarriedTroops { get; set; } = 3;
    public double? Lat { get; set; }
    public double? Lng { get; set; }
    public string Role { get; set; } = "None";
}

public class ScenarioHexOverride
{
    public int Q { get; set; }
    public int R { get; set; }
    /// <summary>UserId of the owning player, or null for neutral.</summary>
    public string? OwnerPlayerId { get; set; }
    public int Troops { get; set; }
    public bool IsFort { get; set; }
    public bool IsMasterTile { get; set; }
}

public class InjectScenarioRequest
{
    public double MapLat { get; set; } = 52.0;
    public double MapLng { get; set; } = 4.9;
    public int TileSizeMeters { get; set; } = 50;
    public int GridRadius { get; set; } = 6;
    public bool HostBypassGps { get; set; } = true;
    public GameDynamics? Dynamics { get; set; }
    public List<ScenarioPlayerSpec> Players { get; set; } = [];
    public List<ScenarioHexOverride>? HexOverrides { get; set; }
}
