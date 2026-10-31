# Configuration Reference

## Backend (`appsettings.json` / `appsettings.Development.json`)

### Required

These values must be present or the application will fail to start.

| Key | Type | Notes |
|-----|------|-------|
| `ConnectionStrings:DefaultConnection` | string | PostgreSQL connection string. Example: `"Host=localhost;Port=5432;Database=landgrab;Username=postgres;Password=password"` |
| `Jwt:Secret` | string | **Minimum 32 characters.** Used to sign HS256 JWTs and to HMAC-hash password-reset tokens. Validated at startup — the app will throw if this is missing or too short. |

### Optional

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `App:BaseUrl` | string | — | Frontend URL. Used to construct the password-reset link sent in emails. Example: `"https://landgrab.example.com"`. If absent, password-reset emails won't contain a valid link. |
| `Azure:SignalR:ConnectionString` | string | — | Azure SignalR Service connection string. If set, the hub uses Azure SignalR (scales to multiple backend instances). If absent, the local in-process hub is used. |
| `AzureCommunicationServices:ConnectionString` | string | — | Azure Communication Services connection string for sending emails. If absent, emails are logged to the console instead of sent (useful for local dev). |

---

## Docker / Environment Variables

When running via Docker Compose, secrets are passed as environment variables. The `backend` service maps them to the ASP.NET configuration system.

| Env var | Maps to | Required |
|---------|---------|---------|
| `JWT_SECRET` | `Jwt:Secret` | **Yes.** Compose will fail-fast if absent: `${JWT_SECRET:?JWT_SECRET environment variable must be set}` |
| `ConnectionStrings__DefaultConnection` | `ConnectionStrings:DefaultConnection` | Set via Compose `environment` block pointing to the `db` service |

---

## Frontend (`.env`)

The Vite dev server reads a `.env` file in `frontend/landgrab-ui/`. In production the frontend is a static Nginx build — no runtime env vars.

| Variable | Notes |
|----------|-------|
| *(none required)* | The frontend uses the Vite proxy for all API and WebSocket calls. No backend URL needs to be configured. |

A root-level `.env` file is used by Docker Compose for secret injection:

```env
# .env  (root of project, not committed)
JWT_SECRET=your-very-long-secret-at-least-32-chars
APP_URL=http://localhost:5173
```

---

## CORS

In development (`appsettings.Development.json`), the allowed CORS origin is `http://localhost:5173` (the Vite dev server). This must match exactly — a typo here will silently break SignalR.

In production, CORS should be configured to match `App:BaseUrl`.

---

## Rate Limiting

The `"auth"` rate limit policy applies to all `/api/auth/*` endpoints:

- **10 requests per minute per IP**
- Configured in `Program.cs`
- Any new auth endpoints added must opt in with `.RequireRateLimiting("auth")`

---

## Development Defaults (`appsettings.Development.json`)

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5432;Database=landgrab;Username=postgres;Password=password"
  },
  "Jwt": {
    "Secret": "<set via user-secrets or .env — never commit real secrets>"
  },
  "AllowedOrigins": [ "http://localhost:5173" ]
}
```

> **Never commit real secrets** to `appsettings.Development.json`. Use `dotnet user-secrets` or the root `.env` file.
