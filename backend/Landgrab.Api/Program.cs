using System.Text;
using System.Threading.RateLimiting;
using Landgrab.Api.Auth;
using Landgrab.Api.Data;
using Landgrab.Api.Endpoints;
using Landgrab.Api.Hubs;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────

builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(5, TimeSpan.FromSeconds(30), null)));

builder.Services.AddSingleton<RoomService>();
builder.Services.AddSingleton<IGameRoomProvider>(sp => sp.GetRequiredService<RoomService>());
builder.Services.AddSingleton<GameStateService>();
builder.Services.AddSingleton<DerivedMapStateService>();
builder.Services.AddSingleton<VisibilityService>();
builder.Services.AddSingleton<VisibilityBroadcastHelper>();
builder.Services.AddSingleton<AllianceConfigService>();
builder.Services.AddSingleton<MapAreaService>();
builder.Services.AddSingleton<GameTemplateService>();
builder.Services.AddSingleton<GameConfigService>();
builder.Services.AddSingleton<LobbyService>();
builder.Services.AddSingleton<AbilityService>();
builder.Services.AddSingleton<WinConditionService>();
builder.Services.AddSingleton<GameplayService>();
builder.Services.AddSingleton<HostControlService>();
builder.Services.AddSingleton<GameService>();        // facade over in-memory game rooms
builder.Services.AddSingleton<RoomPersistenceService>();
builder.Services.AddScoped<GlobalMapService>();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<PasswordService>();
builder.Services.AddSingleton<TokenBlocklist>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddHostedService<TroopRegenerationService>();

// ── Authentication (JWT) ─────────────────────────────────────────────────

var jwtSecret = builder.Configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 64)
    throw new InvalidOperationException("Jwt:Secret is not configured or is too short. Minimum length is 64 characters. Provide it via environment variable or user secrets.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "landgrab",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "landgrab",
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        // Support JWT in SignalR query string and cookies
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var accessToken = ctx.Request.Query["access_token"];

                if (!string.IsNullOrEmpty(accessToken))
                {
                    ctx.Token = accessToken;
                }
                else if (ctx.Request.Cookies.TryGetValue("landgrab_token", out var cookieToken))
                {
                    ctx.Token = cookieToken;
                }

                return Task.CompletedTask;
            },
            OnTokenValidated = ctx =>
            {
                var blocklist = ctx.HttpContext.RequestServices.GetRequiredService<TokenBlocklist>();
                var jti = ctx.Principal?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Jti)?.Value;
                if (jti is not null && blocklist.IsRevoked(jti))
                    ctx.Fail("Token has been revoked.");
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── SignalR ───────────────────────────────────────────────────────────────

var signalRBuilder = builder.Services.AddSignalR(options =>
    {
        options.AddFilter<HubExceptionFilter>();
    })
    .AddJsonProtocol(options =>
        options.PayloadSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter()));

var azureSignalRConn = builder.Configuration["Azure:SignalR:ConnectionString"];
if (!string.IsNullOrEmpty(azureSignalRConn))
{
    signalRBuilder.AddAzureSignalR(azureSignalRConn);
}

// ── CORS ──────────────────────────────────────────────────────────────────

// Always allow explicitly configured production origins; localhost only in development.
var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
var allOrigins = new List<string>(allowedOrigins);
if (builder.Environment.IsDevelopment())
{
    allOrigins.Add("http://localhost:5173");
    allOrigins.Add("http://localhost:3000");
}

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allOrigins.ToArray())
              .WithHeaders("Content-Type", "Authorization", "X-Requested-With")
              .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
              .AllowCredentials()));

// ── Rate limiting ──────────────────────────────────────────────────────────

builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("auth", ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                Window = TimeSpan.FromMinutes(1),
                PermitLimit = 10
            }));
});

// ─────────────────────────────────────────────────────────────────────────

var app = builder.Build();

// ── Middleware ────────────────────────────────────────────────────────────

// Response compression
app.UseResponseCompression();

// Security headers
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)";

    // TODO: tighten script-src once Vite build no longer requires unsafe-inline/unsafe-eval
    // (nonce-based CSP or hash-based allowlist should replace these directives long-term)
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr https://*.basemaps.cartocdn.com; " +
        "connect-src 'self' wss: ws:; " +
        "font-src 'self'; " +
        "frame-ancestors 'none';";

    if (!app.Environment.IsDevelopment())
    {
        context.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }

    await next();
});

// HTTPS redirection (Production only)
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors();
app.UseRateLimiter();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

// ── Endpoints ─────────────────────────────────────────────────────────────

app.MapAuthEndpoints();
app.MapGlobalMapEndpoints();
app.MapAllianceEndpoints();
app.MapMapTemplateEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapPlaytestEndpoints();
}

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", time = DateTime.UtcNow }));

// ── SignalR Hub ───────────────────────────────────────────────────────────

app.MapHub<GameHub>("/hub/game");

// SPA fallback — non-API/hub routes serve index.html for client-side routing
app.MapFallbackToFile("index.html");

// ── DB migrations on startup ──────────────────────────────────────────────

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var roomPersistence = scope.ServiceProvider.GetRequiredService<RoomPersistenceService>();
    var gameService = scope.ServiceProvider.GetRequiredService<GameService>();
    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await db.Database.MigrateAsync();
        var staleRooms = await roomPersistence.DeactivateStaleRoomsAsync();
        var restoredRooms = await roomPersistence.RestoreActiveRoomsAsync();
        var restoredRoomCount = gameService.RestoreRooms(restoredRooms);
        log.LogInformation(
            "Room persistence startup complete. Deactivated {StaleRoomCount} stale rooms and restored {RestoredRoomCount} active rooms.",
            staleRooms, restoredRoomCount);
    }
    catch (Exception ex)
    {
        log.LogWarning(ex,
            "Could not initialize persisted rooms (migrations/restore may require the database). Continuing...");
    }
}

app.Run();
