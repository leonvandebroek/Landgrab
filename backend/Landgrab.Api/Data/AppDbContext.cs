using Landgrab.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Alliance> Alliances => Set<Alliance>();
    public DbSet<AllianceMember> AllianceMembers => Set<AllianceMember>();
    public DbSet<GlobalHex> GlobalHexes => Set<GlobalHex>();
    public DbSet<GameEvent> GameEvents => Set<GameEvent>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<PersistedRoom> PersistedRooms => Set<PersistedRoom>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<User>(e =>
        {
            e.HasKey(u => u.Id);
            e.HasIndex(u => u.Username).IsUnique();
            e.HasIndex(u => u.Email).IsUnique();
            e.Property(u => u.Username).HasMaxLength(30).IsRequired();
            e.Property(u => u.Email).HasMaxLength(254).IsRequired();
        });

        model.Entity<Alliance>(e =>
        {
            e.HasKey(a => a.Id);
            e.Property(a => a.Name).HasMaxLength(50).IsRequired();
            e.Property(a => a.Tag).HasMaxLength(6).IsRequired();
        });

        model.Entity<AllianceMember>(e =>
        {
            e.HasKey(am => new { am.UserId, am.AllianceId });
            e.HasOne(am => am.User).WithMany(u => u.AllianceMemberships).HasForeignKey(am => am.UserId);
            e.HasOne(am => am.Alliance).WithMany(a => a.Members).HasForeignKey(am => am.AllianceId);
        });

        model.Entity<GlobalHex>(e =>
        {
            e.HasKey(h => new { h.Q, h.R });
            e.HasIndex(h => h.OwnerUserId);
            e.HasIndex(h => h.OwnerAllianceId);
        });

        model.Entity<GameEvent>(e =>
        {
            e.HasKey(ge => ge.Id);
            e.HasIndex(ge => ge.RoomId);
            e.Property(ge => ge.EventType).HasMaxLength(30).IsRequired();
        });

        model.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(t => t.Id);
            e.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        model.Entity<PersistedRoom>(e =>
        {
            e.HasKey(room => room.Code);
            e.Property(room => room.Code).HasMaxLength(6).IsRequired();
            e.Property(room => room.StateJson).IsRequired();
            e.Property(room => room.Phase).HasMaxLength(30).IsRequired();
            e.Property(room => room.IsActive).HasDefaultValue(true);
            e.HasIndex(room => room.IsActive);
            e.HasIndex(room => room.UpdatedAt);
        });
    }
}
