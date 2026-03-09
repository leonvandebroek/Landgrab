using Landgrab.Api.Data;
using Landgrab.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Landgrab.Api.Services;

public class GlobalMapService(AppDbContext db)
{
    private const int AttackCooldownMinutes = 5;

    public async Task<IEnumerable<GlobalHex>> GetHexesForUserAsync(Guid userId)
    {
        return await db.GlobalHexes
            .Where(h => h.OwnerUserId == userId)
            .Include(h => h.Owner)
            .Include(h => h.OwnerAlliance)
            .ToListAsync();
    }

    public async Task<IEnumerable<GlobalHex>> GetHexesNearAsync(double lat, double lng, int radiusKm = 50)
    {
        // Convert lat/lng to approximate hex grid coords at ~1km scale
        // Each hex unit ≈ 1km at our global scale
        var (centerQ, centerR) = LatLngToHex(lat, lng);
        var approxRadius = radiusKm;

        return await db.GlobalHexes
            .Where(h =>
                h.Q >= centerQ - approxRadius && h.Q <= centerQ + approxRadius &&
                h.R >= centerR - approxRadius && h.R <= centerR + approxRadius)
            .Include(h => h.Owner)
            .Include(h => h.OwnerAlliance)
            .ToListAsync();
    }

    public async Task<(GlobalHex? result, string? error)> AttackHexAsync(
        Guid attackerUserId, int fromQ, int fromR, int toQ, int toR)
    {
        if (!HexService.AreAdjacent(fromQ, fromR, toQ, toR))
            return (null, "Hexes are not adjacent.");

        var fromHex = await db.GlobalHexes.FindAsync(fromQ, fromR);
        if (fromHex == null || fromHex.OwnerUserId != attackerUserId)
            return (null, "You don't own the source hex.");

        if (fromHex.Troops < 2)
            return (null, "Need at least 2 troops to attack.");

        var toHex = await db.GlobalHexes.FindAsync(toQ, toR);
        if (toHex == null)
        {
            // Empty unclaimed hex — just claim it
            var newHex = new GlobalHex
            {
                Q = toQ, R = toR,
                OwnerUserId = attackerUserId,
                OwnerAllianceId = await GetUserAllianceIdAsync(attackerUserId),
                Troops = 1,
                LastCaptured = DateTime.UtcNow
            };
            fromHex.Troops--;
            db.GlobalHexes.Add(newHex);
            await db.SaveChangesAsync();
            return (newHex, null);
        }

        if (toHex.OwnerUserId == attackerUserId)
            return (null, "Cannot attack your own territory.");

        // Check attack cooldown
        if (toHex.AttackCooldownUntil.HasValue && toHex.AttackCooldownUntil > DateTime.UtcNow)
            return (null, $"This hex is on cooldown. Try again in " +
                $"{(toHex.AttackCooldownUntil.Value - DateTime.UtcNow).TotalMinutes:F0} minutes.");

        // Simple combat: attacker has advantage if more troops
        var rng = Random.Shared;
        var attackRoll = rng.Next(1, 7) + (fromHex.Troops > toHex.Troops ? 1 : 0);
        var defendRoll = rng.Next(1, 7);

        if (attackRoll > defendRoll)
        {
            toHex.OwnerUserId = attackerUserId;
            toHex.OwnerAllianceId = await GetUserAllianceIdAsync(attackerUserId);
            toHex.Troops = 1;
            toHex.LastCaptured = DateTime.UtcNow;
            toHex.AttackCooldownUntil = null;
            fromHex.Troops--;
        }
        else
        {
            // Attack failed — set cooldown on target
            toHex.AttackCooldownUntil = DateTime.UtcNow.AddMinutes(AttackCooldownMinutes);
            toHex.Troops = Math.Max(1, toHex.Troops - 1);
        }

        await db.SaveChangesAsync();
        return (toHex, null);
    }

    public async Task<IEnumerable<object>> GetLeaderboardAsync(int top = 20)
    {
        var playerCounts = await db.GlobalHexes
            .Where(h => h.OwnerUserId != null)
            .GroupBy(h => h.OwnerUserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .Take(top)
            .Join(db.Users, x => x.UserId, u => u.Id,
                (x, u) => new { u.Username, x.Count })
            .ToListAsync();

        return playerCounts;
    }

    public async Task EnsurePlayerHasStartingHex(Guid userId, double lat, double lng)
    {
        var alreadyHasHex = await db.GlobalHexes.AnyAsync(h => h.OwnerUserId == userId);
        if (alreadyHasHex) return;

        var (q, r) = LatLngToHex(lat, lng);
        var allianceId = await GetUserAllianceIdAsync(userId);

        // Find nearest unclaimed hex
        for (var radius = 0; radius <= 5; radius++)
        {
            foreach (var (hq, hr) in HexService.Spiral(radius).Where(h => Math.Max(Math.Abs(h.q), Math.Abs(h.r)) == radius))
            {
                var fq = q + hq;
                var fr = r + hr;
                var existing = await db.GlobalHexes.FindAsync(fq, fr);
                if (existing == null)
                {
                    db.GlobalHexes.Add(new GlobalHex
                    {
                        Q = fq, R = fr,
                        OwnerUserId = userId,
                        OwnerAllianceId = allianceId,
                        Troops = 3,
                        LastCaptured = DateTime.UtcNow
                    });
                    await db.SaveChangesAsync();
                    return;
                }
            }
        }
    }

    /// <summary>
    /// Converts lat/lng to global hex grid coordinates.
    /// Scale: 1 hex unit ≈ 1km (Mercator-based approximation).
    /// </summary>
    public static (int q, int r) LatLngToHex(double lat, double lng)
    {
        const double kmPerDegLat = 111.32;
        const double hexSizeKm = 1.0;

        var y = lat * kmPerDegLat;
        var x = lng * kmPerDegLat * Math.Cos(lat * Math.PI / 180);

        // Flat-top hex: inverse of pixel→hex
        var size = hexSizeKm;
        var q = (2.0 / 3.0 * x) / size;
        var r = (-1.0 / 3.0 * x + Math.Sqrt(3) / 3.0 * y) / size;

        return HexRound(q, r);
    }

    private static (int q, int r) HexRound(double q, double r)
    {
        var s = -q - r;
        var rq = Math.Round(q);
        var rr = Math.Round(r);
        var rs = Math.Round(s);
        var dq = Math.Abs(rq - q);
        var dr = Math.Abs(rr - r);
        var ds = Math.Abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs;
        else if (dr > ds) rr = -rq - rs;
        return ((int)rq, (int)rr);
    }

    private async Task<Guid?> GetUserAllianceIdAsync(Guid userId)
    {
        var allianceId = await db.AllianceMembers
            .Where(am => am.UserId == userId)
            .OrderByDescending(am => am.JoinedAt)
            .Select(am => am.AllianceId)
            .FirstOrDefaultAsync();
        return allianceId == Guid.Empty ? null : allianceId;
    }
}
