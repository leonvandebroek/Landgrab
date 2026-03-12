using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public static class HexService
{
    private const double MetersPerDegreeLat = 111_320d;
    private const double Sqrt3 = 1.7320508075688772d;
    private static readonly (int q, int r)[] Directions =
        [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

    public static string Key(int q, int r) => $"{q},{r}";

    public static IEnumerable<(int q, int r)> Neighbors(int q, int r) =>
        Directions.Select(d => (q + d.q, r + d.r));

    public static bool AreAdjacent(int q1, int r1, int q2, int r2) =>
        Neighbors(q1, r1).Any(n => n.q == q2 && n.r == r2);

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

    public static Dictionary<string, HexCell> BuildGrid(int radius)
    {
        var grid = new Dictionary<string, HexCell>();
        foreach (var (q, r) in Spiral(radius))
            grid[Key(q, r)] = new HexCell { Q = q, R = r };
        return grid;
    }

    public static Dictionary<string, HexCell> BuildGrid(IEnumerable<(int q, int r)> coordinates)
    {
        var grid = new Dictionary<string, HexCell>();
        foreach (var (q, r) in coordinates.Distinct())
            grid[Key(q, r)] = new HexCell { Q = q, R = r };

        return grid;
    }

    public static int HexDistance(int q, int r)
    {
        var s = -q - r;
        return Math.Max(Math.Abs(q), Math.Max(Math.Abs(r), Math.Abs(s)));
    }

    public static int InferRadius(IEnumerable<(int q, int r)> coordinates)
    {
        return coordinates.Select(coord => HexDistance(coord.q, coord.r)).DefaultIfEmpty(0).Max();
    }

    public static (double widthMeters, double heightMeters, double maxDimensionMeters)
        GetFootprintMetrics(IEnumerable<(int q, int r)> coordinates, double tileSizeMeters)
    {
        var cells = coordinates.Distinct().ToList();
        if (cells.Count == 0 || tileSizeMeters <= 0)
            return (0d, 0d, 0d);

        double minX = double.PositiveInfinity;
        double maxX = double.NegativeInfinity;
        double minY = double.PositiveInfinity;
        double maxY = double.NegativeInfinity;

        foreach (var (q, r) in cells)
        {
            var centerX = tileSizeMeters * 1.5d * q;
            var centerY = tileSizeMeters * Sqrt3 * (r + q / 2d);

            minX = Math.Min(minX, centerX - tileSizeMeters);
            maxX = Math.Max(maxX, centerX + tileSizeMeters);
            minY = Math.Min(minY, centerY - tileSizeMeters);
            maxY = Math.Max(maxY, centerY + tileSizeMeters);
        }

        var width = maxX - minX;
        var height = maxY - minY;
        return (width, height, Math.Max(width, height));
    }

    public static int GetMaxTileSizeForFootprint(IEnumerable<(int q, int r)> coordinates, int maxFootprintMeters)
    {
        if (maxFootprintMeters <= 0)
            return 0;

        var unitMetrics = GetFootprintMetrics(coordinates, 1d);
        if (unitMetrics.maxDimensionMeters <= 0)
            return maxFootprintMeters;

        return (int)Math.Floor(maxFootprintMeters / unitMetrics.maxDimensionMeters);
    }

    public static bool IsConnected(IEnumerable<(int q, int r)> coordinates)
    {
        var cells = coordinates.Distinct().ToHashSet();
        if (cells.Count <= 1)
            return true;

        var visited = new HashSet<(int q, int r)>();
        var queue = new Queue<(int q, int r)>();
        var start = cells.First();
        visited.Add(start);
        queue.Enqueue(start);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            foreach (var neighbor in Neighbors(current.q, current.r))
            {
                if (!cells.Contains(neighbor) || !visited.Add(neighbor))
                    continue;

                queue.Enqueue(neighbor);
            }
        }

        return visited.Count == cells.Count;
    }

    public static bool IsAdjacentToOwned(Dictionary<string, HexCell> grid, int q, int r,
        string playerId, string? allianceId)
    {
        return Neighbors(q, r).Any(n =>
        {
            if (!grid.TryGetValue(Key(n.q, n.r), out var cell))
                return false;

            return cell.OwnerId == playerId ||
                   (allianceId != null && cell.OwnerAllianceId == allianceId);
        });
    }

    public static int CountAllyBorderHexes(Dictionary<string, HexCell> grid, int q, int r,
        string defenderId, string? defenderAllianceId)
    {
        return Neighbors(q, r).Count(n =>
        {
            if (!grid.TryGetValue(Key(n.q, n.r), out var cell))
                return false;

            return cell.OwnerId != null && cell.OwnerId != defenderId &&
                   cell.OwnerAllianceId != null && cell.OwnerAllianceId == defenderAllianceId;
        });
    }

    public static int TerritoryCount(Dictionary<string, HexCell> grid, string playerId) =>
        grid.Values.Count(c => c.OwnerId == playerId);

    public static int AllianceTerritoryCount(Dictionary<string, HexCell> grid, string allianceId) =>
        grid.Values.Count(c => c.OwnerAllianceId == allianceId);

    public static (double lat, double lng) HexToLatLng(int q, int r, double mapLat, double mapLng,
        int tileSizeMeters)
    {
        var xMeters = tileSizeMeters * 1.5d * q;
        var yMeters = tileSizeMeters * Math.Sqrt(3d) * (r + q / 2d);
        var lat = mapLat + yMeters / MetersPerDegreeLat;
        var cosLat = Math.Cos(mapLat * Math.PI / 180d);
        var lng = mapLng + xMeters / (MetersPerDegreeLat * Math.Max(Math.Abs(cosLat), 1e-9d));
        return (lat, lng);
    }

    public static (int q, int r) LatLngToHexForRoom(double lat, double lng, double mapLat,
        double mapLng, int tileSizeMeters)
    {
        var yMeters = (lat - mapLat) * MetersPerDegreeLat;
        var cosLat = Math.Cos(mapLat * Math.PI / 180d);
        var xMeters = (lng - mapLng) * MetersPerDegreeLat * Math.Max(Math.Abs(cosLat), 1e-9d);

        var q = (2d / 3d * xMeters) / tileSizeMeters;
        var r = (-1d / 3d * xMeters + Math.Sqrt(3d) / 3d * yMeters) / tileSizeMeters;
        return HexRound(q, r);
    }

    public static bool IsPlayerInHex(double playerLat, double playerLng, int q, int r,
        double mapLat, double mapLng, int tileSizeMeters)
    {
        var playerHex = LatLngToHexForRoom(playerLat, playerLng, mapLat, mapLng, tileSizeMeters);
        return playerHex.q == q && playerHex.r == r;
    }

    /// <summary>
    /// Returns <paramref name="count"/> hex coordinates distributed evenly around a ring
    /// at the given <paramref name="ringRadius"/> from center (0,0).
    /// Coordinates are guaranteed to exist within a grid of the given <paramref name="gridRadius"/>.
    /// </summary>
    public static List<(int q, int r)> GetEvenlySpacedRing(int count, int ringRadius, int gridRadius)
    {
        if (count <= 0)
            return [];

        var ring = HexRing(ringRadius)
            .Where(hex => Math.Abs(hex.q) <= gridRadius &&
                          Math.Abs(hex.r) <= gridRadius &&
                          Math.Abs(-hex.q - hex.r) <= gridRadius)
            .ToList();

        if (ring.Count == 0)
            return [];

        if (count >= ring.Count)
            return ring;

        var result = new List<(int q, int r)>(count);
        var step = (double)ring.Count / count;
        for (var i = 0; i < count; i++)
            result.Add(ring[(int)Math.Round(i * step) % ring.Count]);

        return result;
    }

    /// <summary>
    /// Returns all hex coordinates on the ring at exactly <paramref name="radius"/> distance from (0,0).
    /// </summary>
    private static List<(int q, int r)> HexRing(int radius)
    {
        if (radius <= 0)
            return [(0, 0)];

        var results = new List<(int q, int r)>();
        var (q, r) = (-radius, radius); // start at direction 4 (top-left)
        foreach (var (dq, dr) in Directions)
        {
            for (var step = 0; step < radius; step++)
            {
                results.Add((q, r));
                q += dq;
                r += dr;
            }
        }

        return results;
    }

    private static (int q, int r) HexRound(double q, double r)
    {
        var s = -q - r;
        var roundedQ = Math.Round(q);
        var roundedR = Math.Round(r);
        var roundedS = Math.Round(s);
        var deltaQ = Math.Abs(roundedQ - q);
        var deltaR = Math.Abs(roundedR - r);
        var deltaS = Math.Abs(roundedS - s);

        if (deltaQ > deltaR && deltaQ > deltaS)
            roundedQ = -roundedR - roundedS;
        else if (deltaR > deltaS)
            roundedR = -roundedQ - roundedS;

        return ((int)roundedQ, (int)roundedR);
    }
}
