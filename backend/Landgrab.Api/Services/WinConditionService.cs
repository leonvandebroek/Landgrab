using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class WinConditionService
{
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);

    public void ApplyWinConditionAndLog(GameState state, DateTime now) => ApplyWinConditionAndLogCore(state, now);
    public void ComputeAchievements(GameState state) => ComputeAchievementsCore(state);
    public void ApplyWinCondition(GameState state, DateTime now) => ApplyWinConditionCore(state, now);
    public void ApplyTerritoryPercentWinCondition(GameState state) => ApplyTerritoryPercentWinConditionCore(state);
    public void ApplyEliminationWinCondition(GameState state) => ApplyEliminationWinConditionCore(state);
    public bool TrySetTerritoryLeaderAsWinner(GameState state) => TrySetTerritoryLeaderAsWinnerCore(state);
    public void RefreshTerritoryCount(GameState state) => RefreshTerritoryCountCore(state);

    internal static void RefreshTerritoryCountCore(GameState state)
    {
        var playerById = new Dictionary<string, PlayerDto>(state.Players.Count);
        foreach (var player in state.Players)
        {
            player.TerritoryCount = 0;
            playerById[player.Id] = player;
        }

        var allianceById = new Dictionary<string, AllianceDto>(state.Alliances.Count);
        foreach (var alliance in state.Alliances)
        {
            alliance.TerritoryCount = 0;
            allianceById[alliance.Id] = alliance;
        }

        foreach (var cell in state.Grid.Values)
        {
            if (cell.OwnerId != null && playerById.TryGetValue(cell.OwnerId, out var owner))
                owner.TerritoryCount++;
            if (cell.OwnerAllianceId != null && allianceById.TryGetValue(cell.OwnerAllianceId, out var allianceOwner))
                allianceOwner.TerritoryCount++;
        }
    }

    internal static void ApplyWinConditionAndLogCore(GameState state, DateTime now)
    {
        var previousPhase = state.Phase;
        ApplyWinConditionCore(state, now);
        if (previousPhase == GamePhase.GameOver || state.Phase != GamePhase.GameOver)
            return;

        ComputeAchievementsCore(state);
        AppendEventLog(state, new GameEventLogEntry
        {
            Type = "GameOver",
            Message = state.WinnerName == null
                ? "The game is over."
                : $"{state.WinnerName} won the game.",
            WinnerId = state.WinnerId,
            WinnerName = state.WinnerName,
            IsAllianceVictory = state.IsAllianceVictory
        });
    }

    internal static void ComputeAchievementsCore(GameState state)
    {
        state.Achievements.Clear();

        // Territory Leader: player with highest TerritoryCount
        var maxTerritory = state.Players.Max(p => p.TerritoryCount);
        if (maxTerritory > 0)
        {
            foreach (var p in state.Players.Where(p => p.TerritoryCount == maxTerritory))
            {
                state.Achievements.Add(new Achievement
                {
                    Id = "territoryLeader",
                    PlayerId = p.Id,
                    PlayerName = p.Name,
                    TitleKey = "achievement.territoryLeader",
                    Value = maxTerritory.ToString()
                });
            }
        }

        // Army Commander: player with most total troops on the map
        var playerTroopTotals = new Dictionary<string, int>(state.Players.Count);
        foreach (var p in state.Players)
            playerTroopTotals[p.Id] = 0;
        foreach (var cell in state.Grid.Values)
            if (cell.OwnerId != null && playerTroopTotals.TryGetValue(cell.OwnerId, out var current))
                playerTroopTotals[cell.OwnerId] = current + cell.Troops;
        var maxTroops = playerTroopTotals.Count > 0 ? playerTroopTotals.Values.Max() : 0;
        if (maxTroops > 0)
        {
            foreach (var player in state.Players)
            {
                if (playerTroopTotals.TryGetValue(player.Id, out var total) && total == maxTroops)
                {
                    state.Achievements.Add(new Achievement
                    {
                        Id = "armyCommander",
                        PlayerId = player.Id,
                        PlayerName = player.Name,
                        TitleKey = "achievement.armyCommander",
                        Value = maxTroops.ToString()
                    });
                }
            }
        }

        // Conqueror: player with most TileCaptured events as attacker
        var capturesByPlayer = state.EventLog
            .Where(e => e.Type == "TileCaptured" && e.PlayerId != null)
            .GroupBy(e => e.PlayerId!)
            .Select(g => new { PlayerId = g.Key, Count = g.Count() })
            .ToList();
        if (capturesByPlayer.Count > 0)
        {
            var maxCaptures = capturesByPlayer.Max(c => c.Count);
            foreach (var c in capturesByPlayer.Where(c => c.Count == maxCaptures))
            {
                var player = state.Players.FirstOrDefault(p => p.Id == c.PlayerId);
                if (player != null)
                {
                    state.Achievements.Add(new Achievement
                    {
                        Id = "conqueror",
                        PlayerId = player.Id,
                        PlayerName = player.Name,
                        TitleKey = "achievement.conqueror",
                        Value = maxCaptures.ToString()
                    });
                }
            }
        }

        // First Strike: player with earliest TileCaptured event
        var firstCapture = state.EventLog
            .Where(e => e.Type == "TileCaptured" && e.PlayerId != null)
            .OrderBy(e => e.CreatedAt)
            .FirstOrDefault();
        if (firstCapture != null)
        {
            var earliestTime = firstCapture.CreatedAt;
            var firstStrikers = state.EventLog
                .Where(e => e.Type == "TileCaptured" && e.PlayerId != null && e.CreatedAt == earliestTime)
                .Select(e => e.PlayerId!)
                .Distinct();
            foreach (var playerId in firstStrikers)
            {
                var player = state.Players.FirstOrDefault(p => p.Id == playerId);
                if (player != null)
                {
                    state.Achievements.Add(new Achievement
                    {
                        Id = "firstStrike",
                        PlayerId = player.Id,
                        PlayerName = player.Name,
                        TitleKey = "achievement.firstStrike"
                    });
                }
            }
        }
    }

    internal static void ApplyWinConditionCore(GameState state, DateTime now)
    {
        if (state.Phase == GamePhase.GameOver)
            return;

        RefreshTerritoryCountCore(state);

        if (state.WinConditionType == WinConditionType.TimedGame &&
            state.GameStartedAt.HasValue &&
            state.GameDurationMinutes.HasValue &&
            now >= state.GameStartedAt.Value.AddMinutes(state.GameDurationMinutes.Value))
        {
            if (TrySetTerritoryLeaderAsWinnerCore(state))
                state.Phase = GamePhase.GameOver;
            return;
        }

        switch (state.WinConditionType)
        {
            case WinConditionType.TerritoryPercent:
                ApplyTerritoryPercentWinConditionCore(state);
                break;
            case WinConditionType.Elimination:
                ApplyEliminationWinConditionCore(state);
                break;
        }
    }

    internal static void ApplyTerritoryPercentWinConditionCore(GameState state)
    {
        var claimableHexes = state.Grid.Values.Count(cell => !cell.IsMasterTile);
        if (claimableHexes == 0)
            return;

        if (state.Alliances.Count > 0)
        {
            foreach (var alliance in state.Alliances)
            {
                if (alliance.TerritoryCount * 100 < claimableHexes * state.WinConditionValue)
                    continue;

                state.Phase = GamePhase.GameOver;
                state.WinnerId = alliance.Id;
                state.WinnerName = alliance.Name;
                state.IsAllianceVictory = true;
                return;
            }
        }
        else
        {
            foreach (var player in state.Players)
            {
                if (player.TerritoryCount * 100 < claimableHexes * state.WinConditionValue)
                    continue;

                state.Phase = GamePhase.GameOver;
                state.WinnerId = player.Id;
                state.WinnerName = player.Name;
                state.IsAllianceVictory = false;
                return;
            }
        }

        var claimedHexes = state.Grid.Values.Count(cell => !cell.IsMasterTile && cell.OwnerId != null);
        if (claimedHexes >= claimableHexes && TrySetTerritoryLeaderAsWinnerCore(state))
            state.Phase = GamePhase.GameOver;
    }

    internal static void ApplyEliminationWinConditionCore(GameState state)
    {
        if (state.Alliances.Count > 0)
        {
            var survivingAlliance = state.Alliances.Where(alliance => alliance.TerritoryCount > 0).ToList();
            if (survivingAlliance.Count <= 1 && TrySetTerritoryLeaderAsWinnerCore(state))
            {
                state.Phase = GamePhase.GameOver;
            }

            return;
        }

        var survivingPlayers = state.Players.Where(player => player.TerritoryCount > 0).ToList();
        if (survivingPlayers.Count <= 1 && TrySetTerritoryLeaderAsWinnerCore(state))
        {
            state.Phase = GamePhase.GameOver;
        }
    }

    internal static bool TrySetTerritoryLeaderAsWinnerCore(GameState state)
    {
        if (state.Alliances.Count > 0)
        {
            var allianceWinner = state.Alliances
                .OrderByDescending(alliance => alliance.TerritoryCount)
                .ThenBy(alliance => alliance.Name, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();

            if (allianceWinner == null)
                return false;

            state.WinnerId = allianceWinner.Id;
            state.WinnerName = allianceWinner.Name;
            state.IsAllianceVictory = true;
            return true;
        }

        var playerWinner = state.Players
            .OrderByDescending(player => player.TerritoryCount)
            .ThenBy(player => player.Name, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();

        if (playerWinner == null)
            return false;

        state.WinnerId = playerWinner.Id;
        state.WinnerName = playerWinner.Name;
        state.IsAllianceVictory = false;
        return true;
    }
}
