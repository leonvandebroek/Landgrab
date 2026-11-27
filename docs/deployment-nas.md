# Landgrab on the NAS

Landgrab runs on the Synology NAS (DS720+, `10.233.1.253`), not in Azure. The public address is
**https://landgrab.leonvandebroek.nl**; the iOS and Android apps load that address (`frontend/landgrab-ui/capacitor.config.ts`).
The only Azure resource is Key Vault `kv-landgrab-prod` (secrets and the store signing keys). Nothing else in Azure costs money,
by rule (Léoke, 2026-11-26).

```
phone / browser ──https──▶ Nginx Proxy Manager (TLS, Let's Encrypt)
                              └─▶ 10.233.1.253:8150 landgrab-frontend (nginx: SPA, /api, /hub WebSockets)
                                                      └─▶ backend:8080 (ASP.NET Core) ─▶ db (PostgreSQL 17, ./postgres)
```

Everything lives in `/volume1/docker/landgrab` (`compose.yml`, `.env`, `postgres/`). Images: `unitytech.azurecr.io/landgrab-api`
and `-ui`, tagged with the commit.

## Pipelines (Azure DevOps project LandGrab)

| Pipeline | File | What it does |
|---|---|---|
| Landgrab Infrastructure | `infra/pipeline.yml` | Terraform: Key Vault and its Secrets Officer grants (plan guard, apply only from main). Then creates `landgrab-postgres-password` and `landgrab-jwt-secret` if they are missing; never overwrites. |
| Landgrab NAS | `deploy/nas/pipeline.yml` | On main: builds both images (imac-linux-ci), pushes to ACR, sends one bundle over SSH to the NAS (lokaal-linux-poc) and runs `deploy/nas/nas-deploy.sh`: pull, up, `/health` within 5 minutes or roll back to the previous `.env` and `compose.yml`. With `proxyHosts=true` it then syncs Nginx Proxy Manager. |
| Landgrab Mobile Apps | `app-release/pipelines/mobile.yml` | The app-shipping kit: signed iOS and Android builds to TestFlight and Play. |

Shared from the PractiPitality project: service connections `UnitystationPro SSH` and `Unitytech ACR`, pools `imac-linux-ci`
and `lokaal-linux-poc`. Azure connection: `Azure-LandGrab-SC` (workload identity, no password).

## One-time setup (Owner, on the Mac)

1. `az group create -n rg-landgrab-prod -l westeurope`.
2. Give `Azure-LandGrab-SC` (SP object id `5f5c576b-bd62-4619-a3a1-1eee4a97425d`): Contributor on `rg-landgrab-prod`;
   a conditional *Role Based Access Control Administrator* on that group that can only assign Key Vault Secrets Officer
   (`b86a8fe4-…`) to itself and the operator (`6bf235f7-…`), and never delete; Storage Blob Data Contributor on the state
   container `stunitytechtfstate/landgrab` (create it first). Same as Time for Guests (practipitality `docs/time-for-guests-azure.md`).
3. Run **Landgrab Infrastructure** with `apply=false`, read the plan, then with `apply=true` from main.
4. NAS: `/volume1/docker/landgrab`, writable for `DeployAgent`; port 8150 free.
5. DNS: A record `landgrab` → `195.240.192.239` in zone `leonvandebroek.nl` (rg `unitytech_dns`), unless a wildcard covers it.
6. Run **Landgrab NAS**; check `http://10.233.1.253:8150/health`.
7. Nginx Proxy Manager: `scripts/nas/proxy-host.py setup` (asks for the NPM admin password in a hidden prompt, creates the
   non-admin service user `npm-landgrab-proxy@leonvandebroek.nl` and stores it in the vault). Then set the pipeline variable
   `proxyHosts=true` and run **Landgrab NAS** again. The tool's rules: UTA's `docs/nginx-proxy-manager.md`.
8. Signing keys: `app-release/app-keys.sh` (see the kit's README), into the same vault.

## Operating

- Logs: `cd /volume1/docker/landgrab && docker compose logs -f backend`.
- Roll back by hand: `cp .env.previous .env && cp compose.yml.previous compose.yml && docker compose up -d`.
- Database backup: `docker compose exec db pg_dump -U landgrab landgrab > landgrab-$(date +%F).sql`.
- EF Core migrations run when the API starts (`Program.cs`).
- Cloud sessions and feature branches never deploy: Publish and Deploy only run for `refs/heads/main`.
