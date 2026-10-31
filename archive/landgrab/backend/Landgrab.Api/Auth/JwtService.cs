using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Landgrab.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace Landgrab.Api.Auth;

public class JwtService(IConfiguration config)
{
    private static string GetValidatedSecret(IConfiguration config)
    {
        var secret = config["Jwt:Secret"];

        if (string.IsNullOrWhiteSpace(secret))
            throw new InvalidOperationException(
                "Jwt:Secret is not configured or is empty/whitespace. Provide a strong secret via environment variable or user secrets.");

        const int MinSecretLength = 32;
        if (secret.Length < MinSecretLength)
            throw new InvalidOperationException(
                $"Jwt:Secret is too short. It must be at least {MinSecretLength} characters long.");

        return secret;
    }

    private readonly string _secret = GetValidatedSecret(config);
    private readonly string _issuer = config["Jwt:Issuer"] ?? "landgrab";
    private readonly string _audience = config["Jwt:Audience"] ?? "landgrab";
    private static readonly TimeSpan AuthLifetime = TimeSpan.FromHours(24);

    public string GenerateToken(User user) =>
        GenerateToken(user.Id.ToString(), user.Username);

    public string GenerateToken(string userId, string username)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId),
            new Claim(JwtRegisteredClaimNames.UniqueName, username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(ClaimTypes.NameIdentifier, userId),
            new Claim(ClaimTypes.Name, username),
            new Claim("username", username),
        };

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.Add(AuthLifetime),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public SymmetricSecurityKey GetSecurityKey() =>
        new(Encoding.UTF8.GetBytes(_secret));
}
