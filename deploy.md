# SPCG Ubuntu Deployment Plan

Last checked: 2026-05-06 20:20 CST

Target server:

| Item | Value |
| --- | --- |
| Host | `8.135.238.55` |
| Provider | Alibaba Cloud ECS |
| OS | Ubuntu 24.04.4 LTS |
| Kernel | Linux 6.8.0-100-generic |
| Architecture | x86_64 |
| Virtualization | KVM |
| CPU | 4 vCPU |
| Memory | 8 GiB |
| Swap | None current |
| Disk | 40 GiB root disk, about 32 GiB available |
| Docker | Docker 29.3.0, Compose v5.1.0, cgroup v2 |

Do not store the SSH password or production secrets in this file.

## Current Ubuntu Services

| Service | Runtime | Current bind/listen | Public access | Purpose | Notes |
| --- | --- | --- | --- | --- | --- |
| SSH | systemd `ssh.service` | `0.0.0.0:22`, `[::]:22` | Yes | Server administration | Keep open for deployment. |
| Nginx | systemd `nginx.service` | `0.0.0.0:80`, `0.0.0.0:443` | Yes | Reverse proxy and HTTPS termination | Hosts `eng.kidoj.com` and `erp.kidoj.com`. |
| English API | Docker `/opt/backend` service `api` | `0.0.0.0:8000 -> container:8000` | Via Nginx `eng.kidoj.com` | Existing FastAPI app | Container `backend-api-1`, healthy at `/health`. |
| English worker | Docker `/opt/backend` service `worker` | No published port | No | Existing Celery worker | Container `backend-worker-1`. |
| Existing Docker Postgres | Docker `/opt/backend` service `postgres` | `0.0.0.0:5432 -> container:5432` | Yes, currently exposed | Existing English API database | Container `backend-postgres-1`, image `postgres:15-alpine`. This conflicts with SPCG default `5432`. |
| Existing Docker Redis | Docker `/opt/backend` service `redis` | `0.0.0.0:6379 -> container:6379` | Yes, currently exposed | Existing English API queue/cache | Container `backend-redis-1`, image `redis:7-alpine`. This conflicts with Redis defaults. |
| Existing MinIO | Docker `/opt/backend` service `minio` | `0.0.0.0:9000-9001 -> container:9000-9001` | Yes, currently exposed | Existing object storage | Container `backend-minio-1`. |
| ERP backend | systemd `erp.service` | `0.0.0.0:8080` | Via Nginx `erp.kidoj.com/api/` and `/admin/` | Existing FastAPI/SQLAdmin backend | Uvicorn uses proxy headers for HTTPS admin links. |
| ERP frontend | Static files | Nginx root `/opt/erp/frontend/dist` | `https://erp.kidoj.com/` | Existing SPA frontend | Served by Nginx. |
| Local system Postgres | systemd `postgresql@16-main.service` | `127.0.0.1:5433`, `127.0.1.1:5433` | No | Existing local Postgres cluster | Do not reuse for SPCG unless explicitly migrated. |

Current Nginx routing:

| Host | Route | Upstream/Root |
| --- | --- | --- |
| `eng.kidoj.com` | HTTPS | `proxy_pass http://127.0.0.1:8000` |
| `erp.kidoj.com` | `/` | `root /opt/erp/frontend/dist` |
| `erp.kidoj.com` | `/api/` | `proxy_pass http://127.0.0.1:8080` |
| `erp.kidoj.com` | `/admin/` | `proxy_pass http://127.0.0.1:8080` |

## Planned SPCG Services

Deployment strategy: same server, side-by-side with existing services.

Public domain: `spcg.kidoj.com`.

Application directory: `/opt/spcg/current`.

Use the current local workspace as the deployment source. Exclude local-only artifacts such as `node_modules`, `.next`, logs, and temporary files.

| SPCG component | Container/service | Planned bind/listen | Public access | Internal access | Reasoning |
| --- | --- | --- | --- | --- | --- |
| SPCG Web | `web` | `127.0.0.1:3000 -> container:3000` | Via Nginx `https://spcg.kidoj.com` | Other local services may call `http://127.0.0.1:3000` if needed | Avoids exposing Next.js directly. Port `3000` is currently free. |
| SPCG business PostgreSQL | `spcg-postgres` | Prefer no host publish; optional `127.0.0.1:15432 -> container:5432` for maintenance | No | Compose DNS `spcg-postgres:5432` | Avoids conflict with existing public `5432`. |
| Judge0 server | `judge0-server` | `127.0.0.1:2358 -> container:2358` | No | Web/worker call `http://judge0-server:2358` inside Compose | Port `2358` is currently free, but should remain private. |
| Judge0 worker | `judge0-worker` | No published port | No | Connects to Judge0 DB/Redis internally | Requires privileged container. |
| Judge0 PostgreSQL | `judge0-db` | No host publish | No | Compose internal only | Avoids conflict and prevents accidental external DB access. |
| Judge0 Redis | `judge0-redis` | No host publish | No | Compose internal only | Avoids conflict with existing public `6379`. |
| SPCG judge worker | `judge-worker` | No published port | No | Uses `spcg-postgres` and `judge0-server` | Processes pending submissions. |
| Nginx site | systemd `nginx.service` | existing `80/443` | `https://spcg.kidoj.com` | Proxies to `127.0.0.1:3000` | Reuse existing HTTPS termination. |

Planned Nginx routing:

| Host | Route | Upstream/Root |
| --- | --- | --- |
| `spcg.kidoj.com` | `/` | `proxy_pass http://127.0.0.1:3000` |

Ports after SPCG deployment:

| Port | Owner after deployment | Exposure | Conflict status |
| --- | --- | --- | --- |
| `22` | SSH | Public | Existing, unchanged |
| `80` | Nginx | Public | Existing, reused |
| `443` | Nginx | Public | Existing, reused |
| `3000` | SPCG Web | Localhost only | Currently free |
| `2358` | Judge0 server | Localhost only or Compose-only | Currently free |
| `5432` | Existing `backend-postgres-1` | Public current state | Do not use for SPCG |
| `15432` | Optional SPCG Postgres maintenance port | Localhost only | New optional port |
| `5433` | Existing system Postgres | Localhost only | Existing, unchanged |
| `6379` | Existing `backend-redis-1` | Public current state | Do not use for SPCG |
| `8000` | Existing English API | Public through Docker, routed by Nginx | Existing, unchanged |
| `8080` | Existing ERP backend | Public bind, routed by Nginx | Existing, unchanged |
| `9000-9001` | Existing MinIO | Public current state | Existing, unchanged |

## Current Local Development Configuration

Current mode during migration testing: local Next.js Web, remote Ubuntu database and Judge0.

| Local component | Current state | Notes |
| --- | --- | --- |
| Local Web dev server | Runs on `http://127.0.0.1:3000` via `screen` session `spcg-web` | Start with `npm run web:dev`. |
| Local Docker SPCG services | Should be stopped | The local Web currently does not use local Docker PostgreSQL/Judge0. |
| Local DB endpoint | `127.0.0.1:15432` | SSH tunnel to remote SPCG PostgreSQL. |
| Local Judge0 endpoint | `127.0.0.1:2358` | SSH tunnel to remote Judge0 server. |
| Web env database | `DATABASE_URL=postgres://spcg:<password>@127.0.0.1:15432/spcg` | Secret is stored only in `.env.local`. |
| Web env Judge0 | `JUDGE0_BASE_URL=http://127.0.0.1:2358` | Required for run/judge actions while Web stays local. |

Tunnel command pattern:

```bash
ssh -f -N \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -L 15432:127.0.0.1:15432 \
  -L 2358:127.0.0.1:2358 \
  root@8.135.238.55
```

Local Docker check/stop commands:

```bash
docker ps
docker compose stop
```

## Judge0 Image Plan

Remote `docker pull --platform linux/amd64 judge0/judge0:latest` failed because the server could not fetch Docker Hub:

| Attempt | Result |
| --- | --- |
| Docker mirror `docker.m.daocloud.io` | `403 Forbidden` |
| Direct `registry-1.docker.io` | `connect: connection refused` |
| `ctr -n moby images pull` | Same Docker Hub connection failure |

Local Docker already has a suitable Judge0 image:

| Image | OS | Architecture | Digest |
| --- | --- | --- | --- |
| `judge0/judge0:latest` | `linux` | `amd64` | `sha256:6b5d6a66aa19a8e878a52ea3c6a560afc1086734d96e2885b561fd5c6018f082` |

Use local export/import for the Judge0 main image:

```bash
docker save judge0/judge0:latest | gzip > judge0-latest-linux-amd64.tar.gz
scp judge0-latest-linux-amd64.tar.gz root@8.135.238.55:/opt/
ssh root@8.135.238.55 'gunzip -c /opt/judge0-latest-linux-amd64.tar.gz | docker load'
ssh root@8.135.238.55 "docker image inspect judge0/judge0:latest --format 'Image={{.RepoTags}} Architecture={{.Architecture}} OS={{.Os}} ID={{.Id}}'"
```

If `postgres:16`, `postgres:16.2`, `redis:7.2.4`, or `node:22-alpine` cannot be pulled remotely, export and load those images the same way.

## Deployment Plan

1. Upgrade resources.
   - Upgrade the ECS instance to at least 4 GiB RAM.
   - Recheck `free -h`, `docker info`, and `df -h`.
   - If memory remains below 4 GiB, add swap before starting Judge0.

2. Prepare DNS and HTTPS.
   - Add DNS A record: `spcg.kidoj.com -> 8.135.238.55`.
   - Keep existing `eng.kidoj.com` and `erp.kidoj.com` untouched.
   - Use Certbot to issue a certificate for `spcg.kidoj.com`.

3. Back up existing server state.
   - Back up `/etc/nginx/sites-available` and `/etc/nginx/sites-enabled`.
   - Back up `/opt/backend/docker-compose.yml`.
   - Back up existing Docker Postgres data from `backend-postgres-1`.
   - Back up ERP database if it contains production data.

4. Upload SPCG code.
   - Create `/opt/spcg/current`.
   - Sync the current local workspace to the server.
   - Exclude `node_modules`, `.next`, cache directories, logs, and local environment files that should not go to production.

5. Create production environment.
   - Generate production `AUTH_SECRET` and `REWARD_SALT`.
   - Set `AUTH_URL=https://spcg.kidoj.com` and `NEXTAUTH_URL=https://spcg.kidoj.com`.
   - Set `DATABASE_URL=postgres://spcg:<password>@spcg-postgres:5432/spcg`.
   - Set `JUDGE0_BASE_URL=http://judge0-server:2358`.
   - Keep Judge0 and database credentials out of Git.

6. Prepare production Compose.
   - Use a server-specific Compose override so SPCG does not publish `5432` or `6379`.
   - Bind Web to `127.0.0.1:3000`.
   - Bind Judge0 server to `127.0.0.1:2358` only if local debugging is needed; otherwise keep it internal to Compose.
   - Set `env_file: infra/judge0/judge0.conf` on `judge0-server`, `judge0-worker`, `judge0-db`, and `judge0-redis`.
   - Start Redis with `--requirepass "$${REDIS_PASSWORD}"` so the password is expanded inside the Redis container, not by the shell that writes Compose.
   - Keep Judge0 DB and Judge0 Redis internal-only.

7. Load or pull images.
   - Load local `judge0/judge0:latest` tarball because remote pull currently fails.
   - Pull or upload other required images.
   - Verify every required image with `docker image inspect`.

8. Start SPCG infrastructure.
   - Start `spcg-postgres`, `judge0-db`, `judge0-redis`, `judge0-server`, and `judge0-worker`.
   - Wait for health checks.
   - Run `docker compose ps`.

9. Initialize SPCG data.
   - Run database migrations.
   - Import/seed problem data.
   - Create or bootstrap the admin account.

10. Start SPCG app services.
    - Start `web`.
    - Start `judge-worker`.
    - Configure Nginx for `spcg.kidoj.com -> 127.0.0.1:3000`.
    - Run `nginx -t` and reload Nginx.

11. Verify end-to-end.
    - Visit `https://spcg.kidoj.com/`.
    - Verify `/auth/sign-in`, `/map`, `/level/ch1-01`, `/admin`.
    - Submit a known AC C++14 solution.
    - If Docker cgroups are unavailable, keep `JUDGE0_DISABLE_CGROUPS=true` so SPCG sends per-process limit flags to Judge0.
    - Confirm `submissions` moves from pending to final verdict.
    - Confirm progress is updated.
    - Recheck `eng.kidoj.com` and `erp.kidoj.com`.

## Acceptance Checklist

| Check | Expected result |
| --- | --- |
| `docker compose config` | Valid configuration |
| `docker compose ps` | SPCG services running/healthy |
| `https://spcg.kidoj.com/` | HTTP 200 via Nginx HTTPS |
| SPCG Web logs | No repeated database or auth errors |
| SPCG PostgreSQL | Migrations applied successfully |
| Judge0 server | Responds from internal Compose network |
| SPCG judge worker | Processes a pending submission |
| Existing English API | `https://eng.kidoj.com/health` still returns OK |
| Existing ERP | `https://erp.kidoj.com/` and `/admin/` still render correctly |

## Rollback Plan

If SPCG deployment causes issues:

1. Stop only SPCG Compose services from `/opt/spcg/current`.
2. Remove or disable only the `spcg.kidoj.com` Nginx site.
3. Reload Nginx.
4. Do not stop `/opt/backend`, `erp.service`, existing Postgres, existing Redis, or existing MinIO unless explicitly required.
5. Restore Nginx from the timestamped backup if needed.
