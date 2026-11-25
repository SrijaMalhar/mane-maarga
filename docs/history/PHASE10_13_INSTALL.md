# Unified Phase 10–13: QA, deployment, operations and release polish

This overlay is based on the uploaded Phase 9 snapshot. It contains backend migration support, development test tooling, production Compose and frontend images, CI, environment configuration, health/observability endpoints, frontend error boundary/API URL configuration, backup helper, and documentation.

## Apply

Extract this archive into the root of the existing repository and merge/overwrite only the files included. Do not replace `.git` or your database/upload volumes.

## Development

```bash
docker compose up --build
```

The API image runs Alembic migrations before Uvicorn. Run the tests from the API container:

```bash
docker compose exec api python -m pytest -q
```

Frontend build:

```bash
cd frontend
npm install
npm run build
```

## Production configuration

Copy `.env.production.example` to `.env`, replace all placeholders, set the production API/frontend origins, and use the production Compose file:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

See `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, and `docs/RELEASE_CHECKLIST.md`.

## Safety note

This phase improves deployment readiness but does not make Sooru safe for real beneficiary data by itself. It remains a prototype; review privacy, legal consent, managed secrets, malware scanning, encryption, external monitoring, rate limiting, backups and security controls before any real pilot.
