using System.Text.Json;
using System.Text.Json.Serialization;
using VirtuBattle.Server.Hubs;
using VirtuBattle.Server.Rooms;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<RoomRegistry>();
builder.Services.AddSignalR(options =>
{
    // Phones on mobile data drop packets; keep the connection alive and detect dead peers reasonably fast.
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
})
.AddJsonProtocol(options =>
{
    // Enums travel as camelCase strings ("closeCombat"), which the Swift client decodes directly.
    options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

var app = builder.Build();

app.MapGet("/", () => Results.Text("VirtuBattle server. SignalR hub at " + GameHub.Path));
app.MapGet("/health", (RoomRegistry rooms) => Results.Ok(new { status = "ok", rooms = rooms.RoomCount }));
app.MapHub<GameHub>(GameHub.Path);

app.Run();

/// <summary>Exposed for WebApplicationFactory in tests.</summary>
public partial class Program;
