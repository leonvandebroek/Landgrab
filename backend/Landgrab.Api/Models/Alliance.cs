using System.ComponentModel.DataAnnotations;

namespace Landgrab.Api.Models;

public class Alliance
{
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50)]
    public string Name { get; set; } = "";

    [MaxLength(6)]
    public string Tag { get; set; } = "";

    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<AllianceMember> Members { get; set; } = [];
}

public class AllianceMember
{
    public Guid UserId { get; set; }
    public Guid AllianceId { get; set; }

    [MaxLength(10)]
    public string Role { get; set; } = "member"; // "leader" | "member"

    public DateTime JoinedAt { get; set; } = DateTime.UtcNow;

    public User User { get; set; } = null!;
    public Alliance Alliance { get; set; } = null!;
}
