# Mane Maarga deployment guide

This repository includes a production Compose configuration, but the application remains a prototype and must not be used with real beneficiary data until a security/privacy review, legal consent review, managed secret/storage design, and operational approval are complete.

## Prepare a deployment host

1. Install Docker Engine and the Compose plugin.
2. Clone the repository and create a private `.env` from `.env.production.example`.
3. Set `APP_ENV=production`, temporarily set `MANE_MAARGA_BOOTSTRAP_ENABLED=true` for the first administrator, then disable it after bootstrap, `POSTGRES_USER`, a long URL-safe `POSTGRES_PASSWORD`, `POSTGRES_DB`, `MANE_MAARGA_JWT_SECRET`, `CORS_ORIGINS`, and leave `VITE_API_BASE_URL` blank for same-origin proxying.
4. Use a secret generated with `python -c "import secrets; print(secrets.token_urlsafe(64))"` for the JWT secret. Keep it private and outside Git.
5. Leave `VITE_API_BASE_URL` blank for the production Compose deployment: Nginx proxies same-origin `/api` calls to the API container. Set `CORS_ORIGINS` to the exact public frontend origin (no wildcard).
6. Configure HTTPS at a reverse proxy/load balancer in front of the published frontend port. The Compose file does not terminate TLS; API requests are same-origin and Nginx forwards `/api` to the private API service. The frontend security policy permits same-origin microphone access for browser speech recognition; it does not upload or persist audio.
7. Deploy: `docker compose -f docker-compose.prod.yml up --build -d`.
8. After the first administrator is created, set `MANE_MAARGA_BOOTSTRAP_ENABLED=false` and redeploy. Verify the frontend `/frontend-health`, proxied API `/health`, and `/ready` endpoints.

## Compose topology

- PostgreSQL and API are on a private Compose network; their ports are not published.
- Frontend Nginx publishes `${FRONTEND_PORT:-8080}`.
- Database and private uploads use named volumes.
- Alembic migrations run before the API starts.
- Production frontend is a static Vite build served by Nginx.

## Backups

Set `POSTGRES_USER` and `POSTGRES_DB` in the environment, then run `scripts/backup.sh`. The script writes a timestamped compressed SQL dump into `backups/`. Copy backups off-host and encrypt them. This script does not back up uploaded documents; the `mane_maarga_uploads` volume needs its own snapshot/backup policy. Test restore procedures on a non-production environment.

## Rollback

- Keep the previous image/build and database backup.
- Do not run destructive schema downgrades; the baseline migration's downgrade is intentionally a no-op.
- Roll back application images only after verifying compatibility with the current schema.
- Restore data only from a tested backup and with a maintenance window.

## Platform-specific notes

For managed PaaS deployment, deploy the API as a Python 3.12 service with `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, a managed PostgreSQL database, persistent private object storage for uploads, and a frontend static hosting service. Set all environment variables from the provider's secret manager. Never commit deployment credentials.

## Maps and family links

- The plot map loads tiles from `server.arcgisonline.com` (satellite) and `tile.openstreetmap.org` (street). `frontend/nginx.conf` allows both in `img-src`; if you set `VITE_SATELLITE_TILES` or `VITE_MAP_TILES` to another server, add its host there too. Check each provider's terms for your traffic: OpenStreetMap's tile policy asks for attribution and light use, and Esri's imagery terms apply to the satellite layer. A state GIS tile server is a good swap.
- The stage photos on Construction and the family's page load from `upload.wikimedia.org`, also allowed in `img-src`. If that host is blocked on your network, the pages show the house drawing instead. To serve your own copies, see `docs/STAGE_PHOTOS.md`.
- The same nginx policy allows geolocation for the site itself, for "Use my location" on the map and in the case form.
- Set `MANE_MAARGA_PUBLIC_APP_URL` to the public web address so the SMS with a family's progress link carries a full link.
- Progress-link tokens are derived from the JWT secret. Rotating `MANE_MAARGA_JWT_SECRET` switches every family's link off; make new links afterwards.

