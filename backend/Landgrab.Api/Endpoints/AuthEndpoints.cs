using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using Landgrab.Api.Auth;
using Landgrab.Api.Data;
using Landgrab.Api.Models;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Endpoints;

public static class AuthEndpoints
{
    private const string AuthCookieName = "landgrab_token";
    private static readonly TimeSpan AuthLifetime = TimeSpan.FromHours(24);

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth")
            .RequireRateLimiting("auth");

        group.MapPost("/register", Register);
        group.MapPost("/login", Login);
        group.MapPost("/logout", Logout).RequireAuthorization();
        group.MapPost("/refresh", Refresh).RequireAuthorization();
        group.MapGet("/me", Me).RequireAuthorization();
        group.MapPost("/forgot-password", ForgotPassword);
        group.MapPost("/reset-password", ResetPassword);
    }

    private static async Task<IResult> Register(
        RegisterRequest req,
        AppDbContext db,
        PasswordService passwords,
        JwtService jwt,
        EmailService email,
        HttpContext context,
        IWebHostEnvironment environment)
    {
        // Validate
        if (string.IsNullOrWhiteSpace(req.Username) || req.Username.Length < 3 || req.Username.Length > 30)
            return Results.BadRequest(new { error = "Username must be 3–30 characters." });

        if (!req.Username.All(c => char.IsLetterOrDigit(c) || c == '_'))
            return Results.BadRequest(new { error = "Username can only contain letters, numbers, and underscores." });

        if (string.IsNullOrWhiteSpace(req.Email) || !req.Email.Contains('@'))
            return Results.BadRequest(new { error = "Valid email required." });

        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8)
            return Results.BadRequest(new { error = "Password must be at least 8 characters." });

        if (await db.Users.AnyAsync(u => u.Username == req.Username))
            return Results.Conflict(new { error = "Username already taken." });

        if (await db.Users.AnyAsync(u => u.Email == req.Email.ToLower()))
            return Results.Conflict(new { error = "Email already registered." });

        var user = new User
        {
            Username = req.Username,
            Email = req.Email.ToLower(),
            PasswordHash = passwords.Hash(req.Password)
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        await email.SendWelcomeAsync(user.Email, user.Username);

        var token = jwt.GenerateToken(user);
        AppendAuthCookie(context, environment, token);

        return Results.Ok(new AuthResponse(token, user.Username, user.Id.ToString()));
    }

    private static async Task<IResult> Login(
        LoginRequest req,
        AppDbContext db,
        PasswordService passwords,
        JwtService jwt,
        HttpContext context,
        IWebHostEnvironment environment)
    {
        if (string.IsNullOrWhiteSpace(req.UsernameOrEmail) || string.IsNullOrWhiteSpace(req.Password))
            return Results.BadRequest(new { error = "Username/email and password required." });

        var isEmail = req.UsernameOrEmail.Contains('@');
        User? user;

        if (isEmail)
            user = await db.Users.FirstOrDefaultAsync(u => u.Email == req.UsernameOrEmail.ToLower());
        else
            user = await db.Users.FirstOrDefaultAsync(u => u.Username == req.UsernameOrEmail);

        if (user == null || !passwords.Verify(req.Password, user.PasswordHash))
            return Results.Unauthorized();

        var token = jwt.GenerateToken(user);
        AppendAuthCookie(context, environment, token);

        return Results.Ok(new AuthResponse(token, user.Username, user.Id.ToString()));
    }

    private static IResult Logout(HttpContext context, IWebHostEnvironment environment)
    {
        context.Response.Cookies.Delete(AuthCookieName, new CookieOptions
        {
            HttpOnly = true,
            Secure = !environment.IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Path = "/"
        });

        return Results.Ok(new { message = "Logged out" });
    }

    private static IResult Refresh(
        HttpContext context,
        JwtService jwt,
        IWebHostEnvironment environment)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var username = GetUsername(context.User);

        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(username))
            return Results.Unauthorized();

        var token = jwt.GenerateToken(userId, username);
        AppendAuthCookie(context, environment, token);

        return Results.Ok(new { message = "Token refreshed" });
    }

    private static IResult Me(HttpContext context)
    {
        var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var username = GetUsername(context.User);

        if (string.IsNullOrWhiteSpace(userId))
            return Results.Unauthorized();

        return Results.Ok(new { userId, username });
    }

    private static async Task<IResult> ForgotPassword(
        ForgotPasswordRequest req,
        AppDbContext db,
        EmailService email,
        IConfiguration config)
    {
        // Always return OK to prevent email enumeration
        if (string.IsNullOrWhiteSpace(req.Email)) return Results.Ok();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == req.Email.ToLower());
        if (user == null) return Results.Ok();

        // Invalidate old tokens
        var oldTokens = await db.PasswordResetTokens
            .Where(t => t.UserId == user.Id && !t.Used)
            .ToListAsync();
        foreach (var t in oldTokens) t.Used = true;

        // Generate reset token
        var rawToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var tokenHash = ComputeHmac(rawToken, config["Jwt:Secret"] ?? "");

        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id,
            TokenHash = tokenHash,
            ExpiresAt = DateTime.UtcNow.AddHours(1)
        });
        await db.SaveChangesAsync();

        await email.SendPasswordResetAsync(user.Email, rawToken);
        return Results.Ok();
    }

    private static async Task<IResult> ResetPassword(
        ResetPasswordRequest req,
        AppDbContext db,
        PasswordService passwords,
        IConfiguration config)
    {
        if (string.IsNullOrWhiteSpace(req.Token) || string.IsNullOrWhiteSpace(req.NewPassword))
            return Results.BadRequest(new { error = "Token and new password required." });

        if (req.NewPassword.Length < 8)
            return Results.BadRequest(new { error = "Password must be at least 8 characters." });

        var tokenHash = ComputeHmac(req.Token, config["Jwt:Secret"] ?? "");
        var record = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash && !t.Used &&
                                      t.ExpiresAt > DateTime.UtcNow);

        if (record == null)
            return Results.BadRequest(new { error = "Invalid or expired reset token." });

        record.User.PasswordHash = passwords.Hash(req.NewPassword);
        record.Used = true;
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Password reset successfully." });
    }

    private static string ComputeHmac(string data, string key)
    {
        var keyBytes = Encoding.UTF8.GetBytes(key);
        var dataBytes = Encoding.UTF8.GetBytes(data);
        return Convert.ToBase64String(HMACSHA256.HashData(keyBytes, dataBytes));
    }

    private static void AppendAuthCookie(HttpContext context, IWebHostEnvironment environment, string token)
    {
        context.Response.Cookies.Append(AuthCookieName, token, CreateAuthCookieOptions(environment));
    }

    private static CookieOptions CreateAuthCookieOptions(IWebHostEnvironment environment) =>
        new()
        {
            HttpOnly = true,
            Secure = !environment.IsDevelopment(),
            SameSite = SameSiteMode.Strict,
            Expires = DateTimeOffset.UtcNow.Add(AuthLifetime),
            Path = "/"
        };

    private static string? GetUsername(ClaimsPrincipal user) =>
        user.FindFirstValue("username")
        ?? user.FindFirstValue(ClaimTypes.Name)
        ?? user.FindFirstValue(JwtRegisteredClaimNames.UniqueName);

    public record RegisterRequest(string Username, string Email, string Password);
    public record LoginRequest(string UsernameOrEmail, string Password);
    public record ForgotPasswordRequest(string Email);
    public record ResetPasswordRequest(string Token, string NewPassword);
    public record AuthResponse(string Token, string Username, string UserId);
}
