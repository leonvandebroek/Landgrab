using System.Text.Json;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class TerrainFetchService(HttpClient httpClient, ILogger<TerrainFetchService> logger)
{
    private const int OverpassTimeoutSeconds = 5;
    private const int ElevationTimeoutSeconds = 5;
    private const int ElevationBatchSize = 100;
    private const double HillThresholdMeters = 5.0;
    private const double SteepThresholdMeters = 15.0;

    public async Task AssignTerrainToGrid(Dictionary<string, HexCell> grid, double mapLat, double mapLng, int tileSizeMeters)
    {
        if (grid.Count == 0) return;

        try
        {
            var hexCentres = grid.Values.Select(cell =>
            {
                var (lat, lng) = HexService.HexToLatLng(cell.Q, cell.R, mapLat, mapLng, tileSizeMeters);
                return (cell, lat, lng);
            }).ToList();

            var minLat = hexCentres.Min(h => h.lat) - 0.002;
            var maxLat = hexCentres.Max(h => h.lat) + 0.002;
            var minLng = hexCentres.Min(h => h.lng) - 0.002;
            var maxLng = hexCentres.Max(h => h.lng) + 0.002;

            var osmTask = FetchOsmFeatures(minLat, minLng, maxLat, maxLng);
            var elevationTask = FetchElevations(hexCentres);
            await Task.WhenAll(osmTask, elevationTask);

            var osmFeatures = osmTask.Result;
            var elevations = elevationTask.Result;

            foreach (var (cell, lat, lng) in hexCentres)
            {
                cell.TerrainType = DetermineTerrainType(cell, lat, lng, osmFeatures, elevations, grid, tileSizeMeters);
            }

            var counts = grid.Values.GroupBy(c => c.TerrainType).ToDictionary(g => g.Key, g => g.Count());
            logger.LogInformation("Terrain assigned: {Counts}", string.Join(", ", counts.Select(kv => $"{kv.Key}={kv.Value}")));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Terrain fetch failed — defaulting all hexes to None");
        }
    }

    private record OsmFeature(TerrainType Type, double Lat, double Lng);

    private async Task<List<OsmFeature>> FetchOsmFeatures(double minLat, double minLng, double maxLat, double maxLng)
    {
        try
        {
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            var query = string.Create(inv,
                $"""
                [out:json][timeout:{OverpassTimeoutSeconds}][bbox:{minLat},{minLng},{maxLat},{maxLng}];
                (
                  way["natural"="water"];
                  way["waterway"];
                  way["building"];
                  way["highway"];
                  way["natural"="wood"];
                  way["landuse"="forest"];
                  way["leisure"="park"];
                  relation["natural"="water"];
                  relation["landuse"="forest"];
                );
                out center;
                """);

            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(OverpassTimeoutSeconds));
            var content = new FormUrlEncodedContent([new KeyValuePair<string, string>("data", query)]);
            var response = await httpClient.PostAsync(
                "https://overpass-api.de/api/interpreter", content, cts.Token);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync(cts.Token);
            using var doc = JsonDocument.Parse(json);

            if (!doc.RootElement.TryGetProperty("elements", out var elements))
                return [];

            var features = new List<OsmFeature>();
            foreach (var element in elements.EnumerateArray())
            {
                double lat, lng;
                if (element.TryGetProperty("center", out var center))
                {
                    lat = center.GetProperty("lat").GetDouble();
                    lng = center.GetProperty("lon").GetDouble();
                }
                else if (element.TryGetProperty("lat", out var latProp))
                {
                    lat = latProp.GetDouble();
                    lng = element.GetProperty("lon").GetDouble();
                }
                else continue;

                var tags = element.TryGetProperty("tags", out var tagsEl) ? tagsEl : default;
                var type = ClassifyOsmTags(tags);
                if (type != TerrainType.None)
                    features.Add(new OsmFeature(type, lat, lng));
            }

            logger.LogInformation("OSM returned {Count} classified features", features.Count);
            return features;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "OSM Overpass fetch failed");
            return [];
        }
    }

    private static TerrainType ClassifyOsmTags(JsonElement tags)
    {
        if (tags.ValueKind == JsonValueKind.Undefined) return TerrainType.None;

        if (TryGetTag(tags, "natural") is "water") return TerrainType.Water;
        if (TryGetTag(tags, "waterway") is not null) return TerrainType.Water;
        if (TryGetTag(tags, "building") is not null) return TerrainType.Building;

        var highway = TryGetTag(tags, "highway");
        if (highway is "primary" or "secondary" or "tertiary" or "residential" or "trunk" or "motorway" or "unclassified")
            return TerrainType.Road;
        if (highway is "footway" or "cycleway" or "path" or "track" or "pedestrian" or "service")
            return TerrainType.Path;

        if (TryGetTag(tags, "natural") is "wood") return TerrainType.Forest;
        if (TryGetTag(tags, "landuse") is "forest") return TerrainType.Forest;
        if (TryGetTag(tags, "leisure") is "park") return TerrainType.Park;

        return TerrainType.None;
    }

    private static string? TryGetTag(JsonElement tags, string key)
    {
        return tags.TryGetProperty(key, out var val) ? val.GetString() : null;
    }

    private async Task<Dictionary<string, double>> FetchElevations(List<(HexCell cell, double lat, double lng)> hexCentres)
    {
        var elevations = new Dictionary<string, double>();
        try
        {
            var inv = System.Globalization.CultureInfo.InvariantCulture;
            var batches = hexCentres
                .Select((h, i) => (h, i))
                .GroupBy(x => x.i / ElevationBatchSize)
                .Select(g => g.Select(x => x.h).ToList())
                .ToList();

            for (var i = 0; i < batches.Count; i++)
            {
                if (i > 0)
                    await Task.Delay(100); // Rate-limit between batches

                var batch = batches[i];
                var locations = string.Join("|", batch.Select(h =>
                    $"{h.lat.ToString(inv)},{h.lng.ToString(inv)}"));

                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(ElevationTimeoutSeconds));
                var response = await httpClient.GetAsync(
                    $"https://api.opentopodata.org/v1/eudem25m?locations={locations}", cts.Token);
                response.EnsureSuccessStatusCode();

                var json = await response.Content.ReadAsStringAsync(cts.Token);
                using var doc = JsonDocument.Parse(json);

                if (!doc.RootElement.TryGetProperty("results", out var results))
                    continue;

                var idx = 0;
                foreach (var result in results.EnumerateArray())
                {
                    if (idx >= batch.Count) break;
                    if (result.TryGetProperty("elevation", out var elev) &&
                        elev.ValueKind == JsonValueKind.Number)
                    {
                        elevations[HexService.Key(batch[idx].cell.Q, batch[idx].cell.R)] = elev.GetDouble();
                    }
                    idx++;
                }
            }

            logger.LogInformation("Elevation data fetched for {Count} hexes", elevations.Count);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Elevation fetch failed — hills/steep detection disabled");
        }
        return elevations;
    }

    private TerrainType DetermineTerrainType(HexCell cell, double lat, double lng,
        List<OsmFeature> osmFeatures, Dictionary<string, double> elevations,
        Dictionary<string, HexCell> grid, int tileSizeMeters)
    {
        // Radius for matching OSM features to hex centre (in degrees, ~tileSizeMeters)
        var radiusDeg = tileSizeMeters / 111_320.0;

        // Check OSM features by priority
        TerrainType bestOsm = TerrainType.None;
        foreach (var feature in osmFeatures)
        {
            var dLat = Math.Abs(feature.Lat - lat);
            var dLng = Math.Abs(feature.Lng - lng);
            if (dLat <= radiusDeg && dLng <= radiusDeg)
            {
                if (bestOsm == TerrainType.None || feature.Type < bestOsm)
                    bestOsm = feature.Type;
            }
        }

        if (bestOsm != TerrainType.None)
            return bestOsm;

        // Elevation-based terrain
        var key = HexService.Key(cell.Q, cell.R);
        if (elevations.TryGetValue(key, out var myElev))
        {
            var neighborElevs = HexService.Neighbors(cell.Q, cell.R)
                .Select(n => elevations.TryGetValue(HexService.Key(n.q, n.r), out var e) ? (double?)e : null)
                .Where(e => e.HasValue)
                .Select(e => e!.Value)
                .ToList();

            if (neighborElevs.Count > 0)
            {
                var avgNeighbor = neighborElevs.Average();
                var diff = myElev - avgNeighbor;
                if (diff >= SteepThresholdMeters) return TerrainType.Steep;
                if (diff >= HillThresholdMeters) return TerrainType.Hills;
            }
        }

        return TerrainType.None;
    }
}
