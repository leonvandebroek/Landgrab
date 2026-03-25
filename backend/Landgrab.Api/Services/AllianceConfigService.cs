using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class AllianceConfigService(IGameRoomProvider roomProvider, GameStateService gameStateService)
    : RoomScopedServiceBase(roomProvider, gameStateService)
{
    private static void RefreshTerritoryCount(GameState state) => GameplayService.RefreshTerritoryCount(state);

    public (GameState? state, string? error) SetAlliance(string roomCode, string userId, string allianceName)
    {
        if (string.IsNullOrWhiteSpace(allianceName))
            return (null, "Alliance name is required.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Alliances can only be changed in the lobby.");

            var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
            if (player == null)
                return (null, "Player not in room.");

            var previousAllianceId = player.AllianceId;
            var previousAllianceName = player.AllianceName;
            var normalizedName = allianceName.Trim();
            var alliance = room.State.Alliances.FirstOrDefault(a =>
                a.Name.Equals(normalizedName, StringComparison.OrdinalIgnoreCase));

            if (alliance == null)
            {
                if (room.State.Alliances.Count >= 8)
                    return (null, "Max 8 alliances per game.");

                alliance = new AllianceDto
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = normalizedName,
                    Color = GameStateCommon.AllianceColors[room.State.Alliances.Count % GameStateCommon.AllianceColors.Length]
                };
                room.State.Alliances.Add(alliance);
            }

            foreach (var existingAlliance in room.State.Alliances)
                existingAlliance.MemberIds.Remove(userId);

            alliance.MemberIds.Add(userId);
            player.AllianceId = alliance.Id;
            player.AllianceName = alliance.Name;
            player.AllianceColor = alliance.Color;
            player.Color = alliance.Color;

            foreach (var cell in room.State.Grid.Values.Where(cell => cell.OwnerId == userId))
            {
                cell.OwnerAllianceId = player.AllianceId;
                cell.OwnerColor = player.AllianceColor ?? player.Color;
                cell.OwnerName = player.Name;
            }

            RefreshTerritoryCount(room.State);
            if (!string.Equals(previousAllianceId, player.AllianceId, StringComparison.Ordinal))
            {
                var changeMessage = previousAllianceName == null
                    ? $"{player.Name} joined alliance {alliance.Name}."
                    : $"{player.Name} changed alliance from {previousAllianceName} to {alliance.Name}.";
                AppendEventLog(room.State, new GameEventLogEntry
                {
                    Type = "AllianceChanged",
                    Message = changeMessage,
                    PlayerId = player.Id,
                    PlayerName = player.Name,
                    AllianceId = alliance.Id,
                    AllianceName = alliance.Name
                });
            }

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) ConfigureAlliances(string roomCode, string userId, List<string> allianceNames)
    {
        if (allianceNames == null || allianceNames.Count == 0)
            return (null, "At least one alliance name is required.");

        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can configure alliances.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Alliances can only be configured in the lobby.");

            room.State.Alliances.Clear();
            for (var i = 0; i < allianceNames.Count; i++)
            {
                var name = allianceNames[i].Trim();
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                room.State.Alliances.Add(new AllianceDto
                {
                    Id = Guid.NewGuid().ToString(),
                    Name = name,
                    Color = GameStateCommon.AllianceColors[i % GameStateCommon.AllianceColors.Length]
                });
            }

            foreach (var player in room.State.Players)
            {
                player.AllianceId = null;
                player.AllianceName = null;
                player.AllianceColor = null;
            }

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AlliancesConfigured",
                Message = $"The host configured {room.State.Alliances.Count} alliances.",
                PlayerId = userId,
                PlayerName = host?.Name
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) DistributePlayersRandomly(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can distribute players.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Players can only be distributed in the lobby.");
            if (room.State.Alliances.Count == 0)
                return (null, "Configure at least one alliance before distributing players.");

            var shuffledPlayers = room.State.Players.OrderBy(_ => Random.Shared.Next()).ToList();
            for (var i = 0; i < shuffledPlayers.Count; i++)
            {
                var alliance = room.State.Alliances[i % room.State.Alliances.Count];
                var player = shuffledPlayers[i];
                player.AllianceId = alliance.Id;
                player.AllianceName = alliance.Name;
                player.AllianceColor = alliance.Color;
                player.Color = alliance.Color;
            }

            RefreshAllianceMembers(room.State);

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "PlayersDistributed",
                Message = "The host randomly distributed all players across alliances.",
                PlayerId = userId,
                PlayerName = host?.Name
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) AssignAllianceStartingTile(string roomCode, string userId,
        int q, int r, string allianceId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can assign alliance starting tiles.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "Starting tiles can only be assigned in the lobby.");
            if (room.State.MasterTileQ is null || room.State.MasterTileR is null)
                return (null, "Set the master tile before assigning starting tiles.");

            var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == allianceId);
            if (alliance == null)
                return (null, "Alliance not found.");

            var firstMember = room.State.Players.FirstOrDefault(p => p.AllianceId == allianceId);
            if (firstMember == null)
                return (null, "Alliance has no members.");

            if (!room.State.Grid.TryGetValue(HexService.Key(q, r), out var cell))
                return (null, "Invalid hex.");
            if (cell.IsMasterTile)
                return (null, "The master tile cannot be assigned as a starting tile.");
            if (cell.OwnerId != null)
                return (null, "This hex is already assigned.");

            cell.OwnerId = firstMember.Id;
            cell.OwnerAllianceId = alliance.Id;
            cell.OwnerName = firstMember.Name;
            cell.OwnerColor = alliance.Color;
            cell.Troops = 3;
            RefreshTerritoryCount(room.State);

            var host = room.State.Players.FirstOrDefault(p => p.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AllianceStartingTileAssigned",
                Message = $"Alliance {alliance.Name} was assigned a starting tile at ({q}, {r}).",
                PlayerId = userId,
                PlayerName = host?.Name,
                AllianceId = alliance.Id,
                AllianceName = alliance.Name,
                Q = q,
                R = r
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SetAllianceHQ(string roomCode, string userId, int q, int r, string allianceId)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!GameStateCommon.IsHost(room, userId))
                return (null, "Only the host can set HQ locations.");
            if (room.State.Phase != GamePhase.Lobby)
                return (null, "HQ can only be set during lobby.");
            if (!room.State.Dynamics.HQEnabled)
                return (null, "HQ mechanic is not enabled for this game.");

            var alliance = room.State.Alliances.FirstOrDefault(a => a.Id == allianceId);
            if (alliance == null)
                return (null, "Alliance not found.");

            var key = HexService.Key(q, r);
            if (!room.State.Grid.TryGetValue(key, out var cell))
                return (null, "Invalid hex coordinates.");
            if (!string.Equals(cell.OwnerAllianceId, alliance.Id, StringComparison.Ordinal))
                return (null, "HQ must be placed on a tile owned by the selected alliance.");

            alliance.HQHexQ = q;
            alliance.HQHexR = r;

            var host = room.State.Players.FirstOrDefault(player => player.Id == userId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "AllianceHQAssigned",
                Message = $"Alliance {alliance.Name} HQ was assigned at ({q}, {r}).",
                PlayerId = userId,
                PlayerName = host?.Name,
                AllianceId = alliance.Id,
                AllianceName = alliance.Name,
                Q = q,
                R = r
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    private static void RefreshAllianceMembers(GameState state)
    {
        foreach (var alliance in state.Alliances)
        {
            alliance.MemberIds.Clear();
            alliance.MemberIds.AddRange(state.Players
                .Where(player => player.AllianceId == alliance.Id)
                .Select(player => player.Id));
        }
    }
}
