using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;

namespace Landgrab.Tests.TestSupport;

/// <summary>
/// A SignalR + HTTP client for driving E2E gameplay tests against a live Landgrab server.
/// Works against both localhost and production deployments.
/// </summary>
public sealed class SignalRGameClient : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly string _baseUrl;
    private readonly HttpClient _http;
    private HubConnection? _connection;

    public string? Token { get; private set; }
    public string? UserId { get; private set; }
    public string? Username { get; private set; }
    public string? RoomCode { get; private set; }
    public GameState? LastState { get; private set; }

    // Latest events received
    public CombatResult? LastCombatResult { get; private set; }
    public JsonElement? LastGameOver { get; private set; }
    public JsonElement? LastError { get; private set; }

    // Waiters for async events
    private TaskCompletionSource<GameState>? _stateWaiter;
    private TaskCompletionSource<JsonElement>? _errorWaiter;

    public SignalRGameClient(string baseUrl)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _http = new HttpClient { BaseAddress = new Uri(_baseUrl) };
    }

    public async Task RegisterAsync(string username, string password)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/register", new
        {
            username,
            email = $"{username}@e2etest.local",
            password
        });

        if (!response.IsSuccessStatusCode)
        {
            // If registration fails (user exists), try login
            await LoginAsync(username, password);
            return;
        }

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Token = body.GetProperty("token").GetString()!;
        UserId = body.GetProperty("userId").GetString()!;
        Username = body.GetProperty("username").GetString()!;
        _http.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", Token);
    }

    public async Task LoginAsync(string usernameOrEmail, string password)
    {
        var response = await _http.PostAsJsonAsync("/api/auth/login", new
        {
            usernameOrEmail,
            password
        });

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Token = body.GetProperty("token").GetString()!;
        UserId = body.GetProperty("userId").GetString()!;
        Username = body.GetProperty("username").GetString()!;
        _http.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", Token);
    }

    public async Task ConnectAsync()
    {
        if (string.IsNullOrEmpty(Token))
            throw new InvalidOperationException("Must register or login before connecting.");

        _connection = new HubConnectionBuilder()
            .WithUrl($"{_baseUrl}/hub/game?access_token={Token}")
            .AddJsonProtocol(options =>
            {
                options.PayloadSerializerOptions.PropertyNameCaseInsensitive = true;
                options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            })
            .Build();

        RegisterEventHandlers();
        await _connection.StartAsync();
    }

    private void RegisterEventHandlers()
    {
        _connection!.On<JsonElement>("StateUpdated", state =>
        {
            var parsed = state.Deserialize<GameState>(JsonOptions);
            if (parsed != null)
            {
                LastState = parsed;
                _stateWaiter?.TrySetResult(parsed);
            }
        });

        _connection.On<string, JsonElement>("RoomCreated", (roomCode, state) =>
        {
            RoomCode = roomCode;
            var parsed = state.Deserialize<GameState>(JsonOptions);
            if (parsed != null)
            {
                LastState = parsed;
                _stateWaiter?.TrySetResult(parsed);
            }
        });

        _connection.On<JsonElement>("GameStarted", state =>
        {
            var parsed = state.Deserialize<GameState>(JsonOptions);
            if (parsed != null)
            {
                LastState = parsed;
                _stateWaiter?.TrySetResult(parsed);
            }
        });

        _connection.On<JsonElement>("GameOver", data =>
        {
            LastGameOver = data;
        });

        _connection.On<JsonElement>("CombatResult", data =>
        {
            LastCombatResult = data.Deserialize<CombatResult>(JsonOptions);
        });

        _connection.On<JsonElement>("Error", data =>
        {
            LastError = data;
            _errorWaiter?.TrySetResult(data);
        });

        _connection.On<JsonElement>("PlayersMoved", _ => { });
        _connection.On<JsonElement>("NeutralClaimResult", _ => { });
        _connection.On<JsonElement>("TileLost", _ => { });
        _connection.On<JsonElement>("PlayerJoined", state =>
        {
            var parsed = state.Deserialize<GameState>(JsonOptions);
            if (parsed != null)
            {
                LastState = parsed;
                _stateWaiter?.TrySetResult(parsed);
            }
        });
    }

    // ── Waiting helpers ──

    private async Task<GameState> WaitForStateAsync(TimeSpan? timeout = null)
    {
        _stateWaiter = new TaskCompletionSource<GameState>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var cts = new CancellationTokenSource(timeout ?? TimeSpan.FromSeconds(10));
        await using var registration = cts.Token.Register(() =>
            _stateWaiter.TrySetException(new TimeoutException("Timed out waiting for StateUpdated")));
        return await _stateWaiter.Task;
    }

    // ── Lobby Methods ──

    public async Task<GameState> CreateRoomAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("CreateRoom");
        return await waiter;
    }

    public async Task<GameState> JoinRoomAsync(string roomCode)
    {
        RoomCode = roomCode;
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("JoinRoom", roomCode);
        return await waiter;
    }

    public async Task<GameState> SetMapLocationAsync(double lat, double lng)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("SetMapLocation", lat, lng);
        return await waiter;
    }

    public async Task<GameState> SetWinConditionAsync(string type, int value)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("SetWinCondition", type, value);
        return await waiter;
    }

    public async Task<GameState> SetGameDynamicsAsync(GameDynamics dynamics)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("SetGameDynamics", dynamics);
        return await waiter;
    }

    public async Task<GameState> StartGameAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("StartGame");
        return await waiter;
    }

    public async Task<GameState> SetPlayerRoleAsync(string role)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("SetPlayerRole", role);
        return await waiter;
    }

    // ── Gameplay Methods ──

    public async Task UpdatePlayerLocationAsync(double lat, double lng, double? heading = null)
    {
        await _connection!.InvokeAsync("UpdatePlayerLocation", lat, lng, heading);
        // UpdatePlayerLocation sends PlayersMoved (lightweight), not StateUpdated
        // Add a small delay for the server to process
        await Task.Delay(100);
    }

    public async Task<GameState> PickUpTroopsAsync(int q, int r, int count, double playerLat, double playerLng)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("PickUpTroops", q, r, count, playerLat, playerLng);
        return await waiter;
    }

    public async Task<GameState> PlaceTroopsAsync(int q, int r, double playerLat, double playerLng, int? troopCount = null)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("PlaceTroops", q, r, playerLat, playerLng, troopCount);
        return await waiter;
    }

    // ── Ability Methods ──

    public async Task<GameState> ActivateBeaconAsync(double heading)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("ActivateBeacon", heading);
        return await waiter;
    }

    public async Task<GameState> DeactivateBeaconAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("DeactivateBeacon");
        return await waiter;
    }

    public async Task<JsonElement?> ResolveTacticalStrikeTargetAsync(double heading)
    {
        return await _connection!.InvokeAsync<JsonElement?>("ResolveTacticalStrikeTarget", heading);
    }

    public async Task<GameState> ActivateTacticalStrikeAsync(int targetQ, int targetR)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("ActivateTacticalStrike", targetQ, targetR);
        return await waiter;
    }

    public async Task<GameState> ActivateCommandoRaidAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("ActivateCommandoRaid");
        return await waiter;
    }

    public async Task<GameState> ActivateRallyPointAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("ActivateRallyPoint");
        return await waiter;
    }

    public async Task<GameState> ActivateSabotageAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("ActivateSabotage");
        return await waiter;
    }

    public async Task<GameState> CancelSabotageAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("CancelSabotage");
        return await waiter;
    }

    public async Task<GameState> StartFortConstructionAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("StartFortConstruction");
        return await waiter;
    }

    public async Task<GameState> CancelFortConstructionAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("CancelFortConstruction");
        return await waiter;
    }

    public async Task<GameState> StartDemolishAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("StartDemolish");
        return await waiter;
    }

    public async Task<GameState> CancelDemolishAsync()
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("CancelDemolish");
        return await waiter;
    }

    public async Task<JsonElement?> ResolveTroopTransferTargetAsync(double heading)
    {
        return await _connection!.InvokeAsync<JsonElement?>("ResolveTroopTransferTarget", heading);
    }

    public async Task<JsonElement?> InitiateTroopTransferAsync(int amount, string recipientId)
    {
        return await _connection!.InvokeAsync<JsonElement?>("InitiateTroopTransfer", amount, recipientId);
    }

    public async Task<GameState> RespondToTroopTransferAsync(string transferId, bool accepted)
    {
        var waiter = WaitForStateAsync();
        await _connection!.InvokeAsync("RespondToTroopTransfer", transferId, accepted);
        return await waiter;
    }

    public async Task<JsonElement?> InitiateFieldBattleAsync()
    {
        return await _connection!.InvokeAsync<JsonElement?>("InitiateFieldBattle");
    }

    public async Task JoinFieldBattleAsync(string battleId)
    {
        await _connection!.InvokeAsync("JoinFieldBattle", battleId);
    }

    public async Task<JsonElement?> AttemptInterceptAsync(double heading)
    {
        return await _connection!.InvokeAsync<JsonElement?>("AttemptIntercept", heading);
    }

    public async Task<CombatPreviewDto?> GetCombatPreviewAsync(int q, int r)
    {
        return await _connection!.InvokeAsync<CombatPreviewDto?>("GetCombatPreview", q, r);
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection != null)
        {
            await _connection.DisposeAsync();
        }
        _http.Dispose();
    }
}
