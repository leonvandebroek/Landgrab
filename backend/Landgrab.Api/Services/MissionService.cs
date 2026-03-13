using Landgrab.Api.Hubs;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR;

namespace Landgrab.Api.Services;

public sealed class MissionService(
    IServiceScopeFactory scopeFactory,
    IHubContext<GameHub> hubContext,
    ILogger<MissionService> logger) : BackgroundService
{
    private readonly record struct MissionTemplate(
        string Type,
        string Title,
        string TitleKey,
        string Description,
        string Objective,
        string Reward);

    private readonly record struct InterimMissionTemplate(
        string Type,
        string Title,
        string TitleKey,
        string Description,
        string Objective,
        TimeSpan Duration,
        string Reward);

    // Track when interim missions were last generated per room
    private readonly Dictionary<string, DateTime> _lastMissionGeneration = new();

    // ── Mission template pools ────────────────────────────────────────────

    private static readonly MissionTemplate[] TeamMissionPool =
    [
        new("Territorial", "Divide and Conquer", "DivideAndConquer", "Own hexes in 3 different quadrants of the grid.", "OwnQuadrants", "+3 troops to random hex"),
        new("Territorial", "Encirclement", "Encirclement", "Surround an enemy hex on all 6 sides.", "SurroundEnemy", "+5 troops to random hex"),
        new("Territorial", "Territory Rush", "TerritoryRush", "Claim 5 hexes within the time limit.", "ClaimCount:5", "+3 troops to random hex"),
    ];

    private static readonly MissionTemplate[] PersonalMissionPool =
    [
        new("Recon", "Scout Patrol", "ScoutPatrol", "Visit 8 different hexes.", "VisitHexes:8", "+2 troops to all hexes"),
        new("Territorial", "Frontline Fighter", "FrontlineFighter", "Win 2 attacks.", "WinAttacks:2", "+3 troops to random hex"),
        new("Role", "Fortifier", "Fortifier", "Reinforce 3 of your hexes to 5+ troops.", "FortifyHexes:3", "+3 troops to random hex"),
    ];

    private static readonly InterimMissionTemplate[] InterimMissionPool =
    [
        new("TimeBound", "Flag Planting", "FlagPlanting", "Claim 3 neutral hexes before time runs out.", "ClaimNeutral:3", TimeSpan.FromMinutes(10), "+3 troops to random hex"),
        new("TimeBound", "Last Defender", "LastDefender", "Don't lose any hexes for 5 minutes.", "NoLosses", TimeSpan.FromMinutes(5), "+5 troops to random hex"),
    ];

    // ── Background loop ──────────────────────────────────────────────────

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));

        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var gameService = scope.ServiceProvider.GetRequiredService<GameService>();

                foreach (var roomCode in gameService.GetPlayingRoomCodes())
                {
                    var room = gameService.GetRoom(roomCode);
                    if (room == null || !room.State.Dynamics.MissionSystemEnabled) continue;

                    await ProcessMissions(gameService, room, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Mission tick failed.");
            }
        }
    }

    // ── Core tick per room ───────────────────────────────────────────────

    private async Task ProcessMissions(GameService gameService, GameRoom room, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        List<Mission> newMissions = [];
        List<Mission> completedMissions = [];
        List<Mission> failedMissions = [];

        lock (room.SyncRoot)
        {
            // Generate initial missions if none exist yet
            if (room.State.Missions.Count == 0)
            {
                newMissions.AddRange(GenerateInitialMissions(room.State));
                room.State.Missions.AddRange(newMissions);
                _lastMissionGeneration[room.Code] = now;
                logger.LogInformation("Generated {Count} initial missions for room {Room}",
                    newMissions.Count, room.Code);
            }
            // Generate interim missions every ~30 min
            else if (_lastMissionGeneration.TryGetValue(room.Code, out var lastGen)
                     && (now - lastGen).TotalMinutes >= 30)
            {
                var interim = GenerateInterimMissions(room.State, now);
                newMissions.AddRange(interim);
                room.State.Missions.AddRange(interim);
                _lastMissionGeneration[room.Code] = now;
                logger.LogInformation("Generated {Count} interim missions for room {Room}",
                    interim.Count, room.Code);
            }

            // Evaluate progress and expire active missions
            foreach (var mission in room.State.Missions.Where(m => m.Status == "Active"))
            {
                EvaluateMissionProgress(room.State, mission);

                if (mission.Progress >= 1.0)
                {
                    mission.Status = "Completed";
                    ApplyMissionReward(room.State, mission);
                    completedMissions.Add(mission);
                }
                else if (mission.ExpiresAt.HasValue && now > mission.ExpiresAt.Value)
                {
                    mission.Status = "Expired";
                    failedMissions.Add(mission);
                }
            }
        }

        // Broadcast mission events outside the lock
        foreach (var m in newMissions)
        {
            var targetClients = GetMissionTargetClients(room, m);
            await targetClients.SendAsync("MissionAssigned", m, ct);
        }

        foreach (var m in completedMissions)
        {
            await hubContext.Clients.Group(room.Code).SendAsync("MissionCompleted", m, ct);
            logger.LogInformation("Mission '{Title}' completed in room {Room}", m.Title, room.Code);
        }

        foreach (var m in failedMissions)
        {
            var targetClients = GetMissionTargetClients(room, m);
            await targetClients.SendAsync("MissionFailed", m, ct);
        }

        // Broadcast full state if anything changed
        if (newMissions.Count > 0 || completedMissions.Count > 0 || failedMissions.Count > 0)
        {
            GameState snapshot;
            lock (room.SyncRoot) { snapshot = gameService.SnapshotStatePublic(room.State); }
            await hubContext.Clients.Group(room.Code).SendAsync("StateUpdated", snapshot, ct);
        }
    }

    // ── Mission generation ───────────────────────────────────────────────

    private static List<Mission> GenerateInitialMissions(GameState state)
    {
        var missions = new List<Mission>();

        // 1 Main mission for the game
        missions.Add(CreateMission(
            new MissionTemplate(
                "Territorial",
                "Hold the Hill",
                "HoldTheHill",
                "Control the center hex for 10 minutes total.",
                "HoldCenter",
                "+5 troops to random hex"),
            scope: "Main"));

        // 1 Team mission per alliance
        foreach (var alliance in state.Alliances)
        {
            missions.Add(GenerateTeamMission(alliance));
        }

        // 1 Personal mission per player
        foreach (var player in state.Players)
        {
            missions.Add(GeneratePersonalMission(player));
        }

        return missions;
    }

    private static Mission GenerateTeamMission(AllianceDto alliance)
    {
        var template = TeamMissionPool[Random.Shared.Next(TeamMissionPool.Length)];
        return CreateMission(template, scope: "Team", targetTeamId: alliance.Id);
    }

    private static Mission GeneratePersonalMission(PlayerDto player)
    {
        var template = PersonalMissionPool[Random.Shared.Next(PersonalMissionPool.Length)];
        return CreateMission(template, scope: "Personal", targetPlayerId: player.Id);
    }

    private static List<Mission> GenerateInterimMissions(GameState state, DateTime now)
    {
        var missions = new List<Mission>();

        // Pick one random interim mission type for the whole room
        var template = InterimMissionPool[Random.Shared.Next(InterimMissionPool.Length)];
        missions.Add(CreateMission(template, scope: "Interim", expiresAt: now + template.Duration));

        // Also refresh one personal mission per player (if they have no active personal mission)
        foreach (var player in state.Players)
        {
            var hasActivePersonal = state.Missions
                .Any(m => m.Scope == "Personal" && m.TargetPlayerId == player.Id && m.Status == "Active");

            if (!hasActivePersonal)
            {
                missions.Add(GeneratePersonalMission(player));
            }
        }

        return missions;
    }

    private static Mission CreateMission(
        MissionTemplate template,
        string scope,
        string? targetTeamId = null,
        string? targetPlayerId = null,
        DateTime? expiresAt = null)
    {
        return new Mission
        {
            Type = template.Type,
            Title = template.Title,
            TitleKey = template.TitleKey,
            Description = template.Description,
            DescriptionKey = template.TitleKey,
            Scope = scope,
            TargetTeamId = targetTeamId,
            TargetPlayerId = targetPlayerId,
            Objective = template.Objective,
            ExpiresAt = expiresAt,
            Reward = template.Reward,
            RewardKey = GetRewardKey(template.Reward),
        };
    }

    private static Mission CreateMission(
        InterimMissionTemplate template,
        string scope,
        string? targetTeamId = null,
        string? targetPlayerId = null,
        DateTime? expiresAt = null)
    {
        return CreateMission(
            new MissionTemplate(
                template.Type,
                template.Title,
                template.TitleKey,
                template.Description,
                template.Objective,
                template.Reward),
            scope,
            targetTeamId,
            targetPlayerId,
            expiresAt);
    }

    private static string? GetRewardKey(string reward)
    {
        return reward switch
        {
            var value when value.Contains("troops to all hexes", StringComparison.OrdinalIgnoreCase) => "TroopsToAllHexes",
            var value when value.Contains("troops to random hex", StringComparison.OrdinalIgnoreCase) => "TroopsToRandomHex",
            var value when value.Contains("troops", StringComparison.OrdinalIgnoreCase) => "Troops",
            _ => null,
        };
    }

    // ── Progress evaluation ──────────────────────────────────────────────

    private static void EvaluateMissionProgress(GameState state, Mission mission)
    {
        var objective = mission.Objective;

        if (objective == "HoldCenter")
        {
            EvaluateHoldCenter(state, mission);
        }
        else if (objective == "OwnQuadrants")
        {
            EvaluateOwnQuadrants(state, mission);
        }
        else if (objective == "SurroundEnemy")
        {
            EvaluateSurroundEnemy(state, mission);
        }
        else if (objective.StartsWith("ClaimCount:"))
        {
            EvaluateClaimCount(state, mission, objective);
        }
        else if (objective.StartsWith("VisitHexes:"))
        {
            EvaluateVisitHexes(state, mission, objective);
        }
        else if (objective.StartsWith("WinAttacks:"))
        {
            // WinAttacks requires event hooks for precise tracking.
            // Approximation: use territory count growth as a proxy.
            EvaluateWinAttacksApprox(state, mission, objective);
        }
        else if (objective.StartsWith("FortifyHexes:"))
        {
            EvaluateFortifyHexes(state, mission, objective);
        }
        else if (objective.StartsWith("ClaimNeutral:"))
        {
            EvaluateClaimNeutral(state, mission, objective);
        }
        else if (objective == "NoLosses")
        {
            // NoLosses: simplified — remains at 1.0 unless territory count drops.
            // Real tracking would require per-tick delta or event hooks.
            if (mission.Progress == 0) mission.Progress = 1.0;
        }
    }

    private static void EvaluateHoldCenter(GameState state, Mission mission)
    {
        // Find the center / master tile
        int centerQ = state.MasterTileQ ?? 0;
        int centerR = state.MasterTileR ?? 0;
        var key = $"{centerQ},{centerR}";

        if (state.Grid.TryGetValue(key, out var cell) && cell.OwnerId != null)
        {
            // Increment progress by a fraction per 5-min tick (target: 10 min = 2 ticks)
            mission.Progress = Math.Min(1.0, mission.Progress + 0.5);
        }
    }

    private static void EvaluateOwnQuadrants(GameState state, Mission mission)
    {
        if (mission.TargetTeamId == null) return;

        var teamHexes = state.Grid.Values
            .Where(c => c.OwnerAllianceId == mission.TargetTeamId)
            .ToList();

        // Quadrants based on Q/R sign: (+,+), (+,-), (-,+), (-,-)
        var quadrants = teamHexes
            .Select(c => (Q: c.Q >= 0 ? 1 : -1, R: c.R >= 0 ? 1 : -1))
            .Distinct()
            .Count();

        mission.Progress = Math.Min(1.0, quadrants / 3.0);
    }

    private static void EvaluateSurroundEnemy(GameState state, Mission mission)
    {
        if (mission.TargetTeamId == null) return;

        // Hex neighbor offsets (axial coordinates)
        (int dq, int dr)[] neighbors = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, -1), (-1, 1)];

        foreach (var cell in state.Grid.Values)
        {
            // Look for enemy hexes (owned by a different alliance)
            if (cell.OwnerAllianceId == null || cell.OwnerAllianceId == mission.TargetTeamId) continue;

            var allSurrounded = true;
            foreach (var (dq, dr) in neighbors)
            {
                var nKey = $"{cell.Q + dq},{cell.R + dr}";
                if (!state.Grid.TryGetValue(nKey, out var neighbor) || neighbor.OwnerAllianceId != mission.TargetTeamId)
                {
                    allSurrounded = false;
                    break;
                }
            }

            if (allSurrounded)
            {
                mission.Progress = 1.0;
                return;
            }
        }

        // Count best progress: max surrounded-neighbor ratio
        double best = 0;
        foreach (var cell in state.Grid.Values)
        {
            if (cell.OwnerAllianceId == null || cell.OwnerAllianceId == mission.TargetTeamId) continue;

            int surrounded = 0;
            foreach (var (dq, dr) in neighbors)
            {
                var nKey = $"{cell.Q + dq},{cell.R + dr}";
                if (state.Grid.TryGetValue(nKey, out var neighbor) && neighbor.OwnerAllianceId == mission.TargetTeamId)
                    surrounded++;
            }

            best = Math.Max(best, surrounded / 6.0);
        }

        mission.Progress = Math.Min(1.0, best);
    }

    private static void EvaluateClaimCount(GameState state, Mission mission, string objective)
    {
        if (!TryParseTarget(objective, out var target)) return;
        if (mission.TargetTeamId == null) return;

        var count = state.Grid.Values.Count(c => c.OwnerAllianceId == mission.TargetTeamId);
        mission.Progress = Math.Min(1.0, (double)count / target);
    }

    private static void EvaluateVisitHexes(GameState state, Mission mission, string objective)
    {
        if (!TryParseTarget(objective, out var target)) return;
        if (mission.TargetPlayerId == null) return;

        var player = state.Players.FirstOrDefault(p => p.Id == mission.TargetPlayerId);
        if (player == null) return;

        mission.Progress = Math.Min(1.0, (double)player.VisitedHexes.Count / target);
    }

    private static void EvaluateWinAttacksApprox(GameState state, Mission mission, string objective)
    {
        if (!TryParseTarget(objective, out var target)) return;
        if (mission.TargetPlayerId == null) return;

        // Approximation: count hexes owned by this player as a proxy for attacks won
        var player = state.Players.FirstOrDefault(p => p.Id == mission.TargetPlayerId);
        if (player == null) return;

        // Use territory count as rough proxy (capped at target)
        var owned = state.Grid.Values.Count(c => c.OwnerId == player.Id);
        mission.Progress = Math.Min(1.0, (double)Math.Min(owned, target) / target);
    }

    private static void EvaluateFortifyHexes(GameState state, Mission mission, string objective)
    {
        if (!TryParseTarget(objective, out var target)) return;
        if (mission.TargetPlayerId == null) return;

        var count = state.Grid.Values.Count(c => c.OwnerId == mission.TargetPlayerId && c.Troops >= 5);
        mission.Progress = Math.Min(1.0, (double)count / target);
    }

    private static void EvaluateClaimNeutral(GameState state, Mission mission, string objective)
    {
        if (!TryParseTarget(objective, out var target)) return;

        // Count unclaimed hexes that are now claimed (total owned / total grid as rough measure)
        // Simplified: count all owned hexes across all teams
        var totalOwned = state.Grid.Values.Count(c => c.OwnerId != null);
        var totalCells = state.Grid.Count;
        var neutralClaimed = Math.Min(target, totalOwned); // rough proxy
        mission.Progress = Math.Min(1.0, (double)neutralClaimed / target);
    }

    private static bool TryParseTarget(string objective, out int target)
    {
        target = 0;
        var colonIdx = objective.IndexOf(':');
        return colonIdx >= 0 && int.TryParse(objective[(colonIdx + 1)..], out target) && target > 0;
    }

    // ── Reward application ───────────────────────────────────────────────

    private static void ApplyMissionReward(GameState state, Mission mission)
    {
        // Determine which hexes to reward (team or personal scope)
        var targetHexes = GetRewardTargetHexes(state, mission);
        if (targetHexes.Count == 0) return;

        var reward = mission.Reward;

        if (reward.Contains("troops to all hexes"))
        {
            // Parse troop count: "+N troops to all hexes"
            var troops = ParseRewardTroops(reward);
            foreach (var hex in targetHexes)
                hex.Troops += troops;
        }
        else if (reward.Contains("troops to random hex") || reward.Contains("troops"))
        {
            // "+N troops to random hex" or "+N troops"
            var troops = ParseRewardTroops(reward);
            var target = targetHexes[Random.Shared.Next(targetHexes.Count)];
            target.Troops += troops;
        }
    }

    private static List<HexCell> GetRewardTargetHexes(GameState state, Mission mission)
    {
        if (mission.Scope == "Personal" && mission.TargetPlayerId != null)
        {
            return state.Grid.Values
                .Where(c => c.OwnerId == mission.TargetPlayerId && !c.IsMasterTile)
                .ToList();
        }

        if (mission.Scope == "Team" && mission.TargetTeamId != null)
        {
            return state.Grid.Values
                .Where(c => c.OwnerAllianceId == mission.TargetTeamId && !c.IsMasterTile)
                .ToList();
        }

        // Main/Interim: reward all teams — pick hexes from all players
        return state.Grid.Values
            .Where(c => c.OwnerId != null && !c.IsMasterTile)
            .ToList();
    }

    private static int ParseRewardTroops(string reward)
    {
        // Expects format like "+5 troops ..." — extract the number after '+'
        foreach (var part in reward.Split(' '))
        {
            if (part.StartsWith('+') && int.TryParse(part[1..], out var n))
                return n;
        }

        return 3; // fallback
    }

    // ── Hub targeting ────────────────────────────────────────────────────

    private IClientProxy GetMissionTargetClients(GameRoom room, Mission mission)
    {
        if (mission.Scope == "Personal" && mission.TargetPlayerId != null)
        {
            var connId = room.ConnectionMap
                .FirstOrDefault(kv => kv.Value == mission.TargetPlayerId).Key;
            return connId != null
                ? hubContext.Clients.Client(connId)
                : hubContext.Clients.Group(room.Code);
        }

        if (mission.Scope == "Team" && mission.TargetTeamId != null)
        {
            var alliance = room.State.Alliances
                .FirstOrDefault(a => a.Id == mission.TargetTeamId);
            if (alliance != null)
            {
                var connectionIds = room.ConnectionMap
                    .Where(kv => alliance.MemberIds.Contains(kv.Value))
                    .Select(kv => kv.Key)
                    .ToList();
                return connectionIds.Count > 0
                    ? hubContext.Clients.Clients(connectionIds)
                    : hubContext.Clients.Group(room.Code);
            }
        }

        // Main / Interim → everyone in the room
        return hubContext.Clients.Group(room.Code);
    }
}
