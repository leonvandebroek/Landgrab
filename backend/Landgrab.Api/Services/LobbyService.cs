using System.Text.Json;
using Landgrab.Api.Data;
using Landgrab.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Services;

public class LobbyService(IGameRoomProvider roomProvider, GameStateService gameStateService, IServiceScopeFactory serviceScopeFactory, ILogger<LobbyService> logger)
{
    private readonly IServiceScopeFactory _scopeFactory = serviceScopeFactory;
    private readonly ILogger<LobbyService> _logger = logger;
    internal const int DefaultGridRadius = 8;
    internal const int DefaultTileSizeMeters = 25;
    internal const int MaxFootprintMeters = 1_000;
    internal const int MinimumDrawnHexCount = 7;

    internal static readonly string[] Colors =
        ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e",
         "#e91e63", "#00bcd4", "#8bc34a", "#ff5722", "#673ab7", "#009688", "#ffc107", "#795548"];

    internal static readonly string[] AllianceColors = ["#ef4444", "#06b6d4", "#f59e0b", "#a855f7", "#10b981", "#ec4899", "#e67e22", "#34495e"];

    internal static readonly Dictionary<string, List<CopresenceMode>> CopresencePresets = new()
    {
        ["Klassiek"] = [],
        ["Territorium"] = [CopresenceMode.Shepherd, CopresenceMode.Drain],
        ["Formatie"] = [CopresenceMode.FrontLine, CopresenceMode.Rally],
        ["Logistiek"] = [CopresenceMode.Shepherd, CopresenceMode.Relay, CopresenceMode.FrontLine],
        ["Infiltratie"] = [CopresenceMode.Stealth, CopresenceMode.CommandoRaid, CopresenceMode.Scout],
        ["Chaos"] = [CopresenceMode.JagerProoi, CopresenceMode.Duel, CopresenceMode.PresenceBonus],
        ["Tolweg"] = [CopresenceMode.Beacon, CopresenceMode.Toll, CopresenceMode.Drain],
    };

    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);
    private static string? ValidateCoordinates(double lat, double lng) => GameplayService.ValidateCoordinates(lat, lng);
    private static void SetCellOwner(HexCell cell, PlayerDto player) => GameplayService.SetCellOwner(cell, player);
    private static void RefreshTerritoryCount(GameState state) => GameplayService.RefreshTerritoryCount(state);
    private static void ResetCarriedTroops(PlayerDto player) => GameplayService.ResetCarriedTroops(player);

    public (GameState? state, string? error) SetAlliance(string roomCode, string userId,
        string allianceName)
    {
        if (string.IsNullOrWhiteSpace(allianceName))
            return (null, "Alliance name is required.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Alliances can only be changed in the lobby.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            var previousAllianceId = player.AllianceId;
            var previousAllianceName = player.AllianceName;
            var normalizedName = allianceName.Trim();
            var alliance = room.State.Alliances.FirstOrDefault(a =>
                a.Name.Equals(normalizedName, StringComparison.OrdinalIgnoreCase));

            if (alliance == null)
            {
                if (room.State.Alliances.Count >= 8)
                    return (null, "Max 8 alliances per game.");

                alliance = new AllianceDto
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = normalizedName,
                    Color = AllianceColors[room.State.Alliances.Count % AllianceColors.Length]
                };
                room.State.Alliances.Add(alliance);
            }

            foreach (var existingAlliance in room.State.Alliances)
                existingAlliance.MemberIds.Remove(userId);

            alliance.MemberIds.Add(userId);
            player.AllianceId = alliance.Id;
            player.AllianceName = alliance.Name;
            player.AllianceColor = alliance.Color;
            player.Color = alliance.Color;

            foreach (var cell in room.State.Grid.Values.Where(cell => cell.OwnerId == userId))
            {
                cell.OwnerAllianceId = player.AllianceId;
                cell.OwnerColor = player.AllianceColor ?? player.Color;
                cell.OwnerName = player.Name;
            }

            RefreshTerritoryCount(room.State);
            if (!string.Equals(previousAllianceId, player.AllianceId, StringComparison.Ordinal))
            {
                var changeMessage = previousAllianceName == null
                    ? $"{player.Name} joined alliance {alliance.Name}."
                    : $"{player.Name} changed alliance from {previousAllianceName} to {alliance.Name}.";
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "AllianceChanged",
                    Message = changeMessage,
                    PlayerId = player.Id,
                    PlayerName = player.Name,
                    AllianceId = alliance.Id,
                    AllianceName = alliance.Name
                });
            }

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ConfigureAlliances(string roomCode, string userId, List<string> allianceNames)
    {
        if (allianceNames == null || allianceNames.Count == 0)
            return (null, "At least one alliance name is required.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can configure alliances.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Alliances can only be configured in the lobby.");

            room.State.Alliances.Clear();
            for (var i = 0; i < allianceNames.Count; i++)
            {
                var name = allianceNames[i].Trim();
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                room.State.Alliances.Add(new AllianceDto
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = name,
                    Color = AllianceColors[i % AllianceColors.Length]
                });
            }

            foreach (var player in room.State.Players)
            {
                player.AllianceId = null;
                player.AllianceName = null;
                player.AllianceColor = null;
            }

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AlliancesConfigured",
                Message = $"The host configured {room.State.Alliances.Count} alliances.",
                PlayerId = userId,
                PlayerName = host?.Name
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) DistributePlayersRandomly(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can distribute players.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Players can only be distributed in the lobby.");
            if (room.State.Alliances.Count == 0)
                return (null, "Configure at least one alliance before distributing players.");

            var shuffledPlayers = room.State.Players.OrderBy(_ => Random.Shared.Next()).ToList();
            for (var i = 0; i < shuffledPlayers.Count; i++)
            {
                var alliance = room.State.Alliances[i % room.State.Alliances.Count];
                var player = shuffledPlayers[i];
                player.AllianceId = alliance.Id;
                player.AllianceName = alliance.Name;
                player.AllianceColor = alliance.Color;
                player.Color = alliance.Color;
            }

            foreach (var alliance in room.State.Alliances)
            {
                alliance.MemberIds.Clear();
                alliance.MemberIds.AddRange(
                    room.State.Players.Where(p => p.AllianceId == alliance.Id).Select(p => p.Id));
            }

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "PlayersDistributed",
                Message = "The host randomly distributed all players across alliances.",
                PlayerId = userId,
                PlayerName = host?.Name
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) AssignAllianceStartingTile(string roomCode, string userId,
        int q, int r, string allianceId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can assign alliance starting tiles.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Starting tiles can only be assigned in the lobby.");
            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "Set the master tile before assigning starting tiles.");

            var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == allianceId);
            if (alliance == null)
                return (null, "Alliance not found.");

            var firstMember = room.State.Players.FirstOrDefault(p => p.AllianceId == allianceId);
            if (firstMember == null)
                return (null, "Alliance has no members.");

            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var cell))
                return (null, "Invalid hex.");
            if (cell.IsMasterTile)
                return (null, "The master tile cannot be assigned as a starting tile.");
            if (cell.OwnerId != null)
                return (null, "This hex is already assigned.");

            cell.OwnerId = firstMember.Id;
            cell.OwnerAllianceId = alliance.Id;
            cell.OwnerName = firstMember.Name;
            cell.OwnerColor = alliance.Color;
            cell.Troops = 3;
            RefreshTerritoryCount(room.State);

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AllianceStartingTileAssigned",
                Message = $"Alliance {alliance.Name} was assigned a starting tile at ({q}, {r}).",
                PlayerId = userId,
                PlayerName = host?.Name,
                AllianceId = alliance.Id,
                AllianceName = alliance.Name,
                Q = q,
                R = r
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetMapLocation(string roomCode, string userId,
        double lat, double lng)
    {
        var error = ValidateCoordinates(lat, lng);
        if (error != null)
            return (null, error);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can set the map location.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Map location can only be changed in the lobby.");

            room.State.MapLat = lat;
            room.State.MapLng = lng;
            EnsureGrid(room.State);
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetTileSize(string roomCode, string userId, int meters)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change tile size.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Tile size can only be changed in the lobby.");

            var targetMeters = Math.Clamp(meters, 15, 1000);
            var effectiveFootprint = room.State.MaxFootprintMetersOverride ?? MaxFootprintMeters;
            var maxAllowedMeters = GetAllowedTileSizeMeters(room.State.Grid.Values.Select(cell => (cell.Q, cell.R)), 1000,
                effectiveFootprint);
            if (targetMeters > maxAllowedMeters)
                return (null, $"This game area can use at most {maxAllowedMeters} meters per tile to stay within {effectiveFootprint:N0} meters.");

            room.State.TileSizeMeters = targetMeters;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (bool success, string? error) SetHostBypassGps(string roomCode, string userId, bool bypass)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (false, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (false, "Only the host can change GPS bypass.");
            if (room.State.Phase != GamePhase.Lobby)
                return (false, "GPS bypass can only be changed in the lobby.");

            room.State.HostBypassGps = bypass;
            QueuePersistence(room, SnapshotState(room.State));
            return (true, null);
        }
    }

    public (bool success, string? error) SetMaxFootprint(string roomCode, string userId, int meters)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (false, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (false, "Only the host can change the max footprint.");
            if (room.State.Phase != GamePhase.Lobby)
                return (false, "Max footprint can only be changed in the lobby.");
            if (meters < 100 || meters > 50_000)
                return (false, "Max footprint must be between 100 and 50,000 meters.");

            room.State.MaxFootprintMetersOverride = meters;
            QueuePersistence(room, SnapshotState(room.State));
            return (true, null);
        }
    }

    public async Task<(bool success, string? error)> LoadMapTemplate(string roomCode, string userId,
        Guid templateId, IServiceScopeFactory scopeFactory)
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

        // Fetch template outside lock — DB access is async
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

        var coordinates = JsonSerializer.Deserialize<List<HexCoordinateDto>>(template.HexCoordinatesJson)
            ?? [];
        var selectedCoordinates = coordinates
            .Select(c => (c.Q, c.R))
            .Distinct()
            .ToList();

        if (selectedCoordinates.Count < MinimumDrawnHexCount)
            return (false, $"Template must contain at least {MinimumDrawnHexCount} tiles.");
        if (!HexService.IsConnected(selectedCoordinates))
            return (false, "Template coordinates must form a connected shape.");

        lock (room.SyncRoot)
        {
            // Re-validate after re-acquiring lock
            if (room.State.Phase != GamePhase.Lobby)
                return (false, "Templates can only be loaded in the lobby.");

            var normalizedCoordinates = selectedCoordinates;
            room.State.GameAreaMode = GameAreaMode.Drawn;
            room.State.GameAreaPattern = null;
            room.State.Grid = HexService.BuildGrid(normalizedCoordinates);
            room.State.GridRadius = Math.Max(1, HexService.InferRadius(normalizedCoordinates));

            if (template.TileSizeMeters > 0)
                room.State.TileSizeMeters = template.TileSizeMeters;

            room.State.TileSizeMeters = GetAllowedTileSizeMeters(normalizedCoordinates, room.State.TileSizeMeters,
                room.State.MaxFootprintMetersOverride ?? MaxFootprintMeters);
            ResetBoardStateForAreaChange(room.State);

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
        string roomCode, string userId, string name, string? description,
        IServiceScopeFactory scopeFactory)
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

    public (GameState? state, string? error) UseCenteredGameArea(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateGameAreaUpdate(room, userId);
            if (validationError != null)
                return (null, validationError);

            return ApplyGameArea(room, GameAreaMode.Centered, null, HexService.Spiral(DefaultGridRadius),
                "The host switched the game area to the centered field.");
        }
    }

    public (GameState? state, string? error) SetPatternGameArea(string roomCode, string userId,
        string pattern)
    {
        if (!Enum.TryParse<GameAreaPattern>(pattern, true, out var parsedPattern))
            return (null, "Invalid game area pattern.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateGameAreaUpdate(room, userId);
            if (validationError != null)
                return (null, validationError);

            return ApplyGameArea(room, GameAreaMode.Pattern, parsedPattern,
                BuildPatternCoordinates(parsedPattern),
                $"The host applied the {parsedPattern} game area pattern.");
        }
    }

    public (GameState? state, string? error) SetCustomGameArea(string roomCode, string userId,
        IReadOnlyList<HexCoordinateDto> coordinates)
    {
        ArgumentNullException.ThrowIfNull(coordinates);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var validationError = ValidateGameAreaUpdate(room, userId);
            if (validationError != null)
                return (null, validationError);

            var selectedCoordinates = coordinates
                .Select(coord => (coord.Q, coord.R))
                .Distinct()
                .ToList();

            if (selectedCoordinates.Count < MinimumDrawnHexCount)
                return (null, $"Draw at least {MinimumDrawnHexCount} tiles for a custom game area.");
            if (!HexService.IsConnected(selectedCoordinates))
                return (null, "Custom game areas must be one connected shape.");

            return ApplyGameArea(room, GameAreaMode.Drawn, null, selectedCoordinates,
                "The host drew a custom game area.");
        }
    }

    public (GameState? state, string? error) SetClaimMode(string roomCode, string userId,
        string claimMode)
    {
        if (!Enum.TryParse<ClaimMode>(claimMode, true, out var parsedClaimMode))
            return (null, "Invalid claim mode.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change claim mode.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Claim mode can only be changed in the lobby.");

            room.State.ClaimMode = parsedClaimMode;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetAllowSelfClaim(string roomCode, string userId,
        bool allow)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change self-claim settings.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Self-claim settings can only be changed in the lobby.");

            room.State.AllowSelfClaim = allow;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetWinCondition(string roomCode, string userId,
        string winConditionType, int value)
    {
        if (!Enum.TryParse<WinConditionType>(winConditionType, true, out var parsedWinCondition))
            return (null, "Invalid win condition.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change the win condition.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Win condition can only be changed in the lobby.");

            switch (parsedWinCondition)
            {
                case WinConditionType.TerritoryPercent:
                    if (value < 1 || value > 100)
                        return (null, "Territory percent must be between 1 and 100.");
                    room.State.WinConditionValue = value;
                    room.State.GameDurationMinutes = null;
                    break;
                case WinConditionType.Elimination:
                    room.State.WinConditionValue = 1;
                    room.State.GameDurationMinutes = null;
                    break;
                case WinConditionType.TimedGame:
                    if (value < 1)
                        return (null, "Timed games must last at least 1 minute.");
                    room.State.WinConditionValue = value;
                    room.State.GameDurationMinutes = value;
                    break;
            }

            room.State.WinConditionType = parsedWinCondition;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetCopresenceModes(string roomCode, string userId,
        List<string> modes)
    {
        var parsed = new List<CopresenceMode>();
        foreach (var mode in modes)
        {
            if (!Enum.TryParse<CopresenceMode>(mode, true, out var parsedMode) || parsedMode == CopresenceMode.None)
                return (null, $"Invalid copresence mode: {mode}");
            parsed.Add(parsedMode);
        }

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change copresence modes.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Copresence modes can only be changed in the lobby.");

            room.State.Dynamics.ActiveCopresenceModes = parsed;
            room.State.Dynamics.CopresencePreset = "Aangepast";
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetCopresencePreset(string roomCode, string userId,
        string preset)
    {
        if (preset != "Aangepast" && !CopresencePresets.ContainsKey(preset))
            return (null, $"Unknown preset: {preset}");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change the copresence preset.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Copresence preset can only be changed in the lobby.");

            room.State.Dynamics.CopresencePreset = preset;
            if (preset != "Aangepast" && CopresencePresets.TryGetValue(preset, out var presetModes))
                room.State.Dynamics.ActiveCopresenceModes = [.. presetModes];

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetGameDynamics(string roomCode, string userId,
        GameDynamics dynamics)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change game dynamics.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Game dynamics can only be changed in the lobby.");

            room.State.Dynamics.TerrainEnabled = dynamics.TerrainEnabled;
            room.State.Dynamics.PlayerRolesEnabled = dynamics.PlayerRolesEnabled;
            room.State.Dynamics.FogOfWarEnabled = dynamics.FogOfWarEnabled;
            room.State.Dynamics.SupplyLinesEnabled = dynamics.SupplyLinesEnabled;
            room.State.Dynamics.HQEnabled = dynamics.HQEnabled;
            room.State.Dynamics.TimedEscalationEnabled = dynamics.TimedEscalationEnabled;
            room.State.Dynamics.UnderdogPactEnabled = dynamics.UnderdogPactEnabled;
            room.State.Dynamics.NeutralNPCEnabled = dynamics.NeutralNPCEnabled;
            room.State.Dynamics.RandomEventsEnabled = dynamics.RandomEventsEnabled;
            room.State.Dynamics.MissionSystemEnabled = dynamics.MissionSystemEnabled;

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetPlayerRole(string roomCode, string userId, string role)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Roles can only be set during lobby.");
            if (!room.State.Dynamics.PlayerRolesEnabled)
                return (null, "Player roles are not enabled for this game.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            if (!Enum.TryParse<PlayerRole>(role, out var parsedRole))
                return (null, "Invalid role.");

            player.Role = parsedRole;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetAllianceHQ(string roomCode, string userId, int q, int r, string allianceId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can set HQ locations.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "HQ can only be set during lobby.");
            if (!room.State.Dynamics.HQEnabled)
                return (null, "HQ mechanic is not enabled for this game.");

            var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == allianceId);
            if (alliance == null)
                return (null, "Alliance not found.");

            var key = HexService.Key(q, r);
            if (!room.State.Grid.ContainsKey(key))
                return (null, "Invalid hex coordinates.");

            alliance.HQHexQ = q;
            alliance.HQHexR = r;
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }


    public (GameState? state, string? error) SetMasterTile(string roomCode, string userId,
        double lat, double lng)
    {
        var error = ValidateCoordinates(lat, lng);
        if (error != null)
            return (null, error);

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var placementError = ValidateMasterTilePlacement(room, userId);
            if (placementError != null)
                return (null, placementError);

            EnsureGrid(room.State);

            if (!room.State.HasMapLocation)
            {
                room.State.MapLat = lat;
                room.State.MapLng = lng;
            }

            if (room.State.MapLat is null || room.State.MapLng is null)
                return (null, "Set the map location before placing the master tile.");

            var (q, r) = HexService.LatLngToHexForRoom(lat, lng,
                room.State.MapLat.Value, room.State.MapLng.Value, room.State.TileSizeMeters);

            return SetMasterTileByHexCore(room, q, r);
        }
    }

    public (GameState? state, string? error) SetMasterTileByHex(string roomCode, string userId,
        int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var placementError = ValidateMasterTilePlacement(room, userId);
            if (placementError != null)
                return (null, placementError);

            EnsureGrid(room.State);
            return SetMasterTileByHexCore(room, q, r);
        }
    }

    public (GameState? state, string? error) AssignStartingTile(string roomCode, string userId,
        int q, int r, string targetPlayerId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can assign starting tiles.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Starting tiles can only be assigned in the lobby.");
            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "Set the master tile before assigning starting tiles.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == targetPlayerId);
            if (player == null)
                return (null, "Target player is not in the room.");

            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var cell))
                return (null, "Invalid hex.");
            if (cell.IsMasterTile)
                return (null, "The master tile cannot be assigned as a starting tile.");
            if (cell.OwnerId != null)
                return (null, "This hex is already assigned.");

            SetCellOwner(cell, player);
            cell.Troops = 3;
            RefreshTerritoryCount(room.State);
            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "StartingTileAssigned",
                Message = $"{player.Name} was assigned a starting tile at ({q}, {r}).",
                PlayerId = userId,
                PlayerName = host?.Name,
                TargetPlayerId = player.Id,
                TargetPlayerName = player.Name,
                Q = q,
                R = r
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    /// <summary>
    /// Auto-assigns master tile at (0,0) and evenly-spaced starting tiles for any
    /// players who don't already have one. Call before StartGame validation.
    /// Must be called while holding <c>room.SyncRoot</c>.
    /// </summary>
    private void AutoAssignTiles(GameRoom room)
    {
        EnsureGrid(room.State);

        // Auto-place master tile at the most central available hex if not yet set.
        if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
        {
            var centerCell = room.State.Grid.Values
                .Where(cell => cell.OwnerId == null && cell.TerrainType != TerrainType.Water)
                .OrderBy(cell => HexService.HexDistance(cell.Q, cell.R))
                .ThenBy(cell => cell.Q)
                .ThenBy(cell => cell.R)
                .FirstOrDefault();

            if (centerCell != null)
            {
                centerCell.IsMasterTile = true;
                centerCell.Troops = Math.Max(centerCell.Troops, 1);
                room.State.MasterTileQ = centerCell.Q;
                room.State.MasterTileR = centerCell.R;
                var host = room.State.Players.FirstOrDefault(p => p.IsHost);
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "MasterTileAssigned",
                    Message = $"The master tile was auto-assigned to hex ({centerCell.Q}, {centerCell.R}).",
                    PlayerId = host?.Id,
                    PlayerName = host?.Name,
                    Q = centerCell.Q,
                    R = centerCell.R
                });
            }
        }

        // When alliances exist, assign starting tiles per-alliance instead of per-player
        if (room.State.Alliances.Count > 0)
        {
            var alliancesNeedingTile = room.State.Alliances
                .Where(a => a.MemberIds.Count > 0 &&
                            HexService.AllianceTerritoryCount(room.State.Grid, a.Id) == 0)
                .ToList();

            if (alliancesNeedingTile.Count == 0)
                return;

            const int preferredRingRadius = 4;
            var positions = HexService.GetEvenlySpacedRing(
                alliancesNeedingTile.Count,
                preferredRingRadius,
                room.State.GridRadius);

            var available = positions
                .Where(pos =>
                {
                    var key = HexService.Key(pos.q, pos.r);
                    return room.State.Grid.TryGetValue(key, out var cell)
                           && cell.OwnerId == null
                           && !cell.IsMasterTile
                           && cell.TerrainType != TerrainType.Water;
                })
                .ToList();

            if (available.Count < alliancesNeedingTile.Count)
            {
                available = room.State.Grid.Values
                    .Where(cell => cell.OwnerId == null && !cell.IsMasterTile && cell.TerrainType != TerrainType.Water)
                    .OrderByDescending(cell => HexService.HexDistance(cell.Q, cell.R))
                    .ThenBy(cell => Math.Atan2(cell.R + cell.Q / 2d, cell.Q))
                    .Select(cell => (cell.Q, cell.R))
                    .ToList();
            }

            var host2 = room.State.Players.FirstOrDefault(p => p.IsHost);
            for (var i = 0; i < alliancesNeedingTile.Count && i < available.Count; i++)
            {
                var alliance = alliancesNeedingTile[i];
                var firstMember = room.State.Players.FirstOrDefault(p => p.AllianceId == alliance.Id);
                if (firstMember == null)
                    continue;

                var (q, r) = available[i];
                var cell = room.State.Grid[HexService.Key(q, r)];
                cell.OwnerId = firstMember.Id;
                cell.OwnerAllianceId = alliance.Id;
                cell.OwnerName = firstMember.Name;
                cell.OwnerColor = alliance.Color;
                cell.Troops = 3;
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "AllianceStartingTileAssigned",
                    Message = $"Alliance {alliance.Name} was auto-assigned a starting tile at ({q}, {r}).",
                    PlayerId = host2?.Id,
                    PlayerName = host2?.Name,
                    AllianceId = alliance.Id,
                    AllianceName = alliance.Name,
                    Q = q,
                    R = r
                });
            }

            RefreshTerritoryCount(room.State);
            return;
        }

        // Auto-assign starting tiles for players who don't have one (original logic)
        var playersNeedingTile = room.State.Players
            .Where(p => HexService.TerritoryCount(room.State.Grid, p.Id) == 0)
            .ToList();

        if (playersNeedingTile.Count == 0)
            return;

        const int preferredRingRadius2 = 4;
        var positions2 = HexService.GetEvenlySpacedRing(
            playersNeedingTile.Count,
            preferredRingRadius2,
            room.State.GridRadius);

        // Filter out positions that are taken or are the master tile
        var available2 = positions2
            .Where(pos =>
            {
                var key = HexService.Key(pos.q, pos.r);
                return room.State.Grid.TryGetValue(key, out var cell)
                       && cell.OwnerId == null
                       && !cell.IsMasterTile
                       && cell.TerrainType != TerrainType.Water;
            })
            .ToList();

        // If not enough positions on the preferred ring, try a wider ring
        if (available2.Count < playersNeedingTile.Count)
        {
            available2 = room.State.Grid.Values
                .Where(cell => cell.OwnerId == null && !cell.IsMasterTile && cell.TerrainType != TerrainType.Water)
                .OrderByDescending(cell => HexService.HexDistance(cell.Q, cell.R))
                .ThenBy(cell => Math.Atan2(cell.R + cell.Q / 2d, cell.Q))
                .Select(cell => (cell.Q, cell.R))
                .ToList();
        }

        var host3 = room.State.Players.FirstOrDefault(p => p.IsHost);
        for (var i = 0; i < playersNeedingTile.Count && i < available2.Count; i++)
        {
            var player = playersNeedingTile[i];
            var (q, r) = available2[i];
            var cell = room.State.Grid[HexService.Key(q, r)];
            SetCellOwner(cell, player);
            cell.Troops = 3;
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "StartingTileAssigned",
                Message = $"{player.Name} was auto-assigned a starting tile at ({q}, {r}).",
                PlayerId = host3?.Id,
                PlayerName = host3?.Name,
                TargetPlayerId = player.Id,
                TargetPlayerName = player.Name,
                Q = q,
                R = r
            });
        }

        RefreshTerritoryCount(room.State);
    }

    public (GameState? state, string? error) StartGame(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can start the game.");
            if (room.State.Players.Count < 2)
                return (null, "Need at least 2 players.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Game already started.");
            if (!room.State.HasMapLocation)
                return (null, "Map location must be set before starting the game.");
            if (room.State.Players.Any(player => string.IsNullOrWhiteSpace(player.AllianceId)))
                return (null, "Every player must join an alliance before the game can start.");
            if (room.State.Grid.Count < room.State.Players.Count + 1)
                return (null, "The game area must have enough tiles for the master tile and every player.");

            // Auto-assign master tile and starting tiles for any players who missed manual placement
            AutoAssignTiles(room);

            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "The master tile must be set before starting the game.");

            RefreshTerritoryCount(room.State);
            // A player with 0 personal territory is still fine if their alliance has territory
            // (supports co-op alliances where multiple players share one starting area).
            if (room.State.Players.Any(player =>
            {
                if (player.TerritoryCount > 0) return false;
                if (player.AllianceId != null)
                {
                    var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == player.AllianceId);
                    if (alliance != null && alliance.TerritoryCount > 0) return false;
                }
                return true;
            }))
                return (null, "Every player needs at least one starting tile before the game can start.");

            room.State.Phase = GamePhase.Playing;
            room.State.GameStartedAt = DateTime.UtcNow;

            // Phase 10: Neutral NPC Hexes — assign Building terrain hexes as NPC-owned
            if (room.State.Dynamics.NeutralNPCEnabled)
            {
                foreach (var cell in room.State.Grid.Values)
                {
                    if (cell.TerrainType == TerrainType.Building && !cell.IsMasterTile && cell.OwnerId == null)
                    {
                        cell.OwnerId = "NPC";
                        cell.OwnerName = "NPC";
                        cell.OwnerColor = "#7f8c8d";
                        cell.Troops = 3;
                    }
                }

                // Fallback: if no Building terrain hexes exist (e.g., terrain not enabled or no OSM data),
                // assign a small number of random unowned non-master hexes as NPC territory.
                if (!room.State.Grid.Values.Any(c => c.OwnerId == "NPC"))
                {
                    var candidates = room.State.Grid.Values
                        .Where(c => !c.IsMasterTile && c.OwnerId == null)
                        .OrderBy(_ => Random.Shared.Next())
                        .Take(Math.Max(1, room.State.Grid.Count / 10))
                        .ToList();
                    foreach (var cell in candidates)
                    {
                        cell.OwnerId = "NPC";
                        cell.OwnerName = "NPC";
                        cell.OwnerColor = "#7f8c8d";
                        cell.Troops = 3;
                    }
                }
            }

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "GameStarted",
                Message = "The game has started.",
                PlayerId = userId,
                PlayerName = host?.Name
            });
            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    private static string? ValidateMasterTilePlacement(GameRoom room, string userId)
    {
        if (!IsHost(room, userId))
            return "Only the host can set the master tile.";
        if (room.State.Phase != GamePhase.Lobby)
            return "The master tile can only be changed in the lobby.";

        return null;
    }

    private static string? ValidateGameAreaUpdate(GameRoom room, string userId)
    {
        if (!IsHost(room, userId))
            return "Only the host can change the game area.";
        if (room.State.Phase != GamePhase.Lobby)
            return "The game area can only be changed in the lobby.";

        return null;
    }

    private (GameState? state, string? error) ApplyGameArea(GameRoom room, GameAreaMode mode,
        GameAreaPattern? pattern, IEnumerable<(int q, int r)> coordinates, string eventMessage)
    {
        var normalizedCoordinates = coordinates.Distinct().ToList();
        if (normalizedCoordinates.Count == 0)
            return (null, "The game area must contain at least one tile.");

        room.State.GameAreaMode = mode;
        room.State.GameAreaPattern = pattern;
        room.State.Grid = HexService.BuildGrid(normalizedCoordinates);
        room.State.GridRadius = Math.Max(1, HexService.InferRadius(normalizedCoordinates));
        room.State.TileSizeMeters = GetAllowedTileSizeMeters(normalizedCoordinates, room.State.TileSizeMeters,
            room.State.MaxFootprintMetersOverride ?? MaxFootprintMeters);
        ResetBoardStateForAreaChange(room.State);

        var host = room.State.Players.FirstOrDefault(player => player.IsHost);
        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "GameAreaUpdated",
            Message = eventMessage,
            PlayerId = host?.Id,
            PlayerName = host?.Name
        });

        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }

    private (GameState? state, string? error) SetMasterTileByHexCore(GameRoom room, int q, int r)
    {
        if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var masterCell))
            return (null, "Master tile must be inside the room grid.");
        if (masterCell.OwnerId != null)
            return (null, "The master tile must be an unowned hex.");

        if (room.State.MasterTileQ is int previousQ && room.State.MasterTileR is int previousR &&
            room.State.Grid.TryGetValue(HexService.Key(previousQ, previousR), out var previousCell))
        {
            previousCell.IsMasterTile = false;
            if (previousCell.OwnerId == null)
                previousCell.Troops = 0;
        }

        masterCell.IsMasterTile = true;
        masterCell.Troops = Math.Max(masterCell.Troops, 1);
        room.State.MasterTileQ = q;
        room.State.MasterTileR = r;
        var host = room.State.Players.FirstOrDefault(player => player.IsHost);
        AppendEventLog(room.State, new GameEventLogEntry
        {
            Type = "MasterTileAssigned",
            Message = $"The master tile was assigned to hex ({q}, {r}).",
            PlayerId = host?.Id,
            PlayerName = host?.Name,
            Q = q,
            R = r
        });
        var snapshot = SnapshotState(room.State);
        QueuePersistence(room, snapshot);
        return (snapshot, null);
    }

    internal static Dictionary<string, HexCell> BuildGridForState(GameState state)
    {
        return state.GameAreaMode switch
        {
            GameAreaMode.Pattern when state.GameAreaPattern.HasValue =>
                HexService.BuildGrid(BuildPatternCoordinates(state.GameAreaPattern.Value)),
            GameAreaMode.Drawn when state.Grid.Count > 0 =>
                HexService.BuildGrid(state.Grid.Values.Select(cell => (cell.Q, cell.R))),
            _ => HexService.BuildGrid(HexService.Spiral(Math.Max(1, state.GridRadius)))
        };
    }

    internal static int GetAllowedTileSizeMeters(IEnumerable<(int q, int r)> coordinates, int requestedMeters,
        int maxFootprintMeters)
    {
        var maxAllowedMeters = Math.Max(15,
            HexService.GetMaxTileSizeForFootprint(coordinates, maxFootprintMeters));
        return Math.Clamp(requestedMeters, 15, maxAllowedMeters);
    }

    private static IEnumerable<(int q, int r)> BuildPatternCoordinates(GameAreaPattern pattern)
    {
        return HexService.Spiral(DefaultGridRadius).Where(coord => pattern switch
        {
            GameAreaPattern.WideFront => FitsWideFront(coord.q, coord.r),
            GameAreaPattern.TallFront => FitsTallFront(coord.q, coord.r),
            GameAreaPattern.Crossroads => FitsCrossroads(coord.q, coord.r),
            GameAreaPattern.Starburst => FitsStarburst(coord.q, coord.r),
            _ => true
        });
    }

    private static bool FitsWideFront(int q, int r)
    {
        var s = -q - r;
        return Math.Abs(q) <= 8 && Math.Abs(r) <= 4 && Math.Abs(s) <= 8;
    }

    private static bool FitsTallFront(int q, int r)
    {
        var s = -q - r;
        return Math.Abs(q) <= 4 && Math.Abs(r) <= 8 && Math.Abs(s) <= 8;
    }

    private static bool FitsCrossroads(int q, int r)
    {
        var s = -q - r;
        var radius = HexService.HexDistance(q, r);
        return radius <= 4 || Math.Abs(q) <= 1 || Math.Abs(r) <= 1 || Math.Abs(s) <= 1;
    }

    private static bool FitsStarburst(int q, int r)
    {
        var s = -q - r;
        var radius = HexService.HexDistance(q, r);
        return radius <= 5 || (radius <= DefaultGridRadius && (q == 0 || r == 0 || s == 0));
    }

    private static void ResetBoardStateForAreaChange(GameState state)
    {
        state.MasterTileQ = null;
        state.MasterTileR = null;

        foreach (var cell in state.Grid.Values)
        {
            cell.OwnerId = null;
            cell.OwnerAllianceId = null;
            cell.OwnerName = null;
            cell.OwnerColor = null;
            cell.Troops = 0;
            cell.IsMasterTile = false;
        }

        foreach (var player in state.Players)
        {
            ResetCarriedTroops(player);
            player.TerritoryCount = 0;
        }

        foreach (var alliance in state.Alliances)
            alliance.TerritoryCount = 0;
    }

    private static void EnsureGrid(GameState state)
    {
        if (state.Grid.Count == 0)
            state.Grid = BuildGridForState(state);
    }

    internal static bool IsHost(GameRoom room, string userId) => room.HostUserId.ToString() == userId;
}
