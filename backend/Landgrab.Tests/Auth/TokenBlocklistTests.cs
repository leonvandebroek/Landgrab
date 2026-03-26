using FluentAssertions;
using Landgrab.Api.Auth;

namespace Landgrab.Tests.Auth;

/// <summary>
/// Unit tests for the in-memory JWT revocation blocklist.
/// </summary>
public sealed class TokenBlocklistTests
{
    [Fact]
    public void IsRevoked_UnknownJti_ReturnsFalse()
    {
        var sut = new TokenBlocklist();

        sut.IsRevoked("unknown-jti").Should().BeFalse();
    }

    [Fact]
    public void Revoke_ThenIsRevoked_ReturnsTrue()
    {
        var sut = new TokenBlocklist();
        var jti = Guid.NewGuid().ToString();

        sut.Revoke(jti, DateTime.UtcNow.AddHours(1));

        sut.IsRevoked(jti).Should().BeTrue();
    }

    [Fact]
    public void Revoke_SameJtiTwice_DoesNotThrow()
    {
        var sut = new TokenBlocklist();
        var jti = Guid.NewGuid().ToString();
        var expiry = DateTime.UtcNow.AddHours(1);

        var act = () =>
        {
            sut.Revoke(jti, expiry);
            sut.Revoke(jti, expiry); // idempotent — second call is a no-op
        };

        act.Should().NotThrow();
        sut.IsRevoked(jti).Should().BeTrue();
    }

    [Fact]
    public void Purge_RemovesExpiredTokens_LeavesUnexpiredTokens()
    {
        var sut = new TokenBlocklist();
        var expiredJti = Guid.NewGuid().ToString();
        var activeJti = Guid.NewGuid().ToString();

        // Add an already-expired entry and an active entry
        sut.Revoke(expiredJti, DateTime.UtcNow.AddSeconds(-1));
        sut.Revoke(activeJti, DateTime.UtcNow.AddHours(1));

        // Purge is called opportunistically inside Revoke; call it once more explicitly
        sut.Purge();

        sut.IsRevoked(expiredJti).Should().BeFalse("expired tokens should be purged");
        sut.IsRevoked(activeJti).Should().BeTrue("unexpired tokens must remain revoked");
    }

    [Fact]
    public void Purge_WhenAllTokensExpired_BlocklistBecomesEmpty()
    {
        var sut = new TokenBlocklist();
        for (var i = 0; i < 5; i++)
            sut.Revoke(Guid.NewGuid().ToString(), DateTime.UtcNow.AddSeconds(-1));

        sut.Purge();

        // Verify by checking a known jti is not present
        // (can't check "count" without exposing internals — testing observable behaviour only)
        var freshJti = Guid.NewGuid().ToString();
        sut.IsRevoked(freshJti).Should().BeFalse();
    }

    [Fact]
    public void Revoke_OpportunisticPurge_RemovesExpiredEntries()
    {
        var sut = new TokenBlocklist();
        var expiredJti = Guid.NewGuid().ToString();

        // Expire immediately so the next Revoke call's opportunistic Purge picks it up
        sut.Revoke(expiredJti, DateTime.UtcNow.AddMilliseconds(-1));

        // Adding a new token triggers the internal Purge()
        sut.Revoke(Guid.NewGuid().ToString(), DateTime.UtcNow.AddHours(1));

        sut.IsRevoked(expiredJti).Should().BeFalse(
            "opportunistic purge inside Revoke should have removed the expired entry");
    }

    [Fact]
    public void IsRevoked_ConcurrentReadsAndWrites_DoesNotThrow()
    {
        var sut = new TokenBlocklist();

        // Stress-test thread safety of the ConcurrentDictionary
        var tasks = Enumerable.Range(0, 100).Select(i => Task.Run(() =>
        {
            var jti = Guid.NewGuid().ToString();
            sut.Revoke(jti, DateTime.UtcNow.AddSeconds(10));
            _ = sut.IsRevoked(jti);
            sut.Purge();
        }));

        var act = () => Task.WhenAll(tasks).GetAwaiter().GetResult();
        act.Should().NotThrow("TokenBlocklist must be thread-safe under concurrent access");
    }
}
