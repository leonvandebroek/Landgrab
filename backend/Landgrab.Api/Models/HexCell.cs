namespace Landgrab.Api.Models;

public enum VisibilityTier
{
    Visible = 0,
    Remembered = 1,
    Hidden = 2
}

public class HexCell
{
    public int Q { get; set; }
    public int R { get; set; }
    public string? OwnerId { get; set; }
    public string? OwnerAllianceId { get; set; }
    public string? OwnerName { get; set; }
    public string? OwnerColor { get; set; }
    public int Troops { get; set; }
    public VisibilityTier VisibilityTier { get; set; } = VisibilityTier.Visible;
    public int? LastKnownTroops { get; set; }
    public string? LastKnownOwnerId { get; set; }
    public string? LastKnownOwnerName { get; set; }
    public string? LastKnownOwnerColor { get; set; }
    public string? LastKnownOwnerAllianceId { get; set; }
    public bool? LastKnownIsFort { get; set; }
    public bool? LastKnownIsMasterTile { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public bool IsMasterTile { get; set; }

    // Phase 3: Rally — fortified when ≥2 allied players present
    public bool IsFortified { get; set; }

    // Phase 3: Shepherd — tracks last allied player visit
    public DateTime? LastVisitedAt { get; set; }

    // Phase 4: Engineer — permanent fort status
    public bool IsFort { get; set; }

    // Sabotage — troop regen disabled until this time
    public DateTime? SabotagedUntil { get; set; }
}

public class GlobalHex
{
    public int Q { get; set; }
    public int R { get; set; }
    public Guid? OwnerUserId { get; set; }
    public Guid? OwnerAllianceId { get; set; }
    public int Troops { get; set; } = 0;
    public DateTime? LastCaptured { get; set; }
    public DateTime? AttackCooldownUntil { get; set; }

    public User? Owner { get; set; }
    public Alliance? OwnerAlliance { get; set; }
}
