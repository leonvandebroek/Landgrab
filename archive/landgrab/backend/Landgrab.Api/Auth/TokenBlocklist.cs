using System.Collections.Concurrent;

namespace Landgrab.Api.Auth;

/// <summary>
/// In-memory JWT revocation list. Tokens are removed automatically on expiry.
/// Note: This blocklist is cleared on server restart. For persistent revocation,
/// use a distributed cache (Redis) in a future phase.
/// </summary>
public sealed class TokenBlocklist
{
    private readonly ConcurrentDictionary<string, DateTime> _revokedTokens = new();

    public void Revoke(string jti, DateTime expiry)
    {
        _revokedTokens.TryAdd(jti, expiry);
        Purge(); // opportunistic purge — keeps the dictionary from growing unbounded
    }

    public bool IsRevoked(string jti) =>
        _revokedTokens.ContainsKey(jti);

    public void Purge()
    {
        var now = DateTime.UtcNow;
        foreach (var jti in _revokedTokens.Keys)
        {
            if (_revokedTokens.TryGetValue(jti, out var exp) && exp < now)
                _revokedTokens.TryRemove(jti, out _);
        }
    }
}
