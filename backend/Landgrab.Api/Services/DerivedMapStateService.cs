using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class DerivedMapStateService
{
    public void ComputeAndAttach(GameState state)
    {
        state.ContestedEdges = ComputeContestedEdges(state.Grid);
        var (supplyEdges, disconnectedHexKeys) = ComputeSupplyNetwork(state.Grid, state.Alliances);
        state.SupplyEdges = supplyEdges;
        state.DisconnectedHexKeys = disconnectedHexKeys;
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

    public (List<SupplyEdgeDto> edges, List<string> disconnected) ComputeSupplyNetwork(
        Dictionary<string, HexCell> grid,
        List<AllianceDto> alliances)
    {
        var supplyEdges = new List<SupplyEdgeDto>();
        var connectedHexKeys = new HashSet<string>(StringComparer.Ordinal);
        var alliancesWithHq = new HashSet<string>(StringComparer.Ordinal);

        foreach (var alliance in alliances)
        {
            if (alliance.HQHexQ is null || alliance.HQHexR is null)
            {
                continue;
            }

            alliancesWithHq.Add(alliance.Id);

            var hqKey = HexService.Key(alliance.HQHexQ.Value, alliance.HQHexR.Value);
            if (!grid.TryGetValue(hqKey, out var hqCell) || hqCell.OwnerAllianceId != alliance.Id)
            {
                continue;
            }

            var visited = new HashSet<string>(StringComparer.Ordinal);
            var queue = new Queue<string>();
            queue.Enqueue(hqKey);
            visited.Add(hqKey);
            connectedHexKeys.Add(hqKey);

            while (queue.Count > 0)
            {
                var currentKey = queue.Dequeue();
                if (!grid.TryGetValue(currentKey, out var currentCell))
                {
                    continue;
                }

                foreach (var (nq, nr) in HexService.Neighbors(currentCell.Q, currentCell.R))
                {
                    var neighborKey = HexService.Key(nq, nr);
                    if (visited.Contains(neighborKey) || !grid.TryGetValue(neighborKey, out var neighborCell))
                    {
                        continue;
                    }

                    if (string.IsNullOrEmpty(neighborCell.OwnerId) || neighborCell.OwnerAllianceId != alliance.Id)
                    {
                        continue;
                    }

                    visited.Add(neighborKey);
                    connectedHexKeys.Add(neighborKey);
                    queue.Enqueue(neighborKey);

                    supplyEdges.Add(new SupplyEdgeDto
                    {
                        FromKey = currentKey,
                        ToKey = neighborKey,
                        TeamColor = alliance.Color ?? string.Empty
                    });
                }
            }
        }

        var disconnectedHexKeys = new List<string>();
        foreach (var (key, cell) in grid)
        {
            if (!string.IsNullOrEmpty(cell.OwnerId)
                && !string.IsNullOrEmpty(cell.OwnerAllianceId)
                && alliancesWithHq.Contains(cell.OwnerAllianceId)
                && !connectedHexKeys.Contains(key))
            {
                disconnectedHexKeys.Add(key);
            }
        }

        return (supplyEdges, disconnectedHexKeys);
    }
}
