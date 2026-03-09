using System.Collections.Concurrent;
using Landgrab.Api.Models;

namespace Landgrab.Api.Services;

public class GameService
{
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();

    private static readonly string[] Colors =
        ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"];

    private static readonly string[] AllianceColors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"];

    // ─── Room management ────────────────────────────────────────────────────

    public GameRoom CreateRoom(string hostUserId, string hostUsername, string connectionId)
    {
        var code = GenerateCode();
        var room = new GameRoom
        {
            Code = code,
            HostUserId = Guid.Parse(hostUserId)
        };
        room.ConnectionMap.TryAdd(connectionId, hostUserId);

        var player = new PlayerDto
        {
            Id = hostUserId,
            Name = hostUsername,
            Color = Colors[0],
            IsHost = true
        };
        room.State.RoomCode = code;
        room.State.Players.Add(player);

        _rooms[code] = room;
        return room;
    }

    public (GameRoom? room, string? error) JoinRoom(string roomCode, string userId,
        string username, string connectionId)
    {
        if (!_rooms.TryGetValue(roomCode.ToUpper(), out var room))
            return (null, "Room not found.");

        if (room.State.Phase != GamePhase.Lobby)
            return (null, "Game already in progress.");

        if (room.State.Players.Count >= 4)
            return (null, "Room is full (max 4 players).");

        if (room.State.Players.Any(p => p.Id == userId))
        {
            // Rejoin — remove all stale connections for this user, then add the new one
            var staleConnections = room.ConnectionMap
                .Where(kv => kv.Value == userId)
                .Select(kv => kv.Key)
                .ToList();
            foreach (var stale in staleConnections)
                room.ConnectionMap.TryRemove(stale, out _);
            room.ConnectionMap.TryAdd(connectionId, userId);
            var existing = room.State.Players.First(p => p.Id == userId);
            existing.IsConnected = true;
            return (room, null);
        }

        var colorIndex = room.State.Players.Count % Colors.Length;
        room.State.Players.Add(new PlayerDto
        {
            Id = userId,
            Name = username,
            Color = Colors[colorIndex]
        });
        room.ConnectionMap.TryAdd(connectionId, userId);
        return (room, null);
    }

    public GameRoom? GetRoom(string code) =>
        _rooms.TryGetValue(code.ToUpper(), out var r) ? r : null;

    public GameRoom? GetRoomByConnection(string connectionId) =>
        _rooms.Values.FirstOrDefault(r => r.ConnectionMap.ContainsKey(connectionId));

    public void RemoveConnection(GameRoom room, string connectionId)
    {
        if (room.ConnectionMap.TryRemove(connectionId, out var userId))
        {
            // Mark player disconnected only if they have no remaining connections
            if (!room.ConnectionMap.Values.Contains(userId))
            {
                var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
                if (player != null) player.IsConnected = false;
            }
        }
    }

    // ─── Alliance setup ──────────────────────────────────────────────────────

    public (GameState? state, string? error) SetAlliance(string roomCode, string userId,
        string allianceName)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");

        var player = room.State.Players.FirstOrDefault(p => p.Id == userId);
        if (player == null) return (null, "Player not in room.");

        var alliance = room.State.Alliances.FirstOrDefault(a =>
            a.Name.Equals(allianceName, StringComparison.OrdinalIgnoreCase));

        if (alliance == null)
        {
            if (room.State.Alliances.Count >= 4)
                return (null, "Max 4 alliances per game.");

            alliance = new AllianceDto
            {
                Id = Guid.NewGuid().ToString(),
                Name = allianceName,
                Color = AllianceColors[room.State.Alliances.Count % AllianceColors.Length]
            };
            room.State.Alliances.Add(alliance);
        }

        // Remove from previous alliance
        foreach (var a in room.State.Alliances)
            a.MemberIds.Remove(userId);

        alliance.MemberIds.Add(userId);
        player.AllianceId = alliance.Id;
        player.AllianceName = alliance.Name;
        player.AllianceColor = alliance.Color;
        player.Color = alliance.Color;

        RefreshAllianceCounts(room.State);
        return (room.State, null);
    }

    // ─── Map location ────────────────────────────────────────────────────────

    public (GameState? state, string? error) SetMapLocation(string roomCode, string userId,
        double lat, double lng)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");
        if (room.HostUserId.ToString() != userId) return (null, "Only the host can set the map location.");

        if (!double.IsFinite(lat) || lat < -90 || lat > 90)
            return (null, "Latitude must be a finite number between -90 and 90.");
        if (!double.IsFinite(lng) || lng < -180 || lng > 180)
            return (null, "Longitude must be a finite number between -180 and 180.");

        room.State.MapLat = lat;
        room.State.MapLng = lng;
        return (room.State, null);
    }

    // ─── Game start ──────────────────────────────────────────────────────────

    public (GameState? state, string? error) StartGame(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");
        if (room.HostUserId.ToString() != userId) return (null, "Only the host can start the game.");
        if (room.State.Players.Count < 2) return (null, "Need at least 2 players.");
        if (room.State.Phase != GamePhase.Lobby) return (null, "Game already started.");
        if (!room.State.HasMapLocation)
            return (null, "Map location must be set before starting the game.");

        var state = room.State;
        state.Grid = HexService.BuildGrid(state.GridRadius);
        state.Phase = GamePhase.Reinforce;
        state.CurrentPlayerIndex = 0;

        // Give each player 3 starting troops to place
        foreach (var p in state.Players)
            p.TroopsToPlace = 3;

        return (state, null);
    }

    // ─── Reinforce phase ─────────────────────────────────────────────────────

    public (GameState? state, string? error) PlaceReinforcement(string roomCode, string userId,
        int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");
        var state = room.State;

        if (state.Phase != GamePhase.Reinforce) return (null, "Not in reinforce phase.");

        var player = GetCurrentPlayer(state);
        if (player.Id != userId) return (null, "Not your turn.");
        if (player.TroopsToPlace <= 0) return (null, "No troops to place.");

        var key = HexService.Key(q, r);
        if (!state.Grid.TryGetValue(key, out var cell)) return (null, "Invalid hex.");

        if (state.TurnNumber == 0)
        {
            // Initial placement: must be empty
            if (cell.OwnerId != null) return (null, "Hex already occupied.");
        }
        else
        {
            // Subsequent reinforce: must be your own hex
            if (cell.OwnerId != userId) return (null, "Can only reinforce your own territory.");
        }

        if (state.TurnNumber == 0)
        {
            cell.OwnerId = player.Id;
            cell.OwnerAllianceId = player.AllianceId;
            cell.OwnerName = player.Name;
            cell.OwnerColor = player.AllianceColor ?? player.Color;
        }
        cell.Troops++;
        player.TroopsToPlace--;

        if (player.TroopsToPlace == 0)
            AdvanceReinforce(state);

        RefreshTerritoryCount(state);
        return (state, null);
    }

    private static void AdvanceReinforce(GameState state)
    {
        // During initial placement, cycle all players
        if (state.TurnNumber == 0)
        {
            var nextIndex = state.CurrentPlayerIndex + 1;
            if (nextIndex < state.Players.Count)
            {
                state.CurrentPlayerIndex = nextIndex;
                state.Players[nextIndex].TroopsToPlace = 3;
            }
            else
            {
                // All players have placed initial troops → start the game
                state.TurnNumber = 1;
                state.CurrentPlayerIndex = 0;
                state.Phase = GamePhase.Roll;
            }
        }
        else
        {
            state.Phase = GamePhase.Roll;
        }
    }

    // ─── Roll dice ───────────────────────────────────────────────────────────

    public (GameState? state, string? error) RollDice(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");
        var state = room.State;

        if (state.Phase != GamePhase.Roll) return (null, "Not in roll phase.");

        var player = GetCurrentPlayer(state);
        if (player.Id != userId) return (null, "Not your turn.");

        var rng = Random.Shared;
        var d1 = rng.Next(1, 7);
        var d2 = rng.Next(1, 7);
        state.LastDiceRoll = [d1, d2];
        state.MovesRemaining = d1 + d2;
        state.Phase = GamePhase.Claim;

        return (state, null);
    }

    // ─── Claim empty hex ────────────────────────────────────────────────────

    public (GameState? state, string? error) ClaimHex(string roomCode, string userId, int q, int r)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");
        var state = room.State;

        if (state.Phase != GamePhase.Claim) return (null, "Not in claim phase.");
        if (state.MovesRemaining <= 0) return (null, "No moves remaining.");

        var player = GetCurrentPlayer(state);
        if (player.Id != userId) return (null, "Not your turn.");

        var key = HexService.Key(q, r);
        if (!state.Grid.TryGetValue(key, out var cell)) return (null, "Invalid hex.");
        if (cell.OwnerId != null) return (null, "Hex already occupied. Use attack instead.");

        // Must be adjacent to own territory (after first placement)
        if (player.TerritoryCount > 0 &&
            !HexService.IsAdjacentToOwned(state.Grid, q, r, userId, player.AllianceId))
            return (null, "Hex must be adjacent to your territory.");

        cell.OwnerId = player.Id;
        cell.OwnerAllianceId = player.AllianceId;
        cell.OwnerName = player.Name;
        cell.OwnerColor = player.AllianceColor ?? player.Color;
        cell.Troops = 1;
        state.MovesRemaining--;

        RefreshTerritoryCount(state);
        CheckWinCondition(state);

        if (state.MovesRemaining == 0 && state.Phase == GamePhase.Claim)
            EndTurn(state);

        return (state, null);
    }

    // ─── Attack occupied hex ────────────────────────────────────────────────

    public (CombatResult? result, string? error) AttackHex(string roomCode, string userId,
        int fromQ, int fromR, int toQ, int toR)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");
        var state = room.State;

        if (state.Phase != GamePhase.Claim) return (null, "Not in attack phase.");
        if (state.MovesRemaining <= 0) return (null, "No moves remaining.");

        var attacker = GetCurrentPlayer(state);
        if (attacker.Id != userId) return (null, "Not your turn.");

        if (!state.Grid.TryGetValue(HexService.Key(fromQ, fromR), out var fromCell))
            return (null, "Invalid source hex.");
        if (!state.Grid.TryGetValue(HexService.Key(toQ, toR), out var toCell))
            return (null, "Invalid target hex.");

        if (fromCell.OwnerId != userId) return (null, "You don't own the source hex.");
        if (toCell.OwnerId == null) return (null, "Target hex is empty. Use claim instead.");
        if (toCell.OwnerId == userId) return (null, "Cannot attack your own territory.");

        // Alliance friendly-fire check
        if (attacker.AllianceId != null && toCell.OwnerAllianceId == attacker.AllianceId)
            return (null, "Cannot attack an ally.");

        if (!HexService.AreAdjacent(fromQ, fromR, toQ, toR))
            return (null, "Hexes are not adjacent.");

        if (fromCell.Troops < 2) return (null, "Need at least 2 troops to attack.");

        // Resolve combat
        var result = ResolveCombat(state, attacker, fromCell, toCell);

        RefreshTerritoryCount(state);
        CheckWinCondition(state);

        if (state.MovesRemaining <= 0 && state.Phase == GamePhase.Claim)
            EndTurn(state);

        return (result, null);
    }

    private static CombatResult ResolveCombat(GameState state, PlayerDto attacker,
        HexCell from, HexCell to)
    {
        var rng = Random.Shared;

        // Attacker: up to 3 dice, must leave 1 troop behind
        var numAttackDice = Math.Min(3, from.Troops - 1);
        var attackDice = Enumerable.Range(0, numAttackDice)
            .Select(_ => rng.Next(1, 7))
            .OrderDescending().ToArray();

        // Defender: up to 2 dice; +1 die if has ally support
        var defenderAllianceId = to.OwnerAllianceId;
        var allyBonus = HexService.CountAllyBorderHexes(state.Grid, to.Q, to.R,
            to.OwnerId!, defenderAllianceId) > 0 ? 1 : 0;
        var numDefendDice = Math.Min(2 + allyBonus, to.Troops);
        var defendDice = Enumerable.Range(0, numDefendDice)
            .Select(_ => rng.Next(1, 7))
            .OrderDescending().ToArray();

        int attackerLost = 0, defenderLost = 0;
        var pairs = Math.Min(attackDice.Length, defendDice.Length);
        for (var i = 0; i < pairs; i++)
        {
            if (attackDice[i] > defendDice[i])
                defenderLost++;
            else
                attackerLost++; // ties → defender wins
        }

        from.Troops -= attackerLost;
        to.Troops -= defenderLost;

        var hexCaptured = to.Troops <= 0;
        if (hexCaptured)
        {
            // Move at least numAttackDice (min 1) troops, but leave at least 1 behind in source hex
            var troopsMoved = Math.Min(Math.Max(numAttackDice, 1), Math.Max(1, from.Troops - 1));
            from.Troops = Math.Max(1, from.Troops - troopsMoved);
            to.OwnerId = attacker.Id;
            to.OwnerAllianceId = attacker.AllianceId;
            to.OwnerName = attacker.Name;
            to.OwnerColor = attacker.AllianceColor ?? attacker.Color;
            to.Troops = troopsMoved;
            state.MovesRemaining--;
        }

        return new CombatResult
        {
            AttackDice = attackDice,
            DefendDice = defendDice,
            AttackerWon = hexCaptured,
            AttackerLost = attackerLost,
            DefenderLost = defenderLost,
            HexCaptured = hexCaptured,
            NewState = state
        };
    }

    // ─── End turn ────────────────────────────────────────────────────────────

    public (GameState? state, string? error) EndTurn(string roomCode, string userId)
    {
        var room = GetRoom(roomCode);
        if (room == null) return (null, "Room not found.");
        var state = room.State;

        if (state.Phase != GamePhase.Claim) return (null, "Not in claim/attack phase.");

        var player = GetCurrentPlayer(state);
        if (player.Id != userId) return (null, "Not your turn.");

        EndTurn(state);
        return (state, null);
    }

    private static void EndTurn(GameState state)
    {
        // Move to next player
        state.CurrentPlayerIndex = (state.CurrentPlayerIndex + 1) % state.Players.Count;
        state.MovesRemaining = 0;
        state.LastDiceRoll = [];

        // Give reinforcements at start of each turn
        var nextPlayer = GetCurrentPlayer(state);
        var territoryCount = HexService.TerritoryCount(state.Grid, nextPlayer.Id);
        nextPlayer.TroopsToPlace = Math.Max(3, territoryCount / 3);
        state.TurnNumber++;
        state.Phase = GamePhase.Reinforce;
    }

    // ─── Win condition ───────────────────────────────────────────────────────

    private static void CheckWinCondition(GameState state)
    {
        var totalHexes = state.Grid.Count;
        var claimedHexes = state.Grid.Values.Count(c => c.OwnerId != null);

        // Alliance mode: one alliance controls ≥ 60%
        if (state.GameMode == GameMode.Alliances && state.Alliances.Count > 0)
        {
            foreach (var alliance in state.Alliances)
            {
                var count = HexService.AllianceTerritoryCount(state.Grid, alliance.Id);
                if (count >= totalHexes * 0.6)
                {
                    state.Phase = GamePhase.GameOver;
                    state.WinnerId = alliance.Id;
                    state.WinnerName = alliance.Name;
                    state.IsAllianceVictory = true;
                    return;
                }
            }
        }

        // All hexes claimed → most territory wins
        if (claimedHexes >= totalHexes)
        {
            state.Phase = GamePhase.GameOver;
            state.IsAllianceVictory = state.GameMode == GameMode.Alliances && state.Alliances.Count > 0;

            if (state.IsAllianceVictory)
            {
                var winner = state.Alliances
                    .OrderByDescending(a => HexService.AllianceTerritoryCount(state.Grid, a.Id))
                    .First();
                state.WinnerId = winner.Id;
                state.WinnerName = winner.Name;
            }
            else
            {
                var winner = state.Players
                    .OrderByDescending(p => p.TerritoryCount)
                    .First();
                state.WinnerId = winner.Id;
                state.WinnerName = winner.Name;
            }
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private static PlayerDto GetCurrentPlayer(GameState state) =>
        state.Players[state.CurrentPlayerIndex % state.Players.Count];

    private static void RefreshTerritoryCount(GameState state)
    {
        foreach (var p in state.Players)
            p.TerritoryCount = HexService.TerritoryCount(state.Grid, p.Id);

        foreach (var a in state.Alliances)
            a.TerritoryCount = HexService.AllianceTerritoryCount(state.Grid, a.Id);
    }

    private static void RefreshAllianceCounts(GameState state) =>
        RefreshTerritoryCount(state);

    private static string GenerateCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        return new string(Enumerable.Range(0, 6)
            .Select(_ => chars[Random.Shared.Next(chars.Length)]).ToArray());
    }
}
