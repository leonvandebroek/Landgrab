using FluentAssertions;
using Landgrab.Api.Services;
using Landgrab.Tests.TestSupport;

namespace Landgrab.Tests.Services;

public sealed class DerivedMapStateServiceTests
{
    [Fact]
    public void ComputeContestedEdges_WhenAdjacentEnemyHexesExist_ReturnsSingleEdgeWithIntensity()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 4)
            .OwnHex(1, 0, "p2", "a2", troops: 2)
            .Build();
        var service = new DerivedMapStateService();

        var edges = service.ComputeContestedEdges(state.Grid);

        edges.Should().ContainSingle();
        edges[0].HexKeyA.Should().BeOneOf(HexService.Key(0, 0), HexService.Key(1, 0));
        edges[0].HexKeyB.Should().BeOneOf(HexService.Key(0, 0), HexService.Key(1, 0));
        edges[0].HexKeyA.Should().NotBe(edges[0].HexKeyB);
        edges[0].Intensity.Should().Be(0.5d);
    }

    [Fact]
    public void ComputeContestedEdges_WhenAdjacentHexesShareAlliance_ReturnsNoEdges()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a1")
            .AddAlliance("a1", "Alpha", "p1", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 4)
            .OwnHex(1, 0, "p2", "a1", troops: 2)
            .Build();
        var service = new DerivedMapStateService();

        var edges = service.ComputeContestedEdges(state.Grid);

        edges.Should().BeEmpty();
    }

    [Fact]
    public void ComputeAndAttach_WhenGridContainsContestedBorder_AttachesDerivedEdgesToState()
    {
        var state = ServiceTestContext.CreateBuilder()
            .WithGrid(2)
            .AddPlayer("p1", "Alice", "a1")
            .AddPlayer("p2", "Bob", "a2")
            .AddAlliance("a1", "Alpha", "p1")
            .AddAlliance("a2", "Beta", "p2")
            .OwnHex(0, 0, "p1", "a1", troops: 3)
            .OwnHex(1, 0, "p2", "a2", troops: 3)
            .Build();
        var service = new DerivedMapStateService();

        service.ComputeAndAttach(state);

        state.ContestedEdges.Should().NotBeNull();
        state.ContestedEdges.Should().ContainSingle();
    }
}
