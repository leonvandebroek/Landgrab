using System.Security.Claims;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.Authorization;

namespace Landgrab.Api.Endpoints;

public static class GlobalMapEndpoints
{
    public static void MapGlobalMapEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/global").RequireAuthorization();

        group.MapGet("/hexes", GetHexes);
        group.MapGet("/leaderboard", GetLeaderboard);
        group.MapGet("/myterritories", GetMyTerritories);
    }

    private static async Task<IResult> GetHexes(
        double lat, double lng, int radius,
        GlobalMapService service)
    {
        if (double.IsNaN(lat) || double.IsNaN(lng) || double.IsInfinity(lat) || double.IsInfinity(lng))
            return Results.BadRequest(new { error = "Invalid coordinate values." });

        if (lat < -90 || lat > 90)
            return Results.BadRequest(new { error = "Latitude must be between -90 and 90." });

        if (lng < -180 || lng > 180)
            return Results.BadRequest(new { error = "Longitude must be between -180 and 180." });

        var hexes = await service.GetHexesNearAsync(lat, lng, Math.Clamp(radius, 10, 200));
        return Results.Ok(hexes);
    }

    private static async Task<IResult> GetLeaderboard(GlobalMapService service)
    {
        var board = await service.GetLeaderboardAsync();
        return Results.Ok(board);
    }

    private static async Task<IResult> GetMyTerritories(
        HttpContext ctx,
        GlobalMapService service)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var mine = await service.GetHexesForUserAsync(userId);
        return Results.Ok(mine);
    }
}
