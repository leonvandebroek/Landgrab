using FluentAssertions;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;
using Microsoft.Extensions.Logging.Abstractions;

namespace Landgrab.Tests.Services;

public sealed class VirtualPlayerServiceTests
{
    private static (ServiceTestContext context, VirtualPlayerService sut, string hostId) CreateLobby(Guid? hostGuid = null)
    {
        var guid = hostGuid ?? Guid.NewGuid();
        var hostId = guid.ToString();
        var state = ServiceTestContext.CreateBuilder()
            .WithPhase(GamePhase.Lobby)
            .WithGrid(6)
            .WithMapLocation(ServiceTestContext.DefaultMapLat, ServiceTestContext.DefaultMapLng)
            .AddAlliance("a1", "Alpha")
            .AddAlliance("a2", "Beta")
            .AddPlayer(hostId, "Host", "a1")
            .WithPlayerAsHost(hostId)
            .Build();
        state.Alliances.Single(a => a.Id == "a1").MemberIds.Add(hostId);

        var context = new ServiceTestContext(state, guid);
        var sut = new VirtualPlayerService(
            context.RoomProvider.Object,
            context.GameStateService,
            context.GameplayService,
            NullLogger<VirtualPlayerService>.Instance);
        return (context, sut, hostId);
    }

    [Fact]
    public void SetVirtualPlayerCount_AddsBotsAndBalancesAlliances()
    {
        var (context, sut, hostId) = CreateLobby();

        var (state, error) = sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, hostId, 3);

        error.Should().BeNull();
        var bots = state!.Players.Where(p => p.IsVirtual).ToList();
        bots.Should().HaveCount(3);
        bots.Should().OnlyContain(b => b.IsConnected && !b.IsHost && b.AllianceId != null);
        bots.Select(b => b.Name).Should().OnlyHaveUniqueItems();
        state.Players.Count(p => p.AllianceId == "a1").Should().Be(2);
        state.Players.Count(p => p.AllianceId == "a2").Should().Be(2);
        context.State.Alliances.Single(a => a.Id == "a2").MemberIds.Should().HaveCount(2);
    }

    [Fact]
    public void SetVirtualPlayerCount_LowerCount_RemovesBots()
    {
        var (context, sut, hostId) = CreateLobby();
        sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, hostId, 4);

        var (state, error) = sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, hostId, 1);

        error.Should().BeNull();
        state!.Players.Count(p => p.IsVirtual).Should().Be(1);
        state.Players.Should().Contain(p => p.Id == hostId);
        context.State.Alliances.SelectMany(a => a.MemberIds).Should().HaveCount(2);
    }

    [Fact]
    public void SetVirtualPlayerCount_RejectsNonHostAndOutsideLobby()
    {
        var (context, sut, _) = CreateLobby();

        sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, "someone-else", 2).error.Should().NotBeNull();

        context.State.Phase = GamePhase.Playing;
        sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, context.HostUserIdString, 2).error.Should().NotBeNull();
        sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, context.HostUserIdString, VirtualPlayerService.MaxVirtualPlayers + 1)
            .error.Should().NotBeNull();
    }

    [Fact]
    public void Bots_MoveAndPlay_AfterGameStarts()
    {
        var (context, sut, hostId) = CreateLobby();
        sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, hostId, 3);

        var lobby = new LobbyService(context.RoomProvider.Object, context.GameStateService);
        var (started, startError) = lobby.StartGame(ServiceTestContext.RoomCode, hostId);
        startError.Should().BeNull();
        started!.Phase.Should().Be(GamePhase.Playing);

        var botIds = context.State.Players.Where(p => p.IsVirtual).Select(p => p.Id).ToHashSet();
        var startPositions = context.State.Players
            .Where(p => p.IsVirtual)
            .ToDictionary(p => p.Id, p => (p.CurrentLat, p.CurrentLng));
        var startTerritory = context.State.Grid.Values.Count(c => c.OwnerId != null && botIds.Contains(c.OwnerId));

        var now = DateTime.UtcNow;
        var moved = false;
        for (var i = 0; i < 300 && context.State.Phase == GamePhase.Playing; i++)
        {
            now = now.AddSeconds(2);
            var result = sut.Tick(ServiceTestContext.RoomCode, TimeSpan.FromSeconds(2), now);
            result.HasVirtualPlayers.Should().BeTrue();
            moved |= result.AnyMoved;
        }

        moved.Should().BeTrue();
        context.State.Players.Where(p => p.IsVirtual)
            .Count(p => p.CurrentLat != startPositions[p.Id].CurrentLat || p.CurrentLng != startPositions[p.Id].CurrentLng)
            .Should().BeGreaterThan(0, "bots should walk around");
        var endTerritory = context.State.Grid.Values.Count(c => c.OwnerId != null && botIds.Contains(c.OwnerId));
        endTerritory.Should().BeGreaterThan(startTerritory, "bots should claim hexes");
        context.State.Players.Should().OnlyContain(p => !p.IsVirtual || p.CurrentHexQ.HasValue);
    }

    [Fact]
    public void Tick_DoesNothingWhenPaused()
    {
        var (context, sut, hostId) = CreateLobby();
        sut.SetVirtualPlayerCount(ServiceTestContext.RoomCode, hostId, 2);
        new LobbyService(context.RoomProvider.Object, context.GameStateService).StartGame(ServiceTestContext.RoomCode, hostId);
        context.State.IsPaused = true;

        var result = sut.Tick(ServiceTestContext.RoomCode, TimeSpan.FromSeconds(2), DateTime.UtcNow.AddMinutes(1));

        result.AnyMoved.Should().BeFalse();
    }
}
