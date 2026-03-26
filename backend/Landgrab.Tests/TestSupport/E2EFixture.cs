namespace Landgrab.Tests.TestSupport;

/// <summary>
/// Shared fixture for E2E tests. Provides the base URL from environment variable
/// LANDGRAB_BASE_URL (defaults to http://localhost:5001).
/// </summary>
public sealed class E2EFixture
{
    public string BaseUrl { get; }

    public E2EFixture()
    {
        BaseUrl = Environment.GetEnvironmentVariable("LANDGRAB_BASE_URL")
                  ?? "http://localhost:5001";
    }

    /// <summary>
    /// Creates a new SignalR client pointed at the configured server.
    /// </summary>
    public SignalRGameClient CreateClient() => new(BaseUrl);

    /// <summary>
    /// Creates a client, registers a unique test user, and connects.
    /// </summary>
    public async Task<SignalRGameClient> CreateConnectedClientAsync(string? namePrefix = null)
    {
        var client = CreateClient();
        var uniqueName = $"{namePrefix ?? "e2e"}_{Guid.NewGuid():N}"[..30];
        await client.RegisterAsync(uniqueName, "TestPass123!");
        await client.ConnectAsync();
        return client;
    }
}
