using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class MapAreaService(IGameRoomProvider roomProvider, GameStateService gameStateService)
    : RoomScopedServiceBase(roomProvider, gameStateService)
{
    private static bool IsHost(GameRoom room, string userId) => GameStateCommon.IsHost(room, userId);
    private static string? ValidateCoordinates(double lat, double lng) => GameplayService.ValidateCoordinates(lat, lng);

    public (GameState? state, string? error) SetMapLocation(string roomCode, string userId, double lat, double lng)
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
            if (room.State.CurrentWizardStep == 0)
            {
                room.State.CurrentWizardStep = 1;
            }

            GameStateCommon.EnsureGrid(room.State);
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
            var effectiveFootprint = room.State.MaxFootprintMetersOverride ?? GameStateCommon.MaxFootprintMeters;
            var maxAllowedMeters = GameStateCommon.GetAllowedTileSizeMeters(
                room.State.Grid.Values.Select(cell => (cell.Q, cell.R)),
                1000,
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

            return ApplyGameArea(
                room,
                GameAreaMode.Centered,
                null,
                HexService.Spiral(GameStateCommon.DefaultGridRadius),
                "The host switched the game area to the centered field.");
        }
    }

    public (GameState? state, string? error) SetPatternGameArea(string roomCode, string userId, string pattern)
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

            return ApplyGameArea(
                room,
                GameAreaMode.Pattern,
                parsedPattern,
                BuildPatternCoordinates(parsedPattern),
                $"The host applied the {parsedPattern} game area pattern.");
        }
    }

    public (GameState? state, string? error) SetCustomGameArea(string roomCode, string userId, IReadOnlyList<HexCoordinateDto> coordinates)
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

            if (selectedCoordinates.Count < GameStateCommon.MinimumDrawnHexCount)
                return (null, $"Draw at least {GameStateCommon.MinimumDrawnHexCount} tiles for a custom game area.");
            if (!HexService.IsConnected(selectedCoordinates))
                return (null, "Custom game areas must be one connected shape.");

            return ApplyGameArea(
                room,
                GameAreaMode.Drawn,
                null,
                selectedCoordinates,
                "The host drew a custom game area.");
        }
    }

    public (GameState? state, string? error) SetMasterTile(string roomCode, string userId, double lat, double lng)
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

            GameStateCommon.EnsureGrid(room.State);

            if (!room.State.HasMapLocation)
            {
                room.State.MapLat = lat;
                room.State.MapLng = lng;
            }

            if (room.State.MapLat is null || room.State.MapLng is null)
                return (null, "Set the map location before placing the master tile.");

            var (q, r) = HexService.LatLngToHexForRoom(
                lat,
                lng,
                room.State.MapLat.Value,
                room.State.MapLng.Value,
                room.State.TileSizeMeters);

            return SetMasterTileByHexCore(room, q, r);
        }
    }

    public (GameState? state, string? error) SetMasterTileByHex(string roomCode, string userId, int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            var placementError = ValidateMasterTilePlacement(room, userId);
            if (placementError != null)
                return (null, placementError);

            GameStateCommon.EnsureGrid(room.State);
            return SetMasterTileByHexCore(room, q, r);
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

    private (GameState? state, string? error) ApplyGameArea(
        GameRoom room,
        GameAreaMode mode,
        GameAreaPattern? pattern,
        IEnumerable<(int q, int r)> coordinates,
        string eventMessage)
    {
        var normalizedCoordinates = coordinates.Distinct().ToList();
        if (normalizedCoordinates.Count == 0)
            return (null, "The game area must contain at least one tile.");

        room.State.GameAreaMode = mode;
        room.State.GameAreaPattern = pattern;
        room.State.Grid = HexService.BuildGrid(normalizedCoordinates);
        room.State.GridRadius = Math.Max(1, HexService.InferRadius(normalizedCoordinates));
        room.State.TileSizeMeters = GameStateCommon.GetAllowedTileSizeMeters(
            normalizedCoordinates,
            room.State.TileSizeMeters,
            room.State.MaxFootprintMetersOverride ?? GameStateCommon.MaxFootprintMeters);
        GameStateCommon.ResetBoardStateForAreaChange(room.State);

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

    private static IEnumerable<(int q, int r)> BuildPatternCoordinates(GameAreaPattern pattern)
    {
        return HexService.Spiral(GameStateCommon.DefaultGridRadius).Where(coord => pattern switch
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
        return radius <= 5 || (radius <= GameStateCommon.DefaultGridRadius && (q == 0 || r == 0 || s == 0));
    }
}
