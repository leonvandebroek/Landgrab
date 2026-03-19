using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class HostControlService(IGameRoomProvider roomProvider, GameStateService gameStateService)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);
    private static bool IsHost(GameRoom room, string userId) => GameStateCommon.IsHost(room, userId);

    public (GameState? state, string? error) SetHostObserverMode(string roomCode, string userId, bool enabled)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can toggle observer mode.");

            room.State.HostObserverMode = enabled;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "HostAction",
                Message = enabled ? "Host entered observer mode." : "Host returned to player mode."
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) UpdateGameDynamicsLive(string roomCode, string userId,
        GameDynamics dynamics)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can change game dynamics.");
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Live dynamics changes require an active game.");

            room.State.Dynamics.BeaconEnabled = dynamics.BeaconEnabled;
            room.State.Dynamics.TileDecayEnabled = dynamics.TileDecayEnabled;
            room.State.Dynamics.CombatMode = dynamics.CombatMode;
            room.State.Dynamics.PlayerRolesEnabled = dynamics.PlayerRolesEnabled;
            room.State.Dynamics.HQEnabled = dynamics.HQEnabled;
            room.State.Dynamics.HQAutoAssign = dynamics.HQAutoAssign;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "HostAction",
                Message = "Host updated game dynamics."
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) TriggerGameEvent(string roomCode, string userId,
        string eventType, int? targetQ, int? targetR, string? targetAllianceId)
    {
        var room = GetRoom(roomCode);
        if (room is null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can trigger events.");
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Events can only be triggered during gameplay.");

            switch (eventType)
            {
                case "Calamity":
                    {
                        HexCell? target = null;
                        if (targetQ.HasValue && targetR.HasValue)
                        {
                            var key = $"{targetQ.Value},{targetR.Value}";
                            room.State.Grid.TryGetValue(key, out target);
                        }

                        target ??= room.State.Grid.Values
                            .Where(c => c.OwnerId is not null && !c.IsMasterTile && c.Troops > 0)
                            .OrderBy(_ => Random.Shared.Next())
                            .FirstOrDefault();

                        if (target is not null)
                        {
                            target.Troops = 0;
                            AppendEventLog(room.State, new GameEventLogEntry
                            {
                                Type = "RandomEvent",
                                Message = $"Calamity! Hex ({target.Q}, {target.R}) lost all troops.",
                                Q = target.Q,
                                R = target.R
                            });
                        }
                        break;
                    }

                case "Epidemic":
                    {
                        var targetAlliance = targetAllianceId is not null
                            ? room.State.Alliances.FirstOrDefault(a => a.Id == targetAllianceId)
                            : room.State.Alliances.OrderByDescending(a => a.TerritoryCount).FirstOrDefault();

                        if (targetAlliance is not null)
                        {
                            var allianceHexes = room.State.Grid.Values
                                .Where(c => c.OwnerAllianceId == targetAlliance.Id && c.Troops > 0 && !c.IsMasterTile)
                                .ToList();
                            if (allianceHexes.Count > 0)
                            {
                                var target = allianceHexes[Random.Shared.Next(allianceHexes.Count)];
                                target.Troops = Math.Max(0, target.Troops - 2);
                                AppendEventLog(room.State, new GameEventLogEntry
                                {
                                    Type = "RandomEvent",
                                    Message = $"Epidemic! {targetAlliance.Name} lost 2 troops at ({target.Q}, {target.R}).",
                                    AllianceId = targetAlliance.Id,
                                    AllianceName = targetAlliance.Name,
                                    Q = target.Q,
                                    R = target.R
                                });
                            }
                        }
                        break;
                    }

                case "BonusTroops":
                    {
                        var targetAlliances = targetAllianceId is not null
                            ? room.State.Alliances.Where(a => a.Id == targetAllianceId).ToList()
                            : room.State.Alliances.ToList();

                        foreach (var alliance in targetAlliances)
                        {
                            var hex = room.State.Grid.Values
                                .FirstOrDefault(c => c.OwnerAllianceId == alliance.Id && !c.IsMasterTile);
                            if (hex is not null)
                                hex.Troops += 2;
                        }

                        var msg = targetAllianceId is not null && targetAlliances.Count > 0
                            ? $"Bonus Troops! {targetAlliances[0].Name} received +2 troops."
                            : "Bonus Troops! Every team received +2 troops.";
                        AppendEventLog(room.State, new GameEventLogEntry
                        {
                            Type = "RandomEvent",
                            Message = msg
                        });
                        break;
                    }

                default:
                    return (null, $"Unknown event type: {eventType}");
            }

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) SendHostMessage(string roomCode, string userId,
        string message, List<string>? targetAllianceIds)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        if (string.IsNullOrWhiteSpace(message) || message.Length > 500)
            return (null, "Message must be between 1 and 500 characters.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can send messages.");
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Messages can only be sent during gameplay.");

            var allianceNames = targetAllianceIds != null && targetAllianceIds.Count > 0
                ? string.Join(", ", room.State.Alliances
                    .Where(a => targetAllianceIds.Contains(a.Id))
                    .Select(a => a.Name))
                : "all players";

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "HostMessage",
                Message = $"[Host → {allianceNames}] {message}"
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }

    public (GameState? state, string? error) PauseGame(string roomCode, string userId, bool paused)
    {
        var room = GetRoom(roomCode);
        if (room == null)
            return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!IsHost(room, userId))
                return (null, "Only the host can pause or resume the game.");
            if (room.State.Phase != GamePhase.Playing)
                return (null, "Can only pause or resume during gameplay.");

            room.State.IsPaused = paused;

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "HostAction",
                Message = paused ? "Host paused the game." : "Host resumed the game."
            });

            var snapshot = SnapshotState(room.State);
            QueuePersistence(room, snapshot);
            return (snapshot, null);
        }
    }
}
