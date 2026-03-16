using System.Reflection;
using FluentAssertions;
using Landgrab.Api.Hubs;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Moq;

namespace Landgrab.Tests.Services;

public sealed class RandomEventServiceTests
{
    [Fact]
    public async Task ApplyRandomEvent_WhenCalamityIsSelected_RemovesAllTroopsFromTheTargetHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithMasterTile(0, 0)
            .AddPlayer("p1", "Alice")
            .OwnHex(1, 0, "p1", troops: 5)
            .WithTroops(0, 0, 7)
            .Build();
        var context = new ServiceTestContext(state);
        var gameService = CreateGameService(context);
        var service = CreateRandomEventService();

        await WithForcedEventTypeAsync("Calamity", async () =>
        {
            await InvokeApplyRandomEventAsync(service, gameService, context.Room);
        });

        context.Cell(1, 0).Troops.Should().Be(0);
        context.Cell(0, 0).Troops.Should().Be(7);
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "RandomEvent"
            && entry.Message.Contains("Calamity!"));
    }

    [Fact]
    public async Task ApplyRandomEvent_WhenEpidemicIsSelected_ReducesTroopsOnTheLargestAllianceHex()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Red", "p1")
            .AddAlliance("a2", "Blue", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 5)
            .OwnHex(1, 0, "p1", "a1", troops: 0)
            .OwnHex(-1, 0, "p2", "a2", troops: 4)
            .Build();
        var context = new ServiceTestContext(state);
        context.WinConditionService.RefreshTerritoryCount(context.State);
        var gameService = CreateGameService(context);
        var service = CreateRandomEventService();

        await WithForcedEventTypeAsync("Epidemic", async () =>
        {
            await InvokeApplyRandomEventAsync(service, gameService, context.Room);
        });

        context.Cell(0, 0).Troops.Should().Be(3);
        context.Cell(-1, 0).Troops.Should().Be(4);
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "RandomEvent"
            && entry.Message.Contains("Epidemic!")
            && entry.AllianceId == "a1");
    }

    [Fact]
    public async Task ApplyRandomEvent_WhenBonusTroopsIsSelected_AddsTroopsToEachAlliance()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Red", "p1")
            .AddAlliance("a2", "Blue", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 1)
            .OwnHex(1, 0, "p2", "a2", troops: 2)
            .Build();
        var context = new ServiceTestContext(state);
        var gameService = CreateGameService(context);
        var service = CreateRandomEventService();

        await WithForcedEventTypeAsync("BonusTroops", async () =>
        {
            await InvokeApplyRandomEventAsync(service, gameService, context.Room);
        });

        context.Cell(0, 0).Troops.Should().Be(3);
        context.Cell(1, 0).Troops.Should().Be(4);
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "RandomEvent"
            && entry.Message.Contains("Bonus Troops!"));
    }

    [Fact]
    public async Task ApplyRandomEvent_WhenRushHourIsSelected_EnablesRushHour()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .Build();
        var context = new ServiceTestContext(state);
        var gameService = CreateGameService(context);
        var service = CreateRandomEventService();

        await WithForcedEventTypeAsync("RushHour", async () =>
        {
            await InvokeApplyRandomEventAsync(service, gameService, context.Room);
        });

        context.State.IsRushHour.Should().BeTrue();
        context.State.EventLog.Should().ContainSingle(entry => entry.Type == "RandomEvent"
            && entry.Message.Contains("Rush Hour!"));
    }

    private static RandomEventService CreateRandomEventService()
    {
        return new RandomEventService(
            Mock.Of<IServiceScopeFactory>(),
            CreateHubContext(),
            Mock.Of<ILogger<RandomEventService>>());
    }

    private static GameService CreateGameService(ServiceTestContext context)
    {
        return new GameService(
            roomService: null!,
            lobbyService: null!,
            allianceConfigService: null!,
            mapAreaService: null!,
            gameTemplateService: null!,
            gameConfigService: null!,
            gameplayService: null!,
            abilityService: null!,
            duelService: null!,
            hostControlService: null!,
            gameStateService: context.GameStateService,
            winConditionService: context.WinConditionService);
    }

    private static IHubContext<GameHub> CreateHubContext()
    {
        var proxy = new Mock<IClientProxy>();
        proxy.Setup(client => client.SendCoreAsync(
                It.IsAny<string>(),
                It.IsAny<object?[]>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var clients = new Mock<IHubClients>();
        clients.Setup(clientSet => clientSet.Group(It.IsAny<string>())).Returns(proxy.Object);

        var hubContext = new Mock<IHubContext<GameHub>>();
        hubContext.SetupGet(context => context.Clients).Returns(clients.Object);
        return hubContext.Object;
    }

    private static async Task InvokeApplyRandomEventAsync(RandomEventService service, GameService gameService, GameRoom room)
    {
        var method = typeof(RandomEventService).GetMethod("ApplyRandomEvent", BindingFlags.Instance | BindingFlags.NonPublic);
        method.Should().NotBeNull();

        var task = method!.Invoke(service, [gameService, room, CancellationToken.None]);
        task.Should().BeAssignableTo<Task>();
        await ((Task)task!);
    }

    private static async Task WithForcedEventTypeAsync(string eventType, Func<Task> action)
    {
        var field = typeof(RandomEventService).GetField("EventTypes", BindingFlags.Static | BindingFlags.NonPublic);
        field.Should().NotBeNull();

        var eventTypes = field!.GetValue(null).Should().BeAssignableTo<string[]>().Subject;
        var originalValues = eventTypes.ToArray();

        try
        {
            for (var index = 0; index < eventTypes.Length; index++)
                eventTypes[index] = eventType;

            await action();
        }
        finally
        {
            for (var index = 0; index < originalValues.Length; index++)
                eventTypes[index] = originalValues[index];
        }
    }
}
