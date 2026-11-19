# Unified Phase 9 — Production Hardening Baseline

Overlay these files onto the existing repository. This archive does not include `.git` or the database volume.

Included: API readiness check, request IDs, security response headers, constrained CORS, production secret guard, upload content-type/signature validation, focused tests, and docs.

After copying, run:

```bash
docker compose up --build
```

Then verify in another terminal:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/ready
cd backend && pytest -q
```

Do not set `APP_ENV=production` locally unless you also set a strong `SOORU_JWT_SECRET` and production CORS origins.
