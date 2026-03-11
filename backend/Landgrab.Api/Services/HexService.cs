using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public static class HexService
{
    private const double MetersPerDegreeLat = 111_320d;
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
