# Tasman — DevOps Infrastructure Analysis

**Date:** 2025  
**Author:** Tasman (DevOps Agent)  
**Scope:** CI/CD, Docker, Azure Infrastructure, Configuration, Scalability, Observability, Security, DX

---

## 1. CI/CD Pipeline Design (`azure-pipelines.yml`)

### Current State
Single pipeline file. Triggers on `main` branch pushes and PRs to `main`. Two stages: **Build** (always) and **Deploy** (main only). Build stage runs backend restore → NuGet vulnerability scan → build → test → frontend npm ci → npm audit → build → lint → copy SPA to wwwroot → publish artifact. Deploy stage runs Bicep infrastructure deployment then `AzureWebApp@1` to push the artifact to App Service. Pipeline environment is named `production` with `runOnce` strategy.

### Strengths
- Lint and build run before deploy — no broken code ships.
- `dotnet list package --vulnerable` and `npm audit --audit-level=high` are present (both `continueOnError: true` which is fine for a first pass).
- Test results published via `PublishTestResults@2` even on failure (`succeededOrFailed()`).
- Infrastructure is deployed from the pipeline as code (Bicep), not manually.
- Deployment environment `production` can enforce manual approval gates in Azure DevOps settings.

### Recommendations
1. **No staging environment.** All deployments go directly to production. Add a `Deploy_Staging` job that deploys to a separate `staging` App Service / slot before `Deploy_Production`. Gate production with an approval.
2. **Build and Deploy are in the same stage for PRs** — the deploy job is correctly gated by `eq(variables['Build.SourceBranch'], 'refs/heads/main')` but lint runs *after* build succeeds, not as a fast-fail gate. Move `npm run lint` before `npm run build` so a lint error aborts early.
3. **No backend linting / static analysis.** Add a `dotnet format --verify-no-changes` step and/or a Roslyn analyser step.
4. **`dotnetVersion: '8.x'`** — pin to a specific patch (e.g. `8.0.x`) to avoid unexpected SDK upgrades.
5. **Test stage is part of the Build job** — if tests are slow they block artifact publishing. Consider a parallel test job.
6. **No slot swap for zero-downtime.** `AzureWebApp@1` deploys directly, causing a brief restart. Use deployment slots (`staging` → swap to `production`) for zero-downtime.
7. **No container image build.** The pipeline publishes a ZIP to App Service (correct for the current setup), but if moving to Container Apps the pipeline needs a `docker build / push / deploy` flow. Plan this transition.
8. **`continueOnError: true` on security scans** — acceptable during development but should be `false` (failing build) once the project matures.

---

## 2. Docker Configuration (`docker-compose.yml`)

### Current State
Three services: `db` (SQL Server 2022 Developer), `backend` (built from `./backend/Landgrab.Api/Dockerfile`), `frontend` (built from `./frontend/landgrab-ui/Dockerfile`). The backend `depends_on` the DB with `service_healthy`; the frontend `depends_on` the backend without a health condition. `JWT_SECRET` is required (`:?` notation — compose will abort if missing). A named volume `sqldata` persists data.

### Strengths
- `service_healthy` dependency on DB with a real `sqlcmd` health check — backend won't start until SQL Server is ready.
- `JWT_SECRET` is mandatory via `:?` operator — can't accidentally start without it.
- Backend Dockerfile: multi-stage build, non-root `app` user, minimal `aspnet:8.0` runtime image.
- Frontend Dockerfile: multi-stage (node build → nginx), non-root `nginx` user, correct WebSocket proxy headers in `nginx.conf`.
- `sqldata` named volume prevents data loss on container restart.

### Recommendations
1. **DB mismatch between compose and production.** Docker uses **SQL Server** (`mcr.microsoft.com/mssql/server`), production uses **Azure SQL** (also SQL Server family — compatible), but `appsettings.Development.json` shows `Server=localhost,1433` while the root `.env` and `appsettings.json` reference PostgreSQL (`Host=localhost;Port=5432`). This inconsistency suggests two competing connection string formats exist; one will break at runtime. **Audit and align to a single provider.**
2. **`ASPNETCORE_ENVIRONMENT=Production` in compose** — the backend runs as `Production` in the local Docker stack, suppressing development middleware. Consider using `Development` or a new `Docker` environment profile.
3. **Frontend has no health check.** Add one (e.g. `curl -f http://localhost:8080/` or nginx stub_status).
4. **No `restart: unless-stopped` policy** — containers won't recover after a crash or host reboot.
5. **`user: "0:0"` on SQL Server** — required for initial setup but is a security note. Document this clearly.
6. **No `.env.example` at repo root** — the root `.env` file is gitignored but there is no committed template. Add `.env.example` with dummy values alongside the existing `backend/Landgrab.Api/.env.example`.
7. **Hot reload not wired.** There is no `dotnet watch` or Vite dev server override in compose. Developers must rebuild images to see backend changes. Add a `docker-compose.override.yml` with volume mounts and `dotnet watch` for the backend service.
8. **Image tagging** — images are built with no explicit tag (defaults to `<project>_<service>:latest`). For reproducibility, tag builds with the Git SHA.

---

## 3. Azure Infrastructure (`infrastructure/main.bicep`)

### Current State
A single `main.bicep` deploys: App Service Plan (Linux B1), App Service (.NET 8, WebSockets enabled, HTTPS-only, TLS 1.2+, FTPS disabled, AlwaysOn), Azure SQL Logical Server (v12), Azure SQL Database (General Purpose Serverless GP_S_Gen5_1, auto-pause 60 min, 7-day backup retention), and a firewall rule allowing all Azure services. Secrets (`jwtSecret`, `sqlAdminPassword`) are `@secure()` parameters. `parameters.prod.json` has an empty `jwtSecret` value.

### Strengths
- `httpsOnly: true`, `minTlsVersion: '1.2'`, `ftpsState: 'Disabled'` — sensible baseline security posture.
- `alwaysOn: true` — prevents cold starts on App Service.
- Serverless SQL with auto-pause reduces cost for a low-traffic deployment.
- Short-term backup retention policy (7 days, 12-hour diff) is explicitly configured.
- `@secure()` on sensitive parameters — won't appear in deployment logs.

### Recommendations
1. **No Key Vault.** JWT secret and SQL password are passed directly as Bicep parameters (hence as ARM deployment parameters). Store these in **Azure Key Vault** and reference them via Key Vault references in App Service config. This is the single biggest security gap in the infrastructure.
2. **No Azure SignalR Service resource.** The app conditionally uses Azure SignalR when `Azure:SignalR:ConnectionString` is set, but no `Microsoft.SignalR/webPubSub` or `Microsoft.SignalR` resource is defined in Bicep. If production needs horizontal scaling, this resource must be provisioned.
3. **B1 App Service Plan has no auto-scale.** B1 tier doesn't support auto-scale. For production load, upgrade to P1v3 or S1 and define auto-scale rules (min 1, max 3 based on CPU %).
4. **Serverless SQL auto-pauses after 60 minutes** — acceptable for dev/low-traffic but cold starts (6–20 s) will be visible to players if the service pauses overnight. Consider disabling auto-pause for production.
5. **`parameters.prod.json` has empty `jwtSecret`** — this is committed to the repo. The pipeline overrides it via `-overrideParameters`, which is correct, but the file itself is misleading. Set it to a placeholder comment value to make intent clear.
6. **No Static Web App resource.** The frontend is served from the backend's `wwwroot` (SPA files copied in CI). There is no Azure Static Web App resource in Bicep, which contradicts the history note. Decide: either keep the SPA embedded in the backend (current approach) or create a `Microsoft.Web/staticSites` resource and separate the deployments.
7. **No diagnostic settings / Log Analytics Workspace.** App Service logs and SQL audit logs are not forwarded to any Log Analytics Workspace. Add `Microsoft.Insights/diagnosticSettings` to both resources.
8. **SQL firewall rule `0.0.0.0–0.0.0.0` allows all Azure services** — this includes other customers' Azure services, not just your own. For tighter security, use a Private Endpoint or restrict to the App Service outbound IP.

---

## 4. Environment Configuration

### Current State
- `appsettings.json`: empty secrets, serves as the schema/template. Connection string note directs to user-secrets — good practice.
- `appsettings.Development.json`: hardcoded local SQL Server connection string and a dev-only JWT secret (clearly labelled `dev-only`).
- `.env` (gitignored): root-level, contains `JWT_SECRET` for Docker Compose and a PostgreSQL connection string — **mismatches** the SQL Server in `docker-compose.yml`.
- `backend/Landgrab.Api/.env.example`: committed, clean — shows expected format.
- Production secrets flow: injected via pipeline `overrideParameters` into Bicep → App Service app settings.

### Strengths
- Empty secrets in committed `appsettings.json` — no accidental leakage.
- Dev JWT secret is clearly labelled as unsafe.
- `_ConnectionStringNote` documents the user-secrets pattern.
- `@secure()` parameters in Bicep ensure ARM doesn't log them.

### Recommendations
1. **PostgreSQL vs SQL Server mismatch.** `appsettings.json` references a PostgreSQL-style connection string format in `.env.example` and root `.env`, but `docker-compose.yml` and `appsettings.Development.json` use SQL Server. The EF Core provider registered in `Program.cs` is `UseSqlServer`. The root `.env` appears stale. Remove the PostgreSQL references from `.env` and align documentation.
2. **No `appsettings.Staging.json`** — when a staging environment is added, this file will be needed.
3. **`ASPNETCORE_ENVIRONMENT` is hardcoded to `Production` in Bicep** — this prevents using `appsettings.Staging.json` even if the file were added. Parameterise it.
4. **`App__BaseUrl` in Bicep is hardcoded** to `https://app-${appName}.azurewebsites.net`. This is correct for the App Service default domain but will break if a custom domain is used. Make it a Bicep parameter.
5. **`AllowedOrigins` not configured in production Bicep.** The frontend and backend are served from the same origin in production (SPA in wwwroot), so CORS is irrelevant for the same-origin case, but if a standalone SWA is ever added this will need to be set.

---

## 5. Scalability & Reliability

### Current State
- All game room state is in-memory singletons (`GameService`, `RoomService`, `GameplayService`, etc.).
- Azure SignalR Service is optional — if not configured, local in-process SignalR is used.
- Database migrations run on every startup (`MigrateAsync`).
- `TroopRegenerationService` is a hosted background service.
- Rate limiter configured: 60 req/s per IP on auth endpoints (fixed window, 1 s).
- No retry policies found in `Program.cs` or visible configuration.

### Strengths
- Conditional Azure SignalR wiring means the path to horizontal scaling exists — just supply the connection string.
- Response compression (`EnableForHttps: true`) improves bandwidth efficiency.
- Room persistence service restores rooms on startup, mitigating in-memory loss on restart.

### Recommendations
1. **Single instance only without Azure SignalR.** In-memory SignalR groups are not shared across instances. Any scale-out event (App Service adds a second instance) will break game sessions. **Azure SignalR Service must be enabled for any production scale-out.**
2. **`MigrateAsync` on startup under concurrent scale-out** — if two instances start simultaneously both attempt `MigrateAsync`. EF Core migrations use a database lock so this is safe, but the second instance will stall briefly. Acceptable, but worth noting.
3. **No EF Core connection resilience.** `UseSqlServer` without `EnableRetryOnFailure` means transient Azure SQL connectivity hiccups (throttling, failover) cause hard errors. Add `.EnableRetryOnFailure(maxRetryCount: 5)`.
4. **B1 App Service = 1 vCore, 1.75 GB RAM.** With many concurrent SignalR connections and in-memory game rooms, this will become a bottleneck. Plan capacity based on expected concurrent rooms.
5. **`TroopRegenerationService` is a singleton hosted service** — if it throws an unhandled exception the host shuts down. Add a `try/catch` around the timer loop.
6. **No health check endpoint for load balancer** beyond the basic `/health` route. Consider adding EF Core health check (`AddDbContextCheck`) and SignalR hub check so App Service / Traffic Manager can detect degraded state.

---

## 6. Observability

### Current State
- Logging: configured via `appsettings.json` with standard `Microsoft.Extensions.Logging`. Level `Information` in prod, `Debug` in dev. No structured logging library (Serilog, etc.) found.
- No Application Insights SDK in `Landgrab.Api.csproj`.
- No `APPLICATIONINSIGHTS_CONNECTION_STRING` in Bicep app settings.
- `/health` endpoint returns `{ status, time }` — basic liveness probe only.
- No alert rules, dashboards, or Log Analytics Workspace in infrastructure.

### Strengths
- EF Core logging level set to `Information` in dev — query visibility without noise in prod.
- Security headers middleware is implemented correctly.

### Recommendations
1. **Add Application Insights.** Add `Microsoft.ApplicationInsights.AspNetCore` NuGet package and configure it via `APPLICATIONINSIGHTS_CONNECTION_STRING` app setting in Bicep. This gives request traces, exceptions, dependencies (SQL), and live metrics with zero code changes.
2. **Structured logging.** Replace default console logging with Serilog (`Serilog.AspNetCore`, `Serilog.Sinks.ApplicationInsights`). Structured logs allow querying by `RoomId`, `UserId`, etc. in Log Analytics.
3. **Enrich `/health` with readiness.** Add `Microsoft.Extensions.Diagnostics.HealthChecks` with DB check (`AddDbContextCheck<AppDbContext>`) and expose `/health/ready` vs `/health/live` so App Service knows when the DB is reachable.
4. **Log Analytics Workspace + diagnostic settings** — forward App Service HTTP logs and SQL audit logs to a central workspace.
5. **No alert rules.** At minimum, configure alerts for: 5xx error rate > 1%, CPU > 80% for 5 min, failed health checks.
6. **SignalR connection metrics** — with Azure SignalR Service, the portal provides connection count dashboards. Without it, current connection counts are invisible.

---

## 7. Security in Pipeline

### Current State
- `sqlAdminPassword` and `jwtSecret` are pipeline variables referenced as `$(SQL_ADMIN_PASSWORD)` and `$(JWT_SECRET)` and passed via `-overrideParameters`. Azure DevOps secret variables mask these in logs.
- `dotnet list package --vulnerable` runs at build time.
- `npm audit --audit-level=high` runs at build time.
- Both security scans have `continueOnError: true`.
- No container image scanning step.
- No SAST tool configured.

### Strengths
- Secrets flow through pipeline variables (masked), not hardcoded in YAML.
- Both dependency vulnerability scanners are present.
- `@secure()` in Bicep prevents ARM from logging secret values.

### Recommendations
1. **Migrate secrets to Azure Key Vault** (linked to pipeline via variable group with Key Vault backing). This removes the pipeline-variable → ARM-parameter chain and centralises rotation.
2. **Set `continueOnError: false`** for both vulnerability scans once baseline is clean. A new critical CVE should break the build.
3. **Add container image scanning.** When/if moving to Container Apps, add `trivy image` or Microsoft Defender for Containers scan step.
4. **Add OWASP ZAP / Defender DAST** as a post-deploy step on staging.
5. **No `CODEOWNERS` or branch protection rules** visible from this analysis — ensure `main` requires PR + CI passing + at least one reviewer.
6. **JWT secret minimum is 64 chars** (enforced in `Program.cs`) — the pipeline variable description should document this constraint so it isn't accidentally set to a short value.

---

## 8. Local Development Experience

### Current State
- `docker compose up --build` starts DB + backend + frontend.
- Backend waits for DB health check before starting.
- Frontend proxies `/api` and `/hub` to `backend:8080` via nginx.
- `JWT_SECRET` required — fails fast if missing.
- No hot reload in Docker (images must be rebuilt for code changes).
- Vite dev server (`npm run dev`) proxies to `localhost:5001` — works outside Docker.
- Dev password `Dev_Password1!` is in `appsettings.Development.json` and the SQL Server compose default — consistent.

### Strengths
- Consistent port conventions: DB 1433, backend 7000 (Docker) / 5001 (dotnet run), frontend 80 (Docker) / 5173 (Vite dev).
- Health check on DB means the backend startup race condition is handled.
- `appsettings.Development.json` pre-configures connection strings so `dotnet run` works out of the box.
- Both Docker and native dev paths are documented.

### Recommendations
1. **No hot reload in Docker.** Add a `docker-compose.override.yml` with a `backend` service override using `mcr.microsoft.com/dotnet/sdk:8.0`, volume mounting source code, and running `dotnet watch run`. Vite already handles hot reload natively.
2. **`ASPNETCORE_ENVIRONMENT=Production` in compose** — swap to `Development` so Swagger UI and developer exception pages are available when running locally in Docker.
3. **Port inconsistency in docs** — history notes `HTTP: http://localhost:5001` for `dotnet run`, but compose maps `7000:8080`. The `vite.config.ts` proxy also targets port `5001`. All three are correct for their respective modes, but should be clearly documented in `README.md` or `CLAUDE.md` to avoid confusion.
4. **New developer onboarding gap** — there is no `docker-compose.override.yml.example` to guide local customisation. Add one.
5. **Root `.env` mismatch** — the committed `.env` contains a PostgreSQL connection string (`Host=localhost;Port=5432`) while the stack uses SQL Server. A new developer following the `.env` will get a broken backend.

---

## Priority Improvement List

| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | **Fix DB provider mismatch** — remove PostgreSQL connection string from root `.env`; align all connection string formats to SQL Server | Low | 🔴 High (blocks new dev onboarding) |
| 2 | **Add Key Vault for secrets** — store `jwtSecret` and `sqlAdminPassword` in Key Vault; reference from App Service and pipeline variable group | Medium | 🔴 High (security) |
| 3 | **Enable Azure SignalR Service** — provision in Bicep, wire `Azure:SignalR:ConnectionString` app setting; required before any horizontal scale-out | Medium | 🔴 High (scalability) |
| 4 | **Add Application Insights** — add SDK NuGet, configure via connection string in Bicep; zero-code-change telemetry | Low | 🟠 Medium-High (observability) |
| 5 | **Add staging environment** — second App Service (or slot), second pipeline stage, environment approval gate | Medium | 🟠 Medium-High (reliability) |
| 6 | **EF Core retry on failure** — add `.EnableRetryOnFailure(5)` to `UseSqlServer`; handles Azure SQL transient faults | Low | 🟠 Medium |
| 7 | **Docker hot reload** — add `docker-compose.override.yml` with `dotnet watch` volume mount for backend | Low | 🟡 Medium (DX) |
| 8 | **`/health/ready` with DB check** — add `AddDbContextCheck<AppDbContext>`, expose `/health/ready`; enables proper load balancer / deployment health gates | Low | 🟡 Medium (reliability) |
