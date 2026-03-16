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

public sealed class MissionServiceTests
{
    [Fact]
    public async Task ProcessMissions_WhenNoMissionsExist_GeneratesMainTeamAndPersonalMissions()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .WithGameMode(GameMode.Alliances)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Red", "p1", "p2")
            .Build();
        state.Dynamics.MissionSystemEnabled = true;
        var context = new ServiceTestContext(state);
        var gameService = CreateGameService(context);
        var service = CreateMissionService();

        await InvokeProcessMissionsAsync(service, gameService, context.Room);

        context.State.Missions.Should().HaveCount(4);
        context.State.Missions.Should().ContainSingle(mission => mission.Scope == "Main"
            && mission.Title == "Hold the Hill"
            && mission.Objective == "HoldCenter");
        context.State.Missions.Should().ContainSingle(mission => mission.Scope == "Team"
            && mission.TargetTeamId == "a1"
            && new[] { "Divide and Conquer", "Encirclement", "Territory Rush" }.Contains(mission.Title));
        context.State.Missions.Should().Contain(mission => mission.Scope == "Personal"
            && mission.TargetPlayerId == "p1"
            && new[] { "Scout Patrol", "Frontline Fighter", "Fortifier" }.Contains(mission.Title));
        context.State.Missions.Should().Contain(mission => mission.Scope == "Personal"
            && mission.TargetPlayerId == "p2"
            && new[] { "Scout Patrol", "Frontline Fighter", "Fortifier" }.Contains(mission.Title));
        context.State.Missions.Should().OnlyContain(mission => mission.Status == "Active");
    }

    [Fact]
    public async Task ProcessMissions_WhenPersonalMissionCompletes_AwardsTroopsToAllOwnedHexes()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .OwnHex(0, 0, "p1", troops: 1)
            .OwnHex(1, 0, "p1", troops: 3)
            .Build();
        state.Dynamics.MissionSystemEnabled = true;
        state.Players.Single(player => player.Id == "p1").VisitedHexes.Add(HexService.Key(0, 0));
        state.Missions.Add(new Mission
        {
            Id = "mission-1",
            Type = "Recon",
            Title = "Scout Patrol",
            Scope = "Personal",
            TargetPlayerId = "p1",
            Objective = "VisitHexes:1",
            Reward = "+2 troops to all hexes",
            Status = "Active"
        });

        var context = new ServiceTestContext(state);
        var gameService = CreateGameService(context);
        var service = CreateMissionService();

        await InvokeProcessMissionsAsync(service, gameService, context.Room);

        var mission = context.State.Missions.Single(existingMission => existingMission.Id == "mission-1");
        mission.Status.Should().Be("Completed");
        mission.Progress.Should().Be(1.0);
        context.Cell(0, 0).Troops.Should().Be(3);
        context.Cell(1, 0).Troops.Should().Be(5);
    }

    [Fact]
    public async Task ProcessMissions_WhenMissionHasExpired_MarksItAsExpired()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice")
            .Build();
        state.Dynamics.MissionSystemEnabled = true;
        state.Missions.Add(new Mission
        {
            Id = "mission-2",
            Type = "Territorial",
            Title = "Hold the Hill",
            Scope = "Main",
            Objective = "HoldCenter",
            Reward = "+5 troops to random hex",
            Status = "Active",
            ExpiresAt = DateTime.UtcNow.AddMinutes(-1)
        });

        var context = new ServiceTestContext(state);
        var gameService = CreateGameService(context);
        var service = CreateMissionService();

        await InvokeProcessMissionsAsync(service, gameService, context.Room);

        var mission = context.State.Missions.Single(existingMission => existingMission.Id == "mission-2");
        mission.Status.Should().Be("Expired");
        mission.Progress.Should().Be(0);
    }

    private static MissionService CreateMissionService()
    {
        return new MissionService(
            Mock.Of<IServiceScopeFactory>(),
            CreateHubContext(),
            Mock.Of<ILogger<MissionService>>());
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

    private static async Task InvokeProcessMissionsAsync(MissionService service, GameService gameService, GameRoom room)
    {
        var method = typeof(MissionService).GetMethod("ProcessMissions", BindingFlags.Instance | BindingFlags.NonPublic);
        method.Should().NotBeNull();

        var task = method!.Invoke(service, [gameService, room, CancellationToken.None]);
        task.Should().BeAssignableTo<Task>();
        await ((Task)task!);
    }
}
