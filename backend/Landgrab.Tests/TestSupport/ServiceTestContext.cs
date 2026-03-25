using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Api.Services.Abilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace Landgrab.Tests.TestSupport;

internal sealed class ServiceTestContext
{
    public const string RoomCode = "TEST";
    public const double DefaultMapLat = 52.370216;
    public const double DefaultMapLng = 4.895168;
    public const int DefaultTileSizeMeters = 25;

    public Mock<IGameRoomProvider> RoomProvider { get; } = new();
    public Mock<ILogger<GameStateService>> GameStateLogger { get; } = new();
    public Mock<ILogger<RoomPersistenceService>> RoomPersistenceLogger { get; } = new();

    public Guid HostUserId { get; }
    public string HostUserIdString => HostUserId.ToString();
    public GameRoom Room { get; }
    public GameState State => Room.State;
    public GameStateService GameStateService { get; }
    public WinConditionService WinConditionService { get; } = new();
    public GameplayService GameplayService { get; }
    public AbilityServiceFacade AbilityService { get; }
    public HostControlService HostControlService { get; }
    public VisibilityService VisibilityService { get; } = new();

    public ServiceTestContext(GameState state, Guid? hostUserId = null)
    {
        HostUserId = hostUserId ?? Guid.NewGuid();
        Room = new GameRoom
        {
            Code = state.RoomCode,
            HostUserId = HostUserId,
            State = state
        };

        RoomProvider.Setup(provider => provider.GetRoom(state.RoomCode)).Returns(Room);
        RoomProvider.Setup(provider => provider.GetRoom(It.Is<string>(code => code != state.RoomCode)))
            .Returns((GameRoom?)null);

        var roomPersistenceService = new RoomPersistenceService(new DisabledPersistenceScopeFactory(), RoomPersistenceLogger.Object);
        GameStateService = new GameStateService(RoomProvider.Object, roomPersistenceService, GameStateLogger.Object);
        var roleProgressService = new RoleProgressService();
        GameplayService = new GameplayService(RoomProvider.Object, GameStateService, WinConditionService, roleProgressService, NullLogger<GameplayService>.Instance);
        var hubContextMock = new Mock<Microsoft.AspNetCore.SignalR.IHubContext<Landgrab.Api.Hubs.GameHub>>();
        AbilityService = new AbilityServiceFacade(
            new CommanderAbilityService(RoomProvider.Object, GameStateService),
            new ScoutAbilityService(RoomProvider.Object, GameStateService, VisibilityService),
            new EngineerAbilityService(RoomProvider.Object, GameStateService, roleProgressService),
            new SharedAbilityService(RoomProvider.Object, GameStateService, hubContextMock.Object));
        HostControlService = new HostControlService(RoomProvider.Object, GameStateService);
    }

    public PlayerDto Player(string playerId) => State.Players.Single(player => player.Id == playerId);

    public HexCell Cell(int q, int r) => State.Grid[HexService.Key(q, r)];

    public static GameStateBuilder CreateBuilder()
    {
        return new GameStateBuilder()
            .WithMap(DefaultMapLat, DefaultMapLng, DefaultTileSizeMeters)
            .WithWinCondition(WinConditionType.TerritoryPercent, 100);
    }

    public static (double lat, double lng) HexCenter(int q, int r)
    {
        return HexService.HexToLatLng(q, r, DefaultMapLat, DefaultMapLng, DefaultTileSizeMeters);
    }

    private sealed class DisabledPersistenceScopeFactory : IServiceScopeFactory
    {
        public IServiceScope CreateScope()
        {
            throw new InvalidOperationException("Persistence is intentionally disabled for tests.");
        }
    }
}
