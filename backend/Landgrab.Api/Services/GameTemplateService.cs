using System.Text.Json;
using Landgrab.Api.Data;
using Landgrab.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Services;

public class GameTemplateService(
    IGameRoomProvider roomProvider,
    GameStateService gameStateService,
    IServiceScopeFactory serviceScopeFactory)
{
    private readonly IServiceScopeFactory _scopeFactory = serviceScopeFactory;

    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);
    private static bool IsHost(GameRoom room, string userId) => GameStateCommon.IsHost(room, userId);

    public async Task<(bool success, string? error)> LoadMapTemplate(string roomCode, string userId, Guid templateId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (false, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (false, "Only the host can load a map template.");
            if (room.State.Phase != GamePhase.Lobby)
                return (false, "Templates can only be loaded in the lobby.");
        }

        MapTemplate? template;
        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            template = await db.MapTemplates
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == templateId);
        }

        if (template == null)
            return (false, "Template not found.");
        if (!template.IsPublic && template.CreatorUserId.ToString() != userId)
            return (false, "You do not have access to this template.");

        var coordinates = JsonSerializer.Deserialize<List<HexCoordinateDto>>(template.HexCoordinatesJson) ?? [];
        var selectedCoordinates = coordinates
            .Select(c => (c.Q, c.R))
            .Distinct()
            .ToList();

        if (selectedCoordinates.Count < GameStateCommon.MinimumDrawnHexCount)
            return (false, $"Template must contain at least {GameStateCommon.MinimumDrawnHexCount} tiles.");
        if (!HexService.IsConnected(selectedCoordinates))
            return (false, "Template coordinates must form a connected shape.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Lobby)
                return (false, "Templates can only be loaded in the lobby.");

            room.State.GameAreaMode = GameAreaMode.Drawn;
            room.State.GameAreaPattern = null;
            room.State.Grid = HexService.BuildGrid(selectedCoordinates);
            room.State.GridRadius = Math.Max(1, HexService.InferRadius(selectedCoordinates));

            if (template.TileSizeMeters > 0)
                room.State.TileSizeMeters = template.TileSizeMeters;

            room.State.TileSizeMeters = GameStateCommon.GetAllowedTileSizeMeters(
                selectedCoordinates,
                room.State.TileSizeMeters,
                room.State.MaxFootprintMetersOverride ?? GameStateCommon.MaxFootprintMeters);
            GameStateCommon.ResetBoardStateForAreaChange(room.State);

            var host = room.State.Players.FirstOrDefault(p => p.IsHost);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "GameAreaUpdated",
                Message = $"The host loaded map template \"{template.Name}\".",
                PlayerId = host?.Id,
                PlayerName = host?.Name
            });

            QueuePersistence(room, SnapshotState(room.State));
            return (true, null);
        }
    }

    public async Task<(bool success, string? error, Guid? templateId)> SaveCurrentAreaAsTemplate(
        string roomCode,
        string userId,
        string name,
        string? description)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (false, "Room not found.", null);

        List<HexCoordinateDto> coordinates;
        int tileSizeMeters;
        double? centerLat;
        double? centerLng;

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (false, "Only the host can save map templates.", null);
            if (room.State.Grid.Count == 0)
                return (false, "No game area to save.", null);

            coordinates = room.State.Grid.Values
                .Select(cell => new HexCoordinateDto { Q = cell.Q, R = cell.R })
                .ToList();
            tileSizeMeters = room.State.TileSizeMeters;
            centerLat = room.State.MapLat;
            centerLng = room.State.MapLng;
        }

        var template = new MapTemplate
        {
            Id = Guid.NewGuid(),
            Name = name,
            Description = description,
            CreatorUserId = Guid.Parse(userId),
            HexCoordinatesJson = JsonSerializer.Serialize(coordinates),
            HexCount = coordinates.Count,
            TileSizeMeters = tileSizeMeters,
            CenterLat = centerLat,
            CenterLng = centerLng,
            IsPublic = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        using (var scope = _scopeFactory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.MapTemplates.Add(template);
            await db.SaveChangesAsync();
        }

        return (true, null, template.Id);
    }
}
