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

    public ICollection<AllianceMember> AllianceMemberships { get; set; } = [];
}
