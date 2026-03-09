using System.Text;
using System.Threading.RateLimiting;
using Landgrab.Api.Auth;
using Landgrab.Api.Data;
using Landgrab.Api.Endpoints;
using Landgrab.Api.Hubs;
using Landgrab.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddSingleton<GameService>();        // in-memory game rooms
builder.Services.AddScoped<GlobalMapService>();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<PasswordService>();
builder.Services.AddScoped<EmailService>();

// ── Authentication (JWT) ─────────────────────────────────────────────────

var jwtSecret = builder.Configuration["Jwt:Secret"];
if (string.IsNullOrEmpty(jwtSecret))
    throw new InvalidOperationException("Jwt:Secret is not configured. Provide it via environment variable or user secrets.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ClockSkew = TimeSpan.Zero
        };

        // Support JWT in SignalR query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                var path = ctx.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(token) && path.StartsWithSegments("/hub"))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// ── SignalR ───────────────────────────────────────────────────────────────

var signalRBuilder = builder.Services.AddSignalR();

// In production, add NuGet package Microsoft.Azure.SignalR and uncomment:
// var azureSignalR = builder.Configuration["Azure:SignalR:ConnectionString"];
// if (!string.IsNullOrEmpty(azureSignalR))
//     signalRBuilder.AddAzureSignalR(azureSignalR);

// ── CORS ──────────────────────────────────────────────────────────────────

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>()
    ?? ["http://localhost:5173", "http://localhost:3000"];

builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
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

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// ── Endpoints ─────────────────────────────────────────────────────────────

app.MapAuthEndpoints();
app.MapGlobalMapEndpoints();
app.MapAllianceEndpoints();

// Health check
app.MapGet("/health", () => Results.Ok(new { status = "healthy", time = DateTime.UtcNow }));

// ── SignalR Hub ───────────────────────────────────────────────────────────

app.MapHub<GameHub>("/hub/game");

// ── DB migrations on startup ──────────────────────────────────────────────

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        await db.Database.MigrateAsync();
    }
    catch (Exception ex)
    {
        var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        log.LogWarning(ex, "Could not run database migrations (DB may not be available). Continuing...");
    }
}

app.Run();
