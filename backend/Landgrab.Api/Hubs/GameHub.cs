using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Landgrab.Api.Models;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Landgrab.Api.Hubs;

[Authorize]
public partial class GameHub : Hub
{
    private readonly GameService gameService;
    private readonly GlobalMapService globalMap;
    private readonly TerrainFetchService terrainFetchService;
    private readonly IServiceScopeFactory scopeFactory;
    private readonly ILogger<GameHub> logger;

    private const string InvalidRequestCode = "INVALID_INPUT";
    private const int MaxCoordinateValue = 1000;
    private const int MaxRoomCodeLength = 10;
    private const int MaxAllianceNameLength = 50;
    private const int MaxAllianceNamesCount = 20;
    private const int MaxHostMessageLength = 500;
    private const int MaxIdentifierLength = 100;
    private const int MaxShortStringLength = 50;
    private const int MaxTemplateNameLength = 100;
    private const int MaxDescriptionLength = 500;
    private const int MaxCustomAreaCoordinates = 500;
    private const int MaxModesCount = 20;
    private const int MaxTargetAllianceIdsCount = 20;
    private const string CustomCopresencePreset = "Aangepast";
    private static readonly ConcurrentDictionary<string, DateTime> _lastLocationUpdate = new();
    private static readonly TimeSpan UpdatePlayerLocationInterval = TimeSpan.FromMilliseconds(500);
    private static readonly HashSet<string> AllowedHostEventTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "Calamity",
        "Epidemic",
        "BonusTroops",
        "RushHour"
    };

    public GameHub(
        GameService gameService,
        GlobalMapService globalMap,
        TerrainFetchService terrainFetchService,
        IServiceScopeFactory scopeFactory,
        ILogger<GameHub> logger)
    {
        this.gameService = gameService;
        this.globalMap = globalMap;
        this.terrainFetchService = terrainFetchService;
        this.scopeFactory = scopeFactory;
        this.logger = logger;
    }

    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("Client connected: {ConnectionId} User: {User}",
            Context.ConnectionId, UserId);
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _lastLocationUpdate.TryRemove(Context.ConnectionId, out _);

        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        if (room != null)
        {
            gameService.RemoveConnection(room, Context.ConnectionId);
            var state = gameService.GetStateSnapshot(room.Code);
            if (state != null)
            {
                await BroadcastState(room.Code, state);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    private async Task BroadcastState(string roomCode, GameState state, string? aliasEvent = null)
    {
        if (!string.IsNullOrWhiteSpace(aliasEvent))
        {
            await Clients.Group(roomCode).SendAsync(aliasEvent, state);
        }

        // Phase 7: Fog of War — per-player filtered broadcasts during gameplay
        if (state.Dynamics.FogOfWarEnabled && state.Phase == GamePhase.Playing)
        {
            var room = gameService.GetRoom(roomCode);
            if (room != null)
            {
                var hostObserverUserId = state.HostObserverMode
                    ? room.HostUserId.ToString()
                    : null;
                var hiddenFogCells = gameService.CreateHiddenFogCellsForBroadcast(state);

                foreach (var (connectionId, userId) in room.ConnectionMap)
                {
                    var playerSnapshot = hostObserverUserId == userId
                        ? state
                        : gameService.GetPlayerSnapshot(state, userId, hiddenFogCells);
                    await Clients.Client(connectionId).SendAsync("StateUpdated", playerSnapshot);
                }

                return;
            }
        }

        await Clients.Group(roomCode).SendAsync("StateUpdated", state);
        if (state.Phase == GamePhase.GameOver)
        {
            await Clients.Group(roomCode).SendAsync("GameOver", new
            {
                state.WinnerId,
                state.WinnerName,
                state.IsAllianceVictory
            });
        }
    }

    private async Task SendStateToCaller(GameState state)
    {
        await Clients.Caller.SendAsync("StateUpdated", state);
        if (state.Phase == GamePhase.GameOver)
        {
            await Clients.Caller.SendAsync("GameOver", new
            {
                state.WinnerId,
                state.WinnerName,
                state.IsAllianceVictory
            });
        }
    }

    private static bool ValidateStringLength(string? value, int maxLength) =>
        value is not null && value.Length <= maxLength;

    private static bool ValidateCoordRange(int q, int r) =>
        Math.Abs(q) <= MaxCoordinateValue && Math.Abs(r) <= MaxCoordinateValue;

    private static bool ValidateLatLng(double lat, double lng) =>
        double.IsFinite(lat) &&
        double.IsFinite(lng) &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180;

    private static bool ValidateRoomCode(string? roomCode) =>
        !string.IsNullOrWhiteSpace(roomCode) && ValidateStringLength(roomCode, MaxRoomCodeLength);

    private static bool ValidateIdentifier(string? value) =>
        !string.IsNullOrWhiteSpace(value) && ValidateStringLength(value, MaxIdentifierLength);

    private static bool ValidateEnumString<TEnum>(string? value) where TEnum : struct, Enum =>
        !string.IsNullOrWhiteSpace(value) &&
        ValidateStringLength(value, MaxShortStringLength) &&
        Enum.TryParse<TEnum>(value, true, out _);

    private static bool ValidateCopresencePreset(string? preset) =>
        !string.IsNullOrWhiteSpace(preset) &&
        ValidateStringLength(preset, MaxShortStringLength) &&
        (string.Equals(preset, CustomCopresencePreset, StringComparison.Ordinal) || LobbyService.CopresencePresets.ContainsKey(preset));

    private static bool ValidateHostEventType(string? eventType) =>
        !string.IsNullOrWhiteSpace(eventType) &&
        ValidateStringLength(eventType, MaxIdentifierLength) &&
        AllowedHostEventTypes.Contains(eventType);

    private static bool ValidateGameDynamics(GameDynamics? dynamics)
    {
        if (dynamics == null || dynamics.ActiveCopresenceModes == null)
        {
            return false;
        }

        if (dynamics.CopresencePreset != null && !ValidateCopresencePreset(dynamics.CopresencePreset))
        {
            return false;
        }

        if (dynamics.ActiveCopresenceModes.Count > MaxModesCount)
        {
            return false;
        }

        return dynamics.ActiveCopresenceModes.All(mode =>
            Enum.IsDefined(mode) &&
            mode != CopresenceMode.None);
    }

    private string UserId => Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? Context.User?.FindFirstValue(JwtRegisteredClaimNames.Sub)
        ?? throw new HubException("Not authenticated.");

    private string Username => Context.User?.FindFirstValue(ClaimTypes.Name)
        ?? Context.User?.FindFirstValue("unique_name")
        ?? "Unknown";

    private Task SendError(string message) =>
        SendError("GENERAL", message);

    private Task SendError(string code, string message) =>
        Clients.Caller.SendAsync("Error", new HubErrorDto
        {
            Code = code,
            Message = message
        });

    private static string MapErrorCode(string message)
    {
        var normalized = message.ToLowerInvariant();
        if (normalized.Contains("room not found"))
        {
            return "ROOM_NOT_FOUND";
        }

        if (normalized.Contains("room is full"))
        {
            return "ROOM_FULL";
        }

        if (normalized.Contains("not in a room"))
        {
            return "ROOM_NOT_JOINED";
        }

        if (normalized.Contains("already"))
        {
            return "ROOM_ALREADY_JOINED";
        }

        if (normalized.Contains("host"))
        {
            return "HOST_REQUIRED";
        }

        return "GENERAL";
    }
}
