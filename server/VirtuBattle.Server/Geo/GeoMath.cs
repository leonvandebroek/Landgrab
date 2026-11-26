namespace VirtuBattle.Server.Geo;

/// <summary>Spherical-earth helpers. Mirrors ios/Packages/VirtuBattleCore/Sources/AimingEngine/GeoMath.swift.</summary>
public static class GeoMath
{
    public const double EarthRadiusMeters = 6_371_008.8;

    public static double DistanceMeters(double lat1, double lon1, double lat2, double lon2)
    {
        var phi1 = ToRadians(lat1);
        var phi2 = ToRadians(lat2);
        var dPhi = phi2 - phi1;
        var dLambda = ToRadians(lon2 - lon1);
        var h = Math.Sin(dPhi / 2) * Math.Sin(dPhi / 2)
              + Math.Cos(phi1) * Math.Cos(phi2) * Math.Sin(dLambda / 2) * Math.Sin(dLambda / 2);
        return 2 * EarthRadiusMeters * Math.Asin(Math.Min(1, Math.Sqrt(h)));
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;
}
