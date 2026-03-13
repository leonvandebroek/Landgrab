using System.Security.Claims;
using System.Text.Json;
using Landgrab.Api.Data;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Endpoints;

public static class MapTemplateEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static void MapMapTemplateEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/map-templates").RequireAuthorization();

        group.MapGet("/", ListTemplates);
        group.MapGet("/{id:guid}", GetTemplate);
        group.MapPost("/", CreateTemplate);
        group.MapPut("/{id:guid}", UpdateTemplate);
        group.MapDelete("/{id:guid}", DeleteTemplate);
        group.MapPost("/{id:guid}/duplicate", DuplicateTemplate);
    }

    private static async Task<IResult> ListTemplates(HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var templates = await db.MapTemplates
            .Where(t => t.CreatorUserId == userId || t.IsPublic)
            .OrderByDescending(t => t.UpdatedAt)
            .Select(t => new
            {
                t.Id,
                t.Name,
                t.Description,
                t.HexCount,
                t.TileSizeMeters,
                t.CenterLat,
                t.CenterLng,
                t.IsPublic,
                t.CreatedAt,
                t.UpdatedAt
            })
            .ToListAsync();

        return Results.Ok(templates);
    }

    private static async Task<IResult> GetTemplate(Guid id, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var template = await db.MapTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template == null || (template.CreatorUserId != userId && !template.IsPublic))
            return Results.NotFound(new { error = "Template not found." });

        var coordinates = JsonSerializer.Deserialize<List<HexCoordinate>>(
            template.HexCoordinatesJson, JsonOptions) ?? [];

        return Results.Ok(new
        {
            template.Id,
            template.Name,
            template.Description,
            template.HexCount,
            template.TileSizeMeters,
            template.CenterLat,
            template.CenterLng,
            template.IsPublic,
            template.CreatedAt,
            template.UpdatedAt,
            Coordinates = coordinates
        });
    }

    private static async Task<IResult> CreateTemplate(
        CreateMapTemplateRequest req, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var validationError = ValidateTemplateRequest(req.Name, req.Coordinates, req.TileSizeMeters);
        if (validationError != null)
            return Results.BadRequest(new { error = validationError });

        var template = new MapTemplate
        {
            Name = req.Name,
            Description = req.Description,
            CreatorUserId = userId,
            HexCoordinatesJson = JsonSerializer.Serialize(req.Coordinates, JsonOptions),
            HexCount = req.Coordinates.Count,
            TileSizeMeters = req.TileSizeMeters ?? 25,
            CenterLat = req.CenterLat,
            CenterLng = req.CenterLng
        };

        db.MapTemplates.Add(template);
        await db.SaveChangesAsync();

        return Results.Created($"/api/map-templates/{template.Id}", new
        {
            template.Id,
            template.Name,
            template.Description,
            template.HexCount,
            template.TileSizeMeters,
            template.CenterLat,
            template.CenterLng,
            template.IsPublic,
            template.CreatedAt,
            template.UpdatedAt,
            req.Coordinates
        });
    }

    private static async Task<IResult> UpdateTemplate(
        Guid id, UpdateMapTemplateRequest req, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var template = await db.MapTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template == null)
            return Results.NotFound(new { error = "Template not found." });
        if (template.CreatorUserId != userId)
            return Results.Json(new { error = "You do not own this template." }, statusCode: 403);

        var validationError = ValidateTemplateRequest(req.Name, req.Coordinates, req.TileSizeMeters);
        if (validationError != null)
            return Results.BadRequest(new { error = validationError });

        template.Name = req.Name;
        template.Description = req.Description;
        template.HexCoordinatesJson = JsonSerializer.Serialize(req.Coordinates, JsonOptions);
        template.HexCount = req.Coordinates.Count;
        template.TileSizeMeters = req.TileSizeMeters ?? template.TileSizeMeters;
        template.CenterLat = req.CenterLat;
        template.CenterLng = req.CenterLng;
        template.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        return Results.Ok(new
        {
            template.Id,
            template.Name,
            template.Description,
            template.HexCount,
            template.TileSizeMeters,
            template.CenterLat,
            template.CenterLng,
            template.IsPublic,
            template.CreatedAt,
            template.UpdatedAt,
            req.Coordinates
        });
    }

    private static async Task<IResult> DeleteTemplate(Guid id, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var template = await db.MapTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (template == null)
            return Results.NotFound(new { error = "Template not found." });
        if (template.CreatorUserId != userId)
            return Results.Json(new { error = "You do not own this template." }, statusCode: 403);

        db.MapTemplates.Remove(template);
        await db.SaveChangesAsync();

        return Results.NoContent();
    }

    private static async Task<IResult> DuplicateTemplate(Guid id, HttpContext ctx, AppDbContext db)
    {
        var userId = Guid.Parse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier)!);

        var original = await db.MapTemplates.FirstOrDefaultAsync(t => t.Id == id);
        if (original == null || (original.CreatorUserId != userId && !original.IsPublic))
            return Results.NotFound(new { error = "Template not found." });

        var copy = new MapTemplate
        {
            Name = $"{original.Name} (Copy)",
            Description = original.Description,
            CreatorUserId = userId,
            HexCoordinatesJson = original.HexCoordinatesJson,
            HexCount = original.HexCount,
            TileSizeMeters = original.TileSizeMeters,
            CenterLat = original.CenterLat,
            CenterLng = original.CenterLng
        };

        db.MapTemplates.Add(copy);
        await db.SaveChangesAsync();

        var coordinates = JsonSerializer.Deserialize<List<HexCoordinate>>(
            copy.HexCoordinatesJson, JsonOptions) ?? [];

        return Results.Created($"/api/map-templates/{copy.Id}", new
        {
            copy.Id,
            copy.Name,
            copy.Description,
            copy.HexCount,
            copy.TileSizeMeters,
            copy.CenterLat,
            copy.CenterLng,
            copy.IsPublic,
            copy.CreatedAt,
            copy.UpdatedAt,
            Coordinates = coordinates
        });
    }

    // ── Validation ────────────────────────────────────────────────────────

    private static string? ValidateTemplateRequest(
        string name, List<HexCoordinate> coordinates, int? tileSizeMeters)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 100)
            return "Name must be 1–100 characters.";

        if (coordinates is not { Count: >= 7 })
            return "Coordinates must have at least 7 hexes.";

        if (coordinates.Count > 500)
            return "Coordinates must have at most 500 hexes.";

        if (tileSizeMeters.HasValue && (tileSizeMeters < 15 || tileSizeMeters > 1000))
            return "TileSizeMeters must be between 15 and 1000.";

        var tuples = coordinates.Select(c => (c.Q, c.R)).ToHashSet();
        if (!HexService.IsConnected(tuples))
            return "Coordinates must form a single connected shape.";

        return null;
    }

    // ── DTOs ──────────────────────────────────────────────────────────────

    public record HexCoordinate(int Q, int R);

    public record CreateMapTemplateRequest(
        string Name,
        string? Description,
        List<HexCoordinate> Coordinates,
        int? TileSizeMeters,
        double? CenterLat,
        double? CenterLng);

    public record UpdateMapTemplateRequest(
        string Name,
        string? Description,
        List<HexCoordinate> Coordinates,
        int? TileSizeMeters,
        double? CenterLat,
        double? CenterLng);
}
