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
