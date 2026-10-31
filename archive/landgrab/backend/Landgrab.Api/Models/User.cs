using System.ComponentModel.DataAnnotations;

namespace Landgrab.Api.Models;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(30)]
    public string Username { get; set; } = "";

    [MaxLength(254)]
    public string Email { get; set; } = "";

    public string PasswordHash { get; set; } = "";
    public bool EmailVerified { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Account lockout — incremented on each failed login; cleared on success
    public int FailedLoginAttempts { get; set; } = 0;
    public DateTime? LockedUntil { get; set; }

    public ICollection<AllianceMember> AllianceMemberships { get; set; } = [];
    public ICollection<MapTemplate> MapTemplates { get; set; } = [];
}
