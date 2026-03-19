using System.Security.Claims;
using Landgrab.Api.Models;
using Landgrab.Api.Services;

namespace Landgrab.Api.Endpoints;

/// <summary>
/// Development-only endpoints for injecting game scenarios directly into memory,
/// bypassing the lobby wizard. Registered only when the app runs in Development mode.
/// </summary>
public static class PlaytestEndpoints
{
    public static void MapPlaytestEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/playtest").RequireAuthorization();

        group.MapPost("/inject-scenario", InjectScenario);
    }

    private static IResult InjectScenario(
        InjectScenarioRequest req,
        HttpContext ctx,
        GameService gameService)
    {
        if (req.Players.Count < 2)
            return Results.BadRequest(new { error = "At least 2 players are required." });

        var hostUserId = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(hostUserId))
            return Results.Unauthorized();

        if (req.Players.Any(p => string.IsNullOrWhiteSpace(p.UserId) || string.IsNullOrWhiteSpace(p.Username)))
            return Results.BadRequest(new { error = "Every player spec must have a non-empty UserId and Username." });

        if (req.Players.Any(p => string.IsNullOrWhiteSpace(p.AllianceName)))
            return Results.BadRequest(new { error = "Every player spec must have an AllianceName." });

        var room = gameService.CreateScenarioRoom(hostUserId, req);
        return Results.Ok(new { roomCode = room.Code });
    }
}
