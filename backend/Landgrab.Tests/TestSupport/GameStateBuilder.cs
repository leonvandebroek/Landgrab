using Landgrab.Api.Models;
using Landgrab.Api.Services;

namespace Landgrab.Tests.TestSupport;

internal sealed class GameStateBuilder
{
    private const double DefaultMapLat = 52.370216;
    private const double DefaultMapLng = 4.895168;

    private readonly GameState _state = new()
    {
        RoomCode = "TEST",
        Phase = GamePhase.Playing,
        GameMode = GameMode.FreeForAll,
        WinConditionType = WinConditionType.TerritoryPercent,
        WinConditionValue = 60,
        GridRadius = 1,
        Grid = HexService.BuildGrid(1)
    };

    public GameStateBuilder WithGrid(int radius)
    {
        _state.GridRadius = radius;
        _state.Grid = HexService.BuildGrid(radius);
        return this;
    }

    public GameStateBuilder WithPhase(GamePhase phase)
    {
        _state.Phase = phase;
        return this;
    }

    public GameStateBuilder WithGameMode(GameMode gameMode)
    {
        _state.GameMode = gameMode;
        return this;
    }

    public GameStateBuilder WithWinCondition(WinConditionType winConditionType, int winConditionValue = 60)
    {
        _state.WinConditionType = winConditionType;
        _state.WinConditionValue = winConditionValue;
        return this;
    }

    public GameStateBuilder WithTimedGame(int durationMinutes, DateTime startedAt)
    {
        _state.WinConditionType = WinConditionType.TimedGame;
        _state.GameDurationMinutes = durationMinutes;
        _state.GameStartedAt = startedAt;
        return this;
    }

    public GameStateBuilder WithMasterTile(int q, int r)
    {
        _state.MasterTileQ = q;
        _state.MasterTileR = r;
        _state.Grid[HexService.Key(q, r)].IsMasterTile = true;
        return this;
    }

    public GameStateBuilder WithMap(double mapLat = DefaultMapLat, double mapLng = DefaultMapLng, int tileSizeMeters = 25)
    {
        _state.MapLat = mapLat;
        _state.MapLng = mapLng;
        _state.TileSizeMeters = tileSizeMeters;
        return this;
    }

    public GameStateBuilder WithMapLocation(double mapLat = DefaultMapLat, double mapLng = DefaultMapLng, int tileSizeMeters = 25)
    {
        return WithMap(mapLat, mapLng, tileSizeMeters);
    }

    public GameStateBuilder WithClaimMode(ClaimMode claimMode)
    {
        _state.ClaimMode = claimMode;
        return this;
    }

    public GameStateBuilder WithAllowSelfClaim(bool allowSelfClaim)
    {
        _state.AllowSelfClaim = allowSelfClaim;
        return this;
    }

    public GameStateBuilder WithPaused(bool isPaused = true)
    {
        _state.IsPaused = isPaused;
        return this;
    }

    public GameStateBuilder WithBeaconEnabled(bool enabled = true)
    {
        _state.Dynamics.BeaconEnabled = enabled;
        return this;
    }

    public GameStateBuilder WithTileDecayEnabled(bool enabled = true)
    {
        _state.Dynamics.TileDecayEnabled = enabled;
        return this;
    }

    public GameStateBuilder WithTerrainEnabled(bool enabled = true)
    {
        _state.Dynamics.TerrainEnabled = enabled;
        return this;
    }

    public GameStateBuilder WithPlayerRolesEnabled(bool enabled = true)
    {
        _state.Dynamics.PlayerRolesEnabled = enabled;
        return this;
    }

    public GameStateBuilder WithSupplyLinesEnabled(bool enabled = true)
    {
        _state.Dynamics.SupplyLinesEnabled = enabled;
        return this;
    }

    public GameStateBuilder AddPlayer(string id, string name, string? allianceId = null)
    {
        var alliance = allianceId == null
            ? null
            : _state.Alliances.FirstOrDefault(existingAlliance => existingAlliance.Id == allianceId);

        _state.Players.Add(new PlayerDto
        {
            Id = id,
            Name = name,
            AllianceId = allianceId,
            AllianceName = alliance?.Name,
            AllianceColor = alliance?.Color,
            Color = $"#{id}"
        });

        return this;
    }

    public GameStateBuilder AddAlliance(string id, string name, params string[] memberIds)
    {
        var alliance = new AllianceDto
        {
            Id = id,
            Name = name,
            MemberIds = [.. memberIds],
            Color = $"#{id}"
        };

        _state.Alliances.Add(alliance);

        foreach (var memberId in memberIds)
        {
            var player = _state.Players.FirstOrDefault(existingPlayer => existingPlayer.Id == memberId);
            if (player == null)
                continue;

            player.AllianceId = id;
            player.AllianceName = name;
            player.AllianceColor = alliance.Color;
        }

        return this;
    }

    public GameStateBuilder OwnHex(int q, int r, string playerId, string? allianceId = null, int troops = 0)
    {
        var cell = _state.Grid[HexService.Key(q, r)];
        var player = _state.Players.Single(p => p.Id == playerId);

        cell.OwnerId = playerId;
        cell.OwnerAllianceId = allianceId;
        cell.OwnerName = player.Name;
        cell.OwnerColor = player.AllianceColor ?? player.Color;
        cell.Troops = troops;

        return this;
    }

    public GameStateBuilder WithTroops(int q, int r, int troops)
    {
        _state.Grid[HexService.Key(q, r)].Troops = troops;
        return this;
    }

    public GameStateBuilder WithTerrain(int q, int r, TerrainType terrainType)
    {
        _state.Grid[HexService.Key(q, r)].TerrainType = terrainType;
        return this;
    }

    public GameStateBuilder WithPlayerPosition(string playerId, int q, int r)
    {
        EnsureMapConfigured();

        var player = _state.Players.Single(existingPlayer => existingPlayer.Id == playerId);
        var (lat, lng) = HexService.HexToLatLng(q, r, _state.MapLat!.Value, _state.MapLng!.Value, _state.TileSizeMeters);
        player.CurrentLat = lat;
        player.CurrentLng = lng;
        player.CurrentHexQ = q;
        player.CurrentHexR = r;
        return this;
    }

    public GameStateBuilder WithPlayerRole(string playerId, PlayerRole role)
    {
        var player = _state.Players.Single(existingPlayer => existingPlayer.Id == playerId);
        player.Role = role;
        return this;
    }

    public GameStateBuilder WithCarriedTroops(string playerId, int carriedTroops, int? sourceQ = null, int? sourceR = null)
    {
        var player = _state.Players.Single(existingPlayer => existingPlayer.Id == playerId);
        player.CarriedTroops = carriedTroops;
        player.CarriedTroopsSourceQ = sourceQ;
        player.CarriedTroopsSourceR = sourceR;
        return this;
    }

    public GameStateBuilder WithPlayerAsHost(string playerId)
    {
        var player = _state.Players.Single(existingPlayer => existingPlayer.Id == playerId);
        player.IsHost = true;
        return this;
    }

    public GameState Build() => _state;

    private void EnsureMapConfigured()
    {
        if (_state.HasMapLocation)
            return;

        _state.MapLat = DefaultMapLat;
        _state.MapLng = DefaultMapLng;
    }
}
