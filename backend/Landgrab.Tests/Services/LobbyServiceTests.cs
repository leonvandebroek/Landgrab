using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class LobbyServiceTests
{
    private static LobbyService CreateLobbyService(ServiceTestContext context)
        => new(context.RoomProvider.Object, context.GameStateService);

    // ─── SetPlayerRole ──────────────────────────────────────────────────

    [Fact]
    public void SetPlayerRole_ValidCommanderRole_UpdatesPlayerRole()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole(ServiceTestContext.RoomCode, "p1", "Commander");

        error.Should().BeNull();
        result.Should().NotBeNull();
        context.Player("p1").Role.Should().Be(PlayerRole.Commander);
    }

    [Fact]
    public void SetPlayerRole_ValidScoutRole_UpdatesPlayerRole()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole(ServiceTestContext.RoomCode, "p1", "Scout");

        error.Should().BeNull();
        result.Should().NotBeNull();
        context.Player("p1").Role.Should().Be(PlayerRole.Scout);
    }

    [Fact]
    public void SetPlayerRole_ValidDefenderRole_UpdatesPlayerRole()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole(ServiceTestContext.RoomCode, "p1", "Defender");

        error.Should().BeNull();
        context.Player("p1").Role.Should().Be(PlayerRole.Defender);
    }

    [Fact]
    public void SetPlayerRole_InvalidRoleString_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole(ServiceTestContext.RoomCode, "p1", "BogusRole");

        result.Should().BeNull();
        error.Should().Be("Invalid role.");
    }

    [Fact]
    public void SetPlayerRole_RolesDisabled_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            // PlayerRolesEnabled defaults to false
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole(ServiceTestContext.RoomCode, "p1", "Commander");

        result.Should().BeNull();
        error.Should().Be("Player roles are not enabled for this game.");
    }

    [Fact]
    public void SetPlayerRole_NotInLobbyPhase_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole(ServiceTestContext.RoomCode, "p1", "Commander");

        result.Should().BeNull();
        error.Should().Be("Roles can only be set during lobby.");
    }

    [Fact]
    public void SetPlayerRole_PlayerNotInRoom_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole(ServiceTestContext.RoomCode, "unknown", "Commander");

        result.Should().BeNull();
        error.Should().Be("Player not in room.");
    }

    [Fact]
    public void SetPlayerRole_RoomNotFound_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .WithPlayerRolesEnabled()
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.SetPlayerRole("WRONG", "p1", "Commander");

        result.Should().BeNull();
        error.Should().Be("Room not found.");
    }

    // ─── AssignStartingTile ─────────────────────────────────────────────

    [Fact]
    public void AssignStartingTile_HostAssignsToPlayer_CellOwnedWithThreeTroops()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "p2");

        error.Should().BeNull();
        result.Should().NotBeNull();
        context.Cell(1, 0).OwnerId.Should().Be("p2");
        context.Cell(1, 0).OwnerName.Should().Be("Bob");
        context.Cell(1, 0).Troops.Should().Be(3);
    }

    [Fact]
    public void AssignStartingTile_HostAssignsToPlayer_AppendsEventLog()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "p2");

        context.State.EventLog.Should().ContainSingle(e => e.Type == "StartingTileAssigned");
        var log = context.State.EventLog.Single(e => e.Type == "StartingTileAssigned");
        log.TargetPlayerId.Should().Be("p2");
        log.TargetPlayerName.Should().Be("Bob");
        log.Q.Should().Be(1);
        log.R.Should().Be(0);
    }

    [Fact]
    public void AssignStartingTile_NonHost_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, "p2", 1, 0, "p2");

        result.Should().BeNull();
        error.Should().Be("Only the host can assign starting tiles.");
    }

    [Fact]
    public void AssignStartingTile_NotInLobby_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "p2");

        result.Should().BeNull();
        error.Should().Be("Starting tiles can only be assigned in the lobby.");
    }

    [Fact]
    public void AssignStartingTile_NoMasterTileSet_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .Build();
        // No master tile configured
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "p2");

        result.Should().BeNull();
        error.Should().Be("Set the master tile before assigning starting tiles.");
    }

    [Fact]
    public void AssignStartingTile_TargetPlayerNotInRoom_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "nobody");

        result.Should().BeNull();
        error.Should().Be("Target player is not in the room.");
    }

    [Fact]
    public void AssignStartingTile_CoordinatesOutsideGrid_ReturnsInvalidHex()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 99, 99, "p2");

        result.Should().BeNull();
        error.Should().Be("Invalid hex.");
    }

    [Fact]
    public void AssignStartingTile_HexAlreadyOwned_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .WithMasterTile(0, 0)
            .OwnHex(1, 0, hostId)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 1, 0, "p2");

        result.Should().BeNull();
        error.Should().Be("This hex is already assigned.");
    }

    [Fact]
    public void AssignStartingTile_MasterTileHex_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile(ServiceTestContext.RoomCode, hostId, 0, 0, "p2");

        result.Should().BeNull();
        error.Should().Be("The master tile cannot be assigned as a starting tile.");
    }

    [Fact]
    public void AssignStartingTile_RoomNotFound_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .WithMasterTile(0, 0)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.AssignStartingTile("WRONG", hostId, 1, 0, hostId);

        result.Should().BeNull();
        error.Should().Be("Room not found.");
    }

    // ─── StartGame ──────────────────────────────────────────────────────

    [Fact]
    public void StartGame_HostWithValidSetup_TransitionsToPlaying()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        error.Should().BeNull();
        result.Should().NotBeNull();
        context.State.Phase.Should().Be(GamePhase.Playing);
    }

    [Fact]
    public void StartGame_HostWithValidSetup_SetsGameStartedAt()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var before = DateTime.UtcNow;
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        sut.StartGame(ServiceTestContext.RoomCode, hostId);

        context.State.GameStartedAt.Should().NotBeNull();
        context.State.GameStartedAt!.Value.Should().BeOnOrAfter(before);
    }

    [Fact]
    public void StartGame_HostWithValidSetup_AutoAssignsMasterTile()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();
        // No master tile pre-set — AutoAssignTiles should pick one
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        error.Should().BeNull();
        context.State.MasterTileQ.Should().NotBeNull();
        context.State.MasterTileR.Should().NotBeNull();
        var masterKey = HexService.Key(context.State.MasterTileQ!.Value, context.State.MasterTileR!.Value);
        context.State.Grid[masterKey].IsMasterTile.Should().BeTrue();
    }

    [Fact]
    public void StartGame_HostWithValidSetup_AppendsGameStartedEventLog()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        sut.StartGame(ServiceTestContext.RoomCode, hostId);

        context.State.EventLog.Should().Contain(e => e.Type == "GameStarted");
    }

    [Fact]
    public void StartGame_WithPreAssignedAllianceTerritory_Succeeds()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithGameMode(GameMode.Alliances)
            .WithMasterTile(0, 0)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(1, 0, hostId, "a1")
            .OwnHex(-1, 0, "p2", "a2")
            .WithTroops(1, 0, 3)
            .WithTroops(-1, 0, 3)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        error.Should().BeNull();
        result.Should().NotBeNull();
        context.State.Phase.Should().Be(GamePhase.Playing);
    }

    [Fact]
    public void StartGame_AllianceTerritorySharedBetweenMembers_PlayerWithoutPersonalTerritorySucceeds()
    {
        // Both players share one alliance; only Alice owns a hex.
        // Bob has zero personal territory but the shared alliance territory satisfies the check.
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithGameMode(GameMode.Alliances)
            .WithMasterTile(0, 0)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId, "p2")
            .OwnHex(1, 0, hostId, "a1")
            .WithTroops(1, 0, 3)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        error.Should().BeNull();
        context.State.Phase.Should().Be(GamePhase.Playing);
    }

    [Fact]
    public void StartGame_NonHost_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, "p2");

        result.Should().BeNull();
        error.Should().Be("Only the host can start the game.");
        context.State.Phase.Should().Be(GamePhase.Lobby);
    }

    [Fact]
    public void StartGame_GameAlreadyStarted_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Playing)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        result.Should().BeNull();
        error.Should().Be("Game already started.");
    }

    [Fact]
    public void StartGame_MissingMapLocation_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = new GameStateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .WithWinCondition(WinConditionType.TerritoryPercent, 100)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();
        // MapLat / MapLng are null → HasMapLocation is false
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        result.Should().BeNull();
        error.Should().Be("Map location must be set before starting the game.");
    }

    [Fact]
    public void StartGame_LessThanTwoPlayers_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddAlliance("a1", "Alpha", hostId)
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        result.Should().BeNull();
        error.Should().Be("Need at least 2 players.");
    }

    [Fact]
    public void StartGame_PlayerMissingAlliance_ReturnsError()
    {
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            // p2 has no alliance
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        result.Should().BeNull();
        error.Should().Be("Every player must join an alliance before the game can start.");
    }

    [Fact]
    public void StartGame_NotEnoughGridTiles_ReturnsError()
    {
        // Radius 0 → 1 hex; 2 players need at least 3 (players + master tile)
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(0)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();
        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        result.Should().BeNull();
        error.Should().Be("The game area must have enough tiles for the master tile and every player.");
    }

    [Fact]
    public void StartGame_AllNonMasterHexesAreWater_ReturnsStartingTileError()
    {
        // Master tile is pre-set so AutoAssign won't fail on that check.
        // All remaining hexes are water so no starting tiles can be auto-assigned.
        var hostGuid = Guid.NewGuid();
        var hostId = hostGuid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(2)
            .WithMasterTile(0, 0)
            .AddPlayer(hostId, "Alice")
            .AddPlayer("p2", "Bob")
            .AddAlliance("a1", "Alpha", hostId)
            .AddAlliance("a2", "Beta", "p2")
            .Build();

        foreach (var cell in state.Grid.Values)
        {
            if (!cell.IsMasterTile)
                cell.TerrainType = TerrainType.Water;
        }

        var context = new ServiceTestContext(state, hostGuid);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame(ServiceTestContext.RoomCode, hostId);

        result.Should().BeNull();
        error.Should().Be("Every player needs at least one starting tile before the game can start.");
    }

    [Fact]
    public void StartGame_RoomNotFound_ReturnsError()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(3)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var sut = CreateLobbyService(context);

        var (result, error) = sut.StartGame("WRONG", "p1");

        result.Should().BeNull();
        error.Should().Be("Room not found.");
    }
}
