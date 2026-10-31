using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using FluentAssertions;
using Landgrab.Api.Auth;
using Landgrab.Api.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Moq;

namespace Landgrab.Tests.Auth;

public sealed class JwtServiceTests
{
    private const string Issuer = "landgrab-tests";
    private const string Audience = "landgrab-tests-clients";
    private const string ValidSecret = "0123456789abcdef0123456789abcdef";
    private const string DifferentSecret = "fedcba9876543210fedcba9876543210";

    [Fact]
    public void GenerateToken_ValidInput_ReturnsNonEmptyToken()
    {
        var sut = new JwtService(CreateConfiguration().Object);

        var token = sut.GenerateToken("user-1", "alice");

        token.Should().NotBeNullOrWhiteSpace();
        token.Split('.').Should().HaveCount(3);
    }

    [Fact]
    public void GenerateToken_ValidInput_IncludesExpectedClaims()
    {
        var sut = new JwtService(CreateConfiguration().Object);

        var token = sut.GenerateToken("user-42", "bob");
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        jwt.Claims.Should().Contain(c => c.Type == JwtRegisteredClaimNames.Sub && c.Value == "user-42");
        jwt.Claims.Should().Contain(c => c.Type == JwtRegisteredClaimNames.UniqueName && c.Value == "bob");
        var jtiClaim = jwt.Claims.Single(c => c.Type == JwtRegisteredClaimNames.Jti);

        Guid.TryParse(jtiClaim.Value, out var parsedJti).Should().BeTrue();
        parsedJti.Should().NotBe(Guid.Empty);
    }

    [Fact]
    public void GenerateToken_ValidInput_ExpiresAtExpectedTime()
    {
        var sut = new JwtService(CreateConfiguration().Object);
        var beforeGeneration = DateTime.UtcNow;

        var token = sut.GenerateToken("user-1", "alice");

        var afterGeneration = DateTime.UtcNow;
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        jwt.ValidTo.Should().BeOnOrAfter(beforeGeneration.AddHours(24).AddSeconds(-5));
        jwt.ValidTo.Should().BeOnOrBefore(afterGeneration.AddHours(24).AddSeconds(5));
    }

    [Fact]
    public void GenerateToken_SameSecret_CanBeValidated()
    {
        var configuration = CreateConfiguration();
        var sut = new JwtService(configuration.Object);
        var token = sut.GenerateToken("user-1", "alice");
        var handler = new JwtSecurityTokenHandler();

        var validationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = sut.GetSecurityKey(),
            ValidateIssuer = true,
            ValidIssuer = Issuer,
            ValidateAudience = true,
            ValidAudience = Audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };

        var principal = handler.ValidateToken(token, validationParameters, out var validatedToken);

        principal.Identity?.IsAuthenticated.Should().BeTrue();
        validatedToken.Should().BeOfType<JwtSecurityToken>();
    }

    [Fact]
    public void GenerateToken_DifferentSecret_CannotBeValidated()
    {
        var sut = new JwtService(CreateConfiguration().Object);
        var token = sut.GenerateToken("user-1", "alice");
        var otherService = new JwtService(CreateConfiguration(secret: DifferentSecret).Object);
        var handler = new JwtSecurityTokenHandler();

        var validationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = otherService.GetSecurityKey(),
            ValidateIssuer = true,
            ValidIssuer = Issuer,
            ValidateAudience = true,
            ValidAudience = Audience,
            ValidateLifetime = false,
            ClockSkew = TimeSpan.Zero
        };

        Action act = () => handler.ValidateToken(token, validationParameters, out _);

        act.Should().Throw<SecurityTokenInvalidSignatureException>();
    }

    [Fact]
    public void Constructor_SecretTooShort_ThrowsInvalidOperationException()
    {
        Action act = () => new JwtService(CreateConfiguration(secret: "short-secret").Object);

        act.Should().Throw<InvalidOperationException>()
            .WithMessage("*too short*");
    }

    [Fact]
    public void GenerateToken_UserOverload_UsesUserIdAndUsername()
    {
        var sut = new JwtService(CreateConfiguration().Object);
        var user = new User
        {
            Id = Guid.NewGuid(),
            Username = "charlie"
        };

        var token = sut.GenerateToken(user);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        jwt.Claims.Should().Contain(c => c.Type == JwtRegisteredClaimNames.Sub && c.Value == user.Id.ToString());
        jwt.Claims.Should().Contain(c => c.Type == JwtRegisteredClaimNames.UniqueName && c.Value == user.Username);
    }

    [Fact]
    public void GetSecurityKey_ValidSecret_ReturnsKeyWithExpectedSize()
    {
        var sut = new JwtService(CreateConfiguration().Object);

        var key = sut.GetSecurityKey();

        key.Should().NotBeNull();
        key.KeySize.Should().Be(Encoding.UTF8.GetByteCount(ValidSecret) * 8);
    }

    private static Mock<IConfiguration> CreateConfiguration(
        string secret = ValidSecret,
        string issuer = Issuer,
        string audience = Audience)
    {
        var configuration = new Mock<IConfiguration>();
        configuration.SetupGet(c => c["Jwt:Secret"]).Returns(secret);
        configuration.SetupGet(c => c["Jwt:Issuer"]).Returns(issuer);
        configuration.SetupGet(c => c["Jwt:Audience"]).Returns(audience);
        return configuration;
    }
}
