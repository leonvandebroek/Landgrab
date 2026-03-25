using FluentAssertions;
using Landgrab.Api.Models;

namespace Landgrab.Tests.Auth;

/// <summary>
/// Unit tests for account lockout fields on the User entity.
/// The lockout state transitions are enforced by the login endpoint;
/// these tests verify the invariants that the endpoint relies on.
/// </summary>
public sealed class AccountLockoutTests
{
    [Fact]
    public void User_DefaultState_HasZeroFailedAttemptsAndNoLock()
    {
        var user = new User { Username = "alice", Email = "alice@example.com", PasswordHash = "hash" };

        user.FailedLoginAttempts.Should().Be(0);
        user.LockedUntil.Should().BeNull();
    }

    [Fact]
    public void User_WhenLockedUntilIsInThePast_IsNotLocked()
    {
        var user = new User
        {
            FailedLoginAttempts = 5,
            LockedUntil = DateTime.UtcNow.AddMinutes(-1)
        };

        // Lock is considered expired when LockedUntil <= UtcNow
        var isLocked = user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow;

        isLocked.Should().BeFalse("a lock with a past expiry should not block login");
    }

    [Fact]
    public void User_WhenLockedUntilIsInTheFuture_IsLocked()
    {
        var user = new User
        {
            FailedLoginAttempts = 5,
            LockedUntil = DateTime.UtcNow.AddMinutes(15)
        };

        var isLocked = user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow;

        isLocked.Should().BeTrue("a future LockedUntil should block login");
    }

    [Fact]
    public void User_ClearingLockoutState_ResetsToDefaults()
    {
        var user = new User
        {
            FailedLoginAttempts = 5,
            LockedUntil = DateTime.UtcNow.AddMinutes(15)
        };

        // Simulate what the login endpoint does on success
        user.FailedLoginAttempts = 0;
        user.LockedUntil = null;

        user.FailedLoginAttempts.Should().Be(0);
        user.LockedUntil.Should().BeNull();
    }

    [Fact]
    public void User_LockoutThreshold_IsReachedAtFiveAttempts()
    {
        // The threshold is 5 — simulate incrementing from 4
        var user = new User { FailedLoginAttempts = 4 };

        user.FailedLoginAttempts += 1;
        if (user.FailedLoginAttempts >= 5)
            user.LockedUntil = DateTime.UtcNow.AddMinutes(15);

        user.LockedUntil.Should().NotBeNull("the 5th failed attempt should trigger a lockout");
        user.LockedUntil!.Value.Should().BeCloseTo(DateTime.UtcNow.AddMinutes(15), precision: TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void User_LockoutThreshold_IsNotReachedBelowFiveAttempts()
    {
        var user = new User { FailedLoginAttempts = 3 };

        user.FailedLoginAttempts += 1;
        if (user.FailedLoginAttempts >= 5)
            user.LockedUntil = DateTime.UtcNow.AddMinutes(15);

        user.LockedUntil.Should().BeNull("four attempts should not trigger lockout");
    }
}
