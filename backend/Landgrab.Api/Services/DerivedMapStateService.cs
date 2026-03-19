using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class DerivedMapStateService
{
    public void ComputeAndAttach(GameState state)
    {
        state.ContestedEdges = ComputeContestedEdges(state.Grid);
    }

    public List<ContestedEdgeDto> ComputeContestedEdges(Dictionary<string, HexCell> grid)
    {
        var edges = new List<ContestedEdgeDto>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var (key, cell) in grid)
        {
            if (string.IsNullOrEmpty(cell.OwnerId))
            {
                continue;
            }

            var neighborIndex = 0;
            foreach (var (nq, nr) in HexService.Neighbors(cell.Q, cell.R))
            {
                var neighborKey = HexService.Key(nq, nr);
                if (!grid.TryGetValue(neighborKey, out var neighbor)
                    || string.IsNullOrEmpty(neighbor.OwnerId)
                    || neighbor.OwnerId == cell.OwnerId)
                {
                    neighborIndex++;
                    continue;
                }

                var sameAlliance = !string.IsNullOrEmpty(cell.OwnerAllianceId)
                    && cell.OwnerAllianceId == neighbor.OwnerAllianceId;
                if (sameAlliance)
                {
                    neighborIndex++;
                    continue;
                }

                var edgeKey = string.Compare(key, neighborKey, StringComparison.Ordinal) < 0
                    ? $"{key}|{neighborKey}"
                    : $"{neighborKey}|{key}";

                if (seen.Add(edgeKey))
                {
                    var maxTroops = Math.Max(Math.Max(cell.Troops, neighbor.Troops), 1);
                    var minTroops = Math.Min(cell.Troops, neighbor.Troops);

                    edges.Add(new ContestedEdgeDto
                    {
                        HexKeyA = key,
                        HexKeyB = neighborKey,
                        NeighborIndex = neighborIndex,
                        TeamAColor = cell.OwnerColor ?? string.Empty,
                        TeamBColor = neighbor.OwnerColor ?? string.Empty,
                        Intensity = (double)minTroops / maxTroops
                    });
                }

                neighborIndex++;
            }
        }

        return edges;
    }
}
