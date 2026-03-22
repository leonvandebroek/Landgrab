using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Landgrab.Tests.TestSupport;

/// <summary>
/// Factory for creating real service instances backed by in-memory GameRooms.
/// QueuePersistence is effectively a no-op in tests: the fire-and-forget Task.Run
/// will fail silently since the RoomPersistenceService has no real database connection.
/// </summary>
internal sealed class TestServiceFactory
{
    private readonly Dictionary<string, GameRoom> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly Mock<IGameRoomProvider> _roomProviderMock = new();

    public TestServiceFactory()
    {
        _roomProviderMock
            .Setup(rp => rp.GetRoom(It.IsAny<string>()))
            .Returns<string>(code => _rooms.GetValueOrDefault(code));
    }

    public IGameRoomProvider RoomProvider => _roomProviderMock.Object;

    /// <summary>
    /// Registers a GameRoom with pre-built GameState.
    /// Returns the room so tests can inspect ConnectionMap, etc.
    /// </summary>
    public GameRoom RegisterRoom(GameState state, Guid? hostUserId = null)
    {
        var room = new GameRoom
        {
            Code = state.RoomCode,
            HostUserId = hostUserId ?? Guid.NewGuid(),
            State = state
        };
        _rooms[room.Code] = room;
        return room;
    }

    /// <summary>
    /// Creates a real GameStateService. QueuePersistence runs fire-and-forget;
    /// the persistence call will fail silently since there's no real DB.
    /// </summary>
    public GameStateService CreateGameStateService()
    {
        var scopeFactoryMock = new Mock<Microsoft.Extensions.DependencyInjection.IServiceScopeFactory>();
        var persistenceLogger = NullLogger<RoomPersistenceService>.Instance;
        var persistence = new RoomPersistenceService(scopeFactoryMock.Object, persistenceLogger);
        var gsLogger = NullLogger<GameStateService>.Instance;
        return new GameStateService(RoomProvider, persistence, gsLogger);
    }

    public WinConditionService CreateWinConditionService() => new();

    public AbilityService CreateAbilityService()
        => new(RoomProvider, CreateGameStateService(), new VisibilityService());

    public GameplayService CreateGameplayService()
    {
        var gameStateService = CreateGameStateService();
        var winConditionService = CreateWinConditionService();
        return new GameplayService(RoomProvider, gameStateService, winConditionService);
    }
}
