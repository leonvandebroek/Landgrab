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
    private readonly DerivedMapStateService derivedMapStateService;
    private readonly VisibilityService visibilityService;
    private readonly VisibilityBroadcastHelper visibilityBroadcastHelper;
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
    private const int MaxTargetAllianceIdsCount = 20;
    private static readonly ConcurrentDictionary<string, DateTime> _lastLocationUpdate = new();
    private static readonly TimeSpan UpdatePlayerLocationInterval = TimeSpan.FromMilliseconds(500);
    private static readonly HashSet<string> RemovedPlayerRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "Saboteur"
    };

    public GameHub(
        GameService gameService,
        GlobalMapService globalMap,
        DerivedMapStateService derivedMapStateService,
        VisibilityService visibilityService,
        VisibilityBroadcastHelper visibilityBroadcastHelper,
        IServiceScopeFactory scopeFactory,
        ILogger<GameHub> logger)
    {
        this.gameService = gameService;
        this.globalMap = globalMap;
        this.derivedMapStateService = derivedMapStateService;
        this.visibilityService = visibilityService;
        this.visibilityBroadcastHelper = visibilityBroadcastHelper;
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
        var room = gameService.GetRoom(roomCode);
        if (room is null)
        {
            var sharedState = GameStateCommon.SnapshotState(state);
            derivedMapStateService.ComputeAndAttach(sharedState);
            if (!string.IsNullOrWhiteSpace(aliasEvent))
            {
                await Clients.Group(roomCode).SendAsync(aliasEvent, sharedState);
            }

            await Clients.Group(roomCode).SendAsync("StateUpdated", sharedState);
            if (sharedState.Phase == GamePhase.GameOver)
            {
                await Clients.Group(roomCode).SendAsync("GameOver", new
                {
                    sharedState.WinnerId,
                    sharedState.WinnerName,
                    sharedState.IsAllianceVictory
                });
            }

            return;
        }

        await visibilityBroadcastHelper.BroadcastPerViewer(
            room,
            state,
            Clients.Group(roomCode),
            connectionId => Clients.Client(connectionId),
            derivedMapStateService,
            aliasEvent);
    }

    private async Task SendStateToCaller(GameState state)
    {
        var room = gameService.GetRoomByConnection(Context.ConnectionId);
        GameState callerState;

        if (room is not null)
        {
            callerState = visibilityBroadcastHelper.CreateStateForViewer(
                room,
                state,
                UserId,
                derivedMapStateService);
        }
        else
        {
            callerState = GameStateCommon.SnapshotState(state);
            derivedMapStateService.ComputeAndAttach(callerState);
        }

        await Clients.Caller.SendAsync("StateUpdated", callerState);
        if (callerState.Phase == GamePhase.GameOver)
        {
            await Clients.Caller.SendAsync("GameOver", new
            {
                callerState.WinnerId,
                callerState.WinnerName,
                callerState.IsAllianceVictory
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

    private static bool ValidateHeading(double heading) =>
        double.IsFinite(heading);

    private static bool ValidateRoomCode(string? roomCode) =>
        !string.IsNullOrWhiteSpace(roomCode) && ValidateStringLength(roomCode, MaxRoomCodeLength);

    private static bool ValidateIdentifier(string? value) =>
        !string.IsNullOrWhiteSpace(value) && ValidateStringLength(value, MaxIdentifierLength);

    private static bool ValidateEnumString<TEnum>(string? value) where TEnum : struct, Enum =>
        !string.IsNullOrWhiteSpace(value) &&
        ValidateStringLength(value, MaxShortStringLength) &&
        Enum.TryParse<TEnum>(value, true, out _);

    private static bool ValidateGameDynamics(GameDynamics? dynamics) => dynamics != null;

    private static bool IsSupportedPlayerRole(string? role) =>
        ValidateEnumString<PlayerRole>(role) && !RemovedPlayerRoles.Contains(role!);

    private static GameDynamics SanitizeGameDynamics(GameDynamics dynamics)
    {
        return new GameDynamics
        {
            BeaconEnabled = dynamics.BeaconEnabled,
            BeaconSectorAngle = Math.Clamp(dynamics.BeaconSectorAngle, 1, 360),
            TileDecayEnabled = dynamics.TileDecayEnabled,
            CombatMode = Enum.IsDefined(dynamics.CombatMode) ? dynamics.CombatMode : CombatMode.Balanced,
            PlayerRolesEnabled = dynamics.PlayerRolesEnabled,
            HQEnabled = dynamics.HQEnabled,
            HQAutoAssign = dynamics.HQAutoAssign,
            EnemySightingMemorySeconds = Math.Max(0, dynamics.EnemySightingMemorySeconds),
        };
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
