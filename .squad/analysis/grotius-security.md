# Grotius — Security Architecture Analysis

**Date:** 2026-03-22  
**Analyst:** Grotius (Security Engineer)  
**Scope:** Full-stack security audit of Landgrab platform  
**Mode:** READ-ONLY analysis — no files modified

---

## Executive Summary

The Landgrab platform demonstrates **solid foundational security practices** — JWT validation is strict, BCrypt factor 12 is enforced, HttpOnly cookies are used, and the HubExceptionFilter prevents stack trace leakage. However, several medium-to-high severity gaps exist: the rate limiter is misconfigured (60 req/s instead of 10 req/min), JWTs cannot be revoked on logout, there is no account lockout, and the `dangerouslySetInnerHTML` usage in 4 frontend components needs review. The JWT token is also stored in React state memory *and* passed as a query-string to SignalR, which can leak into server logs.

---

## 1. A01: Broken Access Control

### Current Implementation
- **Hub-level auth:** `[Authorize]` attribute on `GameHub` class (`GameHub.cs:17`) enforces JWT on all SignalR connections. ✅ Good
- **Host-only actions:** Consistently verified server-side via `GameStateCommon.IsHost(room, userId)` in:
  - `HostControlService` (lines 21, 47, 81, 192, 223)
  - `LobbyService` (lines 59, 89, 144, 164, 213)
  - `MapAreaService` (lines 26, 53, 82, 101, 249, 259)
  - `GameConfigService` (lines 22, 46, 86, 106, 126, 149, 169)
  - `AllianceConfigService` (lines 101, 151, 195, 251)
  - `GameTemplateService` (lines 29, 110)
- **Room isolation:** Hub methods use `gameService.GetRoomByConnection(Context.ConnectionId)` to resolve room from the caller's connection. Player cannot specify an arbitrary room code for gameplay actions. ✅ Good
- **Resource ownership:** `MapTemplateEndpoints` enforces `CreatorUserId == userId` checks on update/delete (`MapTemplateEndpoints.cs:129, 170`). `AllianceEndpoints` scopes queries to the caller's `userId`. ✅ Good
- **REST endpoint auth:** All endpoint groups use `.RequireAuthorization()` except `/api/auth` (public) and `/health` (public). ✅ Good

### Risks

🟡 **Medium — Host-only lobby methods in `GameHub.Lobby.cs` not always guarded at hub layer**  
Methods like `SetMapLocation`, `SetAlliance`, `ConfigureAlliances`, `SetTileSize`, `SetClaimMode`, etc. (`GameHub.Lobby.cs`) delegate to `gameService.*` which internally checks `IsHost`. The hub methods themselves don't pre-check host status — they rely entirely on the service layer. This is architecturally fine (single responsibility) but means a non-host calling these gets a generic error string rather than a structured `HOST_REQUIRED` error code. Not a security bypass, but could mask unauthorized access attempts in monitoring.

🟡 **Medium — `AssignPlayerRole` allows host to set roles for other players**  
`GameHub.Lobby.cs:484` accepts a `targetPlayerId` parameter. The service validates the caller is the host, but there's no validation that `targetPlayerId` is actually in the same room. If the service doesn't check this, it could allow targeting players in other rooms. *Mitigated if the service looks up the player within `room.State.Players` only.*

🟢 **Low — PlaytestEndpoints only in Development**  
`PlaytestEndpoints.cs` is registered only when `app.Environment.IsDevelopment()` (`Program.cs:182`). ✅ Good — but this endpoint has no rate limiting and can inject arbitrary game state.

### Recommendations
1. Add structured `HOST_REQUIRED` error responses in the hub layer for better monitoring
2. Verify `AssignPlayerRole` service method validates `targetPlayerId` exists within the room's player list

---

## 2. A02: Cryptographic Failures

### Current Implementation
- **JWT Secret validation:** Two-layer validation:
  - `Program.cs:52` — requires min 64 chars (startup crash if violated)
  - `JwtService.cs:19` — requires min 32 chars
  - Secret comes from config/env, never hardcoded ✅ Good
- **JWT Algorithm:** HS256 (HMAC-SHA256) via `SecurityAlgorithms.HmacSha256` (`JwtService.cs:38`) ✅ Good
- **BCrypt work factor:** Hardcoded at 12 in `PasswordService.cs:6` ✅ Good
- **Token expiry:** 24 hours (`JwtService.cs:30`, `AuthEndpoints.cs:16`) ✅ Acceptable for gaming context
- **Password reset tokens:** Generated with `RandomNumberGenerator.GetBytes(32)` — 256 bits of entropy (`AuthEndpoints.cs:166`). HMAC-SHA256 hashed before storage. 1-hour expiry. Old tokens invalidated on new request. ✅ Good
- **Token validation:** `ValidateIssuer`, `ValidateAudience`, `ValidateLifetime` all `true` with `ClockSkew = TimeSpan.Zero` (`Program.cs:59-68`) ✅ Good
- **Cookie security:** `HttpOnly: true`, `SameSite: Strict`, `Secure` in production (`AuthEndpoints.cs:221-229`) ✅ Good

### Risks

🟡 **Medium — JWT token also returned in response body alongside cookie**  
`AuthEndpoints.cs:75` returns `AuthResponse(token, ...)` in the JSON body AND sets an HttpOnly cookie. The frontend stores this token in React state (`useAuth.ts:136`) and passes it to SignalR via `accessTokenFactory`. This means the token exists in:
1. HttpOnly cookie (good)
2. JS-accessible React state (XSS risk)
3. URL query string for WebSocket upgrade (server log risk)

🟡 **Medium — Password reset token HMAC uses JWT secret as key**  
`AuthEndpoints.cs:167` uses `config["Jwt:Secret"]` as the HMAC key for hashing reset tokens. While not insecure per se, this couples the reset token integrity to the JWT signing key. If the JWT key rotates, outstanding reset tokens silently break.

🟢 **Low — Program.cs requires 64 chars but JwtService requires only 32**  
The Program.cs startup check is stricter (64 chars) than JwtService's own check (32 chars). This is fine in practice since Program.cs runs first, but the inconsistency could cause confusion.

### Recommendations
1. Consider separating the HMAC key for password reset tokens from the JWT secret
2. Eliminate the token from the JSON response body — use cookie-only auth if possible, or accept the dual approach as necessary for WebSocket auth

---

## 3. A03: Injection

### Current Implementation
- **No raw SQL:** Zero instances of `FromSqlRaw`, `ExecuteSql`, `RawSql`, or `SqlQuery` in the entire backend. All database access is via EF Core LINQ. ✅ Good
- **SignalR input validation:** Comprehensive validation at the hub layer:
  - Room codes: `ValidateRoomCode` — max 10 chars, non-empty (`GameHub.cs:175-176`)
  - Coordinates: `ValidateCoordRange` — `Math.Abs(q) <= 1000` (`GameHub.cs:163-164`)
  - Lat/Lng: `ValidateLatLng` — finite values in valid ranges (`GameHub.cs:166-170`)
  - Strings: `ValidateStringLength` with defined max lengths (`GameHub.cs:160-161`)
  - Enums: `ValidateEnumString` — parsed against defined enum types (`GameHub.cs:181-184`)
  - Hex keys: `ValidateHexKeyPayload` — max 500 keys, each parsed and range-checked (`GameHub.cs:188-236`)
  - Game dynamics: `SanitizeGameDynamics` — clamps values and validates enums (`GameHub.cs:255-271`)
  ✅ Very Good
- **REST input validation:** Auth endpoints validate input lengths and formats. `GlobalMapEndpoints` validates coordinates including NaN/Infinity checks. `MapTemplateEndpoints` validates all inputs. ✅ Good
- **No filesystem or shell access with user input.** ✅ Good

### Risks

✅ **No injection risks identified.** The codebase consistently uses parameterized queries and validates all user inputs before processing.

---

## 4. A05: Security Misconfiguration

### Current Implementation
- **Security headers** (`Program.cs:146-158`):
  - `X-Content-Type-Options: nosniff` ✅
  - `X-Frame-Options: DENY` ✅
  - `Strict-Transport-Security` (production only) ✅
  - `Referrer-Policy: strict-origin-when-cross-origin` ✅
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)` ✅
- **CORS** (`Program.cs:111-120`): Specific origins, specific methods and headers, `AllowCredentials()`. Localhost origins always included. ✅ Acceptable
- **Error handling:** `HubExceptionFilter` catches all non-`HubException` exceptions and returns generic "An unexpected error occurred" (`HubExceptionFilter.cs:9`). Stack traces are never sent to clients. ✅ Good
- **HTTPS redirect:** Production-only (`Program.cs:162-165`) ✅ Good
- **Response compression for HTTPS enabled** (`Program.cs:18-21`) — see risk below

### Risks

🟠 **High — Rate limiter misconfigured: 60 req/sec instead of 10 req/min**  
`Program.cs:128-133` configures the "auth" rate limit policy as:
```csharp
Window = TimeSpan.FromSeconds(1),
PermitLimit = 60
```
This allows **60 requests per second per IP** — effectively **3,600 req/min**. The charter specifies 10 req/min/IP. This is a **360x weaker** rate limit than intended and provides virtually no brute-force protection.

🟡 **Medium — No Content-Security-Policy header**  
The security headers middleware does not set a `Content-Security-Policy` header. This leaves the application without a defense-in-depth layer against XSS.

🟡 **Medium — CORS always includes localhost origins**  
`Program.cs:112` always includes `http://localhost:5173` and `http://localhost:3000` in allowed origins, even in production. This could allow local development environments to make credentialed requests to production APIs.

🟡 **Medium — Response compression enabled for HTTPS**  
`Program.cs:19` sets `EnableForHttps = true`. This can enable BREACH-style compression side-channel attacks on HTTPS responses containing user-controlled content plus secrets (e.g., CSRF tokens). For a game app, this is lower risk but still not best practice.

🟢 **Low — Health endpoint unauthenticated**  
`Program.cs:187` — `/health` returns server time. This is standard practice but leaks server clock precision.

### Recommendations
1. **CRITICAL:** Fix rate limiter to `Window = TimeSpan.FromMinutes(1), PermitLimit = 10`
2. Add a `Content-Security-Policy` header (at minimum `default-src 'self'` with appropriate exceptions for SignalR, map tiles, etc.)
3. Conditionally include localhost origins only in development
4. Consider disabling HTTPS compression or ensure no user-controlled content is in responses with secrets

---

## 5. A06: Vulnerable Components

### Backend (`Landgrab.Api.csproj`)
| Package | Version | Risk |
|---------|---------|------|
| BCrypt.Net-Next | 4.* | ✅ Good — well-maintained |
| Microsoft.AspNetCore.Authentication.JwtBearer | 8.* | ✅ Good |
| Microsoft.EntityFrameworkCore.SqlServer | 8.* | ✅ Good |
| Microsoft.Azure.SignalR | 1.* | ✅ Good |
| Swashbuckle.AspNetCore | 10.1.5 | 🟡 Swagger UI may be exposed in production — verify it's disabled |

### Frontend (`package.json`)
| Package | Version | Risk |
|---------|---------|------|
| @microsoft/signalr | ^10.0.0 | ✅ Good |
| react | ^19.2.0 | ✅ Good — latest |
| leaflet | ^1.9.4 | ✅ Good |
| axios | ^1.13.6 | 🟢 Installed but unused — dead dependency |
| zustand | ^5.0.11 | ✅ Good |
| i18next | ^25.8.18 | ✅ Good |

### Risks

🟡 **Medium — Swagger/Swashbuckle may be accessible in production**  
`Swashbuckle.AspNetCore` is referenced but I don't see explicit middleware registration (`app.UseSwagger()`, `app.UseSwaggerUI()`) in `Program.cs`. Verify it's not auto-registered. If it is, Swagger UI exposes full API documentation to unauthenticated users.

🟢 **Low — Floating version ranges (`4.*`, `8.*`, `1.*`)**  
Backend package versions use wildcard ranges. While NuGet resolves to a fixed version at restore time, this can lead to unexpected updates. Consider pinning to specific versions.

### CI Pipeline
✅ **Good** — `azure-pipelines.yml` includes `dotnet list package --vulnerable` and `npm audit --audit-level=high` scans (lines 48-51, 73-76), though both `continueOnError: true`.

### Recommendations
1. Verify Swagger is not accessible in production
2. Consider failing CI on `npm audit` high vulnerabilities instead of `continueOnError`
3. Remove unused `axios` dependency

---

## 6. A07: Authentication & Session Failures

### Current Implementation
- **New token on login/register:** Yes — `jwt.GenerateToken(user)` creates a fresh token with new `Jti` claim on every auth action (`AuthEndpoints.cs:72, 100`). ✅ Good
- **Token refresh:** `POST /api/auth/refresh` issues new token to authenticated users (`AuthEndpoints.cs:119-134`). Frontend auto-refreshes every 15 minutes (`useAuth.ts:19`). ✅ Good
- **Logout:** Deletes the HttpOnly cookie (`AuthEndpoints.cs:106-117`). ✅ Partially Good
- **Rate limiting on auth:** Applied to all `/api/auth/*` endpoints via `.RequireRateLimiting("auth")` (`AuthEndpoints.cs:21`). ✅ Good (though the rate limit itself is misconfigured — see A05)
- **Email enumeration prevention:** ForgotPassword returns OK regardless of whether user exists (`AuthEndpoints.cs:154-157`). ✅ Good

### Risks

🟠 **High — No JWT revocation on logout**  
Logout deletes the cookie but does NOT invalidate the JWT itself. If the token was extracted (XSS, intercepted, copied from browser dev tools), it remains valid for the full 24-hour lifetime. There is no server-side token blocklist.

🟠 **High — No account lockout or progressive delays after failed logins**  
The login endpoint (`AuthEndpoints.cs:78-103`) returns `401 Unauthorized` on failure with no tracking of failed attempts per account. Combined with the misconfigured rate limiter, this enables password brute-forcing.

🟡 **Medium — Token returned in response body enables XSS-based token theft**  
Login/register return the JWT in the JSON body (`AuthEndpoints.cs:75, 103`). This is needed for SignalR auth, but it means an XSS attack can exfiltrate the token for persistent unauthorized access.

🟡 **Medium — No rate limiting on SignalR hub methods**  
The "auth" rate limit only covers REST endpoints. SignalR hub methods have no rate limiting except the 500ms throttle on `UpdatePlayerLocation` (`GameHub.Gameplay.cs:411-416`). A malicious client could spam other hub methods.

🟢 **Low — Password minimum 8 chars with no complexity requirements**  
`AuthEndpoints.cs:51` and `AuthEndpoints.cs:190` validate `Password.Length < 8` only. No uppercase/number/special char requirements. For a game app this is acceptable.

### Recommendations
1. **HIGH PRIORITY:** Implement token blocklist (Redis or in-memory with expiry cleanup) for logout
2. **HIGH PRIORITY:** Add account lockout after N failed attempts (e.g., 5 attempts → 15-minute lockout)
3. Consider SignalR hub-level rate limiting for expensive operations (attacks, troop placement)

---

## 7. A08: Integrity Failures

### Current Implementation
- **Server is source of truth:** All game mutations happen via `gameService.*` methods which operate on server-side `GameRoom.State`. The client cannot directly set game state. ✅ Good
- **Player identity from JWT claims:** Hub methods use `UserId` property (`GameHub.cs:273-275`) which reads from JWT claims, not from client-supplied parameters. ✅ Good
- **Room resolved from ConnectionId:** `gameService.GetRoomByConnection(Context.ConnectionId)` ensures a player can only interact with their own room. ✅ Good
- **Troop count validation:** `PickUpTroops` validates `count <= 0` (`GameHub.Gameplay.cs:452`). `PlaceTroops` validates `troopCount < 0` (`GameHub.Gameplay.cs:480`). ✅ Good
- **Coordinate validation:** All hex coordinates are validated with `ValidateCoordRange(q, r)` — absolute value ≤ 1000. ✅ Good

### Risks

🟡 **Medium — `PickUpTroops` and `PlaceTroops` include client-supplied `playerLat`/`playerLng`**  
`GameHub.Gameplay.cs:450, 475` — the player's location is passed as parameters rather than being read from server-side state. If the server uses these coordinates for proximity checks, a client could falsify their position. The `ValidateLatLng` check ensures they're valid coordinates but not that they match the player's actual GPS position. *This is somewhat mitigated by the fact that it's a location-based game where GPS positions flow from the client by design.*

🟡 **Medium — `UpdatePlayerLocation` trusts client-reported GPS**  
`GameHub.Gameplay.cs:402` — GPS position is inherently client-controlled. A player can spoof their position to claim territory anywhere. *This is an inherent limitation of client-side GPS and a game design issue rather than a pure security issue.*

🟢 **Low — Field battle auto-resolution uses `Task.Run` with captured room code**  
`GameHub.Gameplay.cs:732-768` — The 30-second delayed resolution captures `room.Code` and uses `hubContext` to broadcast. This is architecturally correct but race-prone if the room is destroyed before resolution.

### Recommendations
1. Consider server-side position validation (rate of movement, plausibility checks) to detect GPS spoofing
2. Add anti-cheat heuristics for suspicious position changes

---

## 8. A10: Server-Side Request Forgery (SSRF)

### Current Implementation

✅ **No SSRF risk identified.** The backend makes no outbound HTTP calls based on user input. The `EmailService` is the only outbound-capable service and it constructs URLs entirely from server config (`App:BaseUrl`) plus server-generated tokens (`AuthEndpoints.cs:167`). There are no webhook, callback, or URL-fetch features.

---

## 9. Secrets Management

### Current Implementation
- **JWT secret:** Loaded from config/env (`Program.cs:51`, `JwtService.cs:13`), never hardcoded ✅ Good
- **Docker Compose:** JWT secret uses `${JWT_SECRET:?...}` required env var (`docker-compose.yml:35`). SA password has a default fallback `Dev_Password1!` ✅ Acceptable for dev
- **Azure Pipelines:** Secrets passed via `$(SQL_ADMIN_PASSWORD)` and `$(JWT_SECRET)` pipeline variables (`azure-pipelines.yml:135`), not hardcoded ✅ Good
- **No secrets in source code:** No API keys, connection strings, or passwords found committed ✅ Good

### Risks

🟡 **Medium — Docker Compose SA_PASSWORD has hardcoded default**  
`docker-compose.yml:12` — `SA_PASSWORD: "${SA_PASSWORD:-Dev_Password1!}"` means if the env var isn't set, the SQL Server password defaults to a well-known value. The healthcheck command also contains this default. For dev-only use this is acceptable, but production docker-compose should not have defaults.

🟡 **Medium — No Azure Key Vault integration**  
Secrets are passed as environment variables. In production Azure deployments, Key Vault references would be more secure as they support rotation, audit logging, and access policies.

🟢 **Low — Azure SignalR connection string passed via env**  
`Program.cs:103` — `Azure:SignalR:ConnectionString` is read from config. This is fine for dev/container deployments but should use Key Vault in production.

### Recommendations
1. Remove default SA_PASSWORD from docker-compose for production
2. Consider Azure Key Vault references for production secrets

---

## 10. Frontend Security

### Current Implementation
- **Token storage:** JWT stored in React state memory via `useState` (`useAuth.ts:32-33`) — not in localStorage ✅ Good
- **HttpOnly cookie:** Auth cookie is HttpOnly, Secure (production), SameSite=Strict ✅ Good
- **Session recovery:** `gameStore.ts:85-107` stores `roomCode` and `userId` in localStorage — not the JWT itself ✅ Good
- **No localStorage for tokens:** The localStorage usage (`useSound.ts`, `usePlayerPreferences.ts`, `MapLegend.tsx`, `GameView.tsx`) is only for non-sensitive UI preferences ✅ Good
- **SignalR token delivery:** Via `accessTokenFactory` callback which passes the token in query string during WebSocket upgrade (`useSignalR.ts:119-121`) — standard pattern for SignalR ✅ Acceptable

### Risks

🟡 **Medium — 4 instances of `dangerouslySetInnerHTML`**  
1. `TroopBadge.tsx:82` — renders `hqPrefixMarkup` (an SVG icon string)
2. `HexTooltipOverlay.tsx:332` — renders `markup` (tooltip content)
3. `HexTile.tsx:657` — renders `html` content
4. `GameIcon.tsx:20` — renders `svg` from `gameIcons` dictionary

All four render **developer-controlled static content** from `utils/gameIcons.ts` or computed from game state (not from user input). The SVG icons are hardcoded string literals in the codebase. **No user-supplied strings flow into these `dangerouslySetInnerHTML` calls.** Risk is low but the pattern should be documented and guarded.

🟡 **Medium — JWT token accessible in JS memory**  
The token is in React state (`useAuth.ts:136`) and accessible to any JavaScript running in the page context. An XSS vulnerability would allow token exfiltration. This is an unavoidable trade-off for SignalR WebSocket auth.

🟡 **Medium — Game state accessible via browser console**  
All game state (`gameStore`, `gameplayStore`) is in Zustand stores accessible from the browser console. Players can see full state including other players' positions (within visibility rules). This is a game fairness issue rather than a data security issue, as the server already filters visibility.

🟢 **Low — Token in WebSocket upgrade URL**  
The SignalR `accessTokenFactory` passes the JWT as a query parameter during the HTTP→WebSocket upgrade. This URL can appear in server access logs, proxy logs, and browser history. Standard SignalR pattern but worth noting.

### Recommendations
1. Add code comments to all `dangerouslySetInnerHTML` usages documenting that inputs are developer-controlled
2. Consider a utility wrapper that validates SVG content before rendering
3. If any user-generated content is added in the future (chat, custom names in HTML), sanitize with DOMPurify

---

## Prioritized Remediation List

| # | Severity | Issue | Location | Effort |
|---|----------|-------|----------|--------|
| 1 | 🔴 Critical | Rate limiter misconfigured (60 req/s instead of 10 req/min) | `Program.cs:129-133` | 5 min |
| 2 | 🟠 High | No JWT revocation on logout — stolen tokens valid for 24h | `AuthEndpoints.cs:106-117` | 2-4h |
| 3 | 🟠 High | No account lockout after failed login attempts | `AuthEndpoints.cs:78-103` | 1-2h |
| 4 | 🟡 Medium | No Content-Security-Policy header | `Program.cs:146-158` | 30 min |
| 5 | 🟡 Medium | CORS includes localhost origins in production | `Program.cs:112` | 15 min |
| 6 | 🟡 Medium | No SignalR hub method rate limiting (except location) | `GameHub.Gameplay.cs` | 2-4h |
| 7 | 🟡 Medium | Password reset HMAC key coupled to JWT secret | `AuthEndpoints.cs:167` | 30 min |
| 8 | 🟡 Medium | HTTPS response compression BREACH risk | `Program.cs:19` | 5 min |
| 9 | 🟡 Medium | GPS spoofing — no server-side plausibility checks | `GameHub.Gameplay.cs:402` | 4-8h |
| 10 | 🟡 Medium | Swagger possibly accessible in production | `Landgrab.Api.csproj` | 15 min |
| 11 | 🟢 Low | Docker Compose has default SA_PASSWORD | `docker-compose.yml:12` | 5 min |
| 12 | 🟢 Low | CI vulnerability scans use `continueOnError` | `azure-pipelines.yml:51,76` | 5 min |
| 13 | 🟢 Low | Unused `axios` dependency | `package.json` | 1 min |

---

## What's Working Well

✅ JWT validation is strict: issuer, audience, lifetime, zero clock skew  
✅ BCrypt work factor 12 — hardcoded, no configuration bypass  
✅ HttpOnly + SameSite=Strict cookies for auth  
✅ Zero raw SQL — all EF Core parameterized queries  
✅ Comprehensive SignalR input validation with type-safe bounds checking  
✅ HubExceptionFilter prevents stack trace leakage  
✅ Host-only actions consistently verified server-side across all service classes  
✅ Room isolation via ConnectionId-based room resolution  
✅ Email enumeration prevented on forgot-password  
✅ Password reset tokens: 256-bit entropy, HMAC-hashed, 1-hour expiry, old tokens invalidated  
✅ No secrets in source code  
✅ CI includes security scanning (NuGet vulnerabilities + npm audit)  
✅ No SSRF vectors  
✅ `dangerouslySetInnerHTML` only uses developer-controlled content  
✅ Security headers (X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy)  

---

*Grotius — Security Engineer, Landgrab Squad*
