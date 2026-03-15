using Landgrab.Api.Models;
using Landgrab.Api.Services;

namespace Landgrab.Tests.TestSupport;

internal sealed class GameStateBuilder
{
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

    public GameStateBuilder AddPlayer(string id, string name, string? allianceId = null)
    {
        _state.Players.Add(new PlayerDto
        {
            Id = id,
            Name = name,
            AllianceId = allianceId,
            Color = $"#{id}"
        });

        return this;
    }

    public GameStateBuilder AddAlliance(string id, string name, params string[] memberIds)
    {
        _state.Alliances.Add(new AllianceDto
        {
            Id = id,
            Name = name,
            MemberIds = [.. memberIds],
            Color = $"#{id}"
        });

        return this;
    }

    public GameStateBuilder OwnHex(int q, int r, string playerId, string? allianceId = null)
    {
        var cell = _state.Grid[HexService.Key(q, r)];
        var player = _state.Players.Single(p => p.Id == playerId);

        cell.OwnerId = playerId;
        cell.OwnerAllianceId = allianceId;
        cell.OwnerName = player.Name;
        cell.OwnerColor = player.Color;

        return this;
    }

    public GameState Build() => _state;
}
