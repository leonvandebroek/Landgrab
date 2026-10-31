namespace Landgrab.Api.Models;

public class PersistedRoom
{
    public string Code { get; set; } = "";
    public Guid HostUserId { get; set; }
    public string StateJson { get; set; } = "{}";
    public string Phase { get; set; } = GamePhase.Lobby.ToString();
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
