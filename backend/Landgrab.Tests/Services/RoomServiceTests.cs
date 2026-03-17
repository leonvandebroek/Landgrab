using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;

namespace Landgrab.Tests.Services;

public sealed class RoomServiceTests
{
    [Fact]
    public void CreateRoom_GeneratesUniqueCodeAndAddsHostPlayer()
    {
        var roomService = CreateRoomService();
        var firstHostId = Guid.NewGuid().ToString();
        var secondHostId = Guid.NewGuid().ToString();

        var firstRoom = roomService.CreateRoom(firstHostId, "Alice", "conn-1");
        var secondRoom = roomService.CreateRoom(secondHostId, "Bob", "conn-2");

        firstRoom.Code.Should().MatchRegex("^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$");
        secondRoom.Code.Should().MatchRegex("^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$");
        firstRoom.Code.Should().NotBe(secondRoom.Code);

        firstRoom.HostUserId.Should().Be(Guid.Parse(firstHostId));
        firstRoom.State.Players.Should().ContainSingle();
        firstRoom.State.Players[0].Should().BeEquivalentTo(new
        {
            Id = firstHostId,
            Name = "Alice",
            Color = "#e74c3c",
            IsHost = true,
            IsConnected = true
        });
        firstRoom.ConnectionMap.Should().ContainKey("conn-1");
        firstRoom.ConnectionMap["conn-1"].Should().Be(firstHostId);
    }

    [Fact]
    public void CreateRoom_InitializesExpectedRoomState()
    {
        var roomService = CreateRoomService();
        var hostId = Guid.NewGuid().ToString();

        var room = roomService.CreateRoom(hostId, "Host", "host-conn");

        room.State.RoomCode.Should().Be(room.Code);
        room.State.Phase.Should().Be(GamePhase.Lobby);
        room.State.GridRadius.Should().Be(GameStateCommon.DefaultGridRadius);
        room.State.GameAreaMode.Should().Be(GameAreaMode.Centered);
        room.State.TileSizeMeters.Should().Be(GameStateCommon.DefaultTileSizeMeters);
        room.State.Grid.Should().NotBeEmpty();
        room.State.Grid.Should().ContainKey(HexService.Key(0, 0));
        room.CreatedAt.Should().BeCloseTo(DateTime.UtcNow, TimeSpan.FromSeconds(2));
    }

    [Fact]
    public void JoinRoom_NewPlayerInLobby_AddsPlayerAndJoinEvent()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");

        var (joinedRoom, error) = roomService.JoinRoom(room.Code.ToLowerInvariant(), "player-2", "Bob", "conn-2");

        error.Should().BeNull();
        joinedRoom.Should().BeSameAs(room);
        room.State.Players.Should().HaveCount(2);
        room.State.Players.Single(player => player.Id == "player-2").Should().BeEquivalentTo(new
        {
            Id = "player-2",
            Name = "Bob",
            Color = "#3498db",
            IsHost = false,
            IsConnected = true
        });
        room.ConnectionMap.Should().ContainKey("conn-2");
        room.ConnectionMap["conn-2"].Should().Be("player-2");
        room.State.EventLog.Should().ContainSingle();
        room.State.EventLog.Single().Should().BeEquivalentTo(new
        {
            Type = "PlayerJoined",
            Message = "Bob joined the room.",
            PlayerId = "player-2",
            PlayerName = "Bob"
        });
    }

    [Fact]
    public void JoinRoom_UnknownCode_ReturnsNotFoundError()
    {
        var roomService = CreateRoomService();

        var (room, error) = roomService.JoinRoom("missing", "player-2", "Bob", "conn-2");

        room.Should().BeNull();
        error.Should().Be("Room not found.");
    }

    [Fact]
    public void JoinRoom_WhenGameIsNotInLobby_ReturnsInProgressError()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");
        room.State.Phase = GamePhase.Playing;

        var (joinedRoom, error) = roomService.JoinRoom(room.Code, "player-2", "Bob", "conn-2");

        joinedRoom.Should().BeNull();
        error.Should().Be("Game already in progress.");
    }

    [Fact]
    public void JoinRoom_WhenRoomIsFull_ReturnsFullError()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");

        for (var index = 0; index < 29; index++)
        {
            room.State.Players.Add(new PlayerDto
            {
                Id = $"player-{index}",
                Name = $"Player {index}",
                Color = $"#{index:X6}"
            });
        }

        var (joinedRoom, error) = roomService.JoinRoom(room.Code, "player-31", "Player 31", "conn-31");

        joinedRoom.Should().BeNull();
        error.Should().Be("Room is full (max 30 players).");
        room.State.Players.Should().HaveCount(30);
    }

    [Fact]
    public void JoinRoom_ExistingPlayer_ReconnectsWithoutDuplicatePlayerAndClearsStaleConnections()
    {
        var roomService = CreateRoomService();
        var room = CreateRestorableRoom(
            "ABC123",
            players:
            [
                CreatePlayer("host", "Host", isHost: true),
                CreatePlayer("player-2", "Bob", isConnected: false)
            ]);
        room.ConnectionMap.TryAdd("stale-1", "player-2");
        room.ConnectionMap.TryAdd("stale-2", "player-2");
        roomService.RestoreRooms([room]).Should().Be(1);
        room.State.EventLog.Add(new GameEventLogEntry { Type = "Existing", Message = "Already here." });
        room.ConnectionMap.TryAdd("host-conn", "host");
        room.ConnectionMap.TryAdd("stale-1", "player-2");
        room.ConnectionMap.TryAdd("stale-2", "player-2");

        var (joinedRoom, error) = roomService.JoinRoom("abc123", "player-2", "Bob", "fresh-conn");

        error.Should().BeNull();
        joinedRoom.Should().BeSameAs(room);
        room.State.Players.Should().HaveCount(2);
        room.State.Players.Count(player => player.Id == "player-2").Should().Be(1);
        room.State.Players.Single(player => player.Id == "player-2").IsConnected.Should().BeTrue();
        room.ConnectionMap.Should().ContainKey("fresh-conn");
        room.ConnectionMap["fresh-conn"].Should().Be("player-2");
        room.ConnectionMap.Should().ContainKey("host-conn");
        room.ConnectionMap.Should().NotContainKey("stale-1");
        room.ConnectionMap.Should().NotContainKey("stale-2");
        room.State.EventLog.Should().ContainSingle();
        room.State.EventLog.Single().Type.Should().Be("Existing");
    }

    [Fact]
    public void GetRoom_ReturnsExistingRoomCaseInsensitively()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");

        roomService.GetRoom(room.Code.ToLowerInvariant()).Should().BeSameAs(room);
        roomService.GetRoom(room.Code.ToUpperInvariant()).Should().BeSameAs(room);
    }

    [Fact]
    public void GetRoom_ReturnsNullForUnknownCode()
    {
        var roomService = CreateRoomService();

        roomService.GetRoom("missing").Should().BeNull();
    }

    [Fact]
    public void GetRoomByConnection_ReturnsMatchingRoom()
    {
        var roomService = CreateRoomService();
        var firstRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host 1", "host-conn-1");
        var secondRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host 2", "host-conn-2");
        roomService.JoinRoom(firstRoom.Code, "player-1", "Alice", "conn-a");
        roomService.JoinRoom(secondRoom.Code, "player-2", "Bob", "conn-b");

        roomService.GetRoomByConnection("conn-a").Should().BeSameAs(firstRoom);
        roomService.GetRoomByConnection("conn-b").Should().BeSameAs(secondRoom);
    }

    [Fact]
    public void GetRoomByConnection_ReturnsNullForUnknownConnection()
    {
        var roomService = CreateRoomService();
        roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");

        roomService.GetRoomByConnection("missing").Should().BeNull();
    }

    [Fact]
    public void GetRoomByUserId_WithSpecificRoomCode_ReturnsMatchingActiveRoom()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");
        roomService.JoinRoom(room.Code, "player-1", "Alice", "conn-1");

        roomService.GetRoomByUserId("player-1", room.Code.ToLowerInvariant()).Should().BeSameAs(room);
        roomService.GetRoomByUserId("missing", room.Code).Should().BeNull();
        roomService.GetRoomByUserId("player-1", "MISSING").Should().BeNull();
    }

    [Fact]
    public void GetRoomByUserId_FiltersGameOverRoomsWhenSearchingAnyRoom()
    {
        var roomService = CreateRoomService();
        var finishedRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Finished Host", "host-conn-1");
        var activeRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Active Host", "host-conn-2");
        roomService.JoinRoom(finishedRoom.Code, "player-1", "Alice", "conn-1");
        roomService.JoinRoom(activeRoom.Code, "player-1", "Alice", "conn-2");
        finishedRoom.State.Phase = GamePhase.GameOver;

        roomService.GetRoomByUserId("player-1", finishedRoom.Code).Should().BeNull();
        roomService.GetRoomByUserId("player-1").Should().BeSameAs(activeRoom);
        roomService.GetRoomByUserId("missing").Should().BeNull();
    }

    [Fact]
    public void RemoveConnection_UnknownConnection_DoesNothing()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");
        var host = room.State.Players.Single();
        host.CurrentLat = 10;
        host.CurrentLng = 20;

        roomService.RemoveConnection(room, "missing");

        room.ConnectionMap.Should().ContainKey("host-conn");
        host.IsConnected.Should().BeTrue();
        host.CurrentLat.Should().Be(10);
        host.CurrentLng.Should().Be(20);
        room.State.EventLog.Should().BeEmpty();
    }

    [Fact]
    public void RemoveConnection_WhenOtherConnectionsRemain_KeepsPlayerConnected()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");
        roomService.JoinRoom(room.Code, "player-1", "Alice", "conn-1");
        room.ConnectionMap.TryAdd("conn-2", "player-1");
        var player = room.State.Players.Single(existingPlayer => existingPlayer.Id == "player-1");
        player.CurrentLat = 10;
        player.CurrentLng = 20;
        player.CarriedTroops = 3;
        player.CarriedTroopsSourceQ = 0;
        player.CarriedTroopsSourceR = 0;
        room.State.Grid[HexService.Key(0, 0)].OwnerId = "player-1";
        room.State.Grid[HexService.Key(0, 0)].Troops = 5;
        var eventCount = room.State.EventLog.Count;

        roomService.RemoveConnection(room, "conn-1");

        room.ConnectionMap.Should().NotContainKey("conn-1");
        room.ConnectionMap.Should().ContainKey("conn-2");
        player.IsConnected.Should().BeTrue();
        player.CurrentLat.Should().Be(10);
        player.CurrentLng.Should().Be(20);
        player.CarriedTroops.Should().Be(3);
        room.State.Grid[HexService.Key(0, 0)].Troops.Should().Be(5);
        room.State.EventLog.Should().HaveCount(eventCount);
    }

    [Fact]
    public void RemoveConnection_LastConnection_MarksDisconnectedClearsLocationPreservesCarriedTroopsAndLogsLeft()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");
        roomService.JoinRoom(room.Code, "player-1", "Alice", "conn-1");
        var player = room.State.Players.Single(existingPlayer => existingPlayer.Id == "player-1");
        player.CurrentLat = 10;
        player.CurrentLng = 20;
        player.CarriedTroops = 3;
        player.CarriedTroopsSourceQ = 0;
        player.CarriedTroopsSourceR = 0;
        var sourceCell = room.State.Grid[HexService.Key(0, 0)];
        sourceCell.OwnerId = "player-1";
        sourceCell.Troops = 5;
        var joinEventCount = room.State.EventLog.Count;

        roomService.RemoveConnection(room, "conn-1");

        player.IsConnected.Should().BeFalse();
        player.CurrentLat.Should().BeNull();
        player.CurrentLng.Should().BeNull();
    player.CarriedTroops.Should().Be(3);
    player.CarriedTroopsSourceQ.Should().Be(0);
    player.CarriedTroopsSourceR.Should().Be(0);
    sourceCell.Troops.Should().Be(5);
        room.ConnectionMap.Should().NotContainKey("conn-1");
        room.State.EventLog.Should().HaveCount(joinEventCount + 1);
        room.State.EventLog.Last().Should().BeEquivalentTo(new
        {
            Type = "PlayerLeft",
            Message = "Alice left the room.",
            PlayerId = "player-1",
            PlayerName = "Alice"
        });
    }

    [Fact]
    public void RemoveConnection_LastConnectionWithReturnedToLobby_PreservesCarriedTroopsAndLogsReturnedToLobby()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");
        roomService.JoinRoom(room.Code, "player-1", "Alice", "conn-1");
        var player = room.State.Players.Single(existingPlayer => existingPlayer.Id == "player-1");
        player.CarriedTroops = 4;
        player.CarriedTroopsSourceQ = 99;
        player.CarriedTroopsSourceR = 99;
        var fallbackCell = room.State.Grid[HexService.Key(1, 0)];
        fallbackCell.OwnerId = "player-1";
        fallbackCell.Troops = 2;
        var joinEventCount = room.State.EventLog.Count;

        roomService.RemoveConnection(room, "conn-1", returnedToLobby: true);

        player.IsConnected.Should().BeFalse();
    player.CarriedTroops.Should().Be(4);
    player.CarriedTroopsSourceQ.Should().Be(99);
    player.CarriedTroopsSourceR.Should().Be(99);
    fallbackCell.Troops.Should().Be(2);
        room.State.EventLog.Should().HaveCount(joinEventCount + 1);
        room.State.EventLog.Last().Should().BeEquivalentTo(new
        {
            Type = "PlayerReturnedToLobby",
            Message = "Alice returned to the lobby.",
            PlayerId = "player-1",
            PlayerName = "Alice"
        });
    }

    [Fact]
    public void GetRoomsForUser_ReturnsEmptyWhenUserHasNoActiveRooms()
    {
        var roomService = CreateRoomService();
        var room = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host", "host-conn");
        room.State.Phase = GamePhase.GameOver;

        roomService.GetRoomsForUser("missing").Should().BeEmpty();
        roomService.GetRoomsForUser(room.State.Players[0].Id).Should().BeEmpty();
    }

    [Fact]
    public void GetRoomsForUser_ReturnsSummariesSortedByConnectionThenCreatedAt()
    {
        var roomService = CreateRoomService();

        var connectedOlder = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host A", "host-a");
        connectedOlder.CreatedAt = new DateTime(2024, 01, 01, 12, 00, 00, DateTimeKind.Utc);
        roomService.JoinRoom(connectedOlder.Code, "user-1", "Alice", "conn-a");

        var disconnectedNewest = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host B", "host-b");
        disconnectedNewest.CreatedAt = new DateTime(2024, 03, 01, 12, 00, 00, DateTimeKind.Utc);
        roomService.JoinRoom(disconnectedNewest.Code, "user-1", "Alice", "conn-b");
        disconnectedNewest.State.Players.Single(player => player.Id == "user-1").IsConnected = false;

        var connectedNewest = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host C", "host-c");
        connectedNewest.CreatedAt = new DateTime(2024, 04, 01, 12, 00, 00, DateTimeKind.Utc);
        roomService.JoinRoom(connectedNewest.Code, "user-1", "Alice", "conn-c");

        var disconnectedNoHost = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host D", "host-d");
        disconnectedNoHost.CreatedAt = new DateTime(2024, 02, 01, 12, 00, 00, DateTimeKind.Utc);
        roomService.JoinRoom(disconnectedNoHost.Code, "user-1", "Alice", "conn-d");
        disconnectedNoHost.State.Players.Single(player => player.Id == disconnectedNoHost.State.Players[0].Id).IsHost = false;
        disconnectedNoHost.State.Players.Single(player => player.Id == "user-1").IsConnected = false;

        var gameOverRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Host E", "host-e");
        gameOverRoom.CreatedAt = new DateTime(2024, 05, 01, 12, 00, 00, DateTimeKind.Utc);
        roomService.JoinRoom(gameOverRoom.Code, "user-1", "Alice", "conn-e");
        gameOverRoom.State.Phase = GamePhase.GameOver;

        var result = roomService.GetRoomsForUser("user-1");

        result.Select(summary => summary.Code)
            .Should().Equal(connectedNewest.Code, connectedOlder.Code, disconnectedNewest.Code, disconnectedNoHost.Code);

        result[0].Should().BeEquivalentTo(new
        {
            Code = connectedNewest.Code,
            Phase = GamePhase.Lobby,
            PlayerCount = 2,
            IsConnected = true,
            HostName = "Host C",
            CreatedAt = connectedNewest.CreatedAt
        });

        result[1].Should().BeEquivalentTo(new
        {
            Code = connectedOlder.Code,
            Phase = GamePhase.Lobby,
            PlayerCount = 2,
            IsConnected = true,
            HostName = "Host A",
            CreatedAt = connectedOlder.CreatedAt
        });

        result[2].Should().BeEquivalentTo(new
        {
            Code = disconnectedNewest.Code,
            Phase = GamePhase.Lobby,
            PlayerCount = 2,
            IsConnected = false,
            HostName = "Host B",
            CreatedAt = disconnectedNewest.CreatedAt
        });

        result[3].Should().BeEquivalentTo(new
        {
            Code = disconnectedNoHost.Code,
            Phase = GamePhase.Lobby,
            PlayerCount = 2,
            IsConnected = false,
            HostName = "",
            CreatedAt = disconnectedNoHost.CreatedAt
        });
    }

    [Fact]
    public void GetPlayingRoomCodes_ReturnsOnlyPlayingRooms()
    {
        var roomService = CreateRoomService();
        var lobbyRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Lobby Host", "lobby-conn");
        var firstPlayingRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Playing Host 1", "playing-conn-1");
        var secondPlayingRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "Playing Host 2", "playing-conn-2");
        var gameOverRoom = roomService.CreateRoom(Guid.NewGuid().ToString(), "GameOver Host", "gameover-conn");

        firstPlayingRoom.State.Phase = GamePhase.Playing;
        secondPlayingRoom.State.Phase = GamePhase.Playing;
        gameOverRoom.State.Phase = GamePhase.GameOver;

        roomService.GetPlayingRoomCodes()
            .Should().BeEquivalentTo([firstPlayingRoom.Code, secondPlayingRoom.Code]);
        roomService.GetPlayingRoomCodes().Should().NotContain(lobbyRoom.Code);
        roomService.GetPlayingRoomCodes().Should().NotContain(gameOverRoom.Code);
    }

    [Fact]
    public void RestoreRooms_NullInput_ThrowsArgumentNullException()
    {
        var roomService = CreateRoomService();
        Action act = () => roomService.RestoreRooms(null!);

        act.Should().Throw<ArgumentNullException>().WithParameterName("rooms");
    }

    [Fact]
    public void RestoreRooms_RestoresRoomsNormalizesCodesAndDisconnectsPlayers()
    {
        var roomService = CreateRoomService();
        var firstRoom = CreateRestorableRoom(
            "abc123",
            createdAt: new DateTime(2024, 01, 01, 12, 00, 00, DateTimeKind.Utc),
            phase: GamePhase.Playing,
            players:
            [
                CreatePlayer("host-a", "Host A", isHost: true),
                CreatePlayer("user-1", "Alice")
            ]);
        firstRoom.ConnectionMap.TryAdd("conn-a", "host-a");
        firstRoom.ConnectionMap.TryAdd("conn-b", "user-1");

        var secondRoom = CreateRestorableRoom(
            "def456",
            createdAt: new DateTime(2024, 01, 02, 12, 00, 00, DateTimeKind.Utc),
            players:
            [
                CreatePlayer("host-b", "Host B", isHost: true),
                CreatePlayer("user-2", "Bob")
            ]);
        secondRoom.ConnectionMap.TryAdd("conn-c", "host-b");

        var restoredCount = roomService.RestoreRooms([firstRoom, secondRoom]);

        restoredCount.Should().Be(2);

        firstRoom.Code.Should().Be("ABC123");
        firstRoom.State.RoomCode.Should().Be("ABC123");
        firstRoom.ConnectionMap.Should().BeEmpty();
        firstRoom.State.Players.Should().OnlyContain(player => !player.IsConnected);
        roomService.GetRoom("abc123").Should().BeSameAs(firstRoom);
        roomService.GetRoomByConnection("conn-a").Should().BeNull();

        secondRoom.Code.Should().Be("DEF456");
        secondRoom.State.RoomCode.Should().Be("DEF456");
        secondRoom.ConnectionMap.Should().BeEmpty();
        secondRoom.State.Players.Should().OnlyContain(player => !player.IsConnected);
        roomService.GetRoom("DEF456").Should().BeSameAs(secondRoom);
    }

    [Fact]
    public void RestoreRooms_SkipsBlankAndDuplicateCodesAndReturnsSuccessfulCount()
    {
        var roomService = CreateRoomService();
        var validRoom = CreateRestorableRoom("abc123", players: [CreatePlayer("host-a", "Host A", isHost: true)]);
        var blankCodeRoom = CreateRestorableRoom("   ", players: [CreatePlayer("host-b", "Host B", isHost: true)]);
        var duplicateCodeRoom = CreateRestorableRoom("ABC123", players: [CreatePlayer("host-c", "Host C", isHost: true)]);

        var restoredCount = roomService.RestoreRooms([validRoom, blankCodeRoom, duplicateCodeRoom]);

        restoredCount.Should().Be(1);
        roomService.GetRoom("ABC123").Should().BeSameAs(validRoom);
        roomService.GetRoom("   ").Should().BeNull();
        duplicateCodeRoom.ConnectionMap.Should().BeEmpty();
    }

    private static RoomService CreateRoomService()
    {
        var roomPersistenceService = new RoomPersistenceService(
            new DisabledPersistenceScopeFactory(),
            Mock.Of<ILogger<RoomPersistenceService>>());

        return new RoomService(roomPersistenceService, Mock.Of<ILogger<RoomService>>());
    }

    private static GameRoom CreateRestorableRoom(
        string code,
        DateTime? createdAt = null,
        GamePhase phase = GamePhase.Lobby,
        params PlayerDto[] players)
    {
        return new GameRoom
        {
            Code = code,
            HostUserId = Guid.NewGuid(),
            CreatedAt = createdAt ?? new DateTime(2024, 01, 01, 0, 0, 0, DateTimeKind.Utc),
            State = new GameState
            {
                RoomCode = code,
                Phase = phase,
                GridRadius = 1,
                GameAreaMode = GameAreaMode.Centered,
                TileSizeMeters = 25,
                Grid = HexService.BuildGrid(1),
                Players = [.. players]
            }
        };
    }

    private static PlayerDto CreatePlayer(string id, string name, bool isHost = false, bool isConnected = true)
    {
        return new PlayerDto
        {
            Id = id,
            Name = name,
            Color = $"#{id}",
            IsHost = isHost,
            IsConnected = isConnected
        };
    }

    private sealed class DisabledPersistenceScopeFactory : IServiceScopeFactory
    {
        public IServiceScope CreateScope()
        {
            throw new InvalidOperationException("Persistence is intentionally disabled for tests.");
        }
    }
}
