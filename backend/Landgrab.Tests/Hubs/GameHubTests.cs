using FluentAssertions;
using Landgrab.Api.Models;

namespace Landgrab.Tests.Hubs;

public sealed class GameHubTests
{
    [Fact]
    public void SanitizeGameDynamics_PreservesAllEnabledFields()
    {
        var dynamics = new GameDynamics
        {
            BeaconEnabled = true,
            BeaconSectorAngle = 90,
            TileDecayEnabled = true,
            CombatMode = CombatMode.Siege,
            PlayerRolesEnabled = true,
            HQEnabled = true,
            HQAutoAssign = true,
            EnemySightingMemorySeconds = 60,
            FieldBattleEnabled = true,
            FieldBattleResolutionMode = FieldBattleResolutionMode.InitiatorPlusRandomVsSumPlusRandom,
        };

        var sanitized = InvokeSanitizeGameDynamics(dynamics);

        sanitized.BeaconEnabled.Should().BeTrue();
        sanitized.BeaconSectorAngle.Should().Be(90);
        sanitized.TileDecayEnabled.Should().BeTrue();
        sanitized.CombatMode.Should().Be(CombatMode.Siege);
        sanitized.PlayerRolesEnabled.Should().BeTrue();
        sanitized.HQEnabled.Should().BeTrue();
        sanitized.HQAutoAssign.Should().BeTrue();
        sanitized.EnemySightingMemorySeconds.Should().Be(60);
        sanitized.FieldBattleEnabled.Should().BeTrue();
        sanitized.FieldBattleResolutionMode.Should().Be(FieldBattleResolutionMode.InitiatorPlusRandomVsSumPlusRandom);
    }

    [Fact]
    public void SanitizeGameDynamics_ClampsBeaconSectorAngleToValidRange()
    {
        var tooSmall = new GameDynamics { BeaconSectorAngle = 0 };
        var tooLarge = new GameDynamics { BeaconSectorAngle = 500 };

        var sanitizedSmall = InvokeSanitizeGameDynamics(tooSmall);
        var sanitizedLarge = InvokeSanitizeGameDynamics(tooLarge);

        sanitizedSmall.BeaconSectorAngle.Should().Be(1);
        sanitizedLarge.BeaconSectorAngle.Should().Be(360);
    }

    [Fact]
    public void SanitizeGameDynamics_EnforcesMinimumEnemySightingMemorySeconds()
    {
        var tooSmall = new GameDynamics { EnemySightingMemorySeconds = 5 };

        var sanitized = InvokeSanitizeGameDynamics(tooSmall);

        sanitized.EnemySightingMemorySeconds.Should().Be(15);
    }

    [Fact]
    public void SanitizeGameDynamics_ResetsInvalidCombatModeToDefault()
    {
        var invalidMode = new GameDynamics { CombatMode = (CombatMode)999 };

        var sanitized = InvokeSanitizeGameDynamics(invalidMode);

        sanitized.CombatMode.Should().Be(CombatMode.Balanced);
    }

    [Fact]
    public void SanitizeGameDynamics_ResetsInvalidFieldBattleResolutionModeToDefault()
    {
        var invalidMode = new GameDynamics { FieldBattleResolutionMode = (FieldBattleResolutionMode)999 };

        var sanitized = InvokeSanitizeGameDynamics(invalidMode);

        sanitized.FieldBattleResolutionMode.Should().Be(FieldBattleResolutionMode.InitiatorVsSumOfJoined);
    }

    [Theory]
    [InlineData("You must be physically inside that hex or within 20 meters of its border to interact with it.", "OUT_OF_RANGE")]
    [InlineData("That hex does not have enough troops.", "INSUFFICIENT_TROOPS")]
    [InlineData("You can only pick up troops from your own hexes.", "HEX_OWNERSHIP_INVALID")]
    public void MapErrorCode_ReturnsSpecificCodesForPickupFailures(string message, string expectedCode)
    {
        var code = InvokeMapErrorCode(message);

        code.Should().Be(expectedCode);
    }

    private static GameDynamics InvokeSanitizeGameDynamics(GameDynamics dynamics)
    {
        var sanitizeMethod = typeof(Api.Hubs.GameHub).GetMethod(
            "SanitizeGameDynamics",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

        if (sanitizeMethod is null)
        {
            throw new InvalidOperationException("SanitizeGameDynamics method not found");
        }

        return (GameDynamics)sanitizeMethod.Invoke(null, [dynamics])!;
    }

    private static string InvokeMapErrorCode(string message)
    {
        var mapErrorCodeMethod = typeof(Api.Hubs.GameHub).GetMethod(
            "MapErrorCode",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);

        if (mapErrorCodeMethod is null)
        {
            throw new InvalidOperationException("MapErrorCode method not found");
        }

        return (string)mapErrorCodeMethod.Invoke(null, [message])!;
    }
}
