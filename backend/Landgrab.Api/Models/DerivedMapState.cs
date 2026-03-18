namespace Landgrab.Api.Models;

public class ContestedEdgeDto
{
    public string HexKeyA { get; set; } = "";
    public string HexKeyB { get; set; } = "";
    public int NeighborIndex { get; set; }
    public string TeamAColor { get; set; } = "";
    public string TeamBColor { get; set; } = "";
    public double Intensity { get; set; }
}

public class SupplyEdgeDto
{
    public string FromKey { get; set; } = "";
    public string ToKey { get; set; } = "";
    public string TeamColor { get; set; } = "";
}
