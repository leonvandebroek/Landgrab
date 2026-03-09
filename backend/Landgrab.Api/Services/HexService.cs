using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public static class HexService
{
    private static readonly (int q, int r)[] Directions =
        [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

    public static string Key(int q, int r) => $"{q},{r}";

    public static IEnumerable<(int q, int r)> Neighbors(int q, int r) =>
        Directions.Select(d => (q + d.q, r + d.r));

    public static bool AreAdjacent(int q1, int r1, int q2, int r2) =>
        Neighbors(q1, r1).Any(n => n.q == q2 && n.r == r2);

    /// <summary>Generates all hex coordinates within axial radius of origin (0,0).</summary>
    public static IEnumerable<(int q, int r)> Spiral(int radius)
    {
        for (var q = -radius; q <= radius; q++)
        {
            var r1 = Math.Max(-radius, -q - radius);
            var r2 = Math.Min(radius, -q + radius);
            for (var r = r1; r <= r2; r++)
                yield return (q, r);
        }
    }

    /// <summary>Builds an empty grid of HexCells for a room.</summary>
    public static Dictionary<string, HexCell> BuildGrid(int radius)
    {
        var grid = new Dictionary<string, HexCell>();
        foreach (var (q, r) in Spiral(radius))
            grid[Key(q, r)] = new HexCell { Q = q, R = r };
        return grid;
    }

    /// <summary>Returns true if (q,r) is adjacent to any hex owned by playerId (or their alliance).</summary>
    public static bool IsAdjacentToOwned(Dictionary<string, HexCell> grid, int q, int r,
        string playerId, string? allianceId)
    {
        return Neighbors(q, r).Any(n =>
        {
            if (!grid.TryGetValue(Key(n.q, n.r), out var cell)) return false;
            return cell.OwnerId == playerId ||
                   (allianceId != null && cell.OwnerAllianceId == allianceId);
        });
    }

    /// <summary>Counts ally hexes bordering the target (for alliance defense bonus).</summary>
    public static int CountAllyBorderHexes(Dictionary<string, HexCell> grid, int q, int r,
        string defenderId, string? defenderAllianceId)
    {
        return Neighbors(q, r).Count(n =>
        {
            if (!grid.TryGetValue(Key(n.q, n.r), out var cell)) return false;
            if (cell.Q == q && cell.R == r) return false;
            return cell.OwnerId != null && cell.OwnerId != defenderId &&
                   cell.OwnerAllianceId != null && cell.OwnerAllianceId == defenderAllianceId;
        });
    }

    public static int TerritoryCount(Dictionary<string, HexCell> grid, string playerId) =>
        grid.Values.Count(c => c.OwnerId == playerId);

    public static int AllianceTerritoryCount(Dictionary<string, HexCell> grid, string allianceId) =>
        grid.Values.Count(c => c.OwnerAllianceId == allianceId);
}
