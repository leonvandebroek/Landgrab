using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class DuelService(IGameRoomProvider roomProvider, GameStateService gameStateService)
{
    private GameRoom? GetRoom(string code) => roomProvider.GetRoom(code);
    private static GameState SnapshotState(GameState state) => GameStateCommon.SnapshotState(state);
    private static void AppendEventLog(GameState state, GameEventLogEntry entry) => GameStateCommon.AppendEventLog(state, entry);
    private void QueuePersistence(GameRoom room, GameState stateSnapshot) => gameStateService.QueuePersistence(room, stateSnapshot);

    public PendingDuel? InitiateDuel(string roomCode, string challengerId, string targetId, int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null) return null;

        lock (room.SyncRoot)
        {
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Duel))
                return null;

            // Check both players are in the hex
            var playersInHex = GameplayService.GetPlayersInHex(room.State, q, r);
            var challenger = playersInHex.FirstOrDefault(p => p.Id == challengerId);
            var target = playersInHex.FirstOrDefault(p => p.Id == targetId);
            if (challenger == null || target == null) return null;

            // Check no existing duel for either player
            if (room.PendingDuels.Values.Any(d => d.PlayerIds.Contains(challengerId) || d.PlayerIds.Contains(targetId)))
                return null;

            var duel = new PendingDuel
            {
                PlayerIds = [challengerId, targetId],
                TileQ = q,
                TileR = r,
                ExpiresAt = DateTime.UtcNow.AddSeconds(30)
            };
            room.PendingDuels[duel.Id] = duel;
            return duel;
        }
    }

    public (bool success, string? winnerId, string? loserId) ResolveDuel(string roomCode, string duelId, bool accepted)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (false, null, null);

        lock (room.SyncRoot)
        {
            if (!room.PendingDuels.TryGetValue(duelId, out var duel))
                return (false, null, null);

            room.PendingDuels.Remove(duelId);

            if (!accepted || DateTime.UtcNow > duel.ExpiresAt)
                return (false, null, null);

            // Resolve duel: compare territory + carried troops
            var player1 = room.State.Players.FirstOrDefault(p => p.Id == duel.PlayerIds[0]);
            var player2 = room.State.Players.FirstOrDefault(p => p.Id == duel.PlayerIds[1]);
            if (player1 == null || player2 == null) return (false, null, null);

            var score1 = player1.TerritoryCount + player1.CarriedTroops;
            var score2 = player2.TerritoryCount + player2.CarriedTroops;

            // Add some randomness
            score1 += Random.Shared.Next(1, 7);
            score2 += Random.Shared.Next(1, 7);

            var winnerId = score1 >= score2 ? player1.Id : player2.Id;
            var loserId = score1 >= score2 ? player2.Id : player1.Id;

            // Winner gets the duel tile
            var hexKey = HexService.Key(duel.TileQ, duel.TileR);
            if (room.State.Grid.TryGetValue(hexKey, out var cell))
            {
                var winner = room.State.Players.First(p => p.Id == winnerId);
                GameplayService.SetCellOwner(cell, winner);
                cell.Troops = Math.Max(cell.Troops, 1);
            }

            var winnerPlayer = room.State.Players.First(p => p.Id == winnerId);
            var loserPlayer = room.State.Players.First(p => p.Id == loserId);
            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "DuelResult",
                Message = $"{winnerPlayer.Name} won a duel against {loserPlayer.Name}!",
                PlayerId = winnerId,
                PlayerName = winnerPlayer.Name,
                TargetPlayerId = loserId,
                TargetPlayerName = loserPlayer.Name,
                Q = duel.TileQ,
                R = duel.TileR
            });

            return (true, winnerId, loserId);
        }
    }

    // Phase 10: Hostage — detain a player
    public (GameState? state, string? error) DetainPlayer(string roomCode, string detainerId, string targetId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        lock (room.SyncRoot)
        {
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Hostage))
                return (null, "Hostage mode is not enabled.");

            var detainer = room.State.Players.FirstOrDefault(p => p.Id == detainerId);
            var target = room.State.Players.FirstOrDefault(p => p.Id == targetId);
            if (detainer == null || target == null)
                return (null, "Player not found.");

            // Check copresence — both must be in same hex
            if (detainer.CurrentLat == null || detainer.CurrentLng == null
                || target.CurrentLat == null || target.CurrentLng == null || !room.State.HasMapLocation)
                return (null, "Cannot determine player positions.");

            var detainerHex = HexService.LatLngToHexForRoom(detainer.CurrentLat.Value, detainer.CurrentLng!.Value,
                room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
            var targetHex = HexService.LatLngToHexForRoom(target.CurrentLat.Value, target.CurrentLng!.Value,
                room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);

            if (detainerHex.q != targetHex.q || detainerHex.r != targetHex.r)
                return (null, "Target must be in the same hex.");

            // Must be hostile
            if (detainer.AllianceId != null && detainer.AllianceId == target.AllianceId)
                return (null, "Cannot detain an allied player.");

            // Already detained?
            if (target.HeldByPlayerId != null)
                return (null, "Target is already detained.");

            target.HeldByPlayerId = detainerId;
            target.HeldUntil = DateTime.UtcNow.AddMinutes(3);

            AppendEventLog(room.State, new GameEventLogEntry
            {
                Type = "Hostage",
                Message = $"{detainer.Name} detained {target.Name}!",
                PlayerId = detainerId,
                PlayerName = detainer.Name,
                TargetPlayerId = targetId,
                TargetPlayerName = target.Name
            });

            return (SnapshotState(room.State), null);
        }
    }

    // Phase 10: Release detained players — called from regen tick
    public void ProcessHostageReleases(GameRoom room)
    {
        lock (room.SyncRoot)
        {
            if (!room.State.Dynamics.ActiveCopresenceModes.Contains(CopresenceMode.Hostage))
                return;

            var now = DateTime.UtcNow;
            foreach (var player in room.State.Players.Where(p => p.HeldByPlayerId != null))
            {
                var shouldRelease = false;

                // Timer expired
                if (player.HeldUntil.HasValue && now > player.HeldUntil.Value)
                    shouldRelease = true;

                // Ally copresence — check if an allied player is in the same hex
                if (!shouldRelease && player.CurrentLat != null && player.CurrentLng != null && room.State.HasMapLocation)
                {
                    var heldHex = HexService.LatLngToHexForRoom(player.CurrentLat.Value, player.CurrentLng!.Value,
                        room.State.MapLat!.Value, room.State.MapLng!.Value, room.State.TileSizeMeters);
                    var rescuers = GameplayService.GetPlayersInHex(room.State, heldHex.q, heldHex.r)
                        .Where(p => p.Id != player.Id && p.AllianceId != null && p.AllianceId == player.AllianceId);
                    if (rescuers.Any())
                        shouldRelease = true;
                }

                if (shouldRelease)
                {
                    player.HeldByPlayerId = null;
                    player.HeldUntil = null;
                    AppendEventLog(room.State, new GameEventLogEntry
                    {
                        Type = "HostageReleased",
                        Message = $"{player.Name} has been released!",
                        PlayerId = player.Id,
                        PlayerName = player.Name
                    });
                }
            }
        }
    }

    // Phase 10: Duel expiry cleanup
    public void ProcessDuelExpiry(GameRoom room)
    {
        lock (room.SyncRoot)
        {
            var now = DateTime.UtcNow;
            var expired = room.PendingDuels.Where(kv => now > kv.Value.ExpiresAt).Select(kv => kv.Key).ToList();
            foreach (var id in expired)
                room.PendingDuels.Remove(id);
        }
    }
}
