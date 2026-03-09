using System.Security.Claims;
using Landgrab.Api.Data;
using Landgrab.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Endpoints;

public static class AllianceEndpoints
{
    public static void MapAllianceEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/alliances").RequireAuthorization();

        group.MapGet("/", GetMyAlliances);
        group.MapPost("/", CreateAlliance);
        group.MapPost("/{id}/join", JoinAlliance);
        group.MapDelete("/{id}/leave", LeaveAlliance);
    }

    private static async Task<IResult> GetMyAlliances(HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var memberships = await db.AllianceMembers
            .Where(am => am.UserId == userId)
            .Include(am => am.Alliance)
            .ThenInclude(a => a.Members)
            .ThenInclude(m => m.User)
            .ToListAsync();

        return Results.Ok(memberships.Select(m => new
        {
            m.Alliance.Id,
            m.Alliance.Name,
            m.Alliance.Tag,
            m.Role,
            Members = m.Alliance.Members.Select(mem => new
            {
                mem.User.Username,
                mem.Role
            })
        }));
    }

    private static async Task<IResult> CreateAlliance(
        CreateAllianceRequest req, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (string.IsNullOrWhiteSpace(req.Name) || req.Name.Length > 50)
            return Results.BadRequest(new { error = "Alliance name must be 1–50 characters." });

        if (string.IsNullOrWhiteSpace(req.Tag) || req.Tag.Length > 6)
            return Results.BadRequest(new { error = "Tag must be 1–6 characters." });

        if (await db.Alliances.AnyAsync(a => a.Name == req.Name))
            return Results.Conflict(new { error = "Alliance name already taken." });

        var alliance = new Alliance
        {
            Name = req.Name,
            Tag = req.Tag.ToUpper(),
            CreatedBy = userId
        };
        db.Alliances.Add(alliance);

        db.AllianceMembers.Add(new AllianceMember
        {
            UserId = userId,
            AllianceId = alliance.Id,
            Role = "leader"
        });

        await db.SaveChangesAsync();
        return Results.Created($"/api/alliances/{alliance.Id}", new { alliance.Id, alliance.Name, alliance.Tag });
    }

    private static async Task<IResult> JoinAlliance(
        Guid id, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        if (!await db.Alliances.AnyAsync(a => a.Id == id))
            return Results.NotFound(new { error = "Alliance not found." });

        if (await db.AllianceMembers.AnyAsync(am => am.UserId == userId && am.AllianceId == id))
            return Results.Conflict(new { error = "Already a member." });

        db.AllianceMembers.Add(new AllianceMember
        {
            UserId = userId,
            AllianceId = id
        });
        await db.SaveChangesAsync();
        return Results.Ok();
    }

    private static async Task<IResult> LeaveAlliance(
        Guid id, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var membership = await db.AllianceMembers
            .FirstOrDefaultAsync(am => am.UserId == userId && am.AllianceId == id);

        if (membership == null) return Results.NotFound();

        db.AllianceMembers.Remove(membership);
        await db.SaveChangesAsync();
        return Results.Ok();
    }

    public record CreateAllianceRequest(string Name, string Tag);
}
